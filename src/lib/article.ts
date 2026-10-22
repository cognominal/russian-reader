import type { PaneField } from './explain-text';

/**
 * Types and render helpers for the frozen article JSON contract
 * (`src/lib/content/<slug>.json`, produced by the offline pipeline).
 *
 * All offsets are character offsets into the sibling `ru` / `en` string,
 * `end` exclusive. The Russian pane never re-tokenizes: it slices the string
 * with the offsets from `ruTokens`.
 */

export interface ArticleTitle {
	ru: string;
	en: string;
}

export interface ArticleSource {
	ru: string;
	en: string;
	/**
	 * One line of provenance the header renders after the links, e.g. the licence
	 * the English side is adapted under. Absent on the kremlin.ru articles, whose
	 * provenance is the two links themselves.
	 */
	note?: string;
}

export interface ArticleStats {
	paragraphs: number;
	ruSentences: number;
	enSentences: number;
	ruTokens: number;
	rareLemmas: number;
}

export interface Sentence {
	i: number;
	start: number;
	end: number;
}

export interface RuToken {
	start: number;
	end: number;
	form: string;
	lemma: string;
	/**
	 * This form's pymorphy3 tag string, e.g. `VERB,perf,intr past,femn,sing,indc`.
	 * Optional because JSON written before the field lacks it.
	 */
	grammar?: string;
	rare: boolean;
	/**
	 * A name: rendered italic and never clickable, in either pane. Computed by the
	 * pipeline, so the components do no morphology. JSON written before the flag
	 * existed lacks it, and a missing flag means `false`.
	 */
	proper?: boolean;
}

/**
 * `[russian sentence index, english sentence indices]`. The English side is a
 * contiguous run: empty when the Russian sentence has no counterpart, and more
 * than one index when the translation splits a sentence the Russian ran on from.
 */
export type SentencePair = [ru: number, en: number[]];

export interface Paragraph {
	i: number;
	/**
	 * A stable ASCII id, unique within the article, that becomes the paragraph's
	 * DOM id: `/read/<slug>#<anchor>` lands on the paragraph. Absent on articles,
	 * whose paragraphs are not separately addressable.
	 */
	anchor?: string;
	aligned: boolean;
	ru: string;
	en: string;
	ruSentences: Sentence[];
	enSentences: Sentence[];
	pairs: SentencePair[];
	ruTokens: RuToken[];
}

export interface RareLemma {
	lemma: string;
	freq: number;
	rank: number;
	count: number;
	grammar: string;
	paragraphs: number[];
	forms: string[];
}

export interface Article {
	slug: string;
	title: ArticleTitle;
	/**
	 * The publication date, when the article has one. An article that was never
	 * published — the glossary — has none, and the reader renders no date rather
	 * than inventing one.
	 */
	date?: string;
	source: ArticleSource;
	stats: ArticleStats;
	paragraphs: Paragraph[];
	rare: RareLemma[];
}

export interface CatalogEntry {
	slug: string;
	title: ArticleTitle;
	date: string;
}

/**
 * What the reader picked: `sentence` indexes `ruSentences`. `tokenIndex` indexes
 * `ruTokens` when a single word was picked — the article text itself is plain
 * text, so a word is picked in the sentence pane — and is `null` when only the
 * sentence was chosen (clicking a sentence, or stepping with Tab).
 */
export interface Selection {
	paragraph: number;
	tokenIndex: number | null;
	sentence: number | null;
}

/**
 * The word an explanation belongs to. Two origins, because a word can be asked
 * about in two places: the article's sentence pane, and the explanation pane's own
 * prose (Q20). It outlives the selection — Tab moves the selection without closing
 * the answer — so the explanation pane compares the two to decide whether its
 * answer is still about what is on screen.
 */
export type OpenWord = ArticleWord | PaneWord;

/**
 * A word of the article: the paragraph and sentence it was clicked in, and its
 * index in `ruTokens`. The index is what marks the control in the sentence pane.
 */
export interface ArticleWord {
	source: 'article';
	paragraph: number;
	sentence: number;
	tokenIndex: number;
}

/**
 * A word of the explanation pane's prose: the form, and which of the three fields
 * it was clicked in — that pair is what marks it there. There is no lemma, no
 * paragraph and no index to carry, because the endpoint is given the sentence
 * instead (Q20).
 */
export interface PaneWord {
	source: 'pane';
	form: string;
	field: PaneField;
}

/** A slice of a paragraph string that is uniform in both token and sentence membership. */
export interface Run {
	text: string;
	rare: boolean;
	/** A name, so the panes can set it italic and leave it out of the word controls. */
	proper: boolean;
	tokenIndex: number | null;
	sentence: number | null;
}

export interface SentenceRun {
	text: string;
	sentence: number | null;
}

/** The sentence whose character span contains `pos`, or `null`. */
export function sentenceAt(sentences: Sentence[], pos: number): number | null {
	for (const s of sentences) {
		if (pos >= s.start && pos < s.end) return s.i;
	}
	return null;
}

/**
 * The English sentences paired with a Russian sentence, as an inclusive range of
 * `enSentences` indices. Returns `null` when the Russian sentence has no row in
 * `pairs` or its row is empty — either way the whole English paragraph is the
 * answer. `Paragraph.aligned` (equal sentence counts) is informational only: the
 * translation merges and splits sentences, so counts differ while every pair
 * stays correct. The range is contiguous because the alignment is monotone.
 */
export function enRangeFor(
	p: Paragraph,
	ruSentence: number | null
): { start: number; end: number } | null {
	if (ruSentence === null) return null;
	const pair = p.pairs.find(([ru]) => ru === ruSentence);
	if (!pair || pair[1].length === 0) return null;
	return { start: pair[1][0], end: pair[1][pair[1].length - 1] };
}

/** A sentence addressed by paragraph and index, in reading order. */
export interface SentenceRef {
	paragraph: number;
	sentence: number;
}

/** Every Russian sentence of the article, in reading order: the Tab stepping order. */
export function sentenceIndex(article: Article): SentenceRef[] {
	const refs: SentenceRef[] = [];
	for (const p of article.paragraphs) {
		for (const s of p.ruSentences) refs.push({ paragraph: p.i, sentence: s.i });
	}
	return refs;
}

/** Consecutive runs of one paragraph, grouped under the sentence they belong to. */
export interface SentenceGroup {
	sentence: number | null;
	runs: Run[];
}

export function sentenceGroups(runs: Run[]): SentenceGroup[] {
	const groups: SentenceGroup[] = [];
	for (const run of runs) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.sentence === run.sentence) last.runs.push(run);
		else groups.push({ sentence: run.sentence, runs: [run] });
	}
	return groups;
}

/**
 * Build the render runs for a Russian paragraph: exact character slices, gaps
 * between tokens split at sentence boundaries so sentence tinting stays exact.
 */
export function ruRuns(p: Paragraph): Run[] {
	const runs: Run[] = [];

	const pushGap = (from: number, to: number) => {
		if (to <= from) return;
		const cuts = p.ruSentences
			.map((s) => s.start)
			.filter((x) => x > from && x < to)
			.sort((a, b) => a - b);
		let at = from;
		for (const cut of cuts) {
			runs.push({ text: p.ru.slice(at, cut), rare: false, proper: false, tokenIndex: null, sentence: sentenceAt(p.ruSentences, at) });
			at = cut;
		}
		runs.push({ text: p.ru.slice(at, to), rare: false, proper: false, tokenIndex: null, sentence: sentenceAt(p.ruSentences, at) });
	};

	let cursor = 0;
	for (let k = 0; k < p.ruTokens.length; k++) {
		const t = p.ruTokens[k];
		const start = Math.max(t.start, cursor);
		const end = Math.max(t.end, start);
		pushGap(cursor, start);
		if (end > start) {
			runs.push({ text: p.ru.slice(start, end), rare: t.rare, proper: t.proper ?? false, tokenIndex: k, sentence: sentenceAt(p.ruSentences, start) });
		}
		cursor = end;
	}
	pushGap(cursor, p.ru.length);
	return runs;
}

/** Slice a translated string into per-sentence runs, keeping the text verbatim. */
export function sentenceRuns(text: string, sentences: Sentence[]): SentenceRun[] {
	const runs: SentenceRun[] = [];
	let cursor = 0;
	for (const s of sentences) {
		const start = Math.max(s.start, cursor);
		const end = Math.max(s.end, start);
		if (start > cursor) runs.push({ text: text.slice(cursor, start), sentence: null });
		if (end > start) runs.push({ text: text.slice(start, end), sentence: s.i });
		cursor = end;
	}
	if (cursor < text.length) runs.push({ text: text.slice(cursor), sentence: null });
	return runs;
}

const RU_MONTHS = [
	'января',
	'февраля',
	'марта',
	'апреля',
	'мая',
	'июня',
	'июля',
	'августа',
	'сентября',
	'октября',
	'ноября',
	'декабря'
];

/**
 * Deterministic (UTC, no ICU) Russian date: `12 июля 2021`. An article with no
 * date has nothing to render, so the answer is `null` and the header leaves the
 * element out instead of printing an empty one.
 */
export function formatDate(iso: string | undefined): string | null {
	if (iso === undefined) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * The label a source link wears: the URL's own host, without a leading `www.`,
 * so a link to another site cannot read «kremlin.ru». A value that is not a URL
 * is shown as it stands — the source line of a dump is free text.
 */
export function sourceHost(url: string): string {
	try {
		return new URL(url).host.replace(/^www\./, '');
	} catch {
		return url;
	}
}
