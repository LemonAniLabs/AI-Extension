const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

document.addEventListener("DOMContentLoaded", async () => {
  // Standalone-window mode: same page, opened via chrome.windows.create
  const isWindowed = new URLSearchParams(location.search).has("windowed");
  if (isWindowed) document.body.classList.add("windowed");

  // --- Elements ---
  const container = document.querySelector(".container");
  const resizeGrip = document.getElementById("resize-grip");
  const tabs = document.querySelectorAll(".tab");
  const tabContents = {
    translate: document.getElementById("tab-translate"),
    favorites: document.getElementById("tab-favorites"),
    settings: document.getElementById("tab-settings")
  };

  const sourceLangSelect = document.getElementById("source-lang");
  const targetLangTranslate = document.getElementById("target-lang-translate");
  const btnSwap = document.getElementById("btn-swap");
  const sourceText = document.getElementById("source-text");
  const btnTranslate = document.getElementById("btn-translate");
  const resultArea = document.getElementById("result-area");
  const detectedLang = document.getElementById("detected-lang");
  const translationOutput = document.getElementById("translation-output");
  const errorArea = document.getElementById("error-area");
  const errorMsg = document.getElementById("error-msg");
  const loading = document.getElementById("loading");
  const btnFav = document.getElementById("btn-fav");

  const cefrArea = document.getElementById("cefr-area");
  const cefrBadge = document.getElementById("cefr-badge");
  const pronunciationArea = document.getElementById("pronunciation-area");
  const pronunciationOutput = document.getElementById("pronunciation-output");
  const definitionArea = document.getElementById("definition-area");
  const definitionOutput = document.getElementById("definition-output");
  const exampleArea = document.getElementById("example-area");
  const exampleOutput = document.getElementById("example-output");

  const favList = document.getElementById("fav-list");
  const favFilter = document.getElementById("fav-filter");
  const favDateFilter = document.getElementById("fav-date-filter");
  const btnExportFav = document.getElementById("btn-export-fav");
  const btnExportNotion = document.getElementById("btn-export-notion");
  const notionExportStatus = document.getElementById("notion-export-status");
  const btnClearFav = document.getElementById("btn-clear-fav");
  const btnNotionConnect = document.getElementById("btn-notion-connect");
  const btnNotionDisconnect = document.getElementById("btn-notion-disconnect");
  const notionDisconnected = document.getElementById("notion-disconnected");
  const notionConnected = document.getElementById("notion-connected");
  const notionWorkspaceName = document.getElementById("notion-workspace-name");

  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const keyFields = {
    gemini: document.getElementById("field-gemini-key"),
    claude: document.getElementById("field-claude-key"),
    azureOpenAI: document.getElementById("field-azure-key"),
    custom: document.getElementById("field-custom-key")
  };
  const geminiModelField = document.getElementById("field-gemini-model");
  const azureExtra = [
    document.getElementById("field-azure-endpoint"),
    document.getElementById("field-azure-deployment")
  ];
  const customExtra = [
    document.getElementById("field-custom-url"),
    document.getElementById("field-custom-model")
  ];
  const keyInputs = {
    gemini: document.getElementById("key-gemini"),
    claude: document.getElementById("key-claude"),
    azureOpenAI: document.getElementById("key-azure"),
    custom: document.getElementById("key-custom")
  };
  const azureEndpoint = document.getElementById("azure-endpoint");
  const azureDeployment = document.getElementById("azure-deployment");
  const customUrl = document.getElementById("custom-url");
  const customModel = document.getElementById("custom-model");
  const customModelSelect = document.getElementById("custom-model-select");
  const customModelStatus = document.getElementById("custom-model-status");
  const btnLoadModels = document.getElementById("btn-load-models");
  const geminiModel = document.getElementById("gemini-model");
  const targetLangSelect = document.getElementById("target-lang");
  const optPronunciation = document.getElementById("opt-pronunciation");
  const optDefinition = document.getElementById("opt-definition");
  const optExample = document.getElementById("opt-example");
  const optSaveType = document.getElementById("opt-save-type");
  const optWindowMode = document.getElementById("opt-window-mode");
  const btnSave = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");

  // Current translation data (for starring)
  let currentResult = null;

  // --- Populate language dropdowns ---
  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = "Auto-detect";
  sourceLangSelect.appendChild(autoOpt);

  LANGUAGES.forEach((lang) => {
    const opt1 = document.createElement("option");
    opt1.value = lang.code;
    opt1.textContent = lang.name;
    sourceLangSelect.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = lang.code;
    opt2.textContent = lang.name;
    targetLangTranslate.appendChild(opt2);

    const opt3 = document.createElement("option");
    opt3.value = lang.code;
    opt3.textContent = lang.name;
    targetLangSelect.appendChild(opt3);
  });

  // --- Swap button ---
  btnSwap.addEventListener("click", () => {
    const srcVal = sourceLangSelect.value;
    const tgtVal = targetLangTranslate.value;

    if (srcVal === "auto") {
      const detected = detectedLang.textContent;
      if (detected && detected !== "\u2014") {
        const match = LANGUAGES.find(
          (l) => l.name.toLowerCase() === detected.toLowerCase() ||
                 l.code.toLowerCase() === detected.toLowerCase()
        );
        if (match) {
          sourceLangSelect.value = tgtVal;
          targetLangTranslate.value = match.code;
          swapTexts();
          return;
        }
      }
      sourceLangSelect.value = tgtVal;
      targetLangTranslate.value = tgtVal;
      return;
    }

    sourceLangSelect.value = tgtVal;
    targetLangTranslate.value = srcVal;
    swapTexts();
  });

  function swapTexts() {
    const translated = translationOutput.textContent;
    if (translated && resultArea.classList.contains("hidden") === false) {
      const original = sourceText.value;
      sourceText.value = translated;
      translationOutput.textContent = original;
    }
  }

  // --- Tab switching ---
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      Object.entries(tabContents).forEach(([key, el]) => {
        el.classList.toggle("hidden", key !== target);
      });
      if (target === "favorites") renderFavorites();
    });
  });

  // --- Provider radio toggle ---
  function updateProviderFields() {
    const selected = document.querySelector('input[name="provider"]:checked').value;
    Object.entries(keyFields).forEach(([key, el]) => {
      el.classList.toggle("hidden", key !== selected);
    });
    azureExtra.forEach((el) => {
      el.classList.toggle("hidden", selected !== "azureOpenAI");
    });
    customExtra.forEach((el) => {
      el.classList.toggle("hidden", selected !== "custom");
    });
    geminiModelField.classList.toggle("hidden", selected !== "gemini");
  }

  providerRadios.forEach((radio) => {
    radio.addEventListener("change", updateProviderFields);
  });

  // --- Load settings ---
  const settings = await chrome.storage.local.get([
    "provider", "apiKeys", "azureEndpoint", "azureDeployment",
    "customBaseUrl", "customModel", "customModels",
    "geminiModel",
    "targetLang", "sourceLang",
    "optPronunciation", "optDefinition", "optExample", "optSaveType",
    "openInWindow", "popupHeight"
  ]);

  if (settings.provider) {
    const radio = document.querySelector(`input[name="provider"][value="${settings.provider}"]`);
    if (radio) radio.checked = true;
  }

  if (settings.apiKeys) {
    Object.entries(settings.apiKeys).forEach(([key, val]) => {
      if (keyInputs[key]) keyInputs[key].value = val;
    });
  }

  if (settings.azureEndpoint) azureEndpoint.value = settings.azureEndpoint;
  if (settings.azureDeployment) azureDeployment.value = settings.azureDeployment;
  if (settings.customBaseUrl) customUrl.value = settings.customBaseUrl;
  if (settings.customModel) customModel.value = settings.customModel;
  geminiModel.value = settings.geminiModel || DEFAULT_GEMINI_MODEL;
  if (settings.targetLang) {
    targetLangSelect.value = settings.targetLang;
    targetLangTranslate.value = settings.targetLang;
  }
  if (settings.sourceLang) {
    sourceLangSelect.value = settings.sourceLang;
  }

  optPronunciation.checked = settings.optPronunciation !== false;
  optDefinition.checked = settings.optDefinition !== false;
  optExample.checked = settings.optExample !== false;
  if (settings.optSaveType) optSaveType.value = settings.optSaveType;
  optWindowMode.checked = settings.openInWindow === true;

  updateProviderFields();

  // --- Notion state ---
  async function updateNotionUI() {
    const store = await chrome.storage.local.get(["notionToken", "notionWorkspace"]);
    if (store.notionToken) {
      notionDisconnected.classList.add("hidden");
      notionConnected.classList.remove("hidden");
      notionWorkspaceName.textContent = store.notionWorkspace || "Connected";
    } else {
      notionDisconnected.classList.remove("hidden");
      notionConnected.classList.add("hidden");
    }
  }
  await updateNotionUI();

  btnNotionConnect.addEventListener("click", () => {
    btnNotionConnect.disabled = true;
    btnNotionConnect.textContent = "Connecting...";

    chrome.runtime.sendMessage({ type: "notionConnect" }, async (response) => {
      if (chrome.runtime.lastError) {
        btnNotionConnect.disabled = false;
        btnNotionConnect.textContent = "Connect to Notion";
        return;
      }
      if (response && response.error) {
        btnNotionConnect.disabled = false;
        btnNotionConnect.textContent = "Connect to Notion";
        return;
      }
      await updateNotionUI();
      btnNotionConnect.disabled = false;
      btnNotionConnect.textContent = "Connect to Notion";
    });
  });

  btnNotionDisconnect.addEventListener("click", async () => {
    await NotionAPI.disconnect();
    await updateNotionUI();
  });

  // --- Custom API: host permission ---
  // Firefox MV3 treats host_permissions as optional and does NOT grant them at
  // install time, so cross-origin fetches fail with NetworkError until the user
  // approves. Chrome grants them at install, so request() resolves silently.
  // Must be called from a user gesture with no preceding await.
  function requestHostPermission(baseUrl) {
    try {
      const url = new URL(baseUrl.trim());
      if (!/^https?:$/.test(url.protocol)) return Promise.resolve(false);
      // Match patterns cannot carry a port; host-only covers all ports
      const originPattern = `${url.protocol}//${url.hostname}/*`;
      return new Promise((resolve) => {
        chrome.permissions.request({ origins: [originPattern] }, (granted) => {
          resolve(chrome.runtime.lastError ? false : Boolean(granted));
        });
      });
    } catch {
      return Promise.resolve(false);
    }
  }

  // --- Custom API: load model list ---
  function showModelStatus(msg, isError) {
    customModelStatus.textContent = msg;
    customModelStatus.className = isError ? "model-status error" : "model-status";
    customModelStatus.classList.remove("hidden");
  }

  // Swap the free-text input for a real dropdown listing the fetched models.
  // A <datalist> is no good here: browsers filter its options by the input's
  // current text, so once a model name is filled in only that one shows up.
  function showModelSelect(models, selected) {
    while (customModelSelect.firstChild) {
      customModelSelect.removeChild(customModelSelect.firstChild);
    }

    const list = [...models];
    if (selected && !list.includes(selected)) list.unshift(selected);

    for (const id of list) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      customModelSelect.appendChild(opt);
    }
    const manual = document.createElement("option");
    manual.value = "__manual__";
    manual.textContent = "Other (enter manually)...";
    customModelSelect.appendChild(manual);

    customModelSelect.value = selected || list[0];
    customModel.value = customModelSelect.value;
    customModel.classList.add("hidden");
    customModelSelect.classList.remove("hidden");
  }

  // The hidden text input stays the single source of truth for saving
  customModelSelect.addEventListener("change", () => {
    if (customModelSelect.value === "__manual__") {
      customModelSelect.classList.add("hidden");
      customModel.classList.remove("hidden");
      customModel.value = "";
      customModel.focus();
      return;
    }
    customModel.value = customModelSelect.value;
  });

  if (Array.isArray(settings.customModels) && settings.customModels.length > 0) {
    showModelSelect(settings.customModels, settings.customModel || "");
  }

  btnLoadModels.addEventListener("click", async () => {
    const baseUrl = customUrl.value.trim();
    if (!baseUrl) {
      showModelStatus("Enter the API base URL first.", true);
      return;
    }

    const granted = await requestHostPermission(baseUrl);
    if (!granted) {
      showModelStatus("Permission to access this server was declined.", true);
      return;
    }

    btnLoadModels.disabled = true;
    showModelStatus("Loading models...", false);

    chrome.runtime.sendMessage(
      { type: "listModels", baseUrl, apiKey: keyInputs.custom.value.trim() },
      (response) => {
        btnLoadModels.disabled = false;
        if (chrome.runtime.lastError) {
          showModelStatus(chrome.runtime.lastError.message, true);
          return;
        }
        if (!response || response.error) {
          showModelStatus(response?.error || "Failed to load models.", true);
          return;
        }
        if (response.models.length === 0) {
          showModelStatus("Server returned no models. Enter the model name manually.", true);
          return;
        }

        // Cache the list so the dropdown survives popup reopens
        chrome.storage.local.set({ customModels: response.models });
        showModelSelect(response.models, customModel.value.trim());
        showModelStatus(`${response.models.length} models available.`, false);
      }
    );
  });

  // --- Save settings ---
  btnSave.addEventListener("click", async () => {
    const provider = document.querySelector('input[name="provider"]:checked').value;

    // Ask before any await so the user gesture is still valid (Firefox)
    if (provider === "custom" && customUrl.value.trim()) {
      await requestHostPermission(customUrl.value);
    }

    const apiKeys = {};
    Object.entries(keyInputs).forEach(([key, input]) => {
      if (input.value.trim()) apiKeys[key] = input.value.trim();
    });

    await chrome.storage.local.set({
      provider, apiKeys,
      azureEndpoint: azureEndpoint.value.trim(),
      azureDeployment: azureDeployment.value.trim(),
      customBaseUrl: customUrl.value.trim(),
      customModel: customModel.value.trim(),
      geminiModel: geminiModel.value.trim() || DEFAULT_GEMINI_MODEL,
      targetLang: targetLangSelect.value,
      optPronunciation: optPronunciation.checked,
      optDefinition: optDefinition.checked,
      optExample: optExample.checked,
      optSaveType: optSaveType.value,
      openInWindow: optWindowMode.checked
    });

    targetLangTranslate.value = targetLangSelect.value;

    saveStatus.classList.remove("hidden");
    setTimeout(() => saveStatus.classList.add("hidden"), 2000);
  });

  // --- Persist language selections on change ---
  sourceLangSelect.addEventListener("change", () => {
    chrome.storage.local.set({ sourceLang: sourceLangSelect.value });
  });
  targetLangTranslate.addEventListener("change", () => {
    chrome.storage.local.set({ targetLang: targetLangTranslate.value });
    targetLangSelect.value = targetLangTranslate.value;
  });

  // --- Translate ---
  function showLoading(show) {
    loading.classList.toggle("hidden", !show);
    btnTranslate.disabled = show;
  }

  function showResult(data) {
    errorArea.classList.add("hidden");
    resultArea.classList.remove("hidden");
    detectedLang.textContent = data.detectedLanguage || "unknown";
    translationOutput.textContent = data.translation || "";

    // Store current result for starring
    currentResult = {
      sourceText: sourceText.value.trim(),
      ...data
    };

    // Check if already in favorites
    chrome.storage.local.get("favorites", (store) => {
      const favorites = store.favorites || [];
      const exists = favorites.some(
        (f) => f.sourceText.toLowerCase() === currentResult.sourceText.toLowerCase()
      );
      btnFav.classList.toggle("saved", exists);
    });

    // CEFR badge
    if (data.cefr && data.cefr !== "null") {
      cefrBadge.textContent = data.cefr;
      cefrBadge.className = "cefr-badge cefr-" + data.cefr.toLowerCase().replace("+", "p");
      cefrArea.classList.remove("hidden");
    } else {
      cefrArea.classList.add("hidden");
    }

    if (data.pronunciation) {
      pronunciationOutput.textContent = data.pronunciation;
      pronunciationArea.classList.remove("hidden");
    } else {
      pronunciationArea.classList.add("hidden");
    }

    if (data.definition) {
      definitionOutput.textContent = data.definition;
      definitionArea.classList.remove("hidden");
    } else {
      definitionArea.classList.add("hidden");
    }

    if (data.example) {
      exampleOutput.textContent = data.exampleTranslation
        ? `${data.example}\n${data.exampleTranslation}`
        : data.example;
      exampleArea.classList.remove("hidden");
    } else {
      exampleArea.classList.add("hidden");
    }
  }

  function showError(msg) {
    resultArea.classList.add("hidden");
    errorArea.classList.remove("hidden");
    errorMsg.textContent = msg;
  }

  // Enter translates; Shift+Enter inserts a newline. isComposing guards IME
  // input (confirming a CJK composition with Enter must not trigger translate).
  sourceText.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      btnTranslate.click();
    }
  });

  btnTranslate.addEventListener("click", async () => {
    const text = sourceText.value.trim();
    if (!text) return;

    showLoading(true);
    resultArea.classList.add("hidden");
    errorArea.classList.add("hidden");

    const sourceLang = sourceLangSelect.value;
    const targetLang = targetLangTranslate.value;

    chrome.runtime.sendMessage(
      { type: "translate", text, sourceLang, targetLang },
      (response) => {
        showLoading(false);
        if (chrome.runtime.lastError) {
          showError(chrome.runtime.lastError.message);
          return;
        }
        if (response.error) {
          showError(response.error);
        } else {
          showResult(response);
        }
      }
    );
  });

  // --- Favorite star button ---
  btnFav.addEventListener("click", async () => {
    if (!currentResult) return;

    const saved = await saveFavorite(currentResult);
    if (saved) {
      btnFav.classList.add("saved");
    }
  });

  // --- Favorites storage ---
  function isWordOrPhrase(text) {
    const words = text.trim().split(/\s+/);
    return words.length <= 5;
  }

  async function saveFavorite(data) {
    const store = await chrome.storage.local.get(["favorites", "optSaveType"]);
    const favorites = store.favorites || [];
    const saveType = store.optSaveType || "all";

    // Check save type filter
    if (saveType === "word" && !isWordOrPhrase(data.sourceText)) {
      return false;
    }

    // Prevent duplicate — increment lookup count instead
    const existingIdx = favorites.findIndex(
      (f) => f.sourceText.toLowerCase() === data.sourceText.toLowerCase()
    );
    if (existingIdx !== -1) {
      favorites[existingIdx].lookupCount = (favorites[existingIdx].lookupCount || 1) + 1;
      if (data.cefr) favorites[existingIdx].cefr = data.cefr;
      await chrome.storage.local.set({ favorites });
      return true;
    }

    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      sourceText: data.sourceText,
      translation: data.translation,
      detectedLanguage: data.detectedLanguage,
      pronunciation: data.pronunciation || null,
      definition: data.definition || null,
      example: data.example || null,
      exampleTranslation: data.exampleTranslation || null,
      cefr: data.cefr || null,
      type: isWordOrPhrase(data.sourceText) ? "word" : "sentence",
      lookupCount: 1
    };

    favorites.unshift(entry);
    await chrome.storage.local.set({ favorites });
    return true;
  }

  async function deleteFavorite(id) {
    const store = await chrome.storage.local.get("favorites");
    const favorites = (store.favorites || []).filter((f) => f.id !== id);
    await chrome.storage.local.set({ favorites });
    renderFavorites();
  }

  async function renderFavorites() {
    const store = await chrome.storage.local.get("favorites");
    let favorites = store.favorites || [];

    // Apply type filter
    const typeFilter = favFilter.value;
    if (typeFilter !== "all") {
      favorites = favorites.filter((f) => f.type === typeFilter);
    }

    // Apply date filter
    const dateFilter = favDateFilter.value;
    if (dateFilter !== "all") {
      const now = new Date();
      let cutoff;
      if (dateFilter === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "week") {
        cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - 7);
      } else if (dateFilter === "month") {
        cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - 1);
      }
      favorites = favorites.filter((f) => new Date(f.timestamp) >= cutoff);
    }

    // Clear list
    while (favList.firstChild) favList.removeChild(favList.firstChild);

    if (favorites.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fav-empty";
      empty.textContent = "No saved items yet.";
      favList.appendChild(empty);
      return;
    }

    // Group by date
    const groups = {};
    for (const fav of favorites) {
      const date = new Date(fav.timestamp).toLocaleDateString();
      if (!groups[date]) groups[date] = [];
      groups[date].push(fav);
    }

    for (const [date, items] of Object.entries(groups)) {
      const dateHeader = document.createElement("div");
      dateHeader.className = "fav-date-header";
      dateHeader.textContent = date;
      favList.appendChild(dateHeader);

      for (const fav of items) {
        const item = document.createElement("div");
        item.className = "fav-item";

        // Header row
        const header = document.createElement("div");
        header.className = "fav-item-header";

        const src = document.createElement("span");
        src.className = "fav-source";
        src.textContent = fav.sourceText;

        const delBtn = document.createElement("button");
        delBtn.className = "fav-delete";
        delBtn.textContent = "\u00D7";
        delBtn.addEventListener("click", () => deleteFavorite(fav.id));

        header.appendChild(src);
        header.appendChild(delBtn);
        item.appendChild(header);

        // Translation
        const trans = document.createElement("div");
        trans.className = "fav-translation";
        trans.textContent = fav.translation;
        item.appendChild(trans);

        // Pronunciation
        if (fav.pronunciation) {
          const pron = document.createElement("div");
          pron.className = "fav-pronunciation";
          pron.textContent = fav.pronunciation;
          item.appendChild(pron);
        }

        // Definition
        if (fav.definition) {
          const def = document.createElement("div");
          def.className = "fav-definition";
          def.textContent = fav.definition;
          item.appendChild(def);
        }

        // Example
        if (fav.example) {
          const ex = document.createElement("div");
          ex.className = "fav-example";
          ex.textContent = fav.exampleTranslation
            ? `${fav.example} — ${fav.exampleTranslation}`
            : fav.example;
          item.appendChild(ex);
        }

        // Meta
        const meta = document.createElement("div");
        meta.className = "fav-meta";
        const time = new Date(fav.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const badge = fav.type === "word" ? "word/phrase" : "sentence";
        const cefrText = fav.cefr ? ` \u00B7 ${fav.cefr}` : "";
        const countText = fav.lookupCount > 1 ? ` \u00B7 ${fav.lookupCount}x` : "";
        meta.textContent = `${time} \u00B7 ${badge}${cefrText}${countText}`;
        item.appendChild(meta);

        favList.appendChild(item);
      }
    }
  }

  // Favorite filter events
  favFilter.addEventListener("change", renderFavorites);
  favDateFilter.addEventListener("change", renderFavorites);

  // Export favorites
  btnExportFav.addEventListener("click", async () => {
    const store = await chrome.storage.local.get("favorites");
    const favorites = store.favorites || [];
    if (favorites.length === 0) return;

    let text = "AI Translate - Favorites\n";
    text += "========================\n\n";
    for (const fav of favorites) {
      text += `[${new Date(fav.timestamp).toLocaleString()}]\n`;
      text += `Source: ${fav.sourceText}\n`;
      text += `Translation: ${fav.translation}\n`;
      if (fav.pronunciation) text += `Pronunciation: ${fav.pronunciation}\n`;
      if (fav.definition) text += `Definition: ${fav.definition}\n`;
      if (fav.example) {
        text += `Example: ${fav.example}\n`;
        if (fav.exampleTranslation) text += `Example Translation: ${fav.exampleTranslation}\n`;
      }
      text += "\n";
    }

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-translate-favorites-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Export to Notion
  function showNotionStatus(msg, isError) {
    notionExportStatus.textContent = msg;
    notionExportStatus.className = isError ? "notion-status error" : "notion-status success";
    notionExportStatus.classList.remove("hidden");
    setTimeout(() => notionExportStatus.classList.add("hidden"), 4000);
  }

  const notionTemplate = document.getElementById("notion-template");

  btnExportNotion.addEventListener("click", async () => {
    const store = await chrome.storage.local.get(["notionToken", "favorites"]);
    const favorites = store.favorites || [];

    if (!store.notionToken) {
      showNotionStatus("Please connect to Notion first in Settings.", true);
      return;
    }
    if (favorites.length === 0) {
      showNotionStatus("No favorites to export.", true);
      return;
    }

    const template = notionTemplate.value;
    btnExportNotion.disabled = true;
    btnExportNotion.textContent = "Exporting...";

    try {
      let count;
      switch (template) {
        case "database":
          count = await NotionAPI.exportDatabase(store.notionToken, favorites);
          break;
        case "report":
          count = await NotionAPI.exportReport(store.notionToken, favorites);
          break;
        case "flashcard":
          count = await NotionAPI.exportFlashcards(store.notionToken, favorites);
          break;
      }
      showNotionStatus(`Exported ${count} items to Notion.`, false);
    } catch (err) {
      showNotionStatus("Export failed: " + err.message, true);
    }

    btnExportNotion.disabled = false;
    btnExportNotion.textContent = "Export to Notion";
  });

  // Clear all favorites
  btnClearFav.addEventListener("click", async () => {
    if (!confirm("Delete all saved favorites?")) return;
    await chrome.storage.local.set({ favorites: [] });
    renderFavorites();
  });

  // --- Check for pending context menu result ---
  const session = await chrome.storage.local.get("pendingResult");
  if (session.pendingResult) {
    const pending = session.pendingResult;
    sourceText.value = pending.sourceText || "";
    if (pending.error) {
      showError(pending.error);
    } else {
      showResult(pending);
    }
    chrome.runtime.sendMessage({ type: "clearPending" });
  }

  // --- Listen for save-favorite messages from content script ---
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "favoriteSaved") {
      // Refresh favorites if tab is active
      if (!tabContents.favorites.classList.contains("hidden")) {
        renderFavorites();
      }
    }
  });

  // --- Popup height / standalone window ---
  const MIN_POPUP_HEIGHT = 250;
  const MAX_POPUP_HEIGHT = 560; // browsers cap popups at 600px total

  function applyPopupHeight(height) {
    container.style.height = `${height}px`;
    container.style.maxHeight = "none";
  }

  if (!isWindowed) {
    // Restore the height the user chose by dragging the grip
    if (settings.popupHeight) {
      applyPopupHeight(settings.popupHeight);
    }

    let dragStartY = 0;
    let dragStartHeight = 0;

    resizeGrip.addEventListener("pointerdown", (e) => {
      dragStartY = e.clientY;
      dragStartHeight = container.getBoundingClientRect().height;
      resizeGrip.classList.add("dragging");
      resizeGrip.setPointerCapture(e.pointerId);
    });

    resizeGrip.addEventListener("pointermove", (e) => {
      if (!resizeGrip.classList.contains("dragging")) return;
      const height = Math.min(
        MAX_POPUP_HEIGHT,
        Math.max(MIN_POPUP_HEIGHT, dragStartHeight + (e.clientY - dragStartY))
      );
      applyPopupHeight(height);
    });

    resizeGrip.addEventListener("pointerup", (e) => {
      if (!resizeGrip.classList.contains("dragging")) return;
      resizeGrip.classList.remove("dragging");
      resizeGrip.releasePointerCapture(e.pointerId);
      chrome.storage.local.set({
        popupHeight: Math.round(container.getBoundingClientRect().height)
      });
    });

    // Double-click resets to automatic height
    resizeGrip.addEventListener("dblclick", () => {
      container.style.height = "";
      container.style.maxHeight = "";
      chrome.storage.local.remove("popupHeight");
    });
  } else {
    // Standalone window: the OS handles resizing — just remember the size
    let boundsTimer;
    window.addEventListener("resize", () => {
      clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        chrome.storage.local.set({
          windowBounds: { width: window.outerWidth, height: window.outerHeight }
        });
      }, 400);
    });

    // The window stays open, so show context-menu translations as they arrive
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.pendingResult?.newValue) return;
      const pending = changes.pendingResult.newValue;
      sourceText.value = pending.sourceText || "";
      if (pending.error) {
        showError(pending.error);
      } else {
        showResult(pending);
      }
      chrome.runtime.sendMessage({ type: "clearPending" });
    });
  }

  // --- Focus the input so the user can type immediately ---
  // Deferred: browsers move focus into the popup after DOMContentLoaded,
  // so an immediate focus() call gets stolen.
  const end = sourceText.value.length;
  sourceText.setSelectionRange(end, end);
  sourceText.focus();
  setTimeout(() => sourceText.focus(), 100);
});
