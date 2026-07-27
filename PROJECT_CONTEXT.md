# Niche Finder - Project Context
## Last updated: 2026-07-27 (9th update — Added Logs modal for monitoring all operations)

## Quick Start
In a new conversation, just say:
> "اقرأ PROJECT_CONTEXT.md في /home/daytona/myproject"

---

## What is this project?
A **Niche Finder** web app that finds profitable niches by combining:
- **Google Trends** — evergreen (3 months) + trending (1 week) keyword discovery
- **YouTube Data API v3** — video search, stats (views/likes/comments), traffic light scoring
- **AI (Gemini + OpenRouter)** — classifies niches, filters, and summarizes

> **Reddit is completely blocked** from all datacenter IPs at TCP level — only residential IPs work. The app now uses YouTube + Google Trends exclusively.

## Tech Stack
- Pure HTML/CSS/JS (no frameworks, no build step)
- Single file: `docs/index.html` (deployed via GitHub Pages)
- AI: Gemini 2.5 Flash Lite (primary) + OpenRouter (fallback)
- YouTube Data API v3 for video search + stats
- Google Trends (via pytrends in scraper.py) for keyword discovery

## GitHub
- Repo: `amineadmin9-max/myprv`
- Remote URL has token embedded for push: `https://<token>@github.com/amineadmin9-max/myprv.git`
- GitHub Pages URL: `https://amineadmin9-max.github.io/myprv/`
- Push from `/home/daytona/myproject` — just `git add . && git commit -m "msg" && git push`

## AI Providers
- **Gemini 2.5 Flash Lite** (primary) — key in localStorage `nf_gemini_key`
- **OpenRouter** (fallback) — key in localStorage `nf_openrouter_key`
- `callLLM(prompt)` → tries Gemini first, then OpenRouter
- User rule: LLM is for **analysis only**, max 5-7 calls per run
- AI calls reduced: batch size 50, Google Trends returns up to 100 keywords → ~2 AI calls total

## YouTube API
- **YouTube Data API v3** — key in localStorage `nf_yt_key`
- `searchYouTubeVideos(keyword, daysBack, maxResults)` — searches YouTube, returns `{videos, totalResults}`
- `getYouTubeVideoStats(videoIds)` — fetches views/likes/comments for video IDs
- `fetchYouTubeTrendingByCategory()` — fetches trending videos (currently disabled)
- API quota: ~100 units per search (100 keywords = ~10,000 units)

## Traffic Light System (YouTube) — 6 colors
### How it works:
1. Get keywords from Google Trends (3 months evergreen + 1 week trending)
2. Search YouTube videos per keyword (top 20, but totalResults from API)
3. Count promo links in video descriptions
4. Check avg views for engagement level (highEng = avgViews > 10,000)
5. Apply scoring rules using **totalResults** (not just 20 fetched):

| Condition | Color | Label |
|-----------|-------|-------|
| videoCount<5K AND highEng AND links≤3 | 🔵 | Clean opportunity — very low competition |
| videoCount≤25K AND highEng AND links≤3 | 🟢 | Open market — moderate competition + good engagement |
| videoCount≤25K AND links≤8 | 🟡 | Growing market — some activity |
| videoCount>25K AND links≤8 | 🟠 | Large market — moderate competition |
| videoCount>25K AND links>8 | 🔴 | Saturated — high volume + many promo links |
| videoCount≤25K AND links>8 | 🟣 | Saturated — many promo links with lower volume |

### Key functions:
- `computeYouTubeScoring(videos, totalResults)` — main scoring, uses totalResults for thresholds
- `countLinksInText(text)` — counts URLs in text

## Architecture (docs/index.html)
### Pages (bottom nav: 2 tabs)
1. **Search** — manual search (YouTube) + dual discovery (evergreen + trending)
2. **Schedule/Monitors** — create/toggle/delete YouTube keyword monitors
3. **Notifications** — alert history

### Settings (3-dot menu dropdown)
1. **Gemini / OpenRouter API** — API keys modal
2. **YouTube API** — YouTube Data API v3 key
3. **Backend Server** — server URL
4. **Logs** — real-time operation logs (success/error/warn)
5. **About** — version info

### Dual Discovery Flow
1. `fetchGoogleTrendsYouTube('month')` — evergreen keywords (30 days, batch=1, delay=8s, retry=3x)
2. `aiFilterAndSummarize()` — LLM filters into niche keywords (batch 50)
3. `fetchGoogleTrendsKeywords('7d')` — trending keywords (1 week)
4. `aiFilterAndSummarize()` — LLM filters trending (batch 50)
5. For each niche: `searchYouTubeVideos(keyword, daysBack, 20)` → videos + totalResults
6. `computeYouTubeScoring(videos, totalResults)` — traffic light scoring
7. `renderDualResults()` — display cards with total video count

### Search Flow
1. `handleSearch()` — takes keyword from search box
2. `searchYouTubeVideos(keyword, 90, 20)` — searches YouTube
3. `computeYouTubeScoring(videos, totalResults)` — scoring
4. `renderSearchResult()` — shows total video count + stats + top 8 videos

### Monitor System
- `saveMonitor()` — creates YouTube keyword monitor
- `renderMonitors()` — shows active monitors with Check button
- `checkMonitor(id)` — searches YouTube for keyword, shows scoring
- `runAllMonitors()` — checks all active monitors
- Monitor data: `{id, name, freq, active, lastCheck, lastVideos, lastViews}`

### Key Functions
- `callLLM(prompt)` — tries Gemini → OpenRouter
- `_geminiFetch(prompt, timeoutMs)` — Gemini API call
- `_openrouterFetch(prompt, timeoutMs)` — OpenRouter SSE stream
- `fetchGoogleTrendsKeywords(timeframe)` — Google Trends keywords
- `searchYouTubeVideos(keyword, daysBack, maxResults)` — YouTube search → `{videos, totalResults}`
- `getYouTubeVideoStats(videoIds)` — YouTube video stats
- `aiFilterAndSummarize(items)` — LLM batch filter (50 per batch)
- `computeYouTubeScoring(videos, totalResults)` — traffic light
- `countLinksInText(text)` — count URLs in text
- `renderDualResults(evergreen, trending, stats)` — render cards
- `renderSearchResult(keyword, scoring, videos, totalResults)` — render search
- `renderLLMStats()` — LLM usage stats panel
- `addLog(type, msg)` — add entry to Logs modal (info/success/error/warn)
- `openLogsModal()` — open Logs modal from ⋮ menu

### Constants
- `PROXIES` — CORS proxies (for Google Trends if needed)
- `DEMAND_KW`, `COMMERCIAL_KW`, `TREND_KW` — keyword arrays
- `llmStats` — tracks Total/OK/Fail/provider for stats panel

### Data helpers:
- `getGeminiKey()` — localStorage `nf_gemini_key`
- `getOpenRouterKey()` — localStorage `nf_openrouter_key`
- `getYTKey()` — localStorage `nf_yt_key`

## Files
- `docs/index.html` — MAIN FILE (all CSS+HTML+JS in one file, ~1960 lines)
- `docs/sw.js` — service worker (cache v4)
- `docs/manifest.json` — PWA manifest
- `server/app.py` — Flask app (playwright optional, for Termux compatibility)
- `server/requirements.txt` — flask, flask-cors, requests, gunicorn, pytrends
- `scraper.py` — Standalone YouTube + Google Trends scraper (for GitHub Actions)
- `.github/workflows/scraper.yml` — GitHub Actions workflow
- `worker.js` — Cloudflare Worker general-purpose Reddit proxy (legacy)
- `wrangler.toml` — Worker deployment config (legacy)
- `requirements.txt` — Python deps for scraper

## Deploy Steps (GitHub Pages)
1. Push code to GitHub (`docs/` folder)
2. GitHub Pages auto-deploys from `docs/` folder
3. Open app: `https://amineadmin9-max.github.io/myprv/`
4. Set YouTube API key: ⚙️ → YouTube API → paste key → Save
5. Set AI key: ⚙️ → Gemini / OpenRouter → paste key → Save

## Version History
- v3.4 — Added Logs modal: ⋮ → Logs shows all operations, errors, and status in real-time
- v3.3 — Reduced evergreen from 90 to 30 days (fixes hour-long stall, ~4-12 min)
- v3.2 — Fixed CORS proxy rate limiting: batch=1, delay=8s, retry=3x with 15s backoff
- v3.1 — Evergreen now fetches full 90 days from Google Trends
- v3.0 — YouTube-only (no Reddit), Google Trends + YouTube + AI traffic light
- v2.9 — Cloudflare Worker proxy for Reddit (now legacy)
- v2.8 — Comment-based traffic light + Flask server proxy
- v2.7 — Gemini 2.5 Flash Lite primary + OpenRouter fallback

## Known Issues
- YouTube API quota: ~100 units per search (100 keywords = ~10,000 units)
- Google Trends may be blocked from datacenter IPs (scraper.py works around this)
- CORS proxies have rate limits (~10-30 req/min); 30-day fetch takes ~4-12 min with retry
- Google Trends API only retains ~30 days of daily data
- User runs app from phone browser (no F12/Console access)
- All UI text is in English (no Arabic)
