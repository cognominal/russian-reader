<script lang="ts">
	import { pairGroupFor, ruRuns, sentenceGroups, sentenceRuns } from '$lib/article';
	import type { Article, OpenWord, Run, Selection } from '$lib/article';

	/**
	 * What to print next to a word: «спрашиваю…» while its request is in flight,
	 * the server's message after a failure, and the cooldown behind either one.
	 */
	type Note = {
		paragraph: number;
		tokenIndex: number;
		text: string;
		/** Epoch ms the courtesy window reopens; drives the countdown, gates nothing. */
		retryUntil: number | null;
		/** The message is a failure, not a wait: it wears the error colour. */
		failed: boolean;
	};

	let {
		article,
		selection,
		onSelect,
		openWord,
		note
	}: {
		article: Article;
		selection: Selection | null;
		onSelect: (selection: Selection) => void;
		/** The word an explanation is open for: its button wears the wash. */
		openWord: OpenWord | null;
		note: Note | null;
	} = $props();

	// The picked sentence, once it is known to exist.
	const picked = $derived.by(() => {
		const sel = selection;
		if (sel === null || sel.sentence === null) return null;
		const paragraph = article.paragraphs.find((p) => p.i === sel.paragraph);
		return paragraph === undefined ? null : { paragraph, sentence: sel.sentence };
	});

	// The pair group: the picked sentence, every Russian sentence that shares its
	// English side, and every English sentence they name. A merge and a split are
	// the same relation seen from opposite sides, so the pane shows the whole group.
	const group = $derived.by(() => {
		const pick = picked;
		if (pick === null) return null;
		if (pick.paragraph.ruSentences[pick.sentence] === undefined) return null;
		return pairGroupFor(pick.paragraph, pick.sentence);
	});

	// The header names what the pane is showing: one sentence, or the group's range.
	const label = $derived.by(() => {
		const g = group;
		if (g === null || g.ru.length === 0) return null;
		const first = g.ru[0] + 1;
		const last = g.ru[g.ru.length - 1] + 1;
		return g.ru.length === 1
			? `предложение ${first} · sentence ${first}`
			: `предложения ${first}–${last} · sentences ${first}–${last}`;
	});

	// The Russian line is rendered from the same runs the article uses, limited to
	// the group, so every word is a control carrying its exact offsets and its
	// `ruTokens` index. The ends are trimmed the way the plain-text line was: the
	// space the previous sentence left behind is a run of its own.
	const runs = $derived.by(() => {
		const pick = picked;
		const g = group;
		if (pick === null || g === null) return [];
		const wanted = new Set(g.ru);
		return trimEnds(
			ruRuns(pick.paragraph).filter((run) => run.sentence !== null && wanted.has(run.sentence))
		);
	});

	/** The group's Russian sentences, each a wrapper that can tint or dim as a whole. */
	const parts = $derived(sentenceGroups(runs));

	function trimEnds<T extends { text: string }>(list: T[]): T[] {
		const out = list.map((run) => ({ ...run }));
		while (out.length > 0 && out[0].text.trim() === '') out.shift();
		while (out.length > 0 && out[out.length - 1].text.trim() === '') out.pop();
		if (out.length > 0) out[0].text = out[0].text.replace(/^\s+/, '');
		if (out.length > 0) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
		return out;
	}

	// The English side is every sentence of the group, each its own span. There is
	// no current English sentence — the selection indexes Russian — so none is
	// dimmed. Interior gaps are kept: they are the page's own spacing.
	const enRuns = $derived.by(() => {
		const pick = picked;
		const g = group;
		if (pick === null || g === null || g.en.length === 0) return null;
		const all = sentenceRuns(pick.paragraph.en, pick.paragraph.enSentences);
		const first = g.en[0];
		const last = g.en[g.en.length - 1];
		const from = all.findIndex((run) => run.sentence === first);
		let to = -1;
		for (let k = all.length - 1; k >= 0; k--) {
			if (all[k].sentence === last) {
				to = k;
				break;
			}
		}
		if (from < 0 || to < from) return null;
		return trimEnds(all.slice(from, to + 1));
	});

	/** The word being explained: the one whose button wears `--sentence`. */
	function isOpen(run: Run): boolean {
		const pick = picked;
		return (
			pick !== null &&
			openWord !== null &&
			openWord.source === 'article' &&
			openWord.paragraph === pick.paragraph.i &&
			openWord.sentence === run.sentence &&
			openWord.tokenIndex === run.tokenIndex
		);
	}

	/** The pending or failed request, if it is about this very token. */
	function noteFor(run: Run): Note | null {
		const pick = picked;
		if (note === null || pick === null || run.tokenIndex === null) return null;
		return note.paragraph === pick.paragraph.i && note.tokenIndex === run.tokenIndex ? note : null;
	}

	function choose(run: Run) {
		const pick = picked;
		if (pick === null || run.tokenIndex === null || run.sentence === null) return;
		// A word in a dimmed member of the group makes its own sentence current.
		onSelect({ paragraph: pick.paragraph.i, tokenIndex: run.tokenIndex, sentence: run.sentence });
	}

	// The cooldown counts down in whole seconds. The deadline itself lives in the
	// page — it comes from the response — so only the tick lives here.
	let now = $state(Date.now());
	$effect(() => {
		const until = note?.retryUntil ?? null;
		if (until === null || until <= Date.now()) return;
		// Read the clock now: `now` is from mount, so the first render of a fresh note
		// would otherwise count down from a time long past.
		now = Date.now();
		const id = setInterval(() => {
			now = Date.now();
			if (now >= until) clearInterval(id);
		}, 1000);
		return () => clearInterval(id);
	});
	const left = $derived(
		note !== null && note.retryUntil !== null && note.retryUntil > now
			? Math.ceil((note.retryUntil - now) / 1000)
			: 0
	);
	// The wait can now be most of an hour, where seconds stop being readable.
	const leftText = $derived(left >= 60 ? `${Math.ceil(left / 60)} мин` : `${left} с`);
</script>

<div class="head">
	{#if picked !== null}
		<span class="para-no">¶{picked.paragraph.i}</span>
		{#if label !== null}<span class="sent-no">{label}</span>{/if}
	{:else}
		<span class="para-no">¶—</span>
	{/if}
</div>

{#if picked !== null && group !== null}
	<!-- single line on purpose: no whitespace text nodes may be inserted between the exact slices -->
	<p class="line" lang="ru" data-para={picked.paragraph.i}><span class="tag">RU</span>{#each parts as part, gi (gi)}{#if part.sentence === null}{#each part.runs as run, k (k)}<span class="txt">{run.text}</span>{/each}{:else}{@const current = part.sentence === picked.sentence}<span class="sent" class:tint={current} class:dim={!current} aria-current={current ? 'true' : undefined} data-sent={part.sentence}>{#each part.runs as run, k (k)}{@const open = isOpen(run)}{@const n = noteFor(run)}{#if run.tokenIndex === null}<span class="txt">{run.text}</span>{:else if run.proper}<span class="proper">{run.text}</span>{:else}<button type="button" class="tok" class:open={open} aria-current={open ? 'true' : undefined} data-tok={run.tokenIndex} onclick={() => choose(run)}>{run.text}</button>{/if}{#if n !== null}<span class="status" class:error={n.failed}>{n.text}{#if left > 0}<span class="count">ещё {leftText}</span>{/if}</span>{/if}{/each}</span>{/if}{/each}</p>
	{#if enRuns !== null}
		<p class="line" lang="en"><span class="tag">EN</span>{#each enRuns as run, k (k)}{#if run.sentence === null}{run.text}{:else}<span class="en-sent" data-sent={run.sentence}>{run.text}</span>{/if}{/each}</p>
	{:else}
		<p class="note">Перевода этой фразы в паре нет — смотрите абзац выше.</p>
	{/if}
{:else}
	<p class="hint">
		Нажмите на предложение слева — здесь появится его пара.
	</p>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
		margin: 0 0 0.7rem;
		font-size: 0.85rem;
		color: var(--fg-muted);
	}

	.para-no {
		font-weight: 600;
		color: var(--fg);
	}

	.line {
		margin: 0 0 0.6rem;
		line-height: 1.65;
	}

	.line:last-child {
		margin-bottom: 0;
	}

	.tag {
		display: inline-block;
		width: 1.9rem;
		margin-right: 0.45rem;
		color: var(--fg-muted);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		vertical-align: 0.1em;
	}

	/* every word is a control, so it borrows the text's own type and the article's
	   own focus ring rather than styling itself */
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

	/* the word the explanation on the left is about */
	.tok.open,
	.tok.open:hover {
		background: var(--sentence);
	}

	/* a pair group's current sentence is tinted and its siblings recede, the same
	   convention the article pane uses */
	.sent {
		border-radius: 2px;
		transition: opacity 120ms ease-in-out;
	}

	.sent.dim {
		opacity: 0.45;
	}

	.sent.tint {
		background: var(--sentence);
	}

	/* a name is not vocabulary: italic, and no control */
	.proper {
		font-style: italic;
	}

	/* «спрашиваю…» / the server's message, right where the click happened. A
	   failure is not a wait — it is the one line here the reader has to act on —
	   so it wears the error colour, countdown included. */
	.status {
		margin-left: 0.4rem;
		color: var(--fg-muted);
		font-size: 0.85rem;
	}

	.status.error {
		color: var(--error);
	}

	.count {
		margin-left: 0.3rem;
	}

	.note,
	.hint {
		margin: 0;
		color: var(--fg-muted);
		font-size: 0.9rem;
		line-height: 1.6;
	}
</style>
