import type { Article, CatalogEntry } from '$lib/article';

const catalogs = import.meta.glob<{ default: CatalogEntry[] }>('$lib/content/articles.json');
const articles = import.meta.glob<{ default: Article }>('$lib/content/*.json');

/**
 * What is readable, newest first — the index's list and the reader's text
 * switcher read the same catalog, so they cannot disagree about which texts
 * exist.
 *
 * `articles.json` is written by the offline pipeline; until it exists, the
 * article files are discovered directly so both pages still list what is
 * readable.
 *
 * In `$lib/server` on purpose: the glob over `*.json` would otherwise be a
 * client import away from pulling whole articles into the browser bundle.
 */
export async function loadCatalog(): Promise<{ entries: CatalogEntry[]; generated: boolean }> {
	const catalog = Object.entries(catalogs).find(([path]) => path.endsWith('/articles.json'));
	if (catalog) {
		return { entries: (await catalog[1]()).default, generated: true };
	}

	const listed: CatalogEntry[] = [];
	for (const loadArticle of Object.values(articles)) {
		const article = (await loadArticle()).default;
		if (!article || !Array.isArray(article.paragraphs)) continue;
		listed.push({ slug: article.slug, title: article.title, date: article.date });
	}
	listed.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

	return { entries: listed, generated: false };
}
