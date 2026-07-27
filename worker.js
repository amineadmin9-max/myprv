/**
 * Cloudflare Worker — Reddit Proxy
 *
 * Proxies Reddit JSON requests to bypass datacenter IP blocks.
 * Authenticate with header: X-Proxy-Secret: <YOUR_SECRET>
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler deploy worker.js --name reddit-proxy
 *   4. Set secret: wrangler secret put PROXY_SECRET
 *
 * Env vars (set via wrangler.toml or dashboard):
 *   PROXY_SECRET — shared secret for auth
 */

export default {
  async fetch(request, env) {
    const SECRET = env.PROXY_SECRET;
    const ALLOWED_ORIGINS = ["https://amineadmin9-max.github.io", "http://localhost:8000"];

    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
    const isLocalhost = origin.startsWith("http://localhost");

    function corsHeaders(extra = {}) {
      const h = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Proxy-Secret",
        "Access-Control-Max-Age": "86400",
        ...extra,
      };
      if (isLocalhost || ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
        h["Access-Control-Allow-Origin"] = origin;
      } else {
        h["Access-Control-Allow-Origin"] = ALLOWED_ORIGINS[0];
      }
      return h;
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check (no auth needed)
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok", proxy: "cloudflare" }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Auth check for all other routes
    const authHeader = request.headers.get("X-Proxy-Secret");
    if (!SECRET) {
      return new Response(JSON.stringify({ error: "PROXY_SECRET not configured on worker" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }
    if (authHeader !== SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // Route: POST /api/reddit-comments  { data: ["/r/sub/comments/id/title/"] }
    if (path === "/api/reddit-comments" && request.method === "POST") {
      try {
        const body = await request.json();
        const permalink = Array.isArray(body.data) ? body.data[0] : "";

        if (!permalink || !permalink.startsWith("/r/")) {
          return new Response(JSON.stringify({ error: "Invalid permalink" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const redditUrls = [
          `https://www.reddit.com${permalink}.json`,
          `https://old.reddit.com${permalink}.json`,
        ];

        for (const redditUrl of redditUrls) {
          try {
            const resp = await fetch(redditUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "application/json",
              },
              redirect: "follow",
            });

            if (resp.status === 200) {
              const data = await resp.json();
              const result = parseRedditJson(data);
              if (result) {
                return new Response(JSON.stringify({ data: [JSON.stringify(result)] }), {
                  status: 200,
                  headers: { "Content-Type": "application/json", ...corsHeaders() },
                });
              }
            }
          } catch (e) {
            // try next URL
          }
        }

        return new Response(JSON.stringify({ data: [JSON.stringify({ error: "Could not fetch comments" })] }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Invalid request body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    // Route: POST /api/reddit-search  { url: "https://reddit.com/search.json?q=..." }
    if (path === "/api/reddit-search" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetUrl = body.url;

        if (!targetUrl || !targetUrl.includes("reddit.com")) {
          return new Response(JSON.stringify({ error: "Invalid Reddit URL" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/json",
          },
          redirect: "follow",
        });

        const text = await resp.text();
        return new Response(text, {
          status: resp.status,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Search request failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    // Route: POST /api/reddit-rss  { url: "https://reddit.com/..." }
    if (path === "/api/reddit-rss" && request.method === "POST") {
      try {
        const body = await request.json();
        const targetUrl = body.url;

        if (!targetUrl || !targetUrl.includes("reddit.com")) {
          return new Response(JSON.stringify({ error: "Invalid Reddit URL" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders() },
          });
        }

        const resp = await fetch(targetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/xml, text/xml, */*",
          },
          redirect: "follow",
        });

        const text = await resp.text();
        return new Response(text, {
          status: resp.status,
          headers: {
            "Content-Type": resp.headers.get("Content-Type") || "application/xml",
            ...corsHeaders(),
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "RSS request failed" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not found", routes: ["/health", "/api/reddit-comments", "/api/reddit-search", "/api/reddit-rss"] }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};

function parseRedditJson(data) {
  if (!Array.isArray(data) || data.length < 2) return null;

  const postData = {};
  const children = data[0]?.data?.children;
  if (children && children.length > 0) {
    const pd = children[0].data || {};
    postData.score = pd.score || 0;
    postData.ups = pd.ups || 0;
    postData.upvote_ratio = pd.upvote_ratio || 0;
    postData.num_comments = pd.num_comments || 0;
  }

  const comments = [];

  function extract(list) {
    for (const c of list) {
      if (c.kind === "t1" && c.data) {
        comments.push({
          body: c.data.body || "",
          score: c.data.score || 0,
        });
        if (c.data.replies && typeof c.data.replies === "object") {
          extract(c.data.replies.data?.children || []);
        }
      }
    }
  }

  extract(data[1]?.data?.children || []);

  return { ...postData, comments };
}
