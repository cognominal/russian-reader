<script lang="ts">
	import { enRangeFor, sentenceRuns } from '$lib/article';
	import type { Article, Selection } from '$lib/article';

	let { article, selection }: { article: Article; selection: Selection | null } = $props();

	const current = $derived(
		selection === null ? null : (article.paragraphs.find((p) => p.i === selection.paragraph) ?? null)
	);
	// null → no sentence-level pair (missing pair, or no selection): the whole
	// English paragraph is the answer.
	const markedRange = $derived(
		current !== null && selection !== null ? enRangeFor(current, selection.sentence) : null
	);
	const runs = $derived(current === null ? [] : sentenceRuns(current.en, current.enSentences));
	// A pair often spans several English sentences: the translation splits where
	// the Russian ran on, and every one of them is marked so none is left out.
	const isMarked = (sentence: number | null) =>
		sentence !== null &&
		markedRange !== null &&
		sentence >= markedRange.start &&
		sentence <= markedRange.end;
	// Announced to screen readers on every selection change, so Tab stepping is
	// usable without seeing the highlight move.
	const markedText = $derived(
		markedRange === null
			? null
			: runs.filter((r) => isMarked(r.sentence)).map((r) => r.text).join('')
	);

	let body = $state<HTMLElement | null>(null);

	// Bring the paired sentence into view inside this pane only (never scroll the page).
	// The scroll container is whatever the layout makes it: the sticky max-height pane
	// on narrow screens, the full-height pane on desktop.
	$effect(() => {
		void current;
		void markedRange;
		if (body === null) return;
		let scroller: HTMLElement | null = body.parentElement;
		while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
			scroller = scroller.parentElement;
		}
		if (scroller === null) return;
		scroller.scrollTop = 0;
		const marked = body.querySelector<HTMLElement>('.marked');
		if (marked === null) return;
		const offset = marked.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		scroller.scrollTop += offset - (scroller.clientHeight - marked.offsetHeight) / 2;
	});
</script>

<p class="sr-only" aria-live="polite" lang="en">
	{#if current !== null && selection !== null}¶{current.i}, sentence {(selection.sentence ?? 0) + 1}: {markedText ?? current.en}{/if}
</p>

<div class="body" bind:this={body}>
	{#if current !== null && selection !== null}
		<p class="where">
			<span class="para-no">¶{current.i}</span>
			{#if markedRange === null}
				<span class="note">весь абзац — надёжной пары предложений нет</span>
			{/if}
		</p>
		<p class="en" lang="en">
			<!-- single line on purpose: no whitespace text nodes may be inserted between the exact slices -->
			{#each runs as run, k (k)}<span class="run" class:marked={isMarked(run.sentence)} class:dim={markedRange !== null && !isMarked(run.sentence)}>{run.text}</span>{/each}
		</p>
	{:else}
		<p class="hint">
			Нажмите на предложение слева — здесь появится перевод его абзаца.<br />
			<span lang="en">Click a sentence on the left; its paragraph translation appears here.</span>
		</p>
	{/if}
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.body {
		padding: 1.5rem 1.5rem 3rem;
	}

	.where {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
		margin: 0 0 1rem;
		font-size: 0.85rem;
		color: var(--fg-muted);
	}

	.para-no {
		font-weight: 600;
		color: var(--fg);
	}

	.note::before {
		content: '· ';
	}

	.en {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.75;
		text-wrap: pretty;
	}

	.run {
		transition: opacity 120ms ease-in-out;
	}

	.run.dim {
		opacity: 0.5;
	}

	.run.marked {
		background: var(--accent-soft);
		border-radius: 2px;
	}

	.hint {
		margin: 0;
		color: var(--fg-muted);
		line-height: 1.6;
	}
</style>
