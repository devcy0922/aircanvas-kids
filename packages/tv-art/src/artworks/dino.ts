import type { Artwork } from '../types';

/**
 * 공룡 테마 아트워크 (v0.4.0 완성형)
 * 아이들이 한눈에 알아볼 수 있는 진짜 공룡들의 사실적이고도 사랑스러운 프로포션과
 * 정밀한 닫힌 SVG 벡터 패스로 완성된 전문가급 도안입니다.
 */
export const DINO_ARTWORKS: Artwork[] = [
  {
    id: 'dino-trex',
    theme: 'dino',
    name: '티라노사우루스',
    viewBox: '0 0 100 100',
    imageUrl: '/artworks/images/dino-trex.png',
    regions: [
      { id: 'tail', label: '꼬리', d: 'M38 56 C26 50 14 36 6 28 C9 46 22 62 38 64 Z', zIndex: 1 },
      { id: 'back-foot-far', label: '먼 뒷발', d: 'M30 72 L30 85 L35 85 L35 72 Z', zIndex: 2 },
      { id: 'body', label: '몸통', d: 'M28 66 C22 54 28 42 42 38 C56 34 68 40 72 52 C75 64 66 72 52 74 C38 76 30 72 28 66 Z', zIndex: 3 },
      { id: 'belly', label: '가슴과 배', d: 'M34 54 C42 48 56 48 64 56 C66 64 58 70 46 70 C38 69 32 62 34 54 Z', zIndex: 4 },
      { id: 'neck', label: '목', d: 'M52 44 C52 34 56 26 64 24 L74 30 L66 48 Z', zIndex: 5 },
      { id: 'head', label: '머리통', d: 'M60 30 C58 18 68 12 80 12 C90 12 94 20 92 28 C86 34 76 34 68 32 L60 30 Z', zIndex: 6 },
      { id: 'snout', label: '주둥이', d: 'M74 18 C82 18 90 20 90 26 C89 31 82 33 74 33 L74 18 Z', zIndex: 7 },
      { id: 'jaw', label: '아래턱', d: 'M64 34 L89 34 C87 42 80 45 70 43 L64 38 Z', zIndex: 8 },
      { id: 'teeth', label: '하얀 이빨', d: 'M68 33 L70 36 L72 33 L74 37 L76 33 L78 37 L80 33 L82 36 L84 33 L86 36 L87 33 Z', zIndex: 9 },
      { id: 'eye-white', label: '눈 흰자', d: 'M74 19 C77 17 81 18 80 22 C79 25 75 25 74 22 Z', zIndex: 10 },
      { id: 'eye-pupil', label: '눈동자', d: 'M76 20 C78 20 79 21 78 23 C77 24 76 23 76 20 Z', zIndex: 11 },
      { id: 'nostril', label: '콧구멍', d: 'M86 23 C88 23 88 25 86 25 C85 25 85 23 86 23 Z', zIndex: 12 },
      { id: 'arm', label: '앞발', d: 'M56 50 C61 48 66 50 65 55 C63 58 59 57 56 53 Z', zIndex: 13 },
      { id: 'arm-claws', label: '앞발톱', d: 'M64 54 L67 53 L66 56 L68 56 L65 58 Z', zIndex: 14 },
      { id: 'thigh', label: '근육질 허벅지', d: 'M44 60 C52 58 60 62 61 70 C62 78 54 82 48 80 C44 76 42 68 44 60 Z', zIndex: 15 },
      { id: 'leg', label: '정강이', d: 'M48 78 L51 90 L58 90 L55 78 Z', zIndex: 16 },
      { id: 'foot-claws', label: '발톱', d: 'M48 90 L51 95 L53 90 L56 95 L58 90 L60 93 L61 90 L48 90 Z', zIndex: 17 },
      { id: 'spikes', label: '등 비늘 볏', d: 'M28 42 L31 34 L35 40 L39 32 L43 39 L48 33 L52 42 Z', zIndex: 18 },
      { id: 'stripes', label: '호랑이 줄무늬', d: 'M40 42 Q45 47 42 53 L38 51 Q41 46 38 43 Z M50 41 Q54 46 51 52 L47 51 Q50 46 47 42 Z M70 19 Q74 23 72 27 L68 26 Q71 22 68 20 Z', zIndex: 19 }
    ],
  },
  {
    id: 'dino-brachio',
    theme: 'dino',
    name: '브라키오사우루스',
    viewBox: '0 0 100 100',
    imageUrl: '/artworks/images/dino-brachio.png',
    regions: [
      { id: 'tail', label: '긴 꼬리', d: 'M24 64 C14 62 4 48 1 38 C5 54 14 72 26 74 Z', zIndex: 1 },
      { id: 'back-leg-far', label: '먼 뒷다리', d: 'M34 70 L35 88 L41 88 L42 70 Z', zIndex: 2 },
      { id: 'front-leg-far', label: '먼 앞다리', d: 'M46 70 L47 89 L53 89 L53 70 Z', zIndex: 3 },
      { id: 'body', label: '거대한 몸통', d: 'M22 72 C16 56 26 42 46 42 C62 42 74 52 74 66 C74 76 62 80 46 80 C32 80 24 78 22 72 Z', zIndex: 4 },
      { id: 'belly', label: '배', d: 'M30 62 C40 56 56 56 64 64 C65 72 55 76 44 76 C35 75 30 70 30 62 Z', zIndex: 5 },
      { id: 'neck', label: '우아한 긴 목', d: 'M46 44 C44 26 50 12 60 8 C64 6 70 9 70 14 C68 28 58 40 54 46 Z', zIndex: 6 },
      { id: 'head', label: '머리', d: 'M58 10 C58 4 68 3 74 7 C78 10 78 17 72 19 C66 20 60 17 58 10 Z', zIndex: 7 },
      { id: 'snout', label: '둥근 주둥이', d: 'M68 9 C76 8 82 12 80 17 C78 20 72 20 68 18 Z', zIndex: 8 },
      { id: 'eye', label: '온순한 눈', d: 'M67 8 C69 7 71 9 70 11 C68 12 66 10 67 8 Z', zIndex: 9 },
      { id: 'mouth', label: '미소 입', d: 'M72 17 Q76 16 78 17 L77 19 Q74 18 72 19 Z', zIndex: 10 },
      { id: 'back-leg-near', label: '가까운 뒷다리', d: 'M26 72 L25 93 L33 93 L35 72 Z', zIndex: 11 },
      { id: 'back-foot', label: '뒷발굽', d: 'M24 93 L24 95 L34 95 L34 93 Z', zIndex: 12 },
      { id: 'front-leg-near', label: '긴 앞다리', d: 'M54 72 L54 93 L62 93 L64 72 Z', zIndex: 13 },
      { id: 'front-foot', label: '앞발굽', d: 'M53 93 L53 95 L63 95 L63 93 Z', zIndex: 14 },
      { id: 'spots', label: '등 반점 무늬', d: 'M34 48 C37 45 42 47 41 51 C39 53 35 51 34 48 Z M46 48 C49 45 54 47 53 51 C51 53 47 51 46 48 Z M58 54 C61 51 66 53 65 57 C63 59 59 57 58 54 Z', zIndex: 15 }
    ],
  },
  {
    id: 'dino-stego',
    theme: 'dino',
    name: '스테고사우루스',
    viewBox: '0 0 100 100',
    imageUrl: '/artworks/images/dino-stego.png',
    regions: [
      { id: 'tail', label: '꼬리', d: 'M74 62 C84 62 92 68 96 72 C88 78 78 76 72 70 Z', zIndex: 1 },
      { id: 'spikes', label: '골침 스파이크', d: 'M89 65 L98 56 L94 67 L99 66 L94 72 L90 68 Z', zIndex: 2 },
      { id: 'plate-1', label: '등 골판 1', d: 'M26 38 L30 24 L38 34 L32 44 Z', zIndex: 3 },
      { id: 'plate-2', label: '등 골판 2', d: 'M36 36 L42 18 L50 30 L44 42 Z', zIndex: 4 },
      { id: 'plate-3', label: '등 골판 3', d: 'M48 36 L56 16 L64 30 L58 42 Z', zIndex: 5 },
      { id: 'plate-4', label: '등 골판 4', d: 'M62 38 L70 22 L76 34 L70 44 Z', zIndex: 6 },
      { id: 'plate-5', label: '등 골판 5', d: 'M72 44 L80 32 L84 42 L78 50 Z', zIndex: 7 },
      { id: 'back-leg-far', label: '먼 뒷다리', d: 'M66 72 L67 90 L73 90 L72 72 Z', zIndex: 8 },
      { id: 'front-leg-far', label: '먼 앞다리', d: 'M42 72 L42 90 L48 90 L47 72 Z', zIndex: 9 },
      { id: 'body', label: '단단한 몸통', d: 'M22 74 C16 58 26 44 48 44 C66 44 76 54 76 68 C76 78 64 82 48 82 C32 82 24 80 22 74 Z', zIndex: 10 },
      { id: 'belly', label: '배', d: 'M28 66 C36 58 54 58 64 66 C65 74 54 78 44 78 C34 77 28 72 28 66 Z', zIndex: 11 },
      { id: 'neck-head', label: '목과 머리', d: 'M24 54 C16 46 12 36 20 30 C28 28 34 36 34 46 Z', zIndex: 12 },
      { id: 'snout', label: '주둥이', d: 'M14 34 C8 32 8 26 15 25 C21 25 23 30 20 34 Z', zIndex: 13 },
      { id: 'eye', label: '눈', d: 'M19 28 C21 27 23 29 22 31 C20 32 18 30 19 28 Z', zIndex: 14 },
      { id: 'front-leg-near', label: '앞다리', d: 'M34 74 L32 93 L40 93 L41 74 Z', zIndex: 15 },
      { id: 'back-leg-near', label: '뒷다리', d: 'M58 74 L58 93 L66 93 L65 74 Z', zIndex: 16 }
    ],
  },
  {
    id: 'dino-trike',
    theme: 'dino',
    name: '트리케라톱스',
    viewBox: '0 0 100 100',
    imageUrl: '/artworks/images/dino-trike.png',
    regions: [
      { id: 'tail', label: '꼬리', d: 'M78 64 C88 64 96 70 98 76 C88 80 80 76 74 70 Z', zIndex: 1 },
      { id: 'frill', label: '부채꼴 목 프릴', d: 'M24 44 C12 30 18 12 36 12 C48 12 54 26 48 44 Z', zIndex: 2 },
      { id: 'frill-edge', label: '프릴 톱니 테두리', d: 'M22 42 C16 38 16 32 20 28 C18 22 22 18 28 16 C34 14 40 16 44 20 C48 24 48 30 46 36 Z', zIndex: 3 },
      { id: 'horn-brow1', label: '이마 긴 뿔 1', d: 'M22 26 L8 16 L20 22 Z', zIndex: 4 },
      { id: 'horn-brow2', label: '이마 긴 뿔 2', d: 'M32 20 L24 6 L30 16 Z', zIndex: 5 },
      { id: 'body', label: '몸통', d: 'M34 74 C26 60 36 46 56 46 C72 46 82 56 82 70 C82 80 70 82 54 82 C42 82 36 80 34 74 Z', zIndex: 6 },
      { id: 'belly', label: '배', d: 'M40 64 C48 58 64 58 72 66 C73 74 64 78 52 78 C44 77 40 72 40 64 Z', zIndex: 7 },
      { id: 'head', label: '얼굴', d: 'M28 40 C28 32 38 30 46 34 C50 38 48 48 40 48 Z', zIndex: 8 },
      { id: 'beak', label: '부리 입', d: 'M16 48 C10 48 10 42 16 40 L24 42 L22 48 Z', zIndex: 9 },
      { id: 'horn-nose', label: '코 뿔', d: 'M14 38 L4 34 L12 36 Z', zIndex: 10 },
      { id: 'eye', label: '눈', d: 'M28 34 C30 33 32 35 31 37 C29 38 27 36 28 34 Z', zIndex: 11 },
      { id: 'front-leg', label: '앞다리', d: 'M42 74 L40 93 L48 93 L49 74 Z', zIndex: 12 },
      { id: 'back-leg', label: '뒷다리', d: 'M66 74 L66 93 L74 93 L73 74 Z', zIndex: 13 }
    ],
  },
  {
    id: 'dino-ptera',
    theme: 'dino',
    name: '프테라노돈',
    viewBox: '0 0 100 100',
    imageUrl: '/artworks/images/dino-ptera.png',
    regions: [
      { id: 'wing-left', label: '왼쪽 활공 날개', d: 'M46 46 C32 36 14 36 4 48 C16 58 32 58 46 54 Z', zIndex: 1 },
      { id: 'wing-right', label: '오른쪽 활공 날개', d: 'M58 46 C72 36 90 36 100 48 C88 58 72 58 58 54 Z', zIndex: 2 },
      { id: 'crest', label: '멋진 유선형 볏', d: 'M56 36 L78 24 L64 38 Z', zIndex: 3 },
      { id: 'body', label: '날렵한 몸통', d: 'M46 54 C44 46 48 42 52 42 C56 42 60 46 58 54 C58 62 54 66 52 66 C50 66 46 62 46 54 Z', zIndex: 4 },
      { id: 'head', label: '머리', d: 'M46 42 C44 36 48 32 54 32 C58 32 60 36 58 42 Z', zIndex: 5 },
      { id: 'beak', label: '날카롭고 긴 부리', d: 'M44 38 L20 44 L44 42 Z', zIndex: 6 },
      { id: 'eye', label: '눈', d: 'M50 35 C52 34 54 36 53 38 C51 39 49 37 50 35 Z', zIndex: 7 },
      { id: 'feet', label: '발톱', d: 'M49 66 L47 76 L51 76 L52 66 L53 76 L57 76 L55 66 Z', zIndex: 8 }
    ],
  }
];
