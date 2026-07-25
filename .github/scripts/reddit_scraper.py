import requests
import json
import os
import sys
import time
from datetime import datetime
from html import unescape
import re


def clean_html(text):
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def scrape_reddit(subreddit, num_posts=50):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    urls = [
        f"https://www.reddit.com/r/{subreddit}/.rss?limit={num_posts}",
    ]

    for rss_url in urls:
        try:
            r = requests.get(rss_url, headers=headers, timeout=15)
            print(f"  URL: {rss_url} -> Status: {r.status_code}, Length: {len(r.text)}")
            if r.status_code == 200 and "<entry>" in r.text:
                return parse_rss(r.text, subreddit, num_posts)
            elif r.status_code == 429:
                print(f"  Rate limited, waiting...")
                time.sleep(5)
                r2 = requests.get(rss_url, headers=headers, timeout=15)
                if r2.status_code == 200 and "<entry>" in r2.text:
                    return parse_rss(r2.text, subreddit, num_posts)
        except Exception as e:
            print(f"  Error: {e}")
            continue

    print(f"  All URLs failed for r/{subreddit}")
    return []


def parse_rss(xml_text, subreddit, num_posts):
    posts = []
    entries = re.findall(r"<entry>(.*?)</entry>", xml_text, re.DOTALL)

    for entry in entries[:num_posts]:
        title_m = re.search(r"<title[^>]*>(.*?)</title>", entry, re.DOTALL)
        title = clean_html(title_m.group(1)) if title_m else ""

        author_m = re.search(r"<name>([^<]*)</name>", entry)
        author = author_m.group(1).replace("/u/", "") if author_m else "unknown"

        link_m = re.search(r'<link[^>]*href="([^"]*)"', entry)
        url = link_m.group(1) if link_m else ""

        content_m = re.search(r"<content[^>]*>(.*?)</content>", entry, re.DOTALL)
        content = clean_html(content_m.group(1))[:500] if content_m else ""

        updated_m = re.search(r"<updated>(.*?)</updated>", entry)
        updated = updated_m.group(1) if updated_m else ""

        if title:
            posts.append({
                "title": title,
                "author": author,
                "url": url,
                "content": content,
                "updated": updated,
                "subreddit": subreddit,
                "score": 0,
                "numComments": 0,
                "isSelf": True,
                "domain": f"self.{subreddit}",
                "selftext": content,
                "permalink": url,
                "flair": "",
            })

    return posts


def main():
    subreddits_arg = sys.argv[1] if len(sys.argv) > 1 else "game"
    subreddits = [s.strip() for s in subreddits_arg.split(",") if s.strip()]

    os.makedirs("data", exist_ok=True)
    all_index = []

    for sub in subreddits:
        print(f"Scraping r/{sub}...")
        posts = scrape_reddit(sub, 50)

        filename = f"data/r_{sub}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(posts, f, ensure_ascii=False, indent=2)

        all_index.append({
            "name": sub,
            "posts": len(posts),
            "updated": datetime.now().isoformat(),
        })
        print(f"  Saved {len(posts)} posts")

        time.sleep(2)

    with open("data/index.json", "w", encoding="utf-8") as f:
        json.dump(all_index, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Scraped {len(subreddits)} subreddits")


if __name__ == "__main__":
    main()
