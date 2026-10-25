# 04: The vocabulary and the decision are written down

**Spec:** `.scratch/multilanguage-reader/spec.md` — *Documentation and ADR*, *Roles and vocabulary*,
*Further Notes*.

**What to build:** the repo’s shared vocabulary and its decision record catch up with the code.
`GLOSSARY.md` gains **Foreign language**, **Native language**, **Pair**, **Capability** and
**Provenance**, and rewrites **Article**, **Sentence pair**, **Alignment**, **Merge**, **Split**,
**Pair group**, **Prompt** and **Glossary** in role terms — “foreign side” and “native side”, the answer
language, the one prompt template, the glossary as the foreign language’s instance at
`/read/glossary-<foreign>`. `README.md` updates the layout table, the payload description, the pipeline
commands (`--foreign`, `--native`, `--translation-provenance`, `--answer-language`), the glossary
commands and dump names, the explanation configuration table (`UI_LANG`, derived Wiktionary edition,
deleted `word.ru.md`), and the limits. `GOAL.md` moves the role model from “Later” to the current
contract and keeps the second pair as future work.

Write `docs/adr/0002-native-and-foreign-are-roles.md`: the two role names; the pair as a property of the
article; role-neutral alignment blocks; capabilities; translation provenance; one interface language per
deployment; reversal as a build variant; and that `ADR-0001`’s glossary decisions stand with
“Russian/English” read as the current foreign/native instance. Add `UI_LANG=ru` to `.env.example`, and
rename the package to `foreign-language-reader` with the user-agent default
`foreign-language-reader/0.1 (personal reading tool)`.

**Blocked by:** 01, 02, 03 — the documents describe the finished cutover.

**Status:** ready-for-agent

- [ ] `GLOSSARY.md` defines all five new terms and no longer says “Russian side”, “English side”, “the
      answer it asks for is Russian”, or “a Russian original with its English side” as the general case.
- [ ] Every term the spec says changes has its new wording; `Avoid:` lists are kept where they exist.
- [ ] `README.md`’s commands run as written, the config table matches `.env.example`, and no text still
      claims the prompt is Russian-only or that `word.ru.md` switches the instruction language.
- [ ] `GOAL.md` states the current contract is pair-based and the current content is foreign `ru` /
      native `en`; the second pair remains future work.
- [ ] `docs/adr/0002-native-and-foreign-are-roles.md` exists, records each decision above, and states
      its relation to `ADR-0001`.
- [ ] `package.json`’s name and the default user agent are the new ones; `.env.example` carries
      `UI_LANG=ru`.
- [ ] No doc contradicts the payload: `langs`, `alignment`, `capabilities`, `translation.provenance`,
      `explain.answerLanguage` and `glossary` are described as the code emits them.
- [ ] `bun run check` → 0 errors, 0 warnings; `bun test` → all green; `bun run build` → clean.
