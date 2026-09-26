from uni_rag.ingest.chunker import chunk_document, Chunk


SAMPLE = """# Chapter 1: Intro

First paragraph of intro.

## Section 1.1

Content of section 1.1. It has multiple sentences. They all belong here.

## Section 1.2

Content of section 1.2. More content follows.

# Chapter 2: Methods

Methods chapter content here.
"""


def test_chunk_splits_on_headers():
    chunks = chunk_document(SAMPLE, source_id="x")
    assert len(chunks) >= 3
    titles = [c.section_title for c in chunks if c.section_title]
    assert any("Chapter 1" in t for t in titles)
    assert any("Chapter 2" in t for t in titles)


def test_chunks_have_offsets():
    chunks = chunk_document(SAMPLE, source_id="x")
    for c in chunks:
        assert c.text.strip()
        assert c.start_offset >= 0
        assert c.end_offset > c.start_offset
        assert c.source_id == "x"


def test_long_section_splits_by_size():
    long_text = "Sentence. " * 500  # 5000 chars
    chunks = chunk_document(long_text, source_id="y", max_chars=1000)
    assert all(len(c.text) <= 1200 for c in chunks)  # 允许一点溢出
    assert len(chunks) >= 5


# ── Page numbers: every PDF chunk is labelled with the page its text is on ──

def _book(pages_sentences, header=""):
    """PyMuPDF-shaped pages: one sentence per line, optional running header."""
    return [(i + 1, header + "\n".join(sentences) + "\n") for i, sentences in enumerate(pages_sentences)]


def _page_of(sentence, pages):
    return next(no for no, text in pages if sentence in text)


def _first_sentence(chunk_text, all_sentences):
    return min((s for s in all_sentences if s in chunk_text), key=chunk_text.index)


BOOK = [
    [f"Page {p} tells story number {p * 100 + i} about the rabbit." for i in range(12)]
    for p in range(1, 5)
]
ALL_SENTENCES = [s for page in BOOK for s in page]


def test_pdf_chunks_are_labelled_with_the_page_their_text_is_on():
    pages = _book(BOOK)
    text = "\n\n".join(t for _, t in pages)  # exactly how the PyMuPDF parser joins pages

    chunks = chunk_document(text, source_id="book", max_chars=300, pages=pages)

    assert len(chunks) > 4
    for c in chunks:
        assert c.page_number == _page_of(_first_sentence(c.text, ALL_SENTENCES), pages), c.text[:60]


def test_markdown_from_another_parser_still_gets_pdf_page_numbers():
    pages = _book(BOOK)
    # MinerU-style output: a heading, an OCR'd figure caption the PDF text layer
    # doesn't have (so character offsets drift), sentences re-flowed onto one line.
    caption = "Figure 1: " + "an engraving of a rabbit with a pocket watch, " * 12
    text = (
        "# The Rabbit Book\n\n" + caption + "\n\n"
        + "\n\n".join(" ".join(sentences) for sentences in BOOK)
    )

    chunks = chunk_document(text, source_id="book", max_chars=300, pages=pages)

    story_chunks = [c for c in chunks if any(s in c.text for s in ALL_SENTENCES)]
    assert len(story_chunks) > 4
    for c in story_chunks:
        assert c.page_number == _page_of(_first_sentence(c.text, ALL_SENTENCES), pages), c.text[:60]


def test_a_running_header_on_every_page_does_not_decide_the_page():
    pages = _book(BOOK, header="THE RABBIT BOOK · A COLLECTION OF STORIES\n")
    text = "\n\n".join(t for _, t in pages)

    chunks = chunk_document(text, source_id="book", max_chars=300, pages=pages)

    for c in chunks:
        assert c.page_number == _page_of(_first_sentence(c.text, ALL_SENTENCES), pages), c.text[:60]


def test_text_that_is_on_no_page_gets_no_page_number():
    pages = _book(BOOK)
    text = "Completely different words that the PDF never printed anywhere at all."

    chunks = chunk_document(text, source_id="book", pages=pages)

    assert [c.page_number for c in chunks] == [None]


def test_a_phrase_unique_to_a_distant_page_does_not_pull_the_chunk_there():
    pages = [
        (1, "Alice fell down the rabbit-hole into a strange hall.\n"),
        (2, "Nothing here but a long corridor of locked doors.\n"),
        (3, "\n".join(f"The trial went on with witness number {n} speaking." for n in range(10)) + "\n"),
    ]
    # Starts by quoting page 1's phrase, but the chunk itself is page 3's text.
    text = "Rabbit-hole. " + " ".join(f"The trial went on with witness number {n} speaking." for n in range(10))

    chunks = chunk_document(text, source_id="book", pages=pages)

    assert [c.page_number for c in chunks] == [3]
