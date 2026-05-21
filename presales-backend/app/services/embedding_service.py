# from sentence_transformers import SentenceTransformer

# # multi-qa-mpnet-base-dot-v1 (768-dim) is specifically trained for
# # asymmetric retrieval: short queries matched against longer passages.
# # It significantly outperforms all-MiniLM-L6-v2 (384-dim) on section-title
# # → paragraph retrieval tasks.
# #
# # NOTE: changing this model requires re-indexing all documents because the
# # vector column in PostgreSQL is now vector(768) instead of vector(384).
# model = SentenceTransformer("multi-qa-mpnet-base-dot-v1")


# def get_embeddings(texts: list[str]) -> list[list[float]]:
#     return model.encode(
#         texts,
#         normalize_embeddings=True,   # critical for cosine similarity via <=>
#         show_progress_bar=False,
#         batch_size=32,
#     ).tolist()


# def get_query_embedding(query: str) -> list[float]:
#     return model.encode(
#         query,
#         normalize_embeddings=True,
#     ).tolist()

from sentence_transformers import SentenceTransformer
import numpy as np

# multi-qa-mpnet-base-dot-v1 (768-dim) is trained for asymmetric retrieval:
# short queries matched against longer passages.
# normalize_embeddings=True is critical — it makes the <=> (cosine) operator
# in pgvector equivalent to a dot product, which is faster and numerically
# identical to proper cosine similarity.
#
# NOTE: changing this model requires re-indexing ALL existing documents because
# the vector column in PostgreSQL must be vector(768). Run:
#   ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(768);
# and re-embed everything.

model = SentenceTransformer("multi-qa-mpnet-base-dot-v1")

# Instruction prefixes improve retrieval accuracy on asymmetric tasks.
# Passages (stored chunks) get "passage:" at index time.
# Queries get "query:" at search time.
# This is standard practice for bi-encoder retrieval models.
_PASSAGE_PREFIX = "passage: "
_QUERY_PREFIX   = "query: "


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """
    Embed a list of document chunks (passages) for storage.
    Returns list[list[float]] so it serialises directly into pgvector format.
    """
    if not texts:
        return []

    prefixed = [_PASSAGE_PREFIX + t for t in texts]
    vectors  = model.encode(
        prefixed,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=64,           # safe for CPU and typical GPU VRAM
        convert_to_numpy=True,
    )
    return vectors.tolist()      # list[list[float]]


def get_query_embedding(query: str) -> list[float]:
    """
    Embed a single user query for similarity search.
    Separate 'query:' prefix so the model distinguishes a short question
    from a longer stored passage — this is the asymmetric retrieval trick.
    """
    if not query or not query.strip():
        raise ValueError("Query must not be empty")

    vector = model.encode(
        _QUERY_PREFIX + query.strip(),
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    return vector.tolist()       # list[float]


def get_embeddings_numpy(texts: list[str]) -> np.ndarray:
    """
    Same as get_embeddings but returns a raw numpy array (shape: N x 768).
    Useful for local similarity math before storing.
    """
    if not texts:
        return np.empty((0, 768), dtype=np.float32)

    prefixed = [_PASSAGE_PREFIX + t for t in texts]
    return model.encode(
        prefixed,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=64,
        convert_to_numpy=True,
    )