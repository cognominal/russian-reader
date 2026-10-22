#!/usr/bin/env python3
"""Parse the English Wiktionary's `Appendix:Glossary` into terms with their text.

The appendix is fetched once, at build time, and never committed — the same
treatment the kremlin.ru pages get: only the dumps it produced are. This module
turns its wikitext into the two things the glossary's build needs: the headword of
every term (the name the Russian entries point at) and the plain text of its
definition (the English side of every entry that is a translation of it).

The renderer knows the handful of templates the appendix uses and refuses to guess
at any other: an unknown template or a link it cannot read stops the parse and
names what it found, because the English side is what the reader will read and a
half-rendered one is worse than none.

Run it to review what it parsed:

  .venv/bin/python scripts/glossary_appendix.py /tmp/appendix_glossary.wikitext
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Term:
    """One `;` term of the appendix."""

    #: The headword, wikitext rendered: `accusative case`, `a.`, `tashif`.
    term: str
    #: Every name the term declares, the term itself included: the `{{anchor}}`
    #: names the appendix's own cross-references use, which is how a Russian entry
    #: whose English label spells the term differently still finds it.
    names: tuple[str, ...]
    #: The definition, rendered to plain text: one paragraph, whatever number of
    #: `:` lines the appendix used.
    text: str


class UnknownMarkup(Exception):
    """A template or a link the renderer does not know how to read."""


# --- wikitext ----------------------------------------------------------------

COMMENT = re.compile(r"<!--.*?-->", re.S)
REF = re.compile(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", re.S)
TAG = re.compile(r"</?(?:u|b|i|small|big|span|code|tt|sup|sub|nowiki)\b[^>]*>")
BR = re.compile(r"<br\s*/?>")
EMPHASIS = re.compile(r"'{2,5}")
TEMPLATE = re.compile(r"\{\{([^{}]*)\}\}")
LINK = re.compile(r"\[\[([^\[\]]*)\]\]")
NAMED = re.compile(r"^[A-Za-z_0-9]+=")
LANG_CODE = re.compile(r"^[a-z][a-z-]{0,9}$")
ENTITIES = {
    "&nbsp;": " ",
    "&thinsp;": " ",
    "&amp;": "&",
    "&quot;": '"',
    "&lt;": "<",
    "&gt;": ">",
    "&minus;": "−",
    "&ndash;": "–",
    "&mdash;": "—",
    "&times;": "×",
    "&middot;": "·",
    "&#8203;": "",
}


def _split(inner: str) -> tuple[str, list[str]]:
    """A template's name and its positional parameters, named ones dropped.

    The split happens outside `[[…]]`, because a parameter may be a piped link of
    its own — `{{nobold|{{wp|Indo-European ablaut}}}}` renders to a phrase, and
    `{{l|en|agent|id=grammar}}` has one positional parameter after its language.
    """
    parts: list[str] = []
    current = ""
    depth = 0
    i = 0
    while i < len(inner):
        if inner.startswith("[[", i):
            depth += 1
            current += "[["
            i += 2
            continue
        if inner.startswith("]]", i) and depth:
            depth -= 1
            current += "]]"
            i += 2
            continue
        if inner[i] == "|" and depth == 0:
            parts.append(current)
            current = ""
            i += 1
            continue
        current += inner[i]
        i += 1
    parts.append(current)
    return parts[0].strip(), [p.strip() for p in parts[1:] if not NAMED.match(p.strip())]


def _display(params: list[str]) -> str:
    """What a template shows: its first parameter, unless that one is a language
    code and the next carries the word itself."""
    if len(params) > 1 and LANG_CODE.match(params[0]):
        return params[1]
    return params[0] if params else ""


def _word(params: list[str]) -> str:
    """The word a `{{m}}`/`{{m+}}`/`{{l}}`/`{{lang}}` names: the language comes
    first, so the word is the parameter after it."""
    return params[1] if len(params) > 1 else _display(params)


def _affix(params: list[str]) -> str:
    """`{{af|en|earth|-en}}` reads `earth + -en`: the parts, without the language
    and without the `<pos:…>` annotations the template carries."""
    parts = [p.split("<")[0].strip() for p in params[1:]]
    return " + ".join(p for p in parts if p)


def _gloss_of_foreign(params: list[str]) -> str:
    """`{{ja-r|葉%書|は%がき|postcard}}` reads `postcard` — the gloss, which is the
    only part of it written in English."""
    return params[2] if len(params) > 2 else ""


def _nothing(params: list[str]) -> str:
    return ""


def _comma(params: list[str]) -> str:
    return ","


TEMPLATES: dict[str, object] = {
    # names and navigation: they belong to the wiki page, not to its text
    "anchor": _nothing,
    "compact TOC": _nothing,
    "cite-book": _nothing,
    # a word in its own language
    "m": _word,
    "m+": _word,
    "l": _word,
    "lang": _word,
    # a phrase shown as it stands
    "lg": _display,
    "nobold": _display,
    "w": _display,
    "wp": _display,
    "pedia": _display,
    "temp": _display,
    "catlink": _display,
    "section link": _display,
    "slink": _display,
    "ic": _display,
    "m-g": _display,
    "g": _display,
    "IPAchar": lambda params: ", ".join(params),
    "af": _affix,
    "affix": _affix,
    "ja-r": _gloss_of_foreign,
    ",": _comma,
}


def render(wikitext: str) -> str:
    """The plain text of a piece of the appendix's wikitext."""
    text = COMMENT.sub("", wikitext)
    text = REF.sub("", text)
    text = BR.sub(" ", text)
    text = TAG.sub("", text)

    while True:
        m = TEMPLATE.search(text)
        if m is None:
            break
        name, params = _split(m.group(1))
        handler = TEMPLATES.get(name)
        if handler is None:
            raise UnknownMarkup(f"template `{{{{{name}}}}}`")
        text = text[: m.start()] + handler(params) + text[m.end() :]

    def link(m: re.Match[str]) -> str:
        target = m.group(1)
        if "|" in target:
            return target.split("|")[-1]
        return target.split("#")[-1] or target

    text = LINK.sub(link, text)
    text = EMPHASIS.sub("", text)
    for entity, plain in ENTITIES.items():
        text = text.replace(entity, plain)
    if "{{" in text or "[[" in text or "}}" in text or "]]" in text:
        raise UnknownMarkup(f"unrendered markup in {text[:80]!r}")
    return re.sub(r"\s+", " ", text).strip()


# --- the appendix ------------------------------------------------------------

ANCHOR = re.compile(r"\{\{\s*anchor\s*([^{}]*)\}\}")
# The headword line opens with hints the appendix shows before the term itself —
# a Wikipedia link, a pronunciation note, the anchor names. The term is what is
# left of the line once they are gone.
HINT = re.compile(r"\{\{\s*(?:nobold|w|wp|pedia)\s*[^{}]*\}\}")


def _names(line: str) -> list[str]:
    """Every name the term's line declares: the anchors and the term itself."""
    names: list[str] = []
    for m in ANCHOR.finditer(line):
        _, params = _split(m.group(1))
        names.extend(render(p) for p in params)
    return [n for n in names if n]


def _headword(line: str) -> str:
    """The term as the appendix displays it, without its anchors and its hints."""
    return render(ANCHOR.sub("", HINT.sub("", line))).strip()


def _inline(line: str) -> tuple[str, str]:
    """The headword line, split where the appendix wrote the definition on the same
    line: `; expletive infixation: Tmesis accompanied by …`. The colon has to be
    outside templates and links, because a headword may carry one of its own —
    `[[register#English: language register|register]]` is a headword, not a
    definition."""
    depth = 0
    i = 0
    while i < len(line):
        if line.startswith("{{", i) or line.startswith("[[", i):
            depth += 1
            i += 2
            continue
        if line.startswith("}}", i) or line.startswith("]]", i):
            depth = max(0, depth - 1)
            i += 2
            continue
        if line[i] == ":" and depth == 0:
            return line[:i], line[i + 1 :]
        i += 1
    return line, ""


def parse(path: Path) -> list[Term]:
    """Every term of the appendix, in the order the page states them."""
    terms: list[Term] = []
    head: str | None = None
    names: list[str] = []
    body: list[str] = []

    def close() -> None:
        if head is None:
            return
        terms.append(Term(head, tuple([head, *names]), " ".join(body)))

    for line in path.read_text(encoding="utf-8").split("\n"):
        line = line.rstrip()
        if line.startswith(";"):
            close()
            line = COMMENT.sub("", line)
            head_line, inline = _inline(line[1:])
            head = _headword(head_line)
            names = _names(head_line)
            body = [render(inline).strip()] if inline.strip() else []
        elif line.startswith(":") and head is not None:
            rendered = render(line[1:]).strip()
            if rendered:
                body.append(rendered)
    close()
    return terms


def fold(name: str) -> str:
    """A name reduced to what two spellings of it must share to be the same term:
    case, punctuation, and the apostrophe that separates `women's` from `womens`."""
    return re.sub(r"[^a-z0-9]+", "", name.lower().replace("’", "'"))


def index(terms: list[Term]) -> dict[str, Term]:
    """Every term under every name it declares, folded."""
    found: dict[str, Term] = {}
    for term in terms:
        for name in term.names:
            key = fold(name)
            if key and key not in found:
                found[key] = term
    return found


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__.strip().splitlines()[-1], file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    terms = parse(path)
    found = index(terms)
    print(f"{path}: {len(terms)} terms, {len(found)} names, {sum(len(t.names) for t in terms)} declared")
    empty = [t for t in terms if not t.text]
    if empty:
        print(f"terms with no definition text: {', '.join(t.term for t in empty)}")
    longest = max(terms, key=lambda t: len(t.text))
    print(f"longest: {longest.term} ({len(longest.text)} chars)")
    print("\nthe first five:")
    for term in terms[:5]:
        print(f"  {term.term!r} names={term.names}")
        print(f"    {term.text[:100]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
