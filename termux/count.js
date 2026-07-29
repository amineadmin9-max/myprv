const https = require('https');
const fs = require('fs');

const YT_API_HOST = 'www.googleapis.com';
const DAILY_QUOTA = 10000;
const COST_SEARCH = 100;
const COST_VIDEOS = 1;
const MAX_SEARCHES = 100;
const VIDEOS_PER_KEYWORD = 20;
const VID_BATCH_SIZE = 50;
const REQ_TIMEOUT = 15000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function httpsGetJSON(host, path, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path, timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function priorityScore(keyword, originals) {
  let s = 0;
  const len = keyword.length;
  if (len >= 5 && len <= 40) s += 50;
  else if (len < 5) s += 20;
  else s += Math.max(0, 50 - (len - 40));
  for (const o of originals) {
    if (keyword.toLowerCase().startsWith(o.toLowerCase())) { s += 30; break; }
  }
  const words = keyword.split(' ').length;
  s += Math.max(0, 10 - words);
  return s;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function countRecent(videos, days) {
  const cutoff = Date.now() - days * 86400000;
  return videos.filter(v => {
    const t = new Date(v.published).getTime();
    return !isNaN(t) && t >= cutoff;
  }).length;
}

async function searchKeyword(keyword, apiKey, daysBack) {
  const q = encodeURIComponent(keyword);
  let p = `/youtube/v3/search?part=snippet&type=video&q=${q}&maxResults=${VIDEOS_PER_KEYWORD}&key=${apiKey}`;
  if (daysBack > 0) p += `&publishedAfter=${daysAgo(daysBack)}`;
  const data = await httpsGetJSON(YT_API_HOST, p, REQ_TIMEOUT);
  if (data.error) throw new Error(data.error.message || 'YouTube API error');
  const items = data.items || [];
  const videoIds = items.map(v => v.id.videoId).filter(Boolean);
  const videos = items.map(v => ({
    videoId: v.id.videoId,
    title: v.snippet.title,
    channel: v.snippet.channelTitle || '',
    description: v.snippet.description || '',
    published: v.snippet.publishedAt || '',
  }));
  return {
    totalResults: data.pageInfo ? data.pageInfo.totalResults || 0 : 0,
    videoIds,
    videos
  };
}

async function fetchStats(videoIds, apiKey) {
  const statsMap = {};
  for (let i = 0; i < videoIds.length; i += VID_BATCH_SIZE) {
    const batch = videoIds.slice(i, i + VID_BATCH_SIZE);
    const ids = batch.join(',');
    const p = `/youtube/v3/videos?part=statistics&id=${ids}&key=${apiKey}`;
    const data = await httpsGetJSON(YT_API_HOST, p, REQ_TIMEOUT);
    if (data.error) throw new Error(data.error.message);
    for (const v of (data.items || [])) {
      statsMap[v.id] = {
        views: parseInt(v.statistics?.viewCount || 0),
        likes: parseInt(v.statistics?.likeCount || 0),
        comments: parseInt(v.statistics?.commentCount || 0),
      };
    }
  }
  return statsMap;
}

async function countKeywords(keywords, apiKey, outputFile, progress, daysBack = 90) {
  const append = (obj) => {
    fs.appendFileSync(outputFile, JSON.stringify(obj) + '\n');
  };

  const originals = progress.keywords || [];

  /* Sort by priority */
  const sorted = [...keywords].sort((a, b) => {
    const ka = a.keyword || a;
    const kb = b.keyword || b;
    return priorityScore(kb, originals) - priorityScore(ka, originals);
  });

  const totalToSearch = Math.min(MAX_SEARCHES, sorted.length);
  const results = [];
  let allVideoIds = [];
  let quotaUsed = 0;
  let searchCount = 0;

  /* Phase 1: search.list for each keyword */
  for (let i = 0; i < totalToSearch; i++) {
    if (quotaUsed + COST_SEARCH > DAILY_QUOTA) {
      append({ _meta: 'quota_exhausted', used: quotaUsed, remaining: sorted.length - i });
      progress.quotaExhausted = true;
      break;
    }

    const kw = sorted[i];
    const keyword = kw.keyword || kw;
    searchCount++;

    try {
      const result = await searchKeyword(keyword, apiKey, daysBack);
      results.push({
        keyword,
        totalResults: result.totalResults,
        videos: result.videos
      });
      allVideoIds = allVideoIds.concat(result.videoIds);
      progress.done = i + 1;
      progress.quotaUsed = quotaUsed + COST_SEARCH;
      quotaUsed += COST_SEARCH;
      console.log(`[count] OK ${i+1}/${totalToSearch}: "${keyword}" -> ${result.totalResults} videos`);
    } catch (err) {
      results.push({ keyword, error: err.message, totalResults: 0, videos: [] });
      progress.done = i + 1;
      progress.failed++;
      console.log(`[count] FAIL ${i+1}/${totalToSearch}: "${keyword}" -> ${err.message}`);
    }

    await sleep(500 + Math.random() * 500);
  }

  /* Phase 2: videos.list for all collected IDs */
  if (allVideoIds.length > 0) {
    console.log(`[count] Fetching stats for ${allVideoIds.length} videos...`);
    try {
      const statsMap = await fetchStats(allVideoIds, apiKey);
      quotaUsed += COST_VIDEOS;
      progress.quotaUsed = quotaUsed;

      for (const r of results) {
        if (!r.error && r.videos) {
          for (const v of r.videos) {
            const s = statsMap[v.videoId] || {};
            v.views = s.views || 0;
            v.likes = s.likes || 0;
            v.comments = s.comments || 0;
          }
        }
      }
      console.log(`[count] Stats OK for ${allVideoIds.length} videos`);
    } catch (err) {
      console.log(`[count] Stats failed: ${err.message}`);
    }
  }

  /* Write all results to JSONL */
  for (const r of results) {
    if (!r.error) {
      const totalViews = r.videos.reduce((s, v) => s + v.views, 0);
      const avgViews = r.videos.length > 0 ? Math.round(totalViews / r.videos.length) : 0;
      append({
        keyword: r.keyword,
        totalResults: r.totalResults,
        videos: r.videos,
        avgViews,
        totalViews,
        recent7dCount: countRecent(r.videos, 7),
        recent30dCount: countRecent(r.videos, 30),
        daysBack,
        ts: Date.now()
      });
    } else {
      append({ keyword: r.keyword, error: r.error, ts: Date.now() });
    }
  }

  progress.running = false;
  console.log(`[count] Done: ${searchCount} searched, ${results.filter(r => !r.error).length} OK, ${progress.failed} failed`);
}

module.exports = { countKeywords };
