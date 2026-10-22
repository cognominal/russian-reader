<script lang="ts">
	import { tick } from 'svelte';
	import { formatDate } from '$lib/article';
	import type { CatalogEntry } from '$lib/article';

	/** One explanation the session has: a row of the words menu. */
	type Panel = {
		/** The word explained, named the way the pane's own head names it. */
		word: string;
		lemma: string | null;
		/** The paragraph of a word of the article; null for a word of an explanation. */
		paragraph: number | null;
		/** Whether this is the panel on screen. */
		current: boolean;
	};

	let {
		texts,
		panels,
		open = $bindable(null),
		/** The bar's own height, so a sticky column below it can stop clear of it. */
		height = $bindable(0),
		onopenpanel
	}: {
		/** The other texts, newest first: what the texts menu offers. */
		texts: CatalogEntry[];
		/** The session's panels, in the order they were asked: the words menu. Empty until
		 *  an answer has arrived, and the entry is inert while it is (Q26). */
		panels: Panel[];
		/** Which menu is up, if any. The page owns the Escape stack, so it reads this. */
		open: 'texts' | 'words' | null;
		height: number;
		onopenpanel: (index: number) => void;
	} = $props();

	let root = $state<HTMLElement | null>(null);
	let popup = $state<HTMLElement | null>(null);
	let textsTab = $state<HTMLButtonElement | null>(null);
	let wordsTab = $state<HTMLButtonElement | null>(null);

	/** The rows of the open menu, in the order they are shown. */
	function rows(): HTMLElement[] {
		return popup === null ? [] : [...popup.querySelectorAll<HTMLElement>('[role="menuitem"]')];
	}

	async function show(which: 'texts' | 'words', keyboard: boolean) {
		open = which;
		if (!keyboard) return;
		// Opened from the keyboard, the menu takes the focus, so ↓ and ↑ reach it at
		// once; opened by a click it leaves the focus on the button, where the reader
		// left it. `detail === 0` is the keyboard's click.
		await tick();
		rows()[0]?.focus();
	}

	function toggle(which: 'texts' | 'words', event: MouseEvent) {
		if (open === which) open = null;
		else void show(which, event.detail === 0);
	}

	// A popup that nothing dismisses is a trap: a pointer press outside the bar closes
	// it. Escape and Tab are the page's to handle, because they are its key stack.
	$effect(() => {
		if (open === null) return;
		const away = (event: Event) => {
			if (root !== null && event.target instanceof Node && !root.contains(event.target)) open = null;
		};
		document.addEventListener('pointerdown', away);
		return () => document.removeEventListener('pointerdown', away);
	});

	function onPopupKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			// While the rows have the focus the menu owns this key: it closes and hands
			// the focus back to the button it came from, and stops the event, so the
			// page's own Escape stack (popup, answer, selection) is not reached (Q26).
			event.preventDefault();
			event.stopPropagation();
			const back = open === 'words' ? wordsTab : textsTab;
			open = null;
			back?.focus();
			return;
		}
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const list = rows();
		if (list.length === 0) return;
		// The arrows belong to the menu while it is open — they walk the rows and stop
		// there, because the page's own arrow handler walks the session's panels.
		event.preventDefault();
		event.stopPropagation();
		const at = list.indexOf(document.activeElement as HTMLElement);
		const step = event.key === 'ArrowDown' ? 1 : -1;
		list[at < 0 ? 0 : (at + step + list.length) % list.length].focus();
	}
</script>

<nav class="menubar" aria-label="Меню" bind:this={root} bind:clientHeight={height}>
	<div class="menu">
		<button
			type="button"
			class="tab"
			aria-haspopup="menu"
			aria-expanded={open === 'texts'}
			title="Другие тексты"
			bind:this={textsTab}
			onclick={(event) => toggle('texts', event)}
		>Тексты</button>
		{#if open === 'texts'}
			<div class="popup" role="menu" aria-label="Тексты" tabindex="-1" bind:this={popup} onkeydown={onPopupKeydown}>
				{#each texts as text (text.slug)}
					<a role="menuitem" href={`/read/${text.slug}`} onclick={() => (open = null)}>
						<span class="label">{text.title.ru}</span>
						<span class="when">{formatDate(text.date)}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>

	<div class="menu">
		<button
			type="button"
			class="tab"
			aria-haspopup="menu"
			aria-expanded={open === 'words'}
			disabled={panels.length === 0}
			title={panels.length === 0 ? 'Ни одного объяснения пока нет' : 'Слова, объяснённые за этот сеанс'}
			bind:this={wordsTab}
			onclick={(event) => toggle('words', event)}
		>Слова</button>
		{#if open === 'words'}
			<div class="popup" role="menu" aria-label="Слова" tabindex="-1" bind:this={popup} onkeydown={onPopupKeydown}>
				{#each panels as panel, i (i)}
					<button
						type="button"
						role="menuitem"
						aria-current={panel.current ? 'true' : undefined}
						onclick={() => {
							open = null;
							onopenpanel(i);
						}}
					>
						<span class="label">{panel.word}{#if panel.lemma !== null}<span class="arrow" aria-hidden="true">→</span><span class="lemma">{panel.lemma}</span>{/if}</span>
						{#if panel.paragraph !== null}<span class="when">¶{panel.paragraph}</span>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- The glossary is an article, so its entry is a link where the other two are menus (Q27) -->
	<a class="tab" href="/read/glossary" title="Словарь грамматических терминов">Словарь</a>

	<!-- The way to the source: the bar's only exit from the app (Q26) -->
	<a
		class="source"
		href="https://github.com/cognominal/russian-reader"
		target="_blank"
		rel="noopener noreferrer"
		aria-label="Исходный код на GitHub"
		title="Исходный код на GitHub"
	>
		<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
			<path
				fill="currentColor"
				d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"
			/>
		</svg>
	</a>
</nav>

<style>
	.menubar {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.3rem 0.75rem;
		background: var(--bg-raised);
		border-bottom: 1px solid var(--rule);
		/* the page scrolls on narrow screens, the bar does not */
		position: sticky;
		top: 0;
		z-index: 3;
	}

	.menu {
		position: relative;
	}

	/* The way to the source, at the far right: an icon, named for whoever cannot see it */
	.source {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.35rem;
		color: var(--fg-muted);
		border-radius: 4px;
	}

	.source:hover {
		color: var(--fg);
		background: var(--accent-soft);
	}

	/* «Тексты» and «Слова» are buttons over popups, «Словарь» is a link to the article:
	   the same row, the same hover, the same size */
	.tab {
		display: inline-block;
		font: inherit;
		font-size: 0.9rem;
		color: var(--fg);
		text-decoration: none;
		padding: 0.25rem 0.6rem;
		background: none;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}

	.tab:hover:not(:disabled),
	.tab[aria-expanded='true'] {
		background: var(--accent-soft);
	}

	/* No explanation to list: the entry says so and takes no click (Q26) */
	.tab:disabled {
		color: var(--fg-muted);
		opacity: 0.45;
		cursor: default;
	}

	.popup {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 0;
		display: flex;
		flex-direction: column;
		min-width: 17rem;
		max-width: 34rem;
		max-height: 60vh;
		overflow-y: auto;
		padding: 0.3rem;
		background: var(--bg-raised);
		border: 1px solid var(--rule);
		border-radius: 6px;
		box-shadow: 0 10px 26px rgb(0 0 0 / 18%);
		z-index: 4;
	}

	.popup a,
	.popup button {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
		font: inherit;
		font-size: 0.9rem;
		color: inherit;
		text-align: left;
		text-decoration: none;
		padding: 0.4rem 0.55rem;
		background: none;
		border: 0;
		border-radius: 4px;
		cursor: pointer;
	}

	.popup a:hover,
	.popup button:hover,
	.popup :focus-visible {
		background: var(--accent-soft);
	}

	/* the panel on screen: marked, and clicking it is a no-op rather than a move */
	.popup [aria-current='true'] {
		background: var(--sentence);
	}

	.label {
		flex: 1 1 auto;
	}

	.arrow {
		padding: 0 0.35rem;
		color: var(--fg-muted);
	}

	.lemma,
	.when {
		color: var(--fg-muted);
	}

	.when {
		flex: 0 0 auto;
		font-size: 0.85em;
	}
</style>
