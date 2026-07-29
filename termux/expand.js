const https = require('https');
const fs = require('fs');
const path = require('path');

const SUGGEST_HOST = 'suggestqueries.google.com';
const SUGGEST_PATH = '/complete/search';
const DELAY_MS = { min: 400, max: 1000 };
const BATCH_DELAY = { min: 1000, max: 2000 };
const REQ_TIMEOUT = 8000;
const MAX_RETRIES = 3;
const LEVEL2_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
  return DELAY_MS.min + Math.random() * (DELAY_MS.max - DELAY_MS.min);
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

async function expandKeywords(keywords, outputFile, progress) {
  const append = (obj) => {
    fs.appendFileSync(outputFile, JSON.stringify(obj) + '\n');
  };

  const l2PerKw = 3;
  const letters = LEVEL2_LETTERS.length;
  for (let ki = 0; ki < keywords.length; ki++) {
    const keyword = keywords[ki].trim();
    if (!keyword || keyword.length < 2) {
      progress.done++;
      continue;
    }
    progress.currentKeyword = keyword;

    /* Level 1 */
    progress.phase = 'level1';
    progress.sub = keyword;
    const level1 = await suggestWithRetry(keyword);
    const validL1 = [];
    for (const sugg of level1) {
      if (!sugg || sugg.length < keyword.length) continue;
      validL1.push(sugg);
      append({ keyword: sugg, src: 'l1', parent: keyword, ts: Date.now() });
    }

    /* Pause before Level 2 batch */
    await sleep(500 + Math.random() * 1000);
    /* Level 2 — first 3 suggestions only */
    const l2Batch = validL1.slice(0, l2PerKw);
    progress.l2Total = l2Batch.length * letters;
    progress.l2Done = 0;
    progress.phase = 'level2';
    for (const sugg of l2Batch) {
      for (let ci = 0; ci < LEVEL2_LETTERS.length; ci++) {
        const letter = LEVEL2_LETTERS[ci];
        const query = `${sugg} ${letter}`;
        progress.sub = `${keyword} → "${sugg}" ${letter}`;
        const level2 = await suggestWithRetry(query);
        const lowerOrig = keyword.toLowerCase();
        for (const sub of level2) {
          if (sub && sub.toLowerCase().startsWith(lowerOrig)) {
            append({ keyword: sub, src: 'l2', parent: sugg, letter, ts: Date.now() });
          }
        }
        progress.l2Done++;
        await sleep(randomDelay());
      }
    }

    progress.done++;
    progress.phase = null;
    progress.sub = null;
    await sleep(randomDelay());
    /* Longer pause between keywords */
    await sleep(BATCH_DELAY.min + Math.random() * (BATCH_DELAY.max - BATCH_DELAY.min));
  }

  /* Deduplicate */
  if (!fs.existsSync(outputFile)) return [];
  const raw = fs.readFileSync(outputFile, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const seen = new Set();
  const unique = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (!seen.has(obj.keyword)) {
        seen.add(obj.keyword);
        unique.push(obj);
      }
    } catch {}
  }
  fs.writeFileSync(outputFile, unique.map(o => JSON.stringify(o)).join('\n') + '\n');

  return unique;
}

module.exports = { expandKeywords };
