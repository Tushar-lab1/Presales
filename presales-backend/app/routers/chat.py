from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from typing import List, Optional

from app.services.file_service import extract_text_from_file, get_file_type
from app.services.embedding_service import get_embeddings, model
from app.services.chunking_service import chunk_text, assign_page_numbers
from app.services.db_service import (
    get_or_create_user,
    workspace_belongs_to_user,
    create_document,
    store_chunks,
    search_similar,
    save_chat,
    get_chat_history,
    search_chats,
)

router = APIRouter(tags=["chat"])


@router.post("/upload")
async def upload_documents(
    workspace_id: int = Form(...),
    email: str = Form(...),
    files: List[UploadFile] = File(...),
):
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    ingested = []
    for file in files:
        if not file or not file.filename:
            continue

        raw_size = file.file.seek(0, 2)
        file.file.seek(0)

        extracted  = extract_text_from_file(file)
        text       = extracted["text"]
        page_count = extracted["page_count"]
        page_map   = extracted["page_map"]
        file_type  = get_file_type(file.filename)

        doc_id = create_document(
            workspace_id=workspace_id,
            filename=file.filename,
            file_type=file_type,
            file_size=raw_size if raw_size > 0 else len(text.encode()),
            page_count=page_count,
        )

        chunks       = chunk_text(text)
        page_numbers = assign_page_numbers(chunks, text, page_map)
        embeddings   = get_embeddings(chunks)
        store_chunks(doc_id, workspace_id, chunks, embeddings, page_numbers)

        ingested.append({
            "document_id": doc_id,
            "filename":    file.filename,
            "file_type":   file_type,
            "file_size":   raw_size if raw_size > 0 else len(text.encode()),
            "page_count":  page_count,
            "chunk_count": len(chunks),
        })
        print(f"[upload] {file.filename} → {len(chunks)} chunks, doc_id={doc_id}")

    return {"workspace_id": workspace_id, "ingested": ingested}


@router.post("/chat")
async def chat(
    message: str = Form(...),
    workspace_id: int = Form(...),
    email: str = Form(...),
):
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    query_embedding = model.encode([message])[0]
    relevant_chunks = search_similar(query_embedding, workspace_id, top_k=5)

    if not relevant_chunks:
        response_text = "No relevant content found in this workspace. Please upload documents first."
        citations     = []
    else:
        response_parts = []
        for i, chunk in enumerate(relevant_chunks, start=1):
            response_parts.append(f"[{i}] {chunk['content']}")
        response_text = "\n\n".join(response_parts)

        citations = [
            {
                "rank":        i,
                "chunk_id":    chunk["chunk_id"],
                "content":     chunk["content"],
                "document_id": chunk["document_id"],
                "filename":    chunk["filename"],
                "file_type":   chunk["file_type"],
                "page_number": chunk["page_number"],
                "uploaded_at": chunk["uploaded_at"],
                "score":       round(chunk["score"], 4),
            }
            for i, chunk in enumerate(relevant_chunks, start=1)
        ]

    chunk_ids = [c["chunk_id"] for c in citations]
    save_chat(workspace_id, message, response_text, chunk_ids)

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
    q: str     = Query(..., min_length=1),
):
    """
    Search all chat turns for this user across all workspaces.
    Returns matching turns with workspace info and a snippet.
    """
    if not q.strip():
        raise HTTPException(status_code=400, detail="q must not be empty")
    user    = get_or_create_user(email)
    results = search_chats(user["id"], q.strip())
    return {"query": q, "results": results}