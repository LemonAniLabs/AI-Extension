import { providers } from "../lib/providers.module.js";
import { LANGUAGES } from "../lib/languages.module.js";

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "AI Translate",
    contexts: ["selection"]
  });
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "translate-selection") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "translateSelection" });
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "translate-selection") return;

  const text = info.selectionText;
  if (!text) return;

  try {
    const result = await doTranslate(text);
    await chrome.storage.local.set({
      pendingResult: {
        sourceText: text,
        ...result,
        timestamp: Date.now()
      }
    });
  } catch (err) {
    await chrome.storage.local.set({
      pendingResult: {
        sourceText: text,
        error: err.message,
        timestamp: Date.now()
      }
    });
  }
});

// Handle messages from popup / content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "translate") {
    doTranslate(message.text, message.sourceLang, message.targetLang)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === "clearPending") {
    chrome.storage.local.remove("pendingResult");
    return false;
  }

  if (message.type === "notionConnect") {
    notionConnect()
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// --- Notion OAuth (runs in service worker so popup doesn't block) ---
const NOTION_CLIENT_ID = "33cd872b-594c-814c-b275-00373e8af40d";
const WORKER_URL = "https://ai-translate-oauth.innovai-studio.workers.dev";

async function notionConnect() {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const redirectUri = api.identity.getRedirectURL("callback");
  console.log("Notion redirect URI:", redirectUri);

  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(redirectUri)}`;
  console.log("Notion auth URL:", authUrl);

  const callbackUrl = await new Promise((resolve, reject) => {
    api.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (url) => {
        if (api.runtime.lastError) {
          reject(new Error(api.runtime.lastError.message));
        } else if (!url) {
          reject(new Error("Authorization cancelled"));
        } else {
          resolve(url);
        }
      }
    );
  });

  const url = new URL(callbackUrl);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) throw new Error(`Notion error: ${error}`);
  if (!code) throw new Error("No authorization code received");

  // Exchange code via Cloudflare Worker
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri })
  });
  const data = await res.json();

  if (data.error) throw new Error(data.error);

  await chrome.storage.local.set({
    notionToken: data.access_token,
    notionWorkspace: data.workspace_name || "Connected"
  });

  return { workspace: data.workspace_name || "Connected" };
}

async function doTranslate(text, overrideSourceLang, overrideTargetLang) {
  const settings = await chrome.storage.local.get([
    "provider",
    "apiKeys",
    "azureEndpoint",
    "azureDeployment",
    "targetLang",
    "sourceLang",
    "optPronunciation",
    "optDefinition",
    "optExample"
  ]);

  const provider = settings.provider || "gemini";
  const apiKeys = settings.apiKeys || {};
  const targetLangCode = overrideTargetLang || settings.targetLang || "en";
  const sourceLangCode = overrideSourceLang || settings.sourceLang || "auto";
  const apiKey = apiKeys[provider];

  if (!apiKey) {
    throw new Error(`No API key configured for ${provider}. Please open settings.`);
  }

  const targetEntry = LANGUAGES.find((l) => l.code === targetLangCode);
  const targetName = targetEntry ? targetEntry.name : targetLangCode;

  let sourceName = null;
  if (sourceLangCode && sourceLangCode !== "auto") {
    const sourceEntry = LANGUAGES.find((l) => l.code === sourceLangCode);
    sourceName = sourceEntry ? sourceEntry.name : sourceLangCode;
  }

  // Options default to true
  const options = {
    pronunciation: settings.optPronunciation !== false,
    definition: settings.optDefinition !== false,
    example: settings.optExample !== false
  };

  switch (provider) {
    case "gemini":
      return await providers.gemini(apiKey, text, targetName, sourceName, options);
    case "claude":
      return await providers.claude(apiKey, text, targetName, sourceName, options);
    case "azureOpenAI":
      return await providers.azureOpenAI(
        apiKey, text, targetName, sourceName, options,
        settings.azureEndpoint, settings.azureDeployment
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
