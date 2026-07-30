const EXPAND_STORAGE_KEY = 'nf_expanded';
const MAX_WORDS = 6;
const L2_PER_KW = 3;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function wordCount(s) {
  return s.trim().split(/\s+/).length;
}

function encodeSrc(level) {
  return 'l' + level;
}

function readExpanded() {
  try {
    const raw = localStorage.getItem(EXPAND_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeExpanded(entries) {
  localStorage.setItem(EXPAND_STORAGE_KEY, JSON.stringify(entries));
}

function sleepBrowser(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function jsonpSuggest(query) {
  return new Promise((resolve, reject) => {
    const cb = 'ytcb_' + Math.random().toString(36).slice(2);
    const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}&callback=${cb}`;
    window[cb] = function(data) {
      delete window[cb];
      const s = document.getElementById(cb);
      if (s) s.remove();
      resolve(data);
    };
    const script = document.createElement('script');
    script.id = cb;
    script.src = url;
    script.onerror = function() {
      delete window[cb];
      const s = document.getElementById(cb);
      if (s) s.remove();
      reject(new Error('Network error'));
    };
    document.head.appendChild(script);
    setTimeout(() => {
      if (window[cb]) {
        delete window[cb];
        const s = document.getElementById(cb);
        if (s) s.remove();
        reject(new Error('Timeout'));
      }
    }, 10000);
  });
}

async function suggestYoutube(keyword) {
  try {
    const data = await jsonpSuggest(keyword);
    let arr = data;
    if (typeof arr === 'string') {
      try { arr = JSON.parse(arr); } catch { return []; }
    }
    if (!Array.isArray(arr) || arr.length < 2) return [];
    const items = arr[1];
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      if (typeof item === 'string') return item;
      if (Array.isArray(item)) return item[0];
      if (item && typeof item === 'object') return item.query || item.title || '';
      return '';
    }).filter(s => s && s.length > 0);
  } catch { return []; }
}

function maxLevelInData(entries) {
  let max = 0;
  for (const e of entries) {
    const m = e.src && e.src.match(/l(\d+)/);
    if (m) { const n = parseInt(m[1]); if (n > max) max = n; }
  }
  return max;
}

async function finalSuggestOnBigKwds(entries, onProgress) {
  const small = entries.filter(e => e.wordCount >= MAX_WORDS && !e.final);
  const seen = new Set();
  let changed = false;
  for (const entry of small) {
    if (seen.has(entry.keyword.toLowerCase())) continue;
    seen.add(entry.keyword.toLowerCase());
    if (onProgress) onProgress('Final: ' + entry.keyword, 'final');
    await sleepBrowser(500 + Math.random() * 500);
    const results = await suggestYoutube(entry.keyword);
    for (const sub of results) {
      if (sub && sub.length >= entry.keyword.length) {
        entries.push({
          keyword: sub, src: 'final', parent: entry.keyword,
          root: entry.root, wordCount: wordCount(sub), final: true, ts: Date.now()
        });
      }
    }
    entry.final = true;
    changed = true;
  }
  return changed;
}

async function expandKeywords(keywords, onProgress) {
  let entries = readExpanded();

  if (entries.length === 0) {
    if (onProgress) onProgress('Starting fresh expansion...', null);
    for (let ki = 0; ki < keywords.length; ki++) {
      const keyword = keywords[ki].trim();
      if (!keyword || keyword.length < 2) continue;
      if (onProgress) onProgress(keyword, 'level1');

      const level1 = await suggestYoutube(keyword);
      const validL1 = [];
      for (const sugg of level1) {
        if (!sugg || sugg.length < keyword.length) continue;
        validL1.push(sugg);
        entries.push({ keyword: sugg, src: encodeSrc(1), parent: keyword, root: keyword, wordCount: wordCount(sugg), ts: Date.now() });
      }
      await sleepBrowser(500 + Math.random() * 1000);

      const l2Batch = validL1.slice(0, L2_PER_KW);
      for (let bi = 0; bi < l2Batch.length; bi++) {
        const sugg = l2Batch[bi];
        for (let ci = 0; ci < LETTERS.length; ci++) {
          const letter = LETTERS[ci];
          const query = `${sugg} ${letter}`;
          if (onProgress) onProgress(`${keyword} → "${sugg}" ${letter}`, 'level2');
          const level2 = await suggestYoutube(query);
          const lowerRoot = keyword.toLowerCase();
          for (const sub of level2) {
            if (sub && sub.toLowerCase().startsWith(lowerRoot)) {
              entries.push({ keyword: sub, src: encodeSrc(2), parent: sugg, root: keyword, letter, wordCount: wordCount(sub), ts: Date.now() });
            }
          }
          await sleepBrowser(400 + Math.random() * 600);
        }
      }
      await sleepBrowser(1000 + Math.random() * 1000);
    }
    await finalSuggestOnBigKwds(entries, onProgress);
  } else {
    const maxLvl = maxLevelInData(entries);
    const nextLvl = maxLvl + 1;
    const expandable = entries.filter(e => {
      if (e.final) return false;
      const m = e.src && e.src.match(/l(\d+)/);
      return m && parseInt(m[1]) === maxLvl && e.wordCount < MAX_WORDS;
    });
    if (expandable.length === 0) {
      await finalSuggestOnBigKwds(entries, onProgress);
      if (onProgress) onProgress('All keywords at max depth', null);
      writeExpanded(entries);
      return entries;
    }
    const byParent = {};
    for (const e of expandable) {
      const key = e.parent || e.keyword;
      if (!byParent[key]) byParent[key] = [];
      if (byParent[key].length < L2_PER_KW) byParent[key].push(e);
    }
    const toExpand = Object.values(byParent).flat();
    for (let ei = 0; ei < toExpand.length; ei++) {
      const entry = toExpand[ei];
      const root = entry.root || entry.keyword;
      const lowerRoot = root.toLowerCase();
      if (onProgress) onProgress(entry.keyword, 'level' + nextLvl);
      for (let ci = 0; ci < LETTERS.length; ci++) {
        const letter = LETTERS[ci];
        const query = `${entry.keyword} ${letter}`;
        if (onProgress) onProgress(`${root} → "${entry.keyword}" ${letter}`, 'level' + nextLvl);
        const results = await suggestYoutube(query);
        for (const sub of results) {
          if (sub && sub.toLowerCase().startsWith(lowerRoot)) {
            entries.push({ keyword: sub, src: encodeSrc(nextLvl), parent: entry.keyword, root, letter, wordCount: wordCount(sub), ts: Date.now() });
          }
        }
        await sleepBrowser(400 + Math.random() * 600);
      }
      await sleepBrowser(1000 + Math.random() * 1000);
    }
    await finalSuggestOnBigKwds(entries, onProgress);
  }

  const seen = new Set();
  const unique = [];
  for (const e of entries) {
    if (!seen.has(e.keyword)) {
      seen.add(e.keyword);
      unique.push(e);
    }
  }
  writeExpanded(unique);
  return unique;
}

function clearExpanded() {
  localStorage.removeItem(EXPAND_STORAGE_KEY);
  localStorage.removeItem('nf_counts');
}
