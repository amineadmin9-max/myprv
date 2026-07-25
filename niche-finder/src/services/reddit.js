import axios from 'axios';

const REPO_RAW = 'https://raw.githubusercontent.com/amineadmin9-max/myprv/main/data';

export async function fetchLocalData(subreddit) {
  try {
    const res = await axios.get(`${REPO_RAW}/r_${subreddit}.json`, { timeout: 10000 });
    return res.data || [];
  } catch (e) {
    console.log(`No local data for r/${subreddit}`);
    return [];
  }
}

export async function fetchAvailableSubreddits() {
  try {
    const res = await axios.get(`${REPO_RAW}/index.json`, { timeout: 10000 });
    return res.data || [];
  } catch (e) {
    return [];
  }
}

export async function searchReddit(subreddit, numPosts = 50) {
  const urls = [
    `https://www.reddit.com/r/${subreddit}/.rss?limit=${numPosts}`,
    `https://old.reddit.com/r/${subreddit}/.rss?limit=${numPosts}`,
  ];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  };

  for (const url of urls) {
    try {
      const r = await axios.get(url, { headers, timeout: 15000 });
      if (r.status === 200 && (r.data.includes('<feed') || r.data.includes('<entry'))) {
        return parseRSS(r.data, subreddit);
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}

function parseRSS(xmlText, subreddit) {
  const posts = [];
  const entries = xmlText.split('<entry>').slice(1);

  for (const entry of entries) {
    const titleM = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const title = (titleM?.[1] || '').replace(/<[^>]+>/g, '').trim();

    const authorM = entry.match(/<name>([^<]*)<\/name>/);
    const author = (authorM?.[1] || 'unknown').replace('/u/', '');

    const linkM = entry.match(/<link[^>]*href="([^"]*)"/);
    const url = linkM?.[1] || '';

    const contentM = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const content = (contentM?.[1] || '').replace(/<[^>]+>/g, '').trim().slice(0, 500);

    const updatedM = entry.match(/<updated>(.*?)<\/updated>/);
    const updated = updatedM?.[1] || '';

    if (title) {
      posts.push({
        title, author, url, content,
        updated, subreddit,
        score: 0, numComments: 0, isSelf: true, domain: 'self.' + subreddit,
        selftext: content, permalink: url, flair: '',
      });
    }
  }
  return posts;
}
