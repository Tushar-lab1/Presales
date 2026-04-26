CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────
-- Users (populated on first SSO login)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id         SERIAL PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Workspaces (one per client / project)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
    id         SERIAL PRIMARY KEY,
    user_id    INT REFERENCES users(id) ON DELETE CASCADE,
    client_id  TEXT NOT NULL,          -- e.g. "ACME-001"
    name       TEXT NOT NULL,          -- e.g. "Acme Corporation"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Documents – one row per uploaded file
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
    id           SERIAL PRIMARY KEY,
    workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
    filename     TEXT NOT NULL,
    file_type    TEXT NOT NULL,        -- pdf | docx | txt | csv | xlsx | pptx
    file_size    BIGINT,               -- bytes
    page_count   INT,                  -- NULL for non-paged formats
    uploaded_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Chunks – one row per text chunk + embedding
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chunks (
    id          SERIAL PRIMARY KEY,
    document_id INT REFERENCES documents(id) ON DELETE CASCADE,
    workspace_id INT REFERENCES workspaces(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,          -- position within the document
    content     TEXT NOT NULL,
    page_number INT,                   -- NULL when not applicable
    embedding   VECTOR(384),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- fast ANN index on the embedding column
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ─────────────────────────────────────────────
-- Chats – one row per user message + response
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chats (
    id             SERIAL PRIMARY KEY,
    workspace_id   INT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_query     TEXT NOT NULL,
    model_response TEXT NOT NULL,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- Chat citations – which chunks backed each response
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_citations (
    id       SERIAL PRIMARY KEY,
    chat_id  INT REFERENCES chats(id) ON DELETE CASCADE,
    chunk_id INT REFERENCES chunks(id) ON DELETE CASCADE,
    rank     INT   -- 1 = most relevant
);
