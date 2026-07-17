import { providers, listCustomModels } from "../lib/providers.module.js";
import { LANGUAGES } from "../lib/languages.module.js";

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "AI Translate",
    contexts: ["selection"]
  });
  applyActionMode();
});

// --- Standalone window mode ---
// With openInWindow enabled the action popup is cleared, so clicking the
// toolbar icon fires action.onClicked and we open a real window instead.
async function applyActionMode() {
  const { openInWindow } = await chrome.storage.local.get("openInWindow");
  await chrome.action.setPopup({ popup: openInWindow ? "" : "popup/popup.html" });
}

chrome.runtime.onStartup.addListener(applyActionMode);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.openInWindow) applyActionMode();
});

// Only fires while the action has no popup (window mode)
chrome.action.onClicked.addListener(() => {
  openStandaloneWindow();
});

async function openStandaloneWindow() {
  const store = await chrome.storage.local.get(["standaloneWindowId", "windowBounds"]);

  // Focus the existing window instead of stacking new ones
  if (store.standaloneWindowId != null) {
    try {
      await chrome.windows.update(store.standaloneWindowId, { focused: true });
      return;
    } catch {
      // window was closed — create a fresh one
    }
  }

  const bounds = store.windowBounds || {};
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("popup/popup.html?windowed=1"),
    type: "popup",
    focused: true,
    width: bounds.width || 380,
    height: bounds.height || 600
  });
  await chrome.storage.local.set({ standaloneWindowId: win.id });
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { standaloneWindowId } = await chrome.storage.local.get("standaloneWindowId");
  if (standaloneWindowId === windowId) {
    await chrome.storage.local.remove("standaloneWindowId");
  }
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

  if (message.type === "listModels") {
    listCustomModels(message.baseUrl, message.apiKey)
      .then((models) => sendResponse({ models }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
});

// --- Notion OAuth (runs in service worker so popup doesn't block) ---
const NOTION_CLIENT_ID = "33cd872b-594c-814c-b275-00373e8af40d";
const WORKER_URL = "https://ai-translate-oauth.innovai-studio.workers.dev";

function base64UrlEncode(value) {
  return btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function notionConnect() {
  const api = typeof browser !== "undefined" ? browser : chrome;
  const extensionRedirectUri = api.identity.getRedirectURL("callback");
  const notionRedirectUri = WORKER_URL;
  const state = base64UrlEncode({ redirect_uri: extensionRedirectUri, timestamp: Date.now() });
  console.log("Extension redirect URI:", extensionRedirectUri);
  console.log("Notion redirect URI:", notionRedirectUri);

  const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(notionRedirectUri)}&state=${encodeURIComponent(state)}`;
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
  const oauthParams = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search.slice(1));
  const error = oauthParams.get("error");

  if (error) throw new Error(`Notion error: ${error}`);
  if (!oauthParams.get("access_token")) {
    throw new Error("No Notion access token received");
  }

  await chrome.storage.local.set({
    notionToken: oauthParams.get("access_token"),
    notionWorkspace: oauthParams.get("workspace_name") || "Connected"
  });

  return { workspace: oauthParams.get("workspace_name") || "Connected" };
}

async function doTranslate(text, overrideSourceLang, overrideTargetLang) {
  const settings = await chrome.storage.local.get([
    "provider",
    "apiKeys",
    "azureEndpoint",
    "azureDeployment",
    "customBaseUrl",
    "customModel",
    "targetLang",
    "sourceLang",
    "geminiModel",
    "optPronunciation",
    "optDefinition",
    "optExample"
  ]);

  const provider = settings.provider || "gemini";
  const apiKeys = settings.apiKeys || {};
  const targetLangCode = overrideTargetLang || settings.targetLang || "en";
  const sourceLangCode = overrideSourceLang || settings.sourceLang || "auto";
  const geminiModel = settings.geminiModel || "gemini-2.5-flash";
  const apiKey = apiKeys[provider];

  // Custom OpenAI-compatible endpoints (e.g. a LiteLLM proxy) may not require a key
  if (!apiKey && provider !== "custom") {
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
      return await providers.gemini(apiKey, text, targetName, sourceName, options, geminiModel);
    case "claude":
      return await providers.claude(apiKey, text, targetName, sourceName, options);
    case "azureOpenAI":
      return await providers.azureOpenAI(
        apiKey, text, targetName, sourceName, options,
        settings.azureEndpoint, settings.azureDeployment
      );
    case "custom":
      return await providers.custom(
        apiKey, text, targetName, sourceName, options,
        settings.customBaseUrl, settings.customModel
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
