import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.join(__dirname, 'supabase', 'migrations');
const outputFile = path.join(__dirname, 'aggregated_rls_rbac.sql');

if (!fs.existsSync(migrationsDir)) {
  console.error("Migrations directory not found:", migrationsDir);
  process.exit(1);
}

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

let aggregatedSql = `-- Aggregated RLS and RBAC statements from ${files.length} migrations\n\n`;
let matchCount = 0;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Remove block comments to avoid matching inside them (simple approach)
  // And split by semicolon to process individual statements.
  const statements = content
    .replace(/\/\*[\s\S]*?\*\//g, '') 
    .split(';');
  
  let fileMatches = [];

  for (let stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;
    
    // Check if it's a target statement
    const upper = trimmed.toUpperCase();
    // Some basic heuristics to catch RLS and RBAC
    if (
      upper.startsWith('CREATE POLICY') || 
      upper.startsWith('CREATE OR REPLACE POLICY') ||
      upper.startsWith('DROP POLICY') ||
      (upper.startsWith('ALTER TABLE') && upper.includes('ENABLE ROW LEVEL SECURITY')) ||
      (upper.startsWith('ALTER TABLE') && upper.includes('FORCE ROW LEVEL SECURITY')) ||
      (upper.startsWith('ALTER FUNCTION') && (upper.includes('SECURITY DEFINER') || upper.includes('SECURITY INVOKER'))) ||
      (upper.startsWith('ALTER ROUTINE') && (upper.includes('SECURITY DEFINER') || upper.includes('SECURITY INVOKER'))) ||
      upper.startsWith('ALTER DEFAULT PRIVILEGES') ||
      upper.startsWith('GRANT ') || 
      upper.startsWith('REVOKE ') ||
      upper.startsWith('CREATE ROLE') ||
      upper.startsWith('DROP ROLE')
    ) {
      fileMatches.push(trimmed + ';');
      matchCount++;
    }
  }
  
  if (fileMatches.length > 0) {
    aggregatedSql += `-- Source: ${file}\n`;
    aggregatedSql += fileMatches.join('\n\n') + '\n\n';
  }
}

fs.writeFileSync(outputFile, aggregatedSql);
console.log(`Successfully extracted ${matchCount} RLS/RBAC statements to ${outputFile}`);
