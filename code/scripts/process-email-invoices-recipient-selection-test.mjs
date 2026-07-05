import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('supabase/functions/process-email-invoices/index.ts', 'utf8');
const start = source.indexOf('const EMAIL_PATTERN');
const end = source.indexOf('async function selectMatchedRecipient');
if (start === -1 || end === -1) {
  throw new Error('Could not locate recipient helper block');
}

const helperSource = source
  .slice(start, end)
  .replaceAll('export function ', 'function ')
  + '\nthis.extractRecipientCandidates = extractRecipientCandidates;';

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(helperSource, sandbox);

const parsed = {
  to: { text: 'Vendor AP <vendor-list@example.test>' },
  cc: { value: [{ address: 'Cc-Alias@Example.Test' }] },
  headers: new Map([
    ['delivered-to', 'Choto-Invoices@Example.Test'],
    ['x-original-to', 'Original-Choto@Example.Test'],
    ['envelope-to', 'Envelope-Choto@Example.Test'],
  ]),
};

const actual = sandbox.extractRecipientCandidates(parsed, 'Mailbox@Example.Test');
const expected = [
  'vendor-list@example.test',
  'cc-alias@example.test',
  'choto-invoices@example.test',
  'original-choto@example.test',
  'envelope-choto@example.test',
  'mailbox@example.test',
];

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error('Expected:', expected);
  console.error('Actual:  ', actual);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, candidates: actual }, null, 2));