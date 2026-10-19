import type { PageServerLoad } from './$types';
import type { Article, CatalogEntry } from '$lib/article';

const catalogs = import.meta.glob<{ default: CatalogEntry[] }>('$lib/content/articles.json');
const articles = import.meta.glob<{ default: Article }>('$lib/content/*.json');

export const load: PageServerLoad = async () => {
	const catalog = Object.entries(catalogs).find(([path]) => path.endsWith('/articles.json'));
	if (catalog) {
		return { articles: (await catalog[1]()).default, catalogGenerated: true };
	}

	// articles.json is written by the offline pipeline; until it exists, discover
	// the article files directly so the index still lists what is readable.
	const listed: CatalogEntry[] = [];
	for (const loadArticle of Object.values(articles)) {
		const article = (await loadArticle()).default;
		if (!article || !Array.isArray(article.paragraphs)) continue;
		listed.push({ slug: article.slug, title: article.title, date: article.date });
	}
	listed.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

	return { articles: listed, catalogGenerated: false };
};
