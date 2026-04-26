from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.db_service import (
    get_or_create_user,
    create_workspace,
    get_workspaces,
    get_documents,
    delete_document,
    workspace_belongs_to_user,
)
from sqlalchemy import text
from app.services.db_service import engine

router = APIRouter(prefix="/workspaces", tags=["workspaces"])


class WorkspaceCreateRequest(BaseModel):
    email: str
    name: str
    client_id: str


@router.post("")
def create_new_workspace(body: WorkspaceCreateRequest):
    if not body.email or not body.client_id or not body.name:
        raise HTTPException(status_code=400, detail="email, client_id and name are required")
    user = get_or_create_user(body.email)
    workspace = create_workspace(
        user_id=user["id"],
        client_id=body.client_id,
        name=body.name,
    )
    return {"user_id": user["id"], "workspace": workspace}


@router.get("")
def list_workspaces(email: str):
    if not email:
        raise HTTPException(status_code=400, detail="email query param required")
    user = get_or_create_user(email)
    return {"user_id": user["id"], "workspaces": get_workspaces(user["id"])}


@router.delete("/{workspace_id}")
def delete_workspace(workspace_id: int, email: str):
    """Delete a workspace and all its documents, chunks and chats (CASCADE handles DB side)."""
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    with engine.connect() as conn:
        result = conn.execute(
            text("DELETE FROM workspaces WHERE id = :wid AND user_id = :uid RETURNING id"),
            {"wid": workspace_id, "uid": user["id"]}
        )
        conn.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Workspace not found")
    return {"deleted": True, "workspace_id": workspace_id}


@router.get("/{workspace_id}/documents")
def list_documents(workspace_id: int, email: str):
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    return {"workspace_id": workspace_id, "documents": get_documents(workspace_id)}


@router.delete("/{workspace_id}/documents/{document_id}")
def remove_document(workspace_id: int, document_id: int, email: str):
    user = get_or_create_user(email)
    if not workspace_belongs_to_user(workspace_id, user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    deleted = delete_document(document_id, workspace_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"deleted": True, "document_id": document_id}