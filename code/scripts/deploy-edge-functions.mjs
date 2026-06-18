import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const defaultFunctions = [
  'process-email-invoices',
  'pos-webhook',
  'webhook-dispatcher',
];

const requestedFunctions = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const functionsToDeploy = requestedFunctions.length ? requestedFunctions : defaultFunctions;
const projectRef = process.env.SUPABASE_PROJECT_REF
  || (existsSync('supabase/.temp/project-ref') ? readFileSync('supabase/.temp/project-ref', 'utf8').trim() : '');

if (!projectRef) {
  console.error('Missing Supabase project ref. Set SUPABASE_PROJECT_REF or run supabase link.');
  process.exit(1);
}

const args = [
  'functions',
  'deploy',
  ...functionsToDeploy,
  '--project-ref',
  projectRef,
  '--use-api',
  '--no-verify-jwt',
];

console.log(`Deploying Supabase Edge Functions to ${projectRef}: ${functionsToDeploy.join(', ')}`);

const child = spawn('supabase', args, {
  cwd: process.cwd(),
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Failed to start Supabase CLI: ${error.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  if (code === 0) {
    console.log('Edge Function deployment completed.');
    process.exit(0);
  }

  console.error(`Edge Function deployment failed with exit code ${code}.`);
  console.error('If the CLI reports 401 Unauthorized, run supabase login or set SUPABASE_ACCESS_TOKEN with a token that can deploy this project.');
  process.exit(code || 1);
});
