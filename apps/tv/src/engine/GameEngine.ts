import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Artwork } from '@ht/tv-art';
import { THEME_META } from '@ht/tv-art';

/** 아트워크 논리 좌표(0..100)를 렌더 픽셀로 변환하는 배율 */
const PAINT_SCALE = 6;
/** 진행도 집계용 마스크 해상도 배율 */
const MASK_SCALE = 3;
const CANVAS_SIZE = 600;
const COMPLETE_THRESHOLD = 0.85;

interface RegionMask {
  label: string;
  /** 원본 좌표계(0..100) 경로 — 히트테스트용 */
  hitPath: Path2D;
  /** 캔버스 좌표계(0..600) 경로 — 클립용 */
  clipPath: Path2D;
  /** 마스크 해상도에서 불투명 픽셀 인덱스(ImageData 오프셋) 목록 */
  pixels: number[];
}

export interface EngineCallbacks {
  /** 색칠 진행도가 임계치를 넘으면 호출 */
  onComplete?: (progressPct: number) => void;
}

/**
 * TV 화면의 모든 렌더링과 색칠 판정을 담당하는 엔진.
 * React 렌더 사이클과 분리되어 PixiJS 티커 안에서 자체 루프로 동작한다.
 *
 * 좌표 규약:
 *  - 외부 입력은 TV 정규화 좌표(0..1)
 *  - 아트워크 논리 좌표는 0..100
 *  - paint/base 캔버스는 0..600
 */
export class GameEngine {
  private canvas: HTMLCanvasElement | null;
  private cb: EngineCallbacks;
  private app: Application | null = null;

  private bg = new Container();
  private artHolder = new Container();
  private strokesC = new Container();
  private fx = new Container();
  private cursorC = new Container();

  private baseSprite: Sprite | null = null;
  private paintSprite: Sprite | null = null;
  private baseTex: Texture | null = null;
  private paintTex: Texture | null = null;

  private paintCanvas = document.createElement('canvas');
  private paintCtx: CanvasRenderingContext2D;
  private baseCanvas = document.createElement('canvas');
  private baseCtx: CanvasRenderingContext2D;

  private currentArt: Artwork | null = null;
  private masks: RegionMask[] = [];
  private totalArea = 0;
  private lastProgress = 0;
  private completedIds = new Set<string>();
  private galleryMode = false;

  // 커서 상태
  private cursorG = new Graphics();
  private trail: { x: number; y: number; a: number }[] = [];
  private targetX = -200;
  private targetY = -200;
  private cursorVisible = false;

  // 자유선 스트로크 상태
  private activeStroke: Graphics | null = null;
  private strokePts: number[][] = [];
  private strokesHistory: Graphics[] = [];

  // 색칠 브러시 직전 지점(연속 채색 보간용)
  private lastPaintPt: { x: number; y: number } | null = null;
  private currentColor = '#e63946';
  private undoStack: ImageData[] = [];
  private time = 0;

  constructor(canvas: HTMLCanvasElement | null, cb: EngineCallbacks = {}) {
    this.canvas = canvas;
    this.cb = cb;
    this.paintCanvas.width = CANVAS_SIZE;
    this.paintCanvas.height = CANVAS_SIZE;
    this.paintCtx = this.paintCanvas.getContext('2d')!;
    this.baseCanvas.width = CANVAS_SIZE;
    this.baseCanvas.height = CANVAS_SIZE;
    this.baseCtx = this.baseCanvas.getContext('2d')!;
  }

  async start() {
    const app = new Application();
    await app.init({
      canvas: this.canvas ?? undefined,
      resizeTo: window,
      backgroundAlpha: 0,
      antialias: true,
    });
    this.app = app;
    app.stage.addChild(this.bg, this.artHolder, this.strokesC, this.fx, this.cursorC);
    this.cursorC.addChild(this.cursorG);
    app.ticker.add(() => this.tick());
    this.ready = true;
    this.showBackdrop('dino');
  }

  private ready = false;

  destroy() {
    // canvas 엘리먼트는 React가 소유하므로 제거하지 않는다(false)
    this.app?.destroy(false, { children: true });
    this.app = null;
    this.ready = false;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.app?.renderer.resize(w, h);
  }

  getProgress(): number {
    return this.lastProgress;
  }

  setCursorVisible(v: boolean) {
    this.cursorVisible = v;
    if (!v) {
      this.trail = [];
      this.cursorG.clear();
    }
  }

  // ------------------------------------------------------------------
  // 씬 제어
  // ------------------------------------------------------------------

  showBackdrop(theme: keyof typeof THEME_META) {
    if (!this.ready) return;
    this.galleryMode = false;
    this.clearContainers([this.artHolder, this.strokesC]);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const g = new Graphics();
    g.rect(0, 0, w, h).fill(THEME_META[theme].bg);

    const deco = new Graphics();
    const accent = THEME_META[theme].accent;
    if (theme === 'ocean') {
      for (let i = 0; i < 24; i++) {
        deco
          .circle(Math.random() * w, Math.random() * h, 4 + Math.random() * 18)
          .stroke({ width: 2, color: accent, alpha: 0.18 });
      }
    } else if (theme === 'jungle') {
      for (let i = 0; i < 20; i++) {
        deco
          .circle(Math.random() * w, Math.random() * h, 20 + Math.random() * 30)
          .stroke({ width: 2, color: accent, alpha: 0.15 });
      }
    } else {
      for (let i = 0; i < 26; i++) {
        const r = 2 + Math.random() * 5;
        deco
          .circle(Math.random() * w, Math.random() * h, r)
          .fill({ color: accent, alpha: 0.12 + Math.random() * 0.1 });
      }
    }
    this.clearContainers([this.bg]);
    this.bg.addChild(g, deco);
  }

  loadArtwork(art: Artwork) {
    if (!this.ready) return;
    this.galleryMode = false;
    this.currentArt = art;
    this.buildMasks(art);
    this.renderBase(art);
    this.paintCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    this.lastProgress = 0;
    this.undoStack = [];
    this.lastPaintPt = null;
    this.clearStrokes();

    this.clearContainers([this.artHolder]);
    this.baseTex?.destroy(true);
    this.paintTex?.destroy(true);
    this.baseTex = Texture.from(this.baseCanvas);
    this.paintTex = Texture.from(this.paintCanvas);
    this.baseSprite = new Sprite(this.baseTex);
    this.paintSprite = new Sprite(this.paintTex);
    const rect = this.artRect();
    for (const s of [this.baseSprite, this.paintSprite]) {
      s.width = rect.w;
      s.height = rect.h;
      s.x = rect.x;
      s.y = rect.y;
    }
    this.artHolder.addChild(this.baseSprite, this.paintSprite);
  }

  showGallery(theme: keyof typeof THEME_META, arts: Artwork[]) {
    if (!this.ready) return;
    this.showBackdrop(theme);
    this.galleryMode = true;
    const w = window.innerWidth;
    const h = window.innerHeight;
    let i = 0;
    const cols = Math.ceil(Math.sqrt(Math.max(arts.length, 1)));
    const cell = Math.min(w / (cols + 1), h / (Math.ceil(arts.length / cols) + 1)) * 0.8;
    for (const a of arts) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = w / 2 + (col - (cols - 1) / 2) * cell * 1.25;
      const rows = Math.ceil(arts.length / cols);
      const y = h / 2 + (row - (rows - 1) / 2) * cell * 1.35;
      const holder = new Container();
      holder.x = x;
      holder.y = y;
      holder.scale.set(0.2);
      const sp = new Sprite(this.snapshotArtTexture(a));
      sp.anchor.set(0.5);
      sp.width = cell;
      sp.height = cell;
      holder.addChild(sp);
      this.artHolder.addChild(holder);
      i++;
    }
  }

  // ------------------------------------------------------------------
  // 릴레이된 폰 입력 처리
  // ------------------------------------------------------------------

  /** 커서 갱신. 스트로크 도중이면 선을 이어 그리고, 페인트 모드면 영역을 채색한다. */
  onPoint(nx: number, ny: number, painting = false, color?: string) {
    if (!this.ready) return;
    if (color) this.currentColor = color;
    this.cursorVisible = true;
    this.targetX = nx * window.innerWidth;
    this.targetY = ny * window.innerHeight;

    if (this.activeStroke) {
      this.extendStrokeAt(this.targetX, this.targetY);
      return;
    }
    if (painting && this.currentArt) {
      this.paintStamp(this.targetX, this.targetY, this.currentColor, false);
    }
  }

  /** 영역 채우기(색칠 모드의 탭) */
  onFill(nx: number, ny: number, color: string) {
    if (!this.ready) return;
    this.currentColor = color;
    this.cursorVisible = true;
    this.targetX = nx * window.innerWidth;
    this.targetY = ny * window.innerHeight;
    this.pushUndo();
    this.paintStamp(this.targetX, this.targetY, color, true);
    this.evaluate();
  }

  beginStroke(color: string) {
    if (!this.ready || !this.currentArt) return;
    this.currentColor = color;
    this.lastPaintPt = null;
    this.activeStroke = new Graphics();
    this.strokePts = [];
    this.strokesC.addChild(this.activeStroke);
  }

  endStroke() {
    if (this.activeStroke) {
      if (this.strokePts.length >= 2) {
        this.strokesHistory.push(this.activeStroke);
      } else {
        this.activeStroke.destroy();
      }
      this.activeStroke = null;
      this.strokePts = [];
      this.lastPaintPt = null;
      this.evaluate();
    }
  }

  undo() {
    const snap = this.undoStack.pop();
    if (snap) {
      this.paintCtx.putImageData(snap, 0, 0);
      this.paintTex?.source.update();
    }
    const g = this.strokesHistory.pop();
    g?.destroy();
    this.lastPaintPt = null;
    this.evaluate();
  }

  // ------------------------------------------------------------------
  // 내부 구현
  // ------------------------------------------------------------------

  private tick() {
    if (!this.ready) return;
    this.time += this.app!.ticker.deltaMS;

    // 커서 스무딩 잔상
    this.cursorG.clear();
    if (this.cursorVisible) {
      this.trail.unshift({ x: this.targetX, y: this.targetY, a: 1 });
      if (this.trail.length > 14) this.trail.pop();
      this.trail.forEach((p, i) => {
        p.a *= 0.86;
        if (i > 0) {
          this.cursorG.circle(p.x, p.y, 10 * p.a).fill({ color: this.currentColor, alpha: p.a * 0.25 });
        }
      });
      this.cursorG.circle(this.targetX, this.targetY, 26).stroke({ width: 4, color: this.currentColor, alpha: 0.95 });
      this.cursorG.circle(this.targetX, this.targetY, 5).fill(this.currentColor);
    }

    // 갤러리 등장 애니메이션 + 부유
    if (this.galleryMode) {
      this.artHolder.children.forEach((c, i) => {
        c.scale.set(Math.min(c.scale.x + 0.03, 1));
        c.y += Math.sin((this.time + i * 420) / 520) * 0.25;
      });
    }
  }

  private artRect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = Math.min(w, h) * 0.72;
    return { x: (w - size) / 2, y: (h - size) / 2, w: size, h: size };
  }

  private clearContainers(list: Container[]) {
    for (const c of list) {
      c.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    }
  }

  private clearStrokes() {
    this.activeStroke?.destroy();
    this.activeStroke = null;
    for (const g of this.strokesHistory) g.destroy();
    this.strokesHistory = [];
    this.strokePts = [];
  }

  private pushUndo() {
    try {
      this.undoStack.push(this.paintCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
      if (this.undoStack.length > 10) this.undoStack.shift();
    } catch {
      /* 캔버스 오염 등의 예외 무시 */
    }
  }

  /** 화면 픽셀 좌표 → 아트워크 논리 좌표(0..100) */
  private toArtCoords(px: number, py: number) {
    const r = this.artRect();
    return { ax: ((px - r.x) / r.w) * 100, ay: ((py - r.y) / r.h) * 100 };
  }

  /** 논리 좌표가 속한 최상위 영역 반환 (SVG 페인트 순서 역순 판정) */
  private regionAt(ax: number, ay: number): RegionMask | null {
    if (!this.currentArt) return null;
    for (let i = this.masks.length - 1; i >= 0; i--) {
      if (this.hitCtx.isPointInPath(this.masks[i].hitPath, ax, ay)) return this.masks[i];
    }
    return null;
  }

  private hitCtx: CanvasRenderingContext2D = document.createElement('canvas').getContext('2d')!;

  /** 커서 위치에 영역 클립 + 부드러운 스탬프 채색 */
  private paintStamp(px: number, py: number, color: string, big: boolean): boolean {
    const { ax, ay } = this.toArtCoords(px, py);
    if (ax < -4 || ay < -4 || ax > 104 || ay > 104) return false;
    const mask = this.regionAt(ax, ay);
    if (!mask) return false;

    const cx = (ax / 100) * CANVAS_SIZE;
    const cy = (ay / 100) * CANVAS_SIZE;
    const radius = big ? 15 : 11;

    this.paintCtx.save();
    this.paintCtx.clip(mask.clipPath);
    this.paintCtx.fillStyle = color;
    if (this.lastPaintPt) {
      // 직전 지점 → 현재 지점 선형 보간으로 연속 채색
      const lx = (this.lastPaintPt.x / 100) * CANVAS_SIZE;
      const ly = (this.lastPaintPt.y / 100) * CANVAS_SIZE;
      const d = Math.hypot(cx - lx, cy - ly);
      const steps = Math.max(1, Math.ceil(d / (radius * 0.45)));
      for (let i = 0; i <= steps; i++) {
        this.paintCtx.beginPath();
        this.paintCtx.arc(lx + ((cx - lx) * i) / steps, ly + ((cy - ly) * i) / steps, radius, 0, Math.PI * 2);
        this.paintCtx.fill();
      }
    } else {
      this.paintCtx.beginPath();
      this.paintCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.paintCtx.fill();
    }
    this.paintCtx.restore();
    this.lastPaintPt = { x: ax, y: ay };
    this.paintTex?.source.update();
    return true;
  }

  private extendStrokeAt(px: number, py: number) {
    if (!this.activeStroke) return;
    const { ax, ay } = this.toArtCoords(px, py);
    const inside = ax >= 0 && ay >= 0 && ax <= 100 && ay <= 100 && this.regionAt(ax, ay);
    if (!inside) {
      this.lastPaintPt = null;
      return;
    }
    this.strokePts.push([px, py]);
    if (this.strokePts.length === 2) this.pushUndo();
    const g = this.activeStroke;
    g.clear();
    g.moveTo(this.strokePts[0][0], this.strokePts[0][1]);
    for (let i = 1; i < this.strokePts.length; i++) g.lineTo(this.strokePts[i][0], this.strokePts[i][1]);
    g.stroke({ width: 7, color: this.currentColor, cap: 'round', join: 'round' });
  }

  /** 외곽선 + 반투명 기본층 렌더 */
  private renderBase(art: Artwork) {
    const ctx = this.baseCtx;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const reg of art.regions) {
      const p = new Path2D(reg.d);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill(p);
      ctx.strokeStyle = '#33383f';
      ctx.lineWidth = 1.6;
      ctx.stroke(p);
    }
    this.baseTex?.source.update();
  }

  /** region 마스크 사전 계산: 히트경로/클립경로/면적 픽셀 목록 */
  private buildMasks(art: Artwork) {
    const w = Math.round(100 * MASK_SCALE);
    const mc = document.createElement('canvas');
    mc.width = w;
    mc.height = w;
    const ctx = mc.getContext('2d', { willReadFrequently: true })!;
    this.totalArea = 0;
    this.masks = art.regions.map((reg) => {
      ctx.clearRect(0, 0, w, w);
      ctx.fillStyle = '#000';
      ctx.fill(new Path2D(scalePath(reg.d, MASK_SCALE)));
      const data = ctx.getImageData(0, 0, w, w).data;
      const px: number[] = [];
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 60) px.push(i);
      }
      this.totalArea += px.length;
      return {
        label: reg.label,
        hitPath: new Path2D(reg.d),
        clipPath: new Path2D(scalePath(reg.d, PAINT_SCALE)),
        pixels: px,
      };
    });
  }

  /** 전체 색칠 진행도 집계 → 임계치 도달 시 완료 콜백 */
  private evaluate() {
    if (!this.currentArt || this.totalArea === 0) return;
    const w = Math.round(100 * MASK_SCALE);
    const tmp = document.createElement('canvas');
    tmp.width = w;
    tmp.height = w;
    const tc = tmp.getContext('2d', { willReadFrequently: true })!;
    tc.drawImage(this.paintCanvas, 0, 0, w, w);
    const pd = tc.getImageData(0, 0, w, w).data;

    let painted = 0;
    for (const m of this.masks) {
      let cnt = 0;
      for (const i of m.pixels) {
        if (pd[i] > 90) cnt++;
      }
      painted += cnt;
    }
    const pct = painted / this.totalArea;
    this.lastProgress = pct;
    if (pct >= COMPLETE_THRESHOLD && !this.completedIds.has(this.currentArt.id)) {
      this.completedIds.add(this.currentArt.id);
      this.burst();
      this.cb.onComplete?.(pct);
    }
  }

  /** 완성 축하 파티클 버스트 */
  private burst() {
    if (!this.ready) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const colors = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#7b2cbf'];
    const parts: { g: Graphics; vx: number; vy: number; life: number }[] = [];
    for (let i = 0; i < 90; i++) {
      const g = new Graphics();
      g.circle(0, 0, 4 + Math.random() * 6).fill(colors[i % colors.length]);
      g.x = w / 2;
      g.y = h / 2;
      const ang = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 9;
      parts.push({ g, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4, life: 1 });
      this.fx.addChild(g);
    }
    const step = () => {
      let alive = false;
      for (const p of parts) {
        p.vy += 0.18;
        p.g.x += p.vx;
        p.g.y += p.vy;
        p.life -= 0.012;
        p.g.alpha = Math.max(0, p.life);
        if (p.life > 0) alive = true;
      }
      if (!alive) {
        this.app?.ticker.remove(step);
        this.clearContainers([this.fx]);
      }
    };
    this.app?.ticker.add(step);
  }

  /** 작품 스냅샷 텍스처(외곽선 + 현재 채색 합성) */
  snapshotArtTexture(a: Artwork): Texture {
    const cv = document.createElement('canvas');
    cv.width = 300;
    cv.height = 300;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, 300, 300);
    for (const reg of a.regions) {
      ctx.strokeStyle = '#33383f';
      ctx.lineWidth = 1.6;
      ctx.stroke(new Path2D(scalePath(reg.d, 3)));
    }
    if (this.currentArt?.id === a.id) {
      ctx.drawImage(this.paintCanvas, 0, 0, 300, 300);
    }
    return Texture.from(cv);
  }
}

/**
 * SVG path 문자열의 숫자를 균일 배율로 스케일한다.
 * 아트워크 path 는 절대 커맨드(M/L/Q/C/Z)만 사용하므로 단순 치환이 안전하다.
 */
function scalePath(d: string, s: number): string {
  return d.replace(/-?\d+(?:\.\d+)?/g, (num) => String(parseFloat(num) * s));
}
