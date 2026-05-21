from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import List

from app.services.file_service import extract_text_from_file, get_file_type
from app.services.embedding_service import get_embeddings, get_query_embedding
from app.services.chunking_service import chunk_text, assign_page_numbers
from app.services.db_service import (
    get_or_create_user,
    workspace_belongs_to_user,
    document_already_ingested,
    create_document,
    store_chunks,
    search_similar,
    save_chat,
    get_chat_history,
    search_chats,
)

router = APIRouter(tags=["chat"])

# ── Broad-query detection ─────────────────────────────────────────────────────
# Queries asking for a comprehensive list need more ANN hits to avoid gaps.
_LIST_KEYWORDS = {
    "all", "list", "types", "categories", "what are", "enumerate",
    "explain all", "describe all", "give all", "name all",
}

def _is_broad_query(q: str) -> bool:
    q_lower = q.lower()
    return any(kw in q_lower for kw in _LIST_KEYWORDS)


@router.post("/upload")
async def upload_documents(
    workspace_id: int = Form(...),
    email: str = Form(...),
    files: List[UploadFile] = File(...),
):
    """
    Upload one or more documents into a workspace.
    - Deduplicates at file level (SHA-256) — skips re-embedding identical files.
    - Deduplicates at chunk level inside store_chunks — skips identical chunks
      (prevents duplicates when PPTX and its PDF export are both uploaded).
    """
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    ingested  = []
    skipped   = []

    for file in files:
        if not file or not file.filename:
            continue

        extracted  = extract_text_from_file(file)
        sha256     = extracted["sha256"]
        text       = extracted["text"]
        page_count = extracted["page_count"]
        page_map   = extracted["page_map"]
        file_type  = get_file_type(file.filename)

        # ── File-level dedup ─────────────────────────────────────────────────
        if document_already_ingested(workspace_id, sha256):
            skipped.append({"filename": file.filename, "reason": "already ingested"})
            print(f"[upload] SKIP {file.filename} — SHA-256 already in workspace")
            continue

        file_size = len(text.encode())

        doc_id = create_document(
            workspace_id=workspace_id,
            filename=file.filename,
            file_type=file_type,
            file_size=file_size,
            page_count=page_count,
            sha256=sha256,
        )

        chunks       = chunk_text(text)
        page_numbers = assign_page_numbers(chunks, text, page_map)
        embeddings   = get_embeddings(chunks)
        inserted     = store_chunks(doc_id, workspace_id, chunks, embeddings, page_numbers)

        ingested.append({
            "document_id":    doc_id,
            "filename":       file.filename,
            "file_type":      file_type,
            "file_size":      file_size,
            "page_count":     page_count,
            "chunk_count":    len(chunks),
            "chunks_inserted": inserted,   # may be < chunk_count if near-dupes skipped
        })
        print(f"[upload] {file.filename} → {len(chunks)} chunks "
              f"({inserted} new), doc_id={doc_id}")

    return {
        "workspace_id": workspace_id,
        "ingested":     ingested,
        "skipped":      skipped,
    }


@router.post("/chat")
async def chat(
    message:      str = Form(...),
    workspace_id: int = Form(...),
    email:        str = Form(...),
):
    """
    Query a workspace.
    - Uses get_query_embedding (applies 'query:' prefix for asymmetric retrieval).
    - Dynamically increases top_k for broad list-type queries to avoid gaps.
    - Citation numbers are sequential with no gaps regardless of which chunks
      are primary vs context neighbours.
    - Response text marks primary chunks as [1], [2], … ; context neighbours
      are included as flowing prose with no marker.
    """
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # Dynamic top_k: list/enumerate queries need more hits
    top_k = 15 if _is_broad_query(message) else 5

    query_embedding = get_query_embedding(message)
    all_chunks      = search_similar(
        query_embedding, workspace_id, top_k=top_k, context_window=1
    )

    if not all_chunks:
        response_text = (
            "No relevant content found in this workspace. "
            "Please upload documents first."
        )
        citations = []
    else:
        # ── Separate primary hits from context neighbours ─────────────────
        primary_chunks = [c for c in all_chunks if c.get("is_primary", True)]

        # ── Build sequential citation map (no gaps) ───────────────────────
        citation_counter = 1
        citation_number: dict[int, int] = {}
        for chunk in all_chunks:
            if chunk.get("is_primary"):
                citation_number[chunk["chunk_id"]] = citation_counter
                citation_counter += 1

        # ── Build response text in natural reading order ──────────────────
        # Primary chunks get [N] prefix; context neighbours flow as plain text.
        response_parts: list[str] = []
        for chunk in all_chunks:
            cid = chunk["chunk_id"]
            if cid in citation_number:
                response_parts.append(f"[{citation_number[cid]}] {chunk['content']}")
            else:
                response_parts.append(chunk["content"])
        response_text = "\n\n".join(response_parts)

        # ── Build citation list (primary chunks only) ─────────────────────
        citations = [
            {
                "rank":        citation_number[chunk["chunk_id"]],
                "chunk_id":    chunk["chunk_id"],
                "content":     chunk["content"],
                "document_id": chunk["document_id"],
                "filename":    chunk["filename"],
                "file_type":   chunk["file_type"],
                "page_number": chunk["page_number"],
                "uploaded_at": chunk["uploaded_at"],
                "score":       round(chunk["score"], 4),
            }
            for chunk in primary_chunks
        ]

    primary_chunk_ids = [c["chunk_id"] for c in citations]
    save_chat(workspace_id, message, response_text, primary_chunk_ids)

    return {
        "workspace_id": workspace_id,
        "message":      message,
        "response":     response_text,
        "citations":    citations,
    }


@router.get("/chat/history")
def chat_history(workspace_id: int, email: str):
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    return {"workspace_id": workspace_id, "history": get_chat_history(workspace_id)}


@router.get("/chat/search")
def chat_search(
    email: str = Query(...),
    q:     str = Query(..., min_length=1),
):
    """Search all chat turns for this user across all workspaces."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="q must not be empty")
    user    = get_or_create_user(email)
    results = search_chats(user["id"], q.strip())
    return {"query": q, "results": results}