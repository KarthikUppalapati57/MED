import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Docling extraction deployment contract', () => {
  it('requires the deployed Docling backend URL outside local Supabase development', () => {
    const edgeSource = read('supabase/functions/invoice-processing/index.ts');

    expect(edgeSource).toContain('function getDoclingBackendUrl()');
    expect(edgeSource).toContain("Deno.env.get('PYTHON_BACKEND_URL')?.trim()");
    expect(edgeSource).toContain("return configuredUrl.replace(/\\/+$/, '')");
    expect(edgeSource).toContain("supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost')");
    expect(edgeSource).toContain("if (isLocalSupabase) return 'http://127.0.0.1:8000'");
    expect(edgeSource).toContain('PYTHON_BACKEND_URL is required for deployed invoice extraction.');
    expect(edgeSource).not.toContain("Deno.env.get('PYTHON_BACKEND_URL') || 'http://127.0.0.1:8000'");
  });

  it('keeps the extraction service deployable as a standalone Python web service', () => {
    const dockerfile = read('backend/Dockerfile');
    const main = read('backend/main.py');
    const requirements = read('backend/requirements.txt');
    const runbook = read('docs/docling_invoice_extraction_plan.md');

    expect(requirements).toContain('docling');
    expect(requirements).toContain('fastapi');
    expect(dockerfile).toContain('FROM python:3.11-slim');
    expect(dockerfile).toContain('ENV PORT=8080');
    expect(dockerfile).toContain('uvicorn main:app --host 0.0.0.0 --port ${PORT}');
    expect(main).toContain('@app.get("/health")');
    expect(main).toContain('@app.post("/extract-invoice")');
    expect(runbook).toContain('supabase secrets set PYTHON_BACKEND_URL=https://<docling-service-url>');
  });
});