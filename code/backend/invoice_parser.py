"""
Invoice Parser — Docling + OpenAI structured extraction.

1. Docling converts the document (PDF/image) → Markdown with table support
2. OpenAI GPT-4o reads the Markdown and returns structured invoice JSON
3. Fallback regex parser if OpenAI is unavailable
"""

import json
import os
import re
from pathlib import Path

from docling.document_converter import DocumentConverter
from openai import OpenAI


# ── Docling Conversion ───────────────────────────────────────

def parse_with_docling(file_path: str) -> str:
    """Convert a document to Markdown using Docling's DocumentConverter."""
    converter = DocumentConverter()
    result = converter.convert(file_path)
    markdown = result.document.export_to_markdown()
    return markdown


# ── OpenAI Structured Extraction ─────────────────────────────

INVOICE_SCHEMA_PROMPT = """You are an expert invoice data extractor. You will receive the text content of an invoice document (in Markdown format, possibly with tables). Extract all invoice information and return ONLY valid JSON with this exact structure:
{
  "vendor_name": "string",
  "vendor_address": "string or null",
  "account_number": "string or null",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD or null",
  "payment_terms": "string or null (e.g. Net 30)",
  "purchase_order": "string or null",
  "subtotal": number,
  "tax_amount": number,
  "fuel_surcharge": number,
  "delivery_fee": number,
  "other_charges": number,
  "total_amount": number,
  "line_items": [
    {
      "product_id": "string or null",
      "description": "string",
      "quantity": number,
      "unit": "string (ea, lb, cs, etc.)",
      "unit_price": number,
      "extended_price": number
    }
  ]
}
Return ONLY the JSON object, no markdown, no explanation. Be precise with numbers and dates. If a field is not found, use null for strings and 0 for numbers."""


def extract_invoice_fields(markdown_text: str) -> dict:
    """Send Docling's Markdown output to OpenAI for structured extraction."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("[invoice_parser] No OPENAI_API_KEY found, falling back to regex parser")
        return extract_with_regex(markdown_text)

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": INVOICE_SCHEMA_PROMPT},
            {
                "role": "user",
                "content": f"Extract all invoice data from this document:\n\n{markdown_text}",
            },
        ],
        max_tokens=4096,
        temperature=0,
    )

    content = response.choices[0].message.content or ""

    # Strip markdown code fences if present
    json_str = re.sub(r"```json\n?", "", content)
    json_str = re.sub(r"```\n?", "", json_str).strip()

    return json.loads(json_str)


# ── Fallback Regex Parser ────────────────────────────────────

def extract_with_regex(text: str) -> dict:
    """Basic regex-based extraction as fallback when OpenAI is unavailable."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    result = {
        "vendor_name": "",
        "vendor_address": None,
        "account_number": None,
        "invoice_number": "",
        "invoice_date": "",
        "due_date": None,
        "payment_terms": None,
        "purchase_order": None,
        "subtotal": 0,
        "tax_amount": 0,
        "fuel_surcharge": 0,
        "delivery_fee": 0,
        "other_charges": 0,
        "total_amount": 0,
        "line_items": [],
    }

    label_keywords = re.compile(
        r"^(invoice|bill|receipt|statement|account|date|page|no\b|number|#|\|)",
        re.IGNORECASE,
    )

    for line in lines:
        if not result["vendor_name"] and not label_keywords.match(line) and len(line) > 2:
            result["vendor_name"] = line
            break

    for line in lines:
        lower = line.lower()

        # Invoice number
        if not result["invoice_number"]:
            m = re.search(
                r"(?:invoice\s*(?:#|no\.?|number|num)?|inv\s*(?:#|no\.?))\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\/]{1,20})",
                line,
                re.IGNORECASE,
            )
            if m and re.search(r"\d", m.group(1)):
                result["invoice_number"] = m.group(1).strip()

        # Invoice date
        if not result["invoice_date"]:
            m = re.search(
                r"(?:invoice\s*)?date\s*[:\-]?\s*(\d{1,2}[\s\/\-\.]\d{1,2}[\s\/\-\.]\d{2,4})",
                line,
                re.IGNORECASE,
            )
            if m:
                result["invoice_date"] = _normalize_date(m.group(1))

        # Total amount
        m = re.search(
            r"(?:invoice\s+total|amount\s+due|balance\s+due|total\s+due|grand\s+total)\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)",
            lower,
        )
        if m:
            val = float(m.group(1).replace(",", ""))
            if val > result["total_amount"]:
                result["total_amount"] = val

        if not result["total_amount"]:
            m = re.search(r"(?:^|\s)total\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)", lower)
            if m:
                result["total_amount"] = float(m.group(1).replace(",", ""))

        # Subtotal
        m = re.search(r"sub\s*[-\s]?total\s*[:\-$]*\s*\$?\s*([\d,]+\.?\d*)", lower)
        if m and not result["subtotal"]:
            result["subtotal"] = float(m.group(1).replace(",", ""))

        # Tax
        m = re.search(
            r"(?:^|\s)(?:tax|sales\s*tax|hst|gst|vat)\s*[:\-$(%\d]*\s*\$?\s*([\d,]+\.?\d*)",
            lower,
        )
        if m and not result["tax_amount"]:
            result["tax_amount"] = float(m.group(1).replace(",", ""))

    return result


def _normalize_date(date_str: str) -> str:
    """Normalize dates to YYYY-MM-DD format."""
    try:
        clean = re.sub(r"\s+", "/", date_str)
        clean = re.sub(r"[\/\-\.]", "/", clean)
        parts = clean.split("/")
        if len(parts) != 3:
            return date_str

        a, b, c = [int(p) for p in parts]

        if c < 100:
            c += 2000

        if a > 12:
            return f"{c}-{b:02d}-{a:02d}"
        return f"{c}-{a:02d}-{b:02d}"
    except Exception:
        return date_str
