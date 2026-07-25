import os
import time
import hashlib
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
