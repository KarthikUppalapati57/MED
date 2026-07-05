import json
from pathlib import Path
from pypdf import PdfReader
import pdfplumber
p = Path(r'C:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\ME vs REstops\Invoices.pdf')
out = Path(r'tmp\pdfs\invoices-example-extract.json')
reader = PdfReader(str(p))
info = {'pages': len(reader.pages), 'metadata': {k: str(v) for k,v in (reader.metadata or {}).items()}, 'page_text': []}
for i, page in enumerate(reader.pages):
    text = page.extract_text() or ''
    info['page_text'].append({'page': i+1, 'chars': len(text), 'text': text[:6000]})
with pdfplumber.open(str(p)) as pdf:
    info['plumber_pages'] = []
    for i, page in enumerate(pdf.pages):
        words = page.extract_words()[:80]
        info['plumber_pages'].append({'page': i+1, 'width': page.width, 'height': page.height, 'words': words})
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(info, indent=2), encoding='utf-8')
print(json.dumps({'pages': info['pages'], 'metadata': info['metadata'], 'extract': str(out)}, indent=2))
