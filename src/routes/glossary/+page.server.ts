import { SOURCE, entries, findByTerm, letters } from '$lib/glossary';
import type { PageServerLoad } from './$types';

/**
 * The glossary page's whole payload, built on the server: the entries, the
 * letter index, and every cross-reference already resolved to an anchor (or
 * to nothing, when the referenced term has no entry of its own).
 *
 * `$lib/glossary` imports the entries' JSON, so keeping the resolution here
 * keeps that file out of the browser bundle — the page gets what it renders
 * and nothing else.
 */
export const load: PageServerLoad = () => ({
	source: SOURCE,
	letters,
	entries: entries.map((entry) => ({
		id: entry.id,
		ru: entry.ru,
		en: entry.en,
		def: entry.def,
		aliases: entry.aliases,
		// only the references that name an entry of this glossary: a reader
		// following «см. также» must land somewhere, and the appendix's own
		// vocabulary is not complete — «словообразование» and «фонетика» are
		// named by entries but have no article of their own. Two names can lead
		// to the same article («сокращение» and its alias «аббревиатура»), so the
		// list is deduplicated by target: a keyed list cannot repeat a key.
		see: [
			...new Map(
				entry.see.flatMap((term) => {
					const target = findByTerm(term);
					return target ? [[target.id, { term: target.ru, id: target.id }] as const] : [];
				})
			).values()
		]
	}))
});
