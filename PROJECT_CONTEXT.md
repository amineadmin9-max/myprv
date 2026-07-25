# Niche Finder - Project Context
## Last updated: 2026-07-25

## Quick Start
In a new conversation, just say:
> "اقرأ PROJECT_CONTEXT.md في /home/daytona/myproject"

---

## What is this project?
A **Niche Finder** web app that finds profitable niches by combining:
- **Reddit Unmet Demand** — posts asking for products/tools that don't exist
- **Google Trends** — topics with rising search interest
- **OpenRouter AI** — analyzes and classifies everything (topic extraction, promo scoring, trending/evergreen)

## Tech Stack
- Pure HTML/CSS/JS (no frameworks, no build step)
- Single file: `docs/index.html` (deployed via GitHub Pages)
- Backend: Flask (`server/app.py`)
- Mobile app: React Native (`niche-finder/`)
- CORS proxies for Reddit RSS + Google Trends API
- **OpenRouter API** (OpenAI-compatible format) for AI analysis

## GitHub
- Repo: `amineadmin9-max/myprv`
- Remote URL has token embedded for push: `https://<token>@github.com/amineadmin9-max/myprv.git`
- GitHub Pages URL: `https://amineadmin9-max.github.io/myprv/`
- Push from `/home/daytona/myproject` — just `git add . && git commit -m "msg" && git push`

## OpenRouter API (current LLM provider)
- **Provider**: OpenRouter (switched from DeepSeek on 2026-07-25)
- **Endpoint**: `https://openrouter.ai/api/v1/chat/completions`
- **Auth**: `Authorization: Bearer <API_KEY>` header
- **Key**: stored in localStorage (`nf_openrouter_key`)
- **Format**: OpenAI-compatible chat completions
- **Fallback chain**: 7 free models with automatic switching on failure/rate-limit
- User rule: LLM is for **analysis only**, NOT content generation

### Fallback Chain (LLM_MODELS array)
1. `meta-llama/llama-3.3-70b-instruct:free` — primary model
2. `qwen/qwen-2.5-72b-instruct:free` — strong fallback
3. `nvidia/nemotron-3-super-120b-a12b:free` — 120B, structured outputs
4. `google/gemma-4-31b-it:free` — Google quality, response_format
5. `openai/gpt-oss-20b:free` — OpenAI, structured outputs
6. `nvidia/nemotron-nano-9b-v2:free` — lightweight, fast
7. `openrouter/free` — meta-router (picks best available)

### Fallback Logic
- Tries models in order from index 0 to 6
- On 429 (rate limit) or any error → moves to next model
- Logs each attempt and success/failure
- `llmStats.lastModel` tracks which model actually worked
- All models are free (no cost)

## Architecture (docs/index.html)
### Pages (bottom nav: 2 tabs)
1. **Search** — manual search + auto-discovery button
2. **Schedule/Monitors** — create/toggle/delete monitoring channels
3. **Create Monitor** — form to add new monitors
4. **Notifications** — alert history

### UI Features (updated 2026-07-25)
- **3-dot menu** (⋮) in header — opposite side of bell icon
- **Dropdown menu**: "Add OpenRouter API" + "About"
- **Modal dialogs**: API key input, About page
- **OpenRouter API Stats panel**: shows Total/OK/Fail + first raw error in results

### Key Functions
- `callOpenRouter(prompt, timeoutMs)` — calls OpenRouter API with fallback to backup model
- `_llmFetch(model, prompt, timeoutMs)` — low-level LLM fetch helper
- `extractTopic(post)` — AI analyzes Reddit post → clean topic name (uses callOpenRouter)
- `batchClassify(posts)` — AI classifies 10 posts at once (promo/edu/story/interactive scores 0-100)
- `classifyTrendingAI(topic, trendsIdeas)` — AI determines Trending vs Evergreen
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
- `PROXIES` — CORS proxy URLs (corsproxy.io, codetabs)
- `LLM_BASE`, `LLM_MODEL`, `FALLBACK_MODEL` — OpenRouter config
- `SEED_SUBS` — ['findareddit','whatisthisthing','DoesAnybodyElse','AskReddit']
- `PROMO_KW`, `DISCUSSION_KW`, `STORY_KW`, `DEMAND_KW`, `COMMERCIAL_KW`, `TREND_KW` — keyword arrays
- `GARBAGE` — set of meaningless words for topic validation
- `LLM_CAP=10` — max posts that go through AI validation per run
- `llmStats` — tracks Total/OK/Fail/firstError for diagnostic panel

### Data Flow (Auto Discovery)
1. `fetchSeedsFromReddit()` → fetches posts (10 per subreddit, max 40)
2. For each post: `processSeedPost()` → AI validates unmet demand (yes/no) — **max 10 LLM calls**
3. For each validated post: `extractTopic()` → clean topic name (2 attempts, fallback: regex)
4. `fetchGoogleTrends()` → cached trends data
5. For each seed: `findRelatedSubreddits()` → related subreddits
6. `mergeAndScoreIdeas()` → merge trends + seeds, classify each
7. For top 10: `searchReddit(topic)` → find real posts (10 posts max)
8. `computeTrafficLight(posts)` → AI batch classify → promo/edu/story scores (10 posts batch)
9. `classifyTrendingAI()` → Trending/Evergreen classification
10. `renderDiscoveryResults()` → display ranked results + OpenRouter API Stats panel

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
- Switched from DeepSeek to OpenRouter (meta-llama/llama-3.3-70b-instruct:free)
- Added fallback model (qwen/qwen-2.5-72b-instruct:free) for 429/error handling
- Reduced LLM calls: 10 posts max per search, 10 batch classify
- Cleaned up all Gemini/DeepSeek naming to generic LLM/OpenRouter
- API key now stored in localStorage (not hardcoded)

## Known Issues
- CORS proxies sometimes fail (Reddit rate limiting)
- Service worker may need updating if offline support added
- `niche-finder-web/index.html` not synced with `docs/index.html`
- Free models may hit rate limits during heavy usage
