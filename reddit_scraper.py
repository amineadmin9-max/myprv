import asyncio
import json
import sys
from datetime import datetime
from playwright.async_api import async_playwright


async def scrape_reddit(subreddit: str, num_posts: int = 25):
    url = f"https://old.reddit.com/r/{subreddit}/"
    posts = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.set_default_timeout(30000)

        print(f"[*] Opening r/{subreddit} ...")
        await page.goto(url, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)

        last_height = 0
        while len(posts) < num_posts:
            articles = await page.query_selector_all("div.thing.link")
            for article in articles:
                try:
                    title_el = await article.query_selector("a.title")
                    title = await title_el.inner_text() if title_el else ""
                    href = await title_el.get_attribute("href") if title_el else ""

                    author_el = await article.query_selector("a.author")
                    author = await author_el.inner_text() if author_el else "unknown"

                    time_el = await article.query_selector("time")
                    created = await time_el.get_attribute("title") if time_el else ""

                    score_el = await article.query_selector("div.score.unvoted")
                    score = await score_el.inner_text() if score_el else "0"

                    comments_el = await article.query_selector("a.comments")
                    comments = await comments_el.inner_text() if comments_el else "0"

                    domain_el = await article.query_selector("span.domain > a")
                    domain = await domain_el.inner_text() if domain_el else ""

                    post = {
                        "title": title.strip(),
                        "author": author.strip(),
                        "score": score.strip(),
                        "comments": comments.strip(),
                        "url": href.strip(),
                        "domain": domain.strip(),
                        "created": created.strip(),
                    }

                    if post["title"] and not any(p["title"] == post["title"] for p in posts):
                        posts.append(post)
                        print(f"  [{len(posts)}] {post['title'][:80]}")

                except Exception:
                    continue

                if len(posts) >= num_posts:
                    break

            if len(posts) >= num_posts:
                break

            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(2000)
            new_height = await page.evaluate("document.body.scrollHeight")
            if new_height == last_height:
                print("[!] No more posts to load.")
                break
            last_height = new_height

        await browser.close()

    return posts[:num_posts]


def save_posts(posts, subreddit):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"r_{subreddit}_{timestamp}.json"

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)

    print(f"\n[+] Saved {len(posts)} posts to {filename}")
    return filename


async def main():
    subreddit = sys.argv[1] if len(sys.argv) > 1 else "game"
    num_posts = int(sys.argv[2]) if len(sys.argv) > 2 else 25

    print(f"=== Reddit Scraper ===")
    print(f"[*] Subreddit: r/{subreddit}")
    print(f"[*] Target posts: {num_posts}\n")

    posts = await scrape_reddit(subreddit, num_posts)
    if posts:
        save_posts(posts, subreddit)
    else:
        print("[!] No posts found.")


if __name__ == "__main__":
    asyncio.run(main())
