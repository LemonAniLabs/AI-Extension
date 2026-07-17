import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


class PopupUxTests(unittest.TestCase):
    def test_popup_translates_on_enter_with_ime_guard(self):
        js = read("popup/popup.js")

        self.assertIn('sourceText.addEventListener("keydown"', js)
        self.assertIn('e.key === "Enter" && !e.shiftKey && !e.isComposing', js)
        self.assertIn("btnTranslate.click()", js)

    def test_inline_panel_translates_on_enter_with_ime_guard(self):
        js = read("content/content.js")

        self.assertIn('sourceTextarea.addEventListener("keydown"', js)
        self.assertIn('e.key === "Enter" && !e.shiftKey && !e.isComposing', js)
        self.assertIn("translateBtn.click()", js)

    def test_popup_autofocuses_source_input(self):
        html = read("popup/popup.html")
        js = read("popup/popup.js")

        self.assertIn('id="source-text" rows="4" autofocus', html)
        self.assertIn("sourceText.setSelectionRange(end, end)", js)
        self.assertIn("sourceText.focus()", js)
        self.assertIn("setTimeout(() => sourceText.focus(), 100)", js)


if __name__ == "__main__":
    unittest.main()
