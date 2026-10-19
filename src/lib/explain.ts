/**
 * The wire contract between the reader and `POST /read/[slug]/explain`.
 *
 * Both sides import this file, so a change here breaks the build on both ends at
 * once instead of drifting silently. The design it implements is in
 * `.scratch/word-explanation/spec.md` §4–§6.
 */

/**
 * A word can be asked about in two places, and the two carry different evidence:
 * a word of the article comes with its paragraph and its index, from which the
 * endpoint re-derives the lemma, the tag and the official translation of its
 * sentence; a word of the explanation pane's own prose comes with the sentence it
 * sits in and nothing else, because the app has no morphology at runtime (Q20).
 */
export type ExplainRequest =
	| { source: 'article'; paragraph: number; tokenIndex: number }
	| { source: 'pane'; word: string; sentence: string }

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
	/** The dictionary form — null for a word of the pane's own prose, whose lemma nobody knows. */
	lemma: string | null
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

/**
 * The budget's cookie: the unix milliseconds of the calls inside the window,
 * `-`-separated and oldest first (§5). The reader's browser is the only place the
 * count lives, which is what keeps the endpoint stateless.
 */
export const EXPLAIN_COOKIE = 'explain_calls'

/** The budget: this many model calls per browser per hour (§5). */
export const EXPLAIN_LIMIT = 20

/** The budget's window, and the lifetime of the cookie that counts it (§5). */
export const EXPLAIN_WINDOW_MS = 3_600_000

/**
 * The reading session: the endpoint refreshes this on every ask, and the page
 * reads it to decide whether the panels it remembers are still this session's
 * (Q20). Readable by the page on purpose — it holds a timestamp, not a secret.
 */
export const EXPLAIN_SESSION_COOKIE = 'explain_session'

/** An hour without asking ends the session (§5). */
export const EXPLAIN_SESSION_MS = 3_600_000

export function explainUrl(slug: string): string {
	return `/read/${slug}/explain`
}
