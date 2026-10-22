#!/usr/bin/env python3
"""Build the glossary's two dumps from the authored entries and the appendix.

The glossary is read as one article, and an article is built from a pair of dumps
(`scripts/build_article.py`). This script writes that pair: one paragraph per
entry, in Russian alphabetical order, the Russian side and the English side at the
same position, every line prefixed with the entry's `id` — the anchor the reader
links to.

The two sides are not the same kind of text, and that is the decision this script
implements. The Russian side is mechanical: the headword with its aliases, the
definition, and the entries it points at. The English side is the English
Wiktionary's own text wherever the Russian entry is a translation of it — the
appendix is a primary source and is quoted verbatim — and where the Russian entry
says something about Russian that the appendix does not, the entry carries that
material as `enText`, written once and committed beside the definition. Nothing is
translated at build time and no model is called: the only inputs are the authored
entries, the appendix, and the text already written in them.

Run:

  .venv/bin/python scripts/build_glossary.py --appendix /tmp/appendix_glossary.wikitext

The appendix is fetched if it is not there, and is never committed: like the
kremlin.ru pages, only the dumps it produced are.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

from glossary_appendix import Term, fold, index, parse

ROOT = Path(__file__).resolve().parent.parent
APPENDIX_URL = "https://en.wiktionary.org/w/index.php?title=Appendix:Glossary&action=raw"
SOURCE_URL = "https://en.wiktionary.org/wiki/Appendix:Glossary"
NOTE = (
    "Адаптировано из Appendix:Glossary английского Викисловаря (en.wiktionary.org), CC BY-SA."
)
RU_TITLE = "Словарь грамматических терминов"
EN_TITLE = "Glossary of grammatical terms"
SEPARATOR = " — "
SPACES = re.compile(r"\s+")
# The Russian definition naming Russian is what the worklist rule keys on: those
# are the entries whose English side may need material the appendix lacks.
RUSSIAN = re.compile(r"русск|по-русски|в русском", re.I)


def one_line(text: str) -> str:
    """The dump is one paragraph per line, so a paragraph is one line."""
    return SPACES.sub(" ", text).strip()


def russian_side(entry: dict) -> str:
    """The entry as Russian prose: headword, aliases, definition, and the entries
    it points at. The references are text, not links: an article has one rendering
    path for a paragraph and this is it."""
    head = entry["ru"].strip()
    if entry["aliases"]:
        head = f"{head} ({', '.join(entry['aliases'])})"
    text = f"{head}{SEPARATOR}{entry['def'].strip()}"
    if entry["see"]:
        text = f"{text} См. также: {', '.join(entry['see'])}."
    return one_line(text)


def english_side(entry: dict, term: Term | None) -> str:
    """The entry as English prose: its own English headword, then the appendix's
    text for the term it came from, then whatever this entry adds to it."""
    parts = [entry["en"].strip()]
    if term is not None:
        parts.append(term.text.strip())
    parts.append(entry.get("enText", "").strip())
    return one_line(f"{parts[0]}{SEPARATOR}{' '.join(p for p in parts[1:] if p)}")


def fetch_appendix(path: Path) -> None:
    request = urllib.request.Request(APPENDIX_URL, headers={"User-Agent": "russian-reader/0.1"})
    with urllib.request.urlopen(request) as response:  # noqa: S310 - a fixed https URL
        body = response.read().decode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    print(f"fetched {APPENDIX_URL} -> {path} ({len(body)} bytes)")


def header() -> list[str]:
    """The dump's own header, in the shape the kremlin.ru dumps use. It declares the
    dateless shape, which is what makes a dump with no date line valid for the
    pipeline."""
    return [
        f"# source: {SOURCE_URL}",
        "# extracted by scripts/build_glossary.py from the authored entries and the appendix",
        "# date: none",
        f"# note: {NOTE}",
    ]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--entries", type=Path, default=ROOT / "data/glossary/entries.json")
    ap.add_argument("--appendix", type=Path, default=Path("/tmp/appendix_glossary.wikitext"))
    ap.add_argument("--out", type=Path, default=ROOT / "data")
    ap.add_argument("--slug", default="glossary")
    args = ap.parse_args()

    if not args.appendix.exists():
        fetch_appendix(args.appendix)
    terms = parse(args.appendix)
    appendix = index(terms)
    entries: list[dict] = json.loads(args.entries.read_text(encoding="utf-8"))

    # --- the guards: a wrong dump is worse than no dump -----------------------
    seen: set[str] = set()
    for entry in entries:
        where = entry.get("id", "<no id>")
        if not entry.get("id"):
            raise SystemExit(f"an entry has no id: {entry.get('ru', entry)}")
        if not entry["id"].isascii():
            raise SystemExit(f"{where}: the id is not ASCII")
        if entry["id"] in seen:
            raise SystemExit(f"two entries share the id `{where}`")
        seen.add(entry["id"])
        for field in ("ru", "en", "def"):
            if not str(entry.get(field, "")).strip():
                raise SystemExit(f"{where}: the entry has no {field}")
        term = appendix.get(fold(entry["en"]))
        if term is None and "enText" not in entry:
            raise SystemExit(
                f"{where}: `{entry['en']}` matches no appendix term and the entry writes no English"
            )
        if "enText" in entry and not entry["enText"].strip():
            raise SystemExit(f"{where}: enText is empty — drop the key instead")

    # --- the two dumps -------------------------------------------------------
    ru: list[str] = []
    en: list[str] = []
    additions = 0
    borrowed: list[str] = []
    for entry in entries:
        term = appendix.get(fold(entry["en"]))
        if term is not None and fold(term.term) != fold(entry["en"]):
            borrowed.append(f"  {entry['id']:28s} {entry['en']!r} -> {term.term!r}")
        if entry.get("enText", "").strip():
            additions += 1
        ru.append(f"{entry['id']}\t{russian_side(entry)}")
        en.append(f"{entry['id']}\t{english_side(entry, term)}")

    if len(ru) != len(en):
        raise SystemExit(f"the two sides differ: ru={len(ru)} en={len(en)}")

    args.out.mkdir(parents=True, exist_ok=True)
    for lang, title, lines in (("ru", RU_TITLE, ru), ("en", EN_TITLE, en)):
        path = args.out / f"wiktionary-{args.slug}-{lang}.txt"
        body = "\n".join([*header(), title, *lines, ""])
        path.write_text(body, encoding="utf-8")
        print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KiB, {len(lines)} paragraphs)")

    # --- report --------------------------------------------------------------
    # An entry whose Russian names Russian is the one a maintainer has to look at
    # again when the Russian text changes: either it carries the material the
    # appendix lacks, or it was checked and the appendix already says it.
    silent = [
        entry["id"]
        for entry in entries
        if RUSSIAN.search(entry["def"]) and not entry.get("enText", "").strip()
    ]
    print(f"entries               {len(entries)}")
    print(f"appendix              {len(terms)} terms, {len(appendix)} names")
    print(f"english written       {additions} entries add material to the appendix's text")
    print(f"joined by another name {len(borrowed)}")
    if borrowed:
        print("\n".join(borrowed))
    print(f"names Russian, adds nothing {len(silent)}")
    print("  " + ", ".join(silent))
    return 0


if __name__ == "__main__":
    sys.exit(main())
