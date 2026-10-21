# Spec: объяснение слова — an explanation pane fed by a model

Status: draft — needs grilling (see Open questions); trigger and placement revised 2026-10-19, what a
Tab step does to an open pane revised 2026-10-20 (Q6)
Date: 2026-10-19
Feature slug: `word-explanation`

## 1. What it does

Clicking a word in the Russian sentence of the **sentence pane** — the one holding the current RU/EN
pair — asks the server to explain that word in simple Russian, with etymology. The answer **takes over
the article pane** (the left column) until it is closed: scrollable, a × at its top right, the same key
that already undoes things in this app, and a `Tab` / `Shift+Tab` step — which puts the three panes back
the way it found them and *then* moves on, so a reading key never leaves the reader on the overlay (Q6).
The click stays where it was, in the sentence pane, so the word and the sentence it came from stay on
screen while the answer replaces the text you were reading;
closing puts the article back where it was.

The article pane itself is **plain text**: no word in the article is clickable any more, and the
rare-word ranking that used to drive those buttons is now only data (kept in the JSON, still emitted by
the pipeline). The paragraph-translation pane and the sentence pane keep doing exactly what they do
today.

## 2. Decisions

| Decision | Why | Rejected |
| --- | --- | --- |
| **Server side**, one endpoint under the reader route | The model key must never reach the browser, and a limit the client can ignore is not a limit. The app is already SSR + `adapter-node` with no prerender, so a `+server.ts` costs nothing | Client-side call (key in the bundle); a proxy the user must run themselves |
| **One model call, no agent loop** | Explaining a word needs no second step in the model: the server decides what to fetch, fetches it once, and sends one prompt | A model-driven tool loop — the only source it could call is the one the server already fetches, for more latency and a second way to fail |
| **OpenRouter with `deepseek/deepseek-v4.1-flash`**, keyed by an app-specific `EXPLAIN_API_KEY` (user's call, 2026-10-19, Q8) | It is the only provider this machine has credentials for, it is OpenAI-compatible so the call is one `fetch`, and it is the model omp already runs here — measured at ~2 s and $0.00012–$0.00035 per call with reasoning disabled. The app reads its own variable and never touches omp's credential store | Reading `OPENROUTER_API_KEY` from the ambient environment (couples the app to a global name); a local model (no GPU and no server binary on this machine); an SDK |
| **Etymology: a Wiktionary lookup first, the model's memory only as a fallback** (user's call, 2026-10-19, Q5) | Measured: ru.wiktionary has a real etymology for 8/9 common words and a third of the rarest lemmas, and where it exists it is better than anything a model recalls (праслав. forms, etymon chains). The model is still needed to rewrite it for an A2 reader — dictionary prose is not A2 | Prompt-only (correct but thin, and unverifiable); an agent loop; a second source (en.wiktionary covers 2/10) |
| **The pane says where the etymology came from** — «по данным Викисловаря» or «сгенерировано, не проверено» | The reader can then weigh it. A rewrite of a sourced etymology and a recollection are not the same claim, and the difference is free to display | One disclaimer for both; no source line at all |
| **The open word wears the article's own "current" wash; a Tab step closes the answer and puts the three panes back** (Q6, revised 2026-10-20) | `--sentence` already means "the current one" here, and a clicked word is exactly that; `--accent-soft` keeps its existing meaning (hover, and the marked English runs). `Tab` is how this reader moves through the text, so it must not leave the overlay on screen: the article comes back at the offset it was left at, the paragraph comes back with it, and the pair then moves on. Focus is not handed back to the clicked word — the step owns where the reader is — and the panes come back exactly as `Esc` brings them back, so the two keys differ in nothing but what follows. The dim survives only where the reader has no key in hand: an answer that lands after a Tab (Q11) and a re-click in flight or failed (Q12) | Tab keeps the answer on screen, dimmed, as the cue that the left pane is about another word (the 2026-10-19 rule, replaced); a second close key; closing on a click elsewhere |
| **The pane opens when an answer arrives, not when the word is clicked** (user's call, 2026-10-19, Q11) | Measured: a cold click costs ~2.5 s (a Wiktionary GET plus one model call), a cache hit costs a file read. Swapping on arrival keeps every pre-answer failure — 429, 503, 5xx, timeout, missing key, prompt typo — next to the word with the article untouched, so §11's rule holds with no classify-then-un-swap path and no pre-flight knowledge of the deployment state. The deferred layout change is paid only on cold clicks | Swapping at click time and reporting 429/503/5xx inside the pane; a preflight request; un-swapping on rejection |
| **A second click replaces the answer in place** (user's call, 2026-10-19, Q12) | The pane is already the answer surface; demanding a close first turns a one-gesture lookup into two. The abort plus the monotonic request id already guarantee that a slow answer cannot overwrite a newer one, and the previous answer is kept (dimmed) rather than cleared, so a failed re-click never blanks the pane | Requiring a close first; a queue of answers; clearing the body on the click |
| **The pane shows the fetched Wiktionary text, not only the model's rewrite** (user's report, 2026-10-19, Q17) | The report that "the wiktionary entry is missing" was right in the way that matters: the fetch happened and the label was honest, but the reader saw only a paraphrase — and in the one case examined the paraphrase mangled the very detail the source had been fetched for (`*rъvātī` came back as `*гъvаtī`). Showing the cleaned text verbatim, plus a link to the page, makes the attribution checkable | Only a link to the page; only the label; storing the text in the cache record — it is already in the prompt, and the lookup runs before the cache read, so the response carries it either way |
| **Prompt in a file, read on every request** | The user asked to edit it. Reading per request (a ~2 KB file) means an edit takes effect on the next click with no restart and no rebuild | Prompt in code; prompt cached at boot |
| **The server re-derives everything from the article JSON** | The request carries `{slug, paragraph, tokenIndex}`; the word, lemma, grammar, sentence and translation come from `src/lib/content/<slug>.json`. The client cannot put arbitrary text into the prompt, and the endpoint is not a general Russian-word proxy | Client sends the word and sentence text |
| **A budget of 20 explanations per hour, counted in a cookie** (user's call, 2026-10-20) | The user asked for it, replacing the 2-minute cooldown. The cookie holds the timestamps of the calls inside the hour and its own `Max-Age` is that hour — no server-side clock, no storage, and a reader who reads for an hour gets 20 calls instead of one per two minutes | An in-memory per-IP map (add it later if the endpoint is ever exposed); a server-side counter per session |
| **Cache hits bypass the limit** | A cached answer makes no external call, so there is nothing to throttle; throttling it would only make repeat clicks feel broken | Counting every click |
| **The cache is on disk, keyed by `sha1` of the request that produced it** (user's call, 2026-10-19, Q3) | A hash of the rendered prompt makes the prompt file self-versioning: edit one character and no stale answer can match, with no version counter to maintain. On disk, an answer survives a restart and is paid for once, ever | In-memory only (lost on restart); a `slug\|lemma\|sentence` key that cannot notice a prompt change; cache files committed as fixtures |
| **Model output rendered as text, never HTML** | No markdown renderer, no `{@html}`, no sanitizer needed. Three text fields with `white-space: pre-wrap` | Markdown rendering of the answer |
| **The answer is the lemma, in A2/B1 Russian, three fields, ~120 words** (user's call, 2026-10-19, Q4) | The dictionary form is what gets looked up again; the register is the one the reader can read without a dictionary; the example is what makes the word usable. Russian only — the official translation is one pane away | Explaining the inflected form alone; an English gloss line; letting the model pick its own length and register |
| **pymorphy3 tags go to the model raw, with a legend inside the prompt file** | pymorphy3 ships no Russian grammeme names (`lang.ru` holds only character and prefix tables), so decoding means owning a 40-entry table. A legend in the prompt file is editable, versioned by the hash, and costs ~60 tokens | A tag→Russian table in the server; hoping the model guesses the abbreviations |
| **`response_format: json_object`, three keys validated server-side, prose kept as a fallback** | The three fields are what the pane renders, and the fallback means a model that ignores the format still produces something readable (`parsed: false`) — no answer is ever thrown away | `json_schema` + `structured_outputs` (advertised for this model, unverified, unnecessary while the fallback exists); regex-parsing prose |
| **Article text is plain text; the word is picked in the sentence pane** | The user's call (2026-10-19): no more clickable rare words. The article reads as an article, and word-level interaction happens in the pane that already isolates one sentence — where every word is a candidate, not only the 200 rare ones | Word buttons in the article (the behaviour removed on 2026-10-19); clicking the whole sentence to mean "explain this sentence" |
| **Proper nouns are italic and not clickable** (user's call, 2026-10-19, Q2) | A name is not vocabulary: there is nothing to explain about «Германии» in a text about Germany, and italic marks it as a name at a glance. Every other token in the sentence pane stays a control | Clicking a name and getting a geography lesson; leaving names indistinguishable from words |
| **`proper` is a per-token flag computed in the pipeline** (rule B: first parse has a proper grammeme, or any parse does while the token is not sentence-initial; capitalised; len>1) | Capitalisation is what separates a name from a homograph, so the decision is per token and belongs next to the token offsets — the first change this feature makes to `build_article.py`. Measured on the live articles: 359 tokens in 66181, 233 in 24034, every one verified in context | A `proper` set in the Svelte component; calling pymorphy3 in the browser; reusing the pipeline's lemma-level `lemma_proper`, which marks a lemma rather than a token — one «Вера» (name) would italicise every «вера» (faith) in the article |
| **The answer takes over the article pane**, not a block in the right column | The user's call (2026-10-19, Q1). The article is long and read once; an answer is short and read closely, and it needs room — a 35 % block under the sentence pair holds a few lines and a scrollbar. The click stays in the sentence pane, so the word and its sentence remain visible while the article is replaced, and closing restores the article exactly | A third block under the sentence pair (the first draft); replacing the *sentence pair* (hides the word you clicked); a page-wide modal (loses the sentence you were reading) |
| **Closing is cheap and lossless** — × at the top right, Esc, article back at its scroll offset | The pane replaces the article, so the way back must be obvious and must not cost the reading position. Esc already means "undo the last thing" in this app; the same key closes the answer first | Making the user click a word again to get back; resetting the article to the top on close |
| **Missing configuration is a visible state, not a crash** | No key → the pane says so in Russian and the reader keeps working. A POC that dies on a missing env var is worse than one that says "не настроено" | Throwing at boot; hiding the feature silently |

## 3. Trigger and data flow

The trigger is a click on a word in the Russian line of the sentence pane. That pane already renders
the current sentence as a slice of `ru`; it renders it through the same `ruRuns` + `sentenceGroups`
machinery the article pane used to use, restricted to the current sentence, so every word carries its
exact character offsets and its `ruTokens` index. A click sets `selection.tokenIndex`, and the route
calls `explain(selection)`. Tab stepping and clicks on the sentence as a whole arrive with
`tokenIndex === null` and never request anything.

```mermaid
sequenceDiagram
    participant U as Browser
    participant P as read/[slug]/+page.svelte
    participant E as POST /read/[slug]/explain
    participant C as disk cache
    participant M as model API
    U->>P: click «пороговых» in the sentence pane (¶57, sentence 3)
    P->>P: selection = {paragraph:57, tokenIndex:k, sentence:2}
    P->>E: {slug, paragraph, tokenIndex}
    E->>E: validate against the article JSON
    E->>C: key = sha1(rendered prompt + model|temperature|max_tokens)
    alt cached
        C-->>E: answer
        E-->>P: 200 {…, cached:true} (no cookie touched)
    else not cached
        E->>E: the hour's budget spent (explain_calls)?
        alt spent
            E-->>P: 429 {retryAfter}
        else a slot free
            E->>E: render the prompt file with article data
            E->>M: chat completion
            M-->>E: JSON or prose
            E->>C: store
            E-->>P: 200 + Set-Cookie explain_calls=…, Max-Age=3600
        end
    end
    P->>U: the answer replaces the article pane (right column untouched)
```

A word clicked in the explanation pane's own prose takes the same path with `{source:'pane', word,
sentence}` in place of the paragraph and the token index: no lemma, no tag, no translation, the same
2-minute window and the same disk cache (Q20).

## 4. Server contract

`POST /read/[slug]/explain` (`src/routes/read/[slug]/explain/+server.ts`, JSON in, JSON out).

Request — two shapes, because a word can be asked about in two places (Q20):

```json
{ "source": "article", "paragraph": 57, "tokenIndex": 12 }
{ "source": "pane", "word": "порядок", "sentence": "От него и получилось «порядок»." }
```

Validation, in order — each failure is a 4xx with a Russian `message` the pane can show verbatim. For
`source: "article"` (the default when `source` is absent):

1. body parses as JSON and both fields are integers → else `400 bad-request`
2. `<slug>.json` exists (the same `import.meta.glob` the page uses) → else `404 not-found`
3. paragraph `i === paragraph` exists → else `400 bad-request`
4. `tokenIndex` in range of `ruTokens` → else `400 bad-request`
5. the word's sentence, derived server-side from `token.start` with the same rule the reader uses
   (`sentenceAt(token.start) ?? sentenceAt(max(start, end - 1))`), exists → else `400 bad-request`

For `source: "pane"`: the slug exists (2), and `word` is 1–64 characters and `sentence` 1–400, both
non-empty after trimming → else `400 bad-request`. Nothing else can be checked, because there is nothing
else to check: the click carries the form and the sentence it sits in.

There is no rarity requirement any more: the article carries no clickable rare words, so any word of
the paragraph may be asked about. `rare` only decides whether the frequency placeholders have values.

Prompt inputs, all from the article JSON: the token's `form` and `lemma`; when that lemma is in
`rare[]`, its `grammar` / `freq` (zipf) / `rank` / `forms`; the containing `ruSentences[i]` slice of
`ru`; the paired English sentence(s) via the same range rule as `enRangeFor`; and the article's
`title.ru` + `date`. A pane word has none of the token-derived inputs, so `{{lemma}}`, `{{grammar}}`,
`{{forms}}`, `{{translation}}`, `{{zipf}}` and `{{rank}}` are «нет данных» and only the form, its
sentence, the title and the date are filled — which is what the prompt is written to accept: it asks
for the initial form when the word is an inflected one.

Response, 200:

```json
{
  "word": "пороговых",
  "lemma": "пороговый",
  "grammar": "ADJF,Qual plur,gent",
  "meaning": "…",
  "etymology": "…",
  "example": "…",
  "etymologySource": "wiktionary",
  "sourceText": "Происходит от гл. подрывать, из под- + рывать (рвать), далее от праслав. *rъvātī, …",
  "sourceUrl": "https://ru.wiktionary.org/wiki/%D0%BF%D0%BE%D0%B4%D1%80%D1%8B%D0%B2",
  "cached": false,
  "parsed": true,
  "retryAfter": 0,
  "elapsedMs": 1840
}
```

`lemma` and `grammar` are `null` for a pane word: the header then shows the form alone — no arrow, no
chip — and the Wiktionary lookup used the form, so `sourceUrl` names the page that was actually read.

`retryAfter` is 0 on an accepted answer: the budget is a count, so no wait follows a call, and the
countdown only ever comes from a 429.

`grammar` is the clicked form's own tag string — the case, number and tense of the word actually in
front of the reader — and `null` when the form has none; the prompt's `{{grammar}}` falls back to the
rare entry's tag and then to «нет данных». It used to come from `rare[]` alone, which left most clicks
with «нет данных» in the chip *and* in the prompt (Q18).

`sourceText` is the cleaned Wiktionary text the answer was given — `null` when the lookup found
nothing, a stub included — and `sourceUrl` is the page it came from, derived from the API URL's origin
so offering the link never costs a second lookup. Both are computed on every request, cache hits
included, because the lookup runs before the cache is read (Q16).

`parsed: false` means the model answered prose instead of the requested JSON: the raw text is
returned in `meaning`, the other two fields are `null`, and the pane shows it as one block. That is
a rendering decision, never an error.

Validation of the JSON answer: `meaning` must be a non-empty string; `etymology` and `example` may be
absent and become `null`. Code fences are stripped before parsing, because models add them even when
told not to. Anything else — a preamble, a truncated object, prose — is `parsed: false` with the raw
text in `meaning`.

Errors: `{ "error": "<code>", "message": "<Russian, shown in the pane>", "retryAfter"?: <seconds> }`.

| Status | `error` | When | Pane shows |
| --- | --- | --- | --- |
| 400 | `bad-request` | malformed body, unknown paragraph/token, non-rare word | the message |
| 404 | `not-found` | unknown slug | the message |
| 429 | `rate-limited` | 20 calls already inside the hour (`explain_calls`) | «Не больше 20 объяснений в час» + countdown |
| 503 | `not-configured` | `EXPLAIN_BASE_URL` / `EXPLAIN_API_KEY` / `EXPLAIN_MODEL` missing | «объяснения не настроены» |
| 503 | `prompt-invalid` | prompt file missing, empty, or has unknown `{{placeholders}}` | the message, naming the file |
| 502 | `upstream-error` | non-2xx from the model, unreadable body | «сервис объяснений ответил ошибкой» |
| 504 | `timeout` | past `EXPLAIN_TIMEOUT_MS` | «сервис не ответил вовремя» |

One log line per request — slug, `source`, paragraph (or `-`), word, `cached`, status, `elapsedMs`. The
key is never logged, never echoed in a response, and never sent to the client.

## 5. Cookies: the rate limit and the session

| Property | Value |
| --- | --- |
| Name | `explain_calls` |
| Value | the unix milliseconds of the calls inside the window, `-`-separated, oldest first |
| `Max-Age` | 3600 |
| `Path` | `/read` |
| `HttpOnly` | yes (the client has no business reading or forging it) |
| `SameSite` | `Lax` |
| `Secure` | yes when the request URL is https |

Rules:

- the budget is **20 model calls per browser per hour** (`EXPLAIN_LIMIT` × `EXPLAIN_WINDOW_MS`); the
  cookie is both the count and the clock, so the endpoint stays stateless
- **fewer than 20 calls in the window** → run the call, then set the cookie to the calls still in the
  window plus this one. Entries age out of the list as they leave the window, so the budget refills by
  itself with no cleanup job and no server-side state
- **20 already in the window** → `429` with `Retry-After: ceil((oldest + 3600000 − now) / 1000)`: the
  moment the oldest call leaves the window, which is when a slot frees. The cookie is untouched, so a
  spam of clicks cannot extend anything
- **cookie absent or unparsable** → an empty budget: the next request is accepted
- **cache hit** → neither checked nor set: the answer costs nothing, so it is not throttled
- **a call that fails upstream** (`502`, `504`) does not consume a slot: the reader got nothing, so the
  cookie is left alone (measured: a `502` added no entry)
- the value is used only to count calls and to compute `Retry-After`; it is not a trust boundary
- the check sits **after** the etymology fetch and the cache read, because the fetched text is part of
  the hash (§6, Q16) — so a refused click still costs one Wiktionary GET (measured 0.9 s against the
  local server, of which the refusal itself is microseconds). The alternative is a lookup cache of its
  own or a hash without the etymology, both rejected; a refusal that skipped the fetch would have to
  know the cache key first, which is the thing the fetch produces

This is a courtesy throttle per browser, not a quota: clearing cookies, a second browser or curl
walks past it. Said out loud because pretending otherwise is worse than the limit.

### The session cookie

| Property | Value |
| --- | --- |
| Name | `explain_session` |
| Value | unix milliseconds of the last accepted request |
| `Max-Age` | 3600 |
| `Path` | `/read` |
| `HttpOnly` | **no** — the page reads it, and it holds a timestamp, not a secret |
| `SameSite` | `Lax` |
| `Secure` | yes when the request URL is https |

Set on every 200, cache hit included: a reading session, and reading a cached answer is reading. It is
the clock behind the panel history (§9, Q20) — an hour without a request means the session those panels
belong to is over, and the page watches that hour: a timer armed at every answer drops the panels when
it runs out, so the words menu empties itself and greys out on its own (revised 2026-10-21 — the page
used to notice the hour only on the next arrow press or row pick, which made the reader's own click the
thing that deleted their panels; issue 01). The panel on screen, an answer being read, is left alone:
expiring the session must not take away what the reader is looking at. A reload starts with no panels,
which is what "the history lives in the page" means; the cookie does not pretend otherwise.

## 6. Cache

The answer is cached **on disk**, keyed by the prompt that produced it:

- Key: `sha1(<the exact string sent to the model>)`, hex. The rendered prompt already contains the
  word, its lemma, the grammar, the sentence, the translation, the title and the date, so the hash
  covers the whole question — and it makes the prompt file self-versioning: edit one character of
  `prompts/word.md` and every cached answer stops matching, with no version bookkeeping anywhere.
- The hashed string also covers what is *not* in the prompt file: the model id, temperature and
  `max_tokens` are appended before hashing (`…\n--\n<model>|<temperature>|<max_tokens>`). The same
  prompt sent to a different model is a different answer, and switching models must not silently serve
  the old model's.
- Location: `EXPLAIN_CACHE_DIR`, default `.cache/explanations`, one file per answer, `<sha1>.json`.
  `.cache/` joins `.gitignore`: it is generated, and it is the only thing this feature writes.
- File contents: `{promptHash, createdAt, slug, paragraph, ruSentence, word, lemma, model,
  etymologySource, answer: {meaning, etymology, example}, raw}` — the raw model response is kept so a
  bad answer can be diagnosed without paying for the call twice. The 200 body is served from `answer`;
  `cached: true` is added on read. The fetched Wiktionary text is *not* stored separately: it is part
  of the hashed prompt, so a changed page invalidates the cached answer by itself.
- Read on every request; written after a successful model call, to `<sha1>.json.tmp` and then renamed,
  so a half-written file can never be read as an answer.
- No eviction: ~1 KB per answer, one file per (word, sentence, prompt) ever asked about. Deleting the
  directory is the eviction policy.
- The in-memory `Map` is gone — one `readFile` per click is cheaper than the bookkeeping, and a cache
  a restart throws away is not a disk cache. In-flight de-duplication stays: a second identical
  request while the first is running awaits the same promise instead of making a second call.
- A cache hit is checked **before** the cookie (§5) and never sets it (Q3).
- If the directory cannot be read or written, the request still succeeds: log it, serve the answer,
  skip the cache. A cache is an optimisation, not a dependency.

## 7. Prompt file

- Path: `EXPLAIN_PROMPT_PATH`, default `prompts/word.md`, resolved against `process.cwd()`.
- Read on every request. Empty file → `503 prompt-invalid`.
- Substitution is plain `{{name}}` → value, no templating language. Known names:

| Placeholder | Value |
| --- | --- |
| `{{word}}` | the clicked form, as it appears in the text |
| `{{lemma}}` | dictionary form |
| `{{grammar}}` | the clicked form's pymorphy3 tag string, verbatim — the rare entry's when the token carries none, «нет данных» otherwise |
| `{{forms}}` | the other forms of the lemma found in this article, comma-separated — «нет данных» as above |
| `{{sentence}}` | the Russian sentence the word sits in |
| `{{translation}}` | the official English translation paired with that sentence |
| `{{etymology_source}}` | the cleaned ru.wiktionary «Этимология» for the lemma, or «нет данных» (§7.1) |
| `{{title}}` | `title.ru` |
| `{{date}}` | the article date |
| `{{zipf}}`, `{{rank}}` | corpus frequency and its rank in this article's rare list — «нет данных» as above |

- Any other `{{…}}` in the file → `503 prompt-invalid` naming it. A typo in the prompt file must be
  loud, not a silently worse prompt.
- The file is the whole prompt: the server sends it as a single `user` message. No system message is
  prepended, so the user keeps full control of the instructions.

### Etymology lookup

Before the model is called, the server tries to find a real etymology: a model recalling one from
memory is the weakest part of this feature, and ru.wiktionary has something for about a third of the
rarest lemmas and most common words.

- `GET {EXPLAIN_WIKTIONARY_URL}?action=parse&page=<lemma>&prop=text&format=json&formatversion=2&redirects=1`
  with an identifying `User-Agent` (`EXPLAIN_USER_AGENT`) — Wikimedia answers 403 to anonymous fetches.
- Only the `Этимология` section is taken; it ends at the next heading. Tags and the inline CSS
  Wikimedia embeds are stripped, the heading is dropped, whitespace collapsed, and the result capped at
  1200 characters.
- Stubs count as absent: «Происходит от ??», «От ??», «Происходит от», or anything under 80 characters
  after cleaning. They are the majority — 22 of the 30 rarest lemmas in 66181, 18 of 30 in 24034.
- Any failure — timeout (`EXPLAIN_WIKTIONARY_TIMEOUT_MS`, default 4000), non-200, unparsable page —
  means «нет данных» and the prompt-only branch runs. The lookup never fails the request.
- No lookup cache of its own: the fetched text is part of the rendered prompt, so the answer cache's
  hash covers it, and the budget bounds how many misses one browser can buy.
- **Consequence, found while implementing (Q16)**: because the hash *is* the rendered prompt and the
  etymology is inside it, the lookup runs before the cache check — so a cache hit still costs one
  Wiktionary GET (measured ~0.4 s), and a Wiktionary outage changes the rendered prompt, which misses
  the cache and buys a fresh model call for a word already answered. The cookie no longer bounds those
  fetches either, since a cache hit never consults it.
- Coverage measured 2026-10-19 on the rendered pages: 2/30 among the 30 rarest lemmas of 66181, 10/30 in
  24034, 8/9 among common words. en.wiktionary does not earn a second request (2/10).
- The fetched text is returned in the 200 as `sourceText` and shown in the pane verbatim (Q17), with
  `sourceUrl` as a link, so the reader can check the paraphrase against the source it credits.
- The **lemma** is looked up, not the clicked form: «пороговых» → «пороговый», a stub, while «порог» is
  rich. A base-word fallback would be a real improvement; it is a non-goal for now, and this is where it
  would go.
- Licensing: Wiktionary text is CC BY-SA, and the pane credits it and links the page it came from
  (Q17), which is the attribution that licence asks for. The repo's `LICENSE` covers the code and the
  documentation only: the article texts are kremlin.ru's, and the tag table in `src/lib/grammar.ts`
  stays CC BY-SA, from OpenCorpora.

- Initial content of `prompts/word.md` (to be edited, this is the draft to grill):

```text
Ты объясняешь одно русское слово человеку, который учит русский язык и читает тексты Кремля.

Слово в тексте: {{word}}
Словарная форма: {{lemma}}
Грамматика: {{grammar}} — теги pymorphy3 (OpenCorpora), через запятую и пробел. Расшифровка:
  часть речи — NOUN, ADJF (полное прилагательное), ADJS (краткое), VERB, INFN, PRTF (причастие),
  GRND (деепричастие), ADVB (наречие), NUMR, NPRO, PREP, CONJ, PRCL, INTJ;
  род — masc/femn/neut, число — sing/plur, падеж — nomn/gent/datv/accs/ablt/loct,
  время — past/pres/futr, вид — perf/impf, наклонение — indc/impr, одушевлённость — anim/inan.
Другие формы этого слова в тексте: {{forms}}
Предложение: {{sentence}}
Официальный английский перевод этого предложения: {{translation}}
Источник: {{title}}, {{date}}
Этимология из Викисловаря: {{etymology_source}}

Отвечай на простом русском языке — так, как объясняют иностранцу, который читает со словарём.
Никакого канцелярита, никаких англицизмов, никаких сокращений вроде «т.е.».
Уровень — A2–B1: короткие предложения, самые частые слова.
Весь ответ — по-русски: не переводи слово на английский и не давай английских пояснений.

Что нужно:
1. Значение — что слово значит именно здесь, в этом предложении. Если слово многозначное, назови
   значение, которое работает в этом предложении, и одной фразой — остальные.
2. Этимология — откуда слово пришло: исконное или заимствованное, из какого языка и когда, через
   что прошло, какие родственные слова есть в русском.
   Если выше есть этимология из Викисловаря (не «нет данных») — перескажи её простыми словами и
   ничего не добавляй от себя. Если её нет — отвечай по своим знаниям, но если не уверен, скажи
   «точных данных нет». Не выдумывай этимологию: лучше «точных данных нет», чем красивая догадка.
3. Пример — одно короткое своё предложение с этим словом. Не бери предложение из текста.

Требования:
- Если {{word}} — форма, назови начальную форму и скажи, как она образована.
- Не пересказывай предложение целиком и не переводи его — объясняй слово.
- Всего не больше 120 слов.
- Ответ — только JSON, без пояснений вокруг:
  {"meaning": "…", "etymology": "…", "example": "…"}
```

## 8. Provider configuration

Read through `$env/dynamic/private` (runtime, so a key can be added to `.env` without a rebuild —
`$env/static/private` would bake it in). No SDK, no new dependency: `fetch` against an
OpenAI-compatible `POST {EXPLAIN_BASE_URL}/chat/completions`.

Facts measured on this workstation (2026-10-19), before any provider was chosen:

- Every endpoint tested answered at the TLS layer from here: `api.openai.com`, `openrouter.ai`,
  `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.mistral.ai`, `api.deepseek.com`,
  `api.groq.com` (401/403 without a key; the two that serve unauthenticated listings returned 200 with
  a body). The kremlin.ru timeout is a host-specific block, not an egress restriction, so a
  server-side call to one of these works from this machine. This was a reachability check, not a
  latency one — no timings were measured.
- Local inference is not available: no GPU (`/proc/driver/nvidia` absent), no `ollama` /
  `llama-server` / `vllm` binary, nothing listening on 11434 / 8080 / 8000 / 1234, 8 cores, ~15 GiB
  RAM. The provider must be remote, which is what this design assumes.
- Credentials on this machine: an OpenRouter key in `OPENROUTER_API_KEY` (also in `~/.secrets`, which
  `.bashrc` / `.zshrc` source) and a second, different OpenRouter key in omp's own store
  (`~/.omp/agent/agent.db`). No `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`,
  `DEEPSEEK_API_KEY`, `GROQ_API_KEY` or `MISTRAL_API_KEY` is set. omp's default model is
  `openrouter/deepseek/deepseek-v4.1-flash` (`~/.omp/agent/config.yml`). The app reads its own
  `EXPLAIN_API_KEY` and never touches omp's credential store.
- `.env` is loaded by Vite in development only. `node build/index.js` does **not** read it, so a
  production run needs the variables in the process environment (`node --env-file=.env build/index.js`).
- The provider and the model id are decided (Q8, §2): OpenRouter with `deepseek/deepseek-v4.1-flash`.
  The measurements above are why.

| Variable | Default | Meaning |
| --- | --- | --- |
| `EXPLAIN_BASE_URL` | — (required) | e.g. `https://openrouter.ai/api/v1` |
| `EXPLAIN_API_KEY` | — (required) | bearer token |
| `EXPLAIN_MODEL` | — (required) | model id sent as `model` |
| `EXPLAIN_PROMPT_PATH` | `prompts/word.md` | prompt file |
| `EXPLAIN_TIMEOUT_MS` | `20000` | abort → 504 |
| `EXPLAIN_MAX_TOKENS` | `400` | the answer is capped at ~120 words by the prompt |
| `EXPLAIN_TEMPERATURE` | `0.3` | etymology should be boring, not creative |
| `EXPLAIN_CACHE_DIR` | `.cache/explanations` | one `<sha1>.json` per answer; `.gitignore`d |
| `EXPLAIN_WIKTIONARY_URL` | `https://ru.wiktionary.org/w/api.php` | the etymology lookup; empty or `off` disables it |
| `EXPLAIN_WIKTIONARY_TIMEOUT_MS` | `4000` | a slow dictionary must not eat the model's timeout |
| `EXPLAIN_USER_AGENT` | `ru-reader/0.1 (personal reading tool)` | Wikimedia 403s anonymous fetches; put a real contact here |

Request body sent upstream: `{ model, temperature, max_tokens, response_format: {type:'json_object'}, reasoning: {enabled: false}, messages: [{role:'user', content: <rendered prompt>}] }`.

`reasoning: {enabled: false}` is not decoration. Measured 2026-10-19 against `deepseek/deepseek-v4.1-flash`
with the real prompt: the default configuration spent **384–400 of the 400-token budget on reasoning
tokens** — `finish_reason: length`, the JSON truncated mid-string, and one of three calls returned
`content: null` (the whole budget went to thinking, nothing to the answer). With `reasoning:
{enabled: false}` — or `{effort: 'none'}`, or `reasoning_effort: 'none'`, all three verified — the same
prompts returned valid JSON in ~2 s. Measured cost per call, reasoning off: **$0.00012–$0.00035**, not
the $0.00004 the published per-token price implies.
`.env` and `.cache/` are **not** ignored by the current `.gitignore` — the implementation adds both in
the same change; a `.env.example` with the three required names and no values is committed.

Privacy, stated because it is real: the sentence, its translation and the word are sent to a
third-party model. The texts are public kremlin.ru material, so this is acceptable — but it is a
consequence, not an accident.

## 9. Client behaviour

- Components: `ExplanationPane.svelte` is the panel being read — pure display, the answer in, plus
  `onclose` and `onask` callbacks out. It owns three controls — the ×, the grammar chip and its popup, and
  every word of the answer's prose — and no state beyond them, except the popup's open flag, which the page
  holds because Escape is a layer stack there (§10, Q19). `AnswerBody.svelte` renders that prose for this
  pane and for `OriginPane.svelte`, the read-only copy that takes the paragraph pane while a pane word's
  explanation is up (Q24): one rendering, so the two cannot drift.
- State in `read/[slug]/+page.svelte`: `{status: 'idle'|'loading'|'ready'|'error', request: ExplainRequest, word, answer, openWord, originOf, selection, message, retryUntil, history, cursor, tooltip}` — the page owns the
  state machine, the components own their markup.
- `explain(sel)` is called from the `onSelect` handler (an event, not an `$effect`) when
  `sel.tokenIndex !== null`, and `askPane(word, sentence, field)` from the pane's own word controls; both
  go through one `askWord(request, word, open)`, and both do nothing when the same request is already on
  screen or in flight.
- One `AbortController` and a monotonic request id: a new click aborts the old fetch, and a response
  whose id is not the latest is dropped — a slow answer can never overwrite a newer one.
- **A second click replaces the answer in place** (Q12), and the previous answer is never cleared. It
  stays on screen, already dimmed by the staleness rule (the selection has moved to the new word's
  sentence), with a «спрашиваю «B»…» line above it; the pane's header keeps naming the answer that is
  on screen. When B's answer arrives, header, body and word wash switch together. If it fails, the
  previous answer stays with B's error above it. Clicking the word whose answer is already displayed, or
  whose request is still in flight, does nothing.
- **The pane swap.** `section.pane-ru` renders `ExplanationPane` instead of `RussianPane` while an
  explanation is open, so article and answer are never both on screen. The pane's `scrollTop` is read
  before the swap and written back after the article is mounted again: hiding a scroll container
  resets its scroll position, so the offset is restored explicitly rather than assumed.
- The article pane's own centring must not fight that restore: `RussianPane` skips the centring effect's
  first run in every mount and centres only when the selection actually changes, so the offset the page
  writes back after a close stands (measured: `scrollTop` identical before the word click and after
  Esc; before the guard it drifted ~93 px as the smooth centring won the race).
- **The swap is triggered by the answer, not by the click** (Q11): `section.pane-ru` keeps rendering
  `RussianPane` while the request is in flight and after any failure, and renders `ExplanationPane`
  only once a response carrying an answer has arrived — which on a cache hit is milliseconds. The word
  line is rendered from the local `ruTokens` entry, so it is available immediately, but it waits for
  the pane it belongs to.
- While `status === 'loading'`, the sentence pane shows «спрашиваю…» next to the clicked word and the
  article is untouched. If the answer arrives after the selection has moved on, the pane still opens,
  and it opens dimmed (§9's staleness rule) with its header naming the word.
- **Focus.** Opening moves focus to the explanation region (`tabindex="-1"`), so Esc works from
  anywhere and a screen reader reads the answer; closing with the × or Esc returns focus to the word
  that was clicked. A Tab step does **not**: it is the step that decides where the reader is, and the
  ring would otherwise ride into the new sentence on whatever element the old position became — the
  sentence pane's word buttons, the article's links and the menubar's own buttons included, so a step
  drops whatever focus the reader left inside the frame.
- **Esc is layered** (Q9a, user's call, 2026-10-19): with an explanation open it closes that; with none
  open it clears the selection, as it does today; with neither, the key is left to the browser rather
  than swallowed. One key, the most recent thing first — the convention dialogs use. No second key.
- **The menubar's popups are layers of that stack too** (Q26): an open menu is above the grammar popup,
  so the first Escape closes the menu — and, when a row had the focus, hands the focus back to the
  button it came from — the next closes the popup, then the answer, then the selection. ↓ and ↑ walk the
  open menu's rows and stop there, because the page's own arrow handler walks the session's panels; a
  `Tab` step closes a menu as it closes the overlay and then drops the focus the step supersedes, the
  bar's own buttons included; a pointer press outside the bar closes it. A popup nothing dismisses is a
  trap, and a menubar entry that does nothing is worse than one that says so (`disabled`).
- Cooldown: `retryAfter` from a 200 or a 429 sets a local deadline, but the client does **not** gate on
  it — a click always sends the request, because a word asked about before is served from the cache
  without touching the window (Q3). The deadline drives the countdown line only, in whole seconds,
  updated once a second. Gating locally would make cache hits impossible.
- **A refusal never takes the pane**, and with the swap on arrival it cannot: the pane is not rendered
  until there is an answer. While the article is showing, a 429, a 503 or a 5xx leaves the article
  alone and puts the message in the sentence pane, next to the word that was clicked — replacing the
  text you are reading with «не больше 20 объяснений в час» is worse than not answering. When the pane
  is already open (a re-click), a failed re-click keeps the last answer, dimmed, with the message above
  it.
- A selection change without a word **closes the answer**: `Tab` and `Shift+Tab` put the article and the
  paragraph back the way `Esc` does, at the offset the swap saved, and only then move the pair (Q6,
  revised 2026-10-20). The two keys differ in nothing but what follows — the step — because a reading
  key that leaves the overlay on screen makes the reader look at a word they moved away from. Nothing
  else can change the selection while the pane is open: the article is not on screen to be clicked, and
  an arrow restores a panel together with the pair it was asked about (Q23). A request still in flight
  when the key lands is dropped, as it is on close.
- **The status line has two tones** (user's request, 2026-10-20): «спрашиваю…» and its countdown are
  muted (`--fg-muted`), while a failure — a 429 refusal, a 503, a 5xx, the client's own
  «Сервис объяснений не ответил.», countdown included — wears the palette's `--error`
  (`#b3261e` light, `#ff8f7a` dark), added for this. Both places the line appears carry the same tones:
  next to the clicked word in the sentence pane, and the explanation pane's own `.state` line above a
  kept answer. Not `--accent`: accent means a link and hover here, and a failure the reader has to act
  on is neither. Reported as a problem to fix: «Сервис объяснений не ответил.» rendered like a wait.
- Accessibility: the explanation region is `aria-live="polite"` with `lang="ru"`, so arriving text is
  announced. Enter/Space on a focused word button already triggers the click path, so the keyboard
  route works.
- The explanation is fetched with the default `credentials: 'same-origin'`, which sends the cookie.
- The source line under the etymology reads «по данным Викисловаря» when `etymologySource` is
  `wiktionary`, and «сгенерировано, не проверено» otherwise. It is hidden entirely when `parsed` is
  false — there is no etymology field to attribute.
- The source block sits at the end of the pane at full contrast: the attribution line, a collapsed
  `<details>` «Текст из Викисловаря» holding `sourceText`, and a link to `sourceUrl` naming the lemma
  (Q17). The model's prose dims; the attribution and the way to check it do not.
- The open word carries the article's own "current" wash: `background: var(--sentence)`, hover
  `--accent-soft`, `border-radius: 2px`, `aria-current="true"`, and the browser's focus ring left
  alone. The tint exists only while the sentence pane still shows that word's sentence — after a Tab
  step the pane is closed and the word is rendered nowhere, and the pane header is the thread back to it
  for the panels an arrow still walks (Q23).
- The sentence in the sentence pane gets no tint of its own: the pane holds one sentence, so a tint
  would say nothing, and the sentence-level tint belongs to the article, which the answer is covering.
- Staleness is derived, never stored, and it is a **sentence** comparison: the explanation pane owns
  `openWord`, an article word's paragraph, sentence and index or a pane word's form and field; stale
  means the current selection is not that sentence. Since 2026-10-20 a Tab step closes the pane instead
  of moving the selection under it (Q6), so this comparison is what the two cases with no key in the
  reader's hand still rest on: an answer that lands after a Tab (Q11) and a re-click in flight or failed
  (Q12). Comparing the sentence rather than `tokenIndex` is what keeps the two apart, because a Tab
  clears `Selection.tokenIndex` and would leave a `tokenIndex` comparison stale forever — and the wash
  returns with the sentence, because `SentencePane` tints the button whose index equals
  `openWord.tokenIndex` whenever the selection shows that sentence. While stale the answer **body** dims
  to `0.55`; the header, the source line and the × keep full contrast, because a dimmed close button
  reads as disabled.
- **A word of the answer is itself askable** (Q20): the pane's three fields are tokenised in the
  browser (`src/lib/explain-text.ts`, with the pipeline's own word and sentence rules) and every
  Cyrillic word becomes a `button.tok` wearing what the sentence pane's tokens wear. The click sends
  `{source:'pane', word, sentence}` — the sentence the word sits in is the whole context there is — and
  the answer replaces the panel in place, exactly as a re-click does. The clicked word wears
  `--sentence` in the field it was clicked in, `aria-current="true"` included: the marking moves into
  the pane because the word is not in the article and nothing else marks it.
- `openWord` is a union for that reason: `{source:'article', paragraph, sentence, tokenIndex}` or
  `{source:'pane', form, field}`. Staleness compares a sentence only for the article word — a pane word
  has no selection to go stale against, so its panel dims only while a re-click is in flight or has
  failed. `focusWord` and the sentence pane's wash apply to the article case alone.
- A pane ask that fails lands **in the pane**, above the kept answer, and never in the sentence pane: a
  pane word has no button in the article to hang the line off, so `note` is null for those requests and
  the pane's own `.state` line carries the message and the countdown.
- **← and → walk the session's panels** (Q20): `history: {request, answer, openWord, selection}[]` with a
  cursor, appended on every answer — a cached one included, because nothing is re-requested: a remembered
  panel is put back from memory, so walking back and forth costs no request, no window and no waiting.
  Each panel carries the pair the right column was on when it was asked for (Q23) — for a word of the
  article the click has just set it to that word's sentence, for a word of the explanation the sentence
  the reader had left there — and putting a panel back restores it, so the sentence pane and the
  paragraph pane follow, the explained word wears its mark again, and the dim matches the state the
  panel was displayed in. The pair is read at the ask, not when the answer lands, so a Tab during a
  request cannot move the panel's own context out from under it. Asking after stepping back drops the
  panels ahead of the cursor, browser-style. With the pane closed, either arrow brings back the panel it
  was closed on. Shift/⌘/⌃/⌥ plus an arrow is left to the browser, so Shift+← still extends a selection
  in the text, and an arrow that walks no panel is not swallowed.
- **A word taken from an explanation takes the explanation with it** (Q24): while such a panel is on
  screen the paragraph pane holds the answer it was taken from — scrolled to the field the word sits in,
  with the word washed — because the article's paragraph is no context for a word that came out of an
  explanation. It is read-only: the ×, the grammar chip and the clickable words belong to the panel being
  read, on the left; this one is what that panel is read against. The origin is a property of the panel
  on screen, held beside `answer` and `openWord` and stored on the history entry, so a walk carries it
  both ways and the session's panels can be dropped without taking it from a panel still on screen. The
  sentence pane keeps the article pair the word was asked from. `AnswerBody.svelte` renders the prose of
  an answer for both panes: the interactive pane passes `onask`, the origin copy does not, and the same
  text rendered twice would drift.
- **The session's clock is the `explain_session` cookie** (§5): the page reads it when an answer
  arrives and arms one timer for the hour's end, and an hour without a request means the panels are
  dropped — the one on screen, an answer being read, is left alone — with the menu that lists them
  closed as they go. Nothing the reader does is what drops them (revised 2026-10-21, issue 01: a row
  pick used to empty the list instead of opening the row). No cookie readable — a browser that keeps
  none — and the answer's own time is the clock instead, so the hour still holds. The history lives in
  the page, so a reload starts with none: the cookie decides the lifetime, not the storage.

## 10. Layout

```text
┌─ Тексты ▾ · Слова ▾ ─────────────────────────────────────────────────────────┐ ← .menubar
├─ Объяснение слова ────────────────┬─ English translation ──────────────────────┤
│ пороговых → пороговый  [ADJF]  ×  │ перевод абзаца, пара предложений подсвечена │ ← .en-para
│                                   ├────────────────────────────────────────────┤
│ Значение …                        │ RU: … пороговых … — клик по слову          │ ← .en-sentence
│ Этимология …                      │ EN: …                                      │
│ Пример …                          │                                            │
│ сгенерировано, не проверено       │                                            │
└───────────────────────────────────┴────────────────────────────────────────────┘
  ↑ section.pane-ru while an explanation is open; the article comes back on close
```

- **The menubar** (Q26, the user's request, 2026-10-20) is the first row of the frame: «Тексты» lists
  every other text, «Слова» lists the session's explanations, and «Словарь» is a link to the glossary
  page — the two menus are buttons over popups, the third is an `href`, and the row cannot tell them
  apart (Q27). It replaced the article header's
  «Другие тексты:» line (Q22's answer, now withdrawn): that line was the reader's only way to another
  text and it went away whenever an explanation took the article pane, which the menubar never does.
  The texts stay one click away instead of a URL edit, and the catalog still comes from one reader —
  `loadCatalog()` in `src/lib/server/catalog.ts`, which the index's loader uses too, so the two cannot
  disagree about which texts exist; the globs live under `$lib/server` so a client import cannot pull
  whole articles into the browser bundle.
- The words menu lists what the **session** has, never the disk cache (§6, Q26): rows are
  `answer.word → answer.lemma` with the paragraph of an article word after them, so two asks about the
  same word can be told apart, and the row of the panel on screen wears `aria-current="true"`. It is
  `disabled` — greyed out, no click, `title` saying why — until an answer has arrived, and picking a row
  is what an arrow does: `show()` from memory, no request, no window. The hour's end takes the rows
  away by itself (the timer behind `history`), so a row that is offered is a row that opens: the pick
  never empties the list (revised 2026-10-21, issue 01 — it used to, on a session an hour old).
- The far right of the bar is the way out of the reader: the GitHub mark, an 18 px icon drawn in
  `currentColor` and muted until hovered, `margin-left: auto`, linking to the repository in a new tab
  (`target="_blank"` + `rel="noopener noreferrer"`). It carries the name it cannot show —
  `aria-label` and `title`, «Исходный код на GitHub» — because a `svg` with no text names nothing, and
  it is the only link on the page that leaves the app.
- The bar is a row of a column flex frame (`.app`), so the two columns take what is left of the
  viewport; at ≤ 899 px the frame is as tall as its content, the bar sticks to the top and the
  translation column sticks directly under it, at the height the bar measures itself (`--menubar-h`),
  rather than at a guessed constant.
- The paragraph pane holds the article's paragraph, and in place of it the explanation a pane word came
  from while that word's explanation is on screen (Q24, §9): same pane, same scroll container, its own
  measure. One pane, two things it can be read against.
- `section.pane-ru` is the swap point: `<RussianPane>` normally, `<ExplanationPane>` while an
  explanation is open. The pane keeps its `overflow-y: auto`, so the answer scrolls in the same
  container the article did; the × lives in a header row that is `position: sticky; top: 0` inside
  that container — a close button that scrolls out of view is not a close button.
- The explanation is prose: give it its own measure (~46rem, the cap the home route's `main` uses)
  rather than the pane's full width. The article pane has no cap of its own today; leave it alone.
- The Russian line of the sentence pane renders through `ruRuns` + `sentenceGroups` limited to the
  current sentence, so every word is a control carrying its exact offsets and its `ruTokens` index.
  Word-level controls live there and only there; the article pane keeps one handler, on the sentence.
- Proper nouns render italic (`class="proper"`) and are **not** controls; every other token is a
  button. The rule lives in the pipeline (§2, rule B) and arrives as `ruTokens[].proper`, so the
  components do no morphology: `ruRuns` carries the flag into both panes, and the article pane applies
  the same class with no handler attached.
- The word line shows the clicked form and the lemma, and dims when the current selection no longer
  pins that word.
- The header's grammar chip shows the clicked form's tag and is **not rendered** when there is none
  (Q18): a chip reading «нет данных» tells the reader nothing and costs a line of the header.
- The chip explains itself on hover and on focus (Q19): a `role="tooltip"` popup 6 px under the chip,
  one row per tag component — the code in a monospace column, what it means in the other. The rows come
  from `src/lib/grammar.ts`, which carries the dictionary's own `grammemes.json` (name → Russian name)
  minus its category nodes, so any tag a future article produces is explainable; `UNKN` is special-cased
  because it is not a grammeme but pymorphy3's answer for a form it does not know. The popup is
  `position: fixed` — the pane is a scroll container and would clip an absolute one — placed from the
  chip's box and re-placed on window scroll and resize. The chip is a `button` so the keyboard can reach
  it, which is also how a tap opens the popup on a touch screen.
- The popup is not interactive, so dismissal needs no grace period: it goes when the pointer leaves the
  chip, on blur, when a new answer arrives (the tag it explained is gone), and on Escape — which is why
  the popup is the **first** layer of the page's Escape stack, above the answer (Q19).
- The word controls are `button.tok`: **nothing at rest** — the answer is prose until the pointer is on
  a word, which is the only moment the click is available, so a field never reads as a wall of chips
  (the user's call, 2026-10-20) — `--accent-soft` on hover, `--sentence` wash while one is the open
  word, `border-radius: 2px`, and no custom focus style — the default ring is what the article's
  sentence buttons already use.
- Narrow screens (≤ 899 px) — **not implemented, Q10**: the reader stacks and the article pane
  sits *below* the sticky 60vh right column, so a swap in place would put the answer off-screen under
  the column the click came from. The proposal on the table is a fixed overlay covering the viewport,
  own scroll, `z-index: 3`, same × and Esc, article left mounted underneath so the page scroll needs no
  save or restore at this width. Measure at 400 px and 900 px rather than assuming.

## 11. Failure modes

| Cause | What the user sees |
| --- | --- |
| no key configured | «Объяснения не настроены: нет EXPLAIN_API_KEY» next to the word in the sentence pane; the article is untouched |
| prompt file missing / typo'd placeholder | «Промпт не найден: prompts/word.md» / «Неизвестные подстановки: {{lemma2}}» — same place |
| second click inside 2 minutes | cooldown line + countdown next to the word; the request is still sent (Q3), so a word already in the cache is answered instead of refused |
| model returns prose, not JSON | the prose as the answer body, `parsed: false` — no error state. It is an answer, so it opens the pane |
| model API down / 5xx | «Сервис объяснений ответил ошибкой (502)» next to the word; if the pane is already open, the last answer stays, dimmed, with the message above it |
| the endpoint never answers — the dev server was stopped or restarted, or the page reloaded while the request was in flight | «Сервис объяснений не ответил.» in the error colour next to the word. This is the client's own line, from a `fetch` that rejected: **nothing reached the endpoint**, which is why it says this while the wifi is up and while a provider-side failure would read «ответил ошибкой (502)». Look at whether the server is still running before looking at the network |
| slow model | «спрашиваю…» next to the word, then the timeout line in the same place: a request that never produces an answer never hides the article |
| click a word, then `Tab` / `Shift+Tab` | the answer closes and the three panes come back as they were — the article at the offset it was left at, the paragraph with it — and the pair moves on by one; nothing about the word is left on screen but the panel an arrow can still walk back to (Q23) |
| cache directory unreadable or read-only | nothing visible: the answer is still served, the entry is skipped, one log line |
| the model spends the budget on reasoning | `finish_reason: length` or `content: null` → 502 `upstream-error`, never rendered as an answer. Prevented in the request (§8), caught here anyway |
| Wiktionary unreachable, slow, or a stub | nothing visible: the answer is prompt-only and the source line says «сгенерировано, не проверено» |

The line between the two halves of that table is the answer's arrival (Q11): anything that fails before
an answer exists leaves the article alone and reports itself in the sentence pane, where the click was.
Because the pane opens only on arrival, that is *every* pre-answer failure without exception — no
classification, no un-swap, no pre-flight knowledge of the deployment state. Once an answer is on
screen, a later failure reports in the pane above the previous answer. Replacing the article with an
error message would punish the reader for a server-side problem.

## 12. Verification

Server, against a local stub provider (no key, no cost, deterministic):

1. `EXPLAIN_BASE_URL=http://127.0.0.1:<port>/v1 EXPLAIN_API_KEY=x EXPLAIN_MODEL=stub
   EXPLAIN_CACHE_DIR=.cache/test` — the stub returns a fixed JSON answer and echoes the request it
   received.
2. POST `{source:'article', paragraph:57, tokenIndex:<пороговых>}` → 200,
   `Set-Cookie: explain_calls=<one timestamp>; Max-Age=3600; HttpOnly; Path=/read`, `cached:false`; the
   stub's received prompt contains the word, the lemma, the sentence and the translation from the JSON
   — asserted, not eyeballed.
3. The answer is on disk: one `<sha1>.json` in `EXPLAIN_CACHE_DIR`, its `promptHash` equal to the
   `sha1` of the string the stub received plus the model line, and its `word` / `slug` / `paragraph`
   matching the request.
4. Immediate second POST, same cookie, same word → 200 `cached:true`, no cookie set, and the stub
   received **no** second request — the cache is consulted before the window.
5. Same cookie, a *different* word 19 more times → 19 calls; the 21st → 429 + `Retry-After` ≤ 3600 and
   the stub received no 21st request. Forging the cookie with 20 fresh timestamps gives the same 429
   without spending a call.
6. Restart the server and repeat step 4 → still `cached:true`, no model call. The disk cache survives.
7. Append a space to `prompts/word.md` → the word from step 2 makes a new call (`cached:false`) and a
   second file appears; revert the edit → the first file is used again, no call.
8. Change `EXPLAIN_MODEL` → a new call, `cached:false` (the model is part of the hash).
9. Delete `EXPLAIN_CACHE_DIR` → the next click calls the model again. Make it read-only → the click
   still succeeds with `cached:false`, no error.
10. Add `{{nope}}` to the prompt → 503 `prompt-invalid` naming it; unset `EXPLAIN_API_KEY` → 503
    `not-configured`.
11. `{paragraph: 999}` and an out-of-range `tokenIndex` → 400; a word absent from `rare[]` → 200 (the
    rarity requirement is gone); unknown slug → 404.

Etymology lookup, against a local stub of the Wiktionary API (`EXPLAIN_WIKTIONARY_URL=http://127.0.0.1:<port>/w/api.php`):

- The stub serves a page whose `Этимология` section has real text → the prompt the stub *model* receives
  contains that text, and the answer comes back with `etymologySource: "wiktionary"`.
- The stub serves «Происходит от ??» → treated as absent: `etymologySource: "model"` and «нет данных»
  in the prompt.
- The stub returns 500, hangs past `EXPLAIN_WIKTIONARY_TIMEOUT_MS`, or the page has no etymology
  section → same as absent, nothing surfaces to the reader, the model is still called.
- One fixture taken by hand from the real API goes through the cleaner: the inline CSS and the following
  «Фразеологизмы» heading must not survive into the prompt.

Real provider — already run once, 2026-10-19, against `deepseek/deepseek-v4.1-flash` (≈ $0.001 total):

- Four calls with the real draft prompt and real article data (`накарябал`, `транзитерами`,
  `транспарентно`, `пороговых`). Results: `response_format: json_object` is accepted, the three keys
  come back, the register is A2/B1 and Russian-only, and the initial form is named as asked.
- The default configuration is unusable: 384–400 of 400 completion tokens were reasoning tokens,
  `finish_reason: length`, truncated JSON, and one call returned `content: null`. With `reasoning:
  {enabled: false}` (and equally with `{effort:'none'}` / `reasoning_effort:'none'`): `reasoning_tokens`
  0, `finish_reason: stop`, valid JSON, ~2 s, $0.00012–$0.00035 per call.
- Keep one such call in the loop when the model id or the provider changes; a stub cannot see any of
  this.

Browser (real Chromium, as the reader is verified today):

12. Click «пороговых» in the Russian line of the sentence pane (¶57, sentence 3) → `section.pane-ru`
    now shows the explanation with the stub's text and a × at its top right; the paragraph pane and
    the sentence pane are byte-identical to before the click, so the word and its sentence are still
    on screen; the live region announces the answer.
13. Before that click, scroll the article to ¶100. Close with Esc → the article is back, `scrollTop`
    equals the pre-click value (±1 px), the same sentence is selected, and focus is on the clicked
    word.
14. Close with the × instead → the same restore. With no explanation open, Esc still clears the
    selection, as it does today (layered Esc).
15. With the explanation open, click another word in the sentence pane → the pane's content is
    replaced in place, with exactly one POST.
16. Click «энергоносителей» with the budget spent (forge the cookie) → the refusal line appears next to
    the word, the pane does **not** take over, no second request; clear the cookie → it works.
17. Click a word already in the disk cache inside the window → it answers instantly, `cached:true`, no
    429 — the bypass is visible, not just documented.
18. Tab stepping through sentences never sends a request (assert zero POSTs while stepping). With an
    explanation open the first `Tab` closes it: the article is back at the offset the swap saved, the
    paragraph pane is back, the pair has moved one step, focus is on nothing, and a re-click that was
    still in flight never lands (assert no `.explain` 5 s later). Later steps only move the pair, and
    `←` from the closed article still brings the panel and its pair back with no request.
19. Layout measured at 1400 px, 900 px and 400 px: the explanation's measure caps at ~46rem, at 400 px
    the explanation covers the viewport with its × reachable without scrolling, and the sticky column
    never overflows 60vh. With the article showing, the first pane has no `button` and clicking
    anywhere in it sends no request.
20. `grep -r EXPLAIN_API_KEY build/client` after `bun run build` → no match; `bun run check` clean;
    the reader's own regression checks still pass: 135 paragraph texts byte-identical to the JSON, no
    `button` inside `article`, and the rare data still in the JSON (264 tokens flagged in 24034, 233
    in 66181).
21. After regenerating both articles: paragraph texts still byte-identical to the committed JSON, the
    `pairs` alignment unchanged, and `proper: true` on 359 tokens in 66181 (168 distinct forms) and 233
    in 24034 (86). Verified 2026-10-19: 0 differences in `ru`/`en`/`pairs`/`ruSentences`/
    `enSentences`/`rare` and in every token's `start`/`end`/`form`/`lemma`/`rare`; dropping the new key
    reproduces the previous files byte-for-byte. **16 tokens in 66181 are both `rare` and `proper`** (0
    in 24034): the tokens whose proper reading exists only in a non-first parse, so their lemma evades
    the first-parse-based `lemma_proper` and stays eligible for `rare`. The overlap is unavoidable under
    rule B — exactly 368 tokens satisfy the rule's conditions in 66181, so forcing disjointness would
    cap `proper` at 352, below the 359 the rule yields. Recorded rather than papered over: rarity is
    data, and the flag only decides whether a token is a control.
22. Click a word → it carries the article's own wash and `aria-current`; the answer body is at full
    contrast while its word's sentence is the current one. Assert the computed styles, not the presence
    of a class. *(Superseded 2026-10-20: this item used to assert that a Tab step left the answer on
    screen, dimmed; a Tab step now closes it — Q6, item 33.)*
23. **Ran 2026-10-19** against `vite dev` on 5199 with the real key. A cold click on «пороговых»
    (24034 ¶57) opened the pane only when the answer arrived, 4438 ms server-side, with «спрашиваю…»
    next to the word while it was in flight; the same word again came from the disk cache in 465 ms; an
    uncached word inside the window left the article in place and showed «Не чаще одного объяснения в 2
    минуты» with a ticking «ещё 114 с» next to the word it was clicked on; Tab dimmed the answer body to
    0.55 with the × at 1 and Shift+Tab restored both the body and the word's wash (both superseded
    2026-10-20: a Tab step now closes the pane — Q6, item 33); Esc returned the
    article to the exact `scrollTop` it had before the click and put focus back on the word button; a
    deliberately typo'd placeholder answered `503` «Неизвестные подстановки: {{nope}}» next to the word
    with the article untouched, which also proves the prompt file is read per request. `bun run check`
    290 files / 0 errors / 0 warnings, `bun run build` clean, `grep -r EXPLAIN_API_KEY build/client`
    0 files, and both articles still render 373/373 and 556/556 sentences byte-identical to their JSON
    with 0 `button` elements in the article pane.

24. **Ran 2026-10-19**, after the report that the entry was missing: clicking «подрыву» (66181 ¶2)
    answered from the cache in 659 ms, and the pane showed, under «по данным Викисловаря», a collapsed
    «Текст из Викисловаря» holding 763 characters starting «Происходит от гл. подрывать, из под- +
    рывать (рвать), далее от праслав. *rъvātī…» — the reconstruction the model had rendered as
    «*гъvаtī» — plus a link to `https://ru.wiktionary.org/wiki/подрыв`.

25. **Ran 2026-10-19**, after the report that the header said «нет данных»: every token in both
    regenerated articles carries its own tag (5238/5238 in 66181, 7254/7254 in 24034) with 0 differences
    in `ru`/`en`/`pairs`/`sentences`/`rare`/`stats` and in every pre-existing token field. The pane
    header for «распорядилась» now reads `VERB,perf,intr femn,sing,past,indc` and for «подрыву»
    `NOUN,inan,masc sing,datv` — the clicked form's, not the lemma's.

26. **Ran 2026-10-19**, after the request that the chip explain itself: hovering the chip on
    «распорядилась» (`VERB,perf,intr femn,sing,past,indc`) put a 7-row popup 6 px under it, 226×158 px,
    inside the viewport and over the answer text — the pane's `overflow-y: auto` did not clip it. Moving
    the pointer away left 0 popups; `focus` on the chip brought it back; the first Escape closed the
    popup and left the answer (1 `.explain`, 0 popups), the second closed the answer and returned the
    article (373 sentences). At 800×900 the popup's right edge sat at 522 px and it stayed 6 px under the
    chip across a 320 px window scroll.

27. **Ran 2026-10-19**, after the request that the pane's own words be clickable: clicking «порядок»
    inside the etymology of the «распорядилась» panel replaced the panel in 4858 ms with a cold model
    call, its head reading «порядок | ×» — no lemma, no chip — with «порядок» alone wearing
    `aria-current="true"` in the etymology field. «спрашиваю «порядок»…» appeared in the pane while the
    request was in flight, and the source line read «по данным Викисловаря» with a link to
    `…/wiki/порядок`, so the lookup of the *form* found a page. The cookies were `explain_session`
    (`HttpOnly` false, `Path=/read`, expiry 3600 s out) and `explain_last`. ← put the previous panel
    back («распорядилась → распорядиться», chip and all) and → returned to the pane word, both
    instantly and with no request; Tab did not dim a pane-origin panel (opacity 1 before and after —
    superseded 2026-10-20: Tab now closes even that panel, Q6, item 33);
    Esc closed it and ← from the closed article brought the panel back. A second pane word inside the
    window was refused with «Не чаще одного объяснения в 2 минуты» **in the pane**, 0 status lines in
    the sentence pane, the kept answer dimmed to 0.55, and the refused word added no history entry.
    All 81 word controls of that pane computed to `rgba(0, 0, 0, 0)` with no padding and no border at
    rest, took `--accent-soft` under the pointer and gave it back on pointer leave: the fields read as
    prose until hovered, which is what makes a mark legible when one is there.
28. **Ran 2026-10-19**, after the refactor that gave both origins one request path: a cached article
    word («подрыву», ¶2) still opened from the disk cache with its lemma and its chip, Esc returned the
    article at 373 sentences, and an uncached article word inside the window put «Не чаще одного
    объяснения в 2 минуты» next to the word in the sentence pane with a countdown that ticked (29 → 27
    over 2.5 s — the first reading used to be able to show a number above 120, because the countdown
    state was from mount; fixed here). The history forked as designed: after ← ← → the panels read
    «распорядилась», «распорядилась», «подрыву» — what was ahead of the cursor was dropped when the new
    ask landed. `bun run check` 292 files / 0 errors / 0 warnings, `bun run build` clean. The refusals
    quoted in items 27 and 28 read «Не чаще одного объяснения в 2 минуты» because that was the rule
    that day; the message is now «Не больше 20 объяснений в час» (Q21).

29. **Ran 2026-10-20**, after the budget replaced the cooldown. At the endpoint, with
    `explain_calls` forged: 20 timestamps inside the hour → `429 {"error":"rate-limited","message":"Не
    больше 20 объяснений в час","retryAfter":3521}` in 941 ms, with no model call; 19 inside the hour
    plus one 61 minutes old → `200`, `cached:false`, `retryAfter:0`, a real call in 4251 ms, and a
    `Set-Cookie` holding 20 entries — the aged one dropped, the new one appended, so the slot freed as
    the arithmetic says. In the browser, the same forged cookie and a click on «отвечая» (¶1) put «Не
    больше 20 объяснений в час» next to the word with «ещё 59 мин» after it, in 558 ms, with no pane
    and the article still at 373 sentences. That 558 ms is the Wiktionary GET: the budget is checked
    after the etymology, because the fetched text is part of the cache key (§5, Q16).

30. **Ran 2026-10-20**, for the text switcher (Q22): `/read/66181` served exactly one link,
    `/read/24034`, under «Другие тексты: Выступление и дискуссия на Мюнхенской конференции по вопросам
    политики безопасности 10 февраля 2007»; clicking it landed on `/read/24034` — h1 the Munich speech,
    135 paragraphs — whose header offered the essay back, and `/read/24034` served no link to itself.
    The line computed to 14.4 px in `--fg-muted`, 32 px tall at 720 px wide (the official titles wrap to
    two lines), 16 px above the legend; it is gone while an answer is open and back after Esc. The index
    still lists both texts, through the same catalog function. *(Superseded 2026-10-20: the header line
    is replaced by the menubar's texts menu — Q26, item 35 — which lists the same one text and does not
    disappear while an answer is open.)*

31. **Ran 2026-10-20**, after the user reported that walking did not put the right column back: with
    ¶20 s1 selected and «дворянское» answered (panel A), a Tab moved the pair to ¶20 s2 and dimmed the
    answer (the dim is gone as of 2026-10-20: that Tab now closes the pane and `←` brings A back —
    Q6, item 33); a pane word clicked in that answer («Дворянское», panel B) left the pair on s2. ← put A
    back with the sentence pane on **¶20 s1** and «дворянское» marked again, its dim gone; → put B back with
    the pane word marked in the answer's own prose and the pair on s2, which is where B was asked from;
    ← twice from A moved nothing, so the key stayed with the browser. Before the fix the same walk put A
    back with the sentence pane still on s2 and no word marked.

32. **Ran 2026-10-20**, for the origin copy (Q24): with ¶20 s1 picked and «дворянское» answered, clicking
    «Дворянское» in that answer's own prose put «Откуда слово: дворянское» in the paragraph pane as soon as
    the panel landed — «Дворянское» washed in its own field, the aside's label «Откуда слово», the sentence
    pane still on ¶20 s1 with no word marked, since a pane word is not in the article. ← gave the article
    word back: the translation returned and the sentence pane washed «дворянское» again; → returned the
    origin copy. A word clicked in the source's «Пример», in a 420 px viewport where the copy overflows
    (235 px of scroll), landed dead centre — mark centre 121 px against a pane middle of 121 px, at
    `scrollTop` 229 — and with the mark near the top of a short copy the effect correctly scrolled nothing
    (0 of 235). Esc put the article and the translation back. The pane being read still measures as before:
    its word controls transparent at rest, `--accent-soft` under the pointer, `--sentence` on the open word.
    A first attempt at the derivation compared the answer on screen with the history entry by identity and
    showed nothing until a walk set both from the same source: a `$state` array read hands back a different
    proxy, so the origin is held as state beside `answer` and `openWord` instead.

33. **Ran 2026-10-20**, for the Q6 revision — a Tab step closes the pane instead of dimming it — and for
    the focus rule it leans on. In the browser against `vite dev`: with the article scrolled to 700 px
    and a cached answer open on «распорядилась» (¶10 s1), one `Tab` left `.explain` gone, the article
    back at exactly 700 px, the paragraph pane showing ¶10's translation again, the pair on ¶10 s2,
    `document.activeElement` on `body`, and 0 POSTs. `Shift+Tab` from a panel on ¶11 s0 closed it and
    stepped back to ¶10 s2; `←` from the closed article put the panel and its pair back with the POST
    count unchanged. At the article's end (24034 ¶135 s0, «внимание») a `Tab` closed the pane, kept the
    last sentence selected, and fell through to the browser, which focused the header's `kremlin.ru`
    link — the ends still hand the key over. The focus rule was measured on the same path before the
    revision: Esc put focus on the clicked word's button (`:focus-visible`), and the next `Tab` left the
    ring on the word at the same position in the *new* sentence («князья», `data-tok="33"` after
    «распорядилась», `data-tok="21"`), which is what a step dropping focus removes.
    Against a local stub provider (3 s latency, `EXPLAIN_WIKTIONARY_URL=off`,
    `EXPLAIN_CACHE_DIR=/tmp/explain-stub-cache`): a re-click in flight («спрашиваю «стала»…» in the pane)
    was dropped by a `Tab` — the pane closed at once, no `.explain` existed 4.5 s later — while a first
    click still in flight when a `Tab` landed stepped the pair and its answer then opened the pane, as
    Q11 says. Esc is unchanged: it closes, restores the same 700 px, and puts focus back on the clicked
    word's button. `bun run check` 295 files / 0 errors / 0 warnings; `bun run build` clean.

34. **Ran 2026-10-20**, for the two tones (§9, Q25). With a `fetch` that rejects `/explain` the way a
    dead endpoint does, a click put «Сервис объяснений не ответил.» next to the word as
    `class="status error"`, computed `rgb(179, 38, 30)` (`--error`, light theme); while the same request
    was in flight the line read «спрашиваю…» in `rgb(106, 101, 93)` (`--fg-muted`). With the budget
    spent (a forged `explain_calls` of 20 timestamps) a cached word still opened the pane — the cache
    bypass — and an uncached word then put «Не больше 20 объяснений в час» in `rgb(179, 38, 30)` in the
    pane's own `.state` **and** «…ещё 60 мин» in the same colour next to the word in the sentence pane.
    The reproduction is honest about the cause: killing the dev server mid-request needs the kill inside
    the request's 3 s window, which a hand-driven session cannot time — the patched `fetch` fails at the
    same layer a stopped server does, and the spec's §11 row records which line means which cause.

35. **Ran 2026-10-20**, for the menubar (Q26). On a fresh `/read/66181`: the bar measured 35 px and sat
    above both columns, «Тексты» was enabled and «Слова» was `disabled` with `title` «Ни одного
    объяснения пока нет», and the article header no longer carried a «Другие тексты» line while the
    article still rendered its 373 sentences. «Тексты» opened one row — the Munich speech, title and
    date — and clicking it landed on `/read/24034`; Enter on the focused button opened the menu and put
    the focus on that row (a real mouse click left the focus on the button), Escape closed it and gave
    the focus back to «Тексты», and a pointer press on an article paragraph closed it too. With two
    answers on screen (the stub provider) «Слова» was enabled and listed «История → история ¶10» and
    «воссоединения → воссоединение ¶10» with the second wearing `aria-current="true"`; ↓ and ↑ moved
    the focus between the rows without moving the pair and without a request; picking the other row put
    that panel back — head «История → история», 0 further POSTs — and left the focus on the explanation
    region; picking the row that was already current changed nothing. A `Tab` with the menu open closed
    the menu, closed the answer and moved the pair to ¶10 s2, with the focus on `body`. At 400×700 the
    bar stuck to the top and reported `--menubar-h: 34px`, the translation column stuck at 34 px with no
    overlap; at 1280 px the bar is a static first row. `bun run check` 296 files / 0 errors / 0 warnings
    — the two a11y warnings about `role="menu"` without a `tabindex` were fixed by giving each popup
    `tabindex="-1"`.

36. **Ran 2026-10-21**, for the glossary page (Q27). `/glossary` served 602 entries in 31 letter groups,
    the index offered the 28 Cyrillic letters that have entries plus `E`, `P` and `S` for the Latin
    headwords, and the page's first entry was «аблатив (ablative case)» and its last «singularia
    tantum». A deep link to `/glossary#ablative-case` scrolled to that entry and gave it the
    `--accent-soft` wash; its «см. также» resolved to `#case` and `#genitive-case`. Of the 1011 «см.
    также» references the entries carry, 841 named an entry of the glossary; the rest name concepts the
    appendix itself does not define («словообразование», «фонетика», «ударение»), and those are dropped
    rather than shown as dead links. The page rendered in the production build with **no console
    error**. One worth recording: the first build threw `each_key_duplicate` at hydration («Keyed each
    block has duplicate key `shortening` at indexes 0 and 1»), which blanked the letter index and
    silently dropped the first five entries of group А — two «см. также» names can lead to one article
    («сокращение» and its alias «аббревиатура»), so the loader now deduplicates the resolved
    references by target before handing them to a keyed list. `bun run check` 302 files / 0 errors / 0
    warnings; `bun run build` clean.

37. **Ran 2026-10-21**, for the «Словарь» entry (Q26, Q27). On `/read/66181` the bar held four things of
    which two are menus: «Тексты» and «Слова» as buttons with `aria-haspopup`, «Словарь» as an `href` of
    `/glossary`, and the GitHub mark; the a11y tree read navigation «Меню» with `button "Тексты"`,
    `button "Слова"` (disabled on a fresh session), `link "Словарь"` and `link "Исходный код на GitHub"`.
    Hovering «Словарь» washed it `rgb(138, 47, 47)` at 0.12 — the same hover the buttons take — and it
    was set in `--fg` with no underline, so the row does not tell a menu from a link. Clicking it landed
    on `/glossary` with its 602 entries, and Back returned to the article; the words menu still opened
    over the bar (`aria-expanded="true"`) and Escape still closed it. The bar's height was unchanged at
    36.6 px. `bun run check` 302 files / 0 errors / 0 warnings; `bun run build` clean.

38. **Ran 2026-10-21**, for issue 01 (the words menu emptying itself on a pick). Before the fix, on the
    build item 37 measured: three rows `Недавно→недавно ¶1`, `времени`, `значит`, and one click on a row
    left `[]` with «Слова» `disabled` and `title` «Ни одного объяснения пока нет» while the pane stayed.
    After it, the same script — a three-row session, then
    `document.cookie = 'explain_session=<now − 1 h − 1 s>; path=/read'`, then a pick — opened the panel
    the row names («Недавно → недавно») with all three rows still listed and the entry still enabled.
    Picking each of the three in turn put that panel back, ← and → still walked them with
    `aria-current="true"` following, Escape still closed the pane and an arrow with the menu open still
    closed the menu and walked, 0 requests. The hour itself was measured with `EXPLAIN_SESSION_MS`
    temporarily `5_000`: two answers, a pick that opened the other panel and left both rows, and then —
    with nothing touched — the rows gone, «Слова» greyed with its title, and the answer still on screen;
    the same expiry with the popup open took the popup with it (`aria-expanded="false"`), and ArrowDown
    plus Escape after it were uneventful. With `refreshSession()` temporarily commented out, so no
    `explain_session` cookie exists at all (`document.cookie` empty), the row appeared as usual and the
    list still emptied itself at the hour — the fallback clock. No console errors in any run. Both
    temporary edits were reverted (`git diff --stat` is `+page.svelte`, 36 insertions, 19 deletions) and
    the final build re-verified: `bun run check` 302 files / 0 errors / 0 warnings, `bun run build`
    clean.

## 13. Non-goals

- No gloss of the *word* on hover, no word-level English alignment: the grammar chip's popup explains
  the codes (Q19), not the word, and outside the sentence pane the words stay plain text.
- No clickable words in the article text — removed 2026-10-19. The rare ranking stays in the JSON as
  data; nothing in the first pane is a control except the sentence itself.
- No streaming (the answer is ~120 words; a spinner is enough), no per-user accounts — the hourly
  budget is a cookie in the reader's browser, not a quota on an account — no
  multi-provider abstraction. The disk cache is not a history: it is keyed by prompt hash, nothing in
  the UI lists it — the words menu lists the session's panels, which is a different list (Q26) — and no
  prompt-version counter exists because the hash is the version.
- No change to the generated article JSON or to the pipeline beyond the per-token `proper` flag (§10).
- No second dictionary, no base-word fallback when the lemma's page is a stub (§7.1), no lookup cache of
  its own, no etymology editing UI.

## 14. Open questions

Numbering follows the grilling rounds. **Q1 and Q2 are answered** — see §2 — and stay here only as
pointers.

- **Q27 — answered** (user's request, 2026-10-21, "generate a glossary in russian translated from
  https://en.wiktionary.org/wiki/Appendix:Glossary and adapted to the russian grammar. Later we will
  link to it from the explanation pane and its popup entries. Mention it is adapted from the en
  wikitionnary. It will be in the /Glossary route"): the whole appendix — 623 entries — was translated
  into Russian and adapted to Russian grammar, and lives at `/glossary` as 602 articles (the appendix
  names a few concepts twice, as a redirect and the article it points at, and those are one article
  here; two pairs it keeps apart in one word — archaic/obsolete, colloquial/informal — got the two
  words Russian uses). The page says both halves of the provenance the user asked for: adapted from the
  English Wiktionary's `Appendix:Glossary`, named and linked, under CC BY-SA (recorded in `NOTICE`).
  Decisions taken with the shape of the appendix in front of us: headwords, definitions, examples and
  the index are Russian, and a handful of Latin terms (`pluralia tantum`, `sic`, `enPR`) keep their
  Latin headword under their own index letter rather than a bucketed «Прочее»; an entry whose
  phenomenon does not exist in Russian says so and names the nearest Russian one; the entries are
  sorted by the Russian headword; «см. также» only links what exists; and every entry carries a stable
  ASCII anchor for the pane to point at later (§10's anchor rule, Q26's id rule). The route is
  lowercase `/glossary` against the user's `/Glossary` — the app's other routes are lowercase
  (`/read/[slug]`) and URLs here are read as they are typed; say the word and the directory is renamed.
  The same request's second half — "add glossary (in russian) in the menubar" — put «Словарь» in the
  bar as the third entry, a plain `href` beside the two menus, so the page is reachable from the
  reader without a URL edit (Q26's bar is the only navigation the reader has). See §12 items 36 and
  37.

- **Q2 — answered**: every token in the sentence pane is clickable *except proper nouns*, which render
  italic in both panes and are not controls. Rule B and the per-token flag are in §2 and §10.
- **Q3 — answered**: a cached answer bypasses the hourly budget, and the cache is on disk
  keyed by the `sha1` of the request (§2, §6). Open: whether the hash covers the model and sampling
  parameters as well as the prompt (Q15).
- **Q4 — answered**: the lemma (named next to the clicked form), raw pymorphy3 tags with a legend in
  the prompt file, a fresh example sentence, A2/B1 Russian and nothing but Russian, ~120 words with
  `max_tokens` 400, `response_format: json_object` with a prose fallback. See §2, §4, §7.
- **Q5 — answered**: a ru.wiktionary lookup first (server-side, one fetch, before the single model
  call), the model's memory only when the page is absent or a stub, and the pane says which of the two
  the reader got. Not an agent loop. See §2, §7.1.
- **Q6 — answered, and revised** (user's instruction, 2026-10-20: "tab and shift tabing should restore
  the three panes to their normal usage not the overlayed explanation pane"): the open word wears the
  article's `--sentence` wash (`--accent-soft` stays hover), the sentence pane's own sentence gets no
  tint, and a `Tab` / `Shift+Tab` step **closes** the answer — the article back at the offset the swap
  saved, the paragraph pane back with it, the pair then moved on — instead of leaving it on screen
  dimmed. Focus is not handed back to the clicked word on that path, and the keys differ from Esc in
  nothing but what follows the close. The dim rule survives for the two states no key reaches: an answer
  that lands after a Tab (Q11) and a re-click in flight or failed (Q12); the 2026-10-19 rule ("Tab keeps
  the answer, dimmed") is the one this replaced. See §2, §9, §12.
- **Q7 — deferred** (user's call, 2026-10-19): the ADR offer is set aside, not decided. Nothing in the
  implementation depends on it.
- **Q8 — answered**: OpenRouter (`https://openrouter.ai/api/v1`) with `deepseek/deepseek-v4.1-flash`,
  keyed by an app-specific `EXPLAIN_API_KEY` — the only provider this machine has credentials for, and
  the model omp already runs. See §2, §8.
- **Q9 — answered** (user's call, 2026-10-19, "as written"): (a) Esc is layered — it closes the answer
  first, then clears the selection, and with neither it is left to the browser; no second key. (b) the
  first Esc keeps the selection; a second clears it. (c) the article's `scrollTop` is saved once, at the
  swap, and written back when `RussianPane` remounts — never re-saved by a later click, whose pane holds
  the answer's scroll. (d) opening moves focus into the region and closing returns it to the word. §9
  carried all four as written; nothing changed in the fold. (d) gained one exception on 2026-10-20: a
  `Tab` step closes the pane and drops focus instead of returning it to the word (Q6).
- **Q10 — desktop only, for now** (user's call, 2026-10-19, "ship the desktop path"): no narrow-screen
  overlay is built, so at ≤ 899 px the answer renders in the article pane, below the sticky right
  column, where it is off-screen at the moment of the click. A known gap, not an oversight; §10's
  overlay paragraph is the proposal for closing it. Facts already measured, for whenever it is picked
  up: at
  ≤ 899 px `.reader` is a flex column with `height: auto`, `.pane-en` is `order: -1; position: sticky;
  top: 0; max-height: 60vh; z-index: 2`, and `.pane-ru` is `overflow-y: visible`, so the page scrolls
  and the pane does not; the sticky column's height is content-dependent (`.en-para` flex 1,
  `.en-sentence` ≤ 45%), so "cover everything below it" is not writable as a CSS constant.
- **Q11 — answered**: the pane opens when an answer arrives, never on the click. «спрашиваю…» and every
  pre-answer failure — 429, 503, 5xx, timeout, missing key, prompt typo — appear next to the word with
  the article untouched; a refusal therefore cannot take the pane. An answer that lands after the
  selection moved on still opens the pane, dimmed. See §2, §9, §11.
- **Q12 — answered**: a second click replaces the answer in place; the previous answer is kept, dimmed,
  under a «спрашиваю…» line until the new one arrives, and stays with the new word's error if it fails.
  The header follows the answer on screen, not the pending click. See §2, §9.
- **Q15 — answered**: the cache hash covers `model|temperature|max_tokens` appended to the rendered
  prompt, because the same prompt sent to a different model is a different answer. The user asked for
  "the sha1 of the used prompt"; the extra fields are a superset and one line to drop. See §6.
- **Q18 — answered** (user's report, 2026-10-19): the pipeline writes every token's own pymorphy3 tag
  and the prompt and the header use it, falling back to the rare entry's and then to «нет данных»; the
  header renders no chip when there is no tag. See §4, §7, §9.
- **Q21 — answered** (user's call, 2026-10-20): the throttle is a **budget of 20 explanations per hour**
  per browser, not one explanation every two minutes. The cookie had to change shape for it — it now
  holds the timestamps of the calls inside the hour, and its `Max-Age` is that hour — and the wait a
  refusal quotes is until the *oldest* call leaves the window, which is when a slot frees rather than a
  fixed cooldown. Cache hits still bypass it (§5).
- **Q20 — answered** (user's request, 2026-10-19): the answer's own words are clickable, ← and → walk
  the panels of the reading session, and the session ends after an hour of inactivity. The three
  decisions were the user's: a pane word is asked about with its form and its sentence only — the app
  has no morphology at runtime and no JS port of pymorphy3 exists on npm, so the model names the initial
  form itself and the header shows no chip; the history lives in the page with the `explain_session`
  cookie as its clock, so a reload starts empty; and the clickable text is the three model fields, not
  the Wiktionary quote. See §3, §4, §5, §9, §12. **Revised 2026-10-21** (user's report: "clicking on
  entries in the «Слова» menu button make them disappear"): the hour is *watched* — a timer armed at
  every answer empties the panels and greys the menu out — instead of being read off the cookie when the
  reader happens to press an arrow or pick a row, which emptied the words menu as the price of opening
  one of its rows. See issue 01 in `issues/`, §5's session-cookie note and §10's words-menu bullet.
- **Q22 — answered** (user's question, 2026-10-20, "how can I switch between the proposed texts"): the
  reader had no way back to the catalog — not one `href`, and the title only inside the article pane —
  so the article header now lists the other texts, by title and date, one click each. The user chose
  the header over the right column and over a floating control, and direct links over a link to the
  index; the accepted cost is that the line goes when an explanation takes the pane. **Withdrawn
  2026-10-20** (user's request): that line is gone from the article header, and the menubar's texts menu
  is the way to another text — always there, explanation open or not (Q26). See §10.
- **Q24 — answered** (user's instruction, 2026-10-20): when the word being explained was itself clicked in
  an explanation, the paragraph pane shows the explanation it came from — scrolled to the field the word
  sits in, with the word washed — because the article's paragraph is no context for a word that came out of
  an explanation. The user chose this over opening the new explanation in the paragraph pane (two
  explanations at once, source on the left) and over leaving the article's paragraph on the right. In the
  same breath the user asked that walking to a panel restore the other panes: see Q23. See §9, §10.
- **Q26 — answered** (user's request, 2026-10-20: "add a menubar, the first entry «texts» corresponds to
  a pop up menu to access the available texts. The second entry «words» trigger a pop menu to access the
  available explanations. It is grayed out and inactive if no explanation entry is available"): the bar
  became the first row of the frame, «Тексты» over the other articles and «Слова» over the session's
  explanations. The user chose the **session's** list over the disk cache (an endpoint listing
  `EXPLAIN_CACHE_DIR` would be a new surface, and §13's non-goal says the cache is not a history), chose
  that the bar **replaces** the article header's «Другие тексты:» line (Q22's answer, withdrawn: that
  line went away whenever an explanation took the article pane, which a menubar does not), and chose
  Russian labels — «Тексты» / «Слова» — against the reader's Russian chrome. Greyed out means
  `disabled`: no click, no focus, a `title` saying «Ни одного объяснения пока нет». Later the same day
  the user asked for the repository link at the bar's right end, so the bar ends in the GitHub mark
  (§10); it is a plain link — no state, no key — and the label question is answered by `aria-label`
  rather than by visible text. See §9, §10, §12.
- **Q25 — answered** (user's report, 2026-10-20, «some problem. Should not happen, the wifi is up.
  Anyway the message should be in red»): the line was the client's own «Сервис объяснений не ответил.»,
  which is what a `fetch` that never reached the endpoint produces — a stopped or restarted server, or a
  page reloaded mid-request — where a provider-side failure instead reads «Сервис объяснений ответил
  ошибкой (502)». So the wifi was not the thing to look at; the server was. The actionable half did
  change: a failure now wears the palette's new `--error` in both places the line appears, while
  «спрашиваю…» and the countdown stay `--fg-muted`. See §9, §11, §12.
- **Q23 — answered** (user's report, 2026-10-20): a panel remembers the pair the right column was on when
  it was asked for, and walking to that panel restores it — so the sentence pane and the paragraph pane
  come back with the panel and the explained word is highlighted again. The pair is read at the ask
  rather than when the answer lands, so a Tab during a request cannot move the panel's own context out
  from under it — and since 2026-10-20 a Tab with an answer on screen drops a re-click that was still in
  flight rather than moving any pair under it (Q6). See §9, §12.
- **Q19 — answered** (user's request, 2026-10-19): the terse chip pops up a per-component gloss of its
  tag on hover and on focus, and dismissal is fourfold — pointer away, blur, a new answer, or Escape,
  which closes the popup before the answer, making the popup the top layer of the Escape stack. It is
  not interactive, so there is no pointer grace period and no click-to-pin. See §9, §12.
- **Q17 — answered** (user's report, 2026-10-19): the pane shows the fetched Wiktionary text verbatim
  under a collapsed block, plus a link to the page, so «по данным Викисловаря» points at something the
  reader can read. See §2, §4, §7.1, §9.
- **Q16 — open, found while implementing**: a cache hit still performs the Wiktionary GET, because the
  key is the rendered prompt and the etymology is part of it. So a re-click costs ~0.4 s instead of a
  file read, and a Wiktionary outage changes the hash, misses the cache and spends a model call on a
  word already answered — inside the 2-minute window that call can also come back 429. §7.1 rejected a
  lookup cache of its own, and the cookie no longer bounds these fetches because a cache hit never
  consults it. The one-line fix is a lemma-keyed cache (`<sha1(lemma)>.json` holding the cleaned text
  or a recorded absence), which restores the "a re-click is a file read" claim Q11 and Q12 rest on and
  touches Wikimedia once per lemma ever. Not applied: it is a design change, and the spec says no
  second cache.
