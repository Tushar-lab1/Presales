def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    chunks = []
    start = 0
    text_length = len(text)
    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


def assign_page_numbers(chunks: list[str], text: str, page_map: list[tuple]) -> list[int | None]:
    """
    For each chunk, find which page it starts on by matching its character
    offset in the original text against the page_map produced by file_service.

    page_map: [(char_offset, page_number), ...]  — m    ust be sorted by offset.

    Returns a list of page numbers parallel to `chunks`.
    """
    if not page_map:
        return [None] * len(chunks)

    page_numbers = []
    offset = 0
    for chunk in chunks:
        # find the highest page whose offset <= current chunk start
        page = page_map[0][1]
        for char_offset, page_num in page_map:
            if char_offset <= offset:
                page = page_num
            else:
                break
        page_numbers.append(page)
        offset += len(chunk)  # approximate — good enough for page attribution
    return page_numbers
