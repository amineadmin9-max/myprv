const https = require('https');
const fs = require('fs');

const SUGGEST_HOST = 'suggestqueries.google.com';
const SUGGEST_PATH = '/complete/search';
const DELAY_MS = { min: 400, max: 1000 };
const BATCH_DELAY = { min: 1000, max: 2000 };
const REQ_TIMEOUT = 8000;
const MAX_RETRIES = 3;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const MAX_WORDS = 6;
const L2_PER_KW = 3;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
  return DELAY_MS.min + Math.random() * (DELAY_MS.max - DELAY_MS.min);
}

function wordCount(s) {
  return s.trim().split(/\s+/).length;
}

function encodeSrc(level) {
  return 'l' + level;
}

function maxLevelInData(entries) {
  let max = 0;
  for (const e of entries) {
    const m = e.src && e.src.match(/l(\d+)/);
    if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
  }
  return max;
}

function httpsGet(host, path, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path, timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function parseSuggestResponse(text) {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length < 2) return [];
    const items = arr[1];
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      if (typeof item === 'string') return item;
      if (Array.isArray(item)) return item[0];
      if (typeof item === 'object' && item) return item.query || item.title || '';
      return '';
    }).filter(s => s && s.length > 0);
  } catch { return []; }
}

async function suggestWithRetry(keyword, attempt = 0) {
  const q = encodeURIComponent(keyword.trim());
  const p = `${SUGGEST_PATH}?client=youtube&ds=yt&q=${q}`;
  try {
    const text = await httpsGet(SUGGEST_HOST, p, REQ_TIMEOUT);
    return parseSuggestResponse(text);
  } catch (err) {
    if (err.code === 'ERR_INVALID_URL') return [];
    if (attempt < MAX_RETRIES) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await sleep(backoff);
      return suggestWithRetry(keyword, attempt + 1);
    }
    return [];
  }
}

function readAll(outputFile) {
  if (!fs.existsSync(outputFile)) return [];
  return fs.readFileSync(outputFile, 'utf-8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

async function finalSuggestOnBigKwds(outputFile, progress) {
  if (!fs.existsSync(outputFile)) return;
  const raw = fs.readFileSync(outputFile, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const all = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const big = all.filter(e => e.wordCount >= MAX_WORDS && !e.final);
  if (big.length === 0) return;
  const seen = new Set();
  let changed = false;
  for (const entry of big) {
    if (seen.has(entry.keyword.toLowerCase())) continue;
    seen.add(entry.keyword.toLowerCase());
    progress.sub = 'Final: ' + entry.keyword;
    progress.phase = 'final';
    await sleep(500 + Math.random() * 500);
    const results = await suggestWithRetry(entry.keyword);
    for (const sub of results) {
      if (sub && sub.length >= entry.keyword.length) {
        fs.appendFileSync(outputFile, JSON.stringify({
          keyword: sub, src: 'final', parent: entry.keyword,
          root: entry.root, wordCount: wordCount(sub), final: true, ts: Date.now()
        }) + '\n');
      }
    }
    entry.final = true;
    changed = true;
  }
  if (changed) {
    for (let i = 0; i < all.length; i++) {
      if (big.includes(all[i])) {
        lines[i] = JSON.stringify(all[i]);
      }
    }
    fs.writeFileSync(outputFile, lines.join('\n') + '\n');
  }
  progress.sub = null;
  progress.phase = null;
}

async function expandKeywords(keywords, outputFile, progress) {
  const append = (obj) => {
    fs.appendFileSync(outputFile, JSON.stringify(obj) + '\n');
  };
  const existing = readAll(outputFile);

  if (existing.length === 0) {
    /* ── Fresh expansion: L1 + L2 ── */
    progress.total = keywords.length;
    progress.done = 0;
    for (let ki = 0; ki < keywords.length; ki++) {
      const keyword = keywords[ki].trim();
      if (!keyword || keyword.length < 2) { progress.done++; continue; }
      progress.currentKeyword = keyword;

      progress.phase = 'level1';
      progress.sub = keyword;
      const level1 = await suggestWithRetry(keyword);
      const validL1 = [];
      for (const sugg of level1) {
        if (!sugg || sugg.length < keyword.length) continue;
        validL1.push(sugg);
        append({ keyword: sugg, src: encodeSrc(1), parent: keyword, root: keyword, wordCount: wordCount(sugg), ts: Date.now() });
      }
      await sleep(500 + Math.random() * 1000);

      const l2Batch = validL1.slice(0, L2_PER_KW);
      progress.l2Total = l2Batch.length * LETTERS.length;
      progress.l2Done = 0;
      progress.phase = 'level2';
      for (const sugg of l2Batch) {
        for (let ci = 0; ci < LETTERS.length; ci++) {
          const letter = LETTERS[ci];
          const query = `${sugg} ${letter}`;
          progress.sub = `${keyword} → "${sugg}" ${letter}`;
          const level2 = await suggestWithRetry(query);
          const lowerRoot = keyword.toLowerCase();
          for (const sub of level2) {
            if (sub && sub.toLowerCase().startsWith(lowerRoot)) {
              append({ keyword: sub, src: encodeSrc(2), parent: sugg, root: keyword, letter, wordCount: wordCount(sub), ts: Date.now() });
            }
          }
          progress.l2Done++;
          await sleep(randomDelay());
        }
      }

      progress.done++;
      progress.phase = null;
      progress.sub = null;
      await sleep(BATCH_DELAY.min + Math.random() * (BATCH_DELAY.max - BATCH_DELAY.min));
    }

    /* Final suggest on any 6-word entries from fresh expansion */
    await finalSuggestOnBigKwds(outputFile, progress);

  } else {
    /* ── Incremental: next level ── */
    const maxLvl = maxLevelInData(existing);
    const nextLvl = maxLvl + 1;
    const expandable = existing.filter(e => {
      if (e.final) return false;
      const m = e.src && e.src.match(/l(\d+)/);
      return m && parseInt(m[1]) === maxLvl && e.wordCount < MAX_WORDS;
    });
    if (expandable.length === 0) {
      /* Try final suggest on any remaining non-final 6-word entries */
      await finalSuggestOnBigKwds(outputFile, progress);
      progress.total = 0;
      progress.done = 0;
      progress.phase = null;
      progress.sub = 'All keywords at max depth';
      progress.running = false;
      return;
    }
    const byParent = {};
    for (const e of expandable) {
      const key = e.parent || e.keyword;
      if (!byParent[key]) byParent[key] = [];
      if (byParent[key].length < L2_PER_KW) byParent[key].push(e);
    }
    const toExpand = Object.values(byParent).flat();
    progress.total = toExpand.length;
    progress.done = 0;
    for (let ei = 0; ei < toExpand.length; ei++) {
      const entry = toExpand[ei];
      const root = entry.root || entry.keyword;
      const lowerRoot = root.toLowerCase();
      progress.currentKeyword = root;
      progress.phase = 'level' + nextLvl;
      progress.l2Total = LETTERS.length;
      progress.l2Done = 0;
      for (let ci = 0; ci < LETTERS.length; ci++) {
        const letter = LETTERS[ci];
        const query = `${entry.keyword} ${letter}`;
        progress.sub = `${root} → "${entry.keyword}" ${letter}`;
        const results = await suggestWithRetry(query);
        for (const sub of results) {
          if (sub && sub.toLowerCase().startsWith(lowerRoot)) {
            append({ keyword: sub, src: encodeSrc(nextLvl), parent: entry.keyword, root, letter, wordCount: wordCount(sub), ts: Date.now() });
          }
        }
        progress.l2Done++;
        await sleep(randomDelay());
      }
      progress.done++;
      progress.phase = null;
      progress.sub = null;
      await sleep(BATCH_DELAY.min + Math.random() * (BATCH_DELAY.max - BATCH_DELAY.min));
    }

    /* Final suggest on new 6-word entries from this expansion */
    await finalSuggestOnBigKwds(outputFile, progress);
  }

  /* Deduplicate */
  if (!fs.existsSync(outputFile)) return;
  const raw = fs.readFileSync(outputFile, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const seenKwd = new Set();
  const unique = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!seenKwd.has(obj.keyword)) {
        seenKwd.add(obj.keyword);
        unique.push(obj);
      }
    } catch {}
  }
  fs.writeFileSync(outputFile, unique.map(o => JSON.stringify(o)).join('\n') + '\n');
}

module.exports = { expandKeywords };
