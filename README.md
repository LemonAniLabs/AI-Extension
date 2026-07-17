# AI Translate

A Chrome / Firefox extension that translates selected text using **your own** LLM API — Gemini, Claude, Azure OpenAI, or any OpenAI-compatible endpoint. No account, no subscription, no data collection: your API key stays in your browser.

## Features

- **Select & translate** — select text on any page, click the floating icon (or press `Alt+T`, or right-click → AI Translate)
- **Rich results** — translation plus IPA pronunciation, definition, example sentence, and CEFR level (A1–C2) for words and phrases
- **Favorites** — star words to review later, filter by type/date, export as TXT
- **Notion export** — one click exports your favorites to Notion as a vocabulary database, study report, or flashcards
- **Bring your own model** — Gemini, Claude, Azure OpenAI, or any OpenAI-compatible API
- **Flexible interface** — drag the grip at the bottom of the popup to set a fixed height (double-click it to reset), or enable *Open in a standalone window* in Settings for a free-floating, resizable window that stays open while you browse

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+T` | Translate the current selection (opens the inline panel) |
| `Alt+Shift+T` | Open the extension popup |
| `Enter` (in the input box) | Translate |
| `Shift+Enter` (in the input box) | Insert a new line |

The popup input is focused automatically when it opens, so you can start typing right away. `Alt+T` / `Alt+Shift+T` can be remapped at `chrome://extensions/shortcuts` (Chrome) or *Manage Extension Shortcuts* (Firefox).

## Installation

**Chrome**: `chrome://extensions` → enable Developer mode → *Load unpacked* → select this folder.
**Firefox**: `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → select `manifest.json` (or build the zip with `./build.sh` and install `dist/ai-translate-firefox.zip`).

## Provider setup

Open the extension popup → **Settings** tab → pick a provider.

### Gemini
1. Get a free API key at [Google AI Studio](https://aistudio.google.com/apikey)
2. Paste it into **Gemini API Key**. Optionally change the model (default `gemini-2.5-flash`)

### Claude
1. Get an API key at [console.anthropic.com](https://console.anthropic.com/)
2. Paste it into **Claude API Key**

### Azure OpenAI
Fill in your **API key**, **endpoint** (`https://your-resource.openai.azure.com`), and **deployment name**.

### Custom API (OpenAI-compatible)

Works with **any service that speaks the OpenAI Chat Completions protocol** — self-hosted proxies and local runtimes included.

Three fields:

| Field | What to enter |
|---|---|
| **API Base URL** | The part of the URL **before** `/v1/chat/completions`. A trailing `/` or `/v1` is fine — it is normalized automatically. |
| **API Key** | Whatever your server expects as `Authorization: Bearer <key>`. Leave empty if your server doesn't require one (e.g. local Ollama / LM Studio). |
| **Model** | Click **Load** to fetch the list from `/v1/models` and pick one, or type a model name manually. |

Examples:

| Service | API Base URL | API Key | Model example |
|---|---|---|---|
| LiteLLM proxy | `http://your-server:4000` | your LiteLLM key | whatever your proxy routes |
| Ollama (local) | `http://localhost:11434` | *(empty)* | `llama3.1`, `qwen2.5` |
| LM Studio (local) | `http://localhost:1234` | *(empty)* | as shown in LM Studio |
| vLLM | `http://your-server:8000` | *(if configured)* | the served model name |
| OpenAI | `https://api.openai.com` | `sk-...` | `gpt-4o-mini` |
| OpenRouter | `https://openrouter.ai/api` | `sk-or-...` | `openai/gpt-4o-mini` |
| Groq | `https://api.groq.com/openai` | `gsk_...` | `llama-3.3-70b-versatile` |
| DeepSeek | `https://api.deepseek.com` | `sk-...` | `deepseek-chat` |

**Rule of thumb**: if you can reach your server with

```bash
curl <BASE_URL>/v1/chat/completions \
  -H "Authorization: Bearer <KEY>" \
  -H "Content-Type: application/json" \
  -d '{"model": "<MODEL>", "messages": [{"role": "user", "content": "hi"}]}'
```

then entering `<BASE_URL>`, `<KEY>`, and `<MODEL>` in the settings will work.

#### Troubleshooting

- **"Load" button fails but translation works** — some servers don't implement `/v1/models`. Just type the model name manually.
- **Custom API error (401/403)** — wrong or missing API key.
- **Custom API error (404)** — the Base URL is wrong; you probably included too much or too little of the path. Enter only the part before `/v1/chat/completions`.
- **Garbled or empty translations** — the model must be able to follow a "respond with JSON only" instruction. Very small models sometimes can't; if the raw text shows up as the translation, try a larger model.
- **`http://` endpoints** — supported, but the API key is sent unencrypted. Only use plain HTTP on a trusted network (localhost / LAN / VPN).

## Privacy

See [PRIVACY.md](PRIVACY.md). Short version: everything is stored locally in your browser; text you translate is sent only to the provider you configured.

## Development

```bash
./build.sh              # packages dist/ai-translate-chrome.zip and dist/ai-translate-firefox.zip
python3 -m unittest discover -s tests   # run tests
```

The Firefox build is identical except `background.service_worker` is rewritten to `background.scripts` (Firefox MV3 doesn't support service workers).

## License

[MIT](LICENSE)
