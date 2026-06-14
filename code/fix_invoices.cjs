const fs = require('fs');
const path = require('path');

const dir = 'src/components/invoices';
const files = fs.readdirSync(dir);

for (const file of files) {
  if (!file.endsWith('.jsx')) continue;
  
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Change api.client to supabase
  if (content.includes('api.client')) {
    content = content.replace(/api\.client/g, 'supabase');
    changed = true;
  }

  // Add supabase import if supabase is used and not imported
  if (content.includes('supabase') && !content.includes('@/lib/supabaseClient') && !content.includes('../../lib/supabaseClient')) {
    // replace api import if it's there
    if (content.includes('import { api } from \'@/lib/apiClient\'')) {
      content = content.replace('import { api } from \'@/lib/apiClient\'', 'import { api } from \'@/lib/apiClient\';\nimport { supabase } from \'@/lib/supabaseClient\'');
    } else if (content.includes('import { api } from \'../../lib/api\'')) {
      content = content.replace('import { api } from \'../../lib/api\'', 'import { supabase } from \'@/lib/supabaseClient\'');
    } else {
      content = 'import { supabase } from \'@/lib/supabaseClient\';\n' + content;
    }
    changed = true;
  }
  
  // Fix export defaults for the ones that need it
  if (['CategorySummaryTable.jsx', 'SplitCodingDialog.jsx'].includes(file)) {
    if (content.includes('export default function')) {
      content = content.replace(/export default function/, 'export function');
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('Fixed', file);
  }
}
