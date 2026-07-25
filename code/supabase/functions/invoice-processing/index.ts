// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Buffer } from 'node:buffer'
import { getSupabaseAuthAdminClient, getSupabaseClient } from '../_shared/supabase.ts'
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(value) {
  const parsed = parseMoney(value);
  return parsed === null ? null : parsed;
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim();
  return cleaned.length ? cleaned : null;
}

function normalizeDate(value) {
  const raw = cleanString(value);
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const us = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (us) {
    let [, m, d, y] = us;
    if (y.length === 2) y = Number(y) > 70 ? `19${y}` : `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function firstValue(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned !== null) return cleaned;
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = parseMoney(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function normalizeCompactValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function fieldValue(field) {
  if (!field || typeof field !== 'object') return null;
  for (const key of ['valueString', 'valueDate', 'valueTime', 'valuePhoneNumber', 'valueNumber', 'valueInteger', 'valueCurrency']) {
    if (Object.prototype.hasOwnProperty.call(field, key)) {
      const value = field[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'amount')) return value.amount;
      return value;
    }
  }
  return field.content ?? null;
}

function compactField(field) {
  if (!field || typeof field !== 'object') return null;
  const value = fieldValue(field);
  const compact = {
    value,
    confidence: field.confidence ?? null,
  };
  if (field.content !== undefined && normalizeCompactValue(field.content) !== normalizeCompactValue(value)) {
    compact.content = field.content;
  }
  return compact;
}

function compactTable(table) {
  const rowCount = table?.rowCount || 0;
  const columnCount = table?.columnCount || 0;
  const rows = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => null));
  for (const cell of table?.cells || []) {
    if (Number.isInteger(cell.rowIndex) && Number.isInteger(cell.columnIndex) && cell.rowIndex < rowCount && cell.columnIndex < columnCount) {
      rows[cell.rowIndex][cell.columnIndex] = cell.content || null;
    }
  }
  return { row_count: rowCount, column_count: columnCount, rows };
}

function headerPairsFromTables(tables = [], maxTables = 4) {
  const pairs = [];
  for (const [tableIndex, table] of tables.slice(0, maxTables).entries()) {
    const compact = compactTable(table);
    if (compact.rows.length < 2) continue;
    const header = compact.rows[0];
    const values = compact.rows[1];
    if (header.filter(Boolean).length < 2) continue;

    header.forEach((label, columnIndex) => {
      if (!label) return;
      pairs.push({
        label,
        value: values[columnIndex] || null,
        table_index: tableIndex,
        column_index: columnIndex,
      });
    });
  }
  return pairs;
}

function compactLineItems(fields = {}) {
  const items = fields.Items?.valueArray || [];
  return items.map((item) => {
    const itemFields = item?.valueObject || {};
    const compactItem = {};
    const fieldConfidence = {};

    for (const [name, value] of Object.entries(itemFields)) {
      const compact = compactField(value);
      if (!compact) continue;
      compactItem[name] = compact.value;
      if (compact.content !== undefined) compactItem[`${name}_content`] = compact.content;
      if (compact.confidence !== null && compact.confidence !== undefined) fieldConfidence[name] = compact.confidence;
    }

    if (Object.keys(fieldConfidence).length) compactItem.field_confidence = fieldConfidence;
    return compactItem;
  }).filter((item) => Object.keys(item).length > 0);
}

function compactHeaderLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function findHeaderColumn(headers = [], patterns = []) {
  return headers.findIndex((header) => patterns.some((pattern) => pattern.test(compactHeaderLabel(header))));
}

function rowCell(row = [], index) {
  if (!Number.isInteger(index) || index < 0) return null;
  return cleanString(row[index]);
}

function tableHeaderCandidates(rows = []) {
  const candidates = [];
  const maxHeaderStart = Math.min(rows.length, 6);

  for (let start = 0; start < maxHeaderStart; start += 1) {
    for (const span of [1, 2, 3]) {
      const headerRows = rows.slice(start, start + span);
      if (!headerRows.length) continue;
      const columnCount = Math.max(...headerRows.map((row) => row.length), 0);
      const headers = Array.from({ length: columnCount }, (_, columnIndex) => {
        const parts = [];
        for (const row of headerRows) {
          const value = cleanString(row[columnIndex]);
          if (value && !parts.some((part) => compactHeaderLabel(part) === compactHeaderLabel(value))) {
            parts.push(value);
          }
        }
        return parts.join(' ');
      });
      candidates.push({ start, span, headers });
    }
  }

  return candidates;
}

function extractTableLineItems(tables = []) {
  const codePatterns = [/product.*number/, /product.*code/, /item.*number/, /item\s*#/, /\bsku\b/, /\bsupc\b/, /vendor.*item/, /^code$/];
  const descriptionPatterns = [/description/, /item.*description/, /product.*description/, /^name$/];
  const quantityPatterns = [/\bshp\b/, /ship/, /shipped/, /quantity/, /\bqty\b/, /\bord\b/, /ordered/];
  const unitPatterns = [/sales.*unit/, /pricing.*unit/, /\buom\b/, /^unit$/];
  const unitPricePatterns = [/unit.*price/, /price/];
  const extendedPricePatterns = [/extended.*price/, /ext.*amount/, /line.*total/, /total/, /amount/];
  const packPatterns = [/pack.*size/, /^pack$/, /\bsize\b/];
  const labelPatterns = [/^label$/, /brand/, /manufacturer/, /mfr/];
  const sectionPatterns = /^(refrigerated|frozen|dry|produce|meat|seafood|dairy|beverage|delivery summary|invoice line details)$/i;
  const results = [];

  for (const [tableIndex, table] of tables.entries()) {
    const compact = compactTable(table);
    if (!compact.rows.length) continue;

    let selected = null;
    for (const candidate of tableHeaderCandidates(compact.rows)) {
      const columns = {
        code: findHeaderColumn(candidate.headers, codePatterns),
        description: findHeaderColumn(candidate.headers, descriptionPatterns),
        quantity: findHeaderColumn(candidate.headers, quantityPatterns),
        unit: findHeaderColumn(candidate.headers, unitPatterns),
        unit_price: findHeaderColumn(candidate.headers, unitPricePatterns),
        extended_price: findHeaderColumn(candidate.headers, extendedPricePatterns),
        pack_size: findHeaderColumn(candidate.headers, packPatterns),
        label: findHeaderColumn(candidate.headers, labelPatterns),
      };
      if (columns.description >= 0 && (columns.code >= 0 || columns.unit_price >= 0 || columns.extended_price >= 0)) {
        selected = { ...candidate, columns };
        break;
      }
    }

    if (!selected) continue;

    for (let rowIndex = selected.start + selected.span; rowIndex < compact.rows.length; rowIndex += 1) {
      const row = compact.rows[rowIndex] || [];
      const description = rowCell(row, selected.columns.description);
      const vendorItemCode = rowCell(row, selected.columns.code);
      const unitPrice = rowCell(row, selected.columns.unit_price);
      const extendedPrice = rowCell(row, selected.columns.extended_price);
      const packSize = rowCell(row, selected.columns.pack_size);
      const label = rowCell(row, selected.columns.label);

      if (!description && !vendorItemCode) continue;
      if (description && sectionPatterns.test(description) && !vendorItemCode && !unitPrice && !extendedPrice) continue;
      if (!vendorItemCode && !unitPrice && !extendedPrice && !packSize && !label) continue;

      results.push({
        source_table_index: tableIndex,
        source_row_index: rowIndex,
        vendor_item_code: vendorItemCode,
        description,
        quantity: firstNumber(rowCell(row, selected.columns.quantity)),
        unit: rowCell(row, selected.columns.unit),
        unit_price: firstNumber(unitPrice),
        extended_price: firstNumber(extendedPrice),
        pack_size: packSize,
        label,
      });
    }
  }

  return results;
}

function relevantContentSnippets(content = '', maxChars = 2500) {
  const patterns = /invoice|vendor|supplier|account|customer|purchase|po\b|order|terms|due|subtotal|tax|freight|fuel|delivery|total|amount|balance|remit|payment|\$/i;
  const snippets = [];
  let used = 0;

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line || !patterns.test(line)) continue;
    if (used + line.length + 1 > maxChars) break;
    snippets.push(line);
    used += line.length + 1;
  }

  return snippets;
}

function simplifyAzureDocumentIntelligenceResult(adiResult) {
  const analyze = adiResult?.analyzeResult || {};
  const doc = (analyze.documents || [])[0] || {};
  const fields = doc.fields || {};
  const headerFields = {};
  const tableLineItems = extractTableLineItems(analyze.tables || []);

  for (const [name, value] of Object.entries(fields)) {
    if (['Items', 'TaxDetails'].includes(name)) continue;
    const compact = compactField(value);
    if (compact) headerFields[name] = compact;
  }

  return {
    status: adiResult?.status,
    document_type: doc.docType || 'invoice',
    page_count: Array.isArray(analyze.pages) ? analyze.pages.length : null,
    header_fields: headerFields,
    header_table_pairs: headerPairsFromTables(analyze.tables || []),
    line_items: compactLineItems(fields),
    table_line_items: tableLineItems,
    content_snippets: relevantContentSnippets(analyze.content || ''),
    compaction_notes: [
      'Dropped pages, boundingRegions, spans, polygons, styles, full raw content, and full table metadata.',
      'Use header_table_pairs to resolve conflicts between ADI prebuilt fields and visible table/header cells.',
      'Use table_line_items for exact row values such as vendor_item_code, pack_size, and label when prebuilt Items misses them.',
      'Keep distinct document identifiers separate: invoice_number, account_number, customer_number, order_number, purchase_order_number.',
    ],
  };
}

async function extractWithAzureDocumentIntelligence(fileBlob) {
  const endpoint = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')?.trim()?.replace(/\/+$/, '');
  const key = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_KEY')?.trim();
  const model = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_MODEL')?.trim() || 'prebuilt-invoice';
  const apiVersion = Deno.env.get('AZURE_DOCUMENT_INTELLIGENCE_API_VERSION')?.trim() || '2024-11-30';

  if (!endpoint || !key) throw new Error('Azure Document Intelligence is not configured.');

  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${encodeURIComponent(model)}:analyze?api-version=${encodeURIComponent(apiVersion)}`;
  const analyzeResponse = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': fileBlob.type || 'application/pdf',
    },
    body: fileBlob,
  });

  if (!analyzeResponse.ok) {
    throw new Error(`Azure Document Intelligence submit failed: ${analyzeResponse.status} ${await analyzeResponse.text()}`);
  }

  const operationUrl = analyzeResponse.headers.get('Operation-Location');
  if (!operationUrl) throw new Error('Azure Document Intelligence did not return Operation-Location.');

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const pollResponse = await fetch(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });
    if (!pollResponse.ok) {
      throw new Error(`Azure Document Intelligence poll failed: ${pollResponse.status} ${await pollResponse.text()}`);
    }
    const result = await pollResponse.json();
    if (!['notStarted', 'running'].includes(result.status)) {
      if (result.status !== 'succeeded') throw new Error(`Azure Document Intelligence failed: ${JSON.stringify(result).slice(0, 1500)}`);
      return result;
    }
  }

  throw new Error('Azure Document Intelligence timed out.');
}

async function mapWithAzureOpenAI(compactExtraction) {
  const endpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT')?.trim()?.replace(/\/+$/, '');
  const key = Deno.env.get('AZURE_OPENAI_API_KEY')?.trim();
  const deployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT')?.trim();
  const apiVersion = Deno.env.get('AZURE_OPENAI_API_VERSION')?.trim() || 'v1';

  if (!endpoint || !key || !deployment) throw new Error('Azure OpenAI is not configured.');

  const systemPrompt = `
    You are an expert AP invoice data extractor for restaurant supplier invoices.
    Extract every visible header field and every invoice line from the provided extraction data.
    Return STRICT JSON only. No markdown fences. Use this exact shape:
    {
      "vendor_name": "string or null",
      "invoice_number": "string or null",
      "account_number": "string or null",
      "customer_number": "string or null",
      "invoice_date": "YYYY-MM-DD or MM/DD/YYYY or null",
      "due_date": "YYYY-MM-DD or MM/DD/YYYY or null",
      "payment_terms": "string or null",
      "subtotal": 0.0,
      "tax_amount": 0.0,
      "fuel_surcharge": 0.0,
      "delivery_fee": 0.0,
      "other_charges": 0.0,
      "total_amount": 0.0,
      "payment_status": "paid, unpaid, or unknown",
      "paid_status_detection": {
        "detected": true,
        "confidence": 0.0,
        "evidence": "visible paid stamp/check/payment confirmation text, or null",
        "should_mark_paid": true
      },
      "line_items": [
        {
          "vendor_item_code": "product/item number as printed",
          "description": "full item description",
          "quantity": 0,
          "unit": "CS/EA/LB/etc from pricing unit or UOM",
          "unit_price": 0.0,
          "extended_price": 0.0,
          "pack_size": "pack size if visible",
          "label": "brand/label if visible",
          "ai_confidence": 0.0
        }
      ]
    }
    For line-item tables, use shipped/invoiced quantity, product/item code, label/brand, pack size, pricing unit, unit price, and extended price when visible.
    Include all line rows across all pages, excluding subtotal/summary/footer rows.
    If the invoice visibly says PAID, paid by check, paid by ACH, balance due 0, payment received, or contains a payment confirmation,
    set payment_status to paid and paid_status_detection.should_mark_paid to true. If no paid signal is visible, set payment_status to unpaid.
  `;

  let url;
  const body = {
    model: deployment,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: JSON.stringify(compactExtraction),
      },
    ],
    max_completion_tokens: 12000,
  };

  if (apiVersion.toLowerCase() === 'v1') {
    url = endpoint.endsWith('/openai/v1') ? `${endpoint}/chat/completions` : `${endpoint}/openai/v1/chat/completions`;
  } else {
    url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
    delete body.model;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Azure OpenAI mapping failed: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Azure OpenAI mapping returned no content.');

  const cleanJson = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  return {
    data: JSON.parse(cleanJson),
    rawText: content,
    usage: payload.usage || null,
  };
}

function vendorPrefix(vendorName) {
  const cleaned = String(vendorName || 'VENDOR').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned || 'VENDOR').slice(0, 12);
}

function dateCompact(value) {
  const normalized = normalizeDate(value);
  if (!normalized) return null;
  return normalized.replace(/-/g, '');
}

function generatedInvoiceNumber(normalized, record) {
  const datePart = dateCompact(normalized.invoice_date) || dateCompact(normalized.due_date) || dateCompact(record.created_at) || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const shortId = String(record.id || crypto.randomUUID()).replace(/-/g, '').slice(0, 6).toUpperCase();
  return `${vendorPrefix(normalized.vendor_name || record.vendor_name)}${datePart}${shortId}`;
}

function normalizeMatchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function descriptionsLikelyMatch(left, right) {
  const a = normalizeMatchText(left);
  const b = normalizeMatchText(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aPrefix = a.slice(0, 24);
  const bPrefix = b.slice(0, 24);
  return aPrefix.length >= 12 && bPrefix.length >= 12 && (aPrefix.includes(bPrefix) || bPrefix.includes(aPrefix));
}

function backfillLineItemsFromTables(data = {}, tableLineItems = []) {
  if (!Array.isArray(data.line_items) || !Array.isArray(tableLineItems) || !tableLineItems.length) return data;

  const usableTableItems = tableLineItems.filter((item) =>
    cleanString(item?.description) ||
    cleanString(item?.vendor_item_code) ||
    cleanString(item?.pack_size) ||
    cleanString(item?.label)
  );
  const usedTableIndexes = new Set();

  const enrichedLineItems = data.line_items.map((lineItem, index) => {
    const needsCode = !cleanString(lineItem?.vendor_item_code) && !cleanString(lineItem?.product_number);
    const needsPack = !cleanString(lineItem?.pack_size) && !cleanString(lineItem?.PackSize) && !cleanString(lineItem?.pack);
    const needsLabel = !cleanString(lineItem?.label) && !cleanString(lineItem?.Label) && !cleanString(lineItem?.brand);
    if (!needsCode && !needsPack && !needsLabel) return lineItem;

    const description = firstValue(
      lineItem?.description,
      lineItem?.Description,
      lineItem?.item_description,
      lineItem?.vendor_item_description,
      lineItem?.product_description,
      lineItem?.name
    );

    let tableIndex = usableTableItems.findIndex((tableItem, candidateIndex) =>
      !usedTableIndexes.has(candidateIndex) && descriptionsLikelyMatch(description, tableItem.description)
    );
    if (tableIndex < 0 && usableTableItems[index]) tableIndex = index;

    const tableItem = tableIndex >= 0 ? usableTableItems[tableIndex] : null;
    if (!tableItem) return lineItem;
    usedTableIndexes.add(tableIndex);

    return {
      ...lineItem,
      vendor_item_code: cleanString(lineItem?.vendor_item_code) || cleanString(lineItem?.product_number) || cleanString(tableItem.vendor_item_code) || lineItem?.vendor_item_code,
      product_number: cleanString(lineItem?.product_number) || cleanString(tableItem.vendor_item_code) || lineItem?.product_number,
      pack_size: cleanString(lineItem?.pack_size) || cleanString(tableItem.pack_size) || lineItem?.pack_size,
      label: cleanString(lineItem?.label) || cleanString(tableItem.label) || lineItem?.label,
      unit: cleanString(lineItem?.unit) || cleanString(tableItem.unit) || lineItem?.unit,
      unit_price: firstNumber(lineItem?.unit_price, tableItem.unit_price) ?? lineItem?.unit_price,
      extended_price: firstNumber(lineItem?.extended_price, tableItem.extended_price) ?? lineItem?.extended_price,
    };
  });

  return { ...data, line_items: enrichedLineItems };
}

function mapLineItemsForRpc(lineItems = []) {
  return lineItems.map((item) => ({
    item_name: item.description || item.item_name || '',
    quantity: parseQuantity(item.quantity) || 0,
    unit_price: firstNumber(item.unit_price, item.price) || 0,
    total_price: firstNumber(item.extended_price, item.total_price, item.amount) || 0,
    vendor_item_code: item.vendor_item_code || item.product_number || '',
    vendor_unit: item.unit || item.vendor_unit || '',
    pack_size: item.pack_size || '',
    label: item.label || '',
  })).filter((item) => item.item_name || item.vendor_item_code);
}
function normalizeLineItem(item = {}) {
  const quantity = firstNumber(
    item.quantity,
    item.Quantity,
    item.qty,
    item.Qty,
    item.shipped_quantity,
    item.ShippedQuantity,
    item.shipped_qty,
    item.ShippedQty,
    item.invoice_quantity,
    item.InvoiceQuantity,
    item.invoice_qty,
    item.InvoiceQty,
    item.order_quantity,
    item.OrderQuantity,
    item.order_qty,
    item.OrderQty
  );
  const unitPrice = firstNumber(item.unit_price, item.UnitPrice, item.price, item.Price, item.pricing_unit_price, item.invoice_unit_price);
  const extendedPrice = firstNumber(item.extended_price, item.ExtendedPrice, item.extended, item.total_price, item.TotalPrice, item.line_total, item.LineTotal, item.amount, item.Amount);

  return {
    vendor_item_code: firstValue(
      item.vendor_item_code,
      item.product_code,
      item.ProductCode,
      item.product_number,
      item.ProductNumber,
      item.item_number,
      item.ItemNumber,
      item.item_code,
      item.ItemCode,
      item.product_id,
      item.ProductId,
      item.sku,
      item.SKU,
      item.supc,
      item.SUPC,
      item.code,
      item.Code
    ) || '',
    description: firstValue(item.description, item.Description, item.item_description, item.vendor_item_description, item.product_description, item.ProductDescription, item.name, item.Name) || '',
    quantity: quantity ?? '',
    unit: firstValue(item.unit, item.Unit, item.pricing_unit, item.PricingUnit, item.uom, item.UOM, item.unit_of_measure) || '',
    unit_price: unitPrice ?? '',
    discount: firstNumber(item.discount, item.Discount) ?? 0,
    adjustment: firstNumber(item.adjustment, item.Adjustment) ?? 0,
    extended_price: extendedPrice ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : 0),
    pack_size: firstValue(item.pack_size, item.PackSize, item.pack, item.Pack, item.size, item.Size) || '',
    label: firstValue(item.label, item.Label, item.brand, item.Brand) || '',
    ai_confidence: firstNumber(item.ai_confidence, item.confidence) ?? null,
  };
}

function normalizeExtraction(data = {}) {
  const lineItems = Array.isArray(data.line_items) ? data.line_items.map(normalizeLineItem) : [];
  const subtotal = firstNumber(data.subtotal, data.invoice_subtotal, data.merchandise_total);
  const taxAmount = firstNumber(data.tax_amount, data.tax, data.sales_tax);
  const fuelSurcharge = firstNumber(data.fuel_surcharge, data.fuel_charge);
  const deliveryFee = firstNumber(data.delivery_fee, data.freight, data.freight_amount, data.delivery_charge);
  const otherCharges = firstNumber(data.other_charges, data.misc_charges, data.other_amount);
  const totalAmount = firstNumber(data.total_amount, data.invoice_total, data.grand_total, data.amount_due);
  const paidDetectionInput = data.paid_status_detection || {};
  const explicitPaymentStatus = cleanString(data.payment_status)?.toLowerCase();
  const confidence = firstNumber(paidDetectionInput.confidence, paidDetectionInput.ai_confidence);
  const paidDetection = {
    detected: Boolean(paidDetectionInput.detected || explicitPaymentStatus === 'paid'),
    confidence: confidence ?? null,
    evidence: firstValue(paidDetectionInput.evidence, paidDetectionInput.reason, data.payment_status_evidence),
    should_mark_paid: Boolean(
      paidDetectionInput.should_mark_paid ||
      explicitPaymentStatus === 'paid' ||
      (paidDetectionInput.detected && confidence !== null && confidence >= 0.85)
    ),
  };

  return {
    vendor_name: firstValue(data.vendor_name, data.supplier_name, data.remit_to_name),
    invoice_number: firstValue(data.invoice_number, data.invoice_no, data.invoice_id),
    account_number: firstValue(data.account_number, data.customer_number, data.customer_id, data.customer_account_number),
    customer_number: firstValue(data.customer_number, data.customer_id, data.customer_account_number),
    order_number: firstValue(data.order_number, data.order_no, data.sales_order_number),
    purchase_order_number: firstValue(data.purchase_order_number, data.purchase_order, data.po_number, data.po),
    vendor_address: firstValue(data.vendor_address, data.supplier_address, data.remit_to_address),
    invoice_date: normalizeDate(data.invoice_date),
    due_date: normalizeDate(data.due_date),
    payment_terms: firstValue(data.payment_terms, data.terms),
    subtotal,
    tax_amount: taxAmount,
    fuel_surcharge: fuelSurcharge,
    delivery_fee: deliveryFee,
    other_charges: otherCharges,
    total_amount: totalAmount,
    line_items: lineItems,
    payment_status: paidDetection.should_mark_paid ? 'paid' : 'unpaid',
    paid_status_detection: paidDetection.detected ? paidDetection : null,
    validation: data.validation || null,
  };
}

// Background processing function
async function processInvoiceBackground(record, supabaseClient) {
  try {
    console.log(`Starting background extraction for ${record.id} in public schema...`);

    const { data: claimedInvoice, error: claimError } = await supabaseClient
      .from('invoices')
      .update({ extraction_started_at: new Date().toISOString() })
      .eq('id', record.id)
      .eq('organization_id', record.organization_id)
      .eq('status', 'extracting')
      .is('extraction_started_at', null)
      .select('*')
      .maybeSingle();

    if (claimError) {
      throw claimError;
    }

    if (!claimedInvoice) {
      await supabaseClient.from('debug_logs').insert({
        log_data: { point: 'extraction_claim_skipped', invoice_id: record.id }
      });
      console.log(`Skipping extraction for ${record.id}; invoice is already claimed or no longer extracting.`);
      return;
    }

    record = claimedInvoice;
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'start', invoice_id: record.id, schema: 'public', filePath: record.file_url }
    });

    // 1. Securely fetch file from private bucket using service role client
    let filePath = record.file_url;
    if (filePath.includes('invoices/')) {
        filePath = filePath.split('invoices/')[1];
    }
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'downloading', filePath }
    });
    
    // Create service role DB client for storage
    const storageDb = supabaseClient; 
    
    const { data: fileBlob, error: downloadError } = await storageDb.storage.from('invoices').download(filePath);
    if (downloadError) throw new Error(`Failed to download file from private bucket: ${downloadError.message}`);
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'download_success', size: fileBlob.size }
    });

    // 2. Extract with Azure Document Intelligence, then map compact output with Azure OpenAI.
    console.log("Routing file to Azure Document Intelligence for extraction...");
    
    let extractedData;
    let rawText = '';
    let extractionMethod = 'azure_document_intelligence+azure_openai';
    let compactExtraction = null;
    let azureOpenAIUsage = null;

    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'invoking_azure_document_intelligence' }
    });

    const azureDocumentResult = await extractWithAzureDocumentIntelligence(fileBlob);
    compactExtraction = simplifyAzureDocumentIntelligenceResult(azureDocumentResult);

    await supabaseClient.from('debug_logs').insert({
      log_data: {
        point: 'azure_document_intelligence_success',
        page_count: compactExtraction.page_count,
        line_items_count: compactExtraction.line_items?.length || 0
      }
    });

    const mappedResult = await mapWithAzureOpenAI(compactExtraction);
    extractedData = mappedResult.data?.invoice && typeof mappedResult.data.invoice === 'object'
      ? { ...mappedResult.data.invoice, validation: mappedResult.data.validation || mappedResult.data.invoice.validation }
      : mappedResult.data;
    extractedData = backfillLineItemsFromTables(extractedData, compactExtraction.table_line_items || []);
    rawText = JSON.stringify({
      compact_extraction: compactExtraction,
      mapped_invoice: extractedData,
    });
    azureOpenAIUsage = mappedResult.usage;

    await supabaseClient.from('debug_logs').insert({
      log_data: {
        point: 'azure_openai_mapping_success',
        usage: azureOpenAIUsage,
        table_line_items_count: compactExtraction.table_line_items?.length || 0,
      }
    });
// 3. Update invoice with extracted data in the shared public table
    console.log(`Updating invoice ${record.id} to pending_review in public schema...`);
    
    const normalized = normalizeExtraction(extractedData);
    const sourceInvoiceNumber = normalized.invoice_number;
    const finalInvoiceNumber = sourceInvoiceNumber || generatedInvoiceNumber(normalized, record);
    const generatedInvoiceMetadata = sourceInvoiceNumber ? null : {
      generated_invoice_number: true,
      generated_invoice_number_reason: 'missing_source_invoice_number',
      source_invoice_number: null,
      generated_invoice_number_value: finalInvoiceNumber,
      generated_invoice_number_format: 'VENDORYYYYMMDDSHORTID',
    };
    const validationResults = {
      ...(record.validation_results || {}),
      ...(normalized.validation && typeof normalized.validation === 'object' ? { extraction_validation: normalized.validation } : {}),
      ...(normalized.paid_status_detection ? { paid_status_detection: normalized.paid_status_detection } : {}),
      extraction_metadata: {
        ...((record.validation_results || {}).extraction_metadata || {}),
        extraction_method: extractionMethod,
        customer_number: normalized.customer_number || null,
        order_number: normalized.order_number || null,
        vendor_address: normalized.vendor_address || null,
        azure_openai_usage: azureOpenAIUsage || null,
        ...(generatedInvoiceMetadata || {}),
      },
    };

    const updatePayload = {
      vendor_name: normalized.vendor_name || record.vendor_name,
      invoice_number: finalInvoiceNumber || record.invoice_number,
      account_number: normalized.account_number,
      invoice_date: normalized.invoice_date,
      due_date: normalized.due_date,
      payment_terms: normalized.payment_terms,
      subtotal: normalized.subtotal,
      total_amount: normalized.total_amount,
      tax_amount: normalized.tax_amount,
      fuel_surcharge: normalized.fuel_surcharge,
      delivery_fee: normalized.delivery_fee,
      other_charges: normalized.other_charges,
      line_items: normalized.line_items,
      payment_status: normalized.payment_status,
      status: 'pending_review',
      ap_status: 'processing',
      purchase_order_number: normalized.purchase_order_number,
      raw_text: rawText || extractedData.raw_text || '',
      validation_results: validationResults,
      extraction_method: extractionMethod,
    };

    const { error: updateError } = await supabaseClient
      .from('invoices')
      .update(updatePayload)
      .eq('id', record.id)
      .eq('organization_id', record.organization_id);

    if (updateError) {
      await supabaseClient.from('debug_logs').insert({
        log_data: { point: 'update_failed', error: updateError }
      });
      console.error(`Failed to update invoice ${record.id}:`, updateError);
      throw updateError;
    }

    const lineItemsForRpc = mapLineItemsForRpc(normalized.line_items || []);
    if (lineItemsForRpc.length > 0) {
      const { error: lineItemError } = await supabaseClient.rpc('upsert_invoice_line_items', {
        p_invoice_id: record.id,
        p_items: lineItemsForRpc,
      });

      if (lineItemError) {
        await supabaseClient.from('debug_logs').insert({
          log_data: { point: 'line_items_upsert_failed', error: lineItemError }
        });
        throw lineItemError;
      }

    }

    console.log(`Successfully processed invoice ${record.id}`);
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'success', invoice_id: record.id, line_items_count: lineItemsForRpc.length }
    });

  } catch (err) {
    console.error(`Error in background extraction for invoice ${record.id}:`, err);
    
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'catch_block', error_message: err.message, error_stack: err.stack }
    });

    const failPayload = { status: 'extract_failed', ap_status: 'action_required', validation_results: { error: err.message } };
    const { error: failUpdateError } = await supabaseClient
      .from('invoices')
      .update(failPayload)
      .eq('id', record.id)
      .eq('organization_id', record.organization_id);
      
    // Log the failure to event log
    await supabaseClient.from('debug_logs').insert({
      log_data: { point: 'catch_block_update', failUpdateError: failUpdateError || null }
    });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401
      })
    }

    const supabaseClient = getSupabaseClient(authHeader)

    const payload = await req.json()
    const { invoice_id, action, type, table, record, old_record } = payload


    // 1. Direct Call logic
    if (action && invoice_id) {
      console.log(`Executing ${action} for invoice ${invoice_id}`)
      
      if (action === 'reconcile_invoice_lines') {
        const { data, error } = await supabaseClient.rpc('reconcile_invoice_lines', { p_invoice_id: invoice_id })
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
      }
      
      return new Response(JSON.stringify({ success: true, message: `Action ${action} completed successfully for invoice ${invoice_id}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // 2. pg_net webhook logic
    const shouldProcessExtraction = table === 'invoices'
      && record?.status === 'extracting'
      && (
        type === 'INSERT'
        || old_record?.status !== 'extracting'
        || old_record?.extraction_started_at !== record?.extraction_started_at
      );

    if (shouldProcessExtraction) {
      if (authHeader) {
        const { data: authorizedInvoice, error: authorizeError } = await supabaseClient
          .from('invoices')
          .select('id')
          .eq('id', record.id)
          .eq('organization_id', record.organization_id)
          .maybeSingle();

        if (authorizeError || !authorizedInvoice) {
          return new Response(JSON.stringify({ success: false, error: 'Invoice not found or not accessible' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403
          });
        }
      }

      const processingClient = getSupabaseAuthAdminClient();

      // We must AWAIT this! Deno Edge Functions terminate when the response is sent.
      // pg_net handles the timeout asynchronously from the database side.
      await processInvoiceBackground(record, processingClient);
      
      return new Response(JSON.stringify({ success: true, message: 'Processing complete' }), { headers: corsHeaders, status: 200 })
    } 
    if (table === 'invoices') {
      if (type === 'UPDATE' && record.status !== old_record?.status) {
        if (record.status === 'processed' || record.status === 'approved') {
          console.log(`Starting post-processing for Invoice ${record.id}`);
          if (record.total_amount > 1000) {
            console.log(`Sending alert: Large invoice of $${record.total_amount} processed`);
          }
          
          if (record.status === 'approved') {
            const vendorMatch = record.vendor_id ? `id=eq.${record.vendor_id}` : `name=eq.${record.vendor_name}`;
            const { data: vendors } = await supabaseClient
               .from('vendors')
               .select('id, autopay_enabled, default_payment_method')
               .eq('organization_id', record.organization_id)
               .or(vendorMatch)
               .limit(1);
               
            const vendor = vendors?.[0];
            
            if (vendor?.autopay_enabled) {
               console.log(`AutoPay enabled for vendor ${vendor.id}, scheduling payment...`);

               const paymentMethod = ['stripe_connect_custom', 'checkbook_digital', 'checkbook_physical'].includes(vendor.default_payment_method)
                  ? vendor.default_payment_method
                  : vendor.default_payment_method === 'check'
                     ? 'checkbook_digital'
                     : vendor.default_payment_method === 'stripe'
                        ? 'stripe_connect_custom'
                        : 'stripe_connect_custom';

               // Auto-trigger the banking-link flow when the vendor has no Stripe Connect account
               // source on file yet, instead of silently scheduling a payment that can never
               // actually be released. Reuses the same funding-source check process-payout
               // already does (get_vendor_provider_link) rather than re-deriving it.
               if (paymentMethod === 'stripe_connect_custom') {
               try {
                  const { data: stripeConnectLink } = await supabaseClient
                     .rpc('get_vendor_provider_link', { p_vendor_id: vendor.id, p_provider: 'stripe_connect_custom' })
                     .maybeSingle();

                  if (!stripeConnectLink?.provider_funding_ref) {
                     const { data: pendingToken } = await supabaseClient
                        .from('vendor_banking_link_tokens')
                        .select('id, expires_at')
                        .eq('vendor_id', vendor.id)
                        .eq('status', 'pending')
                        .is('deleted_at', null)
                        .maybeSingle();

                     const hasLivePendingLink = pendingToken && new Date(pendingToken.expires_at) > new Date();

                     if (!hasLivePendingLink) {
                        const { error: linkError } = await supabaseClient.rpc('issue_vendor_banking_link', {
                           p_vendor_id: vendor.id,
                           p_intent: 'add',
                        });
                        if (linkError) {
                           // ponytail: best-effort. A vendor who hasn't finished OTP/tax/document
                           // onboarding yet can't receive a banking link regardless -- don't let
                           // that block AutoPay scheduling below.
                           console.warn(`Could not auto-issue banking link for vendor ${vendor.id}:`, linkError.message);
                        } else {
                           console.log(`Auto-issued banking link for vendor ${vendor.id} (missing Stripe Connect account)`);
                        }
                     }
                  }
               } catch (bankingLinkError) {
                  console.warn(`Banking link auto-trigger failed for vendor ${vendor.id}:`, bankingLinkError);
               }
               }

               
               const { error: paymentError } = await supabaseClient
                  .from('payments')
                  .insert({
                     organization_id: record.organization_id,
                     location_id: record.location_id,
                     vendor_id: vendor.id,
                     invoice_id: record.id,
                     amount: record.total_amount,
                     // ponytail: scheduledness lives on invoices/scheduled_payments.
                     // payments.status has no sanctioned 'scheduled' state; pending is the queued row state.
                     status: 'pending',
                     // ponytail: normalize vendor default tokens to payments.payment_method vocabulary.
                     // Ceiling: supports current vendor defaults only; add mappings here if vendor methods grow.
                     payment_method: paymentMethod,
                     payment_date: record.due_date || new Date().toISOString().split('T')[0]
                  });
               
               if (!paymentError) {
                  await supabaseClient.from('invoices')
                     .update({
                        // ponytail: mirror schedule_invoice_payment's invoice read-channel markers.
                        // Ceiling: this branch cannot set payment_account_id because autopay has no account argument here.
                        // Upgrade path: factor a shared mark-invoice-scheduled helper if the scheduled shape changes.
                        scheduled_payment_date: record.due_date || new Date().toISOString().split('T')[0],
                        status: record.status === 'approved' ? 'scheduled' : record.status,
                        ap_status: record.ap_status === 'approved' ? 'scheduled' : record.ap_status,
                        ap_metadata: { ...(record.ap_metadata || {}), scheduled_payout_method: paymentMethod },
                        updated_at: new Date().toISOString()
                     })
                     .eq('id', record.id);
               } else {
                  console.error('Failed to create AutoPay payment:', paymentError);
               }
            }
          }
        } else if (record.status === 'rejected') {
          console.log(`Notifying uploader about rejection of Invoice ${record.id}`);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error("Invoice processing error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
