import json
import os
import sys
import time
from datetime import datetime
import requests


def scrape_reddit_json(subreddit, num_posts=50):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    }

    urls = [
        f"https://www.reddit.com/r/{subreddit}/new.json?limit={num_posts}",
        f"https://www.reddit.com/r/{subreddit}/hot.json?limit={num_posts}",
    ]

    for url in urls:
        try:
            print(f"  Trying {url}")
            r = requests.get(url, headers=headers, timeout=15)
            print(f"  Status: {r.status_code}, Length: {len(r.text)}")

            if r.status_code == 200:
                data = r.json()
                children = data.get("data", {}).get("children", [])
                posts = []
                for child in children[:num_posts]:
                    d = child.get("data", {})
                    posts.append({
                        "title": d.get("title", ""),
                        "author": d.get("author", "unknown"),
                        "score": d.get("score", 0),
                        "numComments": d.get("num_comments", 0),
                        "url": f"https://reddit.com{d.get('permalink', '')}",
                        "domain": d.get("domain", ""),
                        "created": datetime.fromtimestamp(d.get("created_utc", 0)).isoformat() if d.get("created_utc") else "",
                        "subreddit": d.get("subreddit", subreddit),
                        "selftext": (d.get("selftext", "") or "")[:500],
                        "permalink": f"https://reddit.com{d.get('permalink', '')}",
                        "flair": d.get("link_flair_text", "") or "",
                        "isSelf": d.get("is_self", True),
                    })
                if posts:
                    return posts

            elif r.status_code == 429:
                print(f"  Rate limited, waiting 10s...")
                time.sleep(10)

        except Exception as e:
            print(f"  Error: {e}")
            continue

    return []


def main():
    subreddits_arg = sys.argv[1] if len(sys.argv) > 1 else "game"
    subreddits = [s.strip() for s in subreddits_arg.split(",") if s.strip()]

    os.makedirs("data", exist_ok=True)
    all_index = []

    for sub in subreddits:
        print(f"\nScraping r/{sub}...")
        posts = scrape_reddit_json(sub, 50)

        filename = f"data/r_{sub}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)

        all_index.append({
            "name": sub,
            "posts": len(posts),
            "updated": datetime.now().isoformat(),
        })
        print(f"  Saved {len(posts)} posts")

        time.sleep(5)

    with open("data/index.json", "w", encoding="utf-8") as f:
        json.dump(all_index, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Scraped {len(subreddits)} subreddits")


if __name__ == "__main__":
    main()
