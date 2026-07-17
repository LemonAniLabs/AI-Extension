import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


class ResizableHeightTests(unittest.TestCase):
    def test_popup_has_resize_grip(self):
        html = read("popup/popup.html")
        css = read("popup/popup.css")

        self.assertIn('id="resize-grip"', html)
        self.assertIn("#resize-grip", css)
        self.assertIn("cursor: ns-resize", css)

    def test_popup_persists_dragged_height(self):
        js = read("popup/popup.js")

        self.assertIn('resizeGrip.addEventListener("pointerdown"', js)
        self.assertIn("popupHeight: Math.round(container.getBoundingClientRect().height)", js)
        self.assertIn("if (settings.popupHeight) {", js)
        self.assertIn('chrome.storage.local.remove("popupHeight")', js)  # double-click reset


class StandaloneWindowTests(unittest.TestCase):
    def test_settings_ui_exposes_window_mode_toggle(self):
        html = read("popup/popup.html")

        self.assertIn('id="opt-window-mode"', html)

    def test_popup_persists_window_mode_setting(self):
        js = read("popup/popup.js")

        self.assertIn('optWindowMode.checked = settings.openInWindow === true', js)
        self.assertIn("openInWindow: optWindowMode.checked", js)

    def test_service_worker_toggles_action_popup(self):
        js = read("background/service-worker.js")

        self.assertIn('await chrome.action.setPopup({ popup: openInWindow ? "" : "popup/popup.html" });', js)
        self.assertIn("chrome.runtime.onStartup.addListener(applyActionMode)", js)
        self.assertIn('if (area === "local" && changes.openInWindow) applyActionMode();', js)

    def test_service_worker_opens_singleton_window(self):
        js = read("background/service-worker.js")

        self.assertIn("chrome.action.onClicked.addListener", js)
        self.assertIn('chrome.runtime.getURL("popup/popup.html?windowed=1")', js)
        self.assertIn('type: "popup"', js)
        self.assertIn("chrome.windows.update(store.standaloneWindowId, { focused: true })", js)
        self.assertIn("chrome.windows.onRemoved.addListener", js)

    def test_windowed_page_adapts_and_remembers_bounds(self):
        html = read("popup/popup.js")
        css = read("popup/popup.css")

        self.assertIn('new URLSearchParams(location.search).has("windowed")', html)
        self.assertIn("windowBounds: { width: window.outerWidth, height: window.outerHeight }", html)
        self.assertIn("body.windowed .container", css)


if __name__ == "__main__":
    unittest.main()
