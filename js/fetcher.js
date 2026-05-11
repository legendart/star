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

// Google News RSS — rss2json으로 직접 파싱 (CORS 프록시 불필요)
async function fetchGoogleNews(query, lang, { maxItems = 15 } = {}) {
  const base = lang === 'ko'
    ? 'https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&sort=date&q='
    : 'https://news.google.com/rss/search?hl=en&gl=US&ceid=US:en&sort=date&q=';
  const rssUrl = base + encodeURIComponent(query);
  const items = await fetchRss2Json(rssUrl, { maxItems });
  // Google News 링크는 리다이렉트 URL — source를 title 뒤 " - 언론사명"에서 추출
  return items.map(it => ({
    ...it,
    source: it.source || (it.title.includes(' - ') ? it.title.split(' - ').pop().trim() : it.domain),
    title: it.title.includes(' - ') ? it.title.split(' - ').slice(0, -1).join(' - ').trim() : it.title,
  }));
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

// 제목 정규화 (매칭 키 생성) — 앞 괄호 태그([단독], [가요소식] 등) 제거
function normKey(title) {
  const cleaned = title.replace(/^\[.*?\]\s*/g, '').replace(/^【.*?】\s*/g, '');
  return cleaned.toLowerCase().replace(/[^가-힣a-z0-9]/g, '').substring(0, 25);
}

// Google News 항목에 한국 RSS 썸네일 매칭하여 이미지 보강
function enrichWithThumbnails(gnItems, rssPool, keywords) {
  // RSS 풀에서 썸네일 있는 항목으로 제목→썸네일 맵 구성
  const thumbMap = new Map();
  for (const item of rssPool) {
    if (!item.thumb) continue;
    const key = normKey(item.title);
    if (key.length >= 6 && !thumbMap.has(key)) {
      thumbMap.set(key, { thumb: item.thumb, link: item.link });
    }
  }

  // Google News 항목에 매칭 썸네일 적용
  const enriched = gnItems.map(gnItem => {
    if (gnItem.thumb) return gnItem;
    const key = normKey(gnItem.title);
    // 완전 매칭 시도
    if (thumbMap.has(key)) {
      const m = thumbMap.get(key);
      return { ...gnItem, thumb: m.thumb, link: m.link };
    }
    // 부분 매칭: GN 제목 앞부분이 RSS 키에 포함되거나 그 반대
    for (const [k, v] of thumbMap) {
      if (key.length >= 10 && (k.startsWith(key.substring(0, 10)) || key.startsWith(k.substring(0, 10)))) {
        return { ...gnItem, thumb: v.thumb, link: v.link };
      }
    }
    return gnItem;
  });

  // RSS 풀에서 NCT 키워드 포함 항목 중 Google News에 없는 것 추가
  const kw = (keywords ?? []).map(k => k.toLowerCase());
  const gnKeys = new Set(enriched.map(i => normKey(i.title)));
  const extraNct = rssPool.filter(item => {
    if (gnKeys.has(normKey(item.title))) return false;
    const text = (item.title + ' ' + (item.description || '')).toLowerCase();
    return kw.some(k => text.includes(k));
  });

  return [...enriched, ...extraNct];
}

export async function fetchCelebNews(celeb, lang) {
  const isKo = lang === 'ko';

  if (isKo) {
    // 한국어: GitHub Actions가 사전 수집한 celeb별 data 파일 우선 사용
    try {
      const cacheRes = await fetch('./' + (celeb.dataFile ?? 'data/ko_news.json'), { signal: AbortSignal.timeout(5000) });
      if (cacheRes.ok) {
        const cached = await cacheRes.json();
        if (Array.isArray(cached) && cached.length > 0) {
          const kw = (celeb.keywords ?? []).map(k => k.toLowerCase());
          const filtered = cached.filter(it => {
            const text = (it.title + ' ' + (it.source || '')).toLowerCase();
            return kw.some(k => text.includes(k));
          });
          if (filtered.length > 0) {
            return filtered
              .filter(it => it.title && it.link)
              .map(it => ({
                ...it,
                pubDate: it.pubDate ? new Date(it.pubDate) : null,
                domain: getDomain(it.link),
              }));
          }
        }
      }
    } catch { /* fallthrough to live fetch */ }

    // Fallback: 라이브 Google News KO (이미지 없지만 뉴스는 표시)
    try {
      return await fetchGoogleNews(celeb.queries.ko, 'ko', { maxItems: 20 });
    } catch { return []; }
  }

  // 영어: Google News + Reddit + Soompi
  const tasks = [
    fetchGoogleNews(celeb.queries.en, 'en', { maxItems: 20 }),
    celeb.subreddit ? fetchReddit(celeb.subreddit, 20) : Promise.resolve([]),
    celeb.soompiUrl
      ? fetchRss2Json(celeb.soompiUrl, { keywords: celeb.keywords, maxItems: 20 })
      : Promise.resolve([]),
  ];

  const results = await Promise.allSettled(tasks);
  const all = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }

  return dedupe(all.filter(it => it.title && it.link))
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
}
