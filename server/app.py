import json
import requests
import gradio as gr


def fetch_reddit_comments(permalink):
    """Fetch Reddit comments via JSON API."""
    if not permalink or not permalink.startswith("/r/"):
        return json.dumps({"error": "Invalid permalink"})

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
                    return json.dumps({**post_data, "comments": comments})
        except Exception as e:
            print(f"[REDDIT] Error fetching {url}: {e}")
            continue

    return json.dumps({"error": "Could not fetch comments"})


with gr.Blocks(title="Niche Finder API") as demo:
    gr.Markdown("# Niche Finder API\nBackend for Reddit comment analysis.")
    permalink_input = gr.Textbox(label="Permalink", placeholder="/r/sub/comments/id/title/")
    output_json = gr.Textbox(label="JSON Output")
    btn = gr.Button("Fetch Comments")
    btn.click(fn=fetch_reddit_comments, inputs=permalink_input, outputs=output_json, api_name="reddit-comments")

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, ssr_mode=False)
