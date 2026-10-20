/** 제품 릴리스 버전 — Phone/TV UI와 워크스페이스 버전을 함께 관리한다. */
export const APP_VERSION = '0.7.0';
export const APP_VERSION_LABEL = `v${APP_VERSION}`;

/**
 * AirCanvas Kids 통신 프로토콜 v0.2 — 단일 진실원
 *
 * 아키텍처: Phone = Brain (게임 상태/로직), TV = Thin Display (렌더만)
 * - 폰이 콘텐츠 서버에서 패키지 다운로드 → 게임 상태 머신 운영
 * - TV는 렌더 커맨드만 수신 실행 (상태 없음)
 * - 로컬 WS로 초저지연 커맨드 전송
 */

export type Role = 'tv' | 'phone';

/** 서버 → 클라이언트: 접속 완료 */
export interface WelcomeMessage {
  type: 'welcome';
  room: string;
  role: Role;
  peers: string[];
}

/** 폰 → 서버 → TV: 추적 좌표 스트림 (약 30Hz) — 레거시 호환용 */
export interface PointMessage {
  type: 'point';
  x: number;
  y: number;
  pinch?: boolean;
  t?: number;
}

export interface StrokeStartMessage {
  type: 'stroke-start';
  color: string;
}

export interface StrokeEndMessage {
  type: 'stroke-end';
}

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

/** 테마 id. content-src/themes/<id>/ 폴더 이름이며 새 테마를 만들어도 코드 수정이 필요 없도록 문자열로 둔다 */
export type ThemeId = string;

/** 게임 페이즈 */
export type GamePhase = 'lobby' | 'connecting' | 'calibrating' | 'playing' | 'gallery' | 'world' | 'error';

/** 폰 → TV: 테마 선택 (게임 시작 트리거) — 레거시 호환 */
export interface SelectThemeMessage {
  type: 'select-theme';
  theme: ThemeId;
}

/** 폰 → TV: 테마 내 작품 선택 — 레거시 호환 */
export interface SelectArtworkMessage {
  type: 'select-artwork';
  theme: ThemeId;
  index: number;
}

/** 폰이 보낼 수 있는 모든 메시지 (레거시 포함) */
export type PhoneMessage =
  | PointMessage
  | StrokeStartMessage
  | StrokeEndMessage
  | FillMessage
  | UndoMessage
  | SelectThemeMessage
  | SelectArtworkMessage;

/** 클라이언트가 받을 수 있는 모든 메시지 (레거시 포함) */
export type ClientEvent =
  | WelcomeMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | ErrorMessage
  | PhoneMessage;

// ============================================================================
// v0.2: Phone=Brain / TV=Thin Display 프로토콜
// ============================================================================

/** TV가 실행하는 렌더 커맨드 (폰 → TV 단방향) */
export type TVCommand =
  /** 씬 로드: 홈/캘리브/플레이/갤러리/정글 월드 */
  | { type: 'load-scene'; scene: 'home' | 'calib' | 'play' | 'gallery' | 'world'; payload: LoadScenePayload }
  /** 커서 위치/가시성 업데이트 (매 프레임) */
  | { type: 'set-cursor'; x: number; y: number; visible: boolean; color?: string; painting?: boolean }
  /** 자유선 그리기: 점 배열로 경로 전송 */
  | { type: 'draw-stroke'; points: { x: number; y: number }[]; color: string }
  /** 영역 채우기: regionId로 식별 */
  | { type: 'fill-region'; regionId: string; color: string }
  /** 좌표 기반 영역 채우기: TV 화면 정규화 좌표(0..1) 히트테스트 */
  | { type: 'fill-at'; x: number; y: number; color: string }
  /** 이펙트 재생 */
  | { type: 'play-effect'; effect: 'burst' | 'confetti' | 'pulse'; params: Record<string, any> }
  /** 진행도 HUD 업데이트 */
  | { type: 'set-progress'; percent: number; artworkName?: string }
  /** 언도/리셋 */
  | { type: 'undo' }
  | { type: 'reset-canvas' }
  /** 디버그/개발용 */
  | { type: 'debug'; action: 'ping' | 'stats'; data?: any };

/** 씬별 페이로드 타입 */
export type LoadScenePayload =
  | { scene: 'home'; roomCode: string; tvName?: string }
  | { scene: 'calib'; theme: ThemeId; artworkName: string; corners: { x: number; y: number }[] }
  | { scene: 'play'; artwork: ArtworkRuntime; theme: ThemeId }
  | { scene: 'gallery'; theme: ThemeId; completed: CompletedArtwork[] }
  | { scene: 'world'; world: 'jungle'; theme: ThemeId; character: ArtworkRuntime; progress: number };

/** 런타임용 아트워크 데이터 (TV로 전송되는 최소 세트) */
export interface ArtworkRuntime {
  id: string;
  name: string;
  viewBox: string;
  regions: RegionRuntime[];
  imageUrl?: string;
}

/** 런타임용 리전 (히트테스트/클립용 path만) */
export interface RegionRuntime {
  id: string;
  label: string;
  path: string; // SVG path 데이터
}

/** 완성된 작품 갤러리 항목 */
export interface CompletedArtwork {
  id: string;
  name: string;
  thumbnailDataUrl: string; // base64 PNG
  completedAt: number;
  progress: number;
}

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
  let base = serverBase.trim().replace(/\/$/, '');
  if (base.startsWith('https://')) {
    base = 'wss://' + base.slice(8);
  } else if (base.startsWith('http://')) {
    base = 'ws://' + base.slice(7);
  } else if (!base.startsWith('ws://') && !base.startsWith('wss://')) {
    base = 'ws://' + base;
  }
  return `${base}/ws?role=${role}&room=${encodeURIComponent(room)}`;
}

/** TV가 표시할 QR 코드에 담길 폰 연결 URL */
export function phoneJoinUrl(phoneAppBase: string, serverBase: string, room: string): string {
  const base = phoneAppBase.replace(/\/$/, '');
  return `${base}/?server=${encodeURIComponent(serverBase)}&room=${encodeURIComponent(room)}`;
}

// ============================================================================
// 콘텐츠 패키지 스펙 (폰 ↔ 콘텐츠 서버)
// ============================================================================

/** 게임 패키지 매니페스트 */
export interface GamePackageManifest {
  id: string; // 'aircanvas-kids'
  version: string; // semver
  title: string;
  description: string;
  entryScene: 'home';
  themes: ThemePack[];
  minProtocolVersion: string; // '0.2.0'
  assetsBaseUrl: string; // CDN 베이스 URL
}

/** 테마 팩 */
export interface ThemePack {
  id: ThemeId;
  label: string;
  bgColor: string;
  accentColor: string;
  /** 테마 칩/버튼에 쓰는 이모지 (없으면 🎨) */
  emoji?: string;
  /** 테마 부제 */
  tagline?: string;
  /** 월드 장면·등장 연출 설정 (없으면 기본 장면) */
  world?: WorldPack;
  artworks: ArtworkPack[];
}

/** 월드 장면 설정 — content-src/themes/<id>/theme.yml의 world */
export interface WorldPack {
  title: string;
  lead: string;
  /** 내장 장면(dino/jungle/ocean) 또는 palette로 그리는 generic */
  scene: 'dino' | 'jungle' | 'ocean' | 'generic';
  /** generic 장면 전용 색 */
  palette?: { skyTop: string; skyBottom: string; groundTop: string; groundBottom: string; hill: string; sun?: string };
  /** generic 장면 전용: 배경에 떠다니는 것 */
  ambient?: 'none' | 'clouds' | 'stars' | 'bubbles' | 'petals';
  /** 내 친구가 나타나는 연출 */
  spawn: { prop: 'egg' | 'bush' | 'bubble' | 'cloud' | 'star'; colors: string[]; shell?: boolean };
  /** 화면을 눌렀을 때 떠오르는 이모지 */
  tapEmojis: string[];
}

/** 월드 캐릭터 행동 값 (프리셋이 빌드 때 펼쳐져 작품마다 들어 있다) — content-src/behaviors.yml */
export interface BehaviorPack {
  habitat: 'ground' | 'sky' | 'water';
  size: number;
  speed: [number, number];
  stepHz: number;
  bob: number;
  lean: number;
  roll: number;
  leg: number;
  tail: number;
  tailHz: number;
  head: number;
  wing: number;
  neck?: number;
  /** 나는 높이 범위 [위, 아래] (장면 y, 0~128). 하늘 월드처럼 넓게 날 때 지정 */
  altitude?: [number, number];
  dust?: boolean;
  shout?: string;
  moves: Array<[string, number]>;
}

/** 아트워크 패키지 (폰이 다운로드하여 캐시) */
export interface ArtworkPack {
  id: string;
  name: string;
  viewBox: string;
  regions: RegionPack[];
  thumbnailUrl: string; // 썸네일 이미지 URL
  imageUrl?: string; // 고품질 공룡/캐릭터 일러스트 도안 URL
  spriteUrl?: string; // 월드 NPC로 쓰는 컬러 스프라이트 URL (없으면 영역 색으로 합성)
  behavior?: BehaviorPack; // 월드에서의 움직임 (없으면 기본 걷기)
}

/** 패키지용 리전 (메타데이터 포함) */
export interface RegionPack {
  id: string;
  label: string;
  path: string; // SVG path
  zIndex: number; // 렌더링 순서
}

/** 폰이 캐시하는 전체 패키지 (런타임) */
export interface CachedGamePackage extends GamePackageManifest {
  downloadedAt: number;
  artworksCache: Map<string, ArtworkPack>; // id -> artwork
}

// ============================================================================
// TV 디스커버리 (폰 ↔ TV 로컬 네트워크)
// ============================================================================

/** TV가 브로드캐스트/응답으로 알리는 정보 */
export interface TVAnnouncement {
  type: 'tv-announce';
  roomCode: string;
  tvName: string;
  tvId: string; // 고유 식별자 (MAC 기반 해시 등)
  wsUrl: string; // ws://ip:port/ws?role=tv&room=XXX
  httpUrl: string; // http://ip:port (디스커버리용)
  capabilities: TVCapabilities;
  timestamp: number;
}

export interface TVCapabilities {
  maxResolution: { width: number; height: number };
  supportsWebGL2: boolean;
  supportsWASMSIMD: boolean;
  pixiVersion: string;
}

/** 폰이 TV에 디스커버리 요청 보낼 때 */
export interface TVDiscoveryRequest {
  type: 'tv-discover';
  phoneId: string;
  phoneName: string;
  supportedProtocols: string[]; // ['0.2.0']
}

/** 콘텐츠 서버 API 응답 */
export interface ContentServerResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
  cacheControl?: string;
}

export interface PackageListResponse {
  packages: GamePackageManifest[];
  latestVersion: string;
}

// ============================================================================
// 유틸리티
// ============================================================================

/** ArtworkPack → ArtworkRuntime 변환 (TV 전송용 경량화) */
export function toArtworkRuntime(art: ArtworkPack): ArtworkRuntime {
  return {
    id: art.id,
    name: art.name,
    viewBox: art.viewBox,
    regions: art.regions.map((r) => ({
      id: r.id,
      label: r.label,
      path: r.path,
    })),
    imageUrl: art.imageUrl,
  };
}

/** TVCommand 직렬화 헬퍼 */
export function stringifyTVCommand(cmd: TVCommand): string {
  return JSON.stringify(cmd);
}

/** TVCommand 파싱 (안전) */
export function parseTVCommand(text: string): TVCommand | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.type === 'string') return parsed as TVCommand;
    return null;
  } catch {
    return null;
  }
}
