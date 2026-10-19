#!/usr/bin/env python3
"""Build src/lib/content/<slug>.json from the paired RU/EN page dumps in data/.

Pipeline: strip page chrome -> pair paragraphs -> split + align sentences ->
lemmatize and rank rare words -> emit the JSON the SvelteKit app reads.

Input (per article, `president-news-<id>-<lang>.txt` in data/): plain-text dumps
of the presidential page, one paragraph per line, page chrome still attached.

Run:
  .venv/bin/python scripts/build_article.py 66181 --out scripts/out

Rarity: a lemma's score is max(zipf_frequency) over the lemma and the surface
forms that occur in the article (wordfreq, ru). Ties break on the highest
occurrence count in the hermitdave ru_full wordlist, then alphabetically.
Proper nouns (pymorphy3 Name/Surn/Patr/Geox/Orgn/Trad) are never clickable: the
reader is not learning that Kiev is a place.

Sentence alignment: the official translation walks the Russian sentence by
sentence but merges some, so plain index pairing highlights the wrong English
sentence after the first merge. align_sentences runs a monotone DP that prefers
one-to-one matches and spends merges and gaps only where the sentence counts
force it; costs are calibrated on the article's own RU:EN character ratio.
A Russian sentence with no counterpart gets `null` and the UI falls back to
highlighting the whole English paragraph.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- page chrome markers -----------------------------------------------------
# Everything between the date line and the first marker is the article body.
RU_DATE = re.compile(r"^\d{1,2}\s+\S+\s+\d{4}\s+года\s+\d{2}:\d{2}$")
EN_DATE = re.compile(r"^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+\d{2}:\d{2}$")
RU_BODY_END = ("География", "Темы", "Статус материала")
EN_BODY_END = ("Geography", "Topics", "Publication status")
RU_SIGNATURE = re.compile(r"^[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+$")

# --- sentences ---------------------------------------------------------------
ABBREV = {
    "т", "д", "п", "е", "г", "гг", "в", "вв", "обл", "тыс", "млн", "млрд", "им",
    "ул", "см", "напр", "англ", "лат", "нем", "греч", "польск", "укр", "рус",
    "св", "рис", "стр", "проф", "акад", "тов", "др", "проч", "к", "н", "э",
    "mr", "mrs", "ms", "dr", "st", "vs", "etc", "eg", "ie", "us", "no", "vol",
    "jr", "sr", "inc", "ltd",
}
SENT_END = re.compile(r"([.!?…]+)([»\"”“]?)(\s+)")
TAIL_WORD = re.compile(r"([A-Za-zА-Яа-яЁё.]+)$")
# The Russian page closes quotes with »; the English one uses the reversed style
# (”…“), so a bare “ also terminates a sentence there.
CLOSERS = "»\"”“"

# --- alignment costs ---------------------------------------------------------
MATCH_CAP = 0.6  # worst tolerated one-to-one mismatch
MERGE_BASE = 0.7  # folding several sentences into one
MERGE_EXTRA = 0.15  # per extra sentence folded in
GAP_RU = 0.9  # Russian sentence with no English counterpart at all
GAP_EN = 0.75  # English sentence no Russian sentence points at
# The translation also splits where the Russian packs a remark into the sentence
# before it: a transcript is full of "We both know this." standing alone on the
# English side. A split has to undercut GAP_EN, otherwise the alignment orphans
# that English sentence — it would never be highlighted — instead of keeping it
# attached to the Russian sentence it translates.
SPLIT_BASE = 0.35  # one Russian sentence spread over two English ones
SPLIT_EXTRA = 0.2  # per extra English sentence
SPLIT_MAX = 4  # most English sentences a single Russian sentence may cover
SPLIT_CAP = GAP_EN - 0.05  # a split stays cheaper than orphaning, however long

# --- tokens ------------------------------------------------------------------
TOKEN = re.compile(r"[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*")
PROPER = {"Name", "Surn", "Patr", "Geox", "Orgn", "Trad"}
DIGITS = re.compile(r"\d+")


def read_body(path: Path, lang: str) -> list[str]:
    """Return the article's paragraph lines with the page chrome removed."""
    lines = [l.strip() for l in path.read_text(encoding="utf-8").split("\n")]
    lines = [l for l in lines if l and not l.startswith("#")]
    date_re, body_end = (RU_DATE, RU_BODY_END) if lang == "ru" else (EN_DATE, EN_BODY_END)

    start = next((i + 1 for i, l in enumerate(lines) if date_re.match(l)), None)
    if start is None:
        raise SystemExit(f"{path}: no date line found, cannot locate the body")
    end = next((i for i in range(start, len(lines)) if lines[i] in body_end), len(lines))
    body = lines[start:end]
    if lang == "ru":
        while body and RU_SIGNATURE.match(body[-1]):
            body.pop()
    return body


def normalize(text: str) -> str:
    """Collapse the typographic whitespace the page uses; offsets stay valid."""
    return text.replace("\u00a0", " ").replace("\u202f", " ").strip()


def split_sentences(text: str) -> list[tuple[int, int]]:
    """Sentence spans as [start, end) offsets. The spans tile the text exactly."""
    bounds: list[int] = []
    for m in SENT_END.finditer(text):
        prev = TAIL_WORD.search(text[: m.start(1)])
        word = prev.group(1).lower().rstrip(".") if prev else ""
        if word in ABBREV or len(word) == 1:
            continue  # "и т.д." / "В. Путин" / "U.S."
        # a closing quote stays with the sentence it terminates
        end = m.end(1) + len(m.group(2))
        after = text[m.end() :]
        if not after:
            bounds.append(len(text))
            break
        head = after[0]
        if not (head.isupper() or head.isdigit() or head in CLOSERS):
            continue  # "...далее" continues the sentence
        bounds.append(end)
    spans: list[tuple[int, int]] = []
    cur = 0
    for b in bounds:
        if b > cur:
            spans.append((cur, b))
            cur = b
    if cur < len(text):
        spans.append((cur, len(text)))
    return spans


def align_sentences(
    ru: str,
    rs: list[tuple[int, int]],
    en: str,
    es: list[tuple[int, int]],
    ratio: float,
) -> tuple[list[list[int | list[int]]], float, int]:
    """Monotone sentence alignment for one paragraph.

    Moves: one-to-one, several Russian sentences into one English sentence (the
    translation merges), one Russian sentence over several English ones (the
    translation splits), a Russian sentence with no counterpart, and an English
    sentence no Russian sentence points at. `pairs` holds one row per Russian
    sentence — `[ru, [en, ...]]`, the English indices contiguous and possibly
    empty — plus the mean cost and the number of unmatched English sentences.
    """
    n, m = len(rs), len(es)
    rtxt = [ru[s:e].strip() for s, e in rs]
    etxt = [en[s:e].strip() for s, e in es]
    rlen = [max(len(t), 1) for t in rtxt]
    elen = [max(len(t), 1) for t in etxt]

    def length_cost(lr: int, le: int) -> float:
        """How far the group's RU:EN length ratio sits from the article's."""
        dev = abs(math.log2((lr / le) / ratio)) if lr and le else 4.0
        return min(MATCH_CAP, 0.5 * dev)

    INF = float("inf")
    best = [[INF] * (m + 1) for _ in range(n + 1)]
    back: dict[tuple[int, int], tuple[int, int, int, int]] = {}
    best[0][0] = 0.0
    for i in range(n + 1):
        for j in range(m + 1):
            if best[i][j] == INF:
                continue
            moves: list[tuple[int, int, float]] = [
                (1, 1, 0.0),
                (2, 1, MERGE_BASE + MERGE_EXTRA),
                (3, 1, MERGE_BASE + 2 * MERGE_EXTRA),
                (1, 0, GAP_RU),
                (0, 1, GAP_EN),
            ]
            for count in range(2, SPLIT_MAX + 1):
                moves.append((1, count, min(SPLIT_BASE + SPLIT_EXTRA * (count - 2), SPLIT_CAP)))
            for k, l, base in moves:
                if i + k > n or j + l > m:
                    continue
                if k and l:
                    cost = base + length_cost(sum(rlen[i : i + k]), sum(elen[j : j + l]))
                else:
                    cost = base
                if best[i][j] + cost < best[i + k][j + l] - 1e-9:
                    best[i + k][j + l] = best[i][j] + cost
                    back[(i + k, j + l)] = (i, j, k, l)

    pairs: list[list[int | list[int]]] = []
    unmatched_en = 0
    i, j = n, m
    while (i, j) != (0, 0):
        pi, pj, k, l = back[(i, j)]
        if k and l:
            for r in range(pi, i):
                pairs.append([r, list(range(pj, pj + l))])
        elif l:
            unmatched_en += l
        else:
            for r in range(pi, i):
                pairs.append([r, []])
        i, j = pi, pj
    pairs.sort(key=lambda p: p[0])
    return pairs, round(best[n][m] / max(n, m), 3), unmatched_en


def load_wordlist(path: Path, wanted: set[str]) -> dict[str, int]:
    """Stream the frequency list, keeping counts only for the forms we need."""
    counts: dict[str, int] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            form, _, count = line.rpartition(" ")
            form = form.strip().lower()
            if form in wanted:
                counts[form] = int(count)
    return counts


RU_MONTHS = {
    "января": 1, "февраля": 2, "марта": 3, "апреля": 4, "мая": 5, "июня": 6,
    "июля": 7, "августа": 8, "сентября": 9, "октября": 10, "ноября": 11, "декабря": 12,
}


def date_for(path: Path, lang: str) -> str:
    """ISO date of the RU date line, e.g. `12 июля 2021 года 17:00` (+03:00)."""
    date_re = RU_DATE if lang == "ru" else EN_DATE
    lines = [l.strip() for l in path.read_text(encoding="utf-8").split("\n") if l.strip()]
    line = next((l for l in lines if date_re.match(l)), None)
    if line is None:
        raise SystemExit(f"{path}: no date line found")
    if lang == "ru":
        day, month, year, _, clock = line.split()
        return f"{int(year):04d}-{RU_MONTHS[month]:02d}-{int(day):02d}T{clock}+03:00"
    # the English page states the same moment in the same zone
    parsed = datetime.strptime(line, "%B %d, %Y %H:%M")
    return f"{parsed:%Y-%m-%dT%H:%M}+03:00"


def title_for(path: Path, lang: str) -> str:
    date_re = RU_DATE if lang == "ru" else EN_DATE
    lines = [l.strip() for l in path.read_text(encoding="utf-8").split("\n") if l.strip()]
    for i, l in enumerate(lines):
        if date_re.match(l) and i:
            return lines[i - 1]
    return ""


def dump_path(data: Path, slug: str, lang: str) -> Path:
    """The page dump for `slug`: `data/<section>-<slug>-<lang>.txt`.

    The section name is the page's own (`president-news`, `president-transcripts`),
    so the file is found by suffix rather than by a hardcoded prefix.
    """
    found = sorted(data.glob(f"*-{slug}-{lang}.txt"))
    if not found:
        raise SystemExit(f"{data}: no *-{slug}-{lang}.txt dump")
    if len(found) > 1:
        names = ", ".join(p.name for p in found)
        raise SystemExit(f"{data}: several dumps match *-{slug}-{lang}.txt ({names})")
    return found[0]


def source_for(path: Path, lang: str, slug: str) -> str:
    """The page URL recorded in the dump's `# source:` header, else the old guess."""
    for line in path.read_text(encoding="utf-8").split("\n"):
        if not line.startswith("#"):
            break
        m = re.match(r"#\s*source:\s*(\S+)\s*$", line)
        if m:
            return m.group(1)
    host = "en.kremlin.ru" if lang == "en" else "kremlin.ru"
    return f"http://{host}/events/president/news/{slug}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("article_id")
    ap.add_argument("--data", type=Path, default=ROOT / "data")
    ap.add_argument("--out", type=Path, default=ROOT / "src/lib/content")
    ap.add_argument("--wordlist", type=Path, default=ROOT / "data/wordlists/ru_full.txt")
    ap.add_argument("--count", type=int, default=200, help="how many rare lemmas")
    args = ap.parse_args()

    import pymorphy3
    from wordfreq import zipf_frequency

    slug = args.article_id
    ru_path = dump_path(args.data, slug, "ru")
    en_path = dump_path(args.data, slug, "en")
    ru_paras = [normalize(l) for l in read_body(ru_path, "ru")]
    en_paras = [normalize(l) for l in read_body(en_path, "en")]
    if len(ru_paras) != len(en_paras):
        raise SystemExit(f"paragraph count mismatch: ru={len(ru_paras)} en={len(en_paras)}")

    morph = pymorphy3.MorphAnalyzer()

    # --- pass 1: sentences, tokens, lemmas ----------------------------------
    skeleton = []
    lemma_forms: dict[str, set[str]] = defaultdict(set)
    lemma_paras: dict[str, set[int]] = defaultdict(set)
    lemma_count: Counter[str] = Counter()
    lemma_tag: dict[str, str] = {}
    lemma_proper: set[str] = set()
    ru_chars = en_chars = 0

    for i, (ru, en) in enumerate(zip(ru_paras, en_paras), start=1):
        ru_chars += len(ru)
        en_chars += len(en)
        spans = split_sentences(ru)
        tokens = []
        si, seen_span = 0, -1
        for m in TOKEN.finditer(ru):
            form = m.group(0)
            parses = morph.parse(form)
            parse = parses[0]
            lemma = parse.normal_form
            lemma_forms[lemma].add(form.lower())
            lemma_paras[lemma].add(i)
            lemma_count[lemma] += 1
            lemma_tag.setdefault(lemma, str(parse.tag))
            if any(g in PROPER for g in parse.tag.grammemes):
                lemma_proper.add(lemma)
            # rule B: a capitalised name is proper from the first parse, or from
            # any parse when the token is not the sentence's first token (a
            # sentence-initial word is capitalised for grammar, not as a name)
            while si + 1 < len(spans) and m.start() >= spans[si][1]:
                si += 1
            sentence_initial = si != seen_span
            seen_span = si
            proper = False
            if len(form) > 1 and form[0].isupper():
                first = any(g in PROPER for g in parse.tag.grammemes)
                anyp = any(g in PROPER for p in parses for g in p.tag.grammemes)
                proper = first or (anyp and not sentence_initial)
            tokens.append(
                {
                    "start": m.start(),
                    "end": m.end(),
                    "form": form,
                    "lemma": lemma,
                    # the tag of this form, not of the lemma: the reader and the
                    # prompt both want the case, number and tense they clicked
                    "grammar": str(parse.tag),
                    "rare": False,
                    "proper": proper,
                }
            )
        skeleton.append(
            {
                "i": i,
                "ru": ru,
                "en": en,
                "ruSpans": spans,
                "enSpans": split_sentences(en),
                "ruTokens": tokens,
            }
        )

    ratio = ru_chars / en_chars if en_chars else 1.0

    # --- pass 2: align -------------------------------------------------------
    paragraphs = []
    unaligned = unmatched_total = unmatched_en_total = cost_sum = 0
    for para in skeleton:
        rs, es = para["ruSpans"], para["enSpans"]
        pairs, cost, unmatched_en = align_sentences(para["ru"], rs, para["en"], es, ratio)
        unmatched = sum(1 for _, e in pairs if not e)
        unaligned += len(rs) != len(es)
        unmatched_total += unmatched
        unmatched_en_total += unmatched_en
        cost_sum += cost
        paragraphs.append(
            {
                "i": para["i"],
                "aligned": len(rs) == len(es),
                "alignCost": cost,
                "ru": para["ru"],
                "en": para["en"],
                "ruSentences": [{"i": k, "start": s, "end": e} for k, (s, e) in enumerate(rs)],
                "enSentences": [{"i": k, "start": s, "end": e} for k, (s, e) in enumerate(es)],
                "pairs": pairs,
                "ruTokens": para["ruTokens"],
            }
        )

    # --- pass 3: rarity ------------------------------------------------------
    wanted = {l.lower() for l in lemma_forms}
    for forms in lemma_forms.values():
        wanted.update(forms)
    wordlist = load_wordlist(args.wordlist, wanted)
    lemma_hf: dict[str, int] = {}
    lemma_zipf: dict[str, float] = {}
    for lemma, forms in lemma_forms.items():
        keys = {lemma.lower(), *forms}
        lemma_zipf[lemma] = max(zipf_frequency(k, "ru") for k in keys)
        lemma_hf[lemma] = max((wordlist.get(k, 0) for k in keys), default=0)

    eligible = [l for l in lemma_forms if l not in lemma_proper and len(l) > 1]
    eligible.sort(key=lambda l: (lemma_zipf[l], -lemma_hf[l], l))
    selected = eligible[: args.count]
    rare_rank = {lemma: rank for rank, lemma in enumerate(selected, start=1)}

    rare_tokens = 0
    for para in paragraphs:
        for token in para["ruTokens"]:
            if token["lemma"] in rare_rank:
                token["rare"] = True
                rare_tokens += 1

    rare = [
        {
            "lemma": lemma,
            "freq": round(lemma_zipf[lemma], 2),
            "hf": lemma_hf[lemma],
            "rank": rare_rank[lemma],
            "count": lemma_count[lemma],
            "grammar": lemma_tag[lemma],
            "paragraphs": sorted(lemma_paras[lemma]),
            "forms": sorted(lemma_forms[lemma]),
        }
        for lemma in selected
    ]

    article = {
        "slug": slug,
        "title": {"ru": title_for(ru_path, "ru"), "en": title_for(en_path, "en")},
        "date": date_for(ru_path, "ru"),
        "source": {
            "ru": source_for(ru_path, "ru", slug),
            "en": source_for(en_path, "en", slug),
        },
        "stats": {
            "paragraphs": len(paragraphs),
            "unalignedParagraphs": unaligned,
            "unmatchedSentences": unmatched_total,
            "unmatchedEnSentences": unmatched_en_total,
            "meanAlignCost": round(cost_sum / len(paragraphs), 3),
            "ruSentences": sum(len(p["ruSentences"]) for p in paragraphs),
            "enSentences": sum(len(p["enSentences"]) for p in paragraphs),
            "ruTokens": sum(len(p["ruTokens"]) for p in paragraphs),
            "ruLemmas": len(lemma_forms),
            "rareLemmas": len(rare),
            "rareTokens": rare_tokens,
        },
        "paragraphs": paragraphs,
        "rare": rare,
    }

    args.out.mkdir(parents=True, exist_ok=True)
    out_path = args.out / f"{slug}.json"
    out_path.write_text(json.dumps(article, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    catalog = args.out / "articles.json"
    entries = []
    if catalog.exists():
        entries = [e for e in json.loads(catalog.read_text(encoding="utf-8")) if e.get("slug") != slug]
    entries.append(
        {
            "slug": slug,
            "title": article["title"],
            "date": article["date"],
            "stats": article["stats"],
        }
    )
    entries.sort(key=lambda e: e["date"], reverse=True)
    catalog.write_text(json.dumps(entries, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # --- report --------------------------------------------------------------
    s = article["stats"]
    print(f"wrote {out_path} ({out_path.stat().st_size / 1024:.0f} KiB) and {catalog}")
    print(f"paragraphs            {s['paragraphs']}  (unequal sentence counts: {s['unalignedParagraphs']})")
    print(f"sentences ru/en       {s['ruSentences']}/{s['enSentences']}")
    print(f"unmatched ru/en sent  {s['unmatchedSentences']}/{s['unmatchedEnSentences']}  mean cost {s['meanAlignCost']}")
    print(f"ru tokens             {s['ruTokens']}  lemmas {s['ruLemmas']}")
    print(f"proper nouns skipped  {len(lemma_proper & set(lemma_forms))}")
    print(f"rare lemmas           {len(rare)} of {len(eligible)} eligible, {rare_tokens} tokens clickable")
    print(f"rarity boundary       zipf {rare[-1]['freq']} ({rare[-1]['lemma']})")
    print("\nrarest 10:")
    for r in rare[:10]:
        print(f"  {r['rank']:3d} {r['lemma']:20s} zipf={r['freq']:<5} hf={r['hf']:<7} n={r['count']}  {r['grammar']}")
    print("\nleast rare 5 of the selection:")
    for r in rare[-5:]:
        print(f"  {r['rank']:3d} {r['lemma']:20s} zipf={r['freq']:<5} hf={r['hf']:<7} n={r['count']}")
    print("\nsample of skipped proper nouns:")
    print("  " + ", ".join(sorted(lemma_proper)[:25]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
