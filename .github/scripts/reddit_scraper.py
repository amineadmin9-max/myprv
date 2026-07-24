import requests
import json
import os
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from html import unescape
import re


def clean_html(text):
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def scrape_reddit(subreddit, num_posts=25):
    urls = [
        f"https://www.reddit.com/r/{subreddit}/.rss?limit={num_posts}",
        f"https://www.reddit.com/r/{subreddit}/top/.rss?t=week&limit={num_posts}",
        f"https://old.reddit.com/r/{subreddit}/.rss?limit={num_posts}",
    ]
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
    }

    for url in urls:
        try:
            print(f"Trying RSS: {url} ...")
            r = requests.get(url, headers=headers, timeout=15)
            print(f"  Status: {r.status_code}")
            if r.status_code == 200 and ("xml" in r.headers.get("content-type", "") or "<feed" in r.text[:200]):
                print(f"  RSS Success!")
                return parse_rss(r.text, subreddit, num_posts)
        except Exception as e:
            print(f"  Error: {e}")

    print("RSS failed, trying JSON with different approach...")
    json_urls = [
        f"https://www.reddit.com/r/{subreddit}/.json?limit={num_posts}",
        f"https://old.reddit.com/r/{subreddit}/.json?limit={num_posts}",
    ]
    headers_json = {
        "User-Agent": "RedditBot/1.0 (by /u/testuser)",
        "Accept": "application/json",
    }
    for url in json_urls:
        try:
            print(f"Trying JSON: {url} ...")
            r = requests.get(url, headers=headers_json, timeout=15)
            print(f"  Status: {r.status_code}")
            if r.status_code == 200:
                data = r.json()
                return parse_json(data, subreddit, num_posts)
        except Exception as e:
            print(f"  Error: {e}")

    return []


def parse_rss(xml_text, subreddit, num_posts):
    posts = []
    try:
        root = ET.fromstring(xml_text)
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        entries = root.findall("atom:entry", ns) or root.findall(".//entry")
        print(f"  Found {len(entries)} entries")

        for entry in entries[:num_posts]:
            title_el = entry.find("atom:title", ns) or entry.find("title")
            title = title_el.text if title_el is not None else ""

            author_el = entry.find("atom:author/atom:name", ns) or entry.find("author/name")
            author = author_el.text.replace("/u/", "") if author_el is not None and author_el.text else "unknown"

            link_el = entry.find("atom:link", ns) or entry.find("link")
            link = link_el.get("href", "") if link_el is not None else ""

            content_el = entry.find("atom:content", ns) or entry.find("content")
            content = clean_html(content_el.text if content_el is not None else "")

            updated_el = entry.find("atom:updated", ns) or entry.find("updated")
            updated = updated_el.text if updated_el is not None else ""

            post = {
                "title": clean_html(title),
                "author": author,
                "url": link,
                "content": content[:500],
                "updated": updated,
                "subreddit": subreddit,
            }
            posts.append(post)
            print(f"  [{len(posts)}] {post['title'][:70]}")

    except ET.ParseError as e:
        print(f"  XML parse error: {e}")

    return posts[:num_posts]


def parse_json(data, subreddit, num_posts):
    posts = []
    children = data.get("data", {}).get("children", [])
    for child in children[:num_posts]:
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
            "subreddit": d.get("subreddit", subreddit),
        }
        posts.append(post)
        print(f"  [{len(posts)}] {post['title'][:70]}")
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

    print(f"\nSaved {len(posts)} posts to {filename}")


if __name__ == "__main__":
    main()
