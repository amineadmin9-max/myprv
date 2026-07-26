import os
import time
import hashlib
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# LLM API Keys (stored on server, not in browser)
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openrouter/free"

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = "amineadmin9-max/myprv"
GITHUB_RAW = f"https://raw.githubusercontent.com/{GITHUB_REPO}/main/data"
GITHUB_API = "https://api.github.com"

HEADERS_GITHUB = {
    "Accept": "application/vnd.github.v3+json",
    "Authorization": f"token {GITHUB_TOKEN}",
}


def trigger_workflow(keyword):
    resp = requests.post(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/workflows/reddit_scraper.yml/dispatches",
        headers=HEADERS_GITHUB,
        json={"ref": "main", "inputs": {"keyword": keyword, "subreddits": ""}},
        timeout=10,
    )
    return resp.status_code == 204


def get_latest_run():
    resp = requests.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/runs?per_page=5",
        headers=HEADERS_GITHUB,
        timeout=10,
    )
    if resp.status_code != 200:
        return None
    data = resp.json()
    for run in data.get("workflow_runs", []):
        if run["name"] == "Reddit Scraper":
            return run
    return None


def poll_workflow(run_id, timeout=120):
    start = time.time()
    while time.time() - start < timeout:
        resp = requests.get(
            f"{GITHUB_API}/repos/{GITHUB_REPO}/actions/runs/{run_id}",
            headers=HEADERS_GITHUB,
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json()
            if data.get("status") == "completed":
                return data.get("conclusion") == "success"
        time.sleep(3)
    return False


def read_results(keyword):
    keyword_hash = hashlib.md5(keyword.lower().encode()).hexdigest()[:10]
    url = f"{GITHUB_RAW}/search_{keyword_hash}.json"
    resp = requests.get(url, timeout=10)
    if resp.status_code == 200:
        return resp.json()
    return None


@app.route("/api/search", methods=["POST"])
def search():
    data = request.get_json()
    if not data or not data.get("keyword"):
        return jsonify({"error": "keyword is required"}), 400

    keyword = data["keyword"].strip()
    if not keyword:
        return jsonify({"error": "keyword cannot be empty"}), 400

    print(f"[SEARCH] Starting search for: '{keyword}'")

    before_run = get_latest_run()
    before_id = before_run["id"] if before_run else None

    if not trigger_workflow(keyword):
        return jsonify({"error": "Failed to trigger workflow"}), 500

    print(f"[SEARCH] Workflow triggered, waiting...")

    time.sleep(5)

    start = time.time()
    while time.time() - start < 120:
        current_run = get_latest_run()
        if current_run and current_run["id"] != before_id:
            if current_run["status"] == "completed":
                if current_run["conclusion"] == "success":
                    break
                else:
                    return jsonify({"error": "Workflow failed"}), 500
        time.sleep(3)

    if time.time() - start >= 120:
        return jsonify({"error": "Workflow timed out"}), 504

    results = read_results(keyword)
    if not results:
        return jsonify({"error": "No results found"}), 404

    print(f"[SEARCH] Found {results.get('count', 0)} posts for '{keyword}'")
    return jsonify(results)


@app.route("/api/reddit-comments", methods=["GET"])
def reddit_comments():
    permalink = request.args.get("permalink", "")
    if not permalink or not permalink.startswith("/r/"):
        return jsonify({"error": "Invalid permalink"}), 400

    urls_to_try = [
        f"https://www.reddit.com{permalink}.json",
        f"https://old.reddit.com{permalink}.json",
    ]

    for url in urls_to_try:
        try:
            resp = requests.get(
                url,
                headers={"User-Agent": "NicheFinder/2.8 (Educational research tool)"},
                timeout=15,
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) >= 2:
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
                                if cd.get("replies") and isinstance(cd["replies"], dict):
                                    extract(cd["replies"].get("data", {}).get("children", []))

                    extract(data[1].get("data", {}).get("children", []))

                    print(f"[REDDIT] OK: {len(comments)} comments from {permalink}")
                    return jsonify({**post_data, "comments": comments})
        except Exception as e:
            print(f"[REDDIT] Error fetching {url}: {e}")
            continue

    print(f"[REDDIT] All URLs failed for: {permalink}")
    return jsonify({"error": "Could not fetch comments"}), 502


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "providers": {
        "groq": bool(GROQ_API_KEY),
        "gemini": bool(GEMINI_API_KEY),
        "openrouter": bool(OPENROUTER_API_KEY)
    }})


@app.route("/api/llm", methods=["POST"])
def llm_proxy():
    data = request.get_json()
    if not data or not data.get("prompt"):
        return jsonify({"error": "prompt is required"}), 400

    prompt = data["prompt"]
    timeout = data.get("timeout", 30)

    # Try Groq first (fastest, most generous)
    if GROQ_API_KEY:
        result = call_groq(prompt, timeout)
        if result:
            return jsonify({"content": result, "provider": "groq", "model": GROQ_MODEL})

    # Try Gemini
    if GEMINI_API_KEY:
        result = call_gemini(prompt, timeout)
        if result:
            return jsonify({"content": result, "provider": "gemini", "model": "gemini-2.5-flash-lite"})

    # Try OpenRouter
    if OPENROUTER_API_KEY:
        result = call_openrouter(prompt, timeout)
        if result:
            return jsonify({"content": result, "provider": "openrouter", "model": OPENROUTER_MODEL})

    return jsonify({"error": "All providers failed or no API keys configured"}), 503


def call_groq(prompt, timeout=30):
    try:
        resp = requests.post(
            GROQ_BASE,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_API_KEY}"},
            json={"model": GROQ_MODEL, "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.3, "max_tokens": 1024},
            timeout=timeout
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        print(f"[Groq] Error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"[Groq] Exception: {e}")
    return None


def call_gemini(prompt, timeout=30):
    try:
        resp = requests.post(
            f"{GEMINI_BASE}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1024}},
            timeout=timeout
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        print(f"[Gemini] Error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"[Gemini] Exception: {e}")
    return None


def call_openrouter(prompt, timeout=30):
    try:
        resp = requests.post(
            OPENROUTER_BASE,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={"model": OPENROUTER_MODEL, "messages": [{"role": "user", "content": prompt}],
                  "temperature": 0.3, "max_tokens": 1024},
            timeout=timeout
        )
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        print(f"[OpenRouter] Error: {resp.status_code} - {resp.text[:200]}")
    except Exception as e:
        print(f"[OpenRouter] Exception: {e}")
    return None


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port, debug=False)
