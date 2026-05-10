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
    // 한국 연예 뉴스 RSS (rss2json으로 이미지 포함 파싱)
    koRssFeeds: [
      'https://star.mt.co.kr/rss/news.xml',            // 스타뉴스
      'https://www.sportsseoul.com/rss/allArticle.xml', // 스포츠서울
      'https://www.mydaily.co.kr/rss/news.xml',         // 마이데일리
      'https://www.dispatch.co.kr/feed',                // 디스패치
    ],
    subreddit: 'NCT',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#00c851',
    emoji: '🎵'
  }
  // 여기에 연예인 추가: koRssFeeds와 keywords만 맞게 설정하면 됨
];

export const DEFAULT_CELEB = 'nct';
