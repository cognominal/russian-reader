# Spec: the glossary as an article

Status: ready-for-agent
Date: 2026-10-22
Feature slug: `glossary-as-article`
Decided by grilling, 2026-10-22. Supersedes the `/glossary` half of the word-explanation spec's Q27
(§10 anchor rule, §12 item 36) and answers its deferred half — the link from the explanation pane's
grammar chip.

## Problem Statement

The glossary is a second kind of thing in an app that already knows how to read a document. It has its
own route, its own renderer, its own letter navigation and its own anchor scheme, and the only way to
reach a grammar term is to leave the reader: the article you were reading is replaced by a page that
knows nothing about the sentence you were on, and coming back means the browser's own back button.

The reader, meanwhile, already holds everything a glossary needs — an article pane for the text, a
paragraph pane for its English side, a sentence pane that makes every word of a sentence clickable and
explainable, Tab stepping, a saved scroll offset. A grammar term is one of the things a reader of these
articles looks up mid-sentence, and it is the one thing the reader cannot open.

## Solution

The glossary becomes one article, read at `/read/glossary` with the same treatment as a kremlin.ru text:
its 602 entries are the document's 602 paragraphs, each entry has an English side in the paragraph pane,
every word of an entry is clickable in the sentence pane and gets the same explanation any article word
gets, and Tab walks the document like any other.

The English side is the English Wiktionary's own text wherever the Russian entry is a translation of it,
and English written for the entry wherever the Russian says something the appendix does not — the
paragraph pane must say what the Russian paragraph says, or the pair is lying.

`/glossary` redirects to the article. The menubar's «Словарь» links to it. The grammar chip's popup,
which has promised a link into the glossary since Q27 and never had one, gets its link.

## User Stories

1. As a reader, I want to open the glossary without leaving the reader, so that I can look up a
   grammatical term and come back to my sentence.
2. As a reader, I want «Словарь» in the menubar to open the glossary in the reader, so that the door I
   already use is the door to the new place.
3. As a reader, I want an old `/glossary` link or bookmark to take me to the article, so that nothing I
   saved stops working.
4. As a reader, I want the glossary to look like an article — title, panes, the same chrome — so that
   there is one thing to learn instead of two.
5. As a reader, I want each entry to be its own paragraph, so that clicking a sentence of an entry shows
   that entry's English beside it.
6. As a reader, I want to click any word of an entry and have it explained exactly as a word of an
   article is, so that the glossary's own vocabulary can be looked up from inside the glossary.
7. As a reader, I want to step through the glossary with Tab and Shift+Tab like any article, so that the
   reading keys do not change when the document does.
8. As a reader, I want the English side of an entry to say what the Russian entry says — including where
   the entry notes that a phenomenon does not exist in Russian — so that I can trust the pair.
9. As a reader, I want to know when the English side is the Wiktionary's own text, so that I can weigh a
   primary source differently from an adaptation.
10. As a reader, I want `/read/glossary#accusative-case` to land on the entry, so that a link to one term
    goes to that term and not to the top of a 602-entry document.
11. As a reader, I want the grammar chip's popup codes to link to the entry that explains them, so that
    "plur" or "gent" is one click from what it means.
12. As a reader, I want the entry's other wordings («аккузатив») to be visible with the headword, so that
    I can find the entry under either name.
13. As a reader, I want «см. также» to be readable in the entry, so that I can see which related terms
    the entry points at.
14. As a reader, I want the document to say where it comes from and under which licence, so that the
    adaptation is attributed where I read it and not only in a file.
15. As a reader, I want the glossary not to appear among the texts in «Тексты», so that the menu keeps
    meaning the kremlin.ru articles.
16. As a reader, I want the glossary's header not to claim a publication date, so that the app does not
    invent a fact about it.
17. As a reader, I want the source links in the header to be labelled with the site they lead to, so that
    a Wiktionary link does not read «kremlin.ru».
18. As a reader, I want the 602 entries to keep their order (Russian alphabetical) and their stability, so
    that an anchor I learned still points at the same term.
19. As a reader of the article I was reading before, I want the glossary to be a document I navigate to
    and from, so that the session's explanations, the words menu and the panes behave as they do
    everywhere else.
20. As a maintainer, I want the glossary's text to come out of the same pipeline as every other document,
    so that there is one content contract and not two.
21. As a maintainer, I want the glossary's two sides to be built once and committed, so that the reader
    never waits on a model and the pipeline stays offline.
22. As a maintainer, I want the join between a Russian entry and its English source to be explicit data,
    so that a wrong pairing is a diff I can read rather than a fuzzy match I cannot.
23. As a maintainer, I want the 12 English labels that do not match the appendix's own headwords fixed, so
    that the join is mechanical and the labels are not wrong in the UI.
24. As a maintainer, I want a check that every grammeme the chip can link points at an entry that exists,
    so that regenerating the glossary cannot silently break the popup.
25. As a maintainer, I want the old glossary page, its renderer and its data layer deleted, so that there
    is one glossary in the codebase and not two.
26. As a maintainer, I want the reader's panes untouched apart from the widenings this needs, so that the
    article path keeps the behaviour the word-explanation spec measured.
27. As a maintainer, I want the pipeline to accept a document with no publication date, so that a
    dateless document is a supported shape rather than a fake date line.
28. As a maintainer, I want the README, `NOTICE` and `GLOSSARY.md` to describe the glossary where it now
    lives, so that the next reader of the repo finds one story.

## Implementation Decisions

### The document

- **One article, slug `glossary`, 602 paragraphs — one per entry.** Rejected: 602 articles, one per term.
  The glossary's own structure decides it: 1,011 «см. также» references, 845 of which resolve to an entry
  (844 links after dedup by target), are same-page anchors today, and every one of them would become a
  cross-document navigation; the letter index would become a 602-row menu; and «Тексты» would turn into an
  index of one-definition texts. Size is not the objection it looks like: 602 paragraphs and ≈122,897
  characters of Russian against the largest existing article's 135 paragraphs and 50,655 characters — long,
  and the built JSON will be several megabytes rather than the 318.9 KB of the authored entries (the
  largest existing article's JSON is 1.65 MB for 7,254 tokens; this document carries roughly 2.4× that
  text), but it is one committed file and one scroll.
- **Paragraph = entry, rendered as prose.** The paragraph's Russian text is the headword with its aliases
  in parentheses, then the definition, then «См. также: …» naming the referenced headwords. Rejected:
  carrying `aliases`/`see` as fields and rendering them structurally — that is a second rendering path in
  the panes, which is exactly what "the same treatment" is meant to avoid.
- **Each paragraph carries the entry's stable ASCII `id` as its anchor.** `/read/glossary#accusative-case`
  lands on the entry, and the chip popup's link target finally exists. This is the one schema change to the
  paragraph:

  ```
  interface Paragraph {
    i: number;
    anchor?: string;   // ASCII id, unique within the document; absent on articles
    …
  }
  ```

  Rejected: flattening without anchors (loses the link Q27 promised and the only way to reach one term in
  a 602-entry document); live `see` links (a link-rendering path inside the article text, for refs that
  read fine as text).
- **No publication date.** The `date` field becomes optional in the article contract, the glossary omits
  it, and the reader renders no date rather than an invented one. Rejected: a synthetic date (the
  pipeline would be asserting a fact nobody knows); the adaptation date (it would sort the glossary to the
  top of any date-ordered surface forever, and it is not a publication date).
- **Not in the catalog.** The glossary is not a kremlin.ru text, and «Тексты» means those; «Словарь» is its
  door. The catalog fallback that scans content files when no catalog exists skips documents without a
  date, because the catalog is ordered by date and a dateless document has no place in that order.
- **Header provenance.** The source links' labels are derived from the URLs' hosts, so the glossary's
  header reads `en.wiktionary.org` where an article's reads `kremlin.ru`/`en.kremlin.ru`. The article
  contract gains an optional `source.note` — one line of text the header renders after the links — and the
  glossary's note is the attribution it carries today on `/glossary`: adapted from the English Wiktionary's
  `Appendix:Glossary`, CC BY-SA. Rejected: hardcoded kremlin labels (wrong for every other source);
  dropping the visible attribution (the page states it today; `NOTICE` alone is a weaker attribution).

### The English side

- **Three cases, decided per entry, recorded as data:**
  1. the Russian entry is a translation of the appendix's entry → the appendix's text is the English side,
     verbatim;
  2. the Russian entry says something the appendix does not → the appendix's text with the Russian-specific
     material written in, authored once and committed beside the entry;
  3. the appendix has no entry for it → the English side is authored whole.
- **Measured before writing this spec**, so the size of each case is known: 601 unique `en` labels against
  the appendix's 622 terms and 607 anchors — **589 match verbatim**; **11 resolve to a real appendix entry
  under a different displayed term** (the label took the Wikipedia-link title or an anchor instead of the
  headword: `telicity`→**telic**, `word sense`→**sense**, `Naming taboo avoidance term`→**avoidance term**,
  `yes/no question`→**yes-no question**, `use–mention distinction`→**mention**, `Morphology
  morphological`→**morphological**, `Transitivity transitive verb`→**transitive verb**, `women's
  speech`→anchor `womens speech`, `CJK`→**CJKV**, `ʾIʿrab ʾiʿrāb`→**ʾiʿrāb**, `men's speech`→anchor
  `men’s speech`); and **one has no English term at all** — `tashif`, whose appendix entry is headworded
  in Arabic (`{{anchor|tashif}} {{m|ar|صحف|تَصْحِيف}}`).
- **The `en` field is the join key**, and the 11 mismatched labels are corrected in the authored data as
  part of this work. Rejected: fuzzy title matching at generation time — it would silently pair the wrong
  entry, which is the one failure the paragraph pane cannot recover from.
- **160 entries' definitions mention Russian** (measured by searching `def` for «в русском»), and they are
  not all illustrations — some are outright divergences (`article`: «В русском артикля нет…»;
  `comitative-case`: «В русском такого падежа нет, и его значение передаёт родительный»; `perfective` adds
  the «он сел» contrast). Those entries are case 2. The divergence is **not marked anywhere in the data
  today** — it lives in the prose of `def` — so the authored English for a case-2 entry is what makes it
  explicit and reviewable.
- **The appendix is fetched once, at generation time, and not committed** — the same treatment the kremlin
  pages get (only their dumps are committed). Its provenance is recorded in the dump header and in
  `NOTICE`.
- Rejected for the whole English side: a model call at generation time for all 602 entries (589 of them
  already have a primary source, and a model's output is not reviewable as data); a model call at read
  time (the reader would wait on a model for its first paint, and the app's only model call is the
  deliberate, bounded, cached explanation endpoint); reusing the appendix text for the diverging entries
  (the pair would not say the same thing).

### The dumps and the pipeline

- **Two dumps in the existing format** — `data/wiktionary-glossary-ru.txt` and
  `data/wiktionary-glossary-en.txt` — so the document enters the pipeline at its existing seam,
  `build_article.py <id>`, with no second content path. Both carry a `# source:` header naming the appendix
  (the pipeline reads it before its kremlin.ru fallback) and a title line; neither carries a date line.
- **A new offline script produces them** from the authored entries, the fetched appendix and the authored
  English: the Russian side is mechanical (headword, aliases, definition, «см. также»), the English side is
  the appendix text for case 1, the authored text for cases 2 and 3. It is a once-and-committed step, like
  `extract_page.py`: its output is reviewed and committed, not regenerated per read. It is guarded the way
  the pipeline is guarded — a missing `en` label match, a case-2 entry with no authored English, a
  paragraph-count difference between the two dumps and an empty definition each stop it with a message
  naming the entry.
- **The pipeline learns that a document may have no date line.** Three functions assume one today: the
  body reader raises «no date line found, cannot locate the body», the date reader raises «no date line
  found», and the title reader takes the line *before* the date. The new rule: a document with no date line
  has its title on the first line and its body from the second, and its article carries no `date`. The
  kremlin path is unchanged.
- **The pipeline emits the paragraph anchor** from the dump (each Russian paragraph line carries the entry
  id the entry came from) and emits the source note from a header line, so the dump remains the whole
  input of the JSON.
- **The glossary run does not touch the catalog.** The pipeline's catalog merge is skipped for this
  document (a flag), because the glossary is not a text in «Тексты». Everything else about the run is the
  ordinary one: positional paragraph pairing (the two dumps have one paragraph per entry, so the counts
  match by construction), sentence splitting, the alignment DP, pymorphy3 tokens, rarity ranking, and the
  same emitted shape.
- **The explanation endpoint is unchanged.** It re-derives the sentence from `ruSentences` and the
  translation from `pairs`, both of which the glossary article has, so a word clicked in a glossary entry
  is explained exactly as a word clicked in an article. Rarity and the grammar tag come from the same
  pipeline passes.

### The reader and the routes

- **`/glossary` redirects to `/read/glossary`** (permanent), and the menubar's «Словарь» links to the
  article. The glossary page component, its server load and the letter-index/cross-reference half of the
  glossary data layer are deleted, not kept beside the article.
- **The authored entries move out of the app's source** into the pipeline's input — `src/lib/glossary.json`
  becomes `data/glossary/entries.json`, since nothing in the app imports it any more and the pipeline's
  inputs live under `data/` — and the built article lands in the content directory under the slug
  `glossary`. `NOTICE` and the README, which both name `src/lib/glossary.json`, follow the file.
- **The panes change only by the widenings above**: a paragraph's `anchor` becomes its DOM id (nothing else
  about the Russian pane's rendering changes), the date is rendered only when present, the source labels
  come from the hosts, and the note is rendered when present.
- **The grammar chip's popup links its codes to entries.** The popup glosses pymorphy3 grammemes today
  (`ADJF`, `plur`, `gent`, …) from a table in the app and renders them as plain text; it gains a mapping
  from grammeme to glossary entry id, and a code the map knows is rendered as a link to
  `/read/glossary#<id>`. Codes with no entry keep their plain gloss. The map is authored by hand from the
  existing gloss table, and the entries it names must be entries of the glossary — checked, because a
  regenerated glossary can drop one.

## Testing Decisions

- **What makes a good test here**: the repo has no test runner — `bun run check` (svelte-check) and
  `bun run build` are the only automated gates, and the prior art for correctness is *shape checks that
  fail loudly*: the pipeline's `SystemExit` guards («paragraph count mismatch», «several dumps match»,
  «no date line found»), the glossary data layer's own `throw new Error('glossary.json: expected an array of
  glossary entries')`, and the word-explanation spec's numbered run items measured by hand in a production
  build. This spec follows that idiom rather than introducing a framework: guards inside the scripts, one
  check script for the invariant that can rot, and numbered run items with the exact observation expected.
- **Guards in the dump producer** (fail with the entry named): an `en` label that matches no appendix
  entry; a case-2 or case-3 entry with no authored English; a dump pair whose paragraph counts differ; an
  entry with an empty definition or no `id`; two entries sharing an `id`.
- **A check script** — `scripts/check_glossary.py`, run by hand like the pipeline, because the two things
  that can silently rot are not visible in the app: every id in the chip's grammeme→entry map exists as an
  anchor in the built glossary article, and every entry's anchor is unique and ASCII. Its prior art is the
  pipeline's stdout report: it prints what it checked and exits non-zero on the first failure.
- **The pipeline's existing guards keep covering the rest**: the article JSON's offsets, pairs and token
  spans are produced by the same code as for any article, so a glossary that violates them cannot be
  emitted.
- **Run items** (measured in a production build, as the word-explanation spec does; expected observation
  named for each):
  1. `/glossary` → lands on `/read/glossary`, the browser's address bar shows the article's URL.
  2. `/read/glossary` → the article pane shows the glossary from its first entry, the header shows the
     title and no date, the source links read `en.wiktionary.org` (or whatever host the dump names), and
     the note line carries the CC BY-SA attribution.
  3. `/read/glossary#accusative-case` → the article pane is scrolled so that entry is at the top, and the
     URL keeps the fragment.
  4. A click on a sentence of an entry → the paragraph pane shows that entry's English; a click on a word
     of an entry → the explanation pane answers, with the same loading, failure and close behaviour the
     word-explanation spec measured for articles.
  5. Tab / Shift+Tab → walks sentence pairs across paragraph boundaries exactly as in an article, including
     the pane restore on a step.
  6. The grammar chip's popup on an article word → a code the map knows is a link; following it lands on
     the entry's anchor in the glossary article; a code the map does not know is still plain text.
  7. «Тексты» → lists the kremlin.ru texts and does not list the glossary.
  8. `bun run check` → 0 errors, 0 warnings; `bun run build` → clean; no console errors on the reader.
  9. A regenerated glossary article (rerun the dump producer and the pipeline) → the same anchors, the same
     entry order, and the check script still passes.

## Out of Scope

- **No letter index inside the article.** The 31 letter groups are the page's own navigation and do not
  survive the move; a reader reaches a term by the chip popup's link, a URL fragment, or the browser's own
  find. If a 602-entry scroll needs an index later, that is its own spec.
- **No live «см. также» links** — the references are text in the entry, as decided above.
- **No change to the explanation endpoint**, its prompt, its cache or its budget.
- **No second content shape.** The reader gains optional fields, not a second document type.
- **The appendix is not committed** to the repo; only the dumps it produced and the authored English are.
- **The narrow-screen gap** the word-explanation spec recorded (§14 Q10) is untouched: at ≤ 899 px the
  glossary article renders exactly as badly as any other.
- **The 602 entries' Russian text is not edited** beyond the 11 corrected `en` labels. The glossary's own
  wording, its aliases and its cross-references are the adaptation that already exists.
- **No ADR is written by this spec** — the offer stands (see Further Notes) and is the user's to accept.

## Further Notes

### Vocabulary (`GLOSSARY.md`)

Two definitions die with this feature and are replaced as part of the work:

- **Article** widens from "One kremlin.ru publication — a Russian original with its official English
  translation, read as a unit" to a text in the reader: a Russian original with an English side, read as a
  unit. *kremlin.ru* becomes a property of the sources, not of the definition.
- **Glossary page** retires: there is no page at `/glossary` any more, and the glossary is an article like
  any other.

The words *official* in **Sentence pair**, **Merge**, **Split** and **Alignment** are already imprecise for
the glossary's English side (which is sourced from Wiktionary where it exists and authored where it does
not) and should be read as "the English side the document carries" when the document is not a kremlin.ru
publication.

### ADR offer

This decision meets the three tests a decision should meet before it is recorded: it is hard to reverse
(the content shape, the pipeline's dump format and the reader's contract all move), it is surprising
without context (a grammar glossary rendered as a dateless article whose English side is sometimes the
Wiktionary's text and sometimes not), and it came out of a real trade-off with rejected alternatives
recorded above. `docs/adr/` does not exist yet; the offer is to create it with this decision as 0001.

### Measurements behind the decisions

- `src/lib/glossary.json`: 602 entries, six keys each (`id`, `ru`, `en`, `def`, `aliases`, `see`),
  318.9 KB, ≈122,897 characters of Russian text (`ru` 8,200 + `def` 108,670 + `aliases` 6,027), 31 letter
  groups, 1,011 «см. также» references of which 845 resolve to an entry (844 links after dedup by target).
  Re-measured 2026-10-22 against `src/lib/glossary.ts`'s own fold and term map, which also index each
  entry's English term; the word-explanation spec's §12 item 36 says 841 and is off by four.
- The appendix, fetched 2026-10-22 (`action=raw`, 225,614 bytes, 1,418 lines): 622 `;` terms, 607
  `{{anchor}}` names, 30 headings.
- Label join: 601 unique `en` labels — 589 verbatim matches, 11 resolving under a different displayed
  term, 1 (`tashif`) with no English term in the appendix.
- Divergence: 160 entries whose `def` mentions Russian.
- The reader's contract today: `Article.date` and `CatalogEntry.date` are required; `Paragraph` has no
  anchor; the pipeline's body reader and date reader both raise when a dump has no date line; the pipeline
  appends every built document to the catalog and sorts it by date.
- The chip's popup renders grammeme codes from the app's own table and links nothing today; the glossary
  page's anchors are consumed only by its own letter index and its cross-references, so the Q27 link into
  the glossary has never existed.

### Risks worth stating out loud

- **The authored English is the biggest piece of new text.** 160 entries may need a written English side,
  and each one is a judgement about what the appendix's text leaves out. It is reviewable data — that is
  the point — but it is not a mechanical step, and it is the work most likely to be underestimated.
- **The appendix's wiki markup is not a clean text.** The English side is extracted from wikitext
  (templates, links, HTML comments); the extraction renders the common templates to their display text and
  the dump is reviewed before it is committed, because the English dump is what the reader will read.
- **One 602-paragraph document is the longest thing the reader has ever loaded.** It is within the shape of
  what exists, but the scroll offset, the Tab walk and the sentence pane's behaviour on a long paragraph
  list are worth watching in the run items rather than assumed.

## Comments

- 2026-10-22: written from a grilling session (no interview, synthesis only) that settled, in order: the
  glossary becomes one article rather than 602 (`/to-spec` input); the English side is the appendix's text
  where the entry is a translation of it, and authored where it is not; the appendix's text is a primary
  source and a model is not used to produce it at read time; the pipeline produces the document from two
  committed dumps; the paragraph carries the entry's anchor and nothing else of the entry's structure
  survives; the document has no date and does not enter «Тексты»; `/glossary` redirects and the menubar
  keeps its door; and the chip popup finally gets the link Q27 promised.
- 2026-10-22: the label-join and divergence numbers above were measured against the live appendix before
  this spec was written, not estimated.
