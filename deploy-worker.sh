#!/bin/bash
# Deploy Reddit Proxy to Cloudflare Workers
# Run on Termux: bash deploy-worker.sh

set -e

echo "=== Reddit Proxy - Cloudflare Worker Deploy ==="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "[1/4] Installing Node.js..."
    pkg install -y nodejs
else
    echo "[1/4] Node.js found: $(node -v)"
fi

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "[2/4] Installing wrangler..."
    npm install -g wrangler
else
    echo "[2/4] Wrangler found: $(wrangler --version)"
fi

# Login to Cloudflare (only first time)
if [ ! -f ~/.wrangler/config/default.toml ]; then
    echo "[3/4] Logging in to Cloudflare..."
    wrangler login
else
    echo "[3/4] Already logged in to Cloudflare"
fi

# Deploy
echo "[4/4] Deploying worker..."
wrangler deploy

echo ""
echo "=== Done! ==="
echo "Your worker is live at: https://reddit-proxy.YOUR_SUBDOMAIN.workers.dev"
echo ""
echo "To set User-Agent (required by Reddit):"
echo "  wrangler secret put PROXY_USER_AGENT"
echo "  Then type: myapp/1.0 (by u/yourusername)"
echo ""
echo "To update: just run this script again"
