import { useId, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import { sound } from '../lib/sound';

export type TouchPoint = { x: number; y: number };
export type TouchMode = 'fill' | 'brush' | 'free';
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
  mode: TouchMode;
  brush: BrushKind;
  brushSize: number;
  zoom?: number;
  strokes: PaintStroke[];
  filledRegions: Record<string, string>;
  onStroke: (stroke: PaintStroke) => void;
  onFillRegion: (regionId: string, color: string) => void;
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

export function estimatePaintCoverage(
  artwork: ArtworkPack,
  strokes: PaintStroke[],
  filledRegions: Record<string, string> = {}
): number {
  const totalRegions = artwork.regions.length;
  if (totalRegions === 0) return 0;

  // 채워진 영역 비율 (50% 가중치)
  const filledCount = Object.keys(filledRegions).length;
  const fillRatio = filledCount / totalRegions;

  // 브러시 스트로크 비율 (50% 가중치)
  let brushRatio = 0;
  if (strokes.length > 0) {
    const totalPoints = strokes.reduce((acc, s) => acc + s.points.length, 0);
    brushRatio = Math.min(1, totalPoints / 120);
  }

  return Math.min(1, fillRatio * 0.7 + brushRatio * 0.3);
}

export function TouchColoringBoard({
  artwork,
  theme,
  color,
  mode,
  brush,
  brushSize,
  zoom = 1,
  strokes,
  filledRegions,
  onStroke,
  onFillRegion,
}: Props) {
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
    if (draftRef.current.length > 0) {
      onStroke({ points: draftRef.current, color, size: brushSize, brush });
      sound.playPop();
    }
    draftRef.current = [];
    setDraft([]);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (mode === 'brush') {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      activePointerIdRef.current = event.pointerId;
      const point = pointFromEvent(event);
      setCursor(point);
      draftRef.current = [point];
      setDraft([point]);
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = pointFromEvent(event);
    setCursor(point);
    if (mode === 'brush' && activePointerIdRef.current === event.pointerId) {
      appendPoint(point);
    }
  };

  const releasePointer = (event: PointerEvent<SVGSVGElement>) => {
    if (mode === 'brush') {
      if (activePointerIdRef.current !== event.pointerId) return;
      activePointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishStroke();
    }
  };

  const handleRegionTrigger = (regionId: string, event: React.MouseEvent) => {
    if (mode === 'fill') {
      event.preventDefault();
      event.stopPropagation();
      sound.playFill();
      onFillRegion(regionId, color);
    }
  };

  const visibleStrokes: PaintStroke[] =
    draft.length > 0 ? [...strokes, { points: draft, color, size: brushSize, brush }] : strokes;

  return (
    <div className="touch-board-shell" style={{ position: 'relative' }}>
      <div className="touch-board-label">
        <span>
          {mode === 'fill' ? '🎨 영역을 탭하면 물방울처럼 색이 퐁퐁 차올라요!' : '🖌️ 원하는 곳을 자유롭게 쓱쓱 문질러 칠해요!'}
        </span>
        <strong style={{ color: theme.accentColor }}>{artwork.name}</strong>
      </div>

      <svg
        ref={svgRef}
        className={`touch-board touch-board--paint mode-${mode}`}
        viewBox={`${viewportOrigin} ${viewportOrigin} ${viewportSize} ${viewportSize}`}
        role="img"
        aria-label={`${artwork.name} 색칠판`}
        data-mode={mode}
        data-brush={brush}
        data-brush-size={brushSize}
        data-zoom={zoom}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={() => setCursor(null)}
        style={{ cursor: mode === 'fill' ? 'pointer' : 'crosshair', touchAction: 'none' }}
      >
        <defs>
          <clipPath id={clipId}>
            {artwork.regions.map((region) => (
              <path key={region.id} d={region.path} />
            ))}
          </clipPath>
        </defs>

        {/* 배경 베이스 실루엣 */}
        <g className="touch-board__base" fill={theme.bgColor}>
          {artwork.regions.map((region) => (
            <path key={region.id} d={region.path} />
          ))}
        </g>

        {/* 채워진 영역(Fill) 레이어 */}
        <g className="touch-board__fills">
          {artwork.regions.map((region) => {
            const fillColor = filledRegions[region.id] || '#ffffff';
            return (
              <path
                key={region.id}
                id={`region-${region.id}`}
                d={region.path}
                fill={fillColor}
                stroke={mode === 'fill' ? '#abbac2' : '#d2dbe0'}
                strokeWidth={mode === 'fill' ? '0.3' : '0.2'}
                className={`touch-region ${filledRegions[region.id] ? 'is-filled' : ''}`}
                onClick={(e) => handleRegionTrigger(region.id, e)}
              />
            );
          })}
        </g>

        {/* 브러시 자유 덧칠(Brush) 레이어 */}
        <g clipPath={`url(#${clipId})`} pointerEvents="none" data-testid="paint-layer">
          {visibleStrokes.map((stroke, index) => (
            <polyline
              key={index}
              points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.size}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={stroke.brush === 'pen' ? 0.9 : 0.82}
            />
          ))}
        </g>

        {/* 고품질 일러스트 / 라인아트 오버레이 */}
        {artwork.imageUrl && (
          <image
            href={artwork.imageUrl}
            x="0"
            y="0"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid meet"
            pointerEvents="none"
            style={{ mixBlendMode: 'multiply' }}
          />
        )}

        {/* 외곽선 라인아트 (최상단) */}
        <g className="touch-board__outline" fill="none" stroke="#1c2c28" strokeWidth="0.45" strokeOpacity="0.6" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
          {artwork.regions.map((region) => (
            <path key={region.id} d={region.path} />
          ))}
        </g>

        {/* 브러시 커서 프리뷰 */}
        {mode === 'brush' && cursor && (
          <circle
            cx={cursor.x * 100}
            cy={cursor.y * 100}
            r={brushSize / 2}
            fill={color}
            opacity="0.5"
            stroke="#ffffff"
            strokeWidth="0.8"
            pointerEvents="none"
          />
        )}
      </svg>
    </div>
  );
}
