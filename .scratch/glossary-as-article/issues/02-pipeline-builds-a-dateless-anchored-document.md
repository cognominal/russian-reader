# 02: The pipeline builds a document that has no date and carries anchors

**Spec:** `.scratch/glossary-as-article/spec.md` — Implementation Decisions, *The dumps and the
pipeline*.

**What to build:** the offline pipeline accepts a document that is not a kremlin.ru page. A dump whose
header declares the dateless shape is valid with no date line — the title on its first line, the body
from its second — and the article it emits carries no date. Each paragraph's anchor comes from that
paragraph's own dump line, a note line in the header reaches the document's provenance note, and a
document built this way is not merged into the catalog. A dump that declares nothing and has no date line
still fails with the message it fails with today, because inferring the shape from a missing date line
would turn a broken kremlin.ru dump into a dateless article instead of an error.

**Blocked by:** 01 — the acceptance below is the reader rendering the document this emits.

**Status:** ready-for-agent

- [ ] A dump pair whose header declares no date builds without error, and the emitted article carries no
      date field.
- [ ] A dump pair with no date line and no declaration fails with the same message it fails with today.
- [ ] Every paragraph of the emitted article carries the anchor its own dump line named.
- [ ] A note line in the dump's header reaches the emitted document's provenance note.
- [ ] Building this document leaves the catalog untouched, while building a kremlin.ru article still adds
      its entry and re-sorts the catalog.
- [ ] The emitted document renders in the reader: no date, anchors reachable by fragment, the note shown.
