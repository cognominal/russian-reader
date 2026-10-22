# 05: The glossary is built as an article and read at `/read/glossary`

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The document*, *The dumps
and the pipeline*; Testing Decisions, run items 2 to 5.

**What to build:** an offline producer turns the authored entries plus the fetched appendix into the two
committed dumps — one paragraph per entry on each side, Russian and English, paired by position — and the
existing pipeline builds the document from them. The result is one article of 602 paragraphs in Russian
alphabetical order: every entry readable with its English side in the paragraph pane, every paragraph
carrying the entry's stable ASCII anchor, its words tokenised and tagged, its rarity ranked, and a word
clicked in the sentence pane explained exactly as a word of any article. The producer fails loudly rather
than building a wrong document: an English label that matches no appendix entry, an entry that needs
written English and has none, a paragraph-count difference between the two dumps, and a duplicate or
non-ASCII anchor each stop it with a message naming the entry.

**Blocked by:** 01, 02, 03, 04.

**Status:** ready-for-agent

- [x] The two dumps exist and are committed, one paragraph per entry on each side, each header naming the
      appendix as its source.
- [x] `/read/glossary` shows 602 paragraphs in Russian alphabetical order, each with its English side in
      the paragraph pane.
- [x] Every paragraph carries its entry's anchor; the anchors are unique and ASCII; `/read/glossary#<id>`
      lands on that entry.
- [x] Clicking a word of an entry in the sentence pane explains it, with the same loading, failure, close
      and panel behaviour the word-explanation spec measured for articles.
- [x] Tab and Shift+Tab walk the document's sentence pairs across paragraph boundaries exactly as they do
      in an article.
- [x] The producer stops with a message naming the entry on each broken input it can see: an English label
      that matches no appendix term and an entry that writes no English of its own, an entry with no `def`
      or no `id`, two entries sharing an `id`, an `id` that is not ASCII, and an `enText` that is empty.
      The paragraph-count difference between the two dumps is the pipeline's guard rather than the
      producer's — the producer writes both sides in one pass over the same entries, so the counts cannot
      differ there, and a pair that differs by hand is caught where it is read
      (`paragraph count mismatch: ru=2 en=1`).
- [x] The document is not offered in «Тексты», and the catalog still lists only the kremlin.ru articles.
- [x] `bun run check` reports 0 errors and 0 warnings, `bun run build` is clean, and a production build
      shows no console errors.
