#!/usr/bin/env python3
"""
Niche Finder — YouTube + Google Trends Scraper
Finds profitable niches by combining Google Trends keywords with YouTube video stats.

Usage:
    export YOUTUBE_API_KEY=your_key_here
    python3 scraper.py

Output: yt_niche_results_YYYYMMDD_HHMMSS.json
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import requests
from pytrends.request import TrendReq


# ══════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"
VIDEOS_PER_KEYWORD = 20
TOP_KEYWORDS = 20  # top keywords to process from Google Trends


# ══════════════════════════════════════════════════════════════
# GOOGLE TRENDS — YouTube keywords
# ══════════════════════════════════════════════════════════════

def fetch_youtube_trends(timeframe="today 3-m"):
    """
    Fetch trending keywords from Google Trends filtered for YouTube.
    timeframe options:
        "today 3-m"  → last 3 months (evergreen)
        "now 7-d"    → last 7 days (trending)
    """
    print(f"[Google Trends] Fetching YouTube trends ({timeframe})...")
    pytrends = TrendReq(hl="en-US", tz=480, timeout=(10, 25))

    # Seed keywords to discover related YouTube searches
    seed_keywords = [
        "best", "how to", "review", "tutorial", "guide",
        "top", "vs", "cheap", "budget", "premium",
        "2026", "new", "trending", "popular", "essential",
    ]

    all_keywords = {}
    batch_size = 5  # pytrends max per request

    for i in range(0, min(len(seed_keywords), 15), batch_size):
        batch = seed_keywords[i:i + batch_size]
        try:
            pytrends.build_payload(batch, cat=0, timeframe=timeframe, geo="US")
            related = pytrends.related_queries()

            for kw, data in related.items():
                # Rising queries
                if data.get("rising") is not None:
                    for _, row in data["rising"].iterrows():
                        query = row.get("query", "")
                        if query and 3 < len(query) < 60:
                            all_keywords[query] = all_keywords.get(query, 0) + 1

                # Top queries
                if data.get("top") is not None:
                    for _, row in data["top"].iterrows():
                        query = row.get("query", "")
                        if query and 3 < len(query) < 60:
                            all_keywords[query] = all_keywords.get(query, 0) + 1

            print(f"  [Batch {i // batch_size + 1}] Processed: {', '.join(batch)}")
            time.sleep(2)  # rate limit

        except Exception as e:
            print(f"  [!] Batch failed: {e}")
            time.sleep(5)
            continue

    # Sort by frequency and return top keywords
    sorted_kw = sorted(all_keywords.items(), key=lambda x: x[1], reverse=True)
    result = [kw for kw, _ in sorted_kw[:TOP_KEYWORDS]]

    print(f"[Google Trends] Found {len(all_keywords)} unique keywords, keeping top {len(result)}")
    return result


# ══════════════════════════════════════════════════════════════
# YOUTUBE API v3 — Search + Stats
# ══════════════════════════════════════════════════════════════

def search_youtube_videos(api_key, keyword, days_back=90, max_results=20):
    """Search YouTube videos for a keyword within a date range."""
    published_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()

    url = f"{YOUTUBE_API_BASE}/search"
    params = {
        "part": "snippet",
        "q": keyword,
        "type": "video",
        "order": "relevance",
        "publishedAfter": published_after,
        "maxResults": min(max_results, 50),
        "key": api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=20)
        if resp.status_code != 200:
            print(f"    [!] Search API error {resp.status_code}: {resp.text[:200]}")
            return []

        data = resp.json()
        items = data.get("items", [])
        video_ids = [item["id"]["videoId"] for item in items if "videoId" in item.get("id", {})]

        if not video_ids:
            return []

        # Get stats for all videos
        stats = get_video_stats(api_key, video_ids)

        videos = []
        for item in items:
            if "videoId" not in item.get("id", {}):
                continue
            vid = item["id"]["videoId"]
            snippet = item.get("snippet", {})
            stat = stats.get(vid, {})

            videos.append({
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "views": int(stat.get("viewCount", 0)),
                "likes": int(stat.get("likeCount", 0)),
                "comments": int(stat.get("commentCount", 0)),
                "description": snippet.get("description", ""),
                "url": f"https://www.youtube.com/watch?v={vid}",
                "published": snippet.get("publishedAt", ""),
            })

        return videos

    except Exception as e:
        print(f"    [!] Search failed: {e}")
        return []


def get_video_stats(api_key, video_ids):
    """Get view/like/comment counts for video IDs."""
    if not video_ids:
        return {}
    url = f"{YOUTUBE_API_BASE}/videos"
    params = {
        "part": "statistics",
        "id": ",".join(video_ids[:50]),
        "key": api_key,
    }
    try:
        resp = requests.get(url, params=params, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            return {item["id"]: item.get("statistics", {}) for item in data.get("items", [])}
    except Exception:
        pass
    return {}


# ══════════════════════════════════════════════════════════════
# LINK COUNTING
# ══════════════════════════════════════════════════════════════

def count_links_in_text(text):
    """Count URLs in text."""
    if not text:
        return 0
    import re
    url_pattern = r'https?://[^\s<>"\')]+|www\.[^\s<>"\')]+'
    return len(re.findall(url_pattern, text))


def count_desc_promo_links(videos):
    """Count total promo links across all video descriptions."""
    total = 0
    for v in videos:
        total += count_links_in_text(v.get("description", ""))
    return total


# ══════════════════════════════════════════════════════════════
# TRAFFIC LIGHT SCORING — 6 colors
# ══════════════════════════════════════════════════════════════

def compute_traffic_light(videos, keyword):
    """
    Apply traffic light scoring based on YouTube video data.

    Colors:
        🔵 sky blue  — videoCount < 5K AND highEng AND links ≤ 3
        🟢 green     — videoCount ≤ 25K AND highEng AND links ≤ 3
        🟡 yellow    — videoCount ≤ 25K AND links ≤ 8
        🟠 orange    — videoCount > 25K AND links ≤ 8
        🔴 red       — videoCount > 25K AND links > 8
        🟣 purple    — videoCount ≤ 25K AND links > 8
    """
    if not videos:
        return {
            "color": "gray",
            "label": "No data",
            "videoCount": 0,
            "avgViews": 0,
            "avgLikes": 0,
            "avgComments": 0,
            "promoLinks": 0,
            "highEng": False,
        }

    video_count = len(videos)
    total_views = sum(v.get("views", 0) for v in videos)
    total_likes = sum(v.get("likes", 0) for v in videos)
    total_comments = sum(v.get("comments", 0) for v in videos)

    avg_views = total_views // video_count if video_count else 0
    avg_likes = total_likes // video_count if video_count else 0
    avg_comments = total_comments // video_count if video_count else 0

    high_eng = avg_views > 10000
    promo_links = count_desc_promo_links(videos)

    # Traffic light rules
    if video_count < 5000 and high_eng and promo_links <= 3:
        color, label = "skyblue", "🔵 فرصة نظيفة — منافسة ضعيفة جداً"
    elif video_count <= 25000 and high_eng and promo_links <= 3:
        color, label = "green", "🟢 سوق مفتوح — منافسة معقولة + تفاعل جيد"
    elif video_count <= 25000 and promo_links <= 8:
        color, label = "yellow", "🟡 سوق نامي — بعض النشاط"
    elif video_count > 25000 and promo_links <= 8:
        color, label = "orange", "🟠 سوق كبير — منافسة متوسطة"
    elif video_count > 25000 and promo_links > 8:
        color, label = "red", "🔴 مُشبع — حجم كبير + روابط كثيرة"
    elif video_count <= 25000 and promo_links > 8:
        color, label = "purple", "🟣 مُشبع — روابط كثيرة مع حجم أقل"
    else:
        color, label = "yellow", "🟡 سوق متوسط"

    return {
        "color": color,
        "label": label,
        "videoCount": video_count,
        "avgViews": avg_views,
        "avgLikes": avg_likes,
        "avgComments": avg_comments,
        "promoLinks": promo_links,
        "highEng": high_eng,
    }


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

def main():
    api_key = os.environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        print("[!] Set YOUTUBE_API_KEY environment variable")
        print("    export YOUTUBE_API_KEY=your_key_here")
        sys.exit(1)

    print("=" * 60)
    print("  Niche Finder — YouTube + Google Trends Scraper")
    print("=" * 60)

    results = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "evergreen": [],
        "trending": [],
    }

    # ════════ STEP 1: EVERGREEN (3 months) ════════
    print("\n[Step 1] Google Trends — Evergreen keywords (3 months)...")
    evergreen_keywords = fetch_youtube_trends(timeframe="today 3-m")
    print(f"[Step 1] Got {len(evergreen_keywords)} keywords\n")

    for i, kw in enumerate(evergreen_keywords):
        print(f"  [Evergreen {i + 1}/{len(evergreen_keywords)}] {kw}")
        videos = search_youtube_videos(api_key, kw, days_back=90, max_results=VIDEOS_PER_KEYWORD)
        scoring = compute_traffic_light(videos, kw)

        # Trim video data for output (remove full descriptions)
        clean_videos = []
        for v in videos:
            clean_videos.append({
                "title": v["title"],
                "channel": v["channel"],
                "views": v["views"],
                "likes": v["likes"],
                "comments": v["comments"],
                "url": v["url"],
                "published": v["published"],
            })

        results["evergreen"].append({
            "keyword": kw,
            "scoring": scoring,
            "videos": clean_videos,
        })
        print(f"    → {scoring['label']} | {scoring['videoCount']} videos | avg views: {scoring['avgViews']:,}")
        time.sleep(1)  # rate limit

    # ════════ STEP 2: TRENDING (1 week) ════════
    print(f"\n[Step 2] Google Trends — Trending keywords (1 week)...")
    trending_keywords = fetch_youtube_trends(timeframe="now 7-d")
    print(f"[Step 2] Got {len(trending_keywords)} keywords\n")

    for i, kw in enumerate(trending_keywords):
        print(f"  [Trending {i + 1}/{len(trending_keywords)}] {kw}")
        videos = search_youtube_videos(api_key, kw, days_back=7, max_results=VIDEOS_PER_KEYWORD)
        scoring = compute_traffic_light(videos, kw)

        clean_videos = []
        for v in videos:
            clean_videos.append({
                "title": v["title"],
                "channel": v["channel"],
                "views": v["views"],
                "likes": v["likes"],
                "comments": v["comments"],
                "url": v["url"],
                "published": v["published"],
            })

        results["trending"].append({
            "keyword": kw,
            "scoring": scoring,
            "videos": clean_videos,
        })
        print(f"    → {scoring['label']} | {scoring['videoCount']} videos | avg views: {scoring['avgViews']:,}")
        time.sleep(1)

    # ════════ STEP 3: SAVE ════════
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"yt_niche_results_{timestamp}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    # ════════ SUMMARY ════════
    print("\n" + "=" * 60)
    print("  RESULTS SUMMARY")
    print("=" * 60)

    color_counts = {}
    for category in ["evergreen", "trending"]:
        for item in results[category]:
            c = item["scoring"]["color"]
            color_counts[c] = color_counts.get(c, 0) + 1

    print(f"\n  Evergreen keywords: {len(results['evergreen'])}")
    print(f"  Trending keywords:  {len(results['trending'])}")
    print(f"\n  Color distribution:")
    color_names = {
        "skyblue": "🔵 Sky Blue", "green": "🟢 Green",
        "yellow": "🟡 Yellow", "orange": "🟠 Orange",
        "red": "🔴 Red", "purple": "🟣 Purple", "gray": "⚪ Gray",
    }
    for c, count in sorted(color_counts.items()):
        print(f"    {color_names.get(c, c)}: {count}")

    print(f"\n  Saved to: {filename}")
    print("=" * 60)


if __name__ == "__main__":
    main()
