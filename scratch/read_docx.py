import zipfile
import xml.etree.ElementTree as ET

path = r'c:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\Notes\MEVS_vs_MarginEdge_Competitive_Gap_Report.docx'
with zipfile.ZipFile(path) as docx:
    xml_content = docx.read('word/document.xml')
    root = ET.fromstring(xml_content)
    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    
    texts = []
    for node in root.iter():
        if node.tag == f'{{{ns["w"]}}}t' and node.text:
            texts.append(node.text)
        elif node.tag == f'{{{ns["w"]}}}p':
            texts.append('\n')
    
    print(''.join(texts))
