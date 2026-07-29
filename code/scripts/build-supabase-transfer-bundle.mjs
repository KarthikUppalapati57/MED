import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const functionsDir = path.join(root, 'supabase', 'functions');
const seedFile = path.join(root, 'supabase', 'seed.sql');
const outputDir = path.join(root, 'exports', 'supabase-transfer-20260727');

const today = '2026-07-27';

function readSqlFiles(dir) {
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const filePath = path.join(dir, file);
      return {
        file,
        filePath,
        content: fs.readFileSync(filePath, 'utf8'),
        size: fs.statSync(filePath).size,
        modified: fs.statSync(filePath).mtime.toISOString(),
      };
    });
}

function stripBlockComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (!quote && !dollarTag && char === '-' && next === '-') {
      const end = sql.indexOf('\n', i + 2);
      if (end === -1) break;
      current += sql.slice(i, end + 1);
      i = end;
      continue;
    }

    if (!quote && char === '$') {
      const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tag = match[0];
        current += tag;
        i += tag.length - 1;
        if (dollarTag === tag) {
          dollarTag = null;
        } else if (!dollarTag) {
          dollarTag = tag;
        }
        continue;
      }
    }

    if (!dollarTag && (char === "'" || char === '"')) {
      if (quote === char && sql[i - 1] !== '\\') {
        quote = null;
      } else if (!quote) {
        quote = char;
      }
    }

    if (!quote && !dollarTag && char === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(`${trimmed};`);
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed.endsWith(';') ? trimmed : `${trimmed};`);
  return statements;
}

function upperStatement(statement) {
  return statement
    .replace(/^--.*$/gm, '')
    .trim()
    .toUpperCase();
}

function isRlsRbac(statement) {
  const upper = upperStatement(statement);
  return (
    upper.startsWith('CREATE POLICY') ||
    upper.startsWith('CREATE OR REPLACE POLICY') ||
    upper.startsWith('DROP POLICY') ||
    (upper.startsWith('ALTER TABLE') && upper.includes('ENABLE ROW LEVEL SECURITY')) ||
    (upper.startsWith('ALTER TABLE') && upper.includes('DISABLE ROW LEVEL SECURITY')) ||
    (upper.startsWith('ALTER TABLE') && upper.includes('FORCE ROW LEVEL SECURITY')) ||
    (upper.startsWith('ALTER TABLE') && upper.includes('NO FORCE ROW LEVEL SECURITY')) ||
    (upper.startsWith('ALTER FUNCTION') && (upper.includes('SECURITY DEFINER') || upper.includes('SECURITY INVOKER'))) ||
    (upper.startsWith('ALTER ROUTINE') && (upper.includes('SECURITY DEFINER') || upper.includes('SECURITY INVOKER'))) ||
    upper.startsWith('ALTER DEFAULT PRIVILEGES') ||
    upper.startsWith('GRANT ') ||
    upper.startsWith('REVOKE ') ||
    upper.startsWith('CREATE ROLE') ||
    upper.startsWith('ALTER ROLE') ||
    upper.startsWith('DROP ROLE')
  );
}

function isRpc(statement) {
  const upper = upperStatement(statement);
  return (
    upper.startsWith('CREATE FUNCTION') ||
    upper.startsWith('CREATE OR REPLACE FUNCTION') ||
    upper.startsWith('CREATE PROCEDURE') ||
    upper.startsWith('CREATE OR REPLACE PROCEDURE') ||
    upper.startsWith('DROP FUNCTION') ||
    upper.startsWith('DROP PROCEDURE') ||
    upper.startsWith('ALTER FUNCTION') ||
    upper.startsWith('ALTER PROCEDURE') ||
    upper.startsWith('ALTER ROUTINE') ||
    upper.startsWith('COMMENT ON FUNCTION') ||
    upper.startsWith('COMMENT ON PROCEDURE')
  );
}

function isInfra(statement) {
  const upper = upperStatement(statement);
  return (
    upper.startsWith('CREATE EXTENSION') ||
    upper.startsWith('ALTER EXTENSION') ||
    upper.startsWith('DROP EXTENSION') ||
    upper.includes('SCHEMA STORAGE') ||
    upper.includes('STORAGE.BUCKETS') ||
    upper.includes('STORAGE.OBJECTS') ||
    upper.includes('SUPABASE_REALTIME') ||
    upper.includes('ALTER PUBLICATION') ||
    upper.includes('CREATE PUBLICATION') ||
    upper.includes('DROP PUBLICATION') ||
    upper.includes('CRON.') ||
    upper.includes('PG_NET') ||
    upper.includes('NET.')
  );
}

function extractStatements(migrations, predicate) {
  const byFile = [];
  let count = 0;

  for (const migration of migrations) {
    const statements = splitStatements(stripBlockComments(migration.content))
      .filter(predicate);
    if (statements.length > 0) {
      byFile.push({ file: migration.file, statements });
      count += statements.length;
    }
  }

  return { byFile, count };
}

function formatExtract(title, extraction) {
  let sql = `-- ${title}\n-- Generated: ${today}\n\n`;
  for (const source of extraction.byFile) {
    sql += `-- Source: ${source.file}\n`;
    sql += `${source.statements.join('\n\n')}\n\n`;
  }
  return sql;
}

function writeCombinedMigrations(migrations) {
  let sql = `-- All Supabase migrations in filename order\n-- Generated: ${today}\n-- Migration count: ${migrations.length}\n\n`;
  for (const migration of migrations) {
    sql += `\n-- ==========================================================================\n`;
    sql += `-- Source: ${migration.file}\n`;
    sql += `-- ==========================================================================\n\n`;
    sql += migration.content.trimEnd();
    sql += '\n';
  }
  fs.writeFileSync(path.join(outputDir, '010_all_migrations_in_order.sql'), sql);
}

function writeLatestDelta(migrations) {
  const latest = migrations.filter((migration) => migration.file.startsWith('20260727'));
  let sql = `-- Latest 20260727 migration delta\n-- Generated: ${today}\n-- Migration count: ${latest.length}\n\n`;
  for (const migration of latest) {
    sql += `\n-- ==========================================================================\n`;
    sql += `-- Source: ${migration.file}\n`;
    sql += `-- ==========================================================================\n\n`;
    sql += migration.content.trimEnd();
    sql += '\n';
  }
  fs.writeFileSync(path.join(outputDir, '015_latest_20260727_delta.sql'), sql);
  return latest.length;
}

function writeEdgeFunctionDocs() {
  const functions = fs.readdirSync(functionsDir)
    .filter((name) => fs.statSync(path.join(functionsDir, name)).isDirectory())
    .filter((name) => !name.startsWith('_'))
    .sort();

  let docs = `# Edge Functions\n\nGenerated: ${today}\n\nDeploy after linking the target Supabase project:\n\n`;
  let deploy = [
    'param(',
    '  [string]$ProjectRef = ""',
    ')',
    '',
    'if ($ProjectRef) {',
    '  supabase link --project-ref $ProjectRef',
    '}',
    '',
  ].join('\n');

  for (const fn of functions) {
    docs += `- \`${fn}\`\n`;
    deploy += `supabase functions deploy ${fn}\n`;
  }

  docs += '\nSecret values are not exported. Set them manually in each target project with Supabase Dashboard or `supabase secrets set`.\n';

  fs.writeFileSync(path.join(outputDir, '060_edge_functions.md'), docs);
  fs.writeFileSync(path.join(outputDir, 'deploy_edge_functions.ps1'), deploy);
  return functions.length;
}

function writeReadme({ migrationCount, latestCount, rlsCount, rpcCount, infraCount, edgeFunctionCount }) {
  const readme = `# Supabase Transfer Package - ${today}\n\nUse this folder to transfer the current database and Edge Function setup into the three new Supabase projects.\n\n## Recommended Path\n\nPrefer Supabase CLI migrations for each target project:\n\n\`\`\`powershell\nsupabase link --project-ref <target-project-ref>\nsupabase db push\n.\\exports\\supabase-transfer-20260727\\deploy_edge_functions.ps1\n\`\`\`\n\nThen set Edge Function secrets manually in the Supabase dashboard or with \`supabase secrets set\`.\n\n## Files\n\n- \`010_all_migrations_in_order.sql\` - all ${migrationCount} migration files combined in filename order. Use for a fresh project only if you are not using \`supabase db push\`.\n- \`015_latest_20260727_delta.sql\` - latest ${latestCount} \`20260727*.sql\` migrations. Use only when the target already has the older baseline.\n- \`020_rls_rbac.sql\` - extracted RLS/RBAC/security grants from all migrations.\n- \`030_rpc_functions.sql\` - extracted RPC/function/procedure statements from all migrations.\n- \`040_storage_realtime_cron_extensions.sql\` - extracted storage, realtime, cron, pg_net, and extension infrastructure statements.\n- \`050_seed_reference_data.sql\` - current safe seed/reference data.\n- \`060_edge_functions.md\` - Edge Function names and deploy notes.\n- \`deploy_edge_functions.ps1\` - deploy all Edge Functions after linking the target project.\n- \`migration_manifest.json\` - migration inventory.\n- \`extract_summary.json\` - extraction counts.\n\n## SQL Editor Order\n\nIf you must use Supabase SQL Editor manually, run in this order:\n\n1. \`010_all_migrations_in_order.sql\` for a blank project, or \`015_latest_20260727_delta.sql\` for an already-baselined project.\n2. \`050_seed_reference_data.sql\`.\n3. Use \`020_rls_rbac.sql\`, \`030_rpc_functions.sql\`, and \`040_storage_realtime_cron_extensions.sql\` as audit/repair files, because the migration bundle already contains those statements in context.\n\n## Counts\n\n- Migrations: ${migrationCount}\n- Latest 20260727 migrations: ${latestCount}\n- RLS/RBAC statements: ${rlsCount}\n- RPC/function statements: ${rpcCount}\n- Storage/realtime/cron/extension statements: ${infraCount}\n- Edge Functions: ${edgeFunctionCount}\n\n## Manual Supabase Dashboard Steps\n\nThese are not fully transferable as SQL files:\n\n- Auth provider settings\n- Auth redirect URLs\n- Email/SMS templates and SMTP config\n- Edge Function secret values\n- Storage bucket public/private dashboard flags, if not already represented in SQL\n- Production API keys in hosting/provider dashboards\n\n## Verification Queries\n\nRun after each target project is migrated:\n\n\`\`\`sql\nselect id, name, price_monthly, is_active from public.plans order by id;\nselect plan_id, count(*) from public.organizations group by plan_id order by plan_id;\nselect plan_id, count(*) from public.locations group by plan_id order by plan_id;\nselect routine_name from information_schema.routines where routine_schema = 'public' order by routine_name limit 20;\nselect schemaname, tablename, policyname from pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname limit 50;\n\`\`\`\n\nExpected plan model: \`custom\` only for the public commercial plan model. Old \`free\`, \`starter\`, \`starter-ai\`, and \`advanced\` should not be active plan rows.\n`;
  fs.writeFileSync(path.join(outputDir, 'README.md'), readme);
}

fs.mkdirSync(outputDir, { recursive: true });

const migrations = readSqlFiles(migrationsDir);
writeCombinedMigrations(migrations);
const latestCount = writeLatestDelta(migrations);

const rls = extractStatements(migrations, isRlsRbac);
const rpc = extractStatements(migrations, isRpc);
const infra = extractStatements(migrations, isInfra);

fs.writeFileSync(path.join(outputDir, '020_rls_rbac.sql'), formatExtract('Extracted RLS, RBAC, grants, and security mode statements', rls));
fs.writeFileSync(path.join(outputDir, '030_rpc_functions.sql'), formatExtract('Extracted RPC function and procedure statements', rpc));
fs.writeFileSync(path.join(outputDir, '040_storage_realtime_cron_extensions.sql'), formatExtract('Extracted storage, realtime, cron, pg_net, and extension statements', infra));

fs.copyFileSync(seedFile, path.join(outputDir, '050_seed_reference_data.sql'));

const edgeFunctionCount = writeEdgeFunctionDocs();

fs.writeFileSync(path.join(outputDir, 'migration_manifest.json'), JSON.stringify({
  generated_at: today,
  migration_count: migrations.length,
  migrations: migrations.map(({ file, size, modified }) => ({ file, size, modified })),
}, null, 2));

fs.writeFileSync(path.join(outputDir, 'extract_summary.json'), JSON.stringify({
  generated_at: today,
  migration_count: migrations.length,
  results: [
    { target: '020_rls_rbac.sql', count: rls.count, sourceCount: rls.byFile.length },
    { target: '030_rpc_functions.sql', count: rpc.count, sourceCount: rpc.byFile.length },
    { target: '040_storage_realtime_cron_extensions.sql', count: infra.count, sourceCount: infra.byFile.length },
    { target: '060_edge_functions.md', count: edgeFunctionCount, sourceCount: edgeFunctionCount },
  ],
}, null, 2));

writeReadme({
  migrationCount: migrations.length,
  latestCount,
  rlsCount: rls.count,
  rpcCount: rpc.count,
  infraCount: infra.count,
  edgeFunctionCount,
});

console.log(JSON.stringify({
  outputDir,
  migrationCount: migrations.length,
  latestCount,
  rlsCount: rls.count,
  rpcCount: rpc.count,
  infraCount: infra.count,
  edgeFunctionCount,
}, null, 2));
