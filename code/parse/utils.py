import os
import base64
from dotenv import load_dotenv

# Load variables from .env
load_dotenv()

def get_env_var(name):
    value = os.getenv(name)
    if not value:
        print(f"⚠️ Warning: {name} not found in environment!")
    return value

def load_document_as_base64(file_path: str):
    with open(file_path, "rb") as doc_file:
        return base64.b64encode(doc_file.read()).decode("utf-8")