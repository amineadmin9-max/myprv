import json
import sys
import requests
from datetime import datetime

WORKER_URL = ""  # Set your worker URL here, e.g. https://reddit-proxy.YOUR.workers.dev

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}


def scrape_reddit(subreddit, num_posts=25):
    posts = []
    url = f"https://www.reddit.com/r/{subreddit}/.json?limit={num_posts}"

    # Try worker proxy first
    if WORKER_URL:
        try:
            resp = requests.get(f"{WORKER_URL}/r/{subreddit}/.json?limit={num_posts}", headers=BROWSER_HEADERS, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                children = data.get("data", {}).get("children", [])
                for child in children:
                    d = child.get("data", {})
                    post = {
                        "title": d.get("title", ""),
                        "author": d.get("author", ""),
                        "score": str(d.get("score", 0)),
                        "comments": str(d.get("num_comments", 0)),
                        "url": f"https://www.reddit.com{d.get('permalink', '')}",
                        "domain": d.get("domain", ""),
                        "created": datetime.fromtimestamp(d.get("created_utc", 0)).isoformat(),
                    }
                    if post["title"]:
                        posts.append(post)
                        print(f"  [{len(posts)}] {post['title'][:80]}")
                if posts:
                    return posts[:num_posts]
        except Exception as e:
            print(f"[!] Worker failed: {e}")

    # Fallback to direct
    try:
        resp = requests.get(url, headers=BROWSER_HEADERS, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            children = data.get("data", {}).get("children", [])
            for child in children:
                d = child.get("data", {})
                post = {
                    "title": d.get("title", ""),
                    "author": d.get("author", ""),
                    "score": str(d.get("score", 0)),
                    "comments": str(d.get("num_comments", 0)),
                    "url": f"https://www.reddit.com{d.get('permalink', '')}",
                    "domain": d.get("domain", ""),
                    "created": datetime.fromtimestamp(d.get("created_utc", 0)).isoformat(),
                }
                if post["title"]:
                    posts.append(post)
                    print(f"  [{len(posts)}] {post['title'][:80]}")
    except Exception as e:
        print(f"[!] Direct request failed: {e}")

    return posts[:num_posts]


def save_posts(posts, subreddit):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"r_{subreddit}_{timestamp}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"\n[+] Saved {len(posts)} posts to {filename}")
    return filename


def main():
    subreddit = sys.argv[1] if len(sys.argv) > 1 else "game"
    num_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 25

    print(f"=== Reddit Scraper ===")
    print(f"[*] Subreddit: r/{subreddit}")
    print(f"[*] Target posts: {num_posts}\n")

    posts = scrape_reddit(subreddit, num_posts)
    if posts:
        save_posts(posts, subreddit)
    else:
        print("[!] No posts found.")


if __name__ == "__main__":
    main()
