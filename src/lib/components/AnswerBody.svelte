<script lang="ts">
	import type { ExplainAnswer } from '$lib/explain';
	import { paneRuns } from '$lib/explain-text';
	import type { PaneField, PaneRun } from '$lib/explain-text';

	/**
	 * The text of one answer: its fields and where its etymology came from. One
	 * rendering for both places an answer is read — the pane being read, and the
	 * panel a pane word was taken from (Q24) — because the same text rendered twice
	 * would drift.
	 *
	 * `onask` is the whole difference: with it every word of the prose is a control
	 * (Q20); without it the prose is plain text that can still carry the wash on the
	 * word that was clicked in it.
	 */
	let {
		answer,
		mark = null,
		onask,
		dim = false
	}: {
		answer: ExplainAnswer;
		/** The word to wash, when one of this answer's own words was clicked. */
		mark?: { field: PaneField; form: string } | null;
		/** A word clicked in this prose: the form, its sentence, its field. */
		onask?: (word: string, sentence: string, field: PaneField) => void;
		/** The answer is on screen but is no longer the current one. */
		dim?: boolean;
	} = $props();

	const FIELDS: { name: PaneField; title: string }[] = [
		{ name: 'meaning', title: 'Значение' },
		{ name: 'etymology', title: 'Этимология' },
		{ name: 'example', title: 'Пример' }
	];

	/**
	 * The fields this answer has, tokenised once. The prose is the model's own, so
	 * there are no offsets to slice: every Cyrillic word becomes a control, and the
	 * sentence it sits in is the whole context the click can send (Q20). An answer
	 * the model wrote as prose instead of JSON has `meaning` and nothing else.
	 */
	const fields = $derived.by(() => {
		const text: Record<PaneField, string | null> = {
			meaning: answer.meaning,
			etymology: answer.etymology,
			example: answer.example
		};
		const out: { name: PaneField; title: string; runs: PaneRun[] }[] = [];
		for (const field of FIELDS) {
			const body = text[field.name];
			if (body !== null) out.push({ name: field.name, title: field.title, runs: paneRuns(body) });
		}
		return out;
	});

	function isMarked(field: PaneField, run: PaneRun): boolean {
		return mark !== null && mark.field === field && mark.form === run.text;
	}
</script>

<!-- One rendering for both shapes: an answer the model wrote as prose has
     `meaning` and nothing else, and that prose is a field like any other. -->
<div class="fields" class:dim>
	{#each fields as field (field.name)}
		<section>
			<h2>{field.title}</h2>
			<!-- single line on purpose: no whitespace text nodes between the slices -->
			<p class="text">{#each field.runs as run, k (k)}{#if run.sentence === ''}<span>{run.text}</span>{:else if onask === undefined}{#if isMarked(field.name, run)}<mark>{run.text}</mark>{:else}<span>{run.text}</span>{/if}{:else}<button type="button" class="tok" class:open={isMarked(field.name, run)} aria-current={isMarked(field.name, run) ? 'true' : undefined} onclick={() => onask(run.text, run.sentence, field.name)}>{run.text}</button>{/if}{/each}</p>
		</section>
	{/each}
</div>

{#if answer.parsed}
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
			<a class="source-link" href={answer.sourceUrl} target="_blank" rel="noreferrer">{answer.lemma ?? answer.word} в Викисловаре</a>
		{/if}
	</div>
{/if}

<style>
	.fields.dim {
		opacity: 0.55;
		transition: opacity 120ms ease-in-out;
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

	/* The answer's own words are controls, and wear what the sentence pane's do */
	.tok {
		font: inherit;
		color: inherit;
		background: none;
		border: 0;
		padding: 0;
		border-radius: 2px;
		cursor: pointer;
	}

	.tok:hover {
		background: var(--accent-soft);
	}

	.tok.open,
	.tok.open:hover {
		background: var(--sentence);
	}

	/* The same wash where the prose is not interactive: the panel a pane word was
	   taken from is read, not clicked. */
	.text mark {
		background: var(--sentence);
		color: inherit;
		border-radius: 2px;
	}

	.source {
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
