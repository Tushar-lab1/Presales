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
            {
                "id": r[0], "client_id": r[1], "name": r[2],
                "created_at": str(r[3]), "doc_count": r[4]
            }
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

def create_document(workspace_id: int, filename: str, file_type: str,
                    file_size: int, page_count: int = None) -> int:
    with engine.connect() as conn:
        result = conn.execute(
            text("""
                INSERT INTO documents (workspace_id, filename, file_type, file_size, page_count)
                VALUES (:workspace_id, :filename, :file_type, :file_size, :page_count)
                RETURNING id
            """),
            {
                "workspace_id": workspace_id,
                "filename": filename,
                "file_type": file_type,
                "file_size": file_size,
                "page_count": page_count,
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

def store_chunks(document_id: int, workspace_id: int,
                 chunks: list[str], embeddings, page_numbers: list[int] = None):
    with engine.connect() as conn:
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            page = page_numbers[i] if page_numbers and i < len(page_numbers) else None
            conn.execute(
                text("""
                    INSERT INTO chunks (document_id, workspace_id, chunk_index,
                                        content, page_number, embedding)
                    VALUES (:document_id, :workspace_id, :chunk_index,
                            :content, :page_number, :embedding)
                """),
                {
                    "document_id": document_id,
                    "workspace_id": workspace_id,
                    "chunk_index": i,
                    "content": chunk,
                    "page_number": page,
                    "embedding": embedding.tolist(),
                }
            )
        conn.commit()


def search_similar(query_embedding, workspace_id: int, top_k: int = 5) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    c.id          AS chunk_id,
                    c.content,
                    c.chunk_index,
                    c.page_number,
                    d.id          AS document_id,
                    d.filename,
                    d.file_type,
                    d.uploaded_at,
                    1 - (c.embedding <=> CAST(:query_embedding AS vector)) AS score
                FROM chunks c
                JOIN documents d ON d.id = c.document_id
                WHERE c.workspace_id = :workspace_id
                ORDER BY c.embedding <=> CAST(:query_embedding AS vector)
                LIMIT :top_k
            """),
            {
                "query_embedding": str(query_embedding.tolist()),
                "workspace_id": workspace_id,
                "top_k": top_k,
            }
        ).fetchall()
        return [
            {
                "chunk_id":    r[0],
                "content":     r[1],
                "chunk_index": r[2],
                "page_number": r[3],
                "document_id": r[4],
                "filename":    r[5],
                "file_type":   r[6],
                "uploaded_at": str(r[7]),
                "score":       float(r[8]),
            }
            for r in rows
        ]


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
                    SELECT cc.rank, c.id, c.content, c.page_number, d.filename, d.file_type
                    FROM chat_citations cc
                    JOIN chunks c ON c.id = cc.chunk_id
                    JOIN documents d ON d.id = c.document_id
                    WHERE cc.chat_id = :chat_id
                    ORDER BY cc.rank
                """),
                {"chat_id": chat_id}
            ).fetchall()
            history.append({
                "id": chat_id,
                "user_query": user_query,
                "model_response": model_response,
                "created_at": str(created_at),
                "citations": [
                    {
                        "rank": cit[0], "chunk_id": cit[1], "content": cit[2],
                        "page_number": cit[3], "filename": cit[4], "file_type": cit[5],
                    }
                    for cit in citations
                ],
            })
        return history


def search_chats(user_id: int, query: str) -> list[dict]:
    """
    Full-text search across all chat turns belonging to the user.
    Searches both user_query and model_response using ILIKE.
    Returns matching turns grouped with their workspace name.
    """
    pattern = f"%{query}%"
    with engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT
                    ch.id           AS chat_id,
                    ch.user_query,
                    ch.model_response,
                    ch.created_at,
                    w.id            AS workspace_id,
                    w.name          AS workspace_name,
                    w.client_id
                FROM chats ch
                JOIN workspaces w ON w.id = ch.workspace_id
                WHERE w.user_id = :user_id
                  AND (
                      ch.user_query     ILIKE :pattern
                   OR ch.model_response ILIKE :pattern
                  )
                ORDER BY ch.created_at DESC
                LIMIT 30
            """),
            {"user_id": user_id, "pattern": pattern}
        ).fetchall()

        return [
            {
                "chat_id":        r[0],
                "user_query":     r[1],
                "model_response": r[2],
                "created_at":     str(r[3]),
                "workspace_id":   r[4],
                "workspace_name": r[5],
                "client_id":      r[6],
            }
            for r in rows
        ]