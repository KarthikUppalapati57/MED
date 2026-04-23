from schema import DocumentSchema
from utils import load_document_as_base64, get_env_var
from model import VertexExtractor

# 1. Setup from .env
PROJECT = get_env_var("PROJECT_ID")
LOC = get_env_var("LOCATION")
FILE = "sample_invoice.pdf" # Replace with your upload path

# 2. Initialize
extractor = VertexExtractor(PROJECT, LOC)

# 3. Execute
print("Starting extraction...")
encoded_file = load_document_as_base64(FILE)
result_json = extractor.process(encoded_file, "application/pdf", DocumentSchema)

# 4. Result for UI
print(result_json)