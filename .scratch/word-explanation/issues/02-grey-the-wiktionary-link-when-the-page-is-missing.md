# The explanation pane links to Wiktionary pages that are not there

Status: resolved

## What the user asked (2026-10-21)

> in the explanation pane of a word, the link to the wiktionary should be grayed out when the wikt
> page is missing. Asking the wiktionary first for json can test the existence.
>
> Use the API, not the HTML. Scraping the body for noarticletext (the MediaWiki message on that 404
> page) works today but is fragile and needs HTML parsing. The status code alone is also weaker than
> it looks: it's a wiki-config rendering detail, whereas missing is the canonical MediaWiki fact
> exposed identically by every WMF wiki (wiktionary, wikipedia, …).

## Why it happens

`sourceUrl` is derived from the API URL's *origin* and the lemma, and nothing else — §4 says so:
"derived from the API URL's origin so offering the link never costs a second lookup". So every answer
about a lemma that has no Wiktionary page still carries a link, and the pane renders it as a live
`<a href>`: the reader clicks through to «Такой страницы в Викисловаре нет». The etymology itself
already says «сгенерировано, не проверено» in that case — the pane knows the lookup found nothing, but
not *why*: a page that is missing and a page that exists without an «Этимология» section look the same
from `etymologyFromPage()`'s `null`.

## The facts, measured 2026-10-21 (`ru.wiktionary.org/w/api.php`)

| Request | Answer |
| --- | --- |
| `action=query&titles=подрыв&format=json&formatversion=2&redirects=1` | `{"query":{"pages":[{"pageid":182968,"ns":0,"title":"подрыв"}]}}` |
| `…&titles=неттакогослова123…` | `{"query":{"pages":[{"ns":0,"title":"неттакогослова123","missing":true}]}}` |
| `action=parse&page=неттакогослова123&prop=text…` | `{"error":{"code":"missingtitle","info":"The page you specified doesn't exist."}}` |

The API says `missing: true`; it does not say `missing: false` when the page is there — the key is
simply absent, so the test is `missing === true` and never a falsy check. Every other shape (an
invalid title, an unreadable body, a timeout) means *unknown*, which is not *missing*: a page nobody
could ask about must keep the link it has today.

Lemmas of the article that really are missing, for a test: «донецко-криворожский», «грушевский»,
«боброк», «бандрать», «андрусовский» (of the 200 rare lemmas of 66181, queried in batches of 50).

## Fix

Ask the API first, then read the page only if it is there: `action=query&titles=<lemma>` decides
existence from `missing`, and `action=parse` still fetches the HTML for the «Этимология» section. One
deadline covers the whole lookup (`EXPLAIN_WIKTIONARY_TIMEOUT_MS`), not one per request. The answer
carries `sourceExists: boolean | null` beside `sourceUrl`, and the pane greys the link out — muted,
no `href`, with a `title` saying why — when it is `false`; `true` and `null` keep the link live.

See the spec's §4, §7.1 and §12 item 40.

## Comments

- 2026-10-21: the API facts above were measured against `ru.wiktionary.org` before anything was
  written, and the five page-less lemmas came from batching the 200 rare lemmas of 66181 into `titles`
  queries of 50.

## Answer

Done, as the user asked: `action=query&titles=<lemma>` decides existence from the API's `missing`,
asked **before** the page is read, and `action=parse` follows only when the page is there. No HTML is
scraped and no status code is consulted; a page the API says is missing is not fetched at all.

- `src/routes/read/[slug]/explain/+server.ts`: `lookupEtymology` now returns `Etymology = {text,
  exists}` and delegates to `pageExists()` (`missing === true` → `false`, a numeric `pageid` → `true`,
  anything else → `null`) and `readEtymology()` (the old parse + `etymologyFromPage`), both over one
  `apiJson()` helper. One `AbortController` and one `EXPLAIN_WIKTIONARY_TIMEOUT_MS` timer cover both
  calls — a hanging wiki costs 4008 ms in total, not twice that. `null` still reads the page, so the
  new question can never cost the etymology. The lookup short-circuit is `exists === false` alone.
- `src/lib/explain.ts`: `ExplainAnswer.sourceExists: boolean | null` documents the three values.
- `src/lib/components/AnswerBody.svelte`: `sourceExists === false` renders `<span class="source-link
  missing">` — same words, `--fg-muted`, `cursor: default`, `title` «Такой страницы в Викисловаре
  нет» — instead of the `<a>`.

Measured in the production build on port 3222: ¶70 token 54 («Бандеру» → lemma «бандрать», no page)
answered `cached:false`, `sourceExists:false`, `sourceUrl:…/wiki/бандрать`, `sourceText:null`,
`etymologySource:"model"`, and the pane rendered the greyed span — `rgb(106, 101, 93)`, no `href`, no
anchor in the block — under «сгенерировано, не проверено». ¶1 token 0 («Недавно», page exists)
answered `sourceExists:true` from the cache and kept its live link (`rgb(138, 47, 47)`,
`target="_blank"`) with the quoted text. `EXPLAIN_WIKTIONARY_URL=off` → `sourceUrl:null` and nothing
rendered; an unreachable wiki → `sourceExists:null` and the link stays live; a hanging wiki → 4008 ms
total. `bun run check` 302 files / 0 errors / 0 warnings, `bun run build` clean, no console errors.
