import json
import sys
import requests
from datetime import datetime

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


def search_videos(api_key, query, max_results=25):
    """Search YouTube videos by query."""
    url = f"{YOUTUBE_API_BASE}/search"
    params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": min(max_results, 50),
        "order": "relevance",
        "key": api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=20)
        if resp.status_code != 200:
            print(f"[!] API error {resp.status_code}: {resp.text[:200]}")
            return []

        data = resp.json()
        videos = []
        items = data.get("items", [])

        # Get video IDs for stats
        video_ids = [item["id"]["videoId"] for item in items if "videoId" in item.get("id", {})]
        stats = get_video_stats(api_key, video_ids)

        for item in items:
            if "videoId" not in item.get("id", {}):
                continue
            vid = item["id"]["videoId"]
            snippet = item.get("snippet", {})
            stat = stats.get(vid, {})
            video = {
                "title": snippet.get("title", ""),
                "author": snippet.get("channelTitle", ""),
                "views": stat.get("viewCount", "0"),
                "likes": stat.get("likeCount", "0"),
                "comments": stat.get("commentCount", "0"),
                "url": f"https://www.youtube.com/watch?v={vid}",
                "published": snippet.get("publishedAt", ""),
                "description": snippet.get("description", "")[:200],
            }
            if video["title"]:
                videos.append(video)
                print(f"  [{len(videos)}] {video['title'][:80]}")

        return videos[:max_results]

    except Exception as e:
        print(f"[!] Request failed: {e}")
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
            return {
                item["id"]: item.get("statistics", {})
                for item in data.get("items", [])
            }
    except Exception:
        pass
    return {}


def trending_videos(api_key, region_code="US", max_results=25):
    """Get trending videos."""
    url = f"{YOUTUBE_API_BASE}/videos"
    params = {
        "part": "snippet,statistics",
        "chart": "mostPopular",
        "regionCode": region_code,
        "maxResults": min(max_results, 50),
        "key": api_key,
    }

    try:
        resp = requests.get(url, params=params, timeout=20)
        if resp.status_code != 200:
            print(f"[!] API error {resp.status_code}: {resp.text[:200]}")
            return []

        data = resp.json()
        videos = []
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            stat = item.get("statistics", {})
            video = {
                "title": snippet.get("title", ""),
                "author": snippet.get("channelTitle", ""),
                "views": stat.get("viewCount", "0"),
                "likes": stat.get("likeCount", "0"),
                "comments": stat.get("commentCount", "0"),
                "url": f"https://www.youtube.com/watch?v={item['id']}",
                "published": snippet.get("publishedAt", ""),
                "description": snippet.get("description", "")[:200],
            }
            if video["title"]:
                videos.append(video)
                print(f"  [{len(videos)}] {video['title'][:80]}")

        return videos[:max_results]

    except Exception as e:
        print(f"[!] Request failed: {e}")
        return []


def save_posts(posts, query):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_query = query.replace(" ", "_")[:30]
    filename = f"yt_{safe_query}_{timestamp}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)
    print(f"\n[+] Saved {len(posts)} videos to {filename}")
    return filename


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 reddit_scraper.py <query> [num_videos]")
        print("  python3 reddit_scraper.py trending [num_videos]")
        print("")
        print("Set API key via environment variable:")
        print("  export YOUTUBE_API_KEY=your_key_here")
        return

    api_key = __import__("os").environ.get("YOUTUBE_API_KEY", "")
    if not api_key:
        print("[!] Set YOUTUBE_API_KEY environment variable")
        print("    export YOUTUBE_API_KEY=your_key_here")
        return

    query = sys.argv[1]
    num_videos = int(sys.argv[2]) if len(sys.argv) > 2 else 25

    print(f"=== YouTube Scraper ===")
    print(f"[*] Query: {query}")
    print(f"[*] Target videos: {num_videos}\n")

    if query.lower() == "trending":
        videos = trending_videos(api_key, max_results=num_videos)
    else:
        videos = search_videos(api_key, query, num_videos)

    if videos:
        save_posts(videos, query)
    else:
        print("[!] No videos found.")


if __name__ == "__main__":
    main()
