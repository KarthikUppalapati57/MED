from __future__ import annotations

import base64
import json
from typing import Any, Optional, Type

from google import genai
from google.genai.types import HttpOptions, Part
from pydantic import BaseModel

from transformer import SemanticTranslator


class VertexExtractor:
    """Gemini/Vertex-backed document extractor used by the local parser scripts."""

    def __init__(self, project: Optional[str] = None, location: Optional[str] = None, model: str = "gemini-2.5-flash"):
        self.project = project
        self.location = location or "us-central1"
        self.model = model
        self.client = genai.Client(
            vertexai=bool(project),
            project=project,
            location=self.location,
            http_options=HttpOptions(api_version="v1"),
        )
        self.translator = SemanticTranslator()

    def process(self, encoded_file: str, mime_type: str, schema: Optional[Type[BaseModel]] = None) -> dict[str, Any]:
        if not encoded_file:
            raise ValueError("encoded_file is required")
        if not mime_type:
            raise ValueError("mime_type is required")

        prompt = (
            "Extract this restaurant vendor invoice into JSON. Include invoice_number, account_number, "
            "date, due_date, vendor_name, customer_name, subtotal, tax_amount, total_amount, billing_address, "
            "line_items, line_items_confidence, consent_or_terms, and unmapped_fields. For scalar fields return "
            "objects with value and confidence when possible. Return only JSON."
        )
        response = self.client.models.generate_content(
            model=self.model,
            contents=[
                Part.from_bytes(data=base64.b64decode(encoded_file), mime_type=mime_type),
                prompt,
            ],
        )
        text = response.text or "{}"
        data = self._parse_json(text)
        remapped = self.translator.remap_keys(data)

        if schema is not None:
            return schema.model_validate(remapped.get("structured", remapped)).model_dump()
        return remapped

    @staticmethod
    def _parse_json(text: str) -> dict[str, Any]:
        stripped = text.strip()
        if stripped.startswith("```"):
            stripped = stripped.strip("`")
            if stripped.lower().startswith("json"):
                stripped = stripped[4:].strip()
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Gemini did not return a JSON object")
        return json.loads(stripped[start:end + 1])