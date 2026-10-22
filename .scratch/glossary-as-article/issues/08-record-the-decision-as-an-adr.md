# 08: Record the decision as an ADR

**Spec:** `.scratch/glossary-as-article/spec.md` — Further Notes, *ADR offer*.

**What to build:** `docs/adr/` is created with its first record: the glossary is an article, read at
`/read/glossary`, one paragraph per entry, with no publication date, kept out of «Тексты», its English
side taken from the English Wiktionary's appendix wherever the Russian entry is a translation of it and
written where the Russian says more. The record also carries what lost and why — 602 articles instead of
one document, flattening the entry's structure away, a model translating at read time, a synthetic date,
keeping two surfaces — because those are the alternatives a future reader would otherwise re-propose. It
is written in the format `/domain-modeling` prescribes, for someone who will wonder why a grammar
glossary is a dateless article whose English side is sometimes sourced and sometimes not.

**Blocked by:** None (can start immediately) — the decision is already made and written down.

**Status:** ready-for-agent

- [ ] `docs/adr/` exists with the record as its first entry, in the repo's documentation voice.
- [ ] The record states the decision, the alternatives rejected with the reason each lost, and the
      consequences a future reader would not guess.
- [ ] The record points at the spec rather than restating it.
- [ ] The spec's Further Notes no longer describe the ADR as an outstanding offer, and the record's number
      and path are what the spec points at.
