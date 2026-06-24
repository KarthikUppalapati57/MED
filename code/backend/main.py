"""
FastAPI backend for Docling + Vertex AI Gemini invoice extraction.

Run with:
    uvicorn main:app --reload --port 8000
"""

import os
import tempfile
import traceback

import posthog
from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from invoice_parser import parse_with_docling, extract_invoice_fields

load_dotenv()

posthog.project_api_key = os.environ.get("POSTHOG_API_KEY", "")
posthog.host = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com")

def capture_event(event: str, properties: dict):
    """Send best-effort telemetry without breaking invoice extraction."""
    if not posthog.project_api_key:
        return

    try:
        posthog.capture(event, distinct_id="backend", properties=properties)
    except Exception:
        traceback.print_exc()

app = FastAPI(
    title="MEVS Invoice Extraction API",
    description="Docling + Vertex AI Gemini invoice document extraction",
    version="1.1.0",
)

# CORS — allow the Vite dev server and common deployment origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "docling"}


@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    """
    Accept an uploaded invoice file (PDF, PNG, JPG, TIFF),
    parse it with Docling, then structure the data with OpenAI.
    """
    allowed_types = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/tiff",
        "image/webp",
    ]

    # Validate content type
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(allowed_types)}",
        )

    # Save uploaded file to a temp location for Docling
    suffix = _get_extension(file.filename, file.content_type)
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, mode="wb") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Step 1: Parse with Docling → Markdown
        markdown_text = parse_with_docling(tmp_path)

        if not markdown_text or not markdown_text.strip():
            raise HTTPException(
                status_code=422,
                detail="Docling could not extract any content from the document.",
            )

        # Step 2: Extract structured invoice fields
        invoice_data = extract_invoice_fields(markdown_text)

        # Add metadata
        normalization_method = invoice_data.pop("normalization_method", "gemini")
        invoice_data["extraction_method"] = "docling+regex" if normalization_method == "regex_fallback" else "docling+gemini"
        invoice_data["raw_text"] = markdown_text

        capture_event(
            "invoice_extracted",
            {
                "file_type": file.content_type,
                "filename": file.filename,
                "extraction_method": invoice_data["extraction_method"],
            },
        )

        return invoice_data

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        capture_event(
            "invoice_extraction_failed",
            {
                "file_type": file.content_type,
                "filename": file.filename,
                "error": str(e),
            },
        )
        raise HTTPException(
            status_code=500,
            detail=f"Extraction failed: {str(e)}",
        )
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def _get_extension(filename: str | None, content_type: str) -> str:
    """Determine file extension from filename or content type."""
    if filename:
        ext = os.path.splitext(filename)[1]
        if ext:
            return ext

    type_map = {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/tiff": ".tiff",
        "image/webp": ".webp",
    }
    return type_map.get(content_type, ".pdf")
