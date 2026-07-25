import json
import os
import sys
import time
from datetime import datetime
from playwright.sync_api import sync_playwright


def scrape_reddit_playwright(subreddit, num_posts=50):
    posts = []
    url = f"https://old.reddit.com/r/{subreddit}/new/"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_default_timeout(30000)

        try:
            print(f"  Opening {url}")
            page.goto(url, wait_until="domcontentloaded")
            page.wait_for_timeout(3000)

            last_height = 0
            scroll_attempts = 0

            while len(posts) < num_posts and scroll_attempts < 10:
                articles = page.query_selector_all("div.thing.link")
                for article in articles:
                    try:
                        title_el = article.query_selector("a.title")
                        title = title_el.inner_text() if title_el else ""
                        href = title_el.get_attribute("href") if title_el else ""

                        author_el = article.query_selector("a.author")
                        author = author_el.inner_text() if author_el else "unknown"

                        score_el = article.query_selector("div.score.unvoted")
                        score_text = score_el.inner_text() if score_el else "0"
                        try:
                            score = int(score_text.replace("•", "0").strip())
                        except:
                            score = 0

                        comments_el = article.query_selector("a.comments")
                        comments_text = comments_el.inner_text() if comments_el else "0"
                        try:
                            num_comments = int(comments_text.split()[0])
                        except:
                            num_comments = 0

                        time_el = article.query_selector("time")
                        created = time_el.get_attribute("title") if time_el else ""

                        domain_el = article.query_selector("span.domain > a")
                        domain = domain_el.inner_text() if domain_el else ""

                        post = {
                            "title": title.strip(),
                            "author": author.strip(),
                            "score": score,
                            "numComments": num_comments,
                            "url": href.strip() if href else "",
                            "domain": domain.strip(),
                            "created": created.strip(),
                            "subreddit": subreddit,
                            "selftext": "",
                            "permalink": href.strip() if href else "",
                            "flair": "",
                            "isSelf": "self." in domain if domain else True,
                        }

                        if post["title"] and not any(p["title"] == post["title"] for p in posts):
                            posts.append(post)
                            if len(posts) % 10 == 0:
                                print(f"    Collected {len(posts)} posts...")

                    except Exception as e:
                        continue

                    if len(posts) >= num_posts:
                        break

                if len(posts) >= num_posts:
                    break

                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(2000)
                new_height = page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    scroll_attempts += 1
                else:
                    scroll_attempts = 0
                last_height = new_height

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
        print(f"Scraping r/{sub}...")
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

        time.sleep(3)

    with open("data/index.json", "w", encoding="utf-8") as f:
        json.dump(all_index, f, ensure_ascii=False, indent=2)

    print(f"\nDone! Scraped {len(subreddits)} subreddits")


if __name__ == "__main__":
    main()
