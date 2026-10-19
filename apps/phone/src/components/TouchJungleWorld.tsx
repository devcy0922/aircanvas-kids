import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import type { WorldCreation } from './TouchColoringGame';

interface Props {
  theme: ThemePack;
  artworks: ArtworkPack[];
  creations: WorldCreation[];
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
}

type RouteState = { route: number; reverse: boolean };

function JungleWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-jungle-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9d5ad" /><stop offset="0.5" stopColor="#dce5a6" /><stop offset="1" stopColor="#4a7048" />
        </linearGradient>
        <radialGradient id="world-jungle-light" cx="50%" cy="0" r="85%">
          <stop stopColor="#fff4a9" stopOpacity="0.7" /><stop offset="1" stopColor="#fff4a9" stopOpacity="0" />
        </radialGradient>
        <filter id="world-mist"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect width="160" height="96" fill="url(#world-jungle-sky)" />
      <rect width="160" height="96" fill="url(#world-jungle-light)" />
      <circle cx="124" cy="16" r="9" fill="#ffdf82" opacity="0.82" />
      <path d="M0 43 Q20 29 39 43 Q57 22 80 43 Q102 20 127 43 Q145 28 160 40 V96 H0Z" fill="#6d9060" opacity="0.7" />
      <path d="M0 57 Q22 44 43 56 T86 54 T128 55 T171 52 V96 H0Z" fill="#3e6b4c" />
      <path d="M0 72 Q29 61 55 70 T108 67 T160 70 V96 H0Z" fill="#224a38" />
      <path d="M0 85 Q34 76 76 84 T160 80 V96 H0Z" fill="#15372c" />
      <g filter="url(#world-mist)" fill="#fffbd9" opacity="0.2"><ellipse cx="46" cy="56" rx="30" ry="5" /><ellipse cx="122" cy="49" rx="26" ry="4" /></g>
      <g className="world-tree">
        <path d="M10 76 Q7 46 15 9 Q23 31 20 76Z" fill="#513e29" />
        <path d="M16 38 Q30 28 35 10 M16 45 Q5 34 2 18" fill="none" stroke="#513e29" strokeWidth="4" />
        <g fill="#245b3c"><circle cx="3" cy="15" r="14" /><circle cx="29" cy="11" r="17" /><circle cx="14" cy="3" r="15" /></g>
      </g>
      <g className="world-birds" fill="none" stroke="#244432" strokeWidth="0.8"><path d="M70 20 q4 -4 8 0 q4 -4 8 0" /><path d="M91 13 q3 -3 6 0 q3 -3 6 0" /></g>
    </>
  );
}

function OceanWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-ocean-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#72d8db" /><stop offset="0.45" stopColor="#167f9f" /><stop offset="1" stopColor="#052f55" />
        </linearGradient>
        <linearGradient id="world-ocean-ray" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#effff7" stopOpacity="0.48" /><stop offset="1" stopColor="#effff7" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="160" height="96" fill="url(#world-ocean-water)" />
      <path d="M12 0 H47 L78 82 H58Z M70 0 H91 L112 76 H94Z" fill="url(#world-ocean-ray)" />
      <path d="M0 82 Q28 75 54 83 T106 79 T160 82 V96 H0Z" fill="#c9b16f" />
      <path d="M0 90 Q38 83 80 91 T160 87 V96 H0Z" fill="#9b8956" opacity="0.65" />
      <g className="world-bubbles" fill="none" stroke="#dffcfb" strokeWidth="0.8" opacity="0.7"><circle cx="19" cy="65" r="2" /><circle cx="22" cy="54" r="1" /><circle cx="132" cy="46" r="2.4" /><circle cx="137" cy="35" r="1.2" /></g>
      <g transform="translate(76 18)" className="world-jelly">
        <path d="M0 9 Q1 -2 10 -2 Q19 -2 20 9 Q15 13 10 10 Q5 13 0 9Z" fill="#ddb4ec" opacity="0.75" />
        <path d="M4 10 Q1 18 5 24 M10 11 Q7 20 11 28 M16 10 Q13 17 17 23" fill="none" stroke="#f0dbf8" strokeWidth="1.2" />
      </g>
      <g transform="translate(9 72)" fill="none" strokeLinecap="round" className="world-coral"><path d="M0 22 Q2 8 0 1 M2 13 L9 6 M1 17 L-5 10" stroke="#ef765e" strokeWidth="3" /><path d="M20 22 Q20 10 26 3 M22 14 L16 8 M24 9 L31 7" stroke="#f0c05a" strokeWidth="2.6" /></g>
      <g className="world-seagrass" fill="none" stroke="#4db080" strokeWidth="2"><path d="M55 96 Q49 81 56 72 M59 96 Q66 82 62 70 M145 96 Q139 80 146 72 M151 96 Q157 82 154 69" /></g>
    </>
  );
}

function behaviorFor(artwork: ArtworkPack) {
  const id = artwork.id;
  if (id.includes('trex')) return 'stomp';
  if (id.includes('brachio')) return 'longneck';
  if (id.includes('stego')) return 'armored';
  if (id.includes('dolphin') || id.includes('whale')) return 'breach';
  if (id.includes('octopus') || id.includes('jelly')) return 'pulse';
  if (id.includes('crab')) return 'scuttle';
  if (id.includes('turtle')) return 'glide';
  if (id.includes('seahorse')) return 'hover';
  return id.startsWith('ocean-') ? 'swim' : 'walk';
}

function partClass(label: string) {
  if (/꼬리/.test(label)) return 'tail';
  if (/다리|발|집게|촉수/.test(label)) return 'limb';
  if (/지느러미/.test(label)) return 'fin';
  if (/목|머리|턱/.test(label)) return 'head';
  return 'body';
}

function Creature({ creation, artwork, route, onRouteEnd }: { creation: WorldCreation; artwork: ArtworkPack; route: RouteState; onRouteEnd: () => void }) {
  const rawId = useId().replace(/:/g, '');
  const clipId = `creature-paint-${rawId}`;
  const shadeId = `creature-shade-${rawId}`;
  const behavior = behaviorFor(artwork);
  const duration = 8 + (creation.routeSeed % 5);
  const initialProgress = 0.28 + (creation.routeSeed % 37) / 100;

  return (
    <g
      className={`world-creature world-route-${route.route} ${route.reverse ? 'is-reverse' : ''}`}
      style={{ '--world-duration': `${duration}s`, '--world-delay': `${-(duration * initialProgress)}s` } as CSSProperties}
      data-artwork={artwork.id}
      data-route={route.route + 1}
      onAnimationIteration={(event) => { if (event.target === event.currentTarget) onRouteEnd(); }}
    >
      <ellipse className="world-creature__shadow" cx="50" cy="91" rx="28" ry="5" fill="#071c1b" opacity="0.28" />
      <g className={`world-creature__body behavior-${behavior}`}>
        <defs>
          <clipPath id={clipId}>{artwork.regions.map((region) => <path key={region.id} d={region.path} />)}</clipPath>
          <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity="0.5" /><stop offset="0.42" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#102c29" stopOpacity="0.28" /></linearGradient>
        </defs>
        <g className="world-creature__depth" transform="translate(2 3)">{artwork.regions.map((region) => <path key={region.id} d={region.path} fill="#132f2c" opacity="0.44" />)}</g>
        {artwork.regions.map((region) => <path key={region.id} className={`world-creature__part part-${partClass(region.label)}`} d={region.path} fill={creation.filledRegionIds?.includes(region.id) ? creation.color : '#f4ead2'} stroke="#173b35" strokeWidth="1.1" strokeLinejoin="round" />)}
        <g clipPath={`url(#${clipId})`} pointerEvents="none">
          {creation.paintStrokes.map((stroke, index) => <polyline key={index} points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')} fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />)}
          <rect width="100" height="100" fill={`url(#${shadeId})`} />
        </g>
      </g>
      <g className="world-creature__trail" fill={creation.themeId === 'ocean' ? '#d9fbfa' : '#d5bd79'}><circle cx="3" cy="78" r="1.6" /><circle cx="-3" cy="82" r="1" /><circle cx="-8" cy="76" r="0.7" /></g>
    </g>
  );
}

/** 같은 룸에서 만든 생물을 보존하고 다섯 원근 경로로 계속 탐험시킨다. */
export function TouchJungleWorld({ theme, artworks, creations, onBack, onNext, onReset }: Props) {
  const isOcean = theme.id === 'ocean';
  const worldName = isOcean ? '바다' : '정글';
  const artworkMap = useMemo(() => new Map(artworks.map((artwork) => [artwork.id, artwork])), [artworks]);
  const [routes, setRoutes] = useState<Record<string, RouteState>>(() => Object.fromEntries(creations.map((creation) => [creation.id, { route: creation.routeSeed % 5, reverse: creation.routeSeed % 2 === 0 }])));

  useEffect(() => {
    setRoutes((current) => {
      const next = { ...current };
      creations.forEach((creation) => { if (!next[creation.id]) next[creation.id] = { route: creation.routeSeed % 5, reverse: creation.routeSeed % 2 === 0 }; });
      return next;
    });
  }, [creations]);

  const chooseNextRoute = (creationId: string) => {
    setRoutes((current) => {
      const previous = current[creationId] ?? { route: 0, reverse: false };
      return { ...current, [creationId]: { route: (previous.route + 1 + Math.floor(Math.random() * 4)) % 5, reverse: Math.random() > 0.5 } };
    });
  };

  return (
    <main className={`touch-world touch-world--${isOcean ? 'ocean' : 'jungle'}`} data-testid="touch-world" data-world={isOcean ? 'ocean' : 'jungle'}>
      <div className="touch-world__copy">
        <p className="touch-game__eyebrow">{worldName} 탐험 중</p>
        <h1>내가 만든 생물이 살아 움직여요</h1>
        <p>다섯 갈래 길을 매번 다르게 골라, 자기 방식대로 {isOcean ? '헤엄치고 떠올라요.' : '걷고 목을 뻗고 꼬리를 휘둘러요.'}</p>
        <div className="touch-world__room" aria-live="polite"><strong>{creations.length}</strong><span>이 룸에서 함께 탐험 중</span></div>
      </div>
      <svg className="touch-world__scene" viewBox="0 0 160 96" role="img" aria-label={`내가 만든 생물이 무작위 경로로 움직이는 ${worldName}`}>
        {isOcean ? <OceanWorld /> : <JungleWorld />}
        {[0, 1, 2, 3, 4].map((routeIndex) => <g key={routeIndex} className={`world-depth-layer world-depth-layer--${routeIndex}`}>
          {creations.filter((creation) => routes[creation.id]?.route === routeIndex).map((creation) => {
            const artwork = artworkMap.get(creation.artworkId);
            return artwork ? <Creature key={creation.id} creation={creation} artwork={artwork} route={routes[creation.id]} onRouteEnd={() => chooseNextRoute(creation.id)} /> : null;
          })}
        </g>)}
        <path className="world-front-leaves" d="M0 96 V82 Q8 72 13 94 Q18 78 26 73 Q24 90 31 96 M160 96 V78 Q151 73 149 93 Q143 78 136 75 Q139 90 131 96" fill={isOcean ? '#236f68' : '#2f6c42'} />
      </svg>
      <div className="touch-world__actions">
        <button className="big-btn" type="button" onClick={onNext}>다른 친구 만들기</button>
        <button className="btn-ghost" type="button" onClick={onBack}>이 그림 더 칠하기</button>
        <button className="btn-reset-world" type="button" onClick={onReset}>모두 지우고 새로 그리기</button>
      </div>
    </main>
  );
}
