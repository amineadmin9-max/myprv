import json
import os
from flask import Flask, request, jsonify

import requests

app = Flask(__name__)


@app.route("/api/reddit-comments", methods=["POST"])
def fetch_reddit_comments():
    """Fetch Reddit comments via JSON API."""
    try:
        body = request.get_json(silent=True) or {}
        permalink = body.get("data", [""])[0] if isinstance(body.get("data"), list) else ""
    except Exception:
        return jsonify({"error": "Invalid request body"}), 400

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
                                replies = cd.get("replies")
                                if replies and isinstance(replies, dict):
                                    extract(
                                        replies.get("data", {}).get("children", [])
                                    )

                    extract(data[1].get("data", {}).get("children", []))

                    print(f"[REDDIT] OK: {len(comments)} comments from {permalink}")
                    return jsonify({"data": [json.dumps({**post_data, "comments": comments})]})
        except Exception as e:
            print(f"[REDDIT] Error fetching {url}: {e}")
            continue

    return jsonify({"data": [json.dumps({"error": "Could not fetch comments"})]}), 502


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    app.run(host="0.0.0.0", port=port, debug=False)
