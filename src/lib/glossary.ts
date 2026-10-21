import raw from './glossary.json';

/**
 * The glossary route's vocabulary: Russian terms for the grammar a reader of
 * these articles meets in the panes — the tags behind the sentence pane's
 * words, the fields of an explanation, and the ordinary grammatical vocabulary
 * of a Russian text.
 *
 * Adapted from the English Wiktionary's Appendix:Glossary: every entry names
 * the English term it comes from, and its Russian definition is written for
 * Russian grammar — where a phenomenon does not exist in Russian, the entry
 * says so and names the nearest Russian one. See `SOURCE`.
 *
 * The `id` is ASCII and stable so the rest of the app can point at one entry
 * (`/glossary#accusative-case`) without depending on Russian spelling.
 */
export type GlossaryEntry = {
	/** The page's anchor for this entry: ASCII, unique, stable. */
	id: string;
	/** The Russian headword — how the entry is listed and sorted. */
	ru: string;
	/** The English term of the appendix this entry was adapted from. */
	en: string;
	/** The definition, in Russian. */
	def: string;
	/** Other Russian wordings of the same term. */
	aliases: string[];
	/** Russian headwords of the entries this one points at. */
	see: string[];
};

/** Where the vocabulary is adapted from, quoted by the page and its callers. */
export const SOURCE = {
	title: 'Appendix:Glossary',
	site: 'en.wiktionary.org',
	url: 'https://en.wiktionary.org/wiki/Appendix:Glossary'
};

const isEntry = (value: unknown): value is GlossaryEntry => {
	if (typeof value !== 'object' || value === null) return false;
	const entry: Record<string, unknown> = value as Record<string, unknown>;
	if (!['id', 'ru', 'en', 'def'].every((key) => typeof entry[key] === 'string')) return false;
	return ['aliases', 'see'].every(
		(key) => Array.isArray(entry[key]) && (entry[key] as unknown[]).every((t) => typeof t === 'string')
	);
};

/** A shape check, not a parse: the file is generated here, and this turns a bad
 *  regeneration into one clear error instead of a page of empty entries. */
const isEntries = (value: unknown): value is GlossaryEntry[] =>
	Array.isArray(value) && value.every(isEntry);

const shaped: unknown = raw;
if (!isEntries(shaped)) throw new Error('glossary.json: expected an array of glossary entries');

/** Every entry, in Russian alphabetical order. */
export const entries: GlossaryEntry[] = shaped.slice().sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));

/** One letter group of the page: its heading and the entries under it. */
export type LetterGroup = { letter: string; ids: string[] };

/**
 * The index's letters, in their own order: the Russian alphabet first, then the
 * Latin one — a handful of terms (pluralia tantum, sic, enPR) are Latin words or
 * notation that Russian linguistics uses as they are, and they are listed under
 * their own letter rather than in a bucket of odds and ends.
 */
const ALPHABET = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ';
const OTHER = 'Прочее';

const groups = new Map<string, string[]>();
for (const entry of entries) {
	const first = entry.ru.slice(0, 1).toUpperCase();
	const letter = ALPHABET.includes(first) ? first : OTHER;
	groups.set(letter, [...(groups.get(letter) ?? []), entry.id]);
}

/** The entries under each letter that has any, in alphabet order. */
export const letters: LetterGroup[] = [...groups]
	.map(([letter, ids]) => ({ letter, ids }))
	.sort((a, b) => {
		const at = ALPHABET.indexOf(a.letter);
		const bt = ALPHABET.indexOf(b.letter);
		return (at < 0 ? ALPHABET.length : at) - (bt < 0 ? ALPHABET.length : bt);
	});

/**
 * Matching ignores case, ё/е, and every non-letter character, so a reference
 * «винительный падеж» finds the entry however the text that pointed here
 * spelled it.
 */
const fold = (text: string): string =>
	text
		.toLowerCase()
		.replace(/ё/g, 'е')
		.replace(/[^a-zа-я0-9]+/g, ' ')
		.trim();

const byTerm = new Map<string, GlossaryEntry>();
for (const entry of entries) {
	// the English term too: a text may quote the appendix's own word
	for (const term of [entry.ru, ...entry.aliases, entry.en]) {
		const key = fold(term);
		if (key && !byTerm.has(key)) byTerm.set(key, entry);
	}
}

/** The entry a term names, or null — the page's own cross-references read this. */
export function findByTerm(term: string): GlossaryEntry | null {
	return byTerm.get(fold(term)) ?? null;
}
