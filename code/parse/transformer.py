from typing import Dict, Any, List
from sentence_transformers import SentenceTransformer, util
import numpy as np

class SemanticTranslator:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        # Using a fast, lightweight model for sentence similarity
        self.model = SentenceTransformer(model_name, device='cpu')
        self.target_fields = {
            "invoice_number": ["bill number", "invoice #", "reference", "inv id", "inv no", "statement number"],
            "account_number": ["account #", "account no", "acct number", "customer id", "billing id"],
            "date": ["billing date", "issue date", "invoice date", "dated", "statement date"],
            "due_date": ["payment due", "pay by", "due", "scheduled for", "autopay date"],
            "vendor_name": ["seller", "from", "company", "issuer", "provider"],
            "customer_name": ["customer", "buyer", "bill to name", "ship to", "recipient", "sold to"],
            "customer_address": ["customer address", "ship to address", "delivery address", "mailing address"],
            "subtotal": ["amount before tax", "net total", "sub-total"],
            "tax_amount": ["vat", "sales tax", "gst", "tax total", "surcharges"],
            "total_amount": ["grand total", "total due", "amount to pay", "final price", "balance due"],
            "billing_address": ["bill to", "remit to", "payment address", "po box"],
        }
        # Pre-compute embeddings
        self._field_embeddings = {}
        for field, variants in self.target_fields.items():
            comparisons = [field.replace("_", " ")] + variants
            self._field_embeddings[field] = self.model.encode(comparisons, convert_to_tensor=True)
        
    def resolve(self, label: str) -> str:
        label_emb = self.model.encode(label, convert_to_tensor=True)
        best_match = None
        best_score = 0.5
        for field, comp_embs in self._field_embeddings.items():
            cosine_scores = util.cos_sim(label_emb, comp_embs)
            max_score = float(np.max(cosine_scores.cpu().numpy()))
            if max_score > best_score:
                best_score = max_score
                best_match = field
        return best_match

    def remap_keys(self, raw_data: dict) -> dict:
        KNOWN_KEYS = {
            "invoice_number", "account_number", "date", "due_date", "vendor_name",
            "customer_name", "customer_address", "subtotal", "tax_amount", 
            "total_amount", "billing_address", "consent_or_terms", 
            "line_items", "line_items_confidence", "unmapped_fields"
        }
        remapped = {"structured": {}}
        source = raw_data.get("structured", raw_data)
        
        for key, value in source.items():
            if key in KNOWN_KEYS:
                remapped["structured"][key] = value
            else:
                resolved = self.resolve(key)
                if resolved:
                    remapped["structured"][resolved] = value
        return remapped