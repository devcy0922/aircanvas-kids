/**
 * TV 화면에 표시할 아트워크 데이터 모델.
 * 모든 아트워크는 viewBox 0 0 100 100, 닫힌 path 영역(region) 목록으로 구성된다.
 */
export interface Region {
  /** 영역 고유 식별자 */
  id?: string;
  /** SVG path (닫힌 경로, Z 종료) */
  d: string;
  /** 영역 이름(한국어) — 색칠 가이드 표시용 */
  label: string;
  /** 렌더링 레이어 순서 */
  zIndex?: number;
}

export type Theme = 'dino' | 'jungle' | 'ocean';

export interface Artwork {
  id: string;
  theme: Theme;
  name: string;
  viewBox: string;
  regions: Region[];
  imageUrl?: string;
}

export const THEME_META: Record<Theme, { label: string; bg: string; accent: string }> = {
  dino: { label: '공룡', bg: '#f6efe3', accent: '#c1663d' },
  jungle: { label: '정글', bg: '#eef7e9', accent: '#3a5a40' },
  ocean: { label: '바다', bg: '#e8f4fb', accent: '#457b9d' },
};
