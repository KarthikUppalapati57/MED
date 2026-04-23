import json
from schema import ExtractedFields
from utils import load_document_as_base64, get_env_var
from model import VertexExtractor

def test_pipeline():
    # Load Config
    PROJECT = get_env_var("PROJECT_ID")
    LOC = get_env_var("LOCATION")
    TEST_FILE = "usfoods.pdf" 

    print(f"🚀 Initializing Vertex AI in {LOC}...")
    extractor = VertexExtractor(PROJECT, LOC)

    print(f"📄 Loading {TEST_FILE}...")
    try:
        encoded_file = load_document_as_base64(TEST_FILE)
        
        print("🧠 Sending to Gemini 1.5 Flash (Target < 1 min)...")
        # We pass 'application/pdf' but Gemini also handles 'image/jpeg' or 'image/png'
        result_data = extractor.process(encoded_file, "application/pdf")
        
        # Parse and Print
        print("\n✅ Extraction Successful!")
        print(json.dumps(result_data, indent=4))
        
    except Exception as e:
        print(f"\n❌ Error during test: {e}")

if __name__ == "__main__":
    test_pipeline()