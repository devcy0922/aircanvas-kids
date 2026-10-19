import type { Artwork } from '../types';

/**
 * 바다 테마 아트워크 (v0.4.0)
 * 열대어, 고래 등 바다 생물들의 닫힌 SVG 패스
 */
export const OCEAN_ARTWORKS: Artwork[] = [
  {
    id: 'ocean-fish',
    theme: 'ocean',
    name: '열대어',
    viewBox: '0 0 100 100',
    regions: [
      { id: 'tail-fin', label: '꼬리지느러미', d: 'M64 48 L86 32 C88 44 84 56 86 68 L64 52 Z', zIndex: 1 },
      { id: 'top-fin', label: '등지느러미', d: 'M34 36 C42 22 56 22 62 38 Z', zIndex: 2 },
      { id: 'bottom-fin', label: '배지느러미', d: 'M34 64 C42 78 54 78 58 62 Z', zIndex: 3 },
      { id: 'body', label: '몸통', d: 'M20 50 C16 38 28 30 46 32 C62 34 70 42 68 50 C66 58 58 66 42 66 C28 66 22 58 20 50 Z', zIndex: 4 },
      { id: 'belly', label: '배 무늬', d: 'M24 50 C26 42 36 36 46 38 L44 62 C34 62 26 58 24 50 Z', zIndex: 5 },
      { id: 'stripe-1', label: '앞 흰줄무늬', d: 'M36 34 C40 38 40 60 36 64 L42 63 C46 59 46 39 42 35 Z', zIndex: 6 },
      { id: 'stripe-2', label: '뒤 흰줄무늬', d: 'M52 38 C55 42 55 58 52 62 L56 61 C59 57 59 43 56 39 Z', zIndex: 7 },
      { id: 'pectoral-fin', label: '가슴지느러미', d: 'M38 50 C46 48 52 54 48 60 C42 62 36 56 38 50 Z', zIndex: 8 },
      { id: 'eye-white', label: '눈 흰자', d: 'M24 44 C27 41 31 42 30 46 C29 49 25 49 24 44 Z', zIndex: 9 },
      { id: 'eye-pupil', label: '눈동자', d: 'M26 44 C27 43 29 44 28 46 C27 47 25 46 26 44 Z', zIndex: 10 },
      { id: 'mouth', label: '귀여운 입술', d: 'M18 49 C21 48 23 50 21 52 C19 53 17 51 18 49 Z', zIndex: 11 }
    ],
  },
  {
    id: 'ocean-whale',
    theme: 'ocean',
    name: '고래',
    viewBox: '0 0 100 100',
    regions: [
      { id: 'tail-fin', label: '꼬리지느러미', d: 'M78 50 C88 38 96 40 98 48 C92 52 90 56 98 60 C94 66 86 64 78 56 Z', zIndex: 1 },
      { id: 'spout-water', label: '물줄기', d: 'M38 28 C34 18 24 16 26 12 C34 16 38 22 40 26 C42 22 46 16 54 12 C56 16 46 18 42 28 Z', zIndex: 2 },
      { id: 'body', label: '몸통', d: 'M18 52 C14 40 26 30 48 30 C72 30 82 42 78 52 C74 62 58 66 38 66 C24 66 18 60 18 52 Z', zIndex: 3 },
      { id: 'belly', label: '밝은 배', d: 'M22 54 C28 58 46 64 66 58 C62 64 50 66 36 66 C26 66 22 60 22 54 Z', zIndex: 4 },
      { id: 'belly-lines', label: '배 줄무늬', d: 'M30 58 L32 64 L34 64 L32 58 Z M42 60 L44 65 L46 65 L44 60 Z M54 59 L56 63 L58 63 L56 59 Z', zIndex: 5 },
      { id: 'flipper', label: '지느러미', d: 'M36 54 C30 64 36 72 44 66 C46 60 42 54 36 54 Z', zIndex: 6 },
      { id: 'eye', label: '눈', d: 'M26 44 C28 42 31 43 30 46 C29 48 26 47 26 44 Z', zIndex: 7 },
      { id: 'mouth', label: '미소 입', d: 'M22 52 Q28 56 34 52 L34 54 Q28 58 22 54 Z', zIndex: 8 }
    ],
  }
];
