# Niche Finder - Project Context
## Last updated: 2025-07-25

## Quick Start
In a new conversation, just say:
> "اقرأ PROJECT_CONTEXT.md في /home/daytona/myproject"

---

## What is this project?
A **Niche Finder** web app that finds profitable niches by combining:
- **Reddit Unmet Demand** — posts asking for products/tools that don't exist
- **Google Trends** — topics with rising search interest
- **Gemini AI** — analyzes and classifies everything (topic extraction, promo scoring, trending/evergreen)

## Tech Stack
- Pure HTML/CSS/JS (no frameworks, no build step)
- Single file: `docs/index.html` (deployed via GitHub Pages)
- Backend: Flask (`server/app.py`)
- Mobile app: React Native (`niche-finder/`)
- CORS proxies for Reddit RSS + Google Trends API + Gemini API

## GitHub
- Repo: `amineadmin9-max/myprv`
- Remote URL has token embedded for push: `https://<token>@github.com/amineadmin9-max/myprv.git`
- GitHub Pages URL: `https://amineadmin9-max.github.io/myprv/`
- Push from `/home/daytona/myproject` — just `git add . && git commit -m "msg" && git push`

## Gemini API
- User's key: stored in localStorage via UI (NOT hardcoded in code)
- Endpoint: `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash`
- Used via CORS proxy like Reddit/Trends
- User rule: Gemini is for **analysis only**, NOT content generation

## Architecture (docs/index.html)
### Pages (bottom nav: 2 tabs)
1. **Search** — manual search + auto-discovery button
2. **Schedule/Monitors** — create/toggle/delete monitoring channels
3. **Create Monitor** — form to add new monitors
4. **Notifications** — alert history

### Key Functions
- `callGemini(prompt)` — calls Gemini API via CORS proxy
- `geminiExtractTopic(post)` — Gemini analyzes Reddit post → clean topic name
- `geminiBatchClassify(posts)` — Gemini classifies 15 posts at once (promo/edu/story/interactive scores 0-100)
- `geminiClassifyTrending(topic, trendsIdeas)` — Gemini determines Trending vs Evergreen
- `fetchSeedsFromReddit()` — searches r/findareddit, r/whatisthisthing, r/DoesAnybodyElse, r/AskReddit
- `extractCleanTopic(title, content)` — regex fallback for topic extraction
- `findRelatedSubreddits(topic)` — Reddit subreddit search for related communities
- `fetchGoogleTrends()` — fetches daily trends, caches for classification
- `classifyNicheType(title, source, cachedTrends)` — keyword-based Trending/Evergreen fallback
- `computeTrafficLight(posts)` — async, uses Gemini batch classify for promo scoring
- `classify(title, selftext)` — local keyword-based promo detection (fallback)
- `handleSearch()` — manual search flow
- `runFullDiscovery()` — full auto-discovery flow
- `renderDiscoveryResults(results)` — renders niche cards with scores
- `computeDemandScore(title, content)` — keyword-based demand scoring
- `computeTrendScore(title, content)` — keyword-based trend scoring

### Constants
- `PROXIES` — CORS proxy URLs (allorigins, corsproxy, codetabs)
- `SEED_SUBS` — ['findareddit','whatisthisthing','DoesAnybodyElse','AskReddit']
- `PROMO_KW`, `DISCUSSION_KW`, `STORY_KW`, `DEMAND_KW`, `COMMERCIAL_KW`, `TREND_KW` — keyword arrays
- `GARBAGE` — set of meaningless words for topic validation

### Data Flow (Auto Discovery)
1. `fetchSeedsFromReddit()` → fetches posts from 4 specific subreddits
2. For each post: `geminiExtractTopic()` → clean topic name (fallback: regex)
3. `fetchGoogleTrends()` → cached trends data
4. For each seed: `findRelatedSubreddits()` → related subreddits
5. `mergeAndScoreIdeas()` → merge trends + seeds, classify each
6. For top 10: `searchReddit(topic)` → find real posts
7. `computeTrafficLight(posts)` → Gemini batch classify → promo/edu/story scores
8. `geminiClassifyTrending()` → Trending/Evergreen classification
9. `renderDiscoveryResults()` → display ranked results

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
- `docs/sw.js` — service worker (may need update)
- `docs/manifest.json` — PWA manifest
- `niche-finder-web/index.html` — old web version
- `niche-finder/src/screens/HomeScreen.js` — React Native mobile app (old design)
- `niche-finder/src/services/reddit.js` — Reddit data fetching
- `niche-finder/src/services/scoring.js` — Post classification
- `server/app.py` — Flask backend
- `data/index.json` — scraped subreddit registry
- `.github/workflows/reddit_scraper.yml` — GitHub Actions scraper

## Recent Commits (newest first)
- cb6234f — Add Gemini API: topic extraction, promo scoring, trending/evergreen
- 8fda3c3 — Fix topic extraction, lower scoring thresholds, improve Trends matching
- c5890a8 — Fix auto-discovery: seed from specific subs, clean topic extraction
- 2a8fe40 — Remove top dev navigation bar
- 747b98b — Redesign UI: 4-page app

## Known Issues
- CORS proxies sometimes fail (Reddit rate limiting)
- Gemini API calls via proxy can be slow (30s timeout)
- Service worker may need updating for new design
- `niche-finder-web/index.html` not synced with `docs/index.html`
- No error handling for Gemini API quota limits
