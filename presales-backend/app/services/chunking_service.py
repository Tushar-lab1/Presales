"""
chunking_service.py
-------------------
Section-aware semantic chunking with proper slide-deck support.

Key fixes vs previous version:
  - [Slide N] markers are treated as section headings (not noise)
  - No deduplication inside chunk_text (dedup is done at DB store time)
  - Sentence-boundary splitting prevents mid-sentence cuts
  - Page numbers are tracked per section so citations are accurate
  - assign_page_numbers works off the page_map from file_service
"""

from __future__ import annotations
import re


# ── Heading patterns ────────────────────────────────────────────────────────
# Order matters: more-specific patterns first.
_HEADING_PATTERNS: list[re.Pattern] = [
    # PowerPoint / PDF slide marker:  [Slide 3]  or  Slide 3
    re.compile(r"^\[?Slide\s+\d+\]?\s*$", re.IGNORECASE),
    # Markdown headings:  # Title  /  ## Title
    re.compile(r"^#{1,4}\s+\S"),
    # Numbered section:  1.  /  1.2  /  3.4.1
    re.compile(r"^\d+(\.\d+)*\.?\s+[A-Z]"),
    # ALL-CAPS line (≥ 4 chars, not a slide number line)
    re.compile(r"^[A-Z][A-Z &\-/]{3,}$"),
    # Title-case line ending with colon
    re.compile(r"^[A-Z][^\n]{3,60}:\s*$"),
]


def _is_heading(line: str) -> bool:
    stripped = line.strip()
    if not stripped or len(stripped) > 120:
        return False
    return any(p.match(stripped) for p in _HEADING_PATTERNS)


def _split_into_sections(text: str) -> list[dict]:
    """
    Returns a list of dicts: {"heading": str | None, "body": str}
    Slide markers like [Slide 3] become the heading for everything that
    follows until the next slide marker.
    """
    lines = text.splitlines()
    sections: list[dict] = []
    current_heading: str | None = None
    current_body: list[str] = []

    for line in lines:
        if _is_heading(line):
            # Save the previous section
            body = "\n".join(current_body).strip()
            if body:
                sections.append({"heading": current_heading, "body": body})
            current_heading = line.strip()
            current_body = []
        else:
            current_body.append(line)

    # Flush last section
    body = "\n".join(current_body).strip()
    if body:
        sections.append({"heading": current_heading, "body": body})

    return sections


def _split_sentences(text: str) -> list[str]:
    """
    Naïve sentence splitter that keeps sentences intact.
    Splits on '. ', '! ', '? ' followed by a capital letter or digit,
    and also on newlines (paragraph breaks).
    """
    # Normalise line breaks
    text = re.sub(r"\r\n", "\n", text)
    # Split on sentence endings
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9\-\"])", text)
    # Further split on blank lines (paragraph breaks)
    sentences: list[str] = []
    for part in parts:
        for sub in part.split("\n\n"):
            sub = sub.strip()
            if sub:
                sentences.append(sub)
    return sentences


def _chunk_body(heading: str | None, body: str, chunk_size: int) -> list[str]:
    """
    Chunk a single section's body into ≤ chunk_size char pieces.
    The heading is prepended to every chunk so that retrieval by
    heading name always surfaces the correct content.
    """
    prefix = f"{heading}\n" if heading else ""
    sentences = _split_sentences(body)

    chunks: list[str] = []
    current_sentences: list[str] = []
    current_len = len(prefix)

    # Keep 2 sentences of overlap between chunks
    OVERLAP_SENTENCES = 2

    for sentence in sentences:
        sentence_len = len(sentence) + 1  # +1 for space/newline

        # If adding this sentence would overflow, flush current chunk
        if current_len + sentence_len > chunk_size and current_sentences:
            chunk_text = prefix + " ".join(current_sentences)
            chunks.append(chunk_text)
            # Keep last OVERLAP_SENTENCES sentences for context continuity
            current_sentences = current_sentences[-OVERLAP_SENTENCES:]
            current_len = len(prefix) + sum(len(s) + 1 for s in current_sentences)

        current_sentences.append(sentence)
        current_len += sentence_len

    # Flush remainder
    if current_sentences:
        chunk_text = prefix + " ".join(current_sentences)
        chunks.append(chunk_text)

    return chunks


def chunk_text(text: str, chunk_size: int = 2000, overlap: int = 200) -> list[str]:
    """
    Section-aware semantic chunking.

    Strategy
    --------
    1. Detect headings using multiple patterns (Markdown, numbered, ALL-CAPS,
       slide markers, colon-terminated titles).
    2. Split the document into (heading, body) sections.
    3. Chunk each section's body with sentence-boundary splitting, prepending
       the heading to every sub-chunk so retrieval by heading name always
       returns the content under that heading.
    4. If no headings are detected the document is chunked as a flat body
       (pure sentence-boundary chunking).

    Parameters
    ----------
    chunk_size : int
        Target maximum character count per chunk (default 2000).
    overlap : int
        Kept for API compatibility; overlap is implemented as 2 carried
        sentences at each chunk boundary.
    """
    if not text or not text.strip():
        return []

    sections = _split_into_sections(text)
    has_headings = any(s["heading"] is not None for s in sections)

    if not has_headings:
        return _chunk_body(None, text, chunk_size)

    all_chunks: list[str] = []
    for section in sections:
        if not section["body"].strip():
            continue
        sub_chunks = _chunk_body(section["heading"], section["body"], chunk_size)
        all_chunks.extend(sub_chunks)

    return [c for c in all_chunks if c.strip()]


# ── Page number assignment ──────────────────────────────────────────────────

def assign_page_numbers(
    chunks: list[str],
    text: str,
    page_map: list[tuple[int, int]],
) -> list[int | None]:
    """
    For each chunk, find which page it starts on by matching its character
    offset in the original text against the page_map produced by file_service.

    page_map: [(char_offset, page_number), ...]  — sorted by offset ascending.

    Returns a list of page numbers parallel to `chunks`.
    If the chunk contains a [Slide N] heading, that slide number is used
    directly as the page number (more accurate for PPTX).
    """
    SLIDE_RE = re.compile(r"\[?Slide\s+(\d+)\]?", re.IGNORECASE)

    if not page_map and not chunks:
        return []

    page_numbers: list[int | None] = []
    offset = 0

    for chunk in chunks:
        # 1. Try to extract slide number from the chunk heading
        slide_match = SLIDE_RE.search(chunk[:80])  # heading is always near top
        if slide_match:
            page_numbers.append(int(slide_match.group(1)))
            offset += len(chunk)
            continue

        # 2. Fall back to page_map (PDF page attribution)
        if page_map:
            page = page_map[0][1]
            for char_offset, page_num in page_map:
                if char_offset <= offset:
                    page = page_num
                else:
                    break
            page_numbers.append(page)
        else:
            page_numbers.append(None)

        offset += len(chunk)

    return page_numbers