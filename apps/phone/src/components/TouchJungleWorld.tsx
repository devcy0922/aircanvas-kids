import type { ArtworkPack, ThemePack } from '@ht/protocol';
import type { TouchPoint } from './TouchColoringBoard';

interface Props {
  artwork: ArtworkPack;
  theme: ThemePack;
  color: string;
  filledRegions: Set<string>;
  strokes?: TouchPoint[][];
  onBack: () => void;
  onNext: () => void;
}

/** 터치 모드에서도 내 캐릭터를 내보내는 결과 장면을 확인할 수 있다. */
export function TouchJungleWorld({ artwork, theme, color, filledRegions, strokes = [], onBack, onNext }: Props) {
  return (
    <main className="touch-world" data-testid="touch-world">
      <div className="touch-world__copy">
        <p className="touch-game__eyebrow">정글 탐험 시작</p>
        <h1>{artwork.name}가 정글에 도착했어요</h1>
        <p>내가 칠한 모습 그대로 덩굴 사이를 돌아다니고 있어요.</p>
      </div>
      <svg className="touch-world__scene" viewBox="0 0 120 100" role="img" aria-label="내 캐릭터가 돌아다니는 정글">
        <defs>
          <linearGradient id="touch-jungle-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9ed8a0" />
            <stop offset="1" stopColor={theme.bgColor} />
          </linearGradient>
        </defs>
        <rect width="120" height="100" fill="url(#touch-jungle-sky)" />
        <circle cx="91" cy="18" r="10" fill="#ffe28a" opacity="0.9" />
        <path d="M0 74 Q18 64 36 72 T72 70 T120 69 V100 H0 Z" fill="#2f6b4a" />
        <path d="M0 84 Q22 76 44 84 T86 80 T120 83 V100 H0 Z" fill="#1f503b" />
        <g fill="#204f39" opacity="0.92">
          <path d="M6 72 V32 Q6 24 12 20 Q18 24 18 32 V72 Z" />
          <path d="M96 72 V27 Q96 18 102 15 Q108 18 108 27 V72 Z" />
        </g>
        <g fill="#3a8051">
          <circle cx="5" cy="26" r="12" /><circle cx="17" cy="20" r="12" /><circle cx="104" cy="20" r="13" /><circle cx="115" cy="29" r="12" />
        </g>
        <g fill="none" stroke="#a3d36c" strokeWidth="1.5" opacity="0.8">
          <path d="M24 0 Q17 24 27 43 T22 72" />
          <path d="M86 0 Q94 22 84 43 T91 70" />
        </g>
        <g fill="#83b85a" opacity="0.8">
          <ellipse cx="25" cy="47" rx="5" ry="2" transform="rotate(-28 25 47)" />
          <ellipse cx="87" cy="48" rx="5" ry="2" transform="rotate(28 87 48)" />
          <ellipse cx="31" cy="56" rx="5" ry="2" transform="rotate(25 31 56)" />
        </g>
        <g transform="translate(-30 35)">
          <animateTransform attributeName="transform" type="translate" values="-30 35; 150 35; -30 35" dur="14s" repeatCount="indefinite" />
          <ellipse cx="50" cy="57" rx="14" ry="3" fill="#123b2d" opacity="0.38" />
          <svg x="32" y="25" width="36" height="36" viewBox={artwork.viewBox} overflow="visible">
            {artwork.regions.map((region) => (
              <path
                key={region.id}
                d={region.path}
                fill={filledRegions.has(region.id) ? color : '#f5ead8'}
                stroke="#263d35"
                strokeWidth="1.15"
                strokeLinejoin="round"
              />
            ))}
            {strokes.filter((points) => points.length > 1).map((points, index) => (
              <polyline
                key={`world-stroke-${index}`}
                points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </g>
        <g fill="#f4b37a">
          <circle cx="70" cy="80" r="1.2" /><circle cx="77" cy="75" r="1" /><circle cx="44" cy="82" r="1.1" />
        </g>
      </svg>
      <div className="touch-world__actions">
        <button className="big-btn" type="button" onClick={onNext}>다음 그림 색칠하기</button>
        <button className="btn-ghost" type="button" onClick={onBack}>다시 칠하기</button>
      </div>
    </main>
  );
}
