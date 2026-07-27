/**
 * Cloudflare Worker — Reddit Proxy (General Purpose)
 *
 * Proxies ALL requests to reddit.com to bypass datacenter IP blocks.
 * Any path on the worker gets forwarded to reddit.com.
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy worker.js --name reddit-proxy
 *
 * Env vars (set via wrangler.toml or dashboard):
 *   PROXY_USER_AGENT — Reddit requires a unique User-Agent (e.g. "myapp/1.0 (by u/yourusername)")
 *   PROXY_SECRET     — (optional) shared secret for auth
 *
 * Example:
 *   https://reddit-proxy.YOUR_SUB.workers.dev/r/programming/hot.json
 *   → fetches https://www.reddit.com/r/programming/hot.json
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", proxy: "cloudflare" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Auth check (optional — only if PROXY_SECRET is set)
    const SECRET = env.PROXY_SECRET;
    if (SECRET) {
      const authHeader = request.headers.get("X-Proxy-Secret");
      if (authHeader !== SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // Build target URL: forward everything after the worker domain to reddit.com
    const targetUrl = `https://www.reddit.com${url.pathname}${url.search}`;

    // Forward request to Reddit
    const headers = new Headers();
    headers.set("User-Agent", env.PROXY_USER_AGENT || "NicheFinder/1.0 (by /u/nichefinder_bot)");
    headers.set("Accept", request.headers.get("Accept") || "*/*");
    headers.set("Accept-Language", "en-US,en;q=0.9");

    // Forward cookies if present
    const cookie = request.headers.get("Cookie");
    if (cookie) headers.set("Cookie", cookie);

    try {
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? await request.text() : undefined,
        redirect: "follow",
      });

      // Build response with CORS
      const responseHeaders = new Headers(resp.headers);
      responseHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Proxy fetch failed", details: err.message }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
