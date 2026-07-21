from schema import ExtractedFields
from utils import load_document_as_base64, get_env_var
from model import VertexExtractor

PROJECT = get_env_var("PROJECT_ID")
LOC = get_env_var("LOCATION") or "us-central1"
FILE = "sample_invoice.pdf"

extractor = VertexExtractor(PROJECT, LOC)

print("Starting extraction...")
encoded_file = load_document_as_base64(FILE)
result_json = extractor.process(encoded_file, "application/pdf", ExtractedFields)

print(result_json)