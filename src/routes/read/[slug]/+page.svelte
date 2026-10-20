<script lang="ts">
	import { sentenceIndex } from '$lib/article';
	import type { ArticleWord, OpenWord, Selection } from '$lib/article';
	import type { PageProps } from './$types';
	import { explainUrl, EXPLAIN_SESSION_COOKIE, EXPLAIN_SESSION_MS } from '$lib/explain';
	import type { ExplainAnswer, ExplainError, ExplainRequest } from '$lib/explain';
	import type { PaneField } from '$lib/explain-text';
	import ExplanationPane from '$lib/components/ExplanationPane.svelte';
	import OriginPane from '$lib/components/OriginPane.svelte';
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
	/**
	 * The panel the answer on screen was taken from, when its word was clicked in
	 * another explanation: the paragraph pane shows that panel instead of the
	 * article's paragraph, which is no context for it (Q24). The third property of
	 * the panel on screen, beside `answer` and `openWord` — so it survives the
	 * session's panels being dropped, the way the panel itself does.
	 */
	let originOf = $state<ExplainAnswer | null>(null);

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

	/**
	 * One panel of this session: what was asked, what came back, which word it is
	 * about, and the pair the right column was on when it was asked for — walking
	 * back to a panel puts the two right-hand panes back where they were, so the
	 * explained word is highlighted again (Q23).
	 */
	type Entry = {
		request: ExplainRequest;
		answer: ExplainAnswer;
		openWord: OpenWord;
		selection: Selection | null;
		/** For a word taken from an explanation: the panel it was taken from (Q24). */
		origin: ExplainAnswer | null;
	};

	/**
	 * The session's panels, in the order they were asked, and where the reader is in
	 * them: ← and → walk them, and asking after stepping back drops what was ahead.
	 * The session's clock is the cookie the endpoint refreshes on every ask — an hour
	 * without one and the panels are gone (Q20).
	 */
	let history = $state<Entry[]>([]);
	let cursor = $state(-1);

	// «спрашиваю…» and every pre-answer failure report next to the clicked word.
	const note = $derived.by(() => {
		if (ask === null || status === 'idle' || status === 'ready') return null;
		// A pane word has no button in the article to hang the line off: the pane's own
		// state line carries it instead (Q20).
		if (ask.request.source !== 'article') return null;
		return {
			paragraph: ask.request.paragraph,
			tokenIndex: ask.request.tokenIndex,
			text: status === 'loading' ? 'спрашиваю…' : (message ?? 'Объяснение не получилось.'),
			retryUntil,
			failed: status === 'error'
		};
	});

	// Once an answer is on screen a re-click replaces it in place: the previous
	// answer stays, dimmed, under a line naming the word being asked about, and
	// keeps the message if the new request fails (Q12, §11).
	const asking = $derived(status === 'loading' && answer !== null ? (ask?.word ?? null) : null);
	const failure = $derived(status === 'error' && answer !== null ? message : null);

	/**
	 * The panel the paragraph pane shows, when the answer on screen came out of
	 * another explanation: that explanation, scrolled to the word that was clicked
	 * in it (Q24). Null whenever the article's paragraph is the right context —
	 * the pane is closed, or the word came from the article itself.
	 */
	const origin = $derived(answer === null ? null : originOf);

	/** The word that was clicked in that panel: the one its copy washes. */
	const originMark = $derived(
		openWord !== null && openWord.source === 'pane'
			? { field: openWord.field, form: openWord.form }
			: null
	);

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
	 * chosen this way pins no word, any focus inside the reader is dropped, and an
	 * explanation open in the article pane goes before the step: the key reads the
	 * text, so it never leaves the reader on the overlay (Q6).
	 */
	function onKeydown(event: KeyboardEvent) {
		if (
			(event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
			!event.shiftKey &&
			!event.ctrlKey &&
			!event.altKey &&
			!event.metaKey
		) {
			// Shift is left alone so the arrows still extend a selection in the text,
			// and a key that walks no panel is left to the browser.
			if (step(event.key === 'ArrowLeft' ? -1 : 1)) event.preventDefault();
			return;
		}
		if (event.key === 'Escape') {
			if (tooltip) tooltip = false;
			else if (answer !== null) void close();
			else if (selection !== null) selection = null;
			return;
		}
		if (event.key !== 'Tab' || event.ctrlKey || event.altKey || event.metaKey) return;

		// Tab is a reading key, so it never lands on the overlay: an explanation goes
		// first and the three panes are back to their normal use whatever the step
		// does next, the ends included (Q6). Focus is not handed back to the clicked
		// word here — the step owns where the reader is — and the panes come back
		// exactly as Esc brings them back, so the two keys differ in nothing but what
		// follows.
		if (answer !== null) {
			forget();
			void unswap();
		}

		const at = position(selection);
		const next = at < 0 ? (event.shiftKey ? steps.length - 1 : 0) : at + (event.shiftKey ? -1 : 1);
		if (next < 0 || next >= steps.length) return;

		event.preventDefault();
		// The step supersedes whatever held focus anywhere in the reader. Left on a
		// word or a link, the ring rides into the new sentence on the element whose
		// position the old one became, and the key reads as the cursor moving around
		// a pane instead of the pair moving on (the word button `close()` focused
		// included, which lives in the sentence pane).
		const active = document.activeElement;
		if (active instanceof HTMLElement && active.closest('.reader') !== null) active.blur();
		const ref = steps[next];
		selection = { paragraph: ref.paragraph, tokenIndex: null, sentence: ref.sentence };
	}

	/** A selection from either pane: a word asks, a sentence only picks. */
	function select(next: Selection) {
		selection = next;
		if (next.tokenIndex !== null) void explain(next);
	}

	/** The clicked form, straight from the article the endpoint re-derives from. */
	function formOf(request: { paragraph: number; tokenIndex: number }): string | null {
		const paragraph = data.article.paragraphs.find((p) => p.i === request.paragraph);
		const token = paragraph?.ruTokens[request.tokenIndex];
		return token === undefined ? null : token.form;
	}

	/** A word of the article: the sentence pane's own click. */
	async function explain(sel: Selection) {
		const { paragraph, tokenIndex, sentence } = sel;
		if (tokenIndex === null || sentence === null) return;

		const request = { source: 'article' as const, paragraph, tokenIndex };
		// The same word again: its answer is on screen, or it is already in flight.
		if (status === 'loading' && ask !== null && sameAsk(ask.request, request)) return;
		if (
			openWord !== null &&
			openWord.source === 'article' &&
			openWord.paragraph === paragraph &&
			openWord.tokenIndex === tokenIndex
		) {
			return;
		}

		const word = formOf(request);
		if (word === null) return;
		await askWord(request, word, { source: 'article', paragraph, sentence, tokenIndex });
	}

	/**
	 * A word of the explanation pane's own prose. There is no lemma and no tag for
	 * it — the app has no morphology at runtime — so the sentence it sits in is the
	 * whole request, and the model is asked for the initial form itself (Q20).
	 */
	async function askPane(word: string, sentence: string, field: PaneField) {
		const request = { source: 'pane' as const, word, sentence };
		if (status === 'loading' && ask !== null && sameAsk(ask.request, request)) return;
		if (
			openWord !== null &&
			openWord.source === 'pane' &&
			openWord.form === word &&
			openWord.field === field
		) {
			return;
		}
		await askWord(request, word, { source: 'pane', form: word, field });
	}

	function sameAsk(a: ExplainRequest, b: ExplainRequest): boolean {
		if (a.source === 'article' && b.source === 'article') {
			return a.paragraph === b.paragraph && a.tokenIndex === b.tokenIndex;
		}
		if (a.source === 'pane' && b.source === 'pane') {
			return a.word === b.word && a.sentence === b.sentence;
		}
		return false;
	}

	/**
	 * One ask, whichever pane it came from. The pane is not touched here: it opens
	 * when an answer arrives, so every failure before there is one stays next to the
	 * word that was clicked — in the sentence pane for a word of the article, in the
	 * explanation pane itself for a word of its own prose, which has no button in the
	 * article to hang a line off.
	 */
	async function askWord(request: ExplainRequest, word: string, open: OpenWord) {
		controller?.abort();
		const id = (requestId += 1);
		const ctl = new AbortController();
		controller = ctl;
		ask = { request, word };
		status = 'loading';
		message = null;
		// The pair this panel belongs to, taken now: for a word of the article the
		// click has just set it to that word's sentence, and for a word of the
		// explanation it is the article sentence the reader left on screen. Read
		// here, not after the answer, so a Tab during the request cannot move the
		// panel's own context out from under it.
		const context = selection;
		// A word taken out of an explanation is taken out of a panel: that panel is
		// what the paragraph pane shows while its explanation is read (Q24).
		const from = request.source === 'pane' ? answer : null;

		try {
			const response = await fetch(explainUrl(data.article.slug), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(request satisfies ExplainRequest),
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
			openWord = open;
			originOf = from;
			status = 'ready';
			message = null;
			retryUntil = Date.now() + body.retryAfter * 1000;
			remember({ request, answer: body, openWord: open, selection: context, origin: from });
		} catch {
			// an aborted fetch is the reader's next click, not a failure
			if (ctl.signal.aborted || id !== requestId) return;
			status = 'error';
			message = 'Сервис объяснений не ответил.';
		}
	}

	/** A new panel goes at the end of the session; asking after stepping back forks it. */
	function remember(entry: Entry) {
		if (cursor < history.length - 1) history = history.slice(0, cursor + 1);
		history.push(entry);
		cursor = history.length - 1;
	}

	/** The session's clock: the timestamp the endpoint refreshed on the last ask. */
	function sessionAlive(): boolean {
		const prefix = `${EXPLAIN_SESSION_COOKIE}=`;
		const raw = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
		if (raw === undefined) return false;
		const at = Number(raw.slice(prefix.length));
		return Number.isFinite(at) && Date.now() - at < EXPLAIN_SESSION_MS;
	}

	/** ← and → walk the session's panels. A remembered answer is never re-asked. */
	function step(direction: -1 | 1): boolean {
		if (history.length === 0) return false;
		if (!sessionAlive()) {
			// An hour of silence ended the session: the panels are dropped, and the one
			// on screen — an answer being read — is left alone.
			history = [];
			cursor = -1;
			return false;
		}
		// With the pane closed, either arrow brings back the panel it was closed on.
		const next = answer === null ? cursor : cursor + direction;
		if (next < 0 || next >= history.length) return false;
		if (answer !== null && next === cursor) return false;
		cursor = next;
		show(history[next]);
		return true;
	}

	/**
	 * Put a remembered panel back on screen: no request, no window, no waiting, and
	 * with the pair it was asked about — the sentence pane and the paragraph pane
	 * follow the selection, so restoring it restores both, the mark on the word
	 * included, and the dim the reader saw when the selection had moved on.
	 */
	function show(entry: Entry) {
		controller?.abort();
		controller = null;
		requestId += 1;
		if (answer === null) savedScroll = pane?.scrollTop ?? 0;
		answer = entry.answer;
		openWord = entry.openWord;
		// A panel brings the panel it was taken from with it, or nothing when its
		// word was the article's own — `origin` is set at the ask, once (Q24).
		originOf = entry.origin;
		selection = entry.selection;
		ask = null;
		status = 'ready';
		message = null;
		retryUntil = null;
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
	 * Take the answer off screen: the answer, the word it was about, and any
	 * request still in flight — the reader has moved on either way. The word is
	 * handed back because the two ways out differ only in what focus does after.
	 */
	function forget(): OpenWord | null {
		const word = openWord;
		controller?.abort();
		controller = null;
		requestId += 1;
		answer = null;
		openWord = null;
		originOf = null;
		ask = null;
		status = 'idle';
		message = null;
		return word;
	}

	/**
	 * The article pane, back at the offset the swap saved (Q9c). Hiding a scroll
	 * container resets it, so the offset is written back rather than assumed. It is
	 * written after `tick()`, because the article pane's own effect has already
	 * asked for a smooth scroll to the current sentence by then, and again on the
	 * next frame, so that request cannot win.
	 */
	async function unswap() {
		await tick();
		restoreScroll();
		requestAnimationFrame(restoreScroll);
	}

	/**
	 * Closing is lossless: the article comes back at the offset it was left at,
	 * the selection stays, and focus returns to the word that was clicked.
	 */
	async function close() {
		if (answer === null) return;
		const word = forget();
		await unswap();
		// A pane word has no button in the article to return to (Q20).
		if (word !== null && word.source === 'article') focusWord(word);
	}

	function restoreScroll() {
		if (pane !== null) pane.scrollTop = savedScroll;
	}

	function focusWord(word: ArticleWord) {
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
			<ExplanationPane {selection} {answer} {openWord} {asking} message={failure} onclose={close} onask={askPane} bind:tooltip />
		{:else}
			<RussianPane article={data.article} others={data.others} {selection} onSelect={select} />
		{/if}
	</section>
	<aside class="pane pane-en" aria-label={origin === null ? 'English translation' : 'Откуда слово'}>
		<div class="en-para">
			{#if origin === null}
				<TranslationPane article={data.article} {selection} />
			{:else}
				<OriginPane answer={origin} mark={originMark} />
			{/if}
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
