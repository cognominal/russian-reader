# 07: The grammar chip's popup links its codes to the glossary

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The reader and the routes*;
Testing Decisions, run item 6. The link Q27 promised and never had.

**What to build:** the popup that explains the grammar chip's codes gains a mapping from each pymorphy3
grammeme it can gloss to the glossary entry that explains it, and renders a code the map knows as a link
to that entry's anchor in the article. A code with no entry keeps its plain gloss — the map is authored
data, not a guess, and inventing a link for a code the glossary does not explain would send the reader
somewhere that does not answer their question. A check script guards the one thing that can rot silently:
every entry the map names must exist as an anchor in the built glossary article, and a regenerated
glossary that drops one fails loudly, naming it.

**Blocked by:** 05 — the map's targets are the article's anchors, so they have to exist first.

**Status:** ready-for-agent

- [ ] A grammeme the map knows renders as a link in the chip's popup, and following it lands on that entry
      in the article.
- [ ] A grammeme the map does not know renders exactly as it does today: same text, same gloss, no link.
- [ ] The map covers the grammemes the glossary actually explains, and no others.
- [ ] The check script passes against the built article and fails, naming the missing id, when the map
      points at an anchor the article does not have.
- [ ] The popup's existing behaviour is unchanged: its fourfold dismissal, Escape closing the popup before
      the answer, and no interactive elements of its own.
- [ ] `bun run check` reports 0 errors and 0 warnings, and `bun run build` is clean.
