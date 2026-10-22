<script lang="ts">
	import { formatDate, ruRuns, sentenceGroups, sourceHost } from '$lib/article';
	import type { Article, Paragraph, Selection } from '$lib/article';

	let {
		article,
		selection,
		onSelect
	}: {
		article: Article;
		selection: Selection | null;
		onSelect: (selection: Selection) => void;
	} = $props();

	// Runs are derived once per article: exact character slices, no re-tokenizing.
	const paragraphs = $derived(
		article.paragraphs.map((p) => ({ p, groups: sentenceGroups(ruRuns(p)) }))
	);

	let text = $state<HTMLElement | null>(null);

	// The date is rendered only when the article has one: a dateless article
	// shows no `<time>` at all, rather than one whose text is empty.
	const date = $derived(formatDate(article.date));

	// The pane is remounted whenever the explanation closes, and the page then
	// restores the offset it saved before the swap. Centring on that remount
	// would fight the restore, so centring happens only when the selection
	// actually changes while this component is mounted.
	let centeredKey: string | null = null;

	// Put the current sentence in the middle of the pane, so the sentence being
	// read sits at a fixed height instead of wherever the click or Tab left it.
	// The first run of every mount is skipped: on a remount the page has already
	// restored the offset it saved before the swap, and centring would fight it.
	$effect(() => {
		const sel = selection;
		const key = selectionKey(sel);
		if (centeredKey === null || key === centeredKey) {
			centeredKey = key;
			return;
		}
		centeredKey = key;
		if (sel === null || sel.sentence === null || text === null) return;
		const el = text.querySelector<HTMLElement>(
			`[data-para="${sel.paragraph}"] [data-sent="${sel.sentence}"]`
		);
		if (el !== null) centerSentence(el, text);
	});

	/** One sentence, identified so that a re-render of the same selection does not re-centre. */
	function selectionKey(sel: Selection | null): string {
		return sel === null || sel.sentence === null ? '' : `${sel.paragraph}:${sel.sentence}`;
	}

	/** The scroll container owning the paragraph text: the pane, or the page. */
	function scrollContainer(from: HTMLElement): HTMLElement {
		let node: HTMLElement | null = from.parentElement;
		while (node !== null) {
			if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
			node = node.parentElement;
		}
		return (document.scrollingElement as HTMLElement | null) ?? document.body;
	}

	/**
	 * Centre `el` in the band of `container` that is actually visible. On wide
	 * screens that band is the reading pane; on narrow ones the page scrolls, so
	 * the band starts below the sticky translation column instead of at the top
	 * of the viewport. A sentence taller than the band is aligned by its top, so
	 * its beginning stays readable rather than both ends being cut off.
	 */
	function centerSentence(el: HTMLElement, from: HTMLElement) {
		const container = scrollContainer(from);
		const isPage = container === document.scrollingElement;
		const box = container.getBoundingClientRect();
		let bandTop = isPage ? 0 : box.top;
		const bandBottom = isPage ? window.innerHeight : box.bottom;

		const aside = from.closest('.reader')?.querySelector<HTMLElement>('.pane-en') ?? null;
		if (aside !== null) {
			const style = getComputedStyle(aside);
			const rect = aside.getBoundingClientRect();
			const overlays = style.position === 'sticky' || style.position === 'fixed';
			if (overlays && rect.top <= bandTop + 1 && rect.bottom > bandTop) bandTop = rect.bottom;
		}

		const band = Math.max(bandBottom - bandTop, 1);
		const rect = el.getBoundingClientRect();
		const delta =
			rect.height > band * 0.8
				? rect.top - bandTop
				: rect.top + rect.height / 2 - (bandTop + band / 2);

		const limit = container.scrollHeight - (isPage ? window.innerHeight : container.clientHeight);
		const top = Math.max(0, Math.min(limit, container.scrollTop + delta));
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		container.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
	}

	/**
	 * A click on a sentence: choose it, pin no word. The article is plain text —
	 * no word in it is clickable — and a sentence stays a plain `<span>` for
	 * assistive tech on purpose: turning 373 of them into buttons would bury the
	 * article. The keyboard path is the document-level Tab / Shift+Tab, and the
	 * translation pane announces the marked sentence in a live region, so the
	 * pointer handler is a convenience.
	 */
	function choose(p: Paragraph, sentence: number) {
		onSelect({ paragraph: p.i, tokenIndex: null, sentence });
	}
</script>

<header>
	<h1>{article.title.ru}</h1>
	<p class="meta">
		{#if date !== null}<time datetime={article.date}>{date}</time>
			<span class="dot">·</span>{/if}
		<a href={article.source.ru} rel="noreferrer">{sourceHost(article.source.ru)}</a>
		<span class="dot">·</span>
		<a href={article.source.en} rel="noreferrer">{sourceHost(article.source.en)}</a>
	</p>
	{#if article.source.note !== undefined}
		<p class="note">{article.source.note}</p>
	{/if}
	<p class="legend">
		Клик по предложению — перевод этого абзаца справа, с подсветкой нужной фразы.
		<strong>Tab</strong> / <strong>Shift+Tab</strong> — следующее / предыдущее предложение,
		<strong>Esc</strong> — снять выделение.
	</p>
</header>

<article lang="ru" bind:this={text}>
	{#each paragraphs as { p, groups } (p.i)}
		<p class="para" data-para={p.i} id={p.anchor}>
			<!-- single line on purpose: no whitespace text nodes may be inserted between the exact slices -->
			{#each groups as g, gi (gi)}{#if g.sentence === null}{#each g.runs as run, k (k)}<span class="txt" class:proper={run.proper}>{run.text}</span>{/each}{:else}{@const s = g.sentence}{@const isCurrent = selection?.sentence === s && selection?.paragraph === p.i}<!-- svelte-ignore a11y_no_static_element_interactions --><!-- svelte-ignore a11y_click_events_have_key_events --><span class="sent" class:tint={isCurrent} class:dim={selection?.sentence != null && !isCurrent} data-sent={s} onclick={() => { if (s !== null) choose(p, s); }}>{#each g.runs as run, k (k)}<span class="txt" class:proper={run.proper}>{run.text}</span>{/each}</span>{/if}{/each}
		</p>
	{/each}
</article>

<style>
	header {
		padding-bottom: 1.25rem;
		margin-bottom: 1.75rem;
		border-bottom: 1px solid var(--rule);
	}

	h1 {
		font-size: 1.35rem;
		line-height: 1.35;
		margin: 0 0 0.6rem;
	}

	.meta {
		margin: 0 0 1rem;
		color: var(--fg-muted);
		font-size: 0.9rem;
	}

	.dot {
		padding: 0 0.35rem;
	}

	/* the provenance line, when the article carries one: quieter than the links
	   above it, which is the order the reader needs them in */
	.note {
		margin: 0 0 1rem;
		color: var(--fg-muted);
		font-size: 0.8rem;
	}

	.legend {
		margin: 0;
		padding: 0.5rem 0.7rem;
		background: var(--sentence);
		border-radius: 4px;
		color: var(--fg-muted);
		font-size: 0.85rem;
	}

	article {
		font-size: 1.06rem;
		line-height: 1.75;
		hyphens: auto;
		text-wrap: pretty;
	}

	.para {
		margin: 0 0 1.1rem;
	}

	.txt {
		border-radius: 2px;
	}

	/* a name is not vocabulary: italic marks it at a glance, and it stays plain text */
	.txt.proper {
		font-style: italic;
	}

	.sent {
		border-radius: 2px;
		cursor: pointer;
		transition: opacity 120ms ease-in-out;
	}

	.sent:hover {
		background: var(--accent-soft);
	}

	/* everything but the current sentence recedes, so the pair in the right
	   hand panes is the only thing at full contrast */
	.sent.dim {
		opacity: 0.45;
	}

	.sent.tint,
	.sent.tint:hover {
		background: var(--sentence);
	}
</style>
