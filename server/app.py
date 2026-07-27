import json
import os
import time
from flask import Flask, request, jsonify
from flask_cors import CORS

import requests

app = Flask(__name__)
CORS(app)

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "keep-alive",
    "Cache-Control": "max-age=0",
}

SESSION = requests.Session()
SESSION.headers.update(BROWSER_HEADERS)

# Cloudflare Worker proxy config
WORKER_URL = os.environ.get("WORKER_URL", "")  # e.g. https://reddit-proxy.YOUR_SUBDOMAIN.workers.dev
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")

_browser = None


def get_browser():
    global _browser
    if _browser is None:
        from playwright.sync_api import sync_playwright
        pw = sync_playwright().start()
        _browser = pw.chromium.launch(headless=True, args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ])
    return _browser


def fetch_with_playwright(url):
    """Fetch URL using Playwright Chromium browser."""
    browser = get_browser()
    page = browser.new_page()
    try:
        page.goto(url, wait_until="networkidle", timeout=30000)
        content = page.content()
        import re
        match = re.search(r'<pre[^>]*>(.*?)</pre>', content, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return json.loads(content)
    finally:
        page.close()


def parse_reddit_json(data, permalink):
    """Parse Reddit JSON response into post_data + comments."""
    if not isinstance(data, list) or len(data) < 2:
        return None

    post_data = {}
    if data[0].get("data", {}).get("children"):
        pd = data[0]["data"]["children"][0].get("data", {})
        post_data = {
            "score": pd.get("score", 0),
            "ups": pd.get("ups", 0),
            "upvote_ratio": pd.get("upvote_ratio", 0),
            "num_comments": pd.get("num_comments", 0),
        }

    comments = []

    def extract(children):
        for c in children:
            if c.get("kind") == "t1" and c.get("data"):
                cd = c["data"]
                comments.append({
                    "body": cd.get("body", ""),
                    "score": cd.get("score", 0),
                })
                replies = cd.get("replies")
                if replies and isinstance(replies, dict):
                    extract(replies.get("data", {}).get("children", []))

    extract(data[1].get("data", {}).get("children", []))

    print(f"[REDDIT] OK: {len(comments)} comments from {permalink}")
    return {**post_data, "comments": comments}


def fetch_via_worker(permalink):
    """Fetch Reddit comments via Cloudflare Worker proxy."""
    if not WORKER_URL or not WORKER_SECRET:
        return None

    try:
        resp = requests.post(
            f"{WORKER_URL}/api/reddit-comments",
            json={"data": [permalink]},
            headers={"X-Proxy-Secret": WORKER_SECRET, "Content-Type": "application/json"},
            timeout=15,
        )
        print(f"[WORKER] {WORKER_URL} -> {resp.status_code}")

        if resp.status_code == 200:
            data = resp.json()
            if data.get("data"):
                return data
    except Exception as e:
        print(f"[WORKER] Failed: {e}")

    return None


@app.route("/api/reddit-comments", methods=["POST"])
def fetch_reddit_comments():
    """Fetch Reddit comments: try worker proxy first, then direct requests, then Playwright."""
    try:
        body = request.get_json(silent=True) or {}
        permalink = body.get("data", [""])[0] if isinstance(body.get("data"), list) else ""
    except Exception:
        return jsonify({"error": "Invalid request body"}), 400

    if not permalink or not permalink.startswith("/r/"):
        return jsonify({"error": "Invalid permalink"}), 400

    # 1. Try Cloudflare Worker proxy (best chance — residential IPs)
    worker_result = fetch_via_worker(permalink)
    if worker_result:
        return jsonify(worker_result)

    # 2. Try direct requests
    urls_to_try = [
        f"https://www.reddit.com{permalink}.json",
        f"https://old.reddit.com{permalink}.json",
    ]

    for url in urls_to_try:
        try:
            resp = SESSION.get(url, timeout=20, allow_redirects=True)
            print(f"[REDDIT] requests {url} -> {resp.status_code}")

            if resp.status_code == 200:
                data = resp.json()
                result = parse_reddit_json(data, permalink)
                if result:
                    return jsonify({"data": [json.dumps(result)]})

        except Exception as e:
            print(f"[REDDIT] requests failed for {url}: {e}")

    # 3. Try Playwright
    print("[REDDIT] requests failed, trying Playwright...")
    for url in urls_to_try:
        try:
            data = fetch_with_playwright(url)
            result = parse_reddit_json(data, permalink)
            if result:
                return jsonify({"data": [json.dumps(result)]})
        except Exception as e:
            print(f"[REDDIT] Playwright failed for {url}: {e}")

    return jsonify({"data": [json.dumps({"error": "Could not fetch comments"})]}), 502


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port, debug=False)
