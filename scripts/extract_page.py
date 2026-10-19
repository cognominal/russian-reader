#!/usr/bin/env python3
"""Turn an archived kremlin.ru page into the RU/EN dump `build_article.py` reads.

    curl --compressed -o /tmp/24034.ru.html \
      "http://web.archive.org/web/20261010173254id_/http://kremlin.ru/events/president/transcripts/24034"
    .venv/bin/python scripts/extract_page.py --lang ru --html /tmp/24034.ru.html \
      --url https://kremlin.ru/events/president/transcripts/24034 --capture 20261010173254 \
      --out data/president-transcripts-24034-ru.txt

The dump keeps the page's own words: a `#` provenance header, the title, the date
line, then one paragraph per line — the shape of the hand-pasted dumps. Paragraph
text is exactly what the page shows, with only markup and page whitespace
dropped, because every offset in the JSON indexes these strings.

The CMS marks the article body with `itemprop="articleBody"`, but it nests the
page's own metadata (publication status, share tabs) inside the same element, so
paragraphs under those `read__*` chrome classes are dropped as well.
"""

from __future__ import annotations

import argparse
import gzip
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The two date-line shapes build_article.py finds the body with (kept in sync
# with that script). A dump whose date line does not match would make the
# pipeline read the whole file as body, so fail here instead.
RU_DATE = re.compile(r"^\d{1,2}\s+\S+\s+\d{4}\s+года\s+\d{2}:\d{2}$")
EN_DATE = re.compile(r"^[A-Z][a-z]+\s+\d{1,2},\s+\d{4}\s+\d{2}:\d{2}$")

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
    "param", "source", "track", "wbr",
}
# Page furniture that shares the article-body element with the text.
SKIP_CLASSES = ("read__bottom", "read__status", "read__tabs", "read__meta", "read__lead")


def squash(text: str) -> str:
    """Page whitespace (NBSP, narrow NBSP, newlines) becomes single spaces."""
    text = text.replace("\u00a0", " ").replace("\u202f", " ").replace("\u2009", " ")
    return re.sub(r"\s+", " ", text).strip()


class Page(HTMLParser):
    """Title, date and body paragraphs of one kremlin.ru page.

    Open elements are tracked as a stack and a `</tag>` pops back to its match,
    which keeps the nesting honest on pages that leave a tag unclosed.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, str, bool]] = []  # tag, class, is article body
        self.kind = ""
        self.at = 0
        self.buf: list[str] = []
        self.skip = 0
        self.title: list[str] = []
        self.date: list[str] = []
        self.time: list[str] = []
        self.paras: list[str] = []

    def _in_body(self) -> bool:
        """Inside the article body, and outside its embedded page furniture."""
        if not any(body for _, _, body in self.stack):
            return False
        return not any(cls.startswith(SKIP_CLASSES) for _, cls, _ in self.stack)

    def _flush(self) -> None:
        if not self.kind:
            return
        text = squash("".join(self.buf))
        if text:
            {"title": self.title, "date": self.date, "time": self.time}.get(
                self.kind, self.paras
            ).append(text)
        self.kind = ""
        self.buf = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("script", "style"):
            self.skip += 1
            return
        if tag in VOID:
            if tag == "br":
                self.buf.append(" ")
            return
        a = {k: (v or "") for k, v in attrs}
        cls = a.get("class", "")
        self.stack.append((tag, cls, a.get("itemprop") == "articleBody"))
        kind = ""
        if tag == "h1" and "entry-title" in cls:
            kind = "title"
        elif a.get("itemprop") == "datePublished":
            kind = "date"
        elif tag == "div" and "read__time" in cls:
            kind = "time"
        elif tag == "p" and self._in_body():
            kind = "para"
        if kind:
            self._flush()
            self.kind, self.at, self.buf = kind, len(self.stack), []

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style"):
            self.skip = max(self.skip - 1, 0)
            return
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break
        if self.kind and self.at > len(self.stack):
            self._flush()

    def handle_data(self, data: str) -> None:
        if not self.skip and self.kind:
            self.buf.append(data)


def read_html(path: Path) -> str:
    """The archived bytes as text; curl may hand back gzip without unpacking."""
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw.decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--html", type=Path, required=True, help="archived page")
    ap.add_argument("--lang", choices=("ru", "en"), required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--url", required=True, help="the page's own URL, for provenance")
    ap.add_argument("--capture", default="", help="wayback timestamp, for provenance")
    ap.add_argument(
        "--join",
        action="append",
        default=[],
        metavar="N+M",
        help="join paragraphs N and M (1-based, after the title and date) with a space",
    )
    ap.add_argument("--note", default="", help="why, written into the dump header")
    args = ap.parse_args()

    page = Page()
    page.feed(read_html(args.html))
    page.close()
    page._flush()

    if len(page.title) != 1:
        raise SystemExit(f"{args.html}: expected one article title, found {page.title}")
    if len(page.date) != 1 or len(page.time) != 1:
        raise SystemExit(f"{args.html}: date/time not found ({page.date} {page.time})")
    date_line = squash(f"{page.date[0]} {page.time[0]}")
    if not (RU_DATE if args.lang == "ru" else EN_DATE).match(date_line):
        raise SystemExit(f"{args.html}: date line {date_line!r} is not the expected shape")

    paras = page.paras
    for spec in args.join:
        try:
            first, second = (int(n) for n in spec.split("+"))
        except ValueError:
            raise SystemExit(f"--join {spec}: expected N+M")
        if second != first + 1:
            raise SystemExit(f"--join {spec}: only adjacent paragraphs can be joined")
        if not (1 <= first < len(paras)):
            raise SystemExit(f"--join {spec}: no paragraph {first} in {len(paras)}")
        # 1-based, counting paragraphs only: the title and date are not paragraphs
        paras[first - 1 : first + 1] = [paras[first - 1] + " " + paras[first]]
    for p in paras:
        if not p or p.startswith("#"):
            raise SystemExit(f"{args.html}: paragraph {p!r} would break the dump format")

    header = [f"# source: {args.url}"]
    if args.capture:
        header.append(f"# capture: http://web.archive.org/web/{args.capture}id_/{args.url}")
    header.append(f"# extracted by scripts/extract_page.py from {args.html.name}")
    for spec in args.join:
        first, second = (int(n) for n in spec.split("+"))
        tail = f": {args.note}" if args.note else ""
        header.append(f"# joined paragraphs {first}+{second}{tail}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        "\n".join([*header, page.title[0], date_line, *paras]) + "\n", encoding="utf-8"
    )
    print(f"wrote {args.out} ({args.out.stat().st_size / 1024:.0f} KiB)")
    print(f"  title   {page.title[0]}")
    print(f"  date    {date_line}")
    print(f"  paras   {len(paras)}" + (f", joined {', '.join(args.join)}" if args.join else ""))
    print(f"  chars   {sum(len(p) for p in paras)}")
    print(f"  first   {paras[0][:80]}")
    print(f"  last    {paras[-1][:80]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
