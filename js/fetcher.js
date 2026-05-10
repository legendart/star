const PROXY = 'https://corsproxy.io/?';
const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// rss2json.com 기반 RSS fetch — 이미지(thumbnail) 자동 추출
async function fetchRss2Json(rssUrl, { keywords = null, maxItems = 15 } = {}) {
  const res = await fetch(RSS2JSON + encodeURIComponent(rssUrl), {
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.status !== 'ok') throw new Error('rss2json error: ' + json.message);

  let items = json.items ?? [];

  if (keywords?.length) {
    const kw = keywords.map(k => k.toLowerCase());
    items = items.filter(item => {
      const text = ((item.title ?? '') + ' ' + (item.description ?? '')).toLowerCase();
      return kw.some(k => text.includes(k));
    });
  }

  const feedTitle = json.feed?.title ?? '';

  return items.slice(0, maxItems).map(item => {
    const domain = getDomain(item.link ?? '');
    return {
      title: item.title ?? '',
      link: item.link ?? '',
      pubDate: item.pubDate ? new Date(item.pubDate) : null,
      source: item.author || feedTitle || domain,
      domain,
      thumb: item.thumbnail || item.enclosure?.link || null,
      favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null,
    };
  });
}

// Google News RSS (영어용 — 링크는 redirect지만 EN 소스로는 충분)
async function fetchGoogleNews(query, lang, { maxItems = 15 } = {}) {
  const isKo = lang === 'ko';
  const base = isKo
    ? 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&sort=date&q='
    : 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&sort=date&q=';
  const rssUrl = base + encodeURIComponent(query);

  const res = await fetch(PROXY + encodeURIComponent(rssUrl), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML parse error');

  return [...doc.querySelectorAll('item')].slice(0, maxItems).map(item => {
    const title = item.querySelector('title')?.textContent ?? '';
    const link  = item.querySelector('link')?.textContent ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent ?? '';
    const sourceEl = item.querySelector('source');
    const source = sourceEl?.textContent?.trim() ?? (title.includes(' - ') ? title.split(' - ').pop().trim() : '');
    const domain = getDomain(link);
    return { title, link, pubDate: pubDate ? new Date(pubDate) : null, source, domain, thumb: null, favicon: null };
  });
}

async function fetchReddit(subreddit, limit = 20) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetch(PROXY + encodeURIComponent(url), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data.children
    .filter(c => !c.data.stickied)
    .slice(0, limit)
    .map(c => {
      const d = c.data;
      const thumb =
        d.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&') ??
        (d.thumbnail?.startsWith('http') ? d.thumbnail : null);
      return {
        title: d.title,
        link: `https://reddit.com${d.permalink}`,
        pubDate: new Date(d.created_utc * 1000),
        source: `r/${d.subreddit}`,
        domain: 'reddit.com',
        thumb,
        favicon: null
      };
    });
}

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(it);
    }
  }
  return result;
}

export async function fetchCelebNews(celeb, lang) {
  const isKo = lang === 'ko';

  let tasks;
  if (isKo) {
    // 한국어: rss2json으로 한국 연예 RSS 직접 수집 → 이미지 포함
    const koFeeds = celeb.koRssFeeds ?? [];
    tasks = koFeeds.map(url =>
      fetchRss2Json(url, { keywords: celeb.keywords, maxItems: 20 })
    );
  } else {
    // 영어: Google News + Reddit + Soompi
    tasks = [
      fetchGoogleNews(celeb.queries.en, 'en', { maxItems: 20 }),
      celeb.subreddit ? fetchReddit(celeb.subreddit, 20) : Promise.resolve([]),
      celeb.soompiUrl
        ? fetchRss2Json(celeb.soompiUrl, { keywords: celeb.keywords, maxItems: 20 })
        : Promise.resolve([]),
    ];
  }

  const results = await Promise.allSettled(tasks);
  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return dedupe(all.filter(it => it.title && it.link))
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
}
