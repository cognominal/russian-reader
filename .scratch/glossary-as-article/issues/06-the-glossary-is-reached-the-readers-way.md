# 06: The glossary is reached the reader's way

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The reader and the routes*;
Testing Decisions, run item 1.

**What to build:** the glossary stops having a route of its own. `/glossary` redirects to the article
permanently, so every saved link and bookmark still lands somewhere real; the menubar's «Словарь» points
at the article; and the old page, its server load and the letter-index and term-lookup half of its data
layer are deleted rather than kept beside the article. The authored entries move out of the app's source
into the pipeline's input, since nothing in the app imports them any more, and `NOTICE` and the README
name them where they now live — including the README's glossary section, which describes the article
rather than the page.

**Blocked by:** 05 — the old page stays reachable until the article exists.

**Status:** ready-for-agent

- [ ] `/glossary` redirects permanently to `/read/glossary`.
- [ ] The menubar's «Словарь» opens the article.
- [ ] The glossary page component, its server load, and the data layer's letter index and term lookup are
      gone, with no import and no link left pointing at them.
- [ ] The authored entries live under the pipeline's input, and nothing in the app imports them.
- [ ] `NOTICE` and the README name the entries file where it now lives, and the README's glossary section
      describes the article rather than the page.
- [ ] `bun run check` reports 0 errors and 0 warnings, `bun run build` is clean, and no route, component
      or menubar entry still points at the deleted page.
