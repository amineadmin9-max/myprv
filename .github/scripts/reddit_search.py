import requests
import json
import os
import sys
import time
import hashlib
from datetime import datetime
from html import unescape
import re


def clean_html(text):
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"&#\d+;", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def search_reddit(keyword, num_posts=50):
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    urls = [
        f"https://www.reddit.com/search.rss?q={requests.utils.quote(keyword)}&sort=relevance&limit={num_posts}&t=month",
        f"https://www.reddit.com/search.rss?q={requests.utils.quote(keyword)}&sort=new&limit={num_posts}&t=month",
        f"https://www.reddit.com/search.rss?q={requests.utils.quote(keyword)}&sort=relevance&limit={num_posts}",
    ]

    for url in urls:
        for attempt in range(3):
            try:
                r = requests.get(url, headers=headers, timeout=15)
                print(f"  Attempt {attempt+1}: Status {r.status_code}, Length {len(r.text)}")

                if r.status_code == 200 and "<entry>" in r.text:
                    posts = parse_rss(r.text)
                    if posts:
                        return posts
                elif r.status_code == 429:
                    wait = 10 * (attempt + 1)
                    print(f"  Rate limited, waiting {wait}s...")
                    time.sleep(wait)
                else:
                    break
            except Exception as e:
                print(f"  Error: {e}")
                break

    return []


def parse_rss(xml_text):
    posts = []
    entries = re.findall(r"<entry>(.*?)</entry>", xml_text, re.DOTALL)
    print(f"  Found {len(entries)} entries in RSS")

    for entry in entries:
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

        sub_m = re.search(r"reddit\.com/r/([^/]+)", url)
        subreddit = sub_m.group(1) if sub_m else "unknown"

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
    keyword = sys.argv[1] if len(sys.argv) > 1 else ""
    if not keyword.strip():
        print("No keyword provided")
        return

    keyword = keyword.strip()
    keyword_hash = hashlib.md5(keyword.lower().encode()).hexdigest()[:10]

    print(f"\nSearching Reddit for: '{keyword}'...")
    posts = search_reddit(keyword, 50)

    os.makedirs("data", exist_ok=True)
    filename = f"data/search_{keyword_hash}.json"

    result = {
        "keyword": keyword,
        "posts": posts,
        "count": len(posts),
        "timestamp": datetime.now().isoformat(),
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"  Saved {len(posts)} posts to {filename}")

    manifest_file = "data/search_manifest.json"
    manifest = {}
    if os.path.exists(manifest_file):
        with open(manifest_file, "r") as f:
            try:
                manifest = json.load(f)
            except:
                manifest = {}

    manifest[keyword.lower()] = {
        "hash": keyword_hash,
        "count": len(posts),
        "timestamp": datetime.now().isoformat(),
    }

    with open(manifest_file, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Found {len(posts)} posts for '{keyword}'")


if __name__ == "__main__":
    main()
