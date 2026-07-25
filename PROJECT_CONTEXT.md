# Niche Finder - Project Context
## Last updated: 2025-07-26

## Quick Start
In a new conversation, just say:
> "اقرأ PROJECT_CONTEXT.md في /home/daytona/myproject"

---

## What is this project?
A **Niche Finder** web app that finds profitable niches by combining:
- **Reddit Unmet Demand** — posts asking for products/tools that don't exist
- **Google Trends** — topics with rising search interest
- **DeepSeek AI** — analyzes and classifies everything (topic extraction, promo scoring, trending/evergreen)

## Tech Stack
- Pure HTML/CSS/JS (no frameworks, no build step)
- Single file: `docs/index.html` (deployed via GitHub Pages)
- Backend: Flask (`server/app.py`)
- Mobile app: React Native (`niche-finder/`)
- CORS proxies for Reddit RSS + Google Trends API
- **DeepSeek API** (OpenAI-compatible format) for AI analysis

## GitHub
- Repo: `amineadmin9-max/myprv`
- Remote URL has token embedded for push: `https://<token>@github.com/amineadmin9-max/myprv.git`
- GitHub Pages URL: `https://amineadmin9-max.github.io/myprv/`
- Push from `/home/daytona/myproject` — just `git add . && git commit -m "msg" && git push`

## DeepSeek API (current LLM provider)
- **Provider**: DeepSeek (switched from Gemini on 2025-07-26)
- **Model**: `deepseek-chat`
- **Endpoint**: `https://api.deepseek.com/v1/chat/completions`
- **Auth**: `Authorization: Bearer <API_KEY>` header
- **Key**: hardcoded in config (`LLM_KEY` constant)
- **Format**: OpenAI-compatible chat completions
- **Gemini code**: commented out, kept for rollback if needed
- User rule: LLM is for **analysis only**, NOT content generation

## Architecture (docs/index.html)
### Pages (bottom nav: 2 tabs)
1. **Search** — manual search + auto-discovery button
2. **Schedule/Monitors** — create/toggle/delete monitoring channels
3. **Create Monitor** — form to add new monitors
4. **Notifications** — alert history

### UI Features (added 2025-07-26)
- **3-dot menu** (⋮) in header — opposite side of bell icon
- **Dropdown menu**: "Add DeepSeek API" + "About"
- **Modal dialogs**: API key input, About page
- **DeepSeek API Stats panel**: shows Total/OK/Fail + first raw error in results

### Key Functions
- `callDeepSeek(prompt, timeoutMs)` — calls DeepSeek API (direct first, then CORS proxies)
- `callGemini(prompt, timeoutMs)` — OLD, commented out, kept for rollback
- `geminiExtractTopic(post)` — AI analyzes Reddit post → clean topic name (uses callDeepSeek)
- `geminiBatchClassify(posts)` — AI classifies 15 posts at once (promo/edu/story/interactive scores 0-100)
- `geminiClassifyTrending(topic, trendsIdeas)` — AI determines Trending vs Evergreen
- `processSeedPost(post, seen, allSeeds)` — async, validates unmet demand via AI (yes/no)
- `fetchSeedsFromReddit()` — searches r/findareddit, r/whatisthisthing, r/DoesAnybodyElse, r/AskReddit
- `extractCleanTopic(title, content)` — regex fallback for topic extraction
- `findRelatedSubreddits(topic)` — Reddit subreddit search for related communities
- `fetchGoogleTrends()` — fetches daily trends, caches for classification
- `classifyNicheType(title, source, cachedTrends)` — keyword-based Trending/Evergreen fallback
- `computeTrafficLight(posts)` — async, uses AI batch classify for promo scoring
- `classify(title, selftext)` — local keyword-based promo detection (fallback)
- `handleSearch()` — manual search flow
- `runFullDiscovery()` — full auto-discovery flow
- `renderDiscoveryResults(results)` — renders niche cards with stats panel
- `computeDemandScore(title, content)` — keyword-based demand scoring
- `computeTrendScore(title, content)` — keyword-based trend scoring

### Constants
- `PROXIES` — CORS proxy URLs (corsproxy.io, codetabs) — allorigins removed (GET-only)
- `LLM_BASE`, `LLM_MODEL`, `LLM_KEY` — DeepSeek config
- `SEED_SUBS` — ['findareddit','whatisthisthing','DoesAnybodyElse','AskReddit']
- `PROMO_KW`, `DISCUSSION_KW`, `STORY_KW`, `DEMAND_KW`, `COMMERCIAL_KW`, `TREND_KW` — keyword arrays
- `GARBAGE` — set of meaningless words for topic validation
- `GEMINI_CAP=20` — max posts that go through AI validation per run
- `geminiStats` — tracks Total/OK/Fail/firstError for diagnostic panel

### Data Flow (Auto Discovery)
1. `fetchSeedsFromReddit()` → fetches posts (10 per subreddit, max 40)
2. For each post: `processSeedPost()` → AI validates unmet demand (yes/no) — **max 20 Gemini calls**
3. For each validated post: `geminiExtractTopic()` → clean topic name (2 attempts, fallback: regex)
4. `fetchGoogleTrends()` → cached trends data
5. For each seed: `findRelatedSubreddits()` → related subreddits
6. `mergeAndScoreIdeas()` → merge trends + seeds, classify each
7. For top 10: `searchReddit(topic)` → find real posts
8. `computeTrafficLight(posts)` → AI batch classify → promo/edu/story scores
9. `geminiClassifyTrending()` → Trending/Evergreen classification
10. `renderDiscoveryResults()` → display ranked results + DeepSeek API Stats panel

### AI Filtering Logic (strong filters added 2025-07-26)
- **Pre-filter (regex)**: DAE, subreddit, meme/joke posts rejected before AI
- **AI validation**: "Does this post ask for a specific product or purchasable solution recommendation?"
- **Topic extraction**: AI returns SKIP for non-product posts
- **Fallback on AI failure**: posts are REJECTED (not kept) — safer default

### Monitoring System
- `getMonitors()`, `saveMonitors()` — localStorage
- `saveMonitor()`, `deleteMonitor()`, `toggleMonitor()` — CRUD
- `runAllMonitors()` — checks all active monitors, creates notifications
- `renderMonitors()` — renders monitor list

### Notifications
- `getNotifications()`, `saveNotifications()`, `addNotification()` — localStorage
- `renderNotifications()` — renders notification cards
- `updateNotifBadge()` — updates bell icon count

## Files
- `docs/index.html` — MAIN FILE (all CSS+HTML+JS in one file)
- `docs/sw.js` — service worker (cache v3, clears all old caches on activate)
- `docs/manifest.json` — PWA manifest
- `niche-finder-web/index.html` — old web version
- `niche-finder/src/screens/HomeScreen.js` — React Native mobile app (old design)
- `niche-finder/src/services/reddit.js` — Reddit data fetching
- `niche-finder/src/services/scoring.js` — Post classification
- `server/app.py` — Flask backend
- `data/index.json` — scraped subreddit registry
- `.github/workflows/reddit_scraper.yml` — GitHub Actions scraper

## Recent Commits (newest first)
- c487241 — Update UI labels from Gemini to DeepSeek
- 1b9c090 — Switch to DeepSeek API (deepseek-chat) with OpenAI-compatible format
- 50176b4 — Fix SW: clear all caches on activate, don't cache index.html
- 0f343fb — Bump SW cache to v2 to force invalidation
- 97dc931 — Fix Gemini: try direct fetch first, remove allorigins.win (GET-only)
- a15fc65 — Fix: cap Gemini validations at 20, reduce timeouts, limit seed posts to 10
- 94cdaf2 — UI: 3-dot menu + Gemini API modal + diagnostic stats panel + stronger AI filters

## Known Issues
- CORS proxies sometimes fail (Reddit rate limiting)
- DeepSeek API key is hardcoded (should move to localStorage)
- Service worker may need updating if offline support added
- `niche-finder-web/index.html` not synced with `docs/index.html`
- No error handling for DeepSeek API quota limits
