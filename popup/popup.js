document.addEventListener("DOMContentLoaded", async () => {
  // --- Elements ---
  const tabs = document.querySelectorAll(".tab");
  const tabContents = {
    translate: document.getElementById("tab-translate"),
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

  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const keyFields = {
    gemini: document.getElementById("field-gemini-key"),
    claude: document.getElementById("field-claude-key"),
    azureOpenAI: document.getElementById("field-azure-key")
  };
  const azureExtra = [
    document.getElementById("field-azure-endpoint"),
    document.getElementById("field-azure-deployment")
  ];
  const keyInputs = {
    gemini: document.getElementById("key-gemini"),
    claude: document.getElementById("key-claude"),
    azureOpenAI: document.getElementById("key-azure")
  };
  const azureEndpoint = document.getElementById("azure-endpoint");
  const azureDeployment = document.getElementById("azure-deployment");
  const targetLangSelect = document.getElementById("target-lang");
  const optPronunciation = document.getElementById("opt-pronunciation");
  const optDefinition = document.getElementById("opt-definition");
  const optExample = document.getElementById("opt-example");
  const pronunciationArea = document.getElementById("pronunciation-area");
  const pronunciationOutput = document.getElementById("pronunciation-output");
  const definitionArea = document.getElementById("definition-area");
  const definitionOutput = document.getElementById("definition-output");
  const exampleArea = document.getElementById("example-area");
  const exampleOutput = document.getElementById("example-output");
  const btnSave = document.getElementById("btn-save");
  const saveStatus = document.getElementById("save-status");

  // --- Populate language dropdowns ---
  // Source lang has "Auto-detect" option
  const autoOpt = document.createElement("option");
  autoOpt.value = "auto";
  autoOpt.textContent = "Auto-detect";
  sourceLangSelect.appendChild(autoOpt);

  LANGUAGES.forEach((lang) => {
    // Source lang dropdown
    const opt1 = document.createElement("option");
    opt1.value = lang.code;
    opt1.textContent = lang.name;
    sourceLangSelect.appendChild(opt1);

    // Target lang dropdown (translate tab)
    const opt2 = document.createElement("option");
    opt2.value = lang.code;
    opt2.textContent = lang.name;
    targetLangTranslate.appendChild(opt2);

    // Target lang dropdown (settings tab)
    const opt3 = document.createElement("option");
    opt3.value = lang.code;
    opt3.textContent = lang.name;
    targetLangSelect.appendChild(opt3);
  });

  // --- Swap button ---
  btnSwap.addEventListener("click", () => {
    const srcVal = sourceLangSelect.value;
    const tgtVal = targetLangTranslate.value;

    // Can't swap if source is auto-detect
    if (srcVal === "auto") {
      // If we have a detected language from a previous translation, use that
      const detected = detectedLang.textContent;
      if (detected && detected !== "—") {
        // Try to find the detected language in our list
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
      // Default: just set source to target, target stays
      sourceLangSelect.value = tgtVal;
      targetLangTranslate.value = tgtVal;
      return;
    }

    sourceLangSelect.value = tgtVal;
    targetLangTranslate.value = srcVal;
    swapTexts();
  });

  function swapTexts() {
    // Swap source text and translation output
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
  }

  providerRadios.forEach((radio) => {
    radio.addEventListener("change", updateProviderFields);
  });

  // --- Load settings ---
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
  if (settings.targetLang) {
    targetLangSelect.value = settings.targetLang;
    targetLangTranslate.value = settings.targetLang;
  }
  if (settings.sourceLang) {
    sourceLangSelect.value = settings.sourceLang;
  }

  // Load option toggles (default true)
  optPronunciation.checked = settings.optPronunciation !== false;
  optDefinition.checked = settings.optDefinition !== false;
  optExample.checked = settings.optExample !== false;

  updateProviderFields();

  // --- Save settings ---
  btnSave.addEventListener("click", async () => {
    const provider = document.querySelector('input[name="provider"]:checked').value;
    const apiKeys = {};
    Object.entries(keyInputs).forEach(([key, input]) => {
      if (input.value.trim()) apiKeys[key] = input.value.trim();
    });

    await chrome.storage.local.set({
      provider,
      apiKeys,
      azureEndpoint: azureEndpoint.value.trim(),
      azureDeployment: azureDeployment.value.trim(),
      targetLang: targetLangSelect.value,
      optPronunciation: optPronunciation.checked,
      optDefinition: optDefinition.checked,
      optExample: optExample.checked
    });

    // Sync translate tab target lang
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

    // Pronunciation
    if (data.pronunciation) {
      pronunciationOutput.textContent = data.pronunciation;
      pronunciationArea.classList.remove("hidden");
    } else {
      pronunciationArea.classList.add("hidden");
    }

    // Definition
    if (data.definition) {
      definitionOutput.textContent = data.definition;
      definitionArea.classList.remove("hidden");
    } else {
      definitionArea.classList.add("hidden");
    }

    // Example
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
});
