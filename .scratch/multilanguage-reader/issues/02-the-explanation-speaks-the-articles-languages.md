# 02: The explanation speaks the article’s languages

**Spec:** `.scratch/multilanguage-reader/spec.md` — *Explanation endpoint and prompt*, *Reader-side
language registry*, *Interface language*.

**What to build:** one language-neutral prompt and per-article answer language. `prompts/word.md` loses
“Russian”, “Kremlin”, “English translation” and the hardcoded answer language; it takes
`{{foreign_language}}`, `{{native_language}}`, `{{answer_language}}`, `{{grammar_legend}}` and
`{{translation_label}}` beside the existing eleven placeholders, and says that a dash means the value is
unknown. `prompts/word.ru.md` is deleted; `EXPLAIN_PROMPT_PATH` remains a file override and unknown
placeholders still answer 503.

The endpoint reads `explain.answerLanguage` from the article and resolves the answer pane’s `lang` from
it; the explanation pane’s own prose is tokenised with that language’s word pattern (`ru` keeps the
Cyrillic rule byte-for-byte; the fallback is `\p{L}`-based). The grammar legend comes from the foreign
language module, the translation label from provenance plus the native prompt name, and `NO_DATA`
becomes `—`. Etymology follows the foreign language: default
`https://<langs.foreign>.wiktionary.org/w/api.php`, `EXPLAIN_WIKTIONARY_URL` overrides it, `off`/empty
disables it, and the heading/stub rules come from the language module. The endpoint’s error messages come
from the UI message table, not hardcoded Russian.

**Blocked by:** 01 — this ticket edits the v2 contract’s endpoint.

**Status:** ready-for-agent

- [ ] `prompts/word.md` is the only shipped prompt; it renders with no `{{…}}` left for 66181 in both
      answer-language settings, and `EXPLAIN_PROMPT_PATH` still selects a different file.
- [ ] The rendered 66181 prompt names Russian, English and “Official English translation”, carries the
      OpenCorpora legend for the clicked tag, and contains no “Kremlin”, no “English translation” as a
      literal and no pair-specific phrasing.
- [ ] `{{translation_label}}` reads “Official …”, “Human …”, “Machine …” or “… side authored for this
      article” from `translation.provenance`; the glossary’s prompt carries the authored label.
- [ ] The answer pane and the origin pane carry `lang` equal to `explain.answerLanguage`; with
      `answerLanguage: "native"` the panes carry the native code and the prompt asks for that language.
- [ ] Pane-prose words are clickable under the answer language’s pattern: Russian prose leaves Latin
      runs unclickable, English prose makes its words clickable, and the endpoint request still carries
      only `{source:'pane', word, sentence}`.
- [ ] With no configured model, the endpoint answers its usual error, and the message is in the UI
      language from the message table.
- [ ] Etymology for 66181 asks `https://ru.wiktionary.org/w/api.php` by default, honours an explicit
      `EXPLAIN_WIKTIONARY_URL`, and performs no lookup when it is `off`; the «Этимология» heading is
      extracted and an English «Etymology» heading is not mistaken for it.
- [ ] `NO_DATA` is `—` in the prompt values for a pane word (no lemma, tag, forms, translation, zipf or
      rank) and for a missing etymology source.
- [ ] The cache still works: the same template and model reuse an answer, and editing one character of
      the template invalidates it.
- [ ] `bun run check` → 0 errors, 0 warnings; `bun test` → all green (prompt, etymology and
      pane-prose tests included).
