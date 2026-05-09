export const CELEBRITIES = [
  {
    id: 'nct',
    name: 'NCT',
    nameKo: 'NCT',
    queries: {
      ko: 'NCT 아이돌',
      ko2: 'NCT127 OR NCT드림 OR 웨이션브이',
      en: 'NCT kpop'
    },
    // Direct Korean entertainment RSS feeds — provide media:content images natively
    rssFeedsKo: [
      'https://www.osen.co.kr/rss/entertainment.xml',
      'https://entertain.naver.com/now/rss',
    ],
    subreddit: 'NCT',
    soompiUrl: 'https://www.soompi.com/feed',
    keywords: ['nct', '엔씨티', '엔시티'],
    color: '#00c851',
    emoji: '🎵'
  }
  // 여기에 연예인 추가
];

export const DEFAULT_CELEB = 'nct';
