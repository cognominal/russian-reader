# 01: The pair is data and the sides are roles

**Spec:** `.scratch/multilanguage-reader/spec.md` — *Article payload (schema v2)*, *Data structures*,
*Alignment as role-neutral blocks*, *Reader-side language registry*, *Interface language*, *Build-side language
descriptors and the source seam*, *Capabilities*, *Translation provenance*, *Routes, catalog and
glossary*, *Cutover and migration*.

**What to build:** the atomic cutover. The pipeline emits v2, the reader reads v2, the committed content
is regenerated, and the tests move with them in one change — a commit that leaves the app unbuildable is
not acceptable, so this ticket is one change set even though it spans Python, TypeScript and JSON.

Pipeline: `scripts/languages/` (a `Language` record and registry; `ru` carrying today’s pymorphy3 token
regex, first parse, lemma, tag, proper grammemes, `zipf_frequency(…, "ru")` and `ru_full.txt` unchanged;
`en` metadata-only) and `scripts/sources/kremlin.py` (date parsing, body-end markers, signature
stripping, title/source derivation — the rules that are kremlin.ru edition rules, not language rules).
`build_article.py` takes `--foreign` and `--native` (required), `--translation-provenance`
(required), `--answer-language {foreign,native}` defaulting to `foreign`, and a `--wordlist` defaulting
to the foreign descriptor’s; it finds the dumps by code, keeps the equal-paragraph-count guard, and
emits the v2 payload: `langs`, role-named `title`/`source`/`paragraph` fields, `alignment` blocks
(a partition of both sides, unmatched sentences included), `capabilities`, `translation.provenance`,
`glossary`, `explain.answerLanguage`, role-named stats, `rare[].hf` in the TS interface. Rarity runs only
when the foreign language has an analyzer and a frequency source.

Reader: rename the contract and the helpers (`Token`, `foreignRuns`, `blockFor`, `pairGroupFor`, delete
`enRangeFor`), render every pane’s `lang` from `langs` and `dir` from the registry, and derive the
`RU`/`EN` tags from the codes. Add the no-token path (`sentenceRuns` with plain text) so an article
without `tokens` is still readable and has no word buttons. Rename `RussianPane` → `ArticlePane`,
`TranslationPane` → `ParagraphPane`, and the `.pane-ru`/`.pane-en`/`.en*` CSS to the role names. Move
every user-visible string into the typed `ru` message table, resolve `UI_LANG` (default `ru`) once, set
`<html lang>` through `%lang%` in `app.html` and `transformPageChunk`, and format dates per UI language.
Render the provenance label in the header. Group the catalog by pair, filter «Тексты» to the current
pair, and show a pair heading only when more than one pair is listed.

Routes and glossary: slug `glossary-ru`; `/read/glossary` and `/glossary` answer 308 to
`/read/glossary-ru`; every glossary link (menubar, grammar chips) comes from `article.glossary`; the
menubar hides «Словарь» when the article has none. Rename the glossary dumps and article JSON, and update
`check_glossary.py`’s defaults.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `build_article.py 66181 --foreign ru --native en --translation-provenance official` regenerates
      `66181.json` with `langs {foreign:"ru",native:"en"}`, role-named fields, `alignment` blocks,
      `capabilities`, `provenance: "official"`, `explain.answerLanguage: "ru"` and `glossary:
      "glossary-ru"`; the same holds for `24034` and `glossary-ru` (provenance `authored`).
- [ ] The regenerated text and counts are unchanged: paragraph, sentence, token, rare-lemma and
      rare-token counts match the pre-cutover values, and a one-off comparison of the old `pairs`
      components against the new `alignment` blocks is equal for all three articles (the script is
      deleted after the check).
- [ ] `alignment` partitions both sides: every foreign and native sentence index appears in exactly one
      block, each side of a block is contiguous, and blocks are in reading order.
- [ ] `articles.json` carries `langs` and role-named titles; the glossary is absent from it; the
      catalog and «Тексты» list the current pair only, and «Тексты» omits the text being read.
- [ ] Every pane carries the side’s `lang` (`ru` foreign, `en` native) and the registry’s `dir`; the
      sentence-pane tags read `RU`/`EN` from the codes, not literals.
- [ ] `<html lang>` is `ru` under the default `UI_LANG`, and every visible string (catalog copy,
      menubar, aria-labels, legends, empty states, no-translation note, headers, provenance labels,
      months) comes from the `ru` message table; no hardcoded Russian copy remains in a component.
- [ ] The header shows «официальный перевод» on 66181 and 24034 and «написано для этой статьи» on the
      glossary.
- [ ] `/read/glossary-ru#accusative-case` lands on the entry; `/read/glossary` and `/glossary` 308 to
      it; «Словарь» and a grammar chip point at `/read/glossary-ru`; an article with no `glossary` shows
      no «Словарь» entry.
- [ ] The article path behaves as before: 66181 ¶2 merge, 24034 ¶20 split, 24034 ¶30 three-sentence
      merge, dimmed-word retarget, Tab stepping, paragraph marking and the no-translation note.
- [ ] An article whose `capabilities` omit `tokens` renders as plain sentence runs (no word buttons,
      no crash) in both panes; rarity is not rendered, as before.
- [ ] `bun run check` → 0 errors, 0 warnings; `bun test` → all green; `bun run build` → clean; a
      `node build/index.js` smoke run renders the catalog and 66181.
- [ ] No old name survives: `pairs`, `ru`, `en`, `ruSentences`, `enSentences`, `ruTokens`, `ruLemmas`,
      `RuToken`, `enRangeFor`, `RussianPane`, `TranslationPane`, `.pane-ru`, `.pane-en`, `.en`. The old
      `glossary.json` is gone.
