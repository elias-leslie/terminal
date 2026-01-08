"""Terminal Files API - File upload endpoint.

Allows users to upload files via the terminal UI.
Files are stored server-side and the path is returned for use in terminal commands.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from ..config import MAX_FILE_SIZE, MAX_FILE_SIZE_MB, UPLOAD_DIR
from ..logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Terminal Files"])

# Allowed MIME types for upload
ALLOWED_MIME_TYPES = {
    # Images
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    # Documents
    "text/markdown",
    "text/plain",
    "application/json",
    "application/pdf",
}

# Extension mapping for MIME types
MIME_TO_EXTENSION = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "text/markdown": ".md",
    "text/plain": ".txt",
    "application/json": ".json",
    "application/pdf": ".pdf",
}


class FileUploadResponse(BaseModel):
    """Response for file upload."""

    path: str
    filename: str
    size: int
    mime_type: str


@router.post("/api/terminal/files", response_model=FileUploadResponse)
async def upload_file(file: UploadFile) -> FileUploadResponse:
    """Upload a file for use in terminal commands.

    Files are stored in ~/terminal-uploads/ with UUID naming.
    Returns the absolute path to the uploaded file.

    Allowed types: png, jpg, gif, webp, md, txt, json, pdf
    Max size: 10MB (configurable via MAX_FILE_SIZE_MB env var)
    """
    # Validate MIME type
    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{content_type}' not allowed. Allowed: {', '.join(sorted(ALLOWED_MIME_TYPES))}",
        )

    # Read file content (with size limit)
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE_MB}MB",
        )

    # Create upload directory if needed
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Generate UUID filename with appropriate extension
    extension = MIME_TO_EXTENSION.get(content_type, "")
    filename = f"{uuid.uuid4()}{extension}"
    file_path = UPLOAD_DIR / filename

    # Write file
    file_path.write_bytes(content)

    logger.info(
        "file_uploaded",
        filename=filename,
        size=len(content),
        mime_type=content_type,
        original_name=file.filename,
    )

    return FileUploadResponse(
        path=str(file_path),
        filename=filename,
        size=len(content),
        mime_type=content_type,
    )
