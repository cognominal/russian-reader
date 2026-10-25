# 03: The reversed pair is a fixture

**Spec:** `.scratch/multilanguage-reader/spec.md` — *Role reversal and the fixture*, *Capabilities*,
*Testing Decisions*.

**What to build:** the proof that the same two texts can swap roles without a direction toggle — and
that nothing in the reader is English- or Russian-specific. Add
`src/lib/content/_fixtures/fixture-66181-en-ru.json`: a two-paragraph excerpt of 66181 with
`langs {foreign:"en", native:"ru"}`, a handful of hand-written English tokens (offsets, form, lemma;
no tags, no rarity), the Russian sentences as the native side, `alignment` blocks, no `date`, provenance
`official`, `capabilities: ["align","tokens","lemmas"]`, no `glossary`, no `grammar`, no `etymology`.
It is dateless, so no catalog path can list it.

The reader’s article load merges the fixture glob only when `import.meta.env.DEV` is true; a production
build answers 404 for `/read/fixture-66181-en-ru`. The Chromium suite navigates to it on the dev server
and asserts the swapped rendering; a unit test finds the fixture’s blocks by their native index as well
as their foreign one, showing neither side is privileged in the payload. No test makes a model call.

**Blocked by:** 01 — the fixture is a v2 article and the reader must read it.

**Status:** ready-for-agent

- [ ] `/read/fixture-66181-en-ru` on the dev server shows the English text in the article pane with
      `lang="en"`, the Russian translation in the paragraph pane with `lang="ru"`, and the sentence pane
      tags `EN` and `RU`.
- [ ] The page `<title>`, the article-pane `h1` and the «Тексты» row are the fixture’s English title;
      the meta description is its Russian title.
- [ ] English words in the sentence pane are buttons; a proper-noun token is italic and is not a button;
      clicking a word selects that sentence (no endpoint call is made by the test).
- [ ] The menubar shows no «Словарь», and no grammar chip appears — the fixture declares neither
      capability.
- [ ] The fixture does not appear in the catalog, in «Тексты», or in `articles.json`.
- [ ] A production build (`bun run build`, then `node build/index.js`) answers 404 for
      `/read/fixture-66181-en-ru`, while 66181 still renders.
- [ ] The unit test fails if the fixture is not found by its native sentence index as well as its
      foreign one.
- [ ] `bun run check` → 0 errors, 0 warnings; `bun test` → all green.
