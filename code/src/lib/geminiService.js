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
