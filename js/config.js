export const CELEBRITIES = [
  {
    id: 'nct',
    name: 'NCT',
    nameKo: 'NCT',
    queries: {
      ko: 'NCT',
      en: 'NCT kpop'
    },
    // 한국어 키워드 (RSS 필터링용)
    keywords: ['nct', 'nct127', 'nct dream', 'wayv', '엔씨티', '엔시티', '웨이션브이', 'nct드림'],
    // 한국 연예 뉴스 RSS (rss2json으로 이미지 포함 파싱) — 2026-05 검증된 피드
    koRssFeeds: [
      'https://www.yna.co.kr/rss/entertainment.xml',   // 연합뉴스 연예
      'https://www.mk.co.kr/rss/30000023/',             // 매일경제 문화/연예
      'https://www.topstarnews.net/rss/allArticle.xml', // 탑스타뉴스
      'https://www.hankyung.com/feed/entertainment',    // 한국경제 연예
    ],
    subreddit: 'NCT',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#00c851',
    emoji: '🎵'
  }
  // 여기에 연예인 추가: koRssFeeds와 keywords만 맞게 설정하면 됨
];

export const DEFAULT_CELEB = 'nct';
