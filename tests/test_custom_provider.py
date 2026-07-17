import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


class CustomProviderTests(unittest.TestCase):
    def test_settings_ui_exposes_custom_provider_fields(self):
        html = read("popup/popup.html")

        self.assertIn('value="custom"', html)
        self.assertIn('id="field-custom-url"', html)
        self.assertIn('id="custom-url"', html)
        self.assertIn('id="field-custom-key"', html)
        self.assertIn('id="key-custom"', html)
        self.assertIn('id="field-custom-model"', html)
        self.assertIn('id="custom-model"', html)
        self.assertIn('id="btn-load-models"', html)
        self.assertIn('id="custom-model-select"', html)
        self.assertIn('class="field-hint"', html)

    def test_popup_persists_custom_provider_settings(self):
        js = read("popup/popup.js")

        self.assertIn('custom: document.getElementById("key-custom")', js)
        self.assertIn('"customBaseUrl", "customModel"', js)
        self.assertIn('customBaseUrl: customUrl.value.trim()', js)
        self.assertIn('customModel: customModel.value.trim()', js)

    def test_popup_loads_models_via_service_worker(self):
        js = read("popup/popup.js")

        self.assertIn('{ type: "listModels", baseUrl, apiKey: keyInputs.custom.value.trim() }', js)

    def test_model_dropdown_is_a_select_not_a_datalist(self):
        html = read("popup/popup.html")
        js = read("popup/popup.js")

        self.assertNotIn("datalist", html)
        # cached list restores the dropdown on popup reopen
        self.assertIn('"customModels"', js)
        self.assertIn("chrome.storage.local.set({ customModels: response.models })", js)
        # manual-entry escape hatch from the select
        self.assertIn('"__manual__"', js)

    def test_service_worker_routes_custom_provider(self):
        js = read("background/service-worker.js")

        self.assertIn('"customBaseUrl"', js)
        self.assertIn('"customModel"', js)
        self.assertIn('case "custom":', js)
        self.assertIn('settings.customBaseUrl, settings.customModel', js)
        self.assertIn('if (!apiKey && provider !== "custom")', js)
        self.assertIn('if (message.type === "listModels")', js)
        self.assertIn('listCustomModels(message.baseUrl, message.apiKey)', js)

    def test_provider_implements_openai_compatible_endpoint(self):
        for rel_path in ("lib/providers.module.js", "lib/providers.js"):
            with self.subTest(rel_path=rel_path):
                js = read(rel_path)
                self.assertIn('async custom(apiKey, text, targetLang, sourceLang, options, baseUrl, model)', js)
                self.assertIn('function normalizeBaseUrl(baseUrl)', js)
                self.assertIn('.replace(/\\/+$/, "").replace(/\\/v1$/, "")', js)
                self.assertIn('${base}/v1/chat/completions', js)
                self.assertIn('${base}/v1/models', js)
                self.assertIn('if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;', js)

    def test_manifest_allows_custom_endpoints(self):
        manifest = read("manifest.json")

        self.assertIn('"http://*/*"', manifest)
        self.assertIn('"https://*/*"', manifest)


if __name__ == "__main__":
    unittest.main()
