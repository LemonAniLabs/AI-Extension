(() => {
  if (window.__aitLoaded) return;
  window.__aitLoaded = true;

  let triggerEl = null;
  let panelEl = null;
  let selectedText = "";

  // ===== DOM helpers =====
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") node.className = v;
        else if (k === "textContent") node.textContent = v;
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      for (const child of children) {
        if (typeof child === "string") {
          node.appendChild(document.createTextNode(child));
        } else if (child) {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, v);
      }
    }
    return node;
  }

  function buildLangSelect(id, includeAuto) {
    const select = el("select", { className: "ait-lang-select", id });
    if (includeAuto) {
      select.appendChild(el("option", { value: "auto", textContent: "Auto-detect" }));
    }
    for (const lang of LANGUAGES) {
      select.appendChild(el("option", { value: lang.code, textContent: lang.name }));
    }
    return select;
  }

  // ===== Trigger Icon =====
  function createTrigger() {
    if (triggerEl) return triggerEl;
    triggerEl = el("div", { id: "ait-trigger" });

    const svg = svgEl("svg", { viewBox: "0 0 24 24" });
    svg.appendChild(svgEl("path", {
      d: "M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"
    }));
    triggerEl.appendChild(svg);

    triggerEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    triggerEl.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTrigger();
      showPanel(selectedText);
    });
    document.body.appendChild(triggerEl);
    return triggerEl;
  }

  function showTrigger(x, y) {
    const trigger = createTrigger();
    trigger.style.left = `${x}px`;
    trigger.style.top = `${y}px`;
    trigger.style.display = "flex";
  }

  function hideTrigger() {
    if (triggerEl) triggerEl.style.display = "none";
  }

  // ===== Selection listener =====
  document.addEventListener("mouseup", (e) => {
    if (e.target.closest("#ait-trigger") || e.target.closest("#ait-panel")) return;

    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel.toString().trim();
      if (text.length > 0) {
        selectedText = text;
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = rect.right + window.scrollX + 4;
        const y = rect.bottom + window.scrollY + 4;
        showTrigger(x, y);
      } else {
        hideTrigger();
      }
    }, 10);
  });

  // Hide trigger and panel when clicking elsewhere
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest("#ait-trigger") && !e.target.closest("#ait-panel")) {
      hideTrigger();
      hidePanel();
    }
  });

  // ===== Inline Panel =====
  function createPanel() {
    if (panelEl) {
      panelEl.style.display = "block";
      return panelEl;
    }

    // Build header
    const closeBtn = el("button", { className: "ait-close", textContent: "\u00D7" });
    const header = el("div", { className: "ait-header" }, [
      el("span", { className: "ait-header-title", textContent: "AI Translate" }),
      closeBtn
    ]);

    // Language bar
    const sourceLangSel = buildLangSelect("ait-source-lang", true);
    const targetLangSel = buildLangSelect("ait-target-lang", false);
    const swapBtn = el("button", { className: "ait-btn-swap", title: "Swap languages", textContent: "\u21C6" });
    const langBar = el("div", { className: "ait-lang-bar" }, [sourceLangSel, swapBtn, targetLangSel]);

    // Source text
    const sourceTextarea = el("textarea", { className: "ait-textarea", id: "ait-source-text", rows: "3" });
    const sourceField = el("div", { className: "ait-field" }, [
      el("label", { className: "ait-label", textContent: "Source" }),
      sourceTextarea
    ]);

    // Translate button
    const translateBtn = el("button", { className: "ait-btn-translate", id: "ait-btn-translate", textContent: "Translate" });

    // Loading
    const loadingEl = el("div", { className: "ait-loading ait-hidden", id: "ait-loading" }, [
      el("div", { className: "ait-spinner" }),
      el("span", { textContent: "Translating..." })
    ]);

    // Result area
    const detectedLangSpan = el("span", { id: "ait-detected-lang", textContent: "\u2014" });
    const outputDiv = el("div", { className: "ait-output", id: "ait-output" });
    const pronunciationDiv = el("div", { className: "ait-extra-box ait-pronunciation", id: "ait-pronunciation" });
    const definitionDiv = el("div", { className: "ait-extra-box", id: "ait-definition" });
    const exampleDiv = el("div", { className: "ait-extra-box", id: "ait-example" });

    const resultEl = el("div", { id: "ait-result", className: "ait-hidden" }, [
      el("div", { className: "ait-detected" }, [
        document.createTextNode("Detected: "),
        detectedLangSpan
      ]),
      el("div", { className: "ait-field" }, [
        el("label", { className: "ait-label", textContent: "Translation" }),
        outputDiv
      ]),
      el("div", { id: "ait-pronunciation-area", className: "ait-extra ait-hidden" }, [
        el("label", { className: "ait-label", textContent: "Pronunciation" }),
        pronunciationDiv
      ]),
      el("div", { id: "ait-definition-area", className: "ait-extra ait-hidden" }, [
        el("label", { className: "ait-label", textContent: "Definition" }),
        definitionDiv
      ]),
      el("div", { id: "ait-example-area", className: "ait-extra ait-hidden" }, [
        el("label", { className: "ait-label", textContent: "Example" }),
        exampleDiv
      ])
    ]);

    // Error
    const errorDiv = el("div", { id: "ait-error", className: "ait-hidden ait-error" });

    // Body
    const body = el("div", { className: "ait-body" }, [
      langBar, sourceField, translateBtn, loadingEl, resultEl, errorDiv
    ]);

    // Assemble panel
    panelEl = el("div", { id: "ait-panel" }, [header, body]);
    document.body.appendChild(panelEl);

    // Close button
    closeBtn.addEventListener("click", () => hidePanel());

    // Swap button
    swapBtn.addEventListener("click", () => {
      const srcVal = sourceLangSel.value;
      const tgtVal = targetLangSel.value;

      if (srcVal === "auto") {
        const detected = detectedLangSpan.textContent;
        if (detected && detected !== "\u2014") {
          const match = LANGUAGES.find(
            (l) => l.name.toLowerCase() === detected.toLowerCase() ||
                   l.code.toLowerCase() === detected.toLowerCase()
          );
          if (match) {
            sourceLangSel.value = tgtVal;
            targetLangSel.value = match.code;
            swapPanelTexts();
            return;
          }
        }
        sourceLangSel.value = tgtVal;
        return;
      }

      sourceLangSel.value = tgtVal;
      targetLangSel.value = srcVal;
      swapPanelTexts();

      chrome.storage.local.set({
        sourceLang: sourceLangSel.value,
        targetLang: targetLangSel.value
      });
    });

    // Translate button
    translateBtn.addEventListener("click", () => {
      const text = sourceTextarea.value.trim();
      if (!text) return;
      doTranslateInPanel(text);
    });

    // Persist language selections on change
    sourceLangSel.addEventListener("change", (e) => {
      chrome.storage.local.set({ sourceLang: e.target.value });
    });
    targetLangSel.addEventListener("change", (e) => {
      chrome.storage.local.set({ targetLang: e.target.value });
    });

    // Dragging
    makeDraggable(panelEl, header);

    // Prevent clicks inside panel from closing it
    panelEl.addEventListener("mousedown", (e) => e.stopPropagation());

    return panelEl;
  }

  function swapPanelTexts() {
    const srcTextEl = panelEl.querySelector("#ait-source-text");
    const outputEl = panelEl.querySelector("#ait-output");
    const resultEl = panelEl.querySelector("#ait-result");
    if (!resultEl.classList.contains("ait-hidden") && outputEl.textContent) {
      const oldSrc = srcTextEl.value;
      srcTextEl.value = outputEl.textContent;
      outputEl.textContent = oldSrc;
    }
  }

  function showPanel(text) {
    const panel = createPanel();

    const sel = window.getSelection();
    let x = window.innerWidth / 2 - 190 + window.scrollX;
    let y = window.innerHeight / 2 - 150 + window.scrollY;

    if (sel.rangeCount > 0) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      x = rect.left + window.scrollX;
      y = rect.bottom + window.scrollY + 8;

      if (x + 380 > window.innerWidth + window.scrollX) {
        x = window.innerWidth + window.scrollX - 390;
      }
      if (x < window.scrollX) x = window.scrollX + 10;
    }

    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.display = "block";

    const srcTextEl = panel.querySelector("#ait-source-text");
    srcTextEl.value = text;

    panel.querySelector("#ait-result").classList.add("ait-hidden");
    panel.querySelector("#ait-error").classList.add("ait-hidden");
    panel.querySelector("#ait-loading").classList.add("ait-hidden");

    chrome.storage.local.get(["sourceLang", "targetLang"], (settings) => {
      if (settings.sourceLang) {
        panel.querySelector("#ait-source-lang").value = settings.sourceLang;
      }
      if (settings.targetLang) {
        panel.querySelector("#ait-target-lang").value = settings.targetLang;
      }
      if (text) {
        doTranslateInPanel(text);
      }
    });
  }

  function hidePanel() {
    if (panelEl) panelEl.style.display = "none";
  }

  function doTranslateInPanel(text) {
    const loadingEl = panelEl.querySelector("#ait-loading");
    const resultEl = panelEl.querySelector("#ait-result");
    const errorEl = panelEl.querySelector("#ait-error");
    const btnEl = panelEl.querySelector("#ait-btn-translate");

    loadingEl.classList.remove("ait-hidden");
    resultEl.classList.add("ait-hidden");
    errorEl.classList.add("ait-hidden");
    btnEl.disabled = true;

    const sourceLang = panelEl.querySelector("#ait-source-lang").value;
    const targetLang = panelEl.querySelector("#ait-target-lang").value;

    chrome.runtime.sendMessage(
      { type: "translate", text, sourceLang, targetLang },
      (response) => {
        loadingEl.classList.add("ait-hidden");
        btnEl.disabled = false;

        if (chrome.runtime.lastError) {
          errorEl.textContent = chrome.runtime.lastError.message;
          errorEl.classList.remove("ait-hidden");
          return;
        }

        if (response.error) {
          errorEl.textContent = response.error;
          errorEl.classList.remove("ait-hidden");
        } else {
          panelEl.querySelector("#ait-detected-lang").textContent =
            response.detectedLanguage || "unknown";
          panelEl.querySelector("#ait-output").textContent =
            response.translation || "";

          const pronArea = panelEl.querySelector("#ait-pronunciation-area");
          if (response.pronunciation) {
            panelEl.querySelector("#ait-pronunciation").textContent = response.pronunciation;
            pronArea.classList.remove("ait-hidden");
          } else {
            pronArea.classList.add("ait-hidden");
          }

          const defArea = panelEl.querySelector("#ait-definition-area");
          if (response.definition) {
            panelEl.querySelector("#ait-definition").textContent = response.definition;
            defArea.classList.remove("ait-hidden");
          } else {
            defArea.classList.add("ait-hidden");
          }

          const exArea = panelEl.querySelector("#ait-example-area");
          if (response.example) {
            panelEl.querySelector("#ait-example").textContent = response.exampleTranslation
              ? `${response.example}\n${response.exampleTranslation}`
              : response.example;
            exArea.classList.remove("ait-hidden");
          } else {
            exArea.classList.add("ait-hidden");
          }

          resultEl.classList.remove("ait-hidden");
        }
      }
    );
  }

  // ===== Draggable =====
  function makeDraggable(dragEl, handle) {
    let isDragging = false;
    let startX, startY, origX, origY;

    handle.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = parseInt(dragEl.style.left, 10) || 0;
      origY = parseInt(dragEl.style.top, 10) || 0;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      dragEl.style.left = `${origX + (e.clientX - startX)}px`;
      dragEl.style.top = `${origY + (e.clientY - startY)}px`;
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  // ===== Keyboard shortcut =====
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.type === "getSelection") {
      sendResponse({ text: window.getSelection().toString() });
    }
    if (request.type === "translateSelection") {
      const text = window.getSelection().toString().trim();
      if (text) {
        showPanel(text);
      }
    }
  });

  // Close panel on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panelEl && panelEl.style.display !== "none") {
      hidePanel();
    }
  });
})();
