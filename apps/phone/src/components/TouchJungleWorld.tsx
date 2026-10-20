import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import type { WorldCreation } from './TouchColoringGame';
import { DinoForeground, DinoScene, JungleForeground, JungleScene, OceanForeground, OceanScene } from './WorldScenes';
import { bakeCached, npcBaseColor } from '../lib/creatureSprite';
import { SCENE_H, SCENE_W, WorldEngine, speciesOf } from '../lib/worldEngine';
import type { ActorSpec, WorldKind } from '../lib/worldEngine';
import { sound } from '../lib/sound';

interface Props {
  theme: ThemePack;
  artworks: ArtworkPack[];
  creations: WorldCreation[];
  onBack: () => void;
  onNext: () => void;
  onReset: () => void;
}

/** 이미 부화 연출을 보여 준 친구(같은 세션에서 월드에 다시 들어와도 알을 또 깨지 않는다) */
const introduced = new Set<string>();

const MAX_USER_ACTORS = 6;

/** 예전 저장 형식(색 하나 + 칠한 영역 id)도 읽는다 */
function regionColorsOf(creation: WorldCreation): Record<string, string> {
  if (creation.regionColors) return creation.regionColors;
  return Object.fromEntries((creation.filledRegionIds ?? []).map((id) => [id, creation.color]));
}

function creationKey(creation: WorldCreation): string {
  const text = JSON.stringify([regionColorsOf(creation), creation.paintStrokes.length, creation.paintStrokes.at(-1)?.points.length ?? 0]);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${creation.id}:${(hash >>> 0).toString(36)}`;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** 월드에 원래 살고 있는 친구들: 같은 테마 도안을 한 번씩, 모자라면 작게 한 번 더 */
function npcSpecs(pool: ArtworkPack[]): Array<{ artwork: ArtworkPack; scale: number }> {
  if (pool.length === 0) return [];
  const flyers = pool.filter((a) => speciesOf(a.id) === 'ptera');
  const walkers = pool.filter((a) => speciesOf(a.id) !== 'ptera');
  const list = walkers.map((artwork) => ({ artwork, scale: 0.92 }));
  for (let i = 0; list.length < 4 && walkers.length; i++) list.push({ artwork: walkers[i % walkers.length], scale: 0.75 });
  for (const artwork of flyers) list.push({ artwork, scale: 1 }, { artwork, scale: 0.8 });
  return list;
}

function emojisFor(kind: WorldKind) {
  return kind === 'dino' ? ['🥩', '🌿', '⭐', '✨'] : kind === 'ocean' ? ['🫧', '🐚', '🦐', '💖'] : ['🍌', '🍎', '🌿', '💖'];
}

/**
 * 살아 있는 생태 월드.
 * 원래 살던 친구들(NPC)이 제각각 움직이는 곳에, 내가 칠한 친구가 알(공룡)·덤불(정글)·물방울(바다)에서 나타난다.
 */
export function TouchJungleWorld({ theme, artworks, creations, onBack, onNext, onReset }: Props) {
  const kind: WorldKind = theme.id === 'dino' ? 'dino' : theme.id === 'ocean' ? 'ocean' : 'jungle';
  const worldName = kind === 'dino' ? '선사시대 공룡 월드' : kind === 'ocean' ? '푸른 바다' : '신비한 정글';

  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<SVGGElement>(null);
  const skyRef = useRef<SVGGElement>(null);
  const groundRef = useRef<SVGGElement>(null);
  const fxRef = useRef<SVGGElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const toastTimer = useRef<number>();
  const [toast, setToast] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => sound.getMuted());

  const artworkMap = useMemo(() => new Map(artworks.map((artwork) => [artwork.id, artwork])), [artworks]);
  const pool = useMemo(() => {
    const own = artworks.filter((artwork) => artwork.id.startsWith(`${theme.id}-`));
    return own.length ? own : artworks;
  }, [artworks, theme.id]);
  const worldKey = `${theme.id}|${creations.map(creationKey).join(',')}|${pool.map((a) => a.id).join(',')}`;

  useEffect(() => {
    const svg = svgRef.current;
    const stage = stageRef.current;
    const sky = skyRef.current;
    const ground = groundRef.current;
    const fx = fxRef.current;
    if (!svg || !stage || !sky || !ground || !fx) return;

    let alive = true;
    const engine = new WorldEngine({
      svg,
      stage,
      sky,
      ground,
      fx,
      kind,
      reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      onToast: (text) => {
        setToast(text);
        window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 2800);
      },
    });
    engineRef.current = engine;
    engine.start();

    (async () => {
      sound.playMagicSpawn();
      for (const { artwork, scale } of npcSpecs(pool)) {
        try {
          const baked = await bakeCached(`npc:${artwork.id}`, {
            artwork,
            npcColor: artwork.spriteUrl ? undefined : npcBaseColor(artwork.id),
          });
          if (!alive) return;
          engine.addActor({ id: `npc-${artwork.id}-${scale}`, name: artwork.name, species: speciesOf(artwork.id), baked, scale });
        } catch (error) {
          console.warn('[world] NPC를 준비하지 못했어요', artwork.id, error);
        }
        await tick();
      }

      const mine = creations.slice(-MAX_USER_ACTORS);
      const newest = mine.at(-1);
      for (const creation of mine) {
        const artwork = artworkMap.get(creation.artworkId);
        if (!artwork) continue;
        const key = creationKey(creation);
        try {
          const baked = await bakeCached(`mine:${key}`, { artwork, regionColors: regionColorsOf(creation), strokes: creation.paintStrokes });
          if (!alive) return;
          const hero = creation === newest && !introduced.has(key);
          const spec: ActorSpec = { id: `mine-${key}`, name: artwork.name, species: speciesOf(artwork.id), baked, hero, scale: hero ? 1 : 1.05 };
          engine.addActor(spec);
          introduced.add(key);
        } catch (error) {
          console.warn('[world] 내 친구를 준비하지 못했어요', creation.id, error);
        }
        await tick();
      }
    })();

    return () => {
      alive = false;
      window.clearTimeout(toastTimer.current);
      engine.destroy();
      engineRef.current = null;
    };
    // worldKey가 바뀔 때만 장면을 다시 꾸민다(내용이 같은 배열 재생성에는 반응하지 않는다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldKey]);

  const handleSceneClick = (event: MouseEvent<SVGSVGElement>) => {
    sound.playPop();
    engineRef.current?.sprinkle(event.clientX, event.clientY, emojisFor(kind));
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) sound.playClick();
  };

  const Scene = kind === 'dino' ? DinoScene : kind === 'ocean' ? OceanScene : JungleScene;
  const Foreground = kind === 'dino' ? DinoForeground : kind === 'ocean' ? OceanForeground : JungleForeground;

  return (
    <main className={`touch-world touch-world--${kind}`} data-testid="touch-world" data-world={kind}>
      <div className="world-head">
        <div>
          <p className="touch-game__eyebrow">{worldName}</p>
          <h1>내가 칠한 친구가 나타났어요! ✨</h1>
        </div>
        <button type="button" className="world-sound" onClick={toggleSound} aria-label={isMuted ? '소리 켜기' : '소리 끄기'}>
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      <div className="world-frame">
        <svg
          ref={svgRef}
          className="touch-world__scene"
          viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}
          role="img"
          aria-label={`내가 만든 친구들이 함께 사는 ${worldName}`}
          onClick={handleSceneClick}
        >
          <g ref={stageRef} className="world-stage">
            <Scene />
            <g ref={skyRef} className="world-layer world-layer--sky" />
            <g ref={groundRef} className="world-layer world-layer--ground" />
            <Foreground />
            <g ref={fxRef} className="world-layer world-layer--fx" pointerEvents="none" />
          </g>
        </svg>
        {toast && (
          <div className="world-toast" role="status">
            {toast}
          </div>
        )}
      </div>

      <p className="world-lead">
        {kind === 'dino' ? '원래 살던 공룡 친구들 사이로 내 친구가 알에서 깨어났어요. 화면이나 친구를 눌러 보세요!' : kind === 'ocean' ? '물방울이 톡 터지며 내 친구가 나타났어요. 화면이나 친구를 눌러 보세요!' : '덤불이 바스락거리더니 내 친구가 튀어나왔어요. 화면이나 친구를 눌러 보세요!'}
      </p>

      <div className="touch-world__room" aria-live="polite">
        <strong>{creations.length}</strong>
        <span>이 월드에서 함께 노는 내 친구들</span>
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
