export const CELEBRITIES = [
  {
    id: 'nct',
    name: 'NCT',
    nameKo: 'NCT',
    queries: {
      ko: 'NCT',
      en: 'NCT kpop'
    },
    keywords: ['nct', 'nct127', 'nct dream', 'wayv', '엔씨티', '엔시티', '웨이션브이', 'nct드림', 'nct위시'],
    subreddit: 'NCT',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#00c851',
    emoji: '🎵',
    dataFile: 'data/nct_news.json',
  },
  {
    id: 'bts',
    name: 'BTS',
    nameKo: 'BTS',
    queries: {
      ko: 'BTS',
      en: 'BTS kpop'
    },
    keywords: ['bts', '방탄소년단', '방탄', 'bangtan', 'jungkook', 'jimin', 'taehyung', 'j-hope', '제이홉', '정국', '뷔', '슈가'],
    subreddit: 'bangtan',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#7c3aed',
    emoji: '💜',
    dataFile: 'data/bts_news.json',
  },
  {
    id: 'wonyoung',
    name: 'Jang Wonyoung',
    nameKo: '장원영',
    queries: {
      ko: '장원영',
      en: 'Jang Wonyoung'
    },
    keywords: ['장원영', 'wonyoung', '원영', 'ive 장원영'],
    subreddit: 'IVE',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#f43f7a',
    emoji: '🩷',
    dataFile: 'data/wonyoung_news.json',
  },
  {
    id: 'iu',
    name: 'IU',
    nameKo: '아이유',
    queries: {
      ko: '아이유',
      en: 'IU kpop singer'
    },
    keywords: ['아이유', 'iu ', '이지은', ' iu,', 'iu('],
    subreddit: 'IU',
    soompiUrl: 'https://www.soompi.com/feed',
    color: '#f59e0b',
    emoji: '🎤',
    dataFile: 'data/iu_news.json',
  }
];

export const DEFAULT_CELEB = 'nct';
