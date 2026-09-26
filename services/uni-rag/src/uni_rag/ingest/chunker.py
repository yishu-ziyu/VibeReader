"""Semantic chunker: split on headers, then by size."""
from __future__ import annotations
from collections import Counter
from dataclasses import dataclass
import re
import unicodedata


@dataclass
class Chunk:
    text: str
    source_id: str
    section_title: str | None
    start_offset: int  # 相对于原始 text
    end_offset: int
    page_number: int | None = None  # PDF 页码（1-based），非 PDF 为 None


_HEADER_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


def _split_by_headers(text: str) -> list[tuple[str | None, str]]:
    """Return [(title, body), ...] 按 markdown header 切分。"""
    matches = list(_HEADER_RE.finditer(text))
    if not matches:
        return [(None, text)]
    sections = []
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        title = m.group(2).strip()
        body = text[start:end].strip()
        if body:
            sections.append((title, body))
    return sections


def _split_long_body(body: str, max_chars: int) -> list[str]:
    """长段按句子边界切分。"""
    if len(body) <= max_chars:
        return [body]
    sentences = re.split(r"(?<=[.!?。！？])\s+", body)
    chunks = []
    current = []
    cur_len = 0
    for s in sentences:
        if cur_len + len(s) > max_chars and current:
            chunks.append(" ".join(current).strip())
            current = [s]
            cur_len = len(s)
        else:
            current.append(s)
            cur_len += len(s) + 1
    if current:
        chunks.append(" ".join(current).strip())
    return chunks


_FRAGMENT = 8  # folded characters per fingerprint
_MIN_START_HITS = 3  # fingerprints needed before a chunk counts as starting on the previous page
_FOLD_DROP_RE = re.compile(r"[\s_*#>`\-]+")


def _fold(text: str) -> str:
    """Comparable form across parsers: NFKC, lowercase, no whitespace, markdown
    marks or hyphens (so PDF line breaks and end-of-line hyphenation vanish)."""
    return _FOLD_DROP_RE.sub("", unicodedata.normalize("NFKC", text).lower())


def _page_locator(pages: list[tuple[int, str]]):
    """Return a function mapping chunk text to the PDF page it starts on.

    Pages are matched by content, not by character offsets: offsets drift as
    soon as the chunk text comes from a different parser (MinerU Markdown) or
    was re-joined during splitting. Only fingerprints found on exactly one page
    count, so running headers and footers never decide the page.
    """
    owner: dict[str, int] = {}
    shared: set[str] = set()
    for page_no, page_text in pages:
        folded = _fold(page_text)
        for i in range(len(folded) - _FRAGMENT + 1):
            fragment = folded[i:i + _FRAGMENT]
            if owner.setdefault(fragment, page_no) != page_no:
                shared.add(fragment)
    for fragment in shared:
        del owner[fragment]

    def locate(chunk_text: str) -> int | None:
        folded = _fold(chunk_text)
        hits = [
            owner[folded[i:i + _FRAGMENT]]
            for i in range(len(folded) - _FRAGMENT + 1)
            if folded[i:i + _FRAGMENT] in owner
        ]
        if not hits:
            return None
        votes = Counter(hits)
        main = votes.most_common(1)[0][0]
        # The chunk's page is where its text starts: when it begins with the tail
        # of the previous page, that page wins. Only the adjacent page may, so a
        # phrase that happens to be unique to some distant page can't.
        previous = main - 1
        if votes.get(previous, 0) >= _MIN_START_HITS and hits.index(previous) < hits.index(main):
            return previous
        return main

    return locate


def chunk_document(
    text: str,
    source_id: str,
    max_chars: int = 1000,
    pages: list[tuple[int, str]] | None = None,
) -> list[Chunk]:
    """按 header 切，再按 max_chars 切长段。

    Args:
        text: 完整文本
        source_id: 文档标识
        max_chars: 每块最大字符数
        pages: [(page_no, text), ...] 可选，用于给 PDF chunk 标页码
    """
    sections = _split_by_headers(text)
    chunks = []
    cursor = 0

    locate_page = _page_locator(pages) if pages else None

    for title, body in sections:
        idx = text.find(body, cursor)
        if idx < 0:
            idx = cursor
        cursor = idx + len(body)
        for piece in _split_long_body(body, max_chars):
            piece_start = text.find(piece, idx)
            if piece_start < 0:
                piece_start = idx
            piece_end = piece_start + len(piece)

            chunks.append(Chunk(
                text=piece,
                source_id=source_id,
                section_title=title,
                start_offset=piece_start,
                end_offset=piece_end,
                page_number=locate_page(piece) if locate_page else None,
            ))
    return chunks
