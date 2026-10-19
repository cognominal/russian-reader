import { error } from '@sveltejs/kit';
import { loadCatalog } from '$lib/server/catalog';
import type { PageServerLoad } from './$types';
import type { Article } from '$lib/article';

// Non-eager glob: the article JSON stays server-side (it is imported in the
// server load, so Vite bundles it for the node build, never for the browser).
const articles = import.meta.glob<{ default: Article }>('$lib/content/*.json');

export const load: PageServerLoad = async ({ params }) => {
	const entry = Object.entries(articles).find(([path]) => path.endsWith(`/${params.slug}.json`));
	if (!entry) {
		error(404, `Статья «${params.slug}» не найдена`);
	}

	const article = (await entry[1]()).default;
	const { entries } = await loadCatalog();

	// Every other text, newest first: what the reader's header links to, so the
	// text being read is never offered as a link to itself.
	return { article, others: entries.filter((e) => e.slug !== article.slug) };
};
