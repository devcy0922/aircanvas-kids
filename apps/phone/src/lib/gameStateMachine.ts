import { toArtworkRuntime, type TVCommand, type ArtworkPack, type CachedGamePackage } from '@ht/protocol';

export type GamePhase = 'lobby' | 'connecting' | 'calibrating' | 'playing' | 'gallery' | 'world' | 'error';

export interface GameState {
  phase: GamePhase;
  selectedTheme?: string;
  selectedArtwork?: ArtworkPack;
  roomCode?: string;
  tvConnected: boolean;
  calibrationStep: number;
  calibrationError: number | null;
  progress: number;
  error?: string;
}

type StateListener = (state: GameState) => void;

export interface GameStateMachineCallbacks {
  onStateChange?: (state: GameState) => void;
  onTVCommand?: (cmd: TVCommand) => void;
  onError?: (error: string) => void;
}

export class GameStateMachine {
  private callbacks: GameStateMachineCallbacks;
  private state: GameState;
  private listeners = new Set<StateListener>();
  private package: CachedGamePackage | null = null;

  constructor(callbacks: GameStateMachineCallbacks = {}) {
    this.callbacks = callbacks;
    this.state = this.initialState();
  }

  private initialState(): GameState {
    return {
      phase: 'lobby',
      tvConnected: false,
      calibrationStep: 0,
      calibrationError: null,
      progress: 0,
    };
  }

  /** 전체 패키지 설정 (패키지 매니저에서 로드 후 호출) */
  setPackage(pkg: CachedGamePackage) {
    this.package = pkg;
    this.emit();
  }

  getPackage(): CachedGamePackage | null {
    return this.package;
  }

  getState(): GameState {
    return { ...this.state };
  }

  subscribe(listener: StateListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 테마 선택 */
  selectTheme(themeId: string) {
    if (!this.package?.themes.find((t) => t.id === themeId)) return false;
    this.state = { ...this.state, selectedTheme: themeId, selectedArtwork: undefined };
    this.emit();
    return true;
  }

  /** 선택한 테마의 첫 작품으로 넘어가며 캘리브레이션을 시작한다. */
  startTheme() {
    if (!this.package || !this.state.selectedTheme) return false;
    const theme = this.package.themes.find((t) => t.id === this.state.selectedTheme);
    const firstArtwork = theme?.artworks[0];
    if (!firstArtwork) return false;
    return this.selectArtwork(firstArtwork.id);
  }

  /** 작품 선택 → 캘리브레이션 단계로 */
  selectArtwork(artworkId: string) {
    const artwork = this.package?.artworksCache.get(artworkId);
    if (!artwork) return false;
    // 작품이 속한 테마 찾기
    let artworkTheme: string | undefined;
    if (this.package) {
      for (const theme of this.package.themes) {
        if (theme.artworks.some((a) => a.id === artworkId)) {
          artworkTheme = theme.id;
          break;
        }
      }
    }
    this.state = { ...this.state, selectedArtwork: artwork, selectedTheme: artworkTheme, phase: 'calibrating', calibrationStep: 0, calibrationError: null };
    this.emit();
    // TV에 load-scene: calib 전송
    this.sendTVCommand({
      type: 'load-scene',
      scene: 'calib',
      payload: {
        scene: 'calib',
        theme: (artworkTheme ?? 'dino') as any,
        artworkName: artwork.name,
        corners: [
          { x: 0.08, y: 0.08 },
          { x: 0.92, y: 0.08 },
          { x: 0.92, y: 0.92 },
          { x: 0.08, y: 0.92 },
        ],
      },
    });
    return true;
  }

  /** TV 연결됨 */
  onTVConnected(roomCode: string) {
    this.state = { ...this.state, roomCode, tvConnected: true, phase: 'lobby' };
    this.emit();
    this.sendTVCommand({
      type: 'load-scene',
      scene: 'home',
      payload: { scene: 'home', roomCode, tvName: 'AirCanvas TV' },
    });
  }

  /** TV 연결 끊김 */
  onTVDisconnected() {
    this.state = { ...this.state, tvConnected: false, roomCode: undefined };
    this.emit();
  }

  /** 캘리브레이션 포인트 캡처 완료 */
  onCalibrationPointCaptured(step: number, error: number) {
    this.state = { ...this.state, calibrationStep: step, calibrationError: error };
    if (step >= 4) {
      // 캘리브레이션 완료 → 플레이 단계로
      this.transitionToPlay();
    }
    this.emit();
  }

  /** 캘리브레이션 다시 하기 */
  redoCalibration() {
    this.state = { ...this.state, calibrationStep: 0, calibrationError: null, phase: 'calibrating' };
    this.emit();
    if (this.state.selectedArtwork && this.state.selectedTheme) {
      this.sendTVCommand({
        type: 'load-scene',
        scene: 'calib',
        payload: {
          scene: 'calib',
          theme: this.state.selectedTheme as any,
          artworkName: this.state.selectedArtwork.name,
          corners: [
            { x: 0.08, y: 0.08 },
            { x: 0.92, y: 0.08 },
            { x: 0.92, y: 0.92 },
            { x: 0.08, y: 0.92 },
          ],
        },
      });
    }
  }

  private transitionToPlay() {
    const { selectedArtwork, selectedTheme } = this.state;
    if (!selectedArtwork || !selectedTheme) return;
    this.state = { ...this.state, phase: 'playing', progress: 0 };
    this.emit();
    this.sendTVCommand({
      type: 'load-scene',
      scene: 'play',
      payload: {
        scene: 'play',
        artwork: {
          id: selectedArtwork.id,
          name: selectedArtwork.name,
          viewBox: selectedArtwork.viewBox,
          regions: selectedArtwork.regions.map((r) => ({
            id: r.id,
            label: r.label,
            path: r.path,
          })),
        },
        theme: selectedTheme as any,
      },
    });
  }

  /** 플레이 중 진행도 업데이트 (TV에서 수신) */
  onProgressUpdate(percent: number) {
    this.state = { ...this.state, progress: percent };
    this.emit();
    if (percent >= 0.85) {
      // 완성 → 갤러리로 전환
      setTimeout(() => this.transitionToGallery(), 1500);
    }
  }

  private transitionToGallery() {
    if (!this.state.selectedTheme || !this.state.selectedArtwork) return;
    const theme = this.package?.themes.find((t) => t.id === this.state.selectedTheme);
    const completed = theme ? [{
      id: this.state.selectedArtwork!.id,
      name: this.state.selectedArtwork!.name,
      thumbnailDataUrl: '', // TODO: TV에서 썸네일 수신 시 업데이트
      completedAt: Date.now(),
      progress: this.state.progress,
    }] : [];
    this.state = { ...this.state, phase: 'gallery' };
    this.emit();
    this.sendTVCommand({
      type: 'load-scene',
      scene: 'gallery',
      payload: {
        scene: 'gallery',
        theme: this.state.selectedTheme as any,
        completed,
      },
    });
  }

  /** 홈으로 돌아가기 */
  goHome() {
    const { roomCode, tvConnected } = this.state;
    this.state = { ...this.initialState(), roomCode, tvConnected };
    this.emit();
    if (roomCode && tvConnected) {
      this.sendTVCommand({
        type: 'load-scene',
        scene: 'home',
        payload: { scene: 'home', roomCode },
      });
    }
  }

  /** 다음 작품으로 */
  nextArtwork() {
    if (!this.package || !this.state.selectedTheme) return;
    const theme = this.package.themes.find((t) => t.id === this.state.selectedTheme);
    if (!theme) return;
    const currentIndex = theme.artworks.findIndex((a) => a.id === this.state.selectedArtwork?.id);
    if (currentIndex >= 0 && currentIndex < theme.artworks.length - 1) {
      this.selectArtwork(theme.artworks[currentIndex + 1].id);
    } else {
      this.transitionToGallery();
    }
  }

  /** 채색을 끝내지 않아도 현재 작품을 갤러리 단계로 넘긴다. */
  skipArtwork() {
    if (this.state.phase !== 'playing') return;
    this.transitionToGallery();
  }

  /** 현재 채색 결과를 정글 월드의 캐릭터로 내보낸다. */
  exportToWorld() {
    const { selectedArtwork, selectedTheme } = this.state;
    if (this.state.phase !== 'gallery' || !selectedArtwork || !selectedTheme) return;

    this.state = { ...this.state, phase: 'world' };
    this.emit();
    this.sendTVCommand({
      type: 'load-scene',
      scene: 'world',
      payload: {
        scene: 'world',
        world: 'jungle',
        theme: selectedTheme as any,
        character: toArtworkRuntime(selectedArtwork),
        progress: this.state.progress,
      },
    });
  }

  /** 핸드 트래킹 포인트 수신 → TV로 커서 커맨드 전송 */
  onTrackedPoint(x: number, y: number, pinch: boolean, color: string, mode: 'fill' | 'free' = 'fill') {
    if (this.state.phase !== 'playing') return;
    this.sendTVCommand({
      type: 'set-cursor',
      x,
      y,
      visible: true,
      color,
      // 카메라 핀치를 누르고 있는 동안은 TV가 같은 경로를 연속 채색한다.
      painting: mode === 'fill' && pinch,
    });
  }

  /** 손이 프레임에서 사라질 때 커서와 연속 채색을 함께 종료한다. */
  onTrackingLost() {
    if (this.state.phase !== 'playing') return;
    this.sendTVCommand({ type: 'set-cursor', x: 0, y: 0, visible: false });
  }

  /** 화면 정규화 좌표(x, y) 기반 영역 채우기 요청 */
  onFillAt(x: number, y: number, color: string) {
    if (this.state.phase !== 'playing' || !this.state.selectedArtwork) return;
    this.sendTVCommand({
      type: 'fill-at',
      x,
      y,
      color,
    });
  }

  /** 영역 ID 기반 채우기 요청 (레거시/직접 지정용) */
  onFillRegion(regionId: string, color: string) {
    if (this.state.phase !== 'playing' || !this.state.selectedArtwork) return;
    this.sendTVCommand({
      type: 'fill-region',
      regionId,
      color,
    });
  }

  /** 자유선 그리기 점들 전송 */
  onStrokePoints(points: { x: number; y: number }[], color: string) {
    if (this.state.phase !== 'playing') return;
    this.sendTVCommand({
      type: 'draw-stroke',
      points,
      color,
    });
  }

  /** 언도 */
  onUndo() {
    this.sendTVCommand({ type: 'undo' });
  }

  /** TV로 커맨드 전송 */
  private sendTVCommand(cmd: TVCommand) {
    this.callbacks.onTVCommand?.(cmd);
  }

  private emit() {
    this.callbacks.onStateChange?.(this.state);
    for (const l of this.listeners) l(this.state);
  }
}
