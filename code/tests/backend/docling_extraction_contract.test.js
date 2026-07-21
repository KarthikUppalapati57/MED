import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('Azure invoice extraction deployment contract', () => {
  it('requires Azure Document Intelligence and Azure OpenAI configuration in the Edge Function', () => {
    const edgeSource = read('supabase/functions/invoice-processing/index.ts');

    expect(edgeSource).toContain('async function extractWithAzureDocumentIntelligence(fileBlob)');
    expect(edgeSource).toContain("Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')?.trim()?.replace(/\\/+$/, '')");
    expect(edgeSource).toContain("Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')?.trim()");
    expect(edgeSource).toContain("Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_MODEL')?.trim() || 'prebuilt-invoice'");
    expect(edgeSource).toContain("Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_API_VERSION')?.trim() || '2024-11-30'");
    expect(edgeSource).toContain('Azure Document Intelligence is not configured.');
    expect(edgeSource).toContain('Azure Document Intelligence did not return Operation-Location.');

    expect(edgeSource).toContain('async function mapWithAzureOpenAI(compactExtraction)');
    expect(edgeSource).toContain("Deno.env.get('AZURE_OPENAI_ENDPOINT')?.trim()?.replace(/\\/+$/, '')");
    expect(edgeSource).toContain("Deno.env.get('AZURE_OPENAI_API_KEY')?.trim()");
    expect(edgeSource).toContain("Deno.env.get('AZURE_OPENAI_DEPLOYMENT')?.trim()");
    expect(edgeSource).toContain("Deno.env.get('AZURE_OPENAI_API_VERSION')?.trim() || 'v1'");
    expect(edgeSource).toContain('Azure OpenAI is not configured.');
  });

  it('uses the Azure extraction path and no longer relies on a Python backend URL fallback', () => {
    const edgeSource = read('supabase/functions/invoice-processing/index.ts');

    expect(edgeSource).toContain('const azureDocumentResult = await extractWithAzureDocumentIntelligence(fileBlob);');
    expect(edgeSource).toContain('compactExtraction = simplifyAzureDocumentIntelligenceResult(azureDocumentResult);');
    expect(edgeSource).toContain('const mappedResult = await mapWithAzureOpenAI(compactExtraction);');
    expect(edgeSource).toContain("extraction_method: extractionMethod");
    expect(edgeSource).not.toContain("Deno.env.get('PYTHON_BACKEND_URL') || 'http://127.0.0.1:8000'");
    expect(edgeSource).not.toContain('function getDoclingBackendUrl()');
  });
});