<script lang="ts">
	import type { OpenWord, Selection } from '$lib/article';
	import type { ExplainAnswer } from '$lib/explain';
	import type { PaneField } from '$lib/explain-text';
	import { tagParts } from '$lib/grammar';
	import AnswerBody from './AnswerBody.svelte';

	/**
	 * Pure display: it renders the answer it is given and owns one control, the ×.
	 * What replaces what, and when, is the page's state machine.
	 */
	let {
		selection,
		answer,
		openWord,
		asking,
		message,
		onclose,
		onask,
		onentry,
		tooltip = $bindable(false)
	}: {
		selection: Selection | null;
		answer: ExplainAnswer;
		/** The word `answer` is about. */
		openWord: OpenWord;
		/** The clicked form of a request in flight, if one is: named by its own line. */
		asking: string | null;
		/** The server's message after a failed re-click, shown above the kept answer. */
		message: string | null;
		onclose: () => void;
		/** A word clicked in the pane's own prose: the form, its sentence, its field. */
		onask: (word: string, sentence: string, field: PaneField) => void;
		/**
		 * A code in the grammar popup whose entry the reader asked for (Q27). The page
		 * decides what that means — here on the glossary the entry is one scroll away,
		 * and from an article it is another document — so this pane only reports the
		 * click.
		 */
		onentry: (entry: string) => void;
		/**
		 * Whether the grammar popup is up. The page owns it because Escape is a
		 * layer stack there: while the popup is up, Escape closes it and not the
		 * answer (Q19). Everything else about it lives here.
		 */
		tooltip: boolean;
	} = $props();

	let region = $state<HTMLElement | null>(null);
	let chip = $state<HTMLElement | null>(null);
	/** The chip's viewport box: the popup is fixed, so the pane cannot clip it. */
	let at = $state<{ top: number; left: number } | null>(null);

	/**
	 * How long the popup survives the pointer leaving the chip or a focus leaving
	 * the chip's box, in ms. It is not zero any more: the popup carries links into
	 * the glossary (Q27), so the pointer has to be able to cross the 6px gap to it
	 * and the keyboard has to be able to move onto one of them. Both happen inside
	 * this window, and both cancel it.
	 */
	const GRACE_MS = 250;
	let closing: ReturnType<typeof setTimeout> | null = null;

	function open() {
		if (closing !== null) clearTimeout(closing);
		closing = null;
		tooltip = true;
	}

	function schedule() {
		if (closing !== null) clearTimeout(closing);
		closing = setTimeout(() => {
			closing = null;
			tooltip = false;
		}, GRACE_MS);
	}

	// Opening moves focus into the pane, so Esc works from anywhere and a screen
	// reader reads the answer. The component mounts exactly when the pane opens
	// (a re-click replaces the answer in place), so this never steals focus from
	// the word the reader just clicked.
	$effect(() => {
		if (region !== null) region.focus();
	});

	/**
	 * Staleness is derived, never stored, and it is a sentence comparison: the
	 * answer belongs to a word, not to the current sentence, so Tab away dims the
	 * body and Tab back restores it. A pending or failed re-click dims it too, so
	 * the answer that is still on screen reads as the previous one (Q6, Q12).
	 */
	const dim = $derived(
		asking !== null ||
		message !== null ||
		// A pane word is not in the article, so no selection can invalidate it: the
		// panel is about the pane's own prose, which Tab does not touch (Q20).
		(openWord.source === 'article' &&
			(selection === null ||
				selection.paragraph !== openWord.paragraph ||
				selection.sentence !== openWord.sentence))
	);

	/** The word this panel is about, when it was clicked in the pane's own prose. */
	const mark = $derived(
		openWord.source === 'pane' ? { field: openWord.field, form: openWord.form } : null
	);

	/**
	 * The popup is anchored to the chip's box. `fixed` rather than `absolute`
	 * because the pane is a scroll container: an absolute popup would be clipped
	 * at the pane's edge. The chip lives in the sticky header, so scrolling the
	 * pane leaves it where it is; the listeners are for the window, which the
	 * narrow layout scrolls.
	 */
	$effect(() => {
		if (!tooltip || chip === null) {
			at = null;
			return;
		}
		// A const, so the null check above still holds inside the closure.
		const target = chip;
		const place = () => {
			const box = target.getBoundingClientRect();
			at = { top: box.bottom + 6, left: box.left };
		};
		place();
		// Capture: a scroll inside the pane does not bubble.
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});

	// A new answer brings a new tag; the popup belongs to the one it explained.
	$effect(() => {
		void answer.grammar;
		tooltip = false;
	});
</script>

<div class="explain" tabindex="-1" aria-live="polite" lang="ru" bind:this={region}>
	<div class="head">
		<span class="word">{answer.word}</span>
		{#if answer.lemma !== null}
			<span class="arrow" aria-hidden="true">→</span>
			<span class="lemma">{answer.lemma}</span>
		{/if}
		{#if answer.grammar !== null}
			<!-- Terse by design: the popup is what makes the codes readable. A button,
			     not a span, so the keyboard can reach it — it opens on hover and on
			     focus, which is also how a tap opens it on a touch screen. -->
			<button
				type="button"
				class="grammar"
				bind:this={chip}
				aria-describedby={tooltip ? 'grammar-gloss' : undefined}
				onmouseenter={open}
				onmouseleave={schedule}
				onfocus={open}
				onblur={schedule}
			>{answer.grammar}</button>
		{/if}
		<button type="button" class="close" onclick={onclose} title="Закрыть" aria-label="Закрыть объяснение">×</button>
	</div>

	{#if tooltip && answer.grammar !== null && at !== null}
		<div
			class="gloss"
			id="grammar-gloss"
			role="tooltip"
			style="top: {at.top}px; left: {at.left}px"
			onmouseenter={open}
			onmouseleave={schedule}
			onfocusin={open}
			onfocusout={schedule}
		>
			<dl>
				{#each tagParts(answer.grammar) as part (part.tag)}
					{@const entry = part.entry}
					<dt>
						{#if entry !== null}
							<!-- A code the glossary explains is one click from what it means (Q27). The
							     popup stays up while the pointer crosses the 6px gap to it, which is what
							     the grace period is for. The href is what a middle click and a
							     «open in a new tab» follow; the click itself is the page's to place. -->
							<a
								href={`/read/glossary#${entry}`}
								onclick={(event) => {
									event.preventDefault();
									onentry(entry);
								}}>{part.tag}</a
							>
						{:else}
							{part.tag}
						{/if}
					</dt>
					<dd>{part.gloss ?? 'признак не распознан'}</dd>
				{/each}
			</dl>
		</div>
	{/if}

	{#if asking !== null}
		<p class="state">спрашиваю «{asking}»…</p>
	{:else if message !== null}
		<p class="state error">{message}</p>
	{/if}

	<!-- The prose is one component, shared with the panel a pane word came from:
	     same text, same measure, and only the controls differ (Q24). -->
	<div class="body">
		<AnswerBody {answer} {mark} {onask} {dim} />
	</div>
</div>

<style>
	.explain {
		padding-bottom: 3rem;
	}

	/* sticky: a close button that scrolls out of view is not a close button */
	.head {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
		padding: 1rem 1.5rem 0.75rem;
		background: var(--bg);
		border-bottom: 1px solid var(--rule);
		font-size: 0.95rem;
	}

	.word,
	.lemma {
		font-weight: 600;
	}

	.arrow {
		color: var(--fg-muted);
	}

	/* A button so the keyboard can reach it: the same pill, none of the chrome. */
	.grammar {
		padding: 0.05rem 0.45rem;
		background: none;
		border: 1px solid var(--rule);
		border-radius: 999px;
		color: var(--fg-muted);
		font-family: inherit;
		font-size: 0.75rem;
		cursor: help;
	}

	.grammar:hover,
	.grammar:focus-visible {
		border-color: var(--fg-muted);
		color: var(--fg);
	}

	/* fixed: the pane is a scroll container, and would clip an absolute popup */
	.gloss {
		position: fixed;
		z-index: 3;
		max-width: min(24rem, calc(100vw - 2rem));
		padding: 0.5rem 0.7rem;
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: 4px;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
	}

	/* the codes in one column, what they mean in the other */
	.gloss dl {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.15rem 0.6rem;
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.gloss dt {
		color: var(--fg-muted);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
	}

	/* a code the glossary explains: the same monospace, marked as a link rather
	   than wearing a link's colour — the code is the reader's own tag string */
	.gloss dt a {
		color: inherit;
		text-decoration: underline;
		text-decoration-color: var(--rule);
		text-underline-offset: 2px;
	}

	.gloss dt a:hover,
	.gloss dt a:focus-visible {
		color: var(--fg);
		text-decoration-color: currentColor;
	}

	.gloss dd {
		margin: 0;
	}

	.close {
		margin-left: auto;
		padding: 0 0.3rem;
		background: none;
		border: 0;
		border-radius: 2px;
		color: var(--fg);
		font-family: inherit;
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
	}

	.close:hover {
		background: var(--accent-soft);
	}

	/* The same two lines the sentence pane shows, in the same two tones: a wait is
	   muted, a failure is the error colour. */
	.state {
		max-width: 46rem;
		margin: 0;
		padding: 0.7rem 1.5rem 0;
		color: var(--fg-muted);
		font-size: 0.9rem;
	}

	.state.error {
		color: var(--error);
	}

	/* the answer is prose: give it a measure instead of the pane's full width.
	   Everything inside is AnswerBody, which explains itself. */
	.body {
		max-width: 46rem;
		padding: 1.25rem 1.5rem 0;
	}
</style>
