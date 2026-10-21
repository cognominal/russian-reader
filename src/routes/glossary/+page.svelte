<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const byId = $derived(new Map(data.entries.map((entry) => [entry.id, entry])));
</script>

<svelte:head>
	<title>Словарь грамматических терминов — читаем с переводом</title>
	<meta
		name="description"
		content="Русский словарь грамматических терминов, составленный по Appendix:Glossary английского Викисловаря и приспособленный к русской грамматике."
	/>
</svelte:head>

<main>
	<h1>Словарь грамматических терминов</h1>
	<p class="lede">
		Слова, которые объяснение называет своими именами: части речи, падежи, времена, пометы словарей.
		Словарь составлен по
		<a href={data.source.url} rel="noopener noreferrer">{data.source.title}</a>
		английского Викисловаря ({data.source.site}, CC BY-SA) — термины переведены на русский и
		приспособлены к русской грамматике: где такого явления в русском нет, статья говорит об этом
		прямо и называет ближайшее русское.
	</p>

	<nav class="index" aria-label="Буквы">
		{#each data.letters as group (group.letter)}
			<a href={`#буква-${group.letter}`}>{group.letter}</a>
		{/each}
	</nav>

	{#each data.letters as group (group.letter)}
		<section id={`буква-${group.letter}`} aria-labelledby={`заголовок-${group.letter}`}>
			<h2 id={`заголовок-${group.letter}`}>{group.letter}</h2>
			{#each group.ids as id (id)}
				{@const entry = byId.get(id)}
				{#if entry}
					<article class="entry" id={entry.id}>
						<h3>
							{entry.ru}
							<span class="en" title="термин английского Викисловаря">{entry.en}</span>
						</h3>
						<p class="def">{entry.def}</p>
						{#if entry.aliases.length > 0}
							<p class="more">то же: {entry.aliases.join(', ')}</p>
						{/if}
						{#if entry.see.length > 0}
							<p class="more">
								см. также:
								{#each entry.see as link, i (link.id)}
									{#if i > 0}<span>, </span>{/if}<a href={`#${link.id}`}>{link.term}</a>
								{/each}
							</p>
						{/if}
					</article>
				{/if}
			{/each}
		</section>
	{/each}

	<p class="tail">
		Словарь английского Викисловаря шире русской грамматики: статьи о чужих языках и о словарных
		пометах оставлены здесь ради полноты источника. <a href="/">Все тексты</a>.
	</p>
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: 2.5rem 1.25rem 4rem;
		line-height: 1.6;
	}

	h1 {
		font-size: 1.6rem;
		margin: 0 0 0.75rem;
	}

	.lede {
		color: var(--fg-muted);
		margin: 0 0 1.5rem;
	}

	.index {
		display: flex;
		flex-wrap: wrap;
		gap: 0.15rem 0.35rem;
		padding: 0.75rem 0;
		border-top: 1px solid var(--rule);
		border-bottom: 1px solid var(--rule);
		margin-bottom: 2rem;
	}

	.index a {
		font-size: 0.95rem;
		text-decoration: none;
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
	}

	.index a:hover {
		background: var(--accent-soft);
	}

	section {
		scroll-margin-top: 1rem;
	}

	h2 {
		font-size: 1.1rem;
		color: var(--accent);
		margin: 2rem 0 0.5rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--rule);
	}

	.entry {
		scroll-margin-top: 1rem;
		padding: 0.75rem 0;
	}

	.entry:target {
		background: var(--accent-soft);
	}

	h3 {
		font-size: 1rem;
		margin: 0 0 0.25rem;
	}

	.en {
		font-size: 0.85rem;
		font-weight: normal;
		color: var(--fg-muted);
		margin-left: 0.4rem;
	}

	.def {
		margin: 0;
	}

	.more {
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
		color: var(--fg-muted);
	}

	.tail {
		margin-top: 3rem;
		color: var(--fg-muted);
		font-size: 0.9rem;
	}
</style>
