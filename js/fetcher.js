const PROXY = 'https://corsproxy.io/?';

async function fetchRSS(url) {
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  const items = [...doc.querySelectorAll('item')];
  return items.map(item => {
    const title = item.querySelector('title')?.textContent ?? '';
    const link = item.querySelector('link')?.textContent ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent ?? '';
    const source = item.querySelector('source')?.textContent ?? '';
    const thumb =
      item.querySelector('enclosure')?.getAttribute('url') ??
      item.querySelector('media\\:content, content')?.getAttribute('url') ??
      null;
    return {
      title,
      link,
      pubDate: pubDate ? new Date(pubDate) : null,
      source,
      thumb
    };
  });
}

async function fetchReddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=20`;
  const res = await fetch(PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data.children
    .filter(c => !c.data.stickied)
    .map(c => {
      const d = c.data;
      const thumb = d.thumbnail?.startsWith('http') ? d.thumbnail : null;
      return {
        title: d.title,
        link: `https://reddit.com${d.permalink}`,
        pubDate: new Date(d.created_utc * 1000),
        source: `r/${d.subreddit}`,
        thumb,
        score: d.score
      };
    });
}

export async function fetchCelebNews(celeb, lang) {
  const query = lang === 'ko' ? celeb.queries.ko : celeb.queries.en;
  const rssUrl =
    lang === 'ko'
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`
      : `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en&gl=US&ceid=US:en`;

  const tasks = [fetchRSS(rssUrl)];
  if (lang === 'en' && celeb.subreddit) tasks.push(fetchReddit(celeb.subreddit));

  const results = await Promise.allSettled(tasks);
  const items = [];
  for (const r of results) {
    if (r.status === 'fulfilled') items.push(...r.value);
  }

  return items
    .filter(it => it.title && it.link)
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
}
