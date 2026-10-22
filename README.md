# ru

Reading Russian on kremlin.ru transcripts: a scrollable Russian article, and a right-hand column that
answers a click on a sentence with the English translation of its paragraph — the matching sentence
highlighted — plus, below it, the current RU/EN sentence pair on its own. The article itself is plain
text: nothing in it is clickable, and word-level interaction (asking what a word means) belongs to the
sentence pane — see `.scratch/word-explanation/spec.md`.

The words this repo means by *article*, *paragraph*, *sentence pair*, *pane*, *explanation* and *origin*
are defined in `GLOSSARY.md`, and the code, the spec and this file use them in those senses only.

## Layout

| Path | What it is |
| --- | --- |
| `data/<section>-<id>-{ru,en}.txt` | page dumps: a `#` provenance header, the title, the date line, then one paragraph per line |
| `data/wiktionary-glossary-{ru,en}.txt` | the glossary's dumps: the same header with `# date: none`, then one paragraph per entry, each line prefixed with its anchor |
| `reference/<slug>.{ru,en}.txt` | clean texts of the first article, taken from the Wayback snapshots, kept for provenance |
| `scripts/extract_page.py` | archived page HTML → dump (title, date, body paragraphs) |
| `scripts/build_article.py` | the pipeline: strip chrome → pair paragraphs → split and align sentences → rank rare words → emit JSON |
| `src/lib/content/<slug>.json`, `articles.json` | generated, committed; loaded server-side, never shipped to the client |
| `src/routes/read/[slug]` | the reader (`/` lists the catalog; the glossary is read here too, at `/read/glossary`) |
| `src/routes/glossary` | the old glossary page's URL, which redirects to `/read/glossary` |
| `data/glossary/entries.json` | the glossary's authored entries: the Russian definitions, the English term each came from, and the English each entry adds to it |
| `scripts/glossary_appendix.py` | the English Wiktionary's `Appendix:Glossary` → terms with their plain-text definitions |
| `scripts/build_glossary.py` | the glossary's two dumps, from those entries and the fetched appendix |
| `src/lib/grammeme-entries.json`, `scripts/check_glossary.py` | the chip popup's code → entry map, and the check that every id in it is an anchor of the built article |
| `src/lib/components/{MenuBar,RussianPane,TranslationPane,SentencePane,ExplanationPane,OriginPane,AnswerBody}.svelte` | the menubar, the panes and what they render |
| `prompts/word.md`, `prompts/word.ru.md` | the explanation prompt, in English and in Russian — one prompt twice, read at runtime (`EXPLAIN_PROMPT_PATH`) |
| `GLOSSARY.md` | the vocabulary the code and the docs share — article, paragraph, sentence pair, rare lemma, the reading panes, explanation, explanation pane, origin |

## Run the app

```bash
bun install
bun run dev                                  # http://localhost:5173
bun run check                                # svelte-check, 0 errors
bun run build && PORT=3000 node build/index.js   # adapter-node, SSR
```

## Rebuild the article data

```bash
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
mkdir -p data/wordlists && curl -sSL -o data/wordlists/ru_full.txt \
  https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ru/ru_full.txt
.venv/bin/python scripts/build_article.py 66181 --out src/lib/content
```

The script rewrites `src/lib/content/66181.json` and merges `articles.json` (existing entries for
other slugs are kept, newest first). It prints the paragraph/sentence/token/rare-lemma counts and the
rarity boundary; `--count` changes the number of rare lemmas, `--wordlist` swaps the frequency list.

## Rebuild the glossary

```bash
curl -H 'User-Agent: russian-reader/0.1' -o /tmp/appendix_glossary.wikitext \
  'https://en.wiktionary.org/w/index.php?title=Appendix:Glossary&action=raw'
.venv/bin/python scripts/build_glossary.py --appendix /tmp/appendix_glossary.wikitext
.venv/bin/python scripts/build_article.py glossary
```

The first script writes `data/wiktionary-glossary-{ru,en}.txt` and refuses to write a wrong document: a
label that matches no appendix term and writes no English of its own, an empty `enText`, a duplicate or
non-ASCII `id`, and an empty definition each stop it with the entry named. It also lists the entries whose
Russian definition names Russian and which add nothing, so a maintainer can re-read them when the Russian
text changes. The appendix is fetched at build time and never committed — only the dumps it produced are.
The second script is the ordinary pipeline, and leaves `articles.json` alone: a document with no date has
no place in a list ordered by date.

## Adding another article

kremlin.ru is unreachable from here, so the page comes from the Wayback Machine and is turned into the
dump shape the pipeline eats:

```bash
curl --compressed -o /tmp/24034.ru.html \
  "http://web.archive.org/web/20261010173254id_/http://kremlin.ru/events/president/transcripts/24034"
.venv/bin/python scripts/extract_page.py --lang ru --html /tmp/24034.ru.html \
  --url https://kremlin.ru/events/president/transcripts/24034 --capture 20261010173254 \
  --out data/president-transcripts-24034-ru.txt      # and the same for --lang en
.venv/bin/python scripts/build_article.py 24034
```

The extractor takes the body from `itemprop="articleBody"` and drops the page metadata the CMS nests
inside it. The English page is published separately and may paragraph differently — it breaks Putin's
gas answer in two where the Russian runs on, hence `--join 99+100` when extracting it. The pipeline
refuses to write anything when the two dumps disagree on paragraph count, which is the signal to look
for exactly that kind of difference. `RU_BODY_END` / `EN_BODY_END` only matter for a dump that still
carries the page's trailing sections.

## How the two hard parts work

**Rarity.** Tokens are lemmatised with pymorphy3. A lemma's score is `max(zipf_frequency)` over the
lemma and the surface forms that occur in the article (wordfreq, `ru`); ties break on the largest
occurrence count in `ru_full.txt`, then alphabetically. Proper nouns (`Name`, `Surn`, `Patr`, `Geox`,
`Orgn`, `Trad`) are excluded — the reader is not learning that Kiev is a place. 1805 lemmas are
eligible in the essay, 200 are chosen, and every token of a chosen lemma carries `rare: true` (233
tokens there, 264 in the transcript). The ranking is data, not a control: the reader shows the article
as plain text, with no marked or clickable words. `rare` stays in the JSON for the word-explanation
pane (`.scratch/word-explanation/spec.md`), which will read it to fill the prompt.

**Sentence alignment.** Both sides are split on sentence boundaries (abbreviations, initials, « » and
the English page's reversed `”…“` quotes), then a monotone DP aligns them per paragraph: one-to-one
matches are cheap, folding several Russian sentences into one English sentence costs more, spreading
one Russian sentence over two to four English ones costs a little less — the translation splits where
the Russian ran on, and a transcript is full of remarks like "We both know this." standing alone on
the English side — and an unmatched sentence costs most. Length costs are calibrated on the article's
own RU:EN character ratio, so merges and splits are spent only where they pay. `pairs` holds one row
per Russian sentence, `[ru, [en, ...]]`, the English indices contiguous and possibly empty; an empty
row is what makes the reader fall back to highlighting the whole paragraph.

| Article | Paragraphs | Sentences RU/EN | Merges / splits | Orphaned EN | Mean cost |
| --- | --- | --- | --- | --- | --- |
| 66181 (essay) | 88 | 373/360 | 13 / 0 | 0 | 0.11 |
| 24034 (transcript) | 135 | 556/570 | 9 / 22 | 0 | 0.12 |

Before splits were in the move set, 25 of the transcript's 570 English sentences were orphaned — never
highlighted, because the alignment had no move that could attach them to the Russian sentence they
translate. The essay is unaffected: with splits available, not one of its 88 paragraphs pairs differently.

**Reading mode.** `ruTokens` carry exact character offsets into the paragraph string, and the browser
slices the text verbatim — it never re-tokenises. Once a sentence is current:

- the left pane **dims every other sentence** (opacity 0.45) and tints the current one, so the article
  recedes behind the sentence being read;
- the right column shows the **translation of that paragraph** on top, its paired English sentences
  marked — usually one, two when the official translation split the sentence — and the rest of the
  paragraph dimmed;
- below it a second pane shows **only the two current sentences**, Russian and English, each tagged
  `RU` / `EN`, with the paragraph and sentence numbers in its header.

**Selecting.** A click anywhere in a sentence makes that sentence current; no word is pinned, because
the article carries no word-level controls. `Tab` / `Shift+Tab` walk the sentences
of the whole article in reading order (the first press starts at the first sentence, `Shift+Tab` at the
last) and centre the picked sentence in the pane, so it always sits at the same height on screen; a
sentence taller than the pane is aligned by its top instead, and centring is clamped at the ends of the
article. On narrow screens the pane is the page below the sticky translation column, so the centre is
computed for that band. Past either end of the article the key falls through to the browser, so the
header links stay reachable. A step also drops whatever focus the reader left in either pane, so the
focus ring never rides into the sentence the step lands on — it stays on `Tab`'s job, the pair — and it
takes an open explanation with it: `Tab` and `Shift+Tab` put the article and the paragraph back before
they move, so the reader never lands on the overlay. `Esc` clears the selection. The translation pane
announces the marked sentence in a live region, so stepping works without seeing the highlight move.

**The menubar** sits above the two columns. «Тексты» lists the other articles — title and date, one click
each — and «Слова» lists the explanations this reading session has, named by the word each one is about
and the paragraph it came from; picking one puts that panel back with no request. «Слова» is greyed out
and takes no click until the first answer arrives, and greys out again when an hour without a request
ends the session and drops its panels. ↓ and ↑ walk an open menu's rows, Escape closes it and hands the
focus back to its button, and a `Tab` step closes it before it moves. «Словарь» is the third entry, a
plain link to the glossary article — the two menus open a popup, this one navigates. At
the far right of the bar sits the GitHub mark, linking to the reader's source in a new tab.

## Word explanation

Clicking a word in the Russian line of the sentence pane asks the server to explain it — meaning in
this sentence, etymology, one example, in simple Russian — and the answer replaces the article pane,
overlaying it and the paragraph pane, until it is closed (×, `Esc`, or a `Tab` step). A failure the
reader has to act on — a refusal, a missing key, an endpoint that never answered — is written next to
the word in the error colour, while «спрашиваю…» and its cooldown stay muted. The endpoint is
`POST /read/[slug]/explain`; it re-derives the word, lemma, sentence and translation from the article
JSON, asks ru.wiktionary whether the lemma has a page there at all — existence is the API's own
`missing` fact, and a page that is not there gets a greyed-out link rather than a red one — fetches that
page's «Этимология» when it is there, renders `prompts/word.md`, makes one chat-completion call, and
caches the answer on disk. See `.scratch/word-explanation/spec.md` for the contract.

Configuration (all read at runtime through `$env/dynamic/private`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `EXPLAIN_BASE_URL` | — (required) | OpenAI-compatible base, e.g. `https://openrouter.ai/api/v1` |
| `EXPLAIN_API_KEY` | — (required) | bearer token; never leaves the server |
| `EXPLAIN_MODEL` | — (required) | model id sent as `model` |
| `EXPLAIN_PROMPT_PATH` | `prompts/word.md` | the prompt file, read on every request |
| `EXPLAIN_TIMEOUT_MS` | `20000` | model timeout → 504 |
| `EXPLAIN_MAX_TOKENS` | `400` | completion cap |
| `EXPLAIN_TEMPERATURE` | `0.3` | sampling temperature |
| `EXPLAIN_CACHE_DIR` | `.cache/explanations` | one `<sha1>.json` per answer, gitignored |
| `EXPLAIN_WIKTIONARY_URL` | `https://ru.wiktionary.org/w/api.php` | etymology lookup; empty or `off` disables it |
| `EXPLAIN_WIKTIONARY_TIMEOUT_MS` | `4000` | lookup timeout |
| `EXPLAIN_USER_AGENT` | `ru-reader/0.1 (personal reading tool)` | Wikimedia rejects anonymous fetches |

Copy `.env.example` to `.env` and fill in the three required values; `bun run dev` loads it, while a
`node build/index.js` run takes the variables from the process environment
(`node --env-file=.env build/index.js`).

**The prompt** is `prompts/word.md`, in English — the instructions are for the model, and the answer
they ask for is Russian — and it is edited freely: it is read on every request, and its placeholders
are `{{word}}`, `{{lemma}}`, `{{grammar}}`, `{{forms}}`, `{{sentence}}`, `{{translation}}`,
`{{etymology_source}}`, `{{title}}`, `{{date}}`, `{{zipf}}` and `{{rank}}`. An unknown `{{…}}` makes the
endpoint answer 503 rather than send a silently worse prompt. `prompts/word.ru.md` is the same prompt
with the instructions in Russian — byte for byte what `word.md` held before it was translated — and
`EXPLAIN_PROMPT_PATH=prompts/word.ru.md` is how you switch to it; editing either file invalidates the
cached answers that were made with it, and only those.

**The cache** is the directory in `EXPLAIN_CACHE_DIR` (default `.cache/explanations`), one JSON file
per answer named by the sha1 of the rendered prompt plus `model|temperature|max_tokens`. Editing one
character of the prompt or changing the model invalidates matching answers without any version counter.
Deleting the directory is the eviction policy.

## The glossary of terms

`/read/glossary` is the reader's own dictionary of grammatical vocabulary: 602 entries — parts of speech,
cases, tenses, verb forms, word formation, the marks a dictionary uses — one entry per paragraph, in
Russian alphabetical order, each with its English side in the paragraph pane. It is an article like any
other: a word of an entry is clickable in the sentence pane and explained the way a word of any article
is, Tab walks it, and every paragraph carries the entry's stable ASCII anchor —
`/read/glossary#accusative-case`. `/glossary` redirects to it, and the menubar's «Словарь» opens it.

The Russian side is an adaptation of the English Wiktionary's
[`Appendix:Glossary`](https://en.wiktionary.org/wiki/Appendix:Glossary) (CC BY-SA, see `NOTICE`), not a
copy: headwords, definitions and examples are Russian, the entries are reworded in the terms Russian
grammar uses, an entry whose phenomenon does not exist in Russian says so and names the nearest Russian
one («аблатив … в современном русском его значения передаёт родительный падеж с предлогами *от*, *из*,
*с*»), label pairs the appendix keeps in one word are told apart («архаичное» vs «устарелое»), and where
the appendix names one concept twice — a redirect and the article it points at — the entries keep one.
The order is the Russian alphabet's, so a handful of Latin headwords (`pluralia tantum`, `sic`, `enPR`)
are listed under their own letter.

The English side is the appendix's own text wherever the Russian entry is a translation of it — a primary
source, and 389 of the 602 entries use it verbatim — and where the Russian entry states something about
Russian that the appendix does not, the missing material is written in English and kept in the entry as
`enText`. 229 entries name Russian in their definition: 213 of them needed material, and the other 16 are
facts the appendix already states (`copula` says Arabic, Hebrew and Russian use a null copula). The
paragraph then reads `english headword — the appendix's text. The Russian-specific sentence.` No model is
called: not at read time, and not in the pipeline.

`data/glossary/entries.json` holds the entries — the Russian definitions, the `en` label that joins each
one to its appendix term, and the `enText` an entry adds to it. `scripts/build_glossary.py` writes the two
dumps from those entries and the fetched appendix, and `scripts/build_article.py` builds the article from
the dumps like any other text.

Every code in the grammar chip's popup that the glossary explains is a link to its entry:
`src/lib/grammeme-entries.json` is the map from a pymorphy3 code to an entry id, and a code the map does
not name — `NUMR`, `Dmns`, `Prnt` — keeps its plain gloss, because a link to an entry that does not
explain the code is worse than no link. On the glossary itself the click is a scroll to the entry; from an
article it is the same navigation any other link is. `scripts/check_glossary.py` is what keeps the map
honest: it fails, naming the id, when an id the map names is not an anchor of the built article, and it
checks the anchors themselves — unique, ASCII, one per paragraph.

## Limits

- Nothing in the repo fetches pages: kremlin.ru is unreachable from this machine (TCP 443 times out from
  most non-Russian networks), so dumps come from `https://web.archive.org/web/<ts>id_/<url>`; the
  capture URL of each one is recorded in its own header. Add a fetch step if you ever want one.
- `scripts/extract_page.py` knows this CMS: `itemprop="articleBody"`, the `read__*` furniture classes
  and the `h1`/date markup. A page from another site, or from an older kremlin.ru layout, needs those
  anchors adjusted.
- `ru_full.txt` is an OpenSubtitles-derived frequency list, so "rarity" is subtitle-flavoured; pass
  `--wordlist` to use a better list (the wordlist itself is gitignored, 28 MB).
- The catalog merge keeps one entry per slug; deleting an article's JSON does not remove its catalog
  entry.

## Licence

MIT for the code, the prompt and the documentation — `LICENSE`. `NOTICE` records what that does *not*
cover: the article texts and their official translations under `data/`, `reference/` and
`src/lib/content/` are kremlin.ru's and are here only as the pipeline's input and output, the tag
table in `src/lib/grammar.ts` stays CC BY-SA, from OpenCorpora, and the glossary in
`data/glossary/entries.json` and its dumps stay CC BY-SA, translated and adapted from the English
Wiktionary's `Appendix:Glossary`.
