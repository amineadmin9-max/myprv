import axios from 'axios';

const REDDIT_BASE = 'https://www.reddit.com';
const USER_AGENT = 'NicheFinder/1.0 (Android App)';

const api = axios.create({
  baseURL: REDDIT_BASE,
  headers: { 'User-Agent': USER_AGENT },
  timeout: 15000,
});

export async function searchSubreddits(query, limit = 25) {
  try {
    const res = await api.get('/search.json', {
      params: { query, type: 'sr', limit, nsfw: 'false' },
    });
    return res.data.data.children.map((c) => ({
      name: c.data.display_name,
      title: c.data.title,
      subscribers: c.data.subscribers,
      description: c.data.public_description,
      active: c.data.accounts_active,
    }));
  } catch (e) {
    console.error('searchSubreddits error:', e.message);
    return [];
  }
}

export async function getSubredditPosts(subreddit, sort = 'hot', limit = 100, timeframe = 'quarter') {
  try {
    const res = await api.get(`/r/${subreddit}/${sort}.json`, {
      params: { limit, t: timeframe, raw_json: 1 },
    });
    return res.data.data.children.map((c) => ({
      id: c.data.id,
      title: c.data.title,
      selftext: (c.data.selftext || '').slice(0, 1000),
      score: c.data.score,
      upvoteRatio: c.data.upvote_ratio,
      numComments: c.data.num_comments,
      created: c.data.created_utc,
      permalink: `https://reddit.com${c.data.permalink}`,
      author: c.data.author,
      flair: c.data.link_flair_text || '',
      isSelf: c.data.is_self,
      domain: c.data.domain,
      thumbnail: c.data.thumbnail,
    }));
  } catch (e) {
    console.error(`getSubredditPosts(${subreddit}) error:`, e.message);
    return [];
  }
}

export async function getRelatedSubreddits(subreddit) {
  try {
    const res = await api.get(`/r/${subreddit}/about.json`);
    const about = res.data.data;
    const related = [];
    if (about.community_description) {
      const words = about.community_description.split(/\s+/).filter((w) => w.length > 4).slice(0, 5);
      for (const word of words) {
        const results = await searchSubreddits(word, 5);
        related.push(...results);
      }
    }
    const unique = [...new Map(related.map((r) => [r.name, r])).values()];
    return unique.filter((r) => r.name !== subreddit).slice(0, 10);
  } catch (e) {
    return [];
  }
}

export async function searchUnmetDemand(query, limit = 50) {
  const patterns = [
    `${query} "does anyone know"`,
    `${query} "is there something"`,
    `${query} "I wish there was"`,
    `${query} "recommend"`,
    `${query} "struggling with"`,
  ];
  const allPosts = [];
  for (const pattern of patterns) {
    try {
      const res = await api.get('/search.json', {
        params: { query: pattern, sort: 'relevance', limit: Math.ceil(limit / patterns.length), t: 'year', restrict_sr: 'false' },
      });
      const posts = res.data.data.children
        .filter((c) => c.kind === 't3')
        .map((c) => ({
          id: c.data.id,
          title: c.data.title,
          selftext: (c.data.selftext || '').slice(0, 500),
          score: c.data.score,
          numComments: c.data.num_comments,
          subreddit: c.data.subreddit,
          permalink: `https://reddit.com${c.data.permalink}`,
          created: c.data.created_utc,
        }));
      allPosts.push(...posts);
    } catch (e) {
      continue;
    }
  }
  const unique = [...new Map(allPosts.map((p) => [p.id, p])).values()];
  return unique.sort((a, b) => b.numComments - a.numComments).slice(0, limit);
}
