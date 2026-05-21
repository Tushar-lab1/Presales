from __future__ import annotations
from sqlalchemy import create_engine, text
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Tushar131005%40@localhost:5432/rag_db")
engine = create_engine(DATABASE_URL)


# ─────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────

def get_or_create_user(email: str, name: str = None) -> dict:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id, email, name FROM users WHERE email = :email"),
            {"email": email}
        ).fetchone()
        if row:
            return {"id": row[0], "email": row[1], "name": row[2]}
        result = conn.execute(
            text("INSERT INTO users (email, name) VALUES (:email, :name) RETURNING id, email, name"),
            {"email": email, "name": name}
        )
        conn.commit()
        row = result.fetchone()
        return {"id": row[0], "email": row[1], "name": row[2]}


# ─────────────────────────────────────────────
# Workspaces
# ─────────────────────────────────────────────

def create_workspace(user_id: int, client_id: str, name: str) -> dict:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                INSERT INTO workspaces (user_id, client_id, name)
                VALUES (:user_id, :client_id, :name)
                RETURNING id, client_id, name, created_at
            """),
            {"user_id": user_id, "client_id": client_id, "name": name}
        )
        conn.commit()
        row = result.fetchone()
        return {"id": row[0], "client_id": row[1], "name": row[2], "created_at": str(row[3])}


def get_workspaces(user_id: int) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT w.id, w.client_id, w.name, w.created_at,
                       COUNT(DISTINCT d.id) AS doc_count
                FROM workspaces w
                LEFT JOIN documents d ON d.workspace_id = w.id
                WHERE w.user_id = :user_id
                GROUP BY w.id
                ORDER BY w.created_at DESC
            """),
            {"user_id": user_id}
        ).fetchall()
        return [
            {"id": r[0], "client_id": r[1], "name": r[2],
             "created_at": str(r[3]), "doc_count": r[4]}
            for r in rows
        ]


def workspace_belongs_to_user(workspace_id: int, user_id: int) -> bool:
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT 1 FROM workspaces WHERE id = :wid AND user_id = :uid"),
            {"wid": workspace_id, "uid": user_id}
        ).fetchone()
        return row is not None


# ─────────────────────────────────────────────
# Documents
# ─────────────────────────────────────────────

def document_already_ingested(workspace_id: int, sha256: str) -> bool:
    """
    Return True if a document with this SHA-256 fingerprint already exists
    in this workspace.  Prevents re-embedding when the same file is
    uploaded twice (e.g. the PPTX and its PDF export).
    """
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT 1 FROM documents
                WHERE workspace_id = :workspace_id AND sha256 = :sha256
            """),
            {"workspace_id": workspace_id, "sha256": sha256}
        ).fetchone()
        return row is not None


def create_document(workspace_id: int, filename: str, file_type: str,
                    file_size: int, page_count: int = None,
                    sha256: str = None) -> int:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                INSERT INTO documents
                    (workspace_id, filename, file_type, file_size, page_count, sha256)
                VALUES
                    (:workspace_id, :filename, :file_type, :file_size, :page_count, :sha256)
                RETURNING id
            """),
            {
                "workspace_id": workspace_id,
                "filename":     filename,
                "file_type":    file_type,
                "file_size":    file_size,
                "page_count":   page_count,
                "sha256":       sha256,
            }
        )
        conn.commit()
        return result.fetchone()[0]


def get_documents(workspace_id: int) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT d.id, d.filename, d.file_type, d.file_size,
                       d.page_count, d.uploaded_at,
                       COUNT(c.id) AS chunk_count
                FROM documents d
                LEFT JOIN chunks c ON c.document_id = d.id
                WHERE d.workspace_id = :workspace_id
                GROUP BY d.id
                ORDER BY d.uploaded_at DESC
            """),
            {"workspace_id": workspace_id}
        ).fetchall()
        return [
            {
                "id": r[0], "filename": r[1], "file_type": r[2],
                "file_size": r[3], "page_count": r[4],
                "uploaded_at": str(r[5]), "chunk_count": r[6]
            }
            for r in rows
        ]


def delete_document(document_id: int, workspace_id: int) -> bool:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                DELETE FROM documents
                WHERE id = :doc_id AND workspace_id = :workspace_id
                RETURNING id
            """),
            {"doc_id": document_id, "workspace_id": workspace_id}
        )
        conn.commit()
        return result.fetchone() is not None


# ─────────────────────────────────────────────
# Chunks / Embeddings
# ─────────────────────────────────────────────

def store_chunks(
    document_id:  int,
    workspace_id: int,
    chunks:       list[str],
    embeddings:   list[list[float]],
    page_numbers: list[int] = None,
):
    """
    Bulk-insert chunks.

    Near-duplicate filtering: before inserting, we compare the incoming
    chunk text against a set of already-stored chunk texts in this workspace.
    Chunks whose content already exists (exact match) are skipped.
    This prevents duplicate embeddings when a PPTX and its PDF export
    are both uploaded.
    """
    def to_pgvector(vec: list[float]) -> str:
        return "[" + ",".join(map(str, vec)) + "]"

    # Fetch existing chunk contents for this workspace (for dedup)
    with engine.connect() as conn:
        existing = set(
            row[0] for row in conn.execute(
                text("SELECT content FROM chunks WHERE workspace_id = :wid"),
                {"wid": workspace_id}
            ).fetchall()
        )

    with engine.connect() as conn:
        inserted = 0
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            # Skip exact duplicates
            if chunk.strip() in existing:
                continue
            existing.add(chunk.strip())

            page = page_numbers[i] if page_numbers and i < len(page_numbers) else None
            conn.execute(
                text("""
                    INSERT INTO chunks
                        (document_id, workspace_id, chunk_index,
                         content, page_number, embedding)
                    VALUES
                        (:document_id, :workspace_id, :chunk_index,
                         :content, :page_number, CAST(:embedding AS vector))
                """),
                {
                    "document_id":  document_id,
                    "workspace_id": workspace_id,
                    "chunk_index":  i,
                    "content":      chunk,
                    "page_number":  page,
                    "embedding":    to_pgvector(embedding),
                }
            )
            inserted += 1
        conn.commit()
    return inserted


def search_similar(
    query_embedding: list[float],
    workspace_id:    int,
    top_k:           int = 5,
    context_window:  int = 1,
) -> list[dict]:
    """
    Two-stage retrieval with context expansion.

    Stage 1: ANN top-k via pgvector cosine distance.
    Stage 2: Fetch ±context_window neighbouring chunks per document
             to avoid answers being cut at chunk boundaries.

    Returns list of chunk dicts ordered by (primary_doc_first,
    document_id, chunk_index) so consecutive chunks read as prose.
    """
    def to_pgvector(vec: list[float]) -> str:
        return "[" + ",".join(map(str, vec)) + "]"

    pg_embedding = to_pgvector(query_embedding)

    with engine.connect() as conn:

        # Stage 1: ANN retrieval
        primary_rows = conn.execute(
            text("""
                SELECT
                    c.id            AS chunk_id,
                    c.content,
                    c.chunk_index,
                    c.page_number,
                    d.id            AS document_id,
                    d.filename,
                    d.file_type,
                    d.uploaded_at,
                    1 - (c.embedding <=> CAST(:qe AS vector)) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.workspace_id = :workspace_id
                ORDER BY c.embedding <=> CAST(:qe AS vector) ASC
                LIMIT :top_k
            """),
            {"qe": pg_embedding, "workspace_id": workspace_id, "top_k": top_k},
        ).fetchall()

        if not primary_rows:
            return []

        primary_chunk_ids: set[int]         = {r[0] for r in primary_rows}
        primary_scores:    dict[int, float] = {r[0]: float(r[8]) for r in primary_rows}

        # Stage 2: expand by ±context_window
        doc_to_indices: dict[int, set[int]] = {}
        for r in primary_rows:
            doc_id    = r[4]
            chunk_idx = r[2]
            wanted    = set(range(chunk_idx - context_window,
                                  chunk_idx + context_window + 1))
            doc_to_indices.setdefault(doc_id, set()).update(wanted)

        all_rows = []
        for doc_id, indices in doc_to_indices.items():
            rows = conn.execute(
                text("""
                    SELECT
                        c.id, c.content, c.chunk_index, c.page_number,
                        d.id, d.filename, d.file_type, d.uploaded_at
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE c.document_id  = :doc_id
                      AND c.chunk_index  = ANY(:indices)
                      AND c.workspace_id = :workspace_id
                    ORDER BY c.chunk_index ASC
                """),
                {"doc_id": doc_id, "indices": list(indices),
                 "workspace_id": workspace_id},
            ).fetchall()
            all_rows.extend(rows)

        # Deduplicate and annotate
        seen:    set[int]   = set()
        results: list[dict] = []
        for r in all_rows:
            if r[0] in seen:
                continue
            seen.add(r[0])
            results.append({
                "chunk_id":    r[0],
                "content":     r[1],
                "chunk_index": r[2],
                "page_number": r[3],
                "document_id": r[4],
                "filename":    r[5],
                "file_type":   r[6],
                "uploaded_at": str(r[7]),
                "score":       primary_scores.get(r[0], 1.0),
                "is_primary":  r[0] in primary_chunk_ids,
            })

        # Primary documents first, then natural reading order
        primary_doc_ids = {r[4] for r in primary_rows}
        results.sort(key=lambda x: (
            0 if x["document_id"] in primary_doc_ids else 1,
            x["document_id"],
            x["chunk_index"],
        ))
        return results


# ─────────────────────────────────────────────
# Chats & Citations
# ─────────────────────────────────────────────

def save_chat(workspace_id: int, user_query: str,
              model_response: str, chunk_ids: list[int]) -> int:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                INSERT INTO chats (workspace_id, user_query, model_response)
                VALUES (:workspace_id, :user_query, :model_response)
                RETURNING id
            """),
            {"workspace_id": workspace_id,
             "user_query": user_query,
             "model_response": model_response}
        )
        chat_id = result.fetchone()[0]
        for rank, chunk_id in enumerate(chunk_ids, start=1):
            conn.execute(
                text("""
                    INSERT INTO chat_citations (chat_id, chunk_id, rank)
                    VALUES (:chat_id, :chunk_id, :rank)
                """),
                {"chat_id": chat_id, "chunk_id": chunk_id, "rank": rank}
            )
        conn.commit()
        return chat_id


def get_chat_history(workspace_id: int, limit: int = 30) -> list[dict]:
    with engine.connect() as conn:
        chats = conn.execute(
            text("""
                SELECT id, user_query, model_response, created_at
                FROM chats
                WHERE workspace_id = :workspace_id
                ORDER BY created_at ASC
                LIMIT :limit
            """),
            {"workspace_id": workspace_id, "limit": limit}
        ).fetchall()

        history = []
        for chat in chats:
            chat_id, user_query, model_response, created_at = chat
            citations = conn.execute(
                text("""
                    SELECT cc.rank, c.id, c.content, c.page_number,
                           d.filename, d.file_type
                    FROM chat_citations cc
                    JOIN chunks c  ON c.id  = cc.chunk_id
                    JOIN documents d ON d.id = c.document_id
                    WHERE cc.chat_id = :chat_id
                    ORDER BY cc.rank
                """),
                {"chat_id": chat_id}
            ).fetchall()
            history.append({
                "id":             chat_id,
                "user_query":     user_query,
                "model_response": model_response,
                "created_at":     str(created_at),
                "citations": [
                    {
                        "rank":        cit[0], "chunk_id":    cit[1],
                        "content":     cit[2], "page_number": cit[3],
                        "filename":    cit[4], "file_type":   cit[5],
                    }
                    for cit in citations
                ],
            })
        return history


def search_chats(user_id: int, query: str) -> list[dict]:
    pattern = f"%{query}%"
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT ch.id, ch.user_query, ch.model_response, ch.created_at,
                       w.id, w.name, w.client_id
                FROM chats ch
                JOIN workspaces w ON w.id = ch.workspace_id
                WHERE w.user_id = :user_id
                  AND (ch.user_query ILIKE :pattern OR ch.model_response ILIKE :pattern)
                ORDER BY ch.created_at DESC
                LIMIT 30
            """),
            {"user_id": user_id, "pattern": pattern}
        ).fetchall()
        return [
            {
                "chat_id":        r[0], "user_query":     r[1],
                "model_response": r[2], "created_at":     str(r[3]),
                "workspace_id":   r[4], "workspace_name": r[5],
                "client_id":      r[6],
            }
            for r in rows
        ]