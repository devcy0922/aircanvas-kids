import { GameEngine } from './GameEngine';
import type { TVCommand, ArtworkRuntime, CompletedArtwork, ThemeId, LoadScenePayload } from '@ht/protocol';

export interface TVCommandHandlerCallbacks {
  onProgress?: (percent: number, artworkName?: string) => void;
  onComplete?: (artworkName: string) => void;
  onError?: (error: string) => void;
}

export class TVCommandHandler {
  private engine: GameEngine;
  private callbacks: TVCommandHandlerCallbacks;
  private currentArtwork: ArtworkRuntime | null = null;
  private currentTheme: ThemeId = 'dino';
  private completedArtworks: CompletedArtwork[] = [];

  constructor(canvas: HTMLCanvasElement | null, callbacks: TVCommandHandlerCallbacks = {}) {
    this.callbacks = callbacks;
    this.engine = new GameEngine(canvas, {
      onComplete: (progressPct) => {
        if (this.currentArtwork) {
          const dataUrl = this.generateThumbnail(this.currentArtwork);
          this.completedArtworks.push({
            id: this.currentArtwork.id,
            name: this.currentArtwork.name,
            thumbnailDataUrl: dataUrl,
            completedAt: Date.now(),
            progress: progressPct,
          });
          this.callbacks.onComplete?.(this.currentArtwork.name);
        }
      },
    });
  }

  async start() {
    await this.engine.start();
  }

  destroy() {
    this.engine.destroy();
  }

  resize() {
    this.engine.resize();
  }

  /** TVCommand 디스패치 진입점 */
  handleCommand(cmd: TVCommand) {
    try {
      switch (cmd.type) {
        case 'load-scene':
          this.handleLoadScene(cmd);
          break;
        case 'set-cursor':
          this.handleSetCursor(cmd);
          break;
        case 'draw-stroke':
          this.handleDrawStroke(cmd);
          break;
        case 'fill-region':
          this.handleFillRegion(cmd);
          break;
        case 'play-effect':
          this.handlePlayEffect(cmd);
          break;
        case 'set-progress':
          this.callbacks.onProgress?.(cmd.percent, cmd.artworkName);
          break;
        case 'undo':
          this.engine.undo();
          break;
        case 'reset-canvas':
          this.handleResetCanvas();
          break;
        case 'debug':
          this.handleDebug(cmd);
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.callbacks.onError?.(msg);
      console.error('[TVCommandHandler] Error:', e);
    }
  }

  private handleLoadScene(cmd: Extract<TVCommand, { type: 'load-scene' }>) {
    const { scene, payload } = cmd;
    switch (scene) {
      case 'home':
        this.handleLoadHome(payload as LoadScenePayload & { scene: 'home' });
        break;
      case 'calib':
        this.handleLoadCalib(payload as LoadScenePayload & { scene: 'calib' });
        break;
      case 'play':
        this.handleLoadPlay(payload as LoadScenePayload & { scene: 'play' });
        break;
      case 'gallery':
        this.handleLoadGallery(payload as LoadScenePayload & { scene: 'gallery' });
        break;
    }
  }

  private handleLoadHome(_payload: LoadScenePayload & { scene: 'home' }) {
    this.engine.showBackdrop(this.currentTheme);
    this.currentArtwork = null;
  }

  private handleLoadCalib(payload: LoadScenePayload & { scene: 'calib' }) {
    this.currentTheme = payload.theme;
    this.engine.showBackdrop(payload.theme);
  }

  private handleLoadPlay(payload: LoadScenePayload & { scene: 'play' }) {
    this.currentArtwork = payload.artwork;
    this.currentTheme = payload.theme;
    this.engine.loadArtwork(this.adaptArtworkRuntime(payload.artwork));
  }

  private handleLoadGallery(payload: LoadScenePayload & { scene: 'gallery' }) {
    this.currentTheme = payload.theme;
    this.completedArtworks = payload.completed;
    this.engine.showGallery(payload.theme, payload.completed.map((c) => this.adaptCompletedToArtwork(c)));
  }

  private handleSetCursor(cmd: Extract<TVCommand, { type: 'set-cursor' }>) {
    this.engine.setCursorVisible(cmd.visible);
    if (cmd.visible) {
      this.engine.onPoint(cmd.x, cmd.y, false, cmd.color);
    }
  }

  private handleDrawStroke(cmd: Extract<TVCommand, { type: 'draw-stroke' }>) {
    if (cmd.points.length < 2) return;
    const first = cmd.points[0];
    this.engine.beginStroke(cmd.color);
    this.engine.onPoint(first.x, first.y, false, cmd.color);
    for (let i = 1; i < cmd.points.length; i++) {
      this.engine.onPoint(cmd.points[i].x, cmd.points[i].y, true, cmd.color);
    }
    this.engine.endStroke();
  }

  private handleFillRegion(cmd: Extract<TVCommand, { type: 'fill-region' }>) {
    if (!this.currentArtwork) return;
    const region = this.currentArtwork.regions.find((r) => r.id === cmd.regionId);
    if (!region) return;
    const center = this.getRegionCenter(region.path);
    if (center) {
      this.engine.onFill(center.x, center.y, cmd.color);
    }
  }

  private handlePlayEffect(cmd: Extract<TVCommand, { type: 'play-effect' }>) {
    if (cmd.effect === 'burst') {
      console.log('[TVCommandHandler] play-effect: burst', cmd.params);
    }
  }

  private handleResetCanvas() {
    if (this.currentArtwork) {
      this.engine.loadArtwork(this.adaptArtworkRuntime(this.currentArtwork));
    }
  }

  private handleDebug(cmd: Extract<TVCommand, { type: 'debug' }>) {
    if (cmd.action === 'ping') {
      console.log('[TVCommandHandler] pong');
    } else if (cmd.action === 'stats') {
      console.log('[TVCommandHandler] stats', {
        currentArtwork: this.currentArtwork?.id,
        currentTheme: this.currentTheme,
        completedCount: this.completedArtworks.length,
        progress: this.engine.getProgress(),
      });
    }
  }

  /** ArtworkRuntime을 기존 Artwork 타입으로 어댑트 (엔진 호환용) */
  private adaptArtworkRuntime(rt: ArtworkRuntime): any {
    return {
      id: rt.id,
      theme: this.currentTheme,
      name: rt.name,
      viewBox: rt.viewBox,
      regions: rt.regions.map((r) => ({ d: r.path, label: r.label })),
    };
  }

  private adaptCompletedToArtwork(c: CompletedArtwork): any {
    return {
      id: c.id,
      theme: this.currentTheme,
      name: c.name,
      viewBox: '0 0 100 100',
      regions: [],
    };
  }

  /** SVG path에서 대략적인 중심점 계산 (fill-region용) */
  private getRegionCenter(path: string): { x: number; y: number } | null {
    try {
      // Path2D.getBounds는 표준이 아님 → 수동 계산
      const coords = this.extractCoords(path);
      if (coords.length === 0) return { x: 0.5, y: 0.5 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const { x, y } of coords) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { x: (minX + maxX) / 200, y: (minY + maxY) / 200 }; // 0..100 -> 0..1
    } catch {
      return { x: 0.5, y: 0.5 };
    }
  }

  private extractCoords(path: string): { x: number; y: number }[] {
    const coords: { x: number; y: number }[] = [];
    const numRegex = /-?\d+(?:\.\d+)?/g;
    const nums = path.match(numRegex);
    if (!nums) return coords;
    for (let i = 0; i < nums.length; i += 2) {
      const x = parseFloat(nums[i]);
      const y = parseFloat(nums[i + 1]);
      if (!Number.isNaN(x) && !Number.isNaN(y)) coords.push({ x, y });
    }
    return coords;
  }

  private generateThumbnail(artwork: ArtworkRuntime): string {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, 300, 300);
      ctx.strokeStyle = '#33383f';
      ctx.lineWidth = 2;
      for (const region of artwork.regions) {
        ctx.stroke(new Path2D(this.scalePath(region.path, 3)));
      }
      ctx.fillStyle = '#999';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(artwork.name, 150, 150);
      return canvas.toDataURL('image/png');
    } catch {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
  }

  private scalePath(d: string, s: number): string {
    return d.replace(/-?\d+(?:\.\d+)?/g, (num) => String(parseFloat(num) * s));
  }
}