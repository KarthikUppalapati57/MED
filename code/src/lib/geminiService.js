/**
 * Service to handle communication with the Google Gemini API.
 * Uses native fetch to interact with the REST endpoint, avoiding external dependencies.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Analyzes recipe data using Gemini and returns structured insights.
 * 
 * @param {Array} recipes - The list of recipes
 * @returns {Promise<Object>} JSON containing { addToMenu, marginAlerts, remove }
 */
export async function generateRecipeInsights(recipes) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  // Extract relevant simplified data so we don't blow up the token limit
  const recipeData = recipes.map(r => ({
    name: r.name,
    category: r.category,
    cost_per_serving: r.cost_per_serving,
    selling_price: r.selling_price,
    target_margin: r.target_margin_percent,
    current_margin: r.selling_price ? ((r.selling_price - (r.cost_per_serving || 0)) / r.selling_price) * 100 : 0
  }));

  const systemInstruction = `You are an expert restaurant Menu Engineer and Food Cost Controller.
I will provide you with a list of recipes and their financial metrics. 
You must analyze this data and return your insights as a pure, valid JSON object (without markdown code blocks like \`\`\`json) with exactly the following structure:
{
  "addToMenu": { "title": "Add to Menu", "description": "Your analysis on which categories/profiles to expand based on high margins." },
  "marginAlerts": { "title": "Margin Alerts", "description": "Identify specific recipes dropping below their target margins." },
  "remove": { "title": "Remove or Audit", "description": "Suggest specific underperforming or low-margin recipes to remove or audit." }
}
Be concise, analytical, and specific to the data provided. Do not invent recipes.`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(recipeData, null, 2) }] }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to generate recipe insights');
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON", textContent);
    return null;
  }
}

/**
 * Drafts an email to a vendor requesting a credit memo due to a 3-way match variance.
 */
export async function generateVendorCreditRequestEmail(invoice, po, varianceDetails) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  const systemInstruction = `You are an Accounts Payable Manager at a restaurant.
Your task is to draft a professional, concise email to a vendor to request a credit memo because of a discrepancy between the Purchase Order, the Receiving Log, and the final Invoice.
Return your response as a valid JSON object with EXACTLY this structure:
{
  "subject": "The email subject line",
  "body": "The plain text email body. Use standard newlines. Keep it polite but firm."
}
Do not use markdown code blocks like \`\`\`json.`;

  const prompt = `
Vendor Name: ${invoice?.vendor_name || 'Vendor'}
Invoice Number: ${invoice?.invoice_number || 'N/A'}
Purchase Order Number: ${po?.po_number || 'N/A'}
Variance Details:
- PO Total: $${varianceDetails?.po_total}
- Invoice Total: $${varianceDetails?.invoice_total}
- PO Quantity: ${varianceDetails?.po_quantity}
- Received Quantity: ${varianceDetails?.received_quantity}
- Variance Amount: $${varianceDetails?.variance_amount}
- Variance Percent: ${varianceDetails?.variance_percent}%
- Match Status: ${varianceDetails?.match_status}

Please draft the email requesting a credit memo for the discrepancy.
`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      response_mime_type: "application/json",
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to draft email via Gemini');
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error("Failed to parse Gemini response", textContent);
    return { subject: '', body: textContent };
  }
}

/**
 * Generates an automated labor schedule using Gemini based on historical sales and employees.
 */
export async function generateLaborSchedule(employees, salesForecast, weekStartDate) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  // Simplify employees data
  const simpleEmployees = employees.map(e => ({
    id: e.id,
    name: e.full_name,
    role: e.role,
    hourly_rate: e.hourly_rate || 15
  }));

  const systemInstruction = `You are a Restaurant General Manager optimizing a weekly labor schedule.
You will be provided with an array of employees and a daily sales forecast array.
Your task is to assign shifts to employees for the week starting on ${weekStartDate}.
Rules:
1. Ensure there is adequate coverage for high-sales days.
2. Do not schedule a single employee for more than 40 hours total in the week.
3. Typical shift lengths should be 6 to 8 hours.
4. If someone is a chef, they should work when it's busy. If they are ground_staff, they should work standard shifts.
5. Return the result as a pure JSON object containing an array of shifts.

EXACT JSON STRUCTURE REQUIRED:
{
  "shifts": [
    {
      "employee_id": "uuid-of-employee",
      "shift_start": "YYYY-MM-DDTHH:mm:00Z",
      "shift_end": "YYYY-MM-DDTHH:mm:00Z"
    }
  ]
}`;

  const prompt = `
Employees:
${JSON.stringify(simpleEmployees, null, 2)}

Daily Sales Forecast (index 0 is ${weekStartDate}):
${JSON.stringify(salesForecast, null, 2)}

Generate the optimal schedule.
`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: "application/json",
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to generate schedule via Gemini');
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"shifts":[]}';
  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error("Failed to parse Gemini schedule", textContent);
    return { shifts: [] };
  }
}

/**
 * Analyzes a single vendor's spend, items, and invoice history and returns real
 * AP-focused insights (replaces the previous hardcoded/simulated vendor analyst).
 */
export async function generateVendorInsights(vendor, vendorItems, recentInvoices) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  const summary = {
    name: vendor?.name,
    status: vendor?.status,
    payment_terms: vendor?.payment_terms,
    total_spent: vendor?.total_spent,
    unpaid_ap: vendor?.unpaid_ap,
    item_count: vendorItems?.length || 0,
    items_with_price_variance: (vendorItems || []).filter(i => i.price_variance_flag).length,
    items_on_order_guide: (vendorItems || []).filter(i => i.on_order_guide).length,
    recent_invoice_count: recentInvoices?.length || 0,
    recent_invoice_total: (recentInvoices || []).reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0),
  };

  const systemInstruction = `You are an Accounts Payable analyst reviewing a single restaurant vendor relationship.
I will give you a JSON summary of the vendor's status, spend, item catalog, and recent invoices.
Return your analysis as a pure, valid JSON object (no markdown code blocks) with exactly this structure:
{
  "insights": [
    { "title": "Short insight title", "description": "One or two sentence explanation grounded only in the data provided." }
  ]
}
Return 2-4 insights. Only state what the data supports — do not invent vendor details, prices, or events not present in the summary.`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(summary, null, 2) }] }],
    generationConfig: {
      temperature: 0.1,
      response_mime_type: "application/json",
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to generate vendor insights');
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"insights":[]}';
  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error("Failed to parse Gemini vendor insights", textContent);
    return { insights: [] };
  }
}

/**
 * Answers a free-text question about a single vendor, grounded only in the real
 * vendor/item/invoice data provided (used by the AI Vendor Analyst chat).
 */
export async function chatAboutVendor(vendor, vendorItems, recentInvoices, question) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  const summary = {
    name: vendor?.name,
    status: vendor?.status,
    payment_terms: vendor?.payment_terms,
    total_spent: vendor?.total_spent,
    unpaid_ap: vendor?.unpaid_ap,
    items: (vendorItems || []).map(i => ({
      name: i.vendor_item_name,
      unit: i.vendor_unit,
      last_price: i.last_price ?? i.default_price,
      price_variance_flag: i.price_variance_flag,
      on_order_guide: i.on_order_guide,
    })),
    recent_invoices: (recentInvoices || []).map(inv => ({
      invoice_date: inv.invoice_date,
      total_amount: inv.total_amount,
      payment_status: inv.payment_status,
    })),
  };

  const systemInstruction = `You are an Accounts Payable analyst answering questions about ONE specific restaurant vendor.
Here is the only data you have about this vendor (JSON): ${JSON.stringify(summary)}
Answer the user's question using only this data. If the data doesn't contain the answer, say so plainly instead of
guessing or inventing numbers. Keep answers to 2-4 sentences, plain text, no markdown.`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.2 }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to get a response from Gemini');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "I couldn't generate a response for that.";
}

/**
 * Analyzes the org's existing vendor list/spend and returns genuine written
 * recommendations (concentration risk, categories with no active vendor, etc).
 * Does NOT invent new vendor names/ratings — no such external data is available.
 */
export async function generateVendorSuggestions(vendors) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured.');

  const vendorSummary = (vendors || []).map(v => ({
    name: v.name,
    status: v.status,
    category: v.default_expense_category,
    total_spent: v.total_spent,
  }));

  const systemInstruction = `You are a restaurant procurement analyst reviewing an organization's existing vendor list.
I will give you a JSON array of the org's current vendors with their category and spend.
Analyze concentration risk, categories with no active vendor, and consolidation opportunities.
Return your analysis as a pure, valid JSON object (no markdown code blocks) with exactly this structure:
{
  "suggestions": [
    { "title": "Short recommendation title", "description": "One or two sentence explanation grounded only in the vendor list provided." }
  ]
}
Return 2-4 suggestions. Do not invent vendor names, ratings, or prices that are not in the data — you have no
information about vendors outside this list.`;

  const payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(vendorSummary, null, 2) }] }],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: "application/json",
    }
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to generate vendor suggestions');
  }

  const data = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"suggestions":[]}';
  try {
    return JSON.parse(textContent);
  } catch (e) {
    console.error("Failed to parse Gemini vendor suggestions", textContent);
    return { suggestions: [] };
  }
}
