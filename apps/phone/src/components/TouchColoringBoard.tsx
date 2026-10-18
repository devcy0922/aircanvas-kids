import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';

export type TouchPoint = { x: number; y: number };
export type TouchMode = 'fill' | 'free';

interface Props {
  artwork: ArtworkPack;
  theme: ThemePack;
  mode: TouchMode;
  color: string;
  filledRegions: Set<string>;
  strokes: TouchPoint[][];
  onFillRegion: (regionId: string) => void;
  onStroke: (points: TouchPoint[]) => void;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function TouchColoringBoard({
  artwork,
  theme,
  mode,
  color,
  filledRegions,
  strokes,
  onFillRegion,
  onStroke,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const draftRef = useRef<TouchPoint[]>([]);
  const [draft, setDraft] = useState<TouchPoint[]>([]);

  const pointFromEvent = (event: PointerEvent<SVGSVGElement>): TouchPoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const finishStroke = () => {
    if (draftRef.current.length > 1) onStroke(draftRef.current);
    draftRef.current = [];
    setDraft([]);
  };

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (mode !== 'free' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    draftRef.current = [point];
    setDraft([point]);
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (mode !== 'free' || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    draftRef.current = [...draftRef.current, point];
    setDraft([...draftRef.current]);
  };

  return (
    <div className="touch-board-shell">
      <div className="touch-board-label">
        <span>{mode === 'fill' ? '빈 칸을 톡 눌러요' : '손가락으로 선을 그려요'}</span>
        <strong style={{ color: theme.accentColor }}>{artwork.name}</strong>
      </div>
      <svg
        ref={svgRef}
        className={`touch-board touch-board--${mode}`}
        viewBox={artwork.viewBox}
        role="img"
        aria-label={`${artwork.name} 터치 색칠판`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        style={{ background: theme.bgColor }}
      >
        <rect x="0" y="0" width="100" height="100" fill="#fffdf7" opacity="0.72" pointerEvents="none" />
        {artwork.regions.map((region) => (
          <path
            key={region.id}
            d={region.path}
            fill={filledRegions.has(region.id) ? color : '#fffdf7'}
            fillOpacity={filledRegions.has(region.id) ? 0.92 : 0.98}
            stroke={theme.accentColor}
            strokeWidth="1.2"
            strokeLinejoin="round"
            onPointerDown={mode === 'fill' ? (event) => {
              event.stopPropagation();
              onFillRegion(region.id);
            } : undefined}
          />
        ))}
        {[...strokes, draft].filter((points) => points.length > 1).map((points, index) => (
          <polyline
            key={`stroke-${index}`}
            points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
      </svg>
      <p className="touch-board-hint">손가락으로 색을 고르고, 그림을 눌러 바로 칠해보세요.</p>
    </div>
  );
}
