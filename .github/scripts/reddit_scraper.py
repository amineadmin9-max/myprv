import requests
import json
import os
import sys
import time
import re
from datetime import datetime
from html import unescape


def clean_html(text):
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def scrape_reddit(subreddit, num_posts=25):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    }

    rss_url = f"https://www.reddit.com/r/{subreddit}/.rss?limit={num_posts}"
    print(f"Fetching RSS: {rss_url}")

    try:
        r = requests.get(rss_url, headers=headers, timeout=15)
        print(f"Status: {r.status_code}, Content-Type: {r.headers.get('content-type', '')}")
        if r.status_code != 200:
            print(f"Response: {r.text[:500]}")
            return []
    except Exception as e:
        print(f"Error: {e}")
        return []

    xml_text = r.text
    posts = []

    entries = re.findall(r"<entry>(.*?)</entry>", xml_text, re.DOTALL)
    print(f"Found {len(entries)} entries")

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

        post = {
            "title": title,
            "author": author,
            "url": url,
            "content": content,
            "updated": updated,
            "subreddit": subreddit,
        }
        posts.append(post)
        print(f"  [{len(posts)}] {title[:70]}")

    return posts[:num_posts]


def main():
    subreddit = sys.argv[1] if len(sys.argv) > 1 else "game"
    num_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 25

    print(f"Scraping r/{subreddit} - {num_posts} posts\n")
    posts = scrape_reddit(subreddit, num_posts)

    os.makedirs("data", exist_ok=True)
    filename = f"data/r_{subreddit}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    print(f"\nSaved {len(posts)} posts to {filename}")


if __name__ == "__main__":
    main()
