const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// Accepts "http://host:4000", "http://host:4000/", or "http://host:4000/v1"
function normalizeBaseUrl(baseUrl) {
  return (baseUrl || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

function buildPrompt(text, targetLang, sourceLang, options) {
  const sourceInstruction = sourceLang
    ? `The source language is ${sourceLang}. Translate it to ${targetLang}.`
    : `Detect the language of the following text and translate it to ${targetLang}.`;

  // Build JSON schema based on enabled options
  const fields = [
    '"detectedLanguage": "<source language name>"',
    '"translation": "<translated text>"'
  ];
  const instructions = [];

  if (options.pronunciation) {
    fields.push('"pronunciation": "<IPA phonetic transcription of the SOURCE text, e.g. /rɪˈleɪ.ʃən.ʃɪp/>"');
    instructions.push("- pronunciation: Provide IPA phonetic transcription of the original source text.");
  }
  if (options.definition) {
    fields.push('"definition": "<brief meaning explanation of the source text in the TARGET language>"');
    instructions.push(`- definition: Explain the meaning of the source word/phrase in ${targetLang}. Keep it concise (1-2 sentences).`);
  }
  if (options.example) {
    fields.push('"example": "<an example sentence using the source text in its original language>"');
    fields.push('"exampleTranslation": "<translation of the example sentence in the target language>"');
    instructions.push("- example: Provide a natural example sentence using the source text in its original language, and translate that sentence to the target language.");
  }

  // Always include CEFR for words/phrases (5 words or fewer)
  fields.push('"cefr": "<CEFR level: A1, A2, B1, B2, C1, C2, or null if not a single word/phrase>"');
  instructions.push("- cefr: If the source text is a word or short phrase (5 words or fewer), classify its CEFR level (A1/A2/B1/B2/C1/C2). If it's a longer sentence or paragraph, set to null.");

  const extraInstructions = instructions.length > 0
    ? "\n\nAdditional requirements:\n" + instructions.join("\n")
    : "";

  return `${sourceInstruction}
You MUST respond with ONLY valid JSON, no markdown fences, no extra text.
JSON format: {${fields.join(", ")}}${extraInstructions}

Text:
${text}`;
}

function parseResponse(raw) {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return { detectedLanguage: "unknown", translation: cleaned };
  }
}

export const providers = {
  async gemini(apiKey, text, targetLang, sourceLang, options, model = DEFAULT_GEMINI_MODEL) {
    const prompt = buildPrompt(text, targetLang, sourceLang, options);
    const normalizedModel = (model || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return parseResponse(raw);
  },

  async claude(apiKey, text, targetLang, sourceLang, options) {
    const prompt = buildPrompt(text, targetLang, sourceLang, options);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API error (${res.status}): ${err}`);
    }
    const data = await res.json();
    const raw = data.content?.[0]?.text || "";
    return parseResponse(raw);
  },

  async azureOpenAI(apiKey, text, targetLang, sourceLang, options, endpoint, deployment) {
    const prompt = buildPrompt(text, targetLang, sourceLang, options);
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-08-01-preview`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Azure OpenAI API error (${res.status}): ${err}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    return parseResponse(raw);
  },

  async custom(apiKey, text, targetLang, sourceLang, options, baseUrl, model) {
    const base = normalizeBaseUrl(baseUrl);
    if (!base) {
      throw new Error("Custom API base URL is not configured. Please open settings.");
    }
    if (!model) {
      throw new Error("Custom API model is not configured. Please open settings.");
    }
    const prompt = buildPrompt(text, targetLang, sourceLang, options);
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Custom API error (${res.status}): ${err}`);
    }
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    return parseResponse(raw);
  }
};

export async function listCustomModels(baseUrl, apiKey) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    throw new Error("Custom API base URL is not configured.");
  }
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${base}/v1/models`, { headers });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Custom API error (${res.status}): ${err}`);
  }
  const data = await res.json();
  return (data.data || []).map((m) => m.id).filter(Boolean);
}
