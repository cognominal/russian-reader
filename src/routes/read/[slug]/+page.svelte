<script lang="ts">
	import { sentenceIndex } from '$lib/article';
	import type { OpenWord, Selection } from '$lib/article';
	import type { PageProps } from './$types';
	import { explainUrl } from '$lib/explain';
	import type { ExplainAnswer, ExplainError, ExplainRequest } from '$lib/explain';
	import ExplanationPane from '$lib/components/ExplanationPane.svelte';
	import RussianPane from '$lib/components/RussianPane.svelte';
	import SentencePane from '$lib/components/SentencePane.svelte';
	import TranslationPane from '$lib/components/TranslationPane.svelte';
	import { tick } from 'svelte';

	let { data }: PageProps = $props();
	let selection = $state<Selection | null>(null);

	const steps = $derived(sentenceIndex(data.article));

	/** The word the reader asked about last: the note in the sentence pane hangs off it. */
	type Ask = {
		request: ExplainRequest;
		/** The clicked form, named by «спрашиваю «…»». */
		word: string;
	};

	/** The answer on screen, and the word it is about. Null means the article shows. */
	let answer = $state<ExplainAnswer | null>(null);
	let openWord = $state<OpenWord | null>(null);

	/** The request that is in flight or has failed. */
	let ask = $state<Ask | null>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let message = $state<string | null>(null);
	/** Epoch ms the courtesy window reopens. It gates nothing — a click always
	 *  asks, because a cached answer costs no window — it drives the countdown. */
	let retryUntil = $state<number | null>(null);

	/** One request at a time, and a monotonic id so a slow answer cannot land
	 *  after a newer click. */
	let controller: AbortController | null = null;
	let requestId = 0;

	/** The article pane, and the offset the swap would otherwise reset. */
	let pane = $state<HTMLElement | null>(null);
	let savedScroll = 0;

	/** The grammar popup in the explanation pane. It lives here for one reason:
	 *  Escape is a layer stack, and the popup is the topmost layer (Q19). */
	let tooltip = $state(false);

	// «спрашиваю…» and every pre-answer failure report next to the clicked word.
	const note = $derived.by(() => {
		if (ask === null || status === 'idle' || status === 'ready') return null;
		return {
			paragraph: ask.request.paragraph,
			tokenIndex: ask.request.tokenIndex,
			text: status === 'loading' ? 'спрашиваю…' : (message ?? 'Объяснение не получилось.'),
			retryUntil
		};
	});

	// Once an answer is on screen a re-click replaces it in place: the previous
	// answer stays, dimmed, under a line naming the word being asked about, and
	// keeps the message if the new request fails (Q12, §11).
	const asking = $derived(status === 'loading' && answer !== null ? (ask?.word ?? null) : null);
	const failure = $derived(status === 'error' && answer !== null ? message : null);

	function position(sel: Selection | null): number {
		if (sel === null || sel.sentence === null) return -1;
		return steps.findIndex((s) => s.paragraph === sel.paragraph && s.sentence === sel.sentence);
	}

	/**
	 * Tab walks the sentences in reading order, Shift+Tab walks back; the first
	 * press starts at the first sentence (Shift+Tab at the last). Past either end
	 * the key is left to the browser, so the header links stay reachable. Escape
	 * is layered: it closes the grammar popup first, then the answer, then clears
	 * the selection, and with none of them it is left to the browser. A sentence
	 * chosen this way pins no word.
	 */
	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (tooltip) tooltip = false;
			else if (answer !== null) void close();
			else if (selection !== null) selection = null;
			return;
		}
		if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;

		const at = position(selection);
		const next = at < 0 ? (event.shiftKey ? steps.length - 1 : 0) : at + (event.shiftKey ? -1 : 1);
		if (next < 0 || next >= steps.length) return;

		event.preventDefault();
		const active = document.activeElement;
		if (active instanceof HTMLElement && active.closest('.pane-ru') !== null) active.blur();
		const ref = steps[next];
		selection = { paragraph: ref.paragraph, tokenIndex: null, sentence: ref.sentence };
	}

	/** A selection from either pane: a word asks, a sentence only picks. */
	function select(next: Selection) {
		selection = next;
		if (next.tokenIndex !== null) void explain(next);
	}

	/** The clicked form, straight from the article the endpoint re-derives from. */
	function formOf(request: ExplainRequest): string | null {
		const paragraph = data.article.paragraphs.find((p) => p.i === request.paragraph);
		const token = paragraph?.ruTokens[request.tokenIndex];
		return token === undefined ? null : token.form;
	}

	/**
	 * Ask about one word. The pane is not touched here: it opens when an answer
	 * arrives, so every failure before there is one stays next to the word.
	 */
	async function explain(sel: Selection) {
		const { paragraph, tokenIndex, sentence } = sel;
		if (tokenIndex === null || sentence === null) return;

		// The same word again: its answer is on screen, or it is already in flight.
		const same = ask !== null && ask.request.paragraph === paragraph && ask.request.tokenIndex === tokenIndex;
		if (status === 'loading' && same) return;
		if (openWord !== null && openWord.paragraph === paragraph && openWord.tokenIndex === tokenIndex) return;

		const word = formOf({ paragraph, tokenIndex });
		if (word === null) return;

		controller?.abort();
		const id = (requestId += 1);
		const ctl = new AbortController();
		controller = ctl;
		ask = { request: { paragraph, tokenIndex }, word };
		status = 'loading';
		message = null;

		try {
			const response = await fetch(explainUrl(data.article.slug), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ paragraph, tokenIndex } satisfies ExplainRequest),
				signal: ctl.signal
			});
			if (id !== requestId) return;

			if (!response.ok) {
				const refused = await readError(response);
				if (id !== requestId) return;
				status = 'error';
				message = refused.message;
				retryUntil = refused.retryAfter === undefined ? retryUntil : Date.now() + refused.retryAfter * 1000;
				return;
			}

			const body = (await response.json()) as ExplainAnswer;
			if (id !== requestId) return;

			// The pane opens now, and only now: the offset is read the instant
			// before the article is taken off screen, and never while the answer
			// itself is scrolled in its place.
			if (answer === null) savedScroll = pane?.scrollTop ?? 0;
			answer = body;
			openWord = { paragraph, sentence, tokenIndex };
			status = 'ready';
			message = null;
			retryUntil = Date.now() + body.retryAfter * 1000;
		} catch {
			// an aborted fetch is the reader's next click, not a failure
			if (ctl.signal.aborted || id !== requestId) return;
			status = 'error';
			message = 'Сервис объяснений не ответил.';
		}
	}

	/** The server's Russian message and its retry window, or a line of our own. */
	async function readError(response: Response): Promise<ExplainError> {
		try {
			const body = (await response.json()) as ExplainError;
			if (typeof body.message === 'string' && body.message !== '') return body;
		} catch {
			// an unreadable body is still a failure; fall through to the generic line
		}
		return { error: 'upstream-error', message: `Объяснение не получилось (${response.status}).` };
	}

	/**
	 * Closing is lossless: the article comes back at the offset it was left at,
	 * the selection stays, and focus returns to the word that was clicked. A
	 * request still in flight is dropped — the reader has moved on.
	 */
	async function close() {
		if (answer === null) return;
		const word = openWord;
		controller?.abort();
		controller = null;
		requestId += 1;
		answer = null;
		openWord = null;
		ask = null;
		status = 'idle';
		message = null;

		// Hiding a scroll container resets it, so the offset is written back rather
		// than assumed. It is written after `tick()`, because the article pane's own
		// effect has already asked for a smooth scroll to the current sentence by
		// then, and again on the next frame, so that request cannot win.
		await tick();
		restoreScroll();
		requestAnimationFrame(restoreScroll);
		if (word !== null) focusWord(word);
	}

	function restoreScroll() {
		if (pane !== null) pane.scrollTop = savedScroll;
	}

	function focusWord(word: OpenWord) {
		// The line carries the paragraph, the token button only its index: the same
		// index exists in every paragraph.
		const line = document.querySelector<HTMLElement>(`.line[data-para="${word.paragraph}"]`);
		const button = line?.querySelector<HTMLElement>(`button.tok[data-tok="${word.tokenIndex}"]`);
		button?.focus();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<svelte:head>
	<title>{data.article.title.ru}</title>
	<meta name="description" content={data.article.title.en} />
</svelte:head>

<div class="reader">
	<section
		class="pane pane-ru"
		aria-label={answer === null ? 'Русский текст' : 'Объяснение слова'}
		bind:this={pane}
	>
		{#if answer !== null && openWord !== null}
			<ExplanationPane {selection} {answer} {openWord} {asking} message={failure} onclose={close} bind:tooltip />
		{:else}
			<RussianPane article={data.article} {selection} onSelect={select} />
		{/if}
	</section>
	<aside class="pane pane-en" aria-label="English translation">
		<div class="en-para">
			<TranslationPane article={data.article} {selection} />
		</div>
		<div class="en-sentence">
			<SentencePane article={data.article} {selection} onSelect={select} {openWord} {note} />
		</div>
	</aside>
</div>

<style>
	.reader {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		height: 100dvh;
	}

	.pane {
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	/* The right column holds two panes: the translation of the paragraph, and
	   below it only the current sentence pair. */
	.pane-en {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--bg-raised);
		border-left: 1px solid var(--rule);
	}

	.en-para {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.en-sentence {
		flex: 0 0 auto;
		max-height: 45%;
		overflow-y: auto;
		padding: 1rem 1.5rem 1.25rem;
		border-top: 1px solid var(--rule);
	}

	/* Narrow: the panes stack, the right column sits on top and stays put. */
	@media (max-width: 899px) {
		.reader {
			display: flex;
			flex-direction: column;
			height: auto;
		}

		.pane-en {
			order: -1;
			position: sticky;
			top: 0;
			z-index: 2;
			max-height: 60vh;
			border-left: 0;
			border-bottom: 1px solid var(--rule);
		}

		.pane-ru {
			overflow-y: visible;
		}
	}
</style>
