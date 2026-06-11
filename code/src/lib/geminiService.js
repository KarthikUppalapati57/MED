/**
 * Service to handle communication with the Google Gemini API.
 * Uses native fetch to interact with the REST endpoint, avoiding external dependencies.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Sends a chat message to Gemini with injected restaurant context.
 * 
 * @param {Array} chatHistory - Array of previous messages { role: 'user' | 'assistant', content: string }
 * @param {string} newMessage - The user's new message
 * @param {Object} contextData - Contextual data from the DB (Location, Brand, Org data)
 * @returns {Promise<string>} The AI's response text
 */
export async function sendGeminiMessage(chatHistory, newMessage, contextData) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Please add VITE_GEMINI_API_KEY to your .env file.');
  }

  // Construct the system instruction payload based on the context data
  const systemInstruction = `You are a highly capable AI Assistant for Restops, a restaurant operations and inventory management platform.
Your primary job is to help restaurant operators understand their data, answer questions about their performance, and provide actionable insights.

CRITICAL INSTRUCTIONS:
1. You must ONLY answer questions using the context provided below.
2. If the user asks for data that is empty or missing (e.g., asking for sales when POS data is empty), explicitly state that they have no data for that category and suggest they upload invoices or connect their POS system.
3. Be professional, concise, and helpful. Format your answers using clear markdown (bullet points, bold text).
4. The user is currently viewing data at the following scope: ${contextData.scopeName} (${contextData.scopeType}). You must only provide insights relevant to this specific scope.

CONTEXT DATA PROVIDED FOR THIS REQUEST:
${JSON.stringify(contextData.metrics, null, 2)}

If the context data is empty arrays or objects, it means the user has not synced that data yet. Let them know.`;

  // Format history for Gemini API
  const formattedHistory = chatHistory
    // Filter out the initial local mock assistant greeting if it exists to avoid confusing Gemini
    .filter(msg => !(msg.role === 'assistant' && msg.content.includes('Restops AI Assistant')))
    .map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

  // Append the new message
  formattedHistory.push({
    role: 'user',
    parts: [{ text: newMessage }]
  });

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: formattedHistory,
    generationConfig: {
      temperature: 0.2, // Low temperature for more analytical/factual answers
      maxOutputTokens: 1000,
    }
  };

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API Error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to communicate with Gemini API');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, but I could not generate a response at this time.';
  } catch (error) {
    console.error('Gemini Service Error:', error);
    throw error;
  }
}

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
