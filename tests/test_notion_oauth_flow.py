import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


class NotionOAuthFlowTests(unittest.TestCase):
    def test_extension_uses_worker_as_notion_redirect_uri(self):
        js = read("background/service-worker.js")

        self.assertIn('const notionRedirectUri = WORKER_URL;', js)
        self.assertIn('redirect_uri=${encodeURIComponent(notionRedirectUri)}', js)
        self.assertIn('state=${encodeURIComponent(state)}', js)
        self.assertIn('const extensionRedirectUri = api.identity.getRedirectURL("callback");', js)
        self.assertIn('notionToken: oauthParams.get("access_token")', js)

    def test_worker_supports_browser_oauth_callback_redirect(self):
        js = read("worker/notion-oauth.js")

        self.assertIn('if (request.method === "GET") {', js)
        self.assertIn('return handleOAuthCallback(request, env);', js)
        self.assertIn('function isAllowedExtensionRedirectUri(redirectUri)', js)
        self.assertIn('redirect_uri: getWorkerRedirectUri(request)', js)
        self.assertIn('new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } })', js)

    def test_worker_allows_any_chrome_extension_origin_for_token_exchange(self):
        js = read("worker/notion-oauth.js")

        self.assertIn(r'return /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||', js)
        self.assertIn('origin.startsWith("moz-extension://")', js)


if __name__ == "__main__":
    unittest.main()
