/**
 * The pure half of `POST /read/[slug]/explain`: prompt derivation, hashing,
 * answer parsing, the Wiktionary section cleaner and the cookie arithmetic.
 *
 * Kept out of the route module because SvelteKit rejects unknown exports from
 * `+server.ts`, and because these are the parts worth exercising without a
 * server (see `.scratch/word-explanation/spec.md` §4–§7.1).
 */

import { createHash } from 'node:crypto'
import type { Article, Paragraph, RareLemma, RuToken } from './article'
import { enRangeFor, formatDate, sentenceAt } from './article'
import { EXPLAIN_LIMIT, EXPLAIN_WINDOW_MS } from './explain'

export const NO_DATA = 'нет данных'

const KNOWN_PLACEHOLDERS: Record<string, true> = {
	word: true,
	lemma: true,
	grammar: true,
	forms: true,
	sentence: true,
	translation: true,
	etymology_source: true,
	title: true,
	date: true,
	zipf: true,
	rank: true
}

export type PromptContext = {
	word: string
	lemma: string
	grammar: string
	forms: string
	sentence: string
	translation: string
	title: string
	date: string
	zipf: string
	rank: string
	/** Null for a pane word: it belongs to no sentence of the article (Q20). */
	sentenceIndex: number | null
	ruSentence: string
	/** Null for a pane word, which arrives without a lemma, a tag or a token. */
	token: RuToken | null
	rare: RareLemma | null
}

export type ContextResult =
	| { ok: true; context: PromptContext }
	| { ok: false; reason: 'paragraph' | 'token' | 'sentence' }

/** Everything the prompt needs, re-derived from the article JSON. */
export function promptContext(
	article: Article,
	paragraphIndex: number,
	tokenIndex: number
): ContextResult {
	const paragraph = article.paragraphs.find((p) => p.i === paragraphIndex)
	if (!paragraph) return { ok: false, reason: 'paragraph' }

	const token = paragraph.ruTokens[tokenIndex]
	if (!token) return { ok: false, reason: 'token' }

	let si = sentenceAt(paragraph.ruSentences, token.start)
	if (si === null) si = sentenceAt(paragraph.ruSentences, Math.max(token.start, token.end - 1))
	if (si === null) return { ok: false, reason: 'sentence' }

	const sentence = paragraph.ruSentences.find((s) => s.i === si)
	if (!sentence) return { ok: false, reason: 'sentence' }

	const rare = article.rare.find((r) => r.lemma === token.lemma) ?? null

	return {
		ok: true,
		context: {
			word: token.form,
			lemma: token.lemma,
			grammar: token.grammar ?? (rare ? rare.grammar : NO_DATA),
			forms: rare && rare.forms.length > 0 ? rare.forms.join(', ') : NO_DATA,
			sentence: paragraph.ru.slice(sentence.start, sentence.end).trim(),
			translation: englishFor(paragraph, si).trim(),
			title: article.title.ru,
			date: formatDate(article.date) ?? NO_DATA,
			zipf: rare ? String(rare.freq) : NO_DATA,
			rank: rare ? String(rare.rank) : NO_DATA,
			sentenceIndex: si,
			ruSentence: paragraph.ru.slice(sentence.start, sentence.end).trim(),
			token,
			rare
		}
	}
}

/**
 * Everything the prompt needs for a word that is not in the article: one clicked
 * in the explanation pane's own prose (Q20). Only the word, the sentence it sits
 * in, the title and the date are known; the lemma, the tag, the forms, the
 * official translation and the rarity figures are all «нет данных», which is what
 * the prompt is written to accept — it asks the model for the initial form when
 * the word is an inflected one.
 */
export function paneContext(article: Article, word: string, sentence: string): PromptContext {
	return {
		word,
		lemma: NO_DATA,
		grammar: NO_DATA,
		forms: NO_DATA,
		sentence,
		translation: NO_DATA,
		title: article.title.ru,
		date: formatDate(article.date) ?? NO_DATA,
		zipf: NO_DATA,
		rank: NO_DATA,
		sentenceIndex: null,
		ruSentence: sentence,
		token: null,
		rare: null
	}
}

/** The same range rule as `enRangeFor`: the paired sentences, or the paragraph. */
function englishFor(paragraph: Paragraph, ruSentence: number): string {
	const range = enRangeFor(paragraph, ruSentence)
	if (range === null) return paragraph.en
	const first = paragraph.enSentences.find((s) => s.i === range.start)
	const last = paragraph.enSentences.find((s) => s.i === range.end)
	if (!first || !last) return paragraph.en
	return paragraph.en.slice(first.start, last.end)
}

export function promptValues(
	context: PromptContext,
	etymologySource: string
): Record<string, string> {
	return {
		word: context.word,
		lemma: context.lemma,
		grammar: context.grammar,
		forms: context.forms,
		sentence: context.sentence,
		translation: context.translation,
		etymology_source: etymologySource,
		title: context.title,
		date: context.date,
		zipf: context.zipf,
		rank: context.rank
	}
}

/** Names in `{{…}}` form that the server does not fill. */
export function unknownPlaceholders(template: string): string[] {
	const found = [...template.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1].trim())
	return [...new Set(found.filter((name) => KNOWN_PLACEHOLDERS[name] !== true))]
}

export function renderPrompt(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([^{}]+)\}\}/g, (whole, name: string) => {
		const key = name.trim()
		return key in values ? values[key] : whole
	})
}

/** `sha1(prompt + "\n--\n" + model|temperature|max_tokens)`, hex (§6). */
export function promptHash(
	prompt: string,
	model: string,
	temperature: number,
	maxTokens: number
): string {
	return createHash('sha1')
		.update(prompt)
		.update('\n--\n')
		.update(`${model}|${temperature}|${maxTokens}`)
		.digest('hex')
}

export type ParsedAnswer = {
	parsed: boolean
	meaning: string
	etymology: string | null
	example: string | null
}

/** JSON if it is there, the raw text as `meaning` otherwise (§4). */
export function parseModelAnswer(raw: string): ParsedAnswer {
	const cleaned = stripCodeFences(raw)
	try {
		const value: unknown = JSON.parse(cleaned)
		if (typeof value === 'object' && value !== null) {
			const answer = value as Record<string, unknown>
			const meaning = answer.meaning
			if (typeof meaning === 'string' && meaning.trim() !== '') {
				return {
					parsed: true,
					meaning,
					etymology: typeof answer.etymology === 'string' ? answer.etymology : null,
					example: typeof answer.example === 'string' ? answer.example : null
				}
			}
		}
	} catch {
		// Not JSON: fall through to the prose answer.
	}
	return { parsed: false, meaning: raw.trim(), etymology: null, example: null }
}

function stripCodeFences(raw: string): string {
	const text = raw.trim()
	const fenced = /^```[^\n]*\n([\s\S]*?)\n```\s*$/.exec(text)
	return fenced ? fenced[1].trim() : text
}

const STUB_ETYMOLOGIES = ['Происходит от ??', 'От ??', 'Происходит от']

/** Stubs and anything too short to be an etymology (§7.1). */
export function isEtymologyStub(text: string): boolean {
	const trimmed = text.trim()
	if (STUB_ETYMOLOGIES.includes(trimmed.replace(/[.\s]+$/, ''))) return true
	return trimmed.length < 80
}

/**
 * The HTML of the `Этимология` section, up to the next heading of the same or a
 * higher level. Returns `null` when the page has no such section.
 */
export function extractEtymologySection(html: string): string | null {
	const headings: { level: number; start: number; end: number; text: string }[] = []
	const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi
	let match: RegExpExecArray | null
	while ((match = re.exec(html)) !== null) {
		headings.push({
			level: Number(match[1]),
			start: match.index,
			end: re.lastIndex,
			text: decodeEntities(match[2].replace(/<[^>]+>/g, ' '))
				.replace(/\[\s*(править|edit)\s*\]/gi, ' ')
				.replace(/\s+/g, ' ')
				.trim()
		})
	}

	const heading = headings.find((h) => h.text === 'Этимология')
	if (!heading) return null

	const next = headings.find((h) => h.start >= heading.end && h.level <= heading.level)
	return html.slice(heading.end, next ? next.start : html.length)
}

/**
 * Strip the inline CSS Wikimedia embeds, all tags, entities and runs of
 * whitespace; cap at 1200 characters. `null` when the result is a stub.
 */
export function cleanEtymology(fragment: string): string | null {
	const text = fragment
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
		// Block boundaries become spaces; inline tags (and their style attributes) vanish.
		.replace(/<\/(p|div|li|dd|dt|h[1-6]|tr)>/gi, ' ')
		.replace(/<br\s*\/?>/gi, ' ')
		.replace(/<[^>]+>/g, '')
	const decoded = decodeEntities(text)
		.replace(/\[\s*(править|edit)\s*\]/gi, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	if (decoded === '') return null
	const capped = decoded.slice(0, 1200)
	return isEtymologyStub(capped) ? null : capped
}

/** Whole page HTML from `action=parse` → the cleaned etymology, or `null`. */
export function etymologyFromPage(html: string): string | null {
	const section = extractEtymologySection(html)
	return section === null ? null : cleanEtymology(section)
}

function decodeEntities(text: string): string {
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
		.replace(/&nbsp;/gi, ' ')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&quot;/gi, '"')
		.replace(/&apos;|&#39;/gi, "'")
		.replace(/&amp;/gi, '&')
}

/** The unix ms in a cookie value: `-`-separated, oldest first, junk dropped (§5). */
export function parseCalls(value: string | null): number[] {
	if (value === null) return []
	const calls = value
		.split('-')
		.map((part) => Number(part))
		.filter((at) => Number.isFinite(at) && at > 0)
	calls.sort((a, b) => a - b)
	// A hand-made cookie cannot carry an unbounded list: only the newest can count.
	return calls.slice(-EXPLAIN_LIMIT)
}

/** The calls still inside the window, oldest first. */
export function activeCalls(calls: number[], now: number): number[] {
	return calls.filter((at) => at > now - EXPLAIN_WINDOW_MS)
}

export type LimitDecision = { limited: false } | { limited: true; retryAfter: number }

/**
 * Whether one more call fits in the budget. The wait is until the oldest call in
 * the window ages out, which is the moment a slot frees.
 */
export function limitDecision(active: number[], now: number): LimitDecision {
	if (active.length < EXPLAIN_LIMIT) return { limited: false }
	const oldest = active[0] ?? now
	return { limited: true, retryAfter: Math.ceil((oldest + EXPLAIN_WINDOW_MS - now) / 1000) }
}
