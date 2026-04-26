from fastapi import UploadFile
import pdfplumber
import docx
import pandas as pd
from pptx import Presentation
import io


def extract_text_from_file(file: UploadFile) -> dict:
    """
    Returns:
        {
            "text": str,               # full extracted text
            "page_count": int | None,  # pages for PDF/PPTX, None otherwise
            "page_map": list[tuple]    # [(chunk_start_char, page_number), ...]
                                       # only populated for PDF
        }
    """
    filename = file.filename.lower()
    raw = file.file.read()

    # ── PDF ──────────────────────────────────────────────────────────────────
    if filename.endswith(".pdf"):
        text_parts = []
        page_map = []   # (cumulative_char_offset, page_number)
        offset = 0
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            page_count = len(pdf.pages)
            for page_num, page in enumerate(pdf.pages, start=1):
                page_text = page.extract_text() or ""
                page_map.append((offset, page_num))
                text_parts.append(page_text)
                offset += len(page_text)
        return {
            "text": "\n".join(text_parts),
            "page_count": page_count,
            "page_map": page_map,
        }

    # ── DOCX ─────────────────────────────────────────────────────────────────
    elif filename.endswith(".docx"):
        doc = docx.Document(io.BytesIO(raw))
        text = "\n".join([p.text for p in doc.paragraphs])
        return {"text": text, "page_count": None, "page_map": []}

    # ── TXT ──────────────────────────────────────────────────────────────────
    elif filename.endswith(".txt"):
        text = raw.decode("utf-8", errors="replace")
        return {"text": text, "page_count": None, "page_map": []}

    # ── CSV ──────────────────────────────────────────────────────────────────
    elif filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(raw))
        return {"text": df.to_string(), "page_count": None, "page_map": []}

    # ── Excel ─────────────────────────────────────────────────────────────────
    elif filename.endswith(".xlsx") or filename.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(raw))
        return {"text": df.to_string(), "page_count": None, "page_map": []}

    # ── PowerPoint ────────────────────────────────────────────────────────────
    elif filename.endswith(".pptx"):
        prs = Presentation(io.BytesIO(raw))
        parts = []
        for slide_num, slide in enumerate(prs.slides, start=1):
            slide_text = f"[Slide {slide_num}]\n"
            for shape in slide.shapes:
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        slide_text += para.text + "\n"
                if shape.has_table:
                    for row in shape.table.rows:
                        slide_text += " | ".join(cell.text for cell in row.cells) + "\n"
            parts.append(slide_text)
        return {
            "text": "\n".join(parts),
            "page_count": len(prs.slides),
            "page_map": [],
        }

    return {"text": "Unsupported file format", "page_count": None, "page_map": []}


def get_file_type(filename: str) -> str:
    filename = filename.lower()
    for ext in ["pdf", "docx", "txt", "csv", "xlsx", "xls", "pptx"]:
        if filename.endswith(f".{ext}"):
            return ext
    return "unknown"
