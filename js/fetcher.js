const PROXY = 'https://corsproxy.io/?';

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function extractImgFromHtml(html) {
  const m = html?.match(/<img[^>]+src=["']([^"']+)["']/);
  return m ? m[1] : null;
}

async function fetchRSS(rawUrl, { keywords = null, maxItems = 15 } = {}) {
  const res = await fetch(PROXY + encodeURIComponent(rawUrl));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML parse error');

  let items = [...doc.querySelectorAll('item')];

  if (keywords?.length) {
    const kw = keywords.map(k => k.toLowerCase());
    items = items.filter(item => {
      const t = (item.querySelector('title')?.textContent ?? '').toLowerCase();
      const d = (item.querySelector('description')?.textContent ?? '').toLowerCase();
      return kw.some(k => t.includes(k) || d.includes(k));
    });
  }

  return items.slice(0, maxItems).map(item => {
    const title = item.querySelector('title')?.textContent ?? '';
    const link = item.querySelector('link')?.textContent ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent ?? '';

    const sourceEl = item.querySelector('source');
    // Source name: try <source> element, then "Title - Source" suffix
    let source = sourceEl?.textContent?.trim() ?? '';
    if (!source && title.includes(' - ')) source = title.split(' - ').pop().trim();

    // Domain for favicon: try <source url> attribute first, then link
    const sourceUrl = sourceEl?.getAttribute('url') ?? '';
    const domain = getDomain(sourceUrl) || getDomain(link);

    // Thumbnail: enclosure, media:content (various namespace forms), then description img
    const desc = item.querySelector('description')?.textContent ?? '';
    const mediaContent =
      item.querySelector('media\\:content') ??
      item.querySelector('content') ??
      null;
    const thumb =
      item.querySelector('enclosure')?.getAttribute('url') ??
      mediaContent?.getAttribute('url') ??
      extractImgFromHtml(desc) ??
      null;

    const favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;

    return { title, link, pubDate: pubDate ? new Date(pubDate) : null, source, domain, thumb, favicon };
  });
}

async function fetchReddit(subreddit, limit = 20) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}`;
  const res = await fetch(PROXY + encodeURIComponent(url));
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
  return items.filter(it => {
    // Normalize: strip punctuation, first 35 chars
    const key = it.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchCelebNews(celeb, lang) {
  const isKo = lang === 'ko';
  const rssBase = isKo
    ? 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&sort=date&q='
    : 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&sort=date&q=';

  const queries = isKo
    ? [celeb.queries.ko, celeb.queries.ko2].filter(Boolean)
    : [celeb.queries.en];

  const tasks = [
    ...queries.map(q => fetchRSS(rssBase + encodeURIComponent(q), { maxItems: 15 })),
    !isKo && celeb.subreddit ? fetchReddit(celeb.subreddit, 20) : Promise.resolve([]),
    celeb.soompiUrl
      ? fetchRSS(celeb.soompiUrl, { keywords: celeb.keywords, maxItems: 15 })
      : Promise.resolve([]),
    // Direct KO entertainment RSS feeds — provide images natively, avoiding Google News redirects
    ...(isKo && celeb.rssFeedsKo
      ? celeb.rssFeedsKo.map(url => fetchRSS(url, { keywords: celeb.keywords, maxItems: 15 }))
      : []),
  ];

  const results = await Promise.allSettled(tasks);
  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return dedupe(all.filter(it => it.title && it.link))
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
}
