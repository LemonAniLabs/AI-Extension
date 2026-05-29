// Cloudflare Worker — Notion OAuth Token Exchange
// Deploy: npx wrangler deploy worker/notion-oauth.js --name ai-translate-oauth
//
// Environment variables (set via wrangler secret):
//   NOTION_CLIENT_ID     — from your Notion integration
//   NOTION_CLIENT_SECRET — from your Notion integration

// Allowed extension origins (filters out random web/curl traffic so we don't
// burn the 100k/day Workers Free quota on garbage requests). Not a security
// boundary — a determined attacker can forge the Origin header server-side.
const CHROME_EXTENSION_ID = "ajkffakplhmpbghikgeiddeboojjjpel";
function isAllowedOrigin(origin) {
  return (
    origin === `chrome-extension://${CHROME_EXTENSION_ID}` ||
    origin.startsWith("moz-extension://")
  );
}

export default {
  async fetch(request, env) {
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

      // Exchange code for access token
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
