import json
import os
import sys
import time
import re
from datetime import datetime
from playwright.sync_api import sync_playwright


def scrape_reddit_playwright(subreddit, num_posts=50):
    posts = []
    url = f"https://www.reddit.com/r/{subreddit}/new/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
        )
        page = context.new_page()
        page.set_default_timeout(30000)

        try:
            print(f"  Opening {url}")
            page.goto(url, wait_until="networkidle")
            page.wait_for_timeout(5000)

            last_height = 0
            for _ in range(8):
                html = page.content()

                titles = re.findall(r'<a[^>]*slot="title"[^>]*>([^<]+)</a>', html)
                if not titles:
                    titles = re.findall(r'<h2[^>]*><a[^>]*>([^<]+)</a></h2>', html)
                if not titles:
                    titles = re.findall(r'class="[^"]*title[^"]*"[^>]*>([^<]{10,})</a>', html)

                links = re.findall(r'href="(/r/[^"]*comments/[^"]*)"', html)

                scores = re.findall(r'aria-label="(\d+) votes?"', html)
                if not scores:
                    scores = re.findall(r'score">(\d+)<', html)

                comments_list = re.findall(r'(\d+) comments?', html)

                print(f"  Found {len(titles)} titles, {len(links)} links")

                for i, title in enumerate(titles):
                    title = title.strip()
                    if len(title) < 5:
                        continue
                    if any(p["title"] == title for p in posts):
                        continue

                    link = links[i] if i < len(links) else ""
                    score = int(scores[i]) if i < len(scores) else 0
                    num_comments = int(comments_list[i]) if i < len(comments_list) else 0

                    post = {
                        "title": title,
                        "author": "unknown",
                        "score": score,
                        "numComments": num_comments,
                        "url": f"https://reddit.com{link}" if link else "",
                        "domain": "",
                        "created": "",
                        "subreddit": subreddit,
                        "selftext": "",
                        "permalink": f"https://reddit.com{link}" if link else "",
                        "flair": "",
                        "isSelf": True,
                    }
                    posts.append(post)

                if len(posts) >= num_posts:
                    break

                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(3000)
                new_height = page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height

                print(f"  Collected {len(posts)} posts so far...")

        except Exception as e:
            print(f"  Error: {e}")
        finally:
            browser.close()

    return posts[:num_posts]


def main():
    subreddits_arg = sys.argv[1] if len(sys.argv) > 1 else "game"
    subreddits = [s.strip() for s in subreddits_arg.split(",") if s.strip()]

    os.makedirs("data", exist_ok=True)
    all_index = []

    for sub in subreddits:
        print(f"\nScraping r/{sub}...")
        posts = scrape_reddit_playwright(sub, 50)

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
