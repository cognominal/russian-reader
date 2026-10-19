/**
 * The wire contract between the reader and `POST /read/[slug]/explain`.
 *
 * Both sides import this file, so a change here breaks the build on both ends at
 * once instead of drifting silently. The design it implements is in
 * `.scratch/word-explanation/spec.md` §4–§6.
 */

export type ExplainRequest = {
	paragraph: number
	tokenIndex: number
}

export type ExplainErrorCode =
	| 'bad-request'
	| 'not-found'
	| 'rate-limited'
	| 'not-configured'
	| 'prompt-invalid'
	| 'upstream-error'
	| 'timeout'

export type ExplainError = {
	error: ExplainErrorCode
	/** Russian, shown verbatim next to the word that was clicked. */
	message: string
	/** Seconds, on `rate-limited` only. */
	retryAfter?: number
}

export type ExplainAnswer = {
	/** The clicked form, as it appears in the text. */
	word: string
	lemma: string
	/** The clicked form's pymorphy3 tag string, or null when it has none. */
	grammar: string | null
	/** With `parsed: false` this holds the model's raw prose. */
	meaning: string
	etymology: string | null
	example: string | null
	etymologySource: 'wiktionary' | 'model'
	/** The cleaned ru.wiktionary «Этимология» the answer was given, shown verbatim. */
	sourceText: string | null
	/** The page `sourceText` came from, so the reader can check it themselves. */
	sourceUrl: string | null
	/** Served from the disk cache rather than from a model call. */
	cached: boolean
	/** False when the model answered prose instead of the requested JSON. */
	parsed: boolean
	/** Seconds until the next call is allowed; the window, on a fresh answer. */
	retryAfter: number
	elapsedMs: number
}

export const EXPLAIN_COOKIE = 'explain_last'

/** The courtesy throttle: one model call per browser per window (§5). */
export const EXPLAIN_WINDOW_MS = 120_000

export function explainUrl(slug: string): string {
	return `/read/${slug}/explain`
}
