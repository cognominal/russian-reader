<script lang="ts">
	import AnswerBody from './AnswerBody.svelte';
	import type { ExplainAnswer } from '$lib/explain';
	import type { PaneField } from '$lib/explain-text';

	/**
	 * The panel a pane word was taken from, shown in the paragraph pane while the
	 * explanation of that word is on screen (Q24). A word that came out of an
	 * explanation has nothing to do with the article's paragraph, so the explanation
	 * it came out of is its context: the pane opens on the field the word sits in,
	 * with the word marked.
	 *
	 * Read-only on purpose. The controls — the ×, the grammar chip, the clickable
	 * words — belong to the panel being read, on the left; this one is what that
	 * panel is read against.
	 */
	let {
		answer,
		mark
	}: {
		answer: ExplainAnswer;
		mark: { field: PaneField; form: string } | null;
	} = $props();

	let box = $state<HTMLElement | null>(null);

	// Same rule as the translation pane it replaces: bring the marked word into view
	// inside this pane only, and never scroll the page. The scroll container is
	// whatever the layout makes it — the sticky max-height pane on narrow screens,
	// the full-height pane on desktop.
	$effect(() => {
		void answer;
		void mark;
		if (box === null) return;
		let scroller: HTMLElement | null = box.parentElement;
		while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
			scroller = scroller.parentElement;
		}
		const target = box.querySelector<HTMLElement>('mark');
		if (scroller === null || target === null) return;
		scroller.scrollTop = 0;
		const offset = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		scroller.scrollTop += offset - (scroller.clientHeight - target.offsetHeight) / 2;
	});
</script>

<div class="origin" lang="ru" bind:this={box}>
	<p class="label">Откуда слово: <span class="word">{answer.word}</span></p>
	<AnswerBody {answer} {mark} />
</div>

<style>
	.origin {
		padding: 1rem 1.5rem 2rem;
	}

	/* the same shape as a field's own heading, because it labels the fields below */
	.label {
		margin: 0 0 1rem;
		color: var(--fg-muted);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.word {
		color: var(--fg);
	}
</style>
