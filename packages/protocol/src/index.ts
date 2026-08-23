/**
 * AirCanvas Kids 통신 프로토콜 — 단일 진실원
 *
 * 폰 → 서버 → TV 로 흐르는 모든 메시지의 타입 정의.
 * 좌표는 항상 0..1 정규화 값(TV 좌표계 기준)을 사용한다.
 */

export type Role = 'tv' | 'phone';

/** 서버 → 클라이언트: 접속 완료 */
export interface WelcomeMessage {
  type: 'welcome';
  room: string;
  role: Role;
  peers: string[];
}

/** 폰 → 서버 → TV: 추적 좌표 스트림 (약 30Hz) */
export interface PointMessage {
  type: 'point';
  /** TV 좌표계 x (0..1) */
  x: number;
  /** TV 좌표계 y (0..1) */
  y: number;
  /** 엄지-검지 핀치 여부 (v0.1 참고용) */
  pinch?: boolean;
  /** 폰 기준 타임스탬프(ms) */
  t?: number;
}

export interface StrokeStartMessage {
  type: 'stroke-start';
  color: string;
}

export interface StrokeEndMessage {
  type: 'stroke-end';
}

/** 색칠 모드: 영역 채우기 요청 */
export interface FillMessage {
  type: 'fill';
  x: number;
  y: number;
  color: string;
}

export interface UndoMessage {
  type: 'undo';
}

export interface PeerJoinedMessage {
  type: 'peer-joined';
  role: Role;
  displayName?: string;
}

export interface PeerLeftMessage {
  type: 'peer-left';
  role: Role;
}

export interface ErrorMessage {
  type: 'error';
  code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROLE_CONFLICT' | 'BAD_REQUEST';
  message?: string;
}

/** 지원 테마 식별자 (tv-art 의 Theme 과 구조적으로 동일) */
export type ThemeId = 'dino' | 'jungle' | 'ocean';

/** 폰 → TV: 테마 선택 (게임 시작 트리거) */
export interface SelectThemeMessage {
  type: 'select-theme';
  theme: ThemeId;
}

/** 폰 → TV: 테마 내 작품 선택 */
export interface SelectArtworkMessage {
  type: 'select-artwork';
  theme: ThemeId;
  /** 해당 테마 아트워크 목록의 0-based 인덱스 */
  index: number;
}

/** 폰이 보낼 수 있는 모든 메시지 */
export type PhoneMessage =
  | PointMessage
  | StrokeStartMessage
  | StrokeEndMessage
  | FillMessage
  | UndoMessage
  | SelectThemeMessage
  | SelectArtworkMessage;

/** 클라이언트가 받을 수 있는 모든 메시지 */
export type ClientEvent =
  | WelcomeMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | ErrorMessage
  | PhoneMessage;

export const PALETTE = [
  '#e63946', // 빨강
  '#f4a261', // 주황
  '#e9c46a', // 노랑
  '#2a9d8f', // 청록
  '#457b9d', // 파랑
  '#7b2cbf', // 보라
  '#3a5a40', // 초록
  '#6d4c41', // 갈색
] as const;

export type PaletteColor = (typeof PALETTE)[number];

/** 방 코드 생성기: 모호 문자 제외 6자리 영숫자 */
export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function wsUrl(serverBase: string, role: Role, room: string): string {
  return `${serverBase.replace(/\/$/, '')}/ws?role=${role}&room=${encodeURIComponent(room)}`;
}

/**
 * TV가 표시할 QR 코드에 담길 폰 연결 URL.
 * 폰 앱은 ?server / ?room 파라미터를 읽어 서버와 방을 자동 결정한다.
 */
export function phoneJoinUrl(phoneAppBase: string, serverBase: string, room: string): string {
  const base = phoneAppBase.replace(/\/$/, '');
  return `${base}/?server=${encodeURIComponent(serverBase)}&room=${encodeURIComponent(room)}`;
}

