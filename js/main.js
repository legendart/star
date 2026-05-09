import { CELEBRITIES, DEFAULT_CELEB } from './config.js';
import { fetchCelebNews } from './fetcher.js';

let currentLang = 'ko';
let currentCeleb = CELEBRITIES.find(c => c.id === DEFAULT_CELEB) ?? CELEBRITIES[0];
let isLoading = false;

const grid = document.getElementById('grid');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const celebTabs = document.getElementById('celebTabs');

function renderTabs() {
  if (CELEBRITIES.length <= 1) {
    celebTabs.hidden = true;
    return;
  }
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
  return `${Math.floor(diff / 86400)}일 전`;
}

function renderCards(items) {
  if (!items.length) {
    grid.innerHTML = '<div class="empty-msg">뉴스를 찾을 수 없습니다.</div>';
    return;
  }
  grid.innerHTML = items.map(item => `
    <a class="card" href="${item.link}" target="_blank" rel="noopener noreferrer">
      <div class="card-thumb${item.thumb ? '' : ' card-thumb--empty'}">
        ${item.thumb ? `<img src="${item.thumb}" alt="" loading="lazy" onerror="this.parentElement.classList.add('card-thumb--empty');this.remove()">` : ''}
      </div>
      <div class="card-body">
        <div class="card-source">${item.source ?? ''}</div>
        <div class="card-title">${item.title}</div>
        <div class="card-date">${formatDate(item.pubDate)}</div>
      </div>
    </a>
  `).join('');
}

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
