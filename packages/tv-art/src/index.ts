export * from './types';
export { THEME_META } from './themes.generated';

/** 매니페스트에 없는 테마가 들어와도 TV 배경이 깨지지 않게 하는 기본 색 */
export const DEFAULT_THEME_META = { label: '월드', bg: '#f4f1ea', accent: '#6b5b45' };
