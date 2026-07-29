#!/data/data/com.termux/files/usr/bin/bash
set -e

termux-wake-lock
trap "termux-wake-unlock; echo 'Server stopped.'" EXIT

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "[setup] Installing npm dependencies..."
  npm install --production
fi
if ! python3 -c "import pytrends" 2>/dev/null; then
  echo "[setup] Installing pytrends..."
  pip install pytrends
fi

echo "=============================="
echo " Niche Finder Server"
echo "=============================="
echo " Running on: http://127.0.0.1:3000"
echo " Ping test:  http://127.0.0.1:3000/ping"
echo ""
echo " In APK Settings set Server URL to:"
echo " http://127.0.0.1:3000"
echo "=============================="
echo ""

node server.js
