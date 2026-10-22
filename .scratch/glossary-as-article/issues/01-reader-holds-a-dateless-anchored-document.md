# 01: The reader holds a document with no date, anchored paragraphs, and labelled sources

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The document* and *The
reader and the routes*.

**What to build:** the reader stops assuming every document it holds is a kremlin.ru article. Three
optional fields join the content contract — a document's date, a paragraph's anchor, a document's
provenance note — and the panes render them: a paragraph's anchor becomes its DOM id, so
`/read/<slug>#<anchor>` lands on that paragraph rather than the top of the document; a document with no
date shows no date instead of a blank one; the header's two source links are labelled from the hosts of
the URLs they point at, so a link to another site stops reading «kremlin.ru»; and a document carrying a
note shows it under the header. Nothing else about the panes' rendering changes, so the article path
keeps the behaviour the word-explanation spec measured.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] A hand-written article whose paragraphs carry anchors renders with an id on each paragraph element,
      and `/read/<slug>#<anchor>` scrolls to that paragraph.
- [x] A document with no date renders no date at all — no empty `<time>`, no invented value — while an
      article that has one renders exactly as before.
- [x] A document whose sources are not kremlin.ru shows link labels taken from each URL's own host.
- [x] A document carrying a provenance note renders it; a document without one renders nothing extra.
- [x] Both existing kremlin.ru articles read exactly as before: same header, same date, same source
      labels, no paragraph ids.
- [x] `bun run check` reports 0 errors and 0 warnings, and `bun run build` is clean.
