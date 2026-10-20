import type { ArtworkPack } from '@ht/protocol';
import type { PaintStroke } from '../components/TouchColoringBoard';

/**
 * 월드에서 움직일 캐릭터를 부위별 투명 PNG 레이어로 구워 낸다.
 *
 * 부위를 따로 움직이면서 원본 그림을 그대로 깔아 두면 원래 자리에 그림이 남아 "잔상"이 생긴다.
 * 그래서 원본 한 장(NPC는 컬러 스프라이트, 내 친구는 칠한 색 + 선화)을 영역 기준으로
 * 머리·꼬리·다리·날개·몸통 레이어로 쪼개고, 각 레이어는 서로 겹치지 않는 픽셀만 가진다.
 * 레이어끼리는 1px씩 겹쳐 틈이 보이지 않게 한다.
 */

export type PartName = 'wingL' | 'limbFar' | 'tail' | 'body' | 'limbNear' | 'arm' | 'head' | 'wingR';
/** 아래에서 위로 그리는 순서 */
export const PART_ORDER: PartName[] = ['wingL', 'limbFar', 'tail', 'body', 'limbNear', 'arm', 'head', 'wingR'];

export interface Point {
  x: number;
  y: number;
}

export interface BakedCreature {
  artworkId: string;
  /** 부위별 레이어 이미지(blob URL). 좌표계는 0..100 정사각형 */
  layers: Partial<Record<PartName, string>>;
  /** 부위가 회전할 관절 위치(0..100) */
  pivots: Partial<Record<PartName, Point>>;
  /** 투명하지 않은 영역의 경계(0..100) */
  bounds: { x0: number; x1: number; y0: number; y1: number };
  /** 원본 그림이 왼쪽을 보고 있는가 */
  facingLeft: boolean;
}

const SIZE = 384;
const UNPAINTED = '#fbf3df';
const GROUND_LABEL = /풀밭|돌멩이/;

/** 라벨 → 부위. null이면 가장 가까운 부위를 따라간다(점무늬·발톱·볼터치 등). */
export function partOf(label: string): PartName | null {
  if (/날개/.test(label)) return /왼쪽/.test(label) ? 'wingL' : 'wingR';
  if (/발톱|점무늬/.test(label)) return null;
  if (/꼬리/.test(label)) return 'tail';
  if (/지느러미|팔/.test(label)) return 'arm';
  if (/다리|허벅지|발/.test(label)) {
    return /먼|오른쪽/.test(label) || (/뒷다리/.test(label) && !/왼쪽/.test(label)) ? 'limbFar' : 'limbNear';
  }
  if (/머리|얼굴|턱|눈|이빨|입|볏|부리|뿔|프릴|목|주둥이|코|귀|갈기|상아|이마/.test(label)) return 'head';
  if (/몸통|몸|배|가슴|골판|풀밭|돌멩이/.test(label)) return 'body';
  return null;
}

// 라벨 맵용 색 코드. 경계의 안티앨리어싱 픽셀이 다른 코드와 우연히 같아지지 않도록 세 채널을 모두 쓴다.
const CODE = PART_ORDER.map((_, i) => {
  const g = i + 1;
  return [g * 30, (g * 97) % 256, (g * 53) % 256] as const;
});
const CODE_INDEX = new Map(CODE.map(([r, g, b], i) => [(r << 16) | (g << 8) | b, i]));

function makeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');
  return ctx;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image load failed: ${url}`));
    img.src = url;
  });
}

function toBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** NPC 색: 스프라이트가 없는 작품은 라벨로 눈·배·줄무늬만 구분해 한 색조로 칠한다. */
function npcFill(label: string, base: string): string {
  if (/눈동자/.test(label)) return '#2b2a33';
  if (/눈 흰자|눈$|^눈/.test(label)) return /흰자/.test(label) ? '#ffffff' : '#2b2a33';
  if (/흰줄무늬|배 무늬|밝은 배|배$/.test(label)) return '#fff3dc';
  if (/갈기|털/.test(label)) return '#b9772e';
  if (/^코$|입|상아/.test(label)) return /상아/.test(label) ? '#fff6e0' : '#e98b8b';
  return base;
}

/** 칠하지 않고 넘어간 작은 부위도 눈·이빨·입속은 살아 있는 색으로 보이게 한다 */
function unpaintedFill(label: string): string {
  if (/눈 흰자|이빨/.test(label)) return '#ffffff';
  if (/눈동자|^눈$|눈$/.test(label)) return '#2b2a33';
  if (/입속/.test(label)) return '#b8404a';
  return UNPAINTED;
}

function drawRegions(
  ctx: CanvasRenderingContext2D,
  artwork: ArtworkPack,
  colorOf: (label: string, id: string) => string | null
): void {
  ctx.save();
  ctx.scale(SIZE / 100, SIZE / 100);
  ctx.lineJoin = 'round';
  for (const region of [...artwork.regions].sort((a, b) => a.zIndex - b.zIndex)) {
    const color = colorOf(region.label, region.id);
    if (!color) continue;
    const path = new Path2D(region.path);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.35; // 인접 영역 사이의 머리카락 틈을 덮는다
    ctx.fill(path);
    ctx.stroke(path);
  }
  ctx.restore();
}

async function drawSource(
  ctx: CanvasRenderingContext2D,
  artwork: ArtworkPack,
  regionColors: Record<string, string> | undefined,
  strokes: PaintStroke[],
  npcColor: string | undefined
): Promise<void> {
  if (!regionColors && !strokes.length && artwork.spriteUrl) {
    try {
      ctx.drawImage(await loadImage(artwork.spriteUrl), 0, 0, SIZE, SIZE);
      return;
    } catch {
      // 스프라이트를 못 읽으면 영역 색으로 합성한다
    }
  }

  const painted = regionColors ?? {};
  drawRegions(ctx, artwork, (label, id) => {
    if (painted[id]) return painted[id];
    if (npcColor) return npcFill(label, npcColor);
    return GROUND_LABEL.test(label) ? null : unpaintedFill(label);
  });

  if (strokes.length) {
    ctx.save();
    ctx.scale(SIZE / 100, SIZE / 100);
    ctx.clip(new Path2D(artwork.regions.map((region) => region.path).join(' ')));
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      ctx.globalAlpha = stroke.brush === 'pen' ? 0.9 : 0.82;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x * 100, point.y * 100);
        else ctx.lineTo(point.x * 100, point.y * 100);
      });
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * 100 + 0.01, stroke.points[0].y * 100);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (artwork.imageUrl) {
    try {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(await loadImage(artwork.imageUrl), 0, 0, SIZE, SIZE);
      ctx.restore();
      return;
    } catch {
      // 선화를 못 읽으면 영역 윤곽선으로 대신한다
    }
  }
  ctx.save();
  ctx.scale(SIZE / 100, SIZE / 100);
  ctx.strokeStyle = '#173b35';
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  for (const region of artwork.regions) ctx.stroke(new Path2D(region.path));
  ctx.restore();
}

/** 픽셀마다 부위 번호(1..8, 0=없음)를 정한다. 라벨이 없는 조각은 가장 가까운 부위를 따른다. */
function assignParts(artwork: ArtworkPack, alpha: Uint8ClampedArray): Uint8Array {
  const labelCanvas = makeCanvas();
  const lctx = ctx2d(labelCanvas);
  lctx.scale(SIZE / 100, SIZE / 100);
  for (const region of [...artwork.regions].sort((a, b) => a.zIndex - b.zIndex)) {
    const part = partOf(region.label);
    if (!part) continue;
    const [r, g, b] = CODE[PART_ORDER.indexOf(part)];
    lctx.fillStyle = `rgb(${r},${g},${b})`;
    lctx.fill(new Path2D(region.path));
  }
  const data = lctx.getImageData(0, 0, SIZE, SIZE).data;

  const n = SIZE * SIZE;
  const label = new Uint8Array(n);
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const hit = data[o + 3] === 255 ? CODE_INDEX.get((data[o] << 16) | (data[o + 1] << 8) | data[o + 2]) : undefined;
    if (hit !== undefined) {
      label[i] = hit + 1;
    } else {
      dist[i] = 1e9;
    }
  }

  // 두 번 훑는 거리 전파(체임퍼)로 비어 있는 픽셀을 가장 가까운 부위에 붙인다
  const relax = (i: number, j: number, cost: number) => {
    if (dist[j] + cost < dist[i]) {
      dist[i] = dist[j] + cost;
      label[i] = label[j];
    }
  };
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) {
        relax(i, i - SIZE, 1);
        if (x > 0) relax(i, i - SIZE - 1, 1.41);
        if (x < SIZE - 1) relax(i, i - SIZE + 1, 1.41);
      }
    }
  }
  for (let y = SIZE - 1; y >= 0; y--) {
    for (let x = SIZE - 1; x >= 0; x--) {
      const i = y * SIZE + x;
      if (x < SIZE - 1) relax(i, i + 1, 1);
      if (y < SIZE - 1) {
        relax(i, i + SIZE, 1);
        if (x < SIZE - 1) relax(i, i + SIZE + 1, 1.41);
        if (x > 0) relax(i, i + SIZE - 1, 1.41);
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (alpha[i * 4 + 3] === 0) label[i] = 0;
    else if (label[i] === 0) label[i] = PART_ORDER.indexOf('body') + 1;
  }
  return label;
}

async function sliceLayer(source: HTMLCanvasElement, label: Uint8Array, part: number): Promise<string | null> {
  const mask = makeCanvas();
  const mctx = ctx2d(mask);
  const image = mctx.createImageData(SIZE, SIZE);
  let count = 0;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === part) {
      image.data[i * 4 + 3] = 255;
      count++;
    }
  }
  if (count < 30) return null;
  mctx.putImageData(image, 0, 0);

  // 마스크를 상하좌우로 1px 넓혀 이웃 레이어와 겹치게 한다
  const grown = makeCanvas();
  const gctx = ctx2d(grown);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) gctx.drawImage(mask, dx, dy);

  const layer = makeCanvas();
  const lctx = ctx2d(layer);
  lctx.drawImage(source, 0, 0);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.drawImage(grown, 0, 0);
  return toBlobUrl(layer);
}

export interface BakeInput {
  artwork: ArtworkPack;
  /** 내가 칠한 영역 색. 없으면 NPC(스프라이트 또는 npcColor) */
  regionColors?: Record<string, string>;
  strokes?: PaintStroke[];
  /** 스프라이트가 없는 NPC의 기본 색 */
  npcColor?: string;
}

export async function bakeCreature({ artwork, regionColors, strokes = [], npcColor }: BakeInput): Promise<BakedCreature> {
  const source = makeCanvas();
  const sctx = ctx2d(source);
  await drawSource(sctx, artwork, regionColors, strokes, npcColor);
  const pixels = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const label = assignParts(artwork, pixels);

  const bodyId = PART_ORDER.indexOf('body') + 1;
  const headId = PART_ORDER.indexOf('head') + 1;
  const sum = PART_ORDER.map(() => ({ n: 0, x: 0, y: 0 }));
  let x0 = SIZE, x1 = 0, y0 = SIZE, y1 = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const part = label[y * SIZE + x];
      if (!part) continue;
      const s = sum[part - 1];
      s.n++;
      s.x += x;
      s.y += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const body = sum[bodyId - 1];
  const bodyC = body.n ? { x: body.x / body.n, y: body.y / body.n } : { x: SIZE / 2, y: SIZE / 2 };

  // 관절 = 각 부위에서 몸통 중심에 가장 가까운 픽셀
  const nearest = PART_ORDER.map(() => ({ d: Infinity, x: 0, y: 0 }));
  for (let y = 0; y < SIZE; y += 2) {
    for (let x = 0; x < SIZE; x += 2) {
      const part = label[y * SIZE + x];
      if (!part) continue;
      const d = (x - bodyC.x) ** 2 + (y - bodyC.y) ** 2;
      if (d < nearest[part - 1].d) nearest[part - 1] = { d, x, y };
    }
  }

  const layers: BakedCreature['layers'] = {};
  const pivots: BakedCreature['pivots'] = {};
  for (let i = 0; i < PART_ORDER.length; i++) {
    const url = await sliceLayer(source, label, i + 1);
    if (!url) continue;
    layers[PART_ORDER[i]] = url;
    pivots[PART_ORDER[i]] = { x: (nearest[i].x / SIZE) * 100, y: (nearest[i].y / SIZE) * 100 };
  }

  const head = sum[headId - 1];
  const facingLeft = head.n ? head.x / head.n < bodyC.x : true;
  const k = 100 / SIZE;
  return {
    artworkId: artwork.id,
    layers,
    pivots,
    bounds: { x0: x0 * k, x1: (x1 + 1) * k, y0: y0 * k, y1: (y1 + 1) * k },
    facingLeft,
  };
}

/** 스프라이트가 없는 NPC의 기본 색 */
export function npcBaseColor(artworkId: string): string {
  if (artworkId.includes('lion')) return '#eeb04a';
  if (artworkId.includes('elephant')) return '#9db2bd';
  if (artworkId.includes('whale')) return '#58a6e0';
  if (artworkId.includes('fish')) return '#ff8a4f';
  return '#9ccf8a';
}

/** 같은 입력은 한 번만 굽는다 */
const cache = new Map<string, Promise<BakedCreature>>();

export function bakeCached(key: string, input: BakeInput): Promise<BakedCreature> {
  let hit = cache.get(key);
  if (!hit) {
    hit = bakeCreature(input);
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}
