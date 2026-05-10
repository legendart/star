// GitHub Actions script: fetch NCT Korean news, decode Google News URLs, extract og:image
// Runs every 30 min → saves to data/ko_news.json → frontend reads static file (no CORS issues)
import { GoogleDecoder } from 'google-news-url-decoder';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const NCT_QUERIES_KO = ['NCT', 'NCT WISH', 'NCT 127', '엔씨티'];
const KEYWORDS = ['nct', 'nct127', 'nct dream', 'wayv', '엔씨티', '엔시티', '웨이션브이', 'nct드림', 'nct위시'];
const MAX_ARTICLES = 40;
const OUTPUT_PATH = 'data/ko_news.json';

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Fetch Google News KO RSS directly (server-side, no proxy needed)
async function fetchGoogleNewsKO(query) {
  const url = `https://news.google.com/rss/search?hl=ko&gl=KR&ceid=KR:ko&sort=date&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();

  const items = [];
  const itemRE = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRE.exec(xml)) !== null) {
    const raw = m[1];
    const title = (raw.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim() || '';
    const link  = (raw.match(/<link>([^<\s]+)<\/link>/) || [])[1]?.trim() || '';
    const pubDate = (raw.match(/<pubDate>([^<]+)/) || [])[1]?.trim() || '';
    const source = (raw.match(/<source[^>]*>([^<]+)<\/source>/) || [])[1]?.trim() || '';

    if (!link || !link.includes('news.google.com')) continue;

    // Clean: strip " - 언론사" suffix and leading [태그] brackets
    const noSrc = title.includes(' - ') ? title.split(' - ').slice(0, -1).join(' - ').trim() : title;
    const clean = noSrc.replace(/^\[.*?\]\s*/g, '').replace(/^【.*?】\s*/g, '').trim() || noSrc;

    // Only include if title contains NCT keywords
    const lower = clean.toLowerCase();
    if (!KEYWORDS.some(k => lower.includes(k))) continue;

    items.push({ title: clean, link, pubDate, source });
  }
  return items;
}

// Extract og:image / twitter:image from article HTML
async function getOgImage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    signal: AbortSignal.timeout(9000)
  });
  if (!res.ok) return null;
  const html = await res.text();
  const re = [
    /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
  ];
  for (const r of re) {
    const m = html.match(r);
    if (m?.[1] && !m[1].includes('data:')) return m[1];
  }
  return null;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = it.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  console.log('[fetch-ko-news] Starting...');
  const gd = new GoogleDecoder();
  const allItems = [];

  // Fetch all NCT queries
  for (const query of NCT_QUERIES_KO) {
    try {
      const items = await fetchGoogleNewsKO(query);
      console.log(`  Query "${query}": ${items.length} NCT items`);
      allItems.push(...items);
    } catch (e) {
      console.warn(`  Query "${query}" failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  const deduped = dedupe(allItems).slice(0, MAX_ARTICLES);
  console.log(`[fetch-ko-news] ${deduped.length} unique NCT items to process`);

  // Load existing cache to preserve articles we already have images for
  let existing = [];
  if (existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')); } catch {}
  }
  const existingMap = new Map(existing.map(it => [
    it.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35),
    it
  ]));

  // Decode + fetch og:image in batches of 5
  const results = [];
  const BATCH = 5;

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
        // Check if we already have this article with an image
        const cacheKey = item.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35);
        const cached = existingMap.get(cacheKey);
        if (cached?.thumb) {
          console.log(`  [cached] ${item.title.substring(0, 45)}`);
          return cached;
        }

        let actualUrl = null;
        let thumb = null;

        try {
          const dec = await gd.decode(item.link);
          if (dec.status) {
            actualUrl = dec.decoded_url;
            thumb = await getOgImage(actualUrl);
            console.log(`  [fetched] ${item.title.substring(0, 45)} → img:${thumb ? 'YES' : 'no'}`);
          }
        } catch (e) {
          console.warn(`  [error] ${item.title.substring(0, 40)}: ${e.message.substring(0, 50)}`);
        }

        const domain = getDomain(actualUrl || item.link);
        return {
          title: item.title,
          link: actualUrl || item.link,
          pubDate: item.pubDate,
          source: item.source || domain,
          domain,
          thumb,
        };
      })
    );

    for (const r of batchResults) {
      if (r.status === 'fulfilled' && r.value?.title) results.push(r.value);
    }

    if (i + BATCH < deduped.length) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // Sort newest first
  results.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const withImg = results.filter(r => r.thumb).length;
  console.log(`[fetch-ko-news] Done: ${results.length} articles, ${withImg} with images`);

  writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`[fetch-ko-news] Saved to ${OUTPUT_PATH}`);
}

main().catch(e => { console.error('[fetch-ko-news] FATAL:', e); process.exit(1); });
