import { CELEBRITIES, DEFAULT_CELEB } from './config.js';
import { fetchCelebNews } from './fetcher.js';

const PROXY = 'https://corsproxy.io/?';
const ogCache = new Map(); // articleUrl → imageUrl | null

let currentLang = 'ko';
let currentCeleb = CELEBRITIES.find(c => c.id === DEFAULT_CELEB) ?? CELEBRITIES[0];
let isLoading = false;

const grid = document.getElementById('grid');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const celebTabs = document.getElementById('celebTabs');

// ── og:image fetcher ────────────────────────────────────────────────────────

async function fetchOgImage(url) {
  if (ogCache.has(url)) return ogCache.get(url);

  try {
    const res = await fetch(PROXY + encodeURIComponent(url), {
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error();
    const html = await res.text();

    // Patterns tried in priority order
    const matchers = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
      /<img[^>]+src=["'](https?:[^"']+)["']/i,
    ];

    let imgUrl = null;
    for (const re of matchers) {
      const m = html.match(re);
      if (m?.[1]?.startsWith('http')) { imgUrl = m[1]; break; }
    }
    ogCache.set(url, imgUrl);
    return imgUrl;
  } catch {
    ogCache.set(url, null);
    return null;
  }
}

// ── IntersectionObserver for lazy og:image loading ──────────────────────────

function setupLazyImageFetch() {
  const thumbs = grid.querySelectorAll('[data-lazy-url]');
  if (!thumbs.length) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const thumb = entry.target;
      const url = thumb.dataset.lazyUrl;
      if (!url) continue;

      observer.unobserve(thumb);
      delete thumb.dataset.lazyUrl;

      fetchOgImage(url).then(imgUrl => {
        if (!imgUrl) return;
        const img = new Image();
        img.alt = '';
        img.loading = 'lazy';
        img.onload = () => {
          thumb.classList.remove('card-thumb--empty', 'card-thumb--lazy');
          thumb.innerHTML = '';
          thumb.appendChild(img);
        };
        img.onerror = () => { /* keep gradient placeholder */ };
        img.src = imgUrl;
      });
    }
  }, { rootMargin: '300px' });  // start fetching before card scrolls into view

  thumbs.forEach(el => observer.observe(el));
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
  // No thumbnail — lazy-fetch og:image when card enters viewport
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
  } catch (e) {
    setStatus('error', '로드 실패');
    grid.innerHTML = '<div class="empty-msg">뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</div>';
  }
  isLoading = false;
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    document.querySelectorAll('.lang-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lang === currentLang)
    );
    renderTabs();
    loadNews();
  });
});

renderTabs();
loadNews();
