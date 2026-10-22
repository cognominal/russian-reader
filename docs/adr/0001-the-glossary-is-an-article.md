# The grammar glossary is an article, read at `/read/glossary`

The glossary of grammatical terms — 602 entries adapted from the English Wiktionary's
`Appendix:Glossary` — is one article with one paragraph per entry, read in the reader at
`/read/glossary`, rather than a page of its own at `/glossary`. The reader already holds what a
glossary needs: an article pane for the text, a paragraph pane for its English side, a sentence pane
that makes every word explainable, Tab stepping, and a saved scroll offset; a grammar term is one of
the things a reader looks up mid-sentence, and it was the one thing the reader could not open. The
old route redirects to the article, the menubar's «Словарь» opens it, and the paragraph carries the
entry's ASCII `id` as its anchor so `/read/glossary#accusative-case` lands on the entry — the link
the grammar chip's popup had promised and never had.

The decision's second half is about the English side, which is the one place this article differs
from every other one. Where the Russian entry is a translation of the appendix's entry, the
appendix's own text is the English side, verbatim: it is a primary source, and 389 of the 602
entries have one. Where the Russian entry states something about Russian that the appendix does not
— that Russian has no such case, that a Russian form carries the meaning, that a Russian textbook
marks stress this way — the missing material is written in English, once, and committed beside the
entry, so that the pair says the same thing on both sides. No model is called: not at read time, and
not in the pipeline, which imports only `pymorphy3` and `wordfreq`.

## Considered Options

- **602 articles, one per term.** Rejected: the glossary's 1,011 «см. также» references are same-page
  anchors today, and every one of them would become cross-article navigation; the letter index would
  become a 602-row menu; and «Тексты» would turn into an index of one-definition texts.
- **A model translating the entries at read time.** Rejected: the reader would wait on a model for its
  first paint, and a model's output is not reviewable as data — a wrong pairing is exactly the failure
  the paragraph pane cannot recover from. The app's only model call stays the deliberate, bounded,
  cached explanation endpoint.
- **Reusing the appendix's text for the diverging entries.** Rejected: the pair would not say the same
  thing, which is the whole point of the paragraph pane.
- **A publication date.** Rejected both a synthetic one (the pipeline would assert a fact nobody knows)
  and the adaptation date (it is not a publication date, and it would sort the glossary to the top of
  every date-ordered surface forever). The article's `date` became optional instead, and the reader
  renders no date at all.
- **Listing the glossary in «Тексты».** Rejected: «Тексты» means the kremlin.ru publications, and
  «Словарь» is the glossary's own door. A dateless article has no place in a list ordered by date, in
  the pipeline and in the reader's fallback alike.
- **Keeping `/glossary` beside the article.** Rejected: one glossary in the codebase, not two. The page,
  its renderer and the letter-index half of its data layer are deleted.

## Consequences

- The article's `date`, `paragraph.anchor` and `source.note` are optional in the content contract, and
  the pipeline reads a dump that declares `# date: none` as an article with no date line. The
  declaration is explicit on purpose: inferring the shape from a missing date line would turn a broken
  kremlin.ru dump into a dateless article instead of an error.
- The glossary is the longest article the reader holds — 602 paragraphs, several megabytes of JSON —
  and it is one scroll rather than 602 pages.
- The appendix is fetched at build time and never committed, the same treatment the kremlin.ru pages
  get: only the dumps it produced are in the repository.
- The English side of an entry is sometimes a primary source and sometimes written for the occasion, and
  the article says so once, in its header's CC BY-SA note, rather than entry by entry.
- The authored entries moved out of the app's source into the pipeline's input, because nothing in the
  app imports them any more.

The spec this came from is `.scratch/glossary-as-article/spec.md`, with its measurements and its
rejected alternatives in full.
