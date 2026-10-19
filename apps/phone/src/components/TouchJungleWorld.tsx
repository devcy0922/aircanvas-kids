import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import type { WorldCreation } from './TouchColoringGame';
import { sound } from '../lib/sound';

interface Props {
  theme: ThemePack;
  artworks: ArtworkPack[];
  creations: WorldCreation[];
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
}

type RouteState = { route: number; reverse: boolean };

interface WorldParticle {
  id: number;
  x: number;
  y: number;
  emoji: string;
}

/** 공룡 백악기 월드 씬: 웅장한 화산, 불씨, 선사시대 식물, 날아다니는 익룡 */
function DinoWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-dino-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb07c" />
          <stop offset="45%" stopColor="#f77f00" />
          <stop offset="100%" stopColor="#432818" />
        </linearGradient>
        <radialGradient id="world-dino-sun" cx="30%" cy="40%" r="50%">
          <stop stopColor="#fff3b0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f77f00" stopOpacity="0" />
        </radialGradient>
        <filter id="dino-glow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* 붉은 노을 하늘 */}
      <rect width="160" height="96" fill="url(#world-dino-sky)" />
      <circle cx="48" cy="30" r="14" fill="url(#world-dino-sun)" />
      {/* 먼 산 & 거대 화산 */}
      <path d="M10 52 L36 28 L48 28 L72 54 Z" fill="#6f1d1b" />
      {/* 화산 분화구 용암 빛 */}
      <ellipse cx="42" cy="28" rx="6" ry="1.5" fill="#ffe66d" filter="url(#dino-glow)" />
      {/* 화산 연기 뭉게구름 */}
      <g fill="#ffe6a7" opacity="0.45" className="dino-smoke">
        <circle cx="42" cy="22" r="3.5" />
        <circle cx="45" cy="16" r="4.5" />
        <circle cx="41" cy="10" r="6" />
        <circle cx="47" cy="5" r="7.5" />
      </g>
      {/* 하늘을 나는 작은 익룡 실루엣 */}
      <g className="world-ptera-flight" fill="#370617" opacity="0.6">
        <path d="M110 14 Q116 10 120 14 Q124 10 130 14 Q124 16 120 15 Q116 16 110 14 Z" />
      </g>
      {/* 중간 지형 레이어 */}
      <path d="M0 48 Q30 38 65 48 T130 46 T160 48 V96 H0 Z" fill="#7f4f24" opacity="0.75" />
      <path d="M0 60 Q35 52 75 60 T160 58 V96 H0 Z" fill="#582f0e" />
      <path d="M0 74 Q40 68 85 75 T160 72 V96 H0 Z" fill="#331800" />
      {/* 거대 고사리 식물 (Cycad & Ferns) */}
      <g className="world-cycad" transform="translate(138, 52)" fill="none" stroke="#606c38" strokeWidth="1.2">
        <path d="M0 24 Q-12 12 -20 16 M0 24 Q-8 8 -12 2 M0 24 Q4 6 12 4 M0 24 Q10 14 16 20" strokeLinecap="round" />
        <path d="M0 24 L0 44" stroke="#432818" strokeWidth="2.5" />
      </g>
      <g className="world-cycad-left" transform="translate(14, 58)" fill="none" stroke="#283618" strokeWidth="1.2">
        <path d="M0 20 Q-10 8 -16 12 M0 20 Q-4 4 -6 0 M0 20 Q6 6 12 2 M0 20 Q10 12 14 18" strokeLinecap="round" />
        <path d="M0 20 L0 38" stroke="#331800" strokeWidth="2.5" />
      </g>
      {/* 은은한 주황빛 안개 */}
      <rect width="160" height="96" fill="#ff7b00" opacity="0.06" />
    </>
  );
}

/** 신비로운 정글 월드 씬: 폭포, 거대 나뭇잎, 반딧불이 */
function JungleWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-jungle-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a9d5ad" />
          <stop offset="0.5" stopColor="#dce5a6" />
          <stop offset="1" stopColor="#4a7048" />
        </linearGradient>
        <radialGradient id="world-jungle-light" cx="50%" cy="0" r="85%">
          <stop stopColor="#fff4a9" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff4a9" stopOpacity="0" />
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
      <g filter="url(#world-mist)" fill="#fffbd9" opacity="0.2">
        <ellipse cx="46" cy="56" rx="30" ry="5" />
        <ellipse cx="122" cy="49" rx="26" ry="4" />
      </g>
      <g className="world-tree">
        <path d="M10 76 Q7 46 15 9 Q23 31 20 76Z" fill="#513e29" />
        <path d="M16 38 Q30 28 35 10 M16 45 Q5 34 2 18" fill="none" stroke="#513e29" strokeWidth="4" />
        <g fill="#245b3c">
          <circle cx="3" cy="15" r="14" />
          <circle cx="29" cy="11" r="17" />
          <circle cx="14" cy="3" r="15" />
        </g>
      </g>
      <g className="world-birds" fill="none" stroke="#244432" strokeWidth="0.8">
        <path d="M70 20 q4 -4 8 0 q4 -4 8 0" />
        <path d="M91 13 q3 -3 6 0 q3 -3 6 0" />
      </g>
      {/* 반짝이는 반딧불이 */}
      <g className="world-fireflies" fill="#ffeaa7" opacity="0.8">
        <circle cx="48" cy="62" r="1.2" />
        <circle cx="95" cy="54" r="1.5" />
        <circle cx="140" cy="68" r="1.1" />
      </g>
    </>
  );
}

/** 깊고 맑은 바다 산호초 월드 씬: 햇살 광선, 기포, 산호 */
function OceanWorld() {
  return (
    <>
      <defs>
        <linearGradient id="world-ocean-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#72d8db" />
          <stop offset="0.45" stopColor="#167f9f" />
          <stop offset="1" stopColor="#052f55" />
        </linearGradient>
        <linearGradient id="world-ocean-ray" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#effff7" stopOpacity="0.48" />
          <stop offset="1" stopColor="#effff7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="160" height="96" fill="url(#world-ocean-water)" />
      <path d="M12 0 H47 L78 82 H58Z M70 0 H91 L112 76 H94Z" fill="url(#world-ocean-ray)" />
      <path d="M0 82 Q28 75 54 83 T106 79 T160 82 V96 H0Z" fill="#c9b16f" />
      <path d="M0 90 Q38 83 80 91 T160 87 V96 H0Z" fill="#9b8956" opacity="0.65" />
      <g className="world-bubbles" fill="none" stroke="#dffcfb" strokeWidth="0.8" opacity="0.7">
        <circle cx="19" cy="65" r="2" />
        <circle cx="22" cy="54" r="1" />
        <circle cx="132" cy="46" r="2.4" />
        <circle cx="137" cy="35" r="1.2" />
      </g>
      <g transform="translate(76 18)" className="world-jelly">
        <path d="M0 9 Q1 -2 10 -2 Q19 -2 20 9 Q15 13 10 10 Q5 13 0 9Z" fill="#ddb4ec" opacity="0.75" />
        <path d="M4 10 Q1 18 5 24 M10 11 Q7 20 11 28 M16 10 Q13 17 17 23" fill="none" stroke="#f0dbf8" strokeWidth="1.2" />
      </g>
      <g transform="translate(9 72)" fill="none" strokeLinecap="round" className="world-coral">
        <path d="M0 22 Q2 8 0 1 M2 13 L9 6 M1 17 L-5 10" stroke="#ef765e" strokeWidth="3" />
        <path d="M20 22 Q20 10 26 3 M22 14 L16 8 M24 9 L31 7" stroke="#f0c05a" strokeWidth="2.6" />
      </g>
      <g className="world-seagrass" fill="none" stroke="#4db080" strokeWidth="2">
        <path d="M55 96 Q49 81 56 72 M59 96 Q66 82 62 70 M145 96 Q139 80 146 72 M151 96 Q157 82 154 69" />
      </g>
    </>
  );
}

function behaviorFor(artwork: ArtworkPack) {
  const id = artwork.id;
  if (id.includes('trex')) return 'stomp';
  if (id.includes('brachio')) return 'longneck';
  if (id.includes('stego') || id.includes('trike')) return 'armored';
  if (id.includes('ptera')) return 'glide';
  if (id.includes('dolphin') || id.includes('whale')) return 'breach';
  if (id.includes('octopus') || id.includes('jelly')) return 'pulse';
  if (id.includes('fish')) return 'swim';
  return id.startsWith('ocean-') ? 'swim' : 'walk';
}

function partClass(label: string) {
  if (/꼬리/.test(label)) return 'tail';
  if (/다리|발|정강이|먼발|굽|앞발/.test(label)) return 'limb';
  if (/지느러미|날개/.test(label)) return 'fin';
  if (/목|머리|턱|부리|얼굴|주둥이/.test(label)) return 'head';
  return 'body';
}

function Creature({
  creation,
  artwork,
  route,
  onRouteEnd,
  onPet
}: {
  creation: WorldCreation;
  artwork: ArtworkPack;
  route: RouteState;
  onRouteEnd: () => void;
  onPet: (x: number, y: number) => void;
}) {
  const rawId = useId().replace(/:/g, '');
  const clipId = `creature-paint-${rawId}`;
  const shadeId = `creature-shade-${rawId}`;
  const behavior = behaviorFor(artwork);
  const duration = 9 + (creation.routeSeed % 5);
  const initialProgress = 0.25 + (creation.routeSeed % 37) / 100;
  const [isJumping, setIsJumping] = useState(false);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    setIsJumping(true);
    sound.playJump();
    setTimeout(() => setIsJumping(false), 800);

    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    onPet(rect.left + rect.width / 2, rect.top);
  };

  return (
    <g
      className={`world-creature world-route-${route.route} ${route.reverse ? 'is-reverse' : ''} ${isJumping ? 'is-reacting' : ''}`}
      style={{
        '--world-duration': `${duration}s`,
        '--world-delay': `${-(duration * initialProgress)}s`,
        cursor: 'pointer',
      } as CSSProperties}
      data-artwork={artwork.id}
      data-route={route.route + 1}
      onAnimationIteration={(event) => {
        if (event.target === event.currentTarget) onRouteEnd();
      }}
      onClick={handleClick}
    >
      <ellipse className="world-creature__shadow" cx="50" cy="91" rx="28" ry="5" fill="#071c1b" opacity="0.28" />
      <g className={`world-creature__body behavior-${behavior}`}>
        <defs>
          <clipPath id={clipId}>
            {artwork.regions.map((region) => <path key={region.id} d={region.path} />)}
          </clipPath>
          <linearGradient id={shadeId} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#fff" stopOpacity="0.4" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#102c29" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <g className="world-creature__depth" transform="translate(1.5 2)">
          {artwork.regions.map((region) => <path key={region.id} d={region.path} fill="#132f2c" opacity="0.35" />)}
        </g>
        {artwork.regions.map((region) => (
          <path
            key={region.id}
            className={`world-creature__part part-${partClass(region.label)}`}
            d={region.path}
            fill={creation.filledRegionIds?.includes(region.id) ? creation.color : '#fdf6e7'}
            stroke="#173b35"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        ))}
        <g clipPath={`url(#${clipId})`} pointerEvents="none">
          {creation.paintStrokes.map((stroke, index) => (
            <polyline
              key={index}
              points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.size}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <rect width="100" height="100" fill={`url(#${shadeId})`} />
        </g>
      </g>
      <g className="world-creature__trail" fill={creation.themeId === 'ocean' ? '#d9fbfa' : '#ffd166'}>
        <circle cx="3" cy="78" r="1.6" />
        <circle cx="-3" cy="82" r="1" />
        <circle cx="-8" cy="76" r="0.7" />
      </g>
    </g>
  );
}

/**
 * 살아 숨쉬는 생태 월드
 * 공룡, 정글, 바다 3대 테마 완벽 지원 및 내가 칠한 캐릭터와의 실시간 상호작용
 */
export function TouchJungleWorld({ theme, artworks, creations, onBack, onNext, onReset }: Props) {
  const isDino = theme.id === 'dino';
  const isOcean = theme.id === 'ocean';
  const worldThemeClass = isDino ? 'dino' : isOcean ? 'ocean' : 'jungle';
  const worldName = isDino ? '선사시대 공룡 월드' : isOcean ? '푸른 바다' : '신비한 정글';
  
  const artworkMap = useMemo(() => new Map(artworks.map((artwork) => [artwork.id, artwork])), [artworks]);
  const [routes, setRoutes] = useState<Record<string, RouteState>>(() =>
    Object.fromEntries(creations.map((creation) => [creation.id, { route: creation.routeSeed % 5, reverse: creation.routeSeed % 2 === 0 }]))
  );
  const [particles, setParticles] = useState<WorldParticle[]>([]);
  const [isMuted, setIsMuted] = useState(() => sound.getMuted());

  useEffect(() => {
    // 월드 진입 시 마법 팡파르 효과음 재생
    sound.playMagicSpawn();
  }, []);

  useEffect(() => {
    setRoutes((current) => {
      const next = { ...current };
      creations.forEach((creation) => {
        if (!next[creation.id]) {
          next[creation.id] = { route: creation.routeSeed % 5, reverse: creation.routeSeed % 2 === 0 };
        }
      });
      return next;
    });
  }, [creations]);

  const chooseNextRoute = (creationId: string) => {
    setRoutes((current) => {
      const previous = current[creationId] ?? { route: 0, reverse: false };
      return {
        ...current,
        [creationId]: {
          route: (previous.route + 1 + Math.floor(Math.random() * 4)) % 5,
          reverse: Math.random() > 0.5,
        },
      };
    });
  };

  const handleSceneClick = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const emojis = isDino ? ['🥩', '🌿', '⭐', '✨'] : isOcean ? ['🫧', '🐚', '🦐', '💖'] : ['🍌', '🍎', '🌿', '💖'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];

    sound.playPop();
    const newParticle: WorldParticle = { id: Date.now() + Math.random(), x, y, emoji };
    setParticles((prev) => [...prev.slice(-6), newParticle]);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
    }, 1200);
  };

  const handlePetCreature = (clientX: number, clientY: number) => {
    const emojis = ['💖', '🌟', '✨', '🐾'];
    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
    const newParticle: WorldParticle = { id: Date.now() + Math.random(), x: clientX, y: clientY, emoji };
    setParticles((prev) => [...prev.slice(-6), newParticle]);

    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
    }, 1200);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) sound.playClick();
  };

  return (
    <main
      className={`touch-world touch-world--${worldThemeClass}`}
      data-testid="touch-world"
      data-world={worldThemeClass}
      style={{ position: 'relative' }}
    >
      {/* 우측 상단 음소거 토글 버튼 */}
      <button
        type="button"
        className="sound-toggle-btn"
        onClick={toggleSound}
        aria-label={isMuted ? '소리 켜기' : '소리 끄기'}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255, 255, 255, 0.85)',
          border: '1px solid rgba(0, 0, 0, 0.1)',
          borderRadius: 20,
          padding: '6px 12px',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        <span>{isMuted ? '🔇 소리 켜기' : '🔊 소리 끄기'}</span>
      </button>

      <div className="touch-world__copy">
        <p className="touch-game__eyebrow">{worldName} 탐험 중</p>
        <h1>내가 색칠한 친구가 살아 움직여요! ✨</h1>
        <p>
          화면이나 친구를 터치해보세요! {isDino ? '쿵쾅쿵쾅 뛰어오르고 기뻐해요.' : isOcean ? '물방울을 뿜으며 춤추고 헤엄쳐요.' : '정글 숲속을 신나게 뛰놀아요.'}
        </p>
        <div className="touch-world__room" aria-live="polite">
          <strong>{creations.length}</strong>
          <span>이 룸에서 함께 탐험 중인 내 친구들</span>
        </div>
      </div>

      <div style={{ position: 'relative', width: 'min(100%, 620px)', margin: '0 auto' }}>
        <svg
          className="touch-world__scene"
          viewBox="0 0 160 96"
          role="img"
          aria-label={`내가 만든 친구들이 뛰노는 ${worldName}`}
          onClick={handleSceneClick}
          style={{ cursor: 'crosshair' }}
        >
          {isDino ? <DinoWorld /> : isOcean ? <OceanWorld /> : <JungleWorld />}
          {[0, 1, 2, 3, 4].map((routeIndex) => (
            <g key={routeIndex} className={`world-depth-layer world-depth-layer--${routeIndex}`}>
              {creations
                .filter((creation) => routes[creation.id]?.route === routeIndex)
                .map((creation) => {
                  const artwork = artworkMap.get(creation.artworkId);
                  return artwork ? (
                    <Creature
                      key={creation.id}
                      creation={creation}
                      artwork={artwork}
                      route={routes[creation.id]}
                      onRouteEnd={() => chooseNextRoute(creation.id)}
                      onPet={handlePetCreature}
                    />
                  ) : null;
                })}
            </g>
          ))}
          {/* 전면 나뭇잎/수풀 레이어 */}
          <path
            className="world-front-leaves"
            d="M0 96 V82 Q8 72 13 94 Q18 78 26 73 Q24 90 31 96 M160 96 V78 Q151 73 149 93 Q143 78 136 75 Q139 90 131 96"
            fill={isDino ? '#3e1f0c' : isOcean ? '#236f68' : '#2f6c42'}
          />
        </svg>

        {/* 탭 인터랙션 시 떠오르는 이모지 파티클 */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="world-floating-particle"
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              transform: 'translate(-50%, -50%)',
              fontSize: '24px',
              pointerEvents: 'none',
              animation: 'float-up 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards',
              zIndex: 20
            }}
          >
            {p.emoji}
          </div>
        ))}
      </div>

      <div className="touch-world__actions">
        <button
          className="big-btn"
          type="button"
          onClick={() => {
            sound.playClick();
            onNext();
          }}
        >
          🎨 다른 친구 더 만들기
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => {
            sound.playClick();
            onBack();
          }}
        >
          ✏️ 이 그림 더 칠하기
        </button>
        <button
          className="btn-reset-world"
          type="button"
          onClick={() => {
            sound.playClick();
            onReset();
          }}
        >
          모두 지우고 새로 그리기
        </button>
      </div>
    </main>
  );
}
