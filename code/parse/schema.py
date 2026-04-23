from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

class ExtractedBlock(BaseModel):
    """Matches your specific JSON format: {"value": ..., "confidence": ...}"""
    value: Optional[Any] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

class LineItem(BaseModel):
    product_description: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    quantity: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    unit_price: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    total_price: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    product_number: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)

class ExtractedFields(BaseModel):
    # General Info
    invoice_number: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    account_number: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    date: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    due_date: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    vendor_name: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    customer_name: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    customer_address: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    
    # Product Details
    line_items: List[LineItem] = Field(default_factory=list)
    line_items_confidence: float = 0.0
    
    # Amounts
    subtotal: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    tax_amount: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    total_amount: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    billing_address: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    
    consent_or_terms: Optional[ExtractedBlock] = Field(default_factory=ExtractedBlock)
    unmapped_fields: List[Dict[str, Any]] = Field(default_factory=list)