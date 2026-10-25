# Spec: the sentence pane shows the whole pair group

Status: implemented 2026-10-25
Date: 2026-10-25
Feature slug: `sentence-pane-groups`
Decided by grilling, 2026-10-25. Supersedes the sentence pane's "only the current sentence pair" rule
where the pair is plural on one side; it does not change what a sentence pair is (see Q1–Q8, Comments).

## Problem Statement

The sentence pane holds one picked Russian sentence and the English its pair names. But an alignment
is not always one-to-one: the data encodes two shapes, and both are common.

- A **merge**: several Russian sentences are translated by one English sentence (24034: 9 groups;
  66181: 13; the built glossary: 136).
- A **split**: one Russian sentence is translated by several English sentences (24034: 22;
  the built glossary: 155; 66181: none).

When the reader picks a Russian sentence of a merge, the pane shows that sentence alone. The other
Russian sentences the same English sentence translates are absent, although the English line is the
translation of all of them. The reader's eye compares one Russian sentence with an English sentence
that says more — or comes from more — than what is on screen, and the missing Russian context is exactly
what the pane exists to show.

`Selection.sentence` indexes `ruSentences` only, so the English side has no current sentence of its own;
the article pane's dimming convention (`.sent.dim { opacity: .45 }`, `.sent.tint { background:
var(--sentence) }`) already says "this is current, that is context" and the sentence pane can reuse it.

## Solution

The sentence pane shows the **pair group** of the picked Russian sentence: every Russian sentence and
every English sentence in the same alignment component, in reading order.

- The Russian block is rendered once with one `RU` tag, holding all group members. The picked sentence
  wears the tint; every other Russian sentence of the group is dimmed.
- The English block is rendered once with one `EN` tag, holding all group members as separate spans at
  full contrast. There is no current English sentence, so nothing there is dimmed.
- The header names the group's Russian range (`предложения 5–6`) when the group has more than one
  Russian sentence, and the picked sentence otherwise.
- Dimmed sentences stay usable: a word in one is still a button, and clicking it moves the selection to
  that sentence and asks about the word in it. The group does not change; the tint moves.
- `Tab` / `Shift+Tab` still step one Russian sentence at a time; the group re-tints within itself, then
  the next group comes into view.

The group is derived at read time from the paragraph's `pairs`. No article JSON, pipeline, alignment or
explanation-endpoint change is needed.

## User Stories

1. As a reader, when several Russian sentences share one English translation, I want to see all of them,
   so that the English line is compared with everything it translates.
2. As a reader, I want the sentence I picked to stay visibly current inside that group, so that I do not
   lose my place when the context appears around it.
3. As a reader, I want the other sentences dimmed rather than hidden or equally loud, so that context
   does not compete with the current sentence.
4. As a reader, when one Russian sentence is split across several English sentences, I want each English
   sentence to be its own span, so that the split is visible rather than one run-on line.
5. As a reader, I want to click a word in a dimmed sentence of the group, so that I can ask about the
   very word that made me look at the context.
6. As a reader, I want that click to make its sentence current, so that the explanation, the tint and the
   selected sentence agree.
7. As a reader, I want the pane header to name the range the pane is showing, so that I know whether I am
   looking at one sentence or a merge.
8. As a reader, I want `Tab` and `Shift+Tab` to keep stepping single sentences, so that every Russian
   sentence remains reachable by the reading keys.
9. As a reader of a paragraph, I want the paragraph pane's marking and the article pane's dimming to keep
   behaving as they do, so that the new group rendering adds context without changing the panes around it.
10. As a maintainer, I want the group computed from `pairs` rather than stored a second time, so that the
    alignment has one source of truth.
11. As a maintainer, I want the sentence pane's vocabulary in `GLOSSARY.md` to describe the group, so that
    "only the current sentence pair" stops being asserted by the definition.

## Implementation Decisions

### What a group is

- **The group is the whole alignment component**, not only merges. One Russian sentence with several
  English sentences is the same object seen from the other side, and leaving it ungrouped would give the
  pane two rules for one relation. Measured across the built articles: every non-singleton component is
  either `n×1` or `1×m` — no mixed `n×m` components exist — and every component is contiguous on both
  sides (no component has a hole in its sentence indices).
- **The group is derived at read time** by a new helper in `src/lib/article.ts`:

  ```ts
  /** The Russian and English sentences of one alignment component, in reading order. */
  export interface PairGroup {
  	ru: number[];
  	en: number[];
  }

  export function pairGroupFor(p: Paragraph, ruSentence: number): PairGroup;
  ```

  Starting from the row `pairs.find(([ru]) => ru === ruSentence)`, take its English indices, add every
  Russian row that names any of them, add those rows' English indices, and repeat to a fixed point; sort
  both lists. The fixed point is robust to a future non-rectangular alignment, and the measured data makes
  it a one-pass step today. A row that is absent or empty yields `{ ru: [ruSentence], en: [] }`, which is
  what the pane renders today for a sentence with no translation.
- **No JSON or pipeline change.** `pairs` already encodes the alignment completely; emitting group ids
  would duplicate it in a second shape that could disagree. The built glossary article inherits the
  behaviour with no rebuild.

### Rendering the Russian side

- **One block, one `RU` tag, every group sentence in reading order.** The pane keeps its two-line shape;
  a merge does not turn it into three tagged lines. Members are rendered from the same `ruRuns(p)` the
  single sentence uses today, filtered to the group's `ru` indices and trimmed at both ends, so every word
  keeps its exact offsets, its `ruTokens` index and its `proper` flag.
- **Each sentence is its own wrapper span**, carrying the existing tint/dim classes: the picked sentence
  gets the tint, every other group member gets `dim`. The wrappers contain the same token `<button>`s and
  plain gaps as today; the dim applies to the sentence and its whitespace alike.
- **Whitespace remains part of the text**: the group is a contiguous slice of the paragraph when the
  component is contiguous, and the runs between members are kept rather than synthesized, so the original
  spacing between the Russian sentences is what the reader sees.
- **The CSS is reused, not reinvented**: `opacity: 0.45` for dim and `background: var(--sentence)` for
  the current sentence, the same values the article pane uses, so "current" and "context" mean the same
  thing in both panes.

### Rendering the English side

- **One block, one `EN` tag, group members as separate spans at full contrast.** The line is built with
  the existing `sentenceRuns(p.en, p.enSentences)` filtered to the group's `en` range, keeping the
  interior gap runs (the page's own spacing) and trimming only the ends. Every run whose `sentence` is
  non-null becomes a span carrying its `enSentences` index; no span is dimmed.
- **No current English sentence is invented.** `Selection.sentence` indexes Russian sentences, and no
  interaction selects an English sentence. Dimming something the reader cannot select would be a dead
  affordance; the paragraph pane already marks the whole range of the current pair.

### Header and announcement

- **The header names the group's Russian range.** With one Russian sentence it stays exactly as today
  (`предложение 5 · sentence 5`). With several it reads `предложения 5–6 · sentences 5–6`, using the
  same one-based UI numbering the current header uses. The paragraph number stays `¶<i>`.
- **No new ARIA live region.** The pane has none today, and adding one would change what a screen reader
  hears on every step; the existing tint/dim convention is kept. The group's current wrapper may carry
  `aria-current="true"` (attribute only, no new region) so the current sentence is not colour-only.

### Interaction

- **Dimmed sentences are not disabled.** Word buttons in a dimmed member work exactly as in the current
  one. `choose(run)` must use the run's own sentence (`run.sentence`) rather than the pane's previously
  picked sentence, so the emitted `Selection` is `{ paragraph, tokenIndex, sentence: run.sentence }`.
- **The click retargets the selection before asking.** `select()` in the route already sets the selection
  and asks when `tokenIndex !== null`; no route change is expected beyond the corrected sentence index
  arriving from the pane. The group stays the same (the member is part of it by construction), the tint
  moves, and the explanation request names the sentence the word actually sits in.
- **`isOpen` and `noteFor` keep their current comparison**, with the clicked sentence now equal to
  `run.sentence`; no second notion of "the open word's sentence" is introduced.
- **`Tab` / `Shift+Tab` do not change.** Stepping is per Russian sentence (`sentenceIndex`), so a merge of
  three sentences is three steps; each step keeps the same group on screen and moves the tint. Skipping to
  one step per group would make Russian sentences unreachable from the reading keys.

### Vocabulary (`GLOSSARY.md`)

Two definitions change with this feature, and are edited as part of the work:

- **Sentence pane** becomes: "The lower block of the reader's right column, holding the current sentence
  pair — the picked Russian sentence and the English sentence or sentences that translate it — plus the
  rest of its pair group: the other Russian sentences that share that translation, dimmed when the
  selection is on a different member. It is where a word is clicked to ask what it means."
- **Pair group** is added: "The Russian and English sentences of one alignment component, shown together
  in the sentence pane: several Russian sentences merged into one English sentence, or one Russian
  sentence split across several English sentences. The picked Russian sentence is current; the rest of
  the Russian side is dimmed." _Avoid_: cluster, component, match set.

**Merge** and **Split** keep their definitions and gain nothing to say: the group is what the pane shows,
not a third kind of alignment.

## Testing Decisions

- **What makes a good test here**: the repo's gates were `bun run check` (svelte-check) and
  `bun run build`; this feature adds the first test runner, `bun test`, because the group is behaviour a
  build cannot see and the prior art's "measure it by hand" does not survive a refactor. The test file is
  `tests/sentence-pane-groups.test.ts`: unit tests of `pairGroupFor` against the committed content JSON,
  and browser tests that spawn the dev server and drive Chromium through `puppeteer-core` (the system
  `/usr/bin/chromium`, or `CHROME_PATH`), so a merge, a split, Tab and the dimmed-word retarget are
  asserted on the rendered DOM rather than described.
- **The browser tests cover the observation, not the markup**: they select a sentence in the article pane
  and assert the sentence pane's group members, their `tint`/`dim` classes, the header text, the English
  spans, `Tab`/`Shift+Tab` movement and a click in a dimmed member. The explanation request in that last
  item is fulfilled by the test from a fixture, so the suite makes no model call, needs no API key and
  costs nothing.
- **Run items** (production build; expected observation named for each; items 1–5 and 8 are automated in
  the test above, items 6, 7 and 9 remain manual):
  1. `/read/66181` ¶2: click the Russian sentence «А как сверхзадача — разделить…» (UI sentence 7). The
     pane shows both that sentence and «Отсюда и попытки сыграть на национальном вопросе…» (sentence 6)
     on one `RU` line, the clicked one tinted, the other dimmed; one `EN` line holds the single English
     sentence.
  2. `/read/24034` ¶20: click sentence 2. The `RU` line holds that one sentence; the `EN` line holds the
     three English sentences ("And independent legal norms…", "One state and, of course…", "This is
     visible in…") as three spans, all at full contrast.
  3. `/read/24034` ¶30: click sentence 3. The group is sentences 3–5 (three Russian sentences sharing one
     English sentence); all three are visible, exactly one tinted, the other two dimmed, and the header
     reads `предложения 3–5 · sentences 3–5`.
  4. In the same group, click a word in a dimmed sentence. The tint moves to that sentence, the group is
     unchanged, and the explanation request is for that word in that sentence (the answer pane names the
     clicked word; the sentence pane's current sentence and the answer agree).
  5. `Tab` from the first member of a three-member group: the tint moves to the second member without the
     group changing; `Tab` again to the third; `Tab` again moves to the next group. `Shift+Tab` reverses.
  6. A proper noun inside a dimmed member stays italic and is not a button; ordinary words in it are
     buttons.
  7. The paragraph pane, while any member of a merge is current, marks the same English sentence for each
     member; the article pane keeps dimming every non-current sentence of the paragraph.
  8. The glossary article (a dateless document with 136 merges): a paragraph whose entry has no
     translation (empty `pairs` row) still shows the RU line and the note «Перевода этой фразы в паре
     нет», with no empty group and no crash.
  9. `bun run check` → 0 errors, 0 warnings; `bun run build` → clean; no console errors on a reader load.

## Out of Scope

- **No change to alignment, `pairs`, the pipeline or the article JSON.** The group is a read-time view.
- **No English-side current sentence or dimming.** Selection remains Russian-only.
- **No change to the article pane's tint/dim or the paragraph pane's marking.** They already render the
  same pair relation; this feature only widens the sentence pane.
- **No change to `Tab` stepping, the explanation endpoint, its prompt, cache or budget.**
- **No new navigation or letter index.** The group is a rendering change inside the existing pane.
- **No automated coverage of the manual run items** — proper-noun non-clickability, the paragraph pane's
  marking and the build gates stay manual. The suite also makes no model call: the explanation request is
  answered by a fixture.
- **No hint-mode work**, no change to `GOAL.md`, and no change to the glossary-as-article spec.
- **No editing of article text.** The group shows the sentences as built.

## Further Notes

### Measurements behind the decisions

| Article | Merge groups (`n×1`) | Split groups (`1×m`) | Mixed `n×m` | Components with a hole |
| --- | ---: | ---: | ---: | ---: |
| `24034` (556 sentences) | 9 | 22 | 0 | 0 |
| `66181` (373 sentences) | 13 | 0 | 0 | 0 |
| built glossary (1,701 sentences) | 136 | 155 | 0 | 0 |

- The largest groups in the articles are `3×1` (24034 ¶30) and `1×4` (24034); the glossary reaches
  `3×1` and `1×4` too. None is a mixed component, so the fixed-point derivation is not doing hidden work
  beyond today's shapes.
- `SentencePair` is `[ru: number, en: number[]]`; `enRangeFor` returns the inclusive English range or
  `null` for an empty row, and the paragraph pane's `isMarked` already treats every sentence of that
  range as current.
- The sentence pane today derives exactly one `ruSentence` and one sliced `enSentence`; the new group is
  the only widening.

### Risks worth stating out loud

- **The pane grows.** A three-sentence merge makes the block noticeably longer in a pane capped at 45 % of
  the right column on desktop. The run items watch that it scrolls rather than clips, but a very long
  group has no new affordance beyond the pane's own scrollbar.
- **The dimming is the only marker of current within the group**, as it already is in the article pane.
  `aria-current` is added so it is not colour-only, but the visual convention is unchanged and relies on
  contrast.
- **The header range is computed from the group, not from the picked sentence**; if a future alignment
  ever produced a non-contiguous component, the range would be a summary, not an exact list. The measured
  data has no such component, and the renderer uses the exact index list either way.

## Comments

- 2026-10-25: written from a grilling session. Settled in order: the group is the whole alignment
  component (merge and split); the English side is segmented but not dimmed (there is no current English
  sentence); the Russian side keeps one tagged block with the current member tinted and the rest dimmed;
  dimmed members stay clickable and a word click retargets the selection; the header names the group's
  Russian range; the group is derived from `pairs` by a read-time helper with no JSON change; `Tab` stays
  per sentence; and the deliverable is this spec plus the `GLOSSARY.md` definitions above and the code
  change.
- 2026-10-25: the group counts and shapes above were measured against the committed content JSON, not
  estimated.
