import requests
import json
import os
import sys
import time
from datetime import datetime


def scrape_reddit(subreddit, num_posts=25):
    urls = [
        f"https://old.reddit.com/r/{subreddit}/hot.json",
        f"https://www.reddit.com/r/{subreddit}/hot.json",
        f"https://api.reddit.com/r/{subreddit}/hot",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    working_url = None
    for url in urls:
        try:
            print(f"Trying {url} ...")
            r = requests.get(url, headers=headers, params={"limit": 5, "raw_json": 1}, timeout=15)
            print(f"  Status: {r.status_code}")
            if r.status_code == 200:
                working_url = url
                print(f"  Working URL found!")
                break
        except Exception as e:
            print(f"  Error: {e}")

    if not working_url:
        print("All URLs failed!")
        return []

    posts = []
    after = None

    while len(posts) < num_posts:
        params = {"limit": min(100, num_posts - len(posts)), "raw_json": 1}
        if after:
            params["after"] = after

        try:
            r = requests.get(working_url, headers=headers, params=params, timeout=15)
            if r.status_code == 429:
                print("Rate limited, waiting 5s...")
                time.sleep(5)
                continue
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            print(f"Error fetching: {e}")
            break

        children = data.get("data", {}).get("children", [])
        if not children:
            break

        for child in children:
            d = child.get("data", {})
            post = {
                "title": d.get("title", ""),
                "author": d.get("author", ""),
                "score": d.get("score", 0),
                "num_comments": d.get("num_comments", 0),
                "url": f"https://reddit.com{d.get('permalink', '')}",
                "domain": d.get("domain", ""),
                "created_utc": datetime.fromtimestamp(d.get("created_utc", 0)).isoformat(),
                "selftext": (d.get("selftext", "") or "")[:500],
                "thumbnail": d.get("thumbnail", ""),
                "subreddit": d.get("subreddit", subreddit),
            }
            posts.append(post)

        after = data.get("data", {}).get("after")
        if not after or len(posts) >= num_posts:
            break

        time.sleep(2)

    return posts[:num_posts]


def main():
    subreddit = sys.argv[1] if len(sys.argv) > 1 else "game"
    num_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 25

    print(f"Scraping r/{subreddit} - {num_posts} posts")
    posts = scrape_reddit(subreddit, num_posts)

    os.makedirs("data", exist_ok=True)
    filename = f"data/r_{subreddit}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    print(f"Saved {len(posts)} posts to {filename}")


if __name__ == "__main__":
    main()
