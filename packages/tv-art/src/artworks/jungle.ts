import type { Artwork } from '../types';

/**
 * 정글 테마 아트워크 (v0.4.0)
 * 사자, 코끼리 등 귀여운 정글 동물들의 닫힌 SVG 패스
 */
export const JUNGLE_ARTWORKS: Artwork[] = [
  {
    id: 'jungle-lion',
    theme: 'jungle',
    name: '사자',
    viewBox: '0 0 100 100',
    regions: [
      { id: 'tail', label: '꼬리', d: 'M24 64 C14 62 8 50 4 40 C8 54 18 72 26 72 Z', zIndex: 1 },
      { id: 'tail-tip', label: '꼬리 털', d: 'M6 42 C3 38 4 32 8 32 C12 32 11 40 6 42 Z', zIndex: 2 },
      { id: 'mane', label: '풍성한 갈기', d: 'M50 20 C68 18 78 30 78 46 C78 64 64 74 50 74 C36 74 24 62 26 44 C26 28 36 20 50 20 Z', zIndex: 3 },
      { id: 'body', label: '몸통', d: 'M30 68 C24 54 34 44 48 46 C60 46 70 54 70 66 C70 76 58 78 46 78 C36 78 32 74 30 68 Z', zIndex: 4 },
      { id: 'head', label: '얼굴', d: 'M40 34 C40 28 60 28 60 34 C64 42 62 56 50 58 C38 56 36 42 40 34 Z', zIndex: 5 },
      { id: 'snout', label: '주둥이', d: 'M44 46 C44 42 56 42 56 46 C56 52 44 52 44 46 Z', zIndex: 6 },
      { id: 'nose', label: '코', d: 'M48 44 L52 44 L50 48 Z', zIndex: 7 },
      { id: 'eye-left', label: '왼쪽 눈', d: 'M42 38 C44 37 46 39 45 41 C43 42 41 40 42 38 Z', zIndex: 8 },
      { id: 'eye-right', label: '오른쪽 눈', d: 'M55 38 C57 37 59 39 58 41 C56 42 54 40 55 38 Z', zIndex: 9 },
      { id: 'front-leg', label: '앞다리', d: 'M52 68 L52 92 L60 92 L62 68 Z', zIndex: 10 },
      { id: 'back-leg', label: '뒷다리', d: 'M34 68 L34 92 L42 92 L44 68 Z', zIndex: 11 }
    ],
  },
  {
    id: 'jungle-elephant',
    theme: 'jungle',
    name: '코끼리',
    viewBox: '0 0 100 100',
    regions: [
      { id: 'tail', label: '꼬리', d: 'M74 62 C84 62 88 70 90 74 C82 76 76 70 74 62 Z', zIndex: 1 },
      { id: 'body', label: '몸통', d: 'M26 72 C18 56 28 40 50 40 C70 40 80 52 80 68 C80 78 68 82 50 82 C34 82 28 78 26 72 Z', zIndex: 2 },
      { id: 'head', label: '머리', d: 'M24 50 C18 42 22 30 36 28 C48 26 54 34 52 46 C50 54 40 58 30 56 Z', zIndex: 3 },
      { id: 'trunk', label: '올린 긴 코', d: 'M24 46 C16 46 8 38 8 28 C8 24 14 24 14 28 C14 34 18 40 24 40 Z', zIndex: 4 },
      { id: 'ear', label: '큰 귀', d: 'M38 32 C48 26 56 32 54 48 C52 58 42 60 36 50 Z', zIndex: 5 },
      { id: 'eye', label: '눈', d: 'M28 36 C30 35 32 37 31 39 C29 40 27 38 28 36 Z', zIndex: 6 },
      { id: 'tusk', label: '상아', d: 'M22 46 C18 48 16 52 14 54 C18 52 22 50 24 48 Z', zIndex: 7 },
      { id: 'front-leg', label: '앞다리', d: 'M32 72 L32 94 L42 94 L44 72 Z', zIndex: 8 },
      { id: 'back-leg', label: '뒷다리', d: 'M60 72 L60 94 L70 94 L68 72 Z', zIndex: 9 }
    ],
  }
];
