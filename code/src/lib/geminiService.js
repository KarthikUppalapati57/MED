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
