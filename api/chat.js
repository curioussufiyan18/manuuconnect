const { GoogleGenAI } = require('@google/genai');

export default async function handler(req, res) {
  // Only allow POST requests from our frontend
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const userMessage = req.body.message;
    
    // Initialize the AI with your secret Vercel environment variable
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Call the newest Gemini model
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "System Instruction: You are a helpful, polite assistant for the Maulana Azad National Urdu University community. Keep answers concise.\n\nUser: " + userMessage,
    });

    // Send the text back to the frontend
    res.status(200).json({ reply: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
