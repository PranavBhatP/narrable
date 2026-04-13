import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 5050;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const allowedModels = new Set([
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
]);
const defaultModel = "google/gemma-4-26b-a4b-it:free";

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/ai/assist", async (req, res) => {
  const { prompt, text, model } = req.body || {};
  if (!prompt || !text) {
    return res.status(400).json({ error: "Both prompt and text are required." });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "OPENROUTER_API_KEY is not configured." });
  }

  const selectedModel = allowedModels.has(model) ? model : defaultModel;

  try {
    const response = await fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: "You are an accessibility assistant for reading comprehension. Keep output concise and clear." },
          { role: "user", content: `${prompt}\n\nText:\n${text}` },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter request failed.",
        details: data?.error?.message || "Unknown API error.",
      });
    }

    const output = data?.choices?.[0]?.message?.content?.trim() || "No response generated.";
    return res.json({ output });
  } catch (error) {
    return res.status(500).json({ error: "AI request failed.", details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Narrable AI server running on http://localhost:${port}`);
});
