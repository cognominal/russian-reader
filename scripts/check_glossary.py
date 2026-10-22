#!/usr/bin/env python3
"""Check the two things about the glossary that can rot without a diff in the app.

The glossary article is generated, and two of its properties are load-bearing
outside it: every paragraph's anchor must be unique and ASCII, because the
grammar chip's popup links to one by URL fragment; and every id the popup's
grammeme map names must be one of those anchors, because a regenerated glossary
can drop an entry while the map goes on pointing at it. Neither shows up as a
type error, a test failure or a broken build — the reader finds out, one broken
link at a time.

So this is run by hand, the way the pipeline is:

  .venv/bin/python scripts/check_glossary.py

It prints what it checked and exits non-zero on the first failure, naming the
entry or the id that is wrong.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--article", type=Path, default=ROOT / "src/lib/content/glossary.json")
    ap.add_argument("--map", type=Path, default=ROOT / "src/lib/grammeme-entries.json")
    args = ap.parse_args()

    if not args.article.exists():
        raise SystemExit(f"{args.article} is not there: build the glossary article first")
    article = json.loads(args.article.read_text(encoding="utf-8"))
    paragraphs = article["paragraphs"]
    print(f"article   {args.article}: {len(paragraphs)} paragraphs")

    # 1. the anchors: unique, ASCII, and every paragraph has one
    anchors: list[str] = []
    for paragraph in paragraphs:
        anchor = paragraph.get("anchor")
        if not anchor:
            raise SystemExit(f"paragraph {paragraph['i']} has no anchor")
        if not anchor.isascii():
            raise SystemExit(f"paragraph {paragraph['i']}: the anchor `{anchor}` is not ASCII")
        anchors.append(anchor)
    seen: set[str] = set()
    for anchor in anchors:
        if anchor in seen:
            raise SystemExit(f"the anchor `{anchor}` appears twice")
        seen.add(anchor)
    print(f"anchors   {len(seen)} unique, all ASCII")

    # 2. the popup's map: every id it names is one of them
    grammemes: dict[str, str] = json.loads(args.map.read_text(encoding="utf-8"))
    print(f"map       {args.map}: {len(grammemes)} codes")
    for grammeme, entry in sorted(grammemes.items()):
        if entry not in seen:
            raise SystemExit(
                f"the code `{grammeme}` points at `{entry}`, which is not an anchor of the article"
            )
    print(f"checked   every one of the {len(grammemes)} ids is an anchor of the article")
    return 0


if __name__ == "__main__":
    sys.exit(main())
