// Cloudflare Worker — Notion OAuth Token Exchange
// Deploy: wrangler deploy worker/notion-oauth.js --name ai-translate-oauth
//
// Environment variables (set via wrangler secret):
//   NOTION_CLIENT_ID     — from your Notion integration
//   NOTION_CLIENT_SECRET — from your Notion integration

// Allowed extension origins (filters out random web traffic so we don't burn
// the Workers Free quota on garbage requests). Not a security boundary — a
// determined attacker can forge the Origin header server-side.
function isAllowedOrigin(origin) {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
    origin.startsWith("moz-extension://");
}

function base64UrlDecode(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  return JSON.parse(atob(normalized));
}

function getWorkerRedirectUri(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function isAllowedExtensionRedirectUri(redirectUri) {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "https:" && (
      url.hostname.endsWith(".chromiumapp.org") ||
      url.hostname.endsWith(".extensions.allizom.org")
    );
  } catch {
    return false;
  }
}

function redirectWithError(extensionRedirectUri, error) {
  const redirectUrl = new URL(extensionRedirectUri);
  redirectUrl.searchParams.set("error", error);
  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } });
}

async function handleOAuthCallback(request, env) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const state = requestUrl.searchParams.get("state");

  if (!state) {
    return new Response("Missing OAuth state", { status: 400 });
  }

  let extensionRedirectUri;
  try {
    extensionRedirectUri = base64UrlDecode(state).redirect_uri;
  } catch {
    return new Response("Invalid OAuth state", { status: 400 });
  }

  if (!isAllowedExtensionRedirectUri(extensionRedirectUri)) {
    return new Response("Invalid extension redirect_uri", { status: 400 });
  }

  if (error) {
    return redirectWithError(extensionRedirectUri, error);
  }
  if (!code) {
    return redirectWithError(extensionRedirectUri, "missing_code");
  }

  const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);
  const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: getWorkerRedirectUri(request)
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) {
    return redirectWithError(extensionRedirectUri, tokenData.error || "token_exchange_failed");
  }

  const redirectUrl = new URL(extensionRedirectUri);
  const params = new URLSearchParams();
  params.set("access_token", tokenData.access_token);
  if (tokenData.workspace_name) params.set("workspace_name", tokenData.workspace_name);
  if (tokenData.workspace_icon) params.set("workspace_icon", tokenData.workspace_icon);
  redirectUrl.hash = params.toString();

  return new Response(null, { status: 302, headers: { Location: redirectUrl.toString() } });
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return handleOAuthCallback(request, env);
    }

    const origin = request.headers.get("Origin") || "";
    const allowed = isAllowedOrigin(origin);

    // Echo the request's origin only when allowed; this also satisfies CORS
    // preflight strictness (browsers reject "*" for credentialed requests).
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed ? origin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };

    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { code, redirect_uri } = await request.json();

      if (!code || !redirect_uri) {
        return new Response(JSON.stringify({ error: "Missing code or redirect_uri" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Legacy token exchange path kept for older extension builds.
      const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`);
      const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri
        })
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok) {
        return new Response(JSON.stringify({ error: tokenData.error || "Token exchange failed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Return only what the extension needs
      return new Response(JSON.stringify({
        access_token: tokenData.access_token,
        workspace_name: tokenData.workspace_name,
        workspace_icon: tokenData.workspace_icon
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
