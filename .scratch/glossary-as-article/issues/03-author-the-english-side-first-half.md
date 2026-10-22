# 03: The English side of the glossary, first half

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The English side*.

**What to build:** for every entry in the first half of the glossary's Russian alphabetical order, an
English side that says what the Russian entry says. Where the Russian entry is a translation of the
appendix's entry, nothing is authored — the appendix's own text is the English side, and the entry
records that it is. Where the Russian says more than the appendix — «в русском такого падежа нет, и его
значение передаёт родительный падеж», an illustration the adapter added, an entry whose phenomenon
Russian does not have — the English is written for it, because the paragraph pane has to say what the
Russian paragraph says or the pair is lying. The English labels that name a different appendix term than
the entry came from are corrected to the appendix's own headwords, because that label is the join: the
appendix's own text cannot be found through a label that names something else.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Every entry in the first half carries a join to the appendix entry it came from, or is recorded as
      having none.
- [x] Every entry in the first half that needs written English has it, and the text says what the Russian
      entry says — the Russian-specific note included — rather than what the appendix says.
- [x] The labels that took a Wikipedia-link title or an anchor instead of the headword are corrected to
      the appendix's own headwords: telic, sense, avoidance term, yes-no question, mention, morphological,
      transitive verb, womens speech, CJKV, ʾiʿrāb, men’s speech.
- [x] The entry whose appendix counterpart has no English term at all (tashif) is handled explicitly
      rather than left with an Arabic headword where an English side belongs.
- [x] The divergence is recorded as data, so that a later reader can see which entries were written and
      which were sourced, instead of inferring it from the prose of a definition.
- [x] Nothing else about the entries changes: same ids, same headwords, same definitions, same
      cross-references, same order.
