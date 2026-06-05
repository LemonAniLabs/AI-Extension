import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


class GeminiModelSettingTests(unittest.TestCase):
    def test_settings_ui_exposes_editable_gemini_model_default(self):
        html = read("popup/popup.html")

        self.assertIn('id="field-gemini-model"', html)
        self.assertIn('id="gemini-model"', html)
        self.assertIn('value="gemini-2.5-flash"', html)

    def test_popup_persists_gemini_model_setting(self):
        js = read("popup/popup.js")

        self.assertIn('const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";', js)
        self.assertIn('const geminiModel = document.getElementById("gemini-model");', js)
        self.assertIn('"geminiModel"', js)
        self.assertIn('geminiModel: geminiModel.value.trim() || DEFAULT_GEMINI_MODEL', js)

    def test_service_worker_passes_gemini_model_to_provider(self):
        js = read("background/service-worker.js")

        self.assertIn('"geminiModel"', js)
        self.assertIn('const geminiModel = settings.geminiModel || "gemini-2.5-flash";', js)
        self.assertIn('providers.gemini(apiKey, text, targetName, sourceName, options, geminiModel)', js)

    def test_provider_uses_configurable_gemini_model_with_default(self):
        for rel_path in ("lib/providers.module.js", "lib/providers.js"):
            with self.subTest(rel_path=rel_path):
                js = read(rel_path)
                self.assertIn('const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";', js)
                self.assertIn('async gemini(apiKey, text, targetLang, sourceLang, options, model = DEFAULT_GEMINI_MODEL)', js)
                self.assertIn('const normalizedModel = (model || DEFAULT_GEMINI_MODEL).replace(/^models\\//, "");', js)
                self.assertIn('models/${encodeURIComponent(normalizedModel)}:generateContent', js)


if __name__ == "__main__":
    unittest.main()
