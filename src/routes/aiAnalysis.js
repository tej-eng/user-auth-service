const express = require("express");
const router = express.Router();
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, // 🔥 MUST
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Dhwani AI",
  },
});
console.log("API KEY:", process.env.OPENROUTER_API_KEY);
router.post("/ai-analysis", async (req, res) => {
  try {
    const { name, dob, tob, place } = req.body;

const prompt = `
You are an expert Vedic astrologer.

Name: ${name}
DOB: ${dob}
Time: ${tob}
Place: ${place}

Return ONLY valid JSON in this format:

{
  "career": ["..."],
  "love": ["..."],
  "finance": ["..."],
  "problems": [
    {
      "title": "...",
      "description": "..."
    }
  ],
  "doshas": [
    {
      "name": "...",
      "impact": ["...", "..."]
    }
  ],
  "solutions": ["..."]
}

Rules:
- Always fill arrays (never empty)
- Keep answers short (1-2 lines each)
- Do not add text outside JSON
`;

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Dhwani AI",
  },
  body: JSON.stringify({
    model: "meta-llama/llama-3-8b-instruct",
    messages: [
      { role: "system", content: "You are a Vedic astrologer AI." },
      { role: "user", content: prompt },
    ],
  }),
});

const data = await response.json();

// ✅ सही log
console.log("FULL JSON:", data);

// ✅ सही extraction
let text =
  data?.choices?.[0]?.message?.content ||
  "No response from AI";

// fallback
if (!text || text === "No response from AI") {
  return res.json({
    career: ["AI unavailable"],
    love: ["Try again"],
    finance: ["Service busy"],
    problems: [],
    doshas: [],
    solutions: [],
  });
}

console.log("RAW RESPONSE:", text);

const cleaned = text.match(/\{[\s\S]*\}/);

if (!cleaned) {
  throw new Error("Invalid JSON from AI");
}

const json = JSON.parse(cleaned[0]);

res.json(json);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "AI failed" });
  }
});

module.exports = router;
