const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { expandKeywords } = require('./expand');
const { countKeywords } = require('./count');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_DIR = path.join(__dirname, 'data');
const EXPANDED_FILE = path.join(DATA_DIR, 'expanded.jsonl');
const COUNTS_FILE = path.join(DATA_DIR, 'counts.jsonl');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let expandState = {
  running: false, total: 0, done: 0, failed: 0,
  startedAt: null, error: null,
  keywords: []
};

let countState = {
  running: false, total: 0, done: 0, failed: 0,
  quotaUsed: 0, quotaExhausted: false,
  startedAt: null, error: null,
  keywords: []
};

function elapsedSec(startedAt) {
  return startedAt ? ((Date.now() - startedAt) / 1000).toFixed(1) : '0.0';
}

function estimateETC(state) {
  if (!state.startedAt || state.done === 0) return '?';
  const sec = elapsedSec(state.startedAt);
  const rate = state.done / parseFloat(sec);
  if (rate <= 0) return '?';
  const remaining = (state.total - state.done) / rate;
  if (remaining < 60) return Math.round(remaining) + 's';
  if (remaining < 3600) return Math.round(remaining / 60) + 'm';
  return (remaining / 3600).toFixed(1) + 'h';
}

function readJSONL(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf-8')
    .split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/* ─── Health ─── */
app.get('/ping', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.1.0',
    uptime: process.uptime(),
    expand: { running: expandState.running, done: expandState.done, total: expandState.total },
    count: { running: countState.running, done: countState.done, total: countState.total }
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'Niche Finder Termux Server',
    version: '1.1.0',
    endpoints: {
      ping: '/ping',
      related: 'POST /api/related',
      rising: 'POST /api/rising',
      expand: 'POST /api/expand',
      expandStatus: '/api/expand-status',
      keywords: '/api/keywords',
      count: 'POST /api/count',
      countStatus: '/api/count-status',
      results: '/api/results'
    }
  });
});

/* ─── Google Trends: Related Queries ─── */
const googleTrends = require('google-trends-api');

function parseRelated(result) {
  const data = JSON.parse(result);
  const ranked = data.default && data.default.rankedList;
  if (!ranked || ranked.length < 2) return { top: [], rising: [] };
  const top = (ranked[0].rankedKeyword || []).map(item => ({ keyword: item.query, value: item.value }));
  const rising = (ranked[1].rankedKeyword || []).map(item => ({ keyword: item.query, value: item.value }));
  return { top, rising };
}

app.post('/api/related', async (req, res) => {
  const { keyword, country } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'keyword required' });
  try {
    const result = await googleTrends.relatedQueries({ keyword, geo: country || 'US', hl: 'en', time: 'today 1-m' });
    const out = parseRelated(result);
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rising', async (req, res) => {
  const { keywords, country } = req.body || {};
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0)
    return res.status(400).json({ error: 'keywords array required' });
  try {
    const allRising = [];
    const seen = new Set();
    for (const kw of keywords) {
      if (!kw || kw.length < 2) continue;
      try {
        const result = await googleTrends.relatedQueries({ keyword: kw, geo: country || 'US', hl: 'en', time: 'today 1-m' });
        const out = parseRelated(result);
        for (const item of out.rising) {
          const q = item.keyword || '';
          if (q && !seen.has(q.toLowerCase())) {
            seen.add(q.toLowerCase());
            allRising.push({ keyword: q, parent: kw });
          }
        }
      } catch (e) {
        console.log(`[rising] Skipped "${kw}": ${e.message}`);
      }
    }
    res.json({ keywords: allRising, total: allRising.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Restart: clear data ─── */
app.post('/api/restart', (req, res) => {
  try {
    if (fs.existsSync(EXPANDED_FILE)) fs.unlinkSync(EXPANDED_FILE);
    if (fs.existsSync(COUNTS_FILE)) fs.unlinkSync(COUNTS_FILE);
    expandState = { running: false, total: 0, done: 0, failed: 0, startedAt: null, error: null, keywords: [], phase: null, currentKeyword: null, sub: null, l2Done: 0, l2Total: 0 };
    countState = { running: false, total: 0, done: 0, failed: 0, quotaUsed: 0, quotaExhausted: false, startedAt: null, error: null, keywords: [] };
    console.log('[restart] Data files cleared');
    res.json({ status: 'ok', message: 'All data cleared. You can start fresh.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ─── Expand ─── */
app.post('/api/expand', (req, res) => {
  const { keywords } = req.body || {};
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'Keywords array required' });
  }
  if (expandState.running) {
    return res.status(409).json({ error: 'Expansion already running', state: expandState });
  }

  fs.writeFileSync(EXPANDED_FILE, '');

  expandState = {
    running: true,
    total: keywords.length,
    done: 0,
    failed: 0,
    startedAt: Date.now(),
    error: null,
    keywords: [...keywords],
    phase: null, currentKeyword: null, sub: null, l2Done: 0, l2Total: 0
  };

  expandKeywords(keywords, EXPANDED_FILE, expandState)
    .then(() => {
      expandState.running = false;
      console.log(`[expand] Done: ${expandState.done}/${expandState.total} keywords expanded`);
    })
    .catch(err => {
      expandState.running = false;
      expandState.error = err.message;
      console.error(`[expand] Fatal: ${err.message}`);
    });

  res.json({ status: 'started', total: keywords.length });
});

app.get('/api/expand-status', (req, res) => {
  const elapsed = elapsedSec(expandState.startedAt);
  let pct = 0;
  if (expandState.total > 0) {
    const base = expandState.done / expandState.total;
    if (expandState.phase === 'level2' && expandState.l2Total > 0) {
      const l2Pct = expandState.l2Done / expandState.l2Total;
      pct = Math.round((base + l2Pct / expandState.total) * 100);
    } else {
      pct = Math.round(base * 100);
    }
  }
  res.json({
    running: expandState.running,
    total: expandState.total,
    done: expandState.done,
    failed: expandState.failed,
    error: expandState.error,
    elapsed: elapsed + 's',
    etc: estimateETC(expandState),
    pct,
    phase: expandState.phase || null,
    sub: expandState.sub || null,
    currentKeyword: expandState.currentKeyword || null,
    l2Done: expandState.l2Done || 0,
    l2Total: expandState.l2Total || 0
  });
});

/* ─── Keywords ─── */
app.get('/api/keywords', (req, res) => {
  const items = readJSONL(EXPANDED_FILE);

  const src = req.query.src;
  let filtered = items;
  if (src === 'l1') filtered = items.filter(i => i.src === 'l1');
  else if (src === 'l2') filtered = items.filter(i => i.src === 'l2');

  const limit = parseInt(req.query.limit) || 0;
  if (limit > 0 && filtered.length > limit) {
    filtered = filtered.slice(0, limit);
  }

  res.json(filtered);
});

/* ─── Count ─── */
app.post('/api/count', (req, res) => {
  const { keywords, ytKey, daysBack } = req.body || {};
  if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'Keywords array required' });
  }
  if (!ytKey) {
    return res.status(400).json({ error: 'YouTube API key required' });
  }
  if (countState.running) {
    return res.status(409).json({ error: 'Counting already running', state: countState });
  }

  fs.writeFileSync(COUNTS_FILE, '');

  countState = {
    running: true,
    total: keywords.length,
    done: 0,
    failed: 0,
    quotaUsed: 0,
    quotaExhausted: false,
    startedAt: Date.now(),
    error: null,
    keywords: req.body.originals || expandState.keywords || []
  };

  const db = typeof daysBack === 'number' ? daysBack : 90;
  countKeywords(keywords, ytKey, COUNTS_FILE, countState, db)
    .then(() => {})
    .catch(err => {
      countState.running = false;
      countState.error = err.message;
      console.error(`[count] Fatal: ${err.message}`);
    });

  const quotaEstimate = Math.min(keywords.length, 100) * 100;
  res.json({
    status: 'started',
    total: Math.min(keywords.length, 100),
    quotaUnits: quotaEstimate,
    dailyLimit: 10000,
    daysBack: db
  });
});

const DAILY_QUOTA = 10000;

app.get('/api/count-status', (req, res) => {
  const elapsed = elapsedSec(countState.startedAt);
  res.json({
    running: countState.running,
    total: countState.total,
    done: countState.done,
    failed: countState.failed,
    quotaUsed: countState.quotaUsed,
    quotaExhausted: countState.quotaExhausted,
    error: countState.error,
    elapsed: elapsed + 's',
    etc: estimateETC(countState),
    pct: countState.total > 0 ? Math.round((countState.done / countState.total) * 100) : 0,
    quotaPct: Math.round((countState.quotaUsed / DAILY_QUOTA) * 100)
  });
});

/* ─── Combined Results ─── */
app.get('/api/results', (req, res) => {
  const expanded = readJSONL(EXPANDED_FILE);
  const counts = readJSONL(COUNTS_FILE);
  res.json({ expanded, counts });
});

/* ─── Error handling ─── */
app.use((err, req, res, next) => {
  console.error('[server] Unhandled:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught:', err.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n Niche Finder Server v1.1.0`);
  console.log(` ──────────────────────────`);
  console.log(` Running on: http://127.0.0.1:${PORT}`);
  console.log(` Ping:       /ping`);
  console.log(` Related:    POST /api/related`);
  console.log(` Rising:     POST /api/rising`);
  console.log(` Restart:    POST /api/restart`);
  console.log(` Expand:     POST /api/expand`);
  console.log(` Status:     /api/expand-status`);
  console.log(` Keywords:   /api/keywords`);
  console.log(` Count:      POST /api/count`);
  console.log(` Count st:   /api/count-status`);
  console.log(` Results:    /api/results`);
  console.log(`\n`);
});
