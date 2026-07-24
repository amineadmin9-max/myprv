import requests
import json
import os
import sys
from datetime import datetime


def scrape_reddit(subreddit, num_posts=25):
    url = f"https://www.reddit.com/r/{subreddit}/hot.json"
    headers = {"User-Agent": "RedditScraper/1.0"}
    params = {"limit": min(num_posts, 100)}
    
    posts = []
    after = None
    
    while len(posts) < num_posts:
        if after:
            params["after"] = after
        
        r = requests.get(url, headers=headers, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        
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
                "selftext": d.get("selftext", "")[:500] if d.get("selftext") else "",
                "thumbnail": d.get("thumbnail", ""),
                "subreddit": d.get("subreddit", subreddit),
            }
            posts.append(post)
        
        after = data.get("data", {}).get("after")
        if not after or len(posts) >= num_posts:
            break
    
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
