import { CELEBRITIES, DEFAULT_CELEB } from './config.js?v=5';
import { fetchCelebNews } from './fetcher.js?v=5';

const PROXY_A = 'https://corsproxy.io/?';
const PROXY_B = 'https://api.allorigins.win/raw?url=';
const LANG_KEY = 'javis-lang';
const ogCache = new Map(); // articleUrl → imageUrl | null

// ── Language — persist across visits ────────────────────────────────────────

function loadLang() {
  return localStorage.getItem(LANG_KEY) ?? 'ko';
}
function saveLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}

let currentLang = loadLang();
let currentCeleb = CELEBRITIES.find(c => c.id === DEFAULT_CELEB) ?? CELEBRITIES[0];
let isLoading = false;

const grid = document.getElementById('grid');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const celebTabs = document.getElementById('celebTabs');

// ── og:image extraction ──────────────────────────────────────────────────────

function resolveUrl(src, base) {
  if (!src || src.startsWith('data:')) return null;
  if (src.startsWith('http')) return src;
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('/')) {
    try { return new URL(base).origin + src; } catch { return null; }
  }
  return null;
}

function getCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  return m?.[1] ?? null;
}

const OG_RE = [
  /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
];

const SKIP_IMG = /thumb(?:nail)?|small|icon|logo|avatar|banner|spacer|blank|pixel|1x1|tracking|ads?[/_-]/i;

function extractBestImage(html, requestUrl) {
  const base = getCanonical(html) ?? requestUrl;

  // 1. og:image / twitter:image
  for (const re of OG_RE) {
    const m = html.match(re);
    const resolved = resolveUrl(m?.[1], base);
    if (resolved) return resolved;
  }

  // 2. Body <img> — pick the widest that isn't a decoration
  const IMG_TAG = /<img([^>]+)>/gi;
  const SRC_RE  = /\bsrc=["']([^"']+)["']/i;
  const W_RE    = /\bwidth=["']?(\d+)["']?/i;

  let best = null;
  let bestW = 0;
  let tag;

  while ((tag = IMG_TAG.exec(html)) !== null) {
    const attrs = tag[1];
    const srcM  = SRC_RE.exec(attrs);
    if (!srcM) continue;
    const src = srcM[1];
    if (SKIP_IMG.test(src)) continue;

    const resolved = resolveUrl(src, base);
    if (!resolved) continue;

    const w = parseInt(W_RE.exec(attrs)?.[1] ?? '0');
    if (w > 0 && w < 200) continue; // too small

    if (w > bestW) { bestW = w; best = resolved; }
    else if (!best) best = resolved;
  }

  return best;
}

async function tryFetch(proxy, url) {
  const res = await fetch(proxy + encodeURIComponent(url), {
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchOgImage(url) {
  if (ogCache.has(url)) return ogCache.get(url);

  let html = null;
  try {
    html = await tryFetch(PROXY_A, url);
  } catch {
    try {
      html = await tryFetch(PROXY_B, url);
    } catch {
      ogCache.set(url, null);
      return null;
    }
  }

  const imgUrl = extractBestImage(html, url);
  ogCache.set(url, imgUrl);
  return imgUrl;
}

// ── og:image fetch — sequential batch fetch ──────────────────────────────────

async function setupLazyImageFetch() {
  const cards = [...document.querySelectorAll('[data-lazy-url]')];
  if (!cards.length) return;

  for (let i = 0; i < cards.length; i += 5) {
    const batch = cards.slice(i, i + 5);
    await Promise.allSettled(batch.map(async card => {
      const url = card.dataset.lazyUrl;
      try {
        const proxied = 'https://corsproxy.io/?' + encodeURIComponent(url);
        const res = await fetch(proxied, { signal: AbortSignal.timeout(5000) });
        const html = await res.text();
        const img = extractBestImage(html, url);
        if (img) {
          card.style.backgroundImage = `url(${img})`;
          card.style.backgroundSize = 'cover';
          card.style.backgroundPosition = 'center';
          card.classList.remove('card-thumb--lazy');
        }
      } catch {}
    }));
  }
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function renderTabs() {
  if (CELEBRITIES.length <= 1) { celebTabs.hidden = true; return; }
  celebTabs.hidden = false;
  celebTabs.innerHTML = CELEBRITIES.map(c => `
    <button class="celeb-tab${c.id === currentCeleb.id ? ' active' : ''}" data-id="${c.id}">
      ${c.emoji} ${currentLang === 'ko' ? c.nameKo : c.name}
    </button>
  `).join('');
  celebTabs.querySelectorAll('.celeb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentCeleb = CELEBRITIES.find(c => c.id === btn.dataset.id) ?? currentCeleb;
      renderTabs();
      loadNews();
    });
  });
}

// ── Status / date helpers ────────────────────────────────────────────────────

function setStatus(type, msg) {
  statusDot.className = 'status-dot ' + type;
  statusText.textContent = msg;
}

function formatDate(d) {
  if (!d) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── Card rendering ───────────────────────────────────────────────────────────

function thumbHtml(item) {
  if (item.thumb) {
    return `<div class="card-thumb">
      <img src="${item.thumb}" alt="" loading="lazy"
        onerror="this.parentElement.classList.add('card-thumb--empty');this.remove()">
    </div>`;
  }
  // Google News redirect URLs are blocked by all CORS proxies — skip lazy fetch
  if (item.link?.includes('news.google.com')) {
    return `<div class="card-thumb card-thumb--empty"></div>`;
  }
  return `<div class="card-thumb card-thumb--empty card-thumb--lazy"
    data-lazy-url="${item.link}"></div>`;
}

function renderCards(items) {
  if (!items.length) {
    grid.innerHTML = '<div class="empty-msg">뉴스를 찾을 수 없습니다.</div>';
    return;
  }
  grid.innerHTML = items.map(item => `
    <a class="card" href="${item.link}" target="_blank" rel="noopener noreferrer">
      ${thumbHtml(item)}
      <div class="card-body">
        <div class="card-source">${item.source || ''}</div>
        <div class="card-title">${item.title}</div>
        <div class="card-date">${formatDate(item.pubDate)}</div>
      </div>
    </a>
  `).join('');

  setupLazyImageFetch();
}

// ── Load ─────────────────────────────────────────────────────────────────────

async function loadNews() {
  if (isLoading) return;
  isLoading = true;
  setStatus('loading', '뉴스 불러오는 중...');
  grid.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
  try {
    const items = await fetchCelebNews(currentCeleb, currentLang);
    renderCards(items);
    setStatus('ok', `${items.length}개 기사`);
  } catch {
    setStatus('error', '로드 실패');
    grid.innerHTML = '<div class="empty-msg">뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
  }
  isLoading = false;
}

// ── Init ─────────────────────────────────────────────────────────────────────

// Sync lang buttons with saved preference
document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.lang === currentLang);
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    saveLang(currentLang);
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === currentLang)
    );
    renderTabs();
    loadNews();
  });
});

renderTabs();
loadNews();
