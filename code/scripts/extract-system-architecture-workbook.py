import json
import pandas as pd
from pathlib import Path

source = Path(r'C:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\ME vs REstops\MEVS_System_Architecture_All_Modules_Row_Format.xlsx')
out = Path(r'C:\Users\ukart\OneDrive - University of Tennessee\M\INtern\MECURSOR\MEVS\outputs\mevs_system_architecture_workbook_rows.json')

book = pd.ExcelFile(source)
result = {
    'source_file': str(source),
    'sheets': []
}
for sheet_name in book.sheet_names:
    df = pd.read_excel(source, sheet_name=sheet_name, dtype=str).fillna('')
    columns = list(df.columns)
    rows = df.to_dict(orient='records')
    result['sheets'].append({
        'name': sheet_name,
        'columns': columns,
        'row_count': len(rows),
        'rows': rows,
    })

out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(out)
