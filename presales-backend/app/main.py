from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import httpx
import jwt as pyjwt           # pip install PyJWT
import os

from app.routers.workspace import router as workspace_router
from app.routers.chat import router as chat_router


app = FastAPI(title="Presales RAG API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────
# Keycloak config
# ─────────────────────────────────────────────

KEYCLOAK_URL       = os.getenv("KEYCLOAK_URL", "http://localhost:8080")
KEYCLOAK_REALM     = os.getenv("KEYCLOAK_REALM", "presales")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "presales-app")

JWKS_URL = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"

bearer_scheme = HTTPBearer()

# ─────────────────────────────────────────────
# JWT verification (Keycloak)
# ─────────────────────────────────────────────

_jwks_cache: dict | None = None
async def get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(JWKS_URL)
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    token = credentials.credentials
    try:
        jwks        = await get_jwks()
        public_keys = pyjwt.PyJWKClient(JWKS_URL)
        signing_key = public_keys.get_signing_key_from_jwt(token)
        # 
        payload = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience="account",
        )
        return {
            "email": payload.get("email", ""),
            "name":  payload.get("name", payload.get("preferred_username", "")),
            "sub":   payload.get("sub"),
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
        )


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────
app.include_router(workspace_router)
app.include_router(chat_router)


@app.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    """Validate token and return user info — called by the frontend after SSO."""
    from app.services.db_service import get_or_create_user
    db_user = get_or_create_user(user["email"], user["name"])
    return {"user": {**db_user, "sub": user["sub"]}}


@app.get("/health")
def health():
    return {"status": "ok"}
