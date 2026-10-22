# ru

A reading tool for Russian originals paired with their official English translations: one article at
a time, one sentence at a time.

## Language

**Article**:
A text the reader holds as a unit: a Russian original with its English side, its paragraphs paired, read
one sentence pair at a time. Most are kremlin.ru publications with their official translations; the
glossary is one too, with an English side built from the appendix it was adapted from.
_Avoid_: text, document, page, transcript (a transcript is one kind of article, not the word for one)

**Reader**:
The view where an article is read.
_Avoid_: viewer, page, screen

**Paragraph**:
A block of the article; the unit the two languages are matched by.
_Avoid_: block, section, chunk

**Sentence pair**:
A Russian sentence together with the English sentence or sentences that translate it — one, or several
when the English side merges or splits.
_Avoid_: match, pair row, couplet, alignment unit

**Merge**:
The English side folding several Russian sentences into one English sentence.

**Split**:
The English side spreading one Russian sentence over several English sentences.

**Alignment**:
The decision, made per paragraph, of which English sentences translate which Russian sentence.
_Avoid_: matching, pairing, correspondence

**Proper noun**:
A word that names a person, place or organisation. In the reader it is set in italic and is never
clickable, in either pane.
_Avoid_: name, proper name, capitalised word

**Rare lemma**:
A lemma among the rarest of an article by corpus frequency; proper nouns are never eligible.
_Avoid_: hard word, difficult word, unknown word

**Rare word**:
One occurrence, in the article, of a rare lemma.
_Avoid_: clickable word, highlighted word

**Dump**:
An archived page reduced to the parts an article is built from: title, date, paragraphs.
_Avoid_: scrape, extraction, raw page

## Reading view

**Menubar**:
The row above the panes: «Тексты», the menu of the other texts, and «Слова», the menu of the session's
explanations — greyed out and inert while the session has none — then «Словарь», the way to the
glossary of grammatical terms, and, at its far end, the link to the reader's source on GitHub.
_Avoid_: toolbar, navbar, top bar, header

**Article pane**:
The left column of the reader, holding the article. While an explanation is open it holds the
explanation pane instead; the article comes back, at the offset it was left at, when the explanation is
closed.
_Avoid_: first pane, pane 1, Russian pane, main pane

**Paragraph pane**:
The upper block of the reader's right column, holding the English translation of the current paragraph;
an explanation read as an origin takes it instead.
_Avoid_: second pane, pane 2, translation pane

**Sentence pane**:
The lower block of the reader's right column, holding only the current sentence pair. It is where a
word is clicked to ask what it means.
_Avoid_: third pane, pane 3, pair pane

**Explanation**:
A model-written answer about one word — what it means in this sentence, where it comes from, one
example — in simple Russian, shown in place of the article pane until it is closed.
_Avoid_: definition, gloss, translation, tooltip, note

**Explanation pane**:
The pane an explanation is read in: it overlays the article pane while the explanation is open, and the
paragraph pane as well when the explanation is there as an origin. An explanation never adds a pane — it
borrows the two that are already on screen, and they both come back when it is closed.
_Avoid_: overlay, popup, modal, answer pane, side pane

**Origin**:
The explanation a word of another explanation was clicked in, while the explanation of that word is being
read: it takes the paragraph pane, scrolled to the field the word sits in. A word taken out of an
explanation has nothing to do with the article's paragraph, so the explanation it came out of is its
context — the counterpart, for explanation panes, of the sentence pair an article word gets.
_Avoid_: source (that is the Wiktionary text), parent, previous answer, history entry

**Session**:
One reading session: the explanations asked since the page was loaded, which ← and → walk and the words
menu lists, and which an hour without a request ends.
_Avoid_: history (that is the code's name for the list), visit, run

**Prompt**:
The instruction file the explanation endpoint sends to the model as its only message — `prompts/word.md`,
in English, with `prompts/word.ru.md` as the same prompt in Russian — rendered with the article's own
facts in place of its `{{placeholders}}`; the answer it asks for is Russian either way.
_Avoid_: template (it is plain text with plain substitutions), system message (there is none), instruction
tuning

**Glossary** (Словарь):
The reader's own dictionary of grammatical terms — 602 entries, translated and adapted from the English
Wiktionary's `Appendix:Glossary` (CC BY-SA). It is an article: read at `/read/glossary`, one entry per
paragraph, its English side in the paragraph pane; the menubar's «Словарь» opens it, and the grammar
chip's popup links the codes it can into it.
_Avoid_: dictionary (that is what the model writes for a word), word list, `GLOSSARY.md` (that is this
file)
