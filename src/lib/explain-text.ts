/**
 * The explanation pane's own prose, as clickable words.
 *
 * The pane's text is the model's Russian, so there are no token offsets to reuse:
 * it is tokenised here with the word rule the pipeline uses for the articles
 * (`[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*`) and the sentence rule it splits on (`[.!?…]`,
 * an optional closing quote, whitespace). Each word carries the sentence it sits
 * in, because that sentence is the whole context the click can send: a pane word
 * has no lemma and no tag for the endpoint to derive (Q20).
 */

/** The three fields of an answer, in the order the pane shows them. */
export type PaneField = 'meaning' | 'etymology' | 'example'

/** One slice of the prose: a word control, or the punctuation and spaces between them. */
export type PaneRun = {
	text: string
	/** For a word: the sentence it sits in, trimmed. Empty for everything else. */
	sentence: string
}

const WORD = /[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g
const SENTENCE_END = /[.!?…]+[»"”“]?\s+/g

/** Character spans of the sentences, in order. The last one always reaches the end. */
function sentenceSpans(text: string): [number, number][] {
	const spans: [number, number][] = []
	let start = 0
	SENTENCE_END.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = SENTENCE_END.exec(text)) !== null) {
		spans.push([start, match.index + match[0].length])
		start = match.index + match[0].length
	}
	spans.push([start, text.length])
	return spans
}

/** The prose in runs: every Cyrillic word becomes a control, the rest stays text. */
export function paneRuns(text: string): PaneRun[] {
	const spans = sentenceSpans(text)
	const runs: PaneRun[] = []
	let at = 0
	WORD.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = WORD.exec(text)) !== null) {
		const index = match.index
		if (index > at) runs.push({ text: text.slice(at, index), sentence: '' })
		const span = spans.find(([start, end]) => index >= start && index < end)
		runs.push({
			text: match[0],
			sentence: span === undefined ? text.trim() : text.slice(span[0], span[1]).trim()
		})
		at = index + match[0].length
	}
	if (at < text.length) runs.push({ text: text.slice(at), sentence: '' })
	return runs
}
