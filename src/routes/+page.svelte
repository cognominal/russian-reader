<script lang="ts">
	import { formatDate } from '$lib/article';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Русский текст — читаем с переводом</title>
</svelte:head>

<main>
	<h1>Русский текст с переводом</h1>
	<p class="lede">
		Слева — оригинал, справа — перевод абзаца. Нажмите на предложение, и справа подсветится его
		перевод; ниже останутся только эти две фразы.
	</p>

	{#if data.articles.length > 0}
		<ul class="catalog">
			{#each data.articles as entry (entry.slug)}
				<li>
					<a href={`/read/${entry.slug}`}>{entry.title.ru}</a>
					<span class="when">{formatDate(entry.date)}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">Пока нет ни одной статьи: в <code>src/lib/content/</code> нет данных.</p>
	{/if}

	{#if !data.catalogGenerated}
		<p class="notice">Каталог <code>articles.json</code> ещё не сгенерирован — список собран напрямую из файлов статей.</p>
	{/if}
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
		margin: 0 0 2rem;
	}

	.catalog {
		list-style: none;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--rule);
	}

	.catalog li {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.75rem;
		padding: 0.9rem 0;
		border-bottom: 1px solid var(--rule);
	}

	.catalog a {
		flex: 1 1 20rem;
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
	}

	.when,
	.notice,
	.empty {
		color: var(--fg-muted);
		font-size: 0.9rem;
	}

	code {
		font-size: 0.9em;
	}
</style>
