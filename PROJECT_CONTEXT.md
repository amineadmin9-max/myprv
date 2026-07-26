# Niche Finder - Project Context
## Last updated: 2026-07-26

## Quick Start
In a new conversation, just say:
> "اقرأ PROJECT_CONTEXT.md في /home/daytona/myproject"

---

## What is this project?
A **Niche Finder** web app that finds profitable niches by combining:
- **Reddit RSS + JSON Comments** — posts asking for products + comment analysis for promo links
- **YouTube Trending** — trending video topics
- **AI (Gemini + OpenRouter)** — classifies niches, filters, and summarizes
- **Google site:reddit.com** — approximate post count per niche

## Tech Stack
- Pure HTML/CSS/JS (no frameworks, no build step)
- Single file: `docs/index.html` (deployed via GitHub Pages)
- Backend: Gradio app on HuggingFace Spaces (`server/app.py`)
- AI: Gemini 2.5 Flash Lite (primary) + OpenRouter (fallback)
- CORS proxies for Reddit RSS + Google Trends

## GitHub
- Repo: `amineadmin9-max/myprv`
- Remote URL has token embedded for push: `https://<token>@github.com/amineadmin9-max/myprv.git`
- GitHub Pages URL: `https://amineadmin9-max.github.io/myprv/`
- Push from `/home/daytona/myproject` — just `git add . && git commit -m "msg" && git push`

## AI Providers
- **Gemini 2.5 Flash Lite** (primary) — key in localStorage `nf_gemini_key`
- **OpenRouter** (fallback) — key in localStorage `nf_openrouter_key`
- **HuggingFace** — BLOCKED by CORS from browser
- `callLLM(prompt)` → tries Gemini first, then OpenRouter
- User rule: LLM is for **analysis only**, max 5-7 calls per run

## Backend Server (Gradio on HuggingFace Spaces)
- `server/app.py` — Gradio app with `/api/reddit-comments` endpoint
- `server/requirements.txt` — gradio, requests
- `server/README.md` — HF Space metadata (SDK: gradio, port: 7860)
- User sets server URL in: ⚙️ → Backend Server → paste URL
- Server URL stored in localStorage `nf_server_url`
- Endpoint: `POST {serverURL}/api/reddit-comments` → `{"data": ["/r/sub/comments/id/title/"]}`
- Returns: `{"data": ["{score, ups, upvote_ratio, num_comments, comments: [{body, score}]}"]}`
- **Status: NOT YET DEPLOYED** — user needs to create HF Space and upload server/ files

## Traffic Light System (🟢🟡🔴)
### How it works:
1. For each niche, get top 5 posts (sorted by numComments desc)
2. For each post, fetch comments via Flask server (`/api/reddit-comments`)
3. Count promo links in comment bodies using `countLinksInText()`
4. Get Google `site:reddit.com` post count for competition level
5. Apply scoring rules:

| Condition | Color | Label |
|-----------|-------|-------|
| postCount>30k AND commentLinks>5 | 🔴 | Saturated — high volume, many promo links in comments |
| postCount≤30k AND commentLinks>5 | 🔴 | Saturated — many promo links detected in comments |
| postCount<1000 AND highEng AND links≤2 | 🟢 | Clean opportunity — low competition, high engagement |
| postCount≤30k AND highEng AND links≤2 | 🟢 | Open market — moderate posts, good engagement |
| postCount≤30k AND links≤5 | 🟡 | Growing market — some activity, needs deeper analysis |
| postCount>30k AND links≤5 | 🟡 | Large market — high volume, moderate promo links |
| default | 🟡 | Moderate market — deeper analysis needed |

### Card display:
- **Only shows:** `🌳 Evergreen · {label}` + colored dot
- **No numbers** (no post count, no promo link count)
- Badge below label: `💬 247 comments · 3 links` (if server works) or `⚠️ Add server URL for comment analysis` (if not)

### Key functions:
- `fetchRedditComments(permalink)` — calls Flask server, returns `{score, comments}`
- `computeScoringFromPosts(posts, allClass, allPostsPool, keyword)` — main scoring
- `countLinksInText(text)` — counts URLs in text
- `countPromoLinks(posts)` — counts links in post content/title (fallback)
- `countRedditPostsViaGoogle(keyword)` — Google site: search

### IMPORTANT BUG FIXED:
- `computeScoringFromPosts` calls were missing `await` → caused dots to disappear
- Line ~1500 in `runDualDiscovery`: must use `await computeScoringFromPosts(...)`

## Architecture (docs/index.html)
### Pages (bottom nav: 2 tabs)
1. **Search** — manual search + dual discovery (evergreen + trending)
2. **Schedule/Monitors** — create/toggle/delete monitoring channels
3. **Notifications** — alert history

### Settings (3-dot menu dropdown)
1. **Gemini / OpenRouter API** — API keys modal
2. **YouTube API** — YouTube Data API v3 key
3. **Backend Server** — Flask/Gradio server URL for Reddit comments
4. **About** — version info + deploy instructions

### Dual Discovery Flow
1. `fetchRedditBulk('year')` — RSS from bulk subreddits (evergreen)
2. `aiFilterAndSummarize()` — LLM filters raw posts into niche keywords (batch 25)
3. `fetchRedditBulk('week')` + `fetchYouTubeTrending()` — trending sources
4. `aiFilterAndSummarize()` — LLM filters trending (batch 25)
5. For each niche: `searchReddit(keyword)` → RSS posts
6. `batchClassify(allPosts)` — single LLM call for all posts (max 25)
7. `computeScoringFromPosts()` — traffic light scoring with comments
8. `renderDualResults()` — display cards

### Key Functions
- `callLLM(prompt)` — tries Gemini → OpenRouter
- `callOpenRouter(prompt)` — alias for callLLM
- `_geminiFetch(prompt, timeoutMs)` — Gemini API call
- `_openrouterFetch(prompt, timeoutMs)` — OpenRouter SSE stream
- `fetchRedditBulk(timeframe)` — RSS fetch from bulk subreddits
- `searchReddit(keyword)` — RSS search for specific keyword
- `parseRSS(xml)` — parse Reddit RSS to posts array
- `fetchWithProxy(url)` — fetch RSS through CORS proxy
- `fetchWithProxyJSON(url)` — fetch JSON through CORS proxy
- `fetchRedditComments(permalink)` — calls Flask server for comments
- `aiFilterAndSummarize(items)` — LLM batch filter (25 per batch)
- `batchClassify(posts)` — LLM classify posts (max 25)
- `computeScoringFromPosts(posts, allClass, allPostsPool, keyword)` — traffic light
- `countRedditPostsViaGoogle(keyword)` — Google site: count
- `countLinksInText(text)` — count URLs in text
- `countPromoLinks(posts)` — count links in posts (fallback)
- `renderDualResults(evergreen, trending, stats)` — render cards
- `renderLLMStats()` — LLM usage stats panel

### Constants
- `PROXIES` — CORS proxies for RSS (corsproxy.io, codetabs)
- `BULK_SUBS` — ['findareddit','AskReddit','DoesAnybodyElse','whatisthisthing']
- `DEMAND_KW`, `COMMERCIAL_KW`, `TREND_KW` — keyword arrays
- `llmStats` — tracks Total/OK/Fail/provider for stats panel

### Data helpers:
- `getGeminiKey()` — localStorage `nf_gemini_key`
- `getOpenRouterKey()` — localStorage `nf_openrouter_key`
- `getServerURL()` — localStorage `nf_server_url`
- `getYTKey()` — localStorage `nf_yt_key`

## Files
- `docs/index.html` — MAIN FILE (all CSS+HTML+JS in one file, ~1820 lines)
- `docs/sw.js` — service worker (cache v4)
- `docs/manifest.json` — PWA manifest
- `server/app.py` — Gradio app for Reddit comments proxy
- `server/requirements.txt` — gradio, requests
- `server/README.md` — HF Space metadata

## HuggingFace Spaces Deploy Steps
1. Go to huggingface.co/new-space
2. Name: `niche-finder-api`, SDK: `gradio`, Visibility: Public
3. Upload files from server/ (app.py, requirements.txt, README.md)
4. Wait for build (~1-2 min)
5. Copy URL: `https://USERNAME-niche-finder-api.hf.space`
6. Open app → ⚙️ → Backend Server → paste URL → Save

## Version History
- v2.8 — Comment-based traffic light + Flask server proxy + Gradio HF Spaces
- v2.7 — Gemini 2.5 Flash Lite primary + OpenRouter fallback
- Earlier — HuggingFace (blocked), DeepSeek, keyword-only scoring

## Known Issues
- HuggingFace Spaces server NOT YET DEPLOYED — user needs to create and upload
- CORS proxies don't work for Reddit JSON (only RSS works)
- Reddit JSON comment fetching requires the Flask/Gradio server
- Without server, traffic light falls back to post-content-only scoring
- User runs app from phone browser (no F12/Console access)
