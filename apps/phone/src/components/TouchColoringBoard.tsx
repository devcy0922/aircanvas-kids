import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';

export type TouchPoint = { x: number; y: number };
export type TouchMode = 'fill' | 'free';
export type BrushKind = 'round' | 'pen';
export type PaintStroke = {
  points: TouchPoint[];
  color: string;
  size: number;
  brush: BrushKind;
};

interface Props {
  artwork: ArtworkPack;
  theme: ThemePack;
  color: string;
  brush: BrushKind;
  brushSize: number;
  zoom?: number;
  strokes: PaintStroke[];
  onStroke: (stroke: PaintStroke) => void;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function interpolate(from: TouchPoint, to: TouchPoint, spacing: number): TouchPoint[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  return Array.from({ length: steps }, (_, index) => {
    const ratio = (index + 1) / steps;
    return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
  });
}

export function estimatePaintCoverage(artwork: ArtworkPack, strokes: PaintStroke[]): number {
  if (strokes.length === 0 || typeof Path2D === 'undefined' || typeof document === 'undefined') return 0;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return 0;
  const paths = artwork.regions.map((region) => new Path2D(region.path));
  const grid = 42;
  let inside = 0;
  let painted = 0;

  for (let row = 0; row < grid; row += 1) {
    for (let column = 0; column < grid; column += 1) {
      const x = ((column + 0.5) / grid) * 100;
      const y = ((row + 0.5) / grid) * 100;
      if (!paths.some((path) => context.isPointInPath(path, x, y))) continue;
      inside += 1;
      const hasPaint = strokes.some((stroke) => {
        const radius = stroke.size / 2;
        return stroke.points.some((point) => Math.hypot(point.x * 100 - x, point.y * 100 - y) <= radius);
      });
      if (hasPaint) painted += 1;
    }
  }
  return inside === 0 ? 0 : painted / inside;
}

export function TouchColoringBoard({ artwork, theme, color, brush, brushSize, zoom = 1, strokes, onStroke }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef<TouchPoint[]>([]);
  const activePointerIdRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<TouchPoint[]>([]);
  const [cursor, setCursor] = useState<TouchPoint | null>(null);
  const clipId = `paint-${useId().replace(/:/g, '')}`;
  const viewportSize = 100 / zoom;
  const viewportOrigin = (100 - viewportSize) / 2;

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>): TouchPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((viewportOrigin + ((event.clientX - rect.left) / rect.width) * viewportSize) / 100),
      y: clamp((viewportOrigin + ((event.clientY - rect.top) / rect.height) * viewportSize) / 100),
    };
  };

  const appendPoint = (point: TouchPoint) => {
    const previous = draftRef.current.at(-1);
    const additions = previous ? interpolate(previous, point, Math.max(0.004, brushSize / 300)) : [point];
    draftRef.current = [...draftRef.current, ...additions];
    setDraft([...draftRef.current]);
  };

  const finishStroke = () => {
    if (draftRef.current.length > 0) onStroke({ points: draftRef.current, color, size: brushSize, brush });
    draftRef.current = [];
    setDraft([]);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    const point = pointFromEvent(event);
    setCursor(point);
    draftRef.current = [point];
    setDraft([point]);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    setCursor(point);
    if (activePointerIdRef.current !== event.pointerId) return;
    appendPoint(point);
  };

  const releasePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    activePointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    finishStroke();
  };

  const visibleStrokes: PaintStroke[] = draft.length > 0
    ? [...strokes, { points: draft, color, size: brushSize, brush }]
    : strokes;

  return (
    <div className="touch-board-shell">
      <div className="touch-board-label">
        <span>누른 채 문지른 자리만 색이 남아요</span>
        <strong style={{ color: theme.accentColor }}>{artwork.name}</strong>
      </div>
      <svg
        ref={svgRef}
        className="touch-board touch-board--paint"
        viewBox={`${viewportOrigin} ${viewportOrigin} ${viewportSize} ${viewportSize}`}
        role="img"
        aria-label={`${artwork.name} 브러시 색칠판`}
        data-brush={brush}
        data-brush-size={brushSize}
        data-zoom={zoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={() => { if (activePointerIdRef.current === null) setCursor(null); }}
        style={{ background: theme.bgColor }}
      >
        <defs>
          <clipPath id={clipId}>
            {artwork.regions.map((region) => <path key={region.id} d={region.path} />)}
          </clipPath>
        </defs>
        <rect x="0" y="0" width="100" height="100" fill="#fffdf7" opacity="0.76" pointerEvents="none" />
        {artwork.regions.map((region) => (
          <path key={region.id} d={region.path} fill="#fffdf7" fillOpacity="0.98" stroke={theme.accentColor} strokeWidth="1.15" strokeLinejoin="round" pointerEvents="none" />
        ))}
        <g clipPath={`url(#${clipId})`} pointerEvents="none" data-testid="paint-layer">
          {visibleStrokes.map((stroke, index) => (
            <polyline
              key={`paint-stroke-${index}`}
              points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.size}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
        {artwork.regions.map((region) => (
          <path key={`outline-${region.id}`} d={region.path} fill="none" stroke="#263d35" strokeOpacity="0.72" strokeWidth="0.72" strokeLinejoin="round" pointerEvents="none" />
        ))}
        {cursor && (
          <circle className="touch-brush-cursor" cx={cursor.x * 100} cy={cursor.y * 100} r={brushSize / 2} fill={color} fillOpacity="0.2" stroke={color} strokeWidth="0.8" pointerEvents="none" />
        )}
      </svg>
      <p className="touch-board-hint">기본 원형 붓은 넓게, 가는 펜은 눈·무늬처럼 작은 곳에 써보세요.</p>
    </div>
  );
}
