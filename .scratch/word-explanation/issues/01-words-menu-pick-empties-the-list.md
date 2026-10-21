# The words menu empties itself when a row is picked

Status: resolved

## What the user reported (2026-10-21)

> clicking on entries in the "slova" menu button make them disappear

Confirmed: the entries in question are the menu's rows, and picking any one of them can wipe
the whole list.

## How to see it

1. Open `/read/66181`, pick a sentence, click three words so «Слова» lists three rows.
2. Age the session past its hour — or run in a browser that keeps no cookie —
   `document.cookie = 'explain_session=' + (Date.now() - 3_600_000 - 1000) + '; path=/read'`.
3. Click «Слова», then click any row.

Before the fix: the popup closes, the list is gone, «Слова» turns `disabled` with `title`
«Ни одного объяснения пока нет», and the explanation pane stays on screen — the answer being
read is left alone, as designed. Measured in a production build on port 3222: rows
`['Недавно→недавно ¶1', 'мало', 'немного']` before the click, `[]` and `disabled` after it.

## Why

`openPanel()` read the session's clock *after* the reader had committed to a row: it looked at
the `explain_session` cookie, and an hour without a request made it drop every panel —
`history = []; cursor = -1` — instead of opening the row that was clicked. `step()` did the
same to an arrow press. The rule itself is Q20's and stays: an hour without a request ends the
session those panels belong to. What is wrong is *when* the page notices: the menu offered rows
that a click would then throw away, so the reader's own click was the thing that deleted their
work. The cookie makes that worse than a race — it is shared by the browser, so its value has
nothing to do with the panels this page holds.

## Fix

The hour is watched, not asked about. A timer armed at every answer (`remember()` is the single
funnel) drops the panels when the cookie says the session is over — falling back to the answer's
own time when no cookie is readable — so the list empties itself and «Слова» greys out on its
own. Neither a row nor an arrow is a death sentence any more: `sessionAlive()` and both of its
call sites go. The panel on screen, an answer being read, is still left alone.

## Comments

- 2026-10-21: reproduced as above in a production build (port 3222, real provider http
  openrouter). Three rows listed, one click emptied them and greyed the entry, no console
  error — a hydration-clean page doing exactly what the code said.

## Answer

Fixed in `src/routes/read/[slug]/+page.svelte`. `sessionAlive()` is gone, with both of its call
sites — `openPanel()` no longer looks at the clock at all, and `step()` no longer drops anything —
and `remember()` stamps `answeredAt`, the page's copy of the session's clock, on every answer. One
`$effect` reads the `explain_session` cookie at that moment (falling back to `answeredAt` when no
cookie is readable) and arms a single `setTimeout` for the hour's end; when it fires the panels go,
the cursor resets, and the words menu closes with them, because an empty popup under a greyed button
is chrome nobody asked for. So the hour is announced on its own and a row that is offered is a row
that opens.

Measured after the fix (production build, port 3222, three panels): the repro script — age the
cookie past the hour, pick a row — opened the panel the row names and left all three rows listed and
enabled; ← and → still walk the panels, Escape still closes the answer, and an arrow with the menu
open still closes the menu first. With `EXPLAIN_SESSION_MS` temporarily `5_000`, the list emptied
itself with nothing touched, the pane stayed on screen, and an open popup closed with the rows; with
`refreshSession()` temporarily commented out — no cookie at all — the fallback clock held the same
hour. `bun run check` 302 files / 0 errors / 0 warnings, `bun run build` clean, no console errors.
Spec: §5's session-cookie note, §9's clock bullet, §10's words-menu bullet and Q20's revision, with
§12 item 38 for the measurements.
