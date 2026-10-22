# 04: The English side of the glossary, second half

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The English side*.

**What to build:** the same work as 03, over the second half of the glossary's Russian alphabetical
order: a join to the appendix entry for every entry, the appendix's own text as the English side wherever
the Russian entry is a translation of it, written English wherever the Russian says more than the
appendix does, and the divergence recorded as data rather than left in the prose of a definition. The two
halves together must leave every one of the 602 entries with an English side, so the dump producer's
guard can pass.

**Blocked by:** 03 — the two halves edit the same entries file, so working them in parallel would collide
rather than save time.

**Status:** ready-for-agent

- [x] Every entry in the second half carries a join to the appendix entry it came from, or is recorded as
      having none.
- [x] Every entry in the second half that needs written English has it, and the text says what the Russian
      entry says — the Russian-specific note included — rather than what the appendix says.
- [x] With 03, every one of the 602 entries has an English side: no entry is left without one, and none
      silently falls back to a text that says something else.
- [x] The divergence is recorded as data, in the same shape 03 used, so the two halves are one file's
      worth of authored English and not two conventions.
- [x] Nothing else about the entries changes: same ids, same headwords, same definitions, same
      cross-references, same order.
