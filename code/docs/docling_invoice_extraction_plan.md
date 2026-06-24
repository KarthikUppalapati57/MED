# Docling Invoice Extraction Plan

Last updated: 2026-06-24

## Goal

Keep invoice extraction fast by continuing with the existing Docling + Gemini pipeline instead of replacing it with a heavier multi-agent workflow.

Expected fast-path latency after deployment: 10-45 seconds per invoice, depending on file size, page count, scan quality, Docling cold start, and Gemini response time.

## Production API URL

https://mevs-docling-backend-mi4ztik6eq-uc.a.run.app

Health endpoint: GET /health`r
Extraction endpoint: POST /extract-invoice`r

Supabase secret configured: PYTHON_BACKEND_URL`r

## Target Production Flow

1. User uploads an invoice from the Vercel frontend.
2. The file is stored in the private Supabase `invoices` bucket.
3. An invoice row is created or updated with `status = 'extracting'`.
4. The Supabase `invoice-processing` Edge Function downloads the file with the service role client.
5. The Edge Function posts the file to the deployed Python Docling backend at `PYTHON_BACKEND_URL`.
6. The Python backend runs Docling to convert the invoice to Markdown.
7. Gemini normalizes the Markdown into structured invoice JSON.
8. The Edge Function writes normalized fields back to the invoice row and moves it to `status = 'pending_review'`.
9. If extraction fails, the invoice moves to `status = 'extract_failed'` and `ap_status = 'action_required'`.

## Deployment Steps

1. Deploy `code/backend` as a Python web service.
   - Recommended: Google Cloud Run.
   - Also acceptable: Railway, Render, or Fly.io.
   - The service must expose `POST /extract-invoice` and `GET /health`.

2. Configure backend environment variables.
   - `GOOGLE_API_KEY` or `VERTEX_API_KEY`: required for Gemini normalization.
   - `POSTHOG_API_KEY`: optional telemetry.
   - `POSTHOG_HOST`: optional telemetry host.

3. Verify the backend health endpoint.
   - `GET https://<docling-service-url>/health`
   - Expected response: `{ "status": "ok", "engine": "docling" }`

4. Set the Supabase Edge Function secret.
   - `supabase secrets set PYTHON_BACKEND_URL=https://<docling-service-url>`

5. Redeploy Supabase Edge Functions.
   - `npm run deploy:edge-functions`

6. Upload a real test invoice.
   - Confirm status transitions from `extracting` to `pending_review`.
   - Confirm `extraction_method = 'docling+gemini'`.
   - Confirm `raw_text`, totals, vendor, invoice number, and line items are populated.

## Guardrails Added

The `invoice-processing` Edge Function now requires `PYTHON_BACKEND_URL` in deployed environments. It only falls back to `http://127.0.0.1:8000` when `SUPABASE_URL` points to localhost or 127.0.0.1.

This prevents production extraction from silently trying to call localhost inside Supabase Edge runtime.

## Validation Checklist

- Backend `/health` returns `ok`.
- Supabase has `PYTHON_BACKEND_URL` configured.
- Edge function deploy succeeds.
- One PDF invoice extracts successfully.
- One image invoice extracts successfully if image invoices are expected.
- One bad/unsupported file marks invoice as `extract_failed`.
- Debug logs include `invoking_docling_backend` and either `docling_response_success` or a clear error.


## Local Docker Validation Results

Validated on 2026-06-24 with Docker Desktop.

- Local image builds successfully as `mevs-docling-backend:local`.
- `/health` returns `{ "status": "ok", "engine": "docling" }`.
- A synthetic digital PDF invoice extracted successfully through `POST /extract-invoice`.
- With the current local Gemini key blocked, the backend falls back to `docling+regex` instead of failing the invoice.
- First request after container restart was slow because Docling loaded model weights from Hugging Face.
- Immediate warm extraction completed in about 3.2 seconds for the synthetic PDF.
- Current image disk usage is about 9.63 GB because unpinned Docling dependencies pull a full Torch/CUDA stack.

Production implication: deploy with a warm-instance strategy and then optimize dependencies before scaling broadly.

## Known Production Risks

1. `GOOGLE_API_KEY` / `VERTEX_API_KEY` must be allowed to call Gemini. The current local key returned `API_KEY_SERVICE_BLOCKED` for `generativelanguage.googleapis.com`.
2. Cold starts are too slow for user-facing invoice upload unless the service is kept warm.
3. The current Docker image is too large for comfortable production operations. Pin or slim Python dependencies before high-volume use.
4. Digital PDFs are now configured for fast text extraction with Docling OCR disabled. Scanned PDFs and image invoices still need an explicit OCR strategy.

## Next Improvements

1. Add an `invoice_processing_logs` table instead of relying only on `debug_logs`.
2. Add retry with backoff for transient Docling/backend failures.
3. Add extraction duration metrics from upload to `pending_review`.
4. Add vendor-specific correction rules for recurring bad formats.
5. Add duplicate invoice detection before approval.