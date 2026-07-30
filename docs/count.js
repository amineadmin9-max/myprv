const COUNT_STORAGE_KEY = 'nf_counts';
const YT_API_BASE = 'https://www.googleapis.com';
const DAILY_QUOTA = 10000;
const COST_SEARCH = 100;
const COST_VIDEOS = 1;
const MAX_SEARCHES = 100;
const VIDEOS_PER_KEYWORD = 20;
const VID_BATCH_SIZE = 50;

function readCounts() {
  try {
    const raw = localStorage.getItem(COUNT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeCounts(arr) {
  localStorage.setItem(COUNT_STORAGE_KEY, JSON.stringify(arr));
}

function sleepBrowser(ms) {
  return new Promise(r => setTimeout(r, ms));
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

async function apiFetch(path, apiKey) {
  const url = YT_API_BASE + path + '&key=' + encodeURIComponent(apiKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'HTTP ' + res.status);
  }
  return res.json();
}

async function searchKeyword(keyword, apiKey, daysBack) {
  const q = encodeURIComponent(keyword);
  let path = `/youtube/v3/search?part=snippet&type=video&q=${q}&maxResults=${VIDEOS_PER_KEYWORD}`;
  if (daysBack > 0) path += `&publishedAfter=${daysAgo(daysBack)}`;
  const data = await apiFetch(path, apiKey);
  const items = data.items || [];
  const videos = items.map(v => ({
    videoId: v.id.videoId,
    title: v.snippet.title,
    channel: v.snippet.channelTitle || '',
    description: v.snippet.description || '',
    published: v.snippet.publishedAt || '',
  }));
  return {
    totalResults: data.pageInfo ? data.pageInfo.totalResults || 0 : 0,
    videoIds: videos.map(v => v.videoId).filter(Boolean),
    videos
  };
}

async function fetchStats(videoIds, apiKey) {
  const statsMap = {};
  for (let i = 0; i < videoIds.length; i += VID_BATCH_SIZE) {
    const batch = videoIds.slice(i, i + VID_BATCH_SIZE);
    const ids = batch.join(',');
    const path = `/youtube/v3/videos?part=statistics&id=${ids}`;
    const data = await apiFetch(path, apiKey);
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

async function countKeywords(keywords, apiKey, daysBack = 90, onProgress) {
  const originals = keywords.map(k => typeof k === 'string' ? k : (k.keyword || ''));
  const sorted = [...keywords.map(k => typeof k === 'string' ? { keyword: k } : k)]
    .sort((a, b) => priorityScore(b.keyword || b, originals) - priorityScore(a.keyword || a, originals));

  const totalToSearch = Math.min(MAX_SEARCHES, sorted.length);
  const results = [];
  let allVideoIds = [];
  let quotaUsed = 0;

  for (let i = 0; i < totalToSearch; i++) {
    if (quotaUsed + COST_SEARCH > DAILY_QUOTA) break;
    const kw = sorted[i];
    const keyword = typeof kw === 'string' ? kw : (kw.keyword || '');
    if (!keyword) continue;

    if (onProgress) onProgress(keyword, i + 1, totalToSearch);

    try {
      const result = await searchKeyword(keyword, apiKey, daysBack);
      results.push({ keyword, totalResults: result.totalResults, videos: result.videos });
      allVideoIds = allVideoIds.concat(result.videoIds);
      quotaUsed += COST_SEARCH;
    } catch (err) {
      results.push({ keyword, error: err.message, totalResults: 0, videos: [] });
    }
    await sleepBrowser(500 + Math.random() * 500);
  }

  if (allVideoIds.length > 0) {
    try {
      const statsMap = await fetchStats(allVideoIds, apiKey);
      quotaUsed += COST_VIDEOS;
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
    } catch (e) {
      console.warn('Stats fetch failed:', e.message);
    }
  }

  const output = [];
  for (const r of results) {
    if (!r.error) {
      const totalViews = r.videos.reduce((s, v) => s + v.views, 0);
      const avgViews = r.videos.length > 0 ? Math.round(totalViews / r.videos.length) : 0;
      const avgLikes = r.videos.length > 0 ? Math.round(r.videos.reduce((s, v) => s + v.likes, 0) / r.videos.length) : 0;
      const avgComments = r.videos.length > 0 ? Math.round(r.videos.reduce((s, v) => s + v.comments, 0) / r.videos.length) : 0;

      const now = Date.now();
      let ageTotal = 0, ageCount = 0;
      for (const v of r.videos) {
        const t = new Date(v.published).getTime();
        if (!isNaN(t)) { ageTotal += now - t; ageCount++; }
      }
      const avgVideoAge = ageCount > 0 ? Math.round(ageTotal / ageCount / 86400000) : null;

      output.push({
        keyword: r.keyword,
        totalResults: r.totalResults,
        avgViews, avgLikes, avgComments,
        avgVideoAge,
        recent7dCount: countRecent(r.videos, 7),
        recent30dCount: countRecent(r.videos, 30),
        daysBack, ts: Date.now()
      });
    } else {
      output.push({ keyword: r.keyword, error: r.error, ts: Date.now() });
    }
  }

  writeCounts(output);
  return output;
}

function clearCounts() {
  localStorage.removeItem(COUNT_STORAGE_KEY);
}
