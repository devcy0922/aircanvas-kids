import { useId, useState } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import type { PaintStroke, TouchPoint } from './TouchColoringBoard';

interface Props {
  artwork: ArtworkPack;
  theme: ThemePack;
  color: string;
  filledRegions: Set<string>;
  strokes?: TouchPoint[][];
  paintStrokes?: PaintStroke[];
  onBack: () => void;
  onNext: () => void;
}

function JungleWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-jungle-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9bcf9b" />
          <stop offset="0.55" stopColor="#dbe6a3" />
          <stop offset="1" stopColor="#526f42" />
        </linearGradient>
        <filter id="world-mist"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="160" height="96" fill="url(#world-jungle-sky)" />
      <circle cx="124" cy="17" r="10" fill="#ffdf82" opacity="0.82" />
      <path d="M0 49 Q20 31 39 46 Q57 25 80 46 Q102 23 127 46 Q145 31 160 43 V96 H0Z" fill="#57794f" opacity="0.72" />
      <path d="M0 63 Q22 49 43 61 T86 59 T128 60 T171 57 V96 H0Z" fill="#315a43" />
      <path d="M0 78 Q29 67 55 77 T108 73 T160 76 V96 H0Z" fill="#193e31" />
      <g className="world-mist" filter="url(#world-mist)" fill="#f7f3d3" opacity="0.18">
        <ellipse cx="46" cy="58" rx="30" ry="5" /><ellipse cx="122" cy="52" rx="26" ry="4" />
      </g>
      <g className="world-tree world-tree--left">
        <path d="M10 72 Q7 46 15 11 Q23 31 20 72Z" fill="#5a4931" />
        <path d="M16 38 Q30 28 35 11 M16 45 Q5 34 2 20" fill="none" stroke="#5a4931" strokeWidth="4" />
        <g fill="#2e6542"><circle cx="3" cy="17" r="14" /><circle cx="29" cy="12" r="17" /><circle cx="14" cy="4" r="15" /></g>
      </g>
      <g className="world-tree world-tree--right">
        <path d="M145 75 Q141 44 148 13 Q157 38 154 75Z" fill="#5a4931" />
        <g fill="#2c6040"><circle cx="143" cy="12" r="16" /><circle cx="158" cy="20" r="14" /></g>
      </g>
      <g transform="translate(26 59)"><g className="world-neighbor world-neighbor--stego">
        <path d="M0 12 Q5 1 18 3 Q29 3 33 12 Q27 18 9 17Z" fill="#7caf62" stroke="#233f31" strokeWidth="0.8" />
        <path d="M7 4 L11 -3 L15 4 L20 -4 L24 5" fill="#e1a34f" stroke="#233f31" strokeWidth="0.7" />
        <path d="M29 10 L40 5 L34 14Z" fill="#7caf62" />
        <path d="M8 16 V24 M25 16 V24" stroke="#233f31" strokeWidth="3" />
      </g></g>
      <g transform="translate(119 42)"><g className="world-neighbor world-neighbor--brachio">
        <path d="M0 18 Q4 8 18 10 Q25 12 24 21 H3Z" fill="#6b9d77" stroke="#233f31" strokeWidth="0.8" />
        <path d="M17 12 Q19 -2 27 -7 Q33 -8 33 -3 Q29 2 25 15Z" fill="#6b9d77" stroke="#233f31" strokeWidth="0.8" />
        <path d="M6 20 V31 M20 20 V31" stroke="#314d38" strokeWidth="3" />
        <circle cx="29" cy="-4" r="0.8" fill="#17291f" />
      </g></g>
      <g className="world-birds" fill="none" stroke="#2b4937" strokeWidth="0.8">
        <path d="M70 20 q4 -4 8 0 q4 -4 8 0" /><path d="M91 13 q3 -3 6 0 q3 -3 6 0" />
      </g>
      <g className="world-foreground" fill="#4f8750">
        <path d="M0 96 V75 Q7 78 9 91 Q12 71 18 69 Q18 84 21 96Z" />
        <path d="M160 96 V73 Q151 79 150 92 Q145 73 140 71 Q142 86 138 96Z" />
      </g>
    </>
  );
}

function OceanWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-ocean-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#62c9d2" />
          <stop offset="0.48" stopColor="#197f9f" />
          <stop offset="1" stopColor="#083d62" />
        </linearGradient>
        <linearGradient id="world-ocean-ray" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#e8fff4" stopOpacity="0.42" /><stop offset="1" stopColor="#e8fff4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="160" height="96" fill="url(#world-ocean-water)" />
      <path d="M16 0 L47 0 L79 80 L59 80Z M71 0 L91 0 L111 72 L95 72Z" fill="url(#world-ocean-ray)" />
      <path d="M0 84 Q28 78 54 85 T106 82 T160 84 V96 H0Z" fill="#d3b879" />
      <g className="world-bubbles" fill="none" stroke="#dffcfb" strokeWidth="0.8" opacity="0.65">
        <circle cx="19" cy="62" r="2" /><circle cx="22" cy="53" r="1" /><circle cx="132" cy="43" r="2.4" /><circle cx="137" cy="34" r="1.2" />
      </g>
      <g transform="translate(22 31)"><g className="world-neighbor world-neighbor--fish">
        <path d="M0 7 Q8 -2 18 3 Q25 7 18 12 Q8 16 0 7Z" fill="#f5bd51" stroke="#163d51" strokeWidth="0.7" />
        <path d="M19 7 L29 1 L27 13Z" fill="#e67657" /><circle cx="5" cy="5" r="1" fill="#173543" />
      </g></g>
      <g transform="translate(111 58)"><g className="world-neighbor world-neighbor--turtle">
        <ellipse cx="13" cy="8" rx="12" ry="7" fill="#6fb58c" stroke="#173f4f" strokeWidth="0.8" />
        <path d="M4 5 L-5 0 L0 8 M6 12 L0 18 M20 5 L28 1 L25 9 M20 12 L27 17" fill="#79c39a" stroke="#173f4f" strokeWidth="0.8" />
        <circle cx="27" cy="8" r="3.6" fill="#79c39a" /><circle cx="28" cy="7" r="0.6" fill="#173543" />
        <path d="M8 3 L17 13 M17 3 L8 13" stroke="#3d8066" strokeWidth="0.8" />
      </g></g>
      <g transform="translate(77 18)"><g className="world-neighbor world-neighbor--jelly">
        <path d="M0 9 Q1 -2 10 -2 Q19 -2 20 9 Q15 13 10 10 Q5 13 0 9Z" fill="#d6a7e8" opacity="0.82" />
        <path d="M4 10 Q1 18 5 24 M10 11 Q7 20 11 28 M16 10 Q13 17 17 23" fill="none" stroke="#ead0f5" strokeWidth="1.2" />
      </g></g>
      <g transform="translate(10 72)" fill="none" strokeLinecap="round"><g className="world-coral">
        <path d="M0 22 Q2 8 0 1 M2 13 L9 6 M1 17 L-5 10" stroke="#ef765e" strokeWidth="3" />
        <path d="M20 22 Q20 10 26 3 M22 14 L16 8 M24 9 L31 7" stroke="#f0c05a" strokeWidth="2.6" />
      </g></g>
      <g className="world-seagrass" fill="none" stroke="#4ca77d" strokeWidth="2">
        <path d="M55 96 Q49 81 56 72 M59 96 Q66 82 62 70 M145 96 Q139 80 146 72 M151 96 Q157 82 154 69" />
      </g>
    </>
  );
}

/** 단일 기기 터치 결과를 테마별 생태 장면에서 여섯 번 보여준다. */
export function TouchJungleWorld({ artwork, theme, color, filledRegions, strokes = [], paintStrokes = [], onBack, onNext }: Props) {
  const [pass, setPass] = useState(1);
  const isOcean = theme.id === 'ocean';
  const worldName = isOcean ? '바다' : '정글';
  const clipId = `world-paint-${useId().replace(/:/g, '')}`;

  return (
    <main className={`touch-world touch-world--${isOcean ? 'ocean' : 'jungle'}`} data-testid="touch-world" data-world={isOcean ? 'ocean' : 'jungle'}>
      <div className="touch-world__copy">
        <p className="touch-game__eyebrow">{worldName} 탐험 시작</p>
        <h1>{artwork.name}가 {worldName}에 도착했어요</h1>
        <p>주변 친구들이 내가 만든 캐릭터를 발견했어요. 여섯 번 지나가며 인사해요.</p>
        <div className="touch-world__pass" data-testid="world-pass" aria-live="polite">
          <span>{Math.min(pass, 6)} / 6번째 만남</span>
          <i><b style={{ width: `${(Math.min(pass, 6) / 6) * 100}%` }} /></i>
        </div>
      </div>
      <svg className="touch-world__scene" viewBox="0 0 160 96" role="img" aria-label={`내 캐릭터가 여섯 번 지나가는 ${worldName}`}>
        {isOcean ? <OceanWorld /> : <JungleWorld />}
        <defs>
          <clipPath id={clipId}>{artwork.regions.map((region) => <path key={region.id} d={region.path} />)}</clipPath>
        </defs>
        <g
          className={`world-hero world-hero--${isOcean ? 'swim' : 'walk'}`}
          onAnimationIteration={(event) => {
            if (event.target === event.currentTarget) setPass((current) => Math.min(6, current + 1));
          }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setPass(6);
          }}
        >
          <ellipse className="world-hero__shadow" cx="18" cy="76" rx="12" ry="2.5" fill="#102f2a" opacity="0.3" />
          <g transform={isOcean ? 'translate(0 27) scale(.62)' : 'translate(0 35) scale(.48)'}><g className="world-hero__body">
            {artwork.regions.map((region) => {
              const movingPart = /다리|발|지느러미|꼬리/.test(region.label);
              return (
                <path
                  key={region.id}
                  className={movingPart ? 'world-hero__limb' : undefined}
                  d={region.path}
                  fill={filledRegions.has(region.id) ? color : '#f4ead2'}
                  stroke="#19372f"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              );
            })}
            <g clipPath={`url(#${clipId})`} pointerEvents="none">
              {paintStrokes.map((stroke, index) => (
                <polyline key={`world-paint-${index}`} points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {strokes.filter((points) => points.length > 1).map((points, index) => (
                <polyline key={`world-stroke-${index}`} points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
          </g></g>
          {isOcean
            ? <g className="world-hero__trail" fill="#d9fbfa"><circle cx="2" cy="59" r="1.4" /><circle cx="-3" cy="54" r="0.8" /></g>
            : <g className="world-hero__trail" fill="#d5bd79"><circle cx="5" cy="79" r="1.4" /><circle cx="0" cy="78" r="0.9" /></g>}
        </g>
      </svg>
      <div className="touch-world__actions">
        <button className="big-btn" type="button" onClick={onNext}>다음 그림 색칠하기</button>
        <button className="btn-ghost" type="button" onClick={onBack}>다시 칠하기</button>
      </div>
    </main>
  );
}
