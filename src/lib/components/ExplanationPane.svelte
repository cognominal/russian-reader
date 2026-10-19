<script lang="ts">
	import type { OpenWord, Selection } from '$lib/article';
	import type { ExplainAnswer } from '$lib/explain';
	import { tagParts } from '$lib/grammar';

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
		selection === null ||
		selection.paragraph !== openWord.paragraph ||
		selection.sentence !== openWord.sentence
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
		<span class="arrow" aria-hidden="true">→</span>
		<span class="lemma">{answer.lemma}</span>
		{#if answer.grammar !== null}
			<!-- Terse by design: the popup is what makes the codes readable. A button,
			     not a span, so the keyboard can reach it — it opens on hover and on
			     focus, which is also how a tap opens it on a touch screen. -->
			<button
				type="button"
				class="grammar"
				bind:this={chip}
				aria-describedby={tooltip ? 'grammar-gloss' : undefined}
				onmouseenter={() => (tooltip = true)}
				onmouseleave={() => (tooltip = false)}
				onfocus={() => (tooltip = true)}
				onblur={() => (tooltip = false)}
			>{answer.grammar}</button>
		{/if}
		<button type="button" class="close" onclick={onclose} title="Закрыть" aria-label="Закрыть объяснение">×</button>
	</div>

	{#if tooltip && answer.grammar !== null && at !== null}
		<div class="gloss" id="grammar-gloss" role="tooltip" style="top: {at.top}px; left: {at.left}px">
			<dl>
				{#each tagParts(answer.grammar) as part (part.tag)}
					<dt>{part.tag}</dt>
					<dd>{part.gloss ?? 'признак не распознан'}</dd>
				{/each}
			</dl>
		</div>
	{/if}

	{#if asking !== null}
		<p class="state">спрашиваю «{asking}»…</p>
	{:else if message !== null}
		<p class="state">{message}</p>
	{/if}

	{#if answer.parsed}
		<div class="body" class:dim={dim}>
			<section>
				<h2>Значение</h2>
				<p class="text">{answer.meaning}</p>
			</section>
			{#if answer.etymology !== null}
				<section>
					<h2>Этимология</h2>
					<p class="text">{answer.etymology}</p>
				</section>
			{/if}
			{#if answer.example !== null}
				<section>
					<h2>Пример</h2>
					<p class="text">{answer.example}</p>
				</section>
			{/if}
		</div>
		<!-- A rewrite of a sourced etymology and a recollection are not the same
		     claim, so the pane says which one this is — and, when there is a
		     source, shows it. The model rewrites prose; it does not get to be the
		     only witness for a reconstruction it may have mangled. At full
		     contrast: a dim attribution reads as part of the answer's body. -->
		<div class="source">
			<p class="attribution">{answer.etymologySource === 'wiktionary' ? 'по данным Викисловаря' : 'сгенерировано, не проверено'}</p>
			{#if answer.sourceText !== null}
				<details class="quoted">
					<summary>Текст из Викисловаря</summary>
					<p class="quoted-text">{answer.sourceText}</p>
				</details>
			{/if}
			{#if answer.sourceUrl !== null}
				<a class="source-link" href={answer.sourceUrl} target="_blank" rel="noreferrer">{answer.lemma} в Викисловаре</a>
			{/if}
		</div>
	{:else}
		<!-- The model answered prose instead of the requested JSON: no fields to
		     label, no etymology to attribute, and no answer thrown away. -->
		<div class="body" class:dim={dim}>
			<p class="text">{answer.meaning}</p>
		</div>
	{/if}
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

	.state {
		max-width: 46rem;
		margin: 0;
		padding: 0.7rem 1.5rem 0;
		color: var(--accent);
		font-size: 0.9rem;
	}

	/* the answer is prose: give it a measure instead of the pane's full width */
	.body {
		max-width: 46rem;
		padding: 1.25rem 1.5rem 0;
		transition: opacity 120ms ease-in-out;
	}

	.body.dim {
		opacity: 0.55;
	}

	section {
		margin: 0 0 1.25rem;
	}

	h2 {
		margin: 0 0 0.3rem;
		color: var(--fg-muted);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.text {
		margin: 0;
		line-height: 1.7;
		/* model output is text: the fields keep the model's own line breaks */
		white-space: pre-wrap;
	}

	.source {
		max-width: 46rem;
		padding: 0 1.5rem;
		color: var(--fg-muted);
		font-size: 0.85rem;
	}

	.attribution {
		margin: 0;
	}

	.quoted {
		margin: 0.5rem 0 0;
	}

	.quoted summary {
		cursor: pointer;
	}

	.quoted-text {
		margin: 0.4rem 0 0;
		padding-left: 0.8rem;
		border-left: 2px solid var(--rule);
		line-height: 1.6;
	}

	.source-link {
		display: inline-block;
		margin-top: 0.5rem;
		color: var(--accent);
	}
</style>
