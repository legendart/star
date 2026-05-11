// GitHub Actions script: fetch Korean news for each celeb group
// Decodes Google News URLs, extracts og:image, saves per-group JSON
import { GoogleDecoder } from 'google-news-url-decoder';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const MAX_ARTICLES = 40;

const CELEBS = [
  {
    id: 'nct',
    queries: ['NCT', 'NCT WISH', 'NCT 127', '엔씨티'],
    keywords: ['nct', 'nct127', 'nct dream', 'wayv', '엔씨티', '엔시티', '웨이션브이', 'nct드림', 'nct위시'],
    outputPath: 'data/nct_news.json',
  },
  {
    id: 'bts',
    queries: ['BTS', '방탄소년단', 'BTS 정국', 'BTS 지민'],
    keywords: ['bts', '방탄소년단', '방탄', 'bangtan', 'jungkook', 'jimin', 'taehyung', 'j-hope', '제이홉', '정국', '뷔', '슈가'],
    outputPath: 'data/bts_news.json',
  },
];

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

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

    const noSrc = title.includes(' - ') ? title.split(' - ').slice(0, -1).join(' - ').trim() : title;
    const clean = noSrc.replace(/^\[.*?\]\s*/g, '').replace(/^【.*?】\s*/g, '').trim() || noSrc;

    items.push({ title: clean, link, pubDate, source });
  }
  return items;
}

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

async function processCeleb(celeb, gd) {
  console.log(`\n[${celeb.id}] Fetching...`);
  const allItems = [];

  for (const query of celeb.queries) {
    try {
      const items = await fetchGoogleNewsKO(query);
      const filtered = items.filter(it => {
        const lower = it.title.toLowerCase();
        return celeb.keywords.some(k => lower.includes(k));
      });
      console.log(`  Query "${query}": ${filtered.length} items`);
      allItems.push(...filtered);
    } catch (e) {
      console.warn(`  Query "${query}" failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  const deduped = dedupe(allItems).slice(0, MAX_ARTICLES);
  console.log(`[${celeb.id}] ${deduped.length} unique items to process`);

  let existing = [];
  if (existsSync(celeb.outputPath)) {
    try { existing = JSON.parse(readFileSync(celeb.outputPath, 'utf8')); } catch {}
  }
  const existingMap = new Map(existing.map(it => [
    it.title.toLowerCase().replace(/[^\w가-힣]/g, '').substring(0, 35),
    it
  ]));

  const results = [];
  const BATCH = 5;

  for (let i = 0; i < deduped.length; i += BATCH) {
    const batch = deduped.slice(i, i + BATCH);
    const batchResults = await Promise.allSettled(
      batch.map(async (item) => {
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

  results.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  const withImg = results.filter(r => r.thumb).length;
  console.log(`[${celeb.id}] Done: ${results.length} articles, ${withImg} with images`);

  mkdirSync('data', { recursive: true });
  writeFileSync(celeb.outputPath, JSON.stringify(results, null, 2));
  console.log(`[${celeb.id}] Saved to ${celeb.outputPath}`);
}

async function main() {
  console.log('[fetch-ko-news] Starting for all groups...');
  const gd = new GoogleDecoder();

  for (const celeb of CELEBS) {
    await processCeleb(celeb, gd);
  }

  console.log('\n[fetch-ko-news] All groups complete.');
}

main().catch(e => { console.error('[fetch-ko-news] FATAL:', e); process.exit(1); });
