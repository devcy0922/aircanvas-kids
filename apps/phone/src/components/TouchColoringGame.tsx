import { useEffect, useMemo, useState } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import { PALETTE } from '@ht/protocol';
import {
  TouchColoringBoard,
  estimatePaintCoverage,
  type BrushKind,
  type PaintStroke,
} from './TouchColoringBoard';
import { TouchJungleWorld } from './TouchJungleWorld';

type PaletteColor = typeof PALETTE[number];

interface Props {
  themes: ThemePack[];
  artworks: ArtworkPack[];
  roomKey?: string;
  onExit: () => void;
}

export type WorldCreation = {
  id: string;
  artworkId: string;
  themeId: string;
  color: string;
  paintStrokes: PaintStroke[];
  filledRegionIds?: string[];
  routeSeed: number;
};

function loadCreations(storageKey: string): WorldCreation[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? value.slice(-12) : [];
  } catch {
    return [];
  }
}

export function TouchColoringGame({ themes, artworks, roomKey = 'LOCAL', onExit }: Props) {
  const storageKey = `aircanvas.touch-world.v1:${roomKey}`;
  const [themeId, setThemeId] = useState(themes[0]?.id ?? '');
  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  const themeArtworks = useMemo(() => {
    if (!theme) return [];
    const artworkMap = new Map(artworks.map((artwork) => [artwork.id, artwork]));
    return theme.artworks.map((ref) => artworkMap.get(ref.id)).filter(Boolean) as ArtworkPack[];
  }, [artworks, theme]);
  const [artworkId, setArtworkId] = useState(themeArtworks[0]?.id ?? '');
  const artwork = themeArtworks.find((item) => item.id === artworkId) ?? themeArtworks[0];
  const [brush, setBrush] = useState<BrushKind>('round');
  const [brushSize, setBrushSize] = useState(7);
  const [zoom, setZoom] = useState(1);
  const [color, setColor] = useState<PaletteColor>(PALETTE[0]);
  const [strokes, setStrokes] = useState<PaintStroke[]>([]);
  const [isExported, setIsExported] = useState(false);
  const [activeCreationId, setActiveCreationId] = useState<string | null>(null);
  const [creations, setCreations] = useState<WorldCreation[]>(() => loadCreations(storageKey));
  const progress = useMemo(() => artwork ? estimatePaintCoverage(artwork, strokes) : 0, [artwork, strokes]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(creations));
  }, [creations, storageKey]);

  useEffect(() => {
    setArtworkId(themeArtworks[0]?.id ?? '');
    setStrokes([]);
    setZoom(1);
    setActiveCreationId(null);
    setIsExported(false);
  }, [themeId, themeArtworks]);

  useEffect(() => {
    setStrokes([]);
    setZoom(1);
    setActiveCreationId(null);
    setIsExported(false);
  }, [artworkId]);

  if (!theme || !artwork) {
    return (
      <main className="touch-game">
        <p>색칠할 그림을 준비하지 못했어요.</p>
        <button className="btn-ghost" onClick={onExit}>처음으로</button>
      </main>
    );
  }

  const artworkIndex = themeArtworks.findIndex((item) => item.id === artwork.id);
  const nextArtwork = artworkIndex >= 0 && themeArtworks.length > 0
    ? themeArtworks[(artworkIndex + 1) % themeArtworks.length]
    : undefined;

  if (isExported) {
    const worldCreations = creations.filter((creation) => creation.themeId === theme.id);
    return (
      <TouchJungleWorld
        theme={theme}
        artworks={artworks}
        creations={worldCreations}
        onBack={() => setIsExported(false)}
        onNext={() => {
          setIsExported(false);
          setActiveCreationId(null);
          if (nextArtwork) setArtworkId(nextArtwork.id);
        }}
        onReset={() => {
          setCreations([]);
          setStrokes([]);
          setActiveCreationId(null);
          setIsExported(false);
        }}
      />
    );
  }

  return (
    <main className="touch-game" data-testid="touch-game">
      <header className="touch-game__header">
        <div>
          <p className="touch-game__eyebrow">카메라 없이도 충분해요</p>
          <h1>손끝 색칠공부</h1>
        </div>
        <button className="btn-ghost small" onClick={onExit}>처음으로</button>
      </header>

      <p className="touch-game__lead">원형 붓을 누른 채 움직이면 지나간 자리만 색이 남아요. 완성한 공룡은 정글로, 물고기는 바다로 출발해요.</p>

      <section className="touch-section" aria-label="테마 선택">
        <div className="touch-section__heading">
          <span>색칠 세계</span>
          <strong>{theme.label}</strong>
        </div>
        <div className="touch-theme-list">
          {themes.map((item) => (
            <button
              key={item.id}
              className={item.id === theme.id ? 'is-selected' : ''}
              onClick={() => setThemeId(item.id)}
            >
              {item.id === 'dino' ? '🦕' : item.id === 'jungle' ? '🐒' : '🐠'} {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="touch-section" aria-label="작품 선택">
        <div className="touch-art-list">
          {themeArtworks.map((item) => (
            <button
              key={item.id}
              className={item.id === artwork.id ? 'is-selected' : ''}
              onClick={() => setArtworkId(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="touch-section touch-play-section">
        <div className="touch-progress-row">
          <span>도안 면적을 직접 색칠하고 있어요</span>
          <strong>{Math.round(progress * 100)}%</strong>
        </div>
        <TouchColoringBoard
          artwork={artwork}
          theme={theme}
          color={color}
          brush={brush}
          brushSize={brushSize}
          zoom={zoom}
          strokes={strokes}
          onStroke={(stroke) => {
            setStrokes((previous) => [...previous, stroke]);
            navigator.vibrate?.(12);
          }}
        />
        <div className="touch-export-row">
          <button
            className="big-btn touch-export-btn"
            type="button"
            data-testid="touch-export"
            onClick={() => {
              const creationId = activeCreationId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const creation: WorldCreation = {
                id: creationId,
                artworkId: artwork.id,
                themeId: theme.id,
                color,
                paintStrokes: strokes,
                routeSeed: Math.floor(Math.random() * 10_000),
              };
              setActiveCreationId(creationId);
              setCreations((previous) => {
                const existingIndex = previous.findIndex((item) => item.id === creationId);
                if (existingIndex < 0) return [...previous, creation].slice(-12);
                return previous.map((item) => item.id === creationId ? creation : item);
              });
              setIsExported(true);
            }}
          >
            내 캐릭터 {theme.id === 'ocean' ? '바다' : '정글'}로 내보내기
          </button>
          <span>색칠한 만큼만 가지고 다음 장면으로 가요.</span>
        </div>
      </section>

      <section className="touch-tools" aria-label="색칠 도구">
        <div className="touch-mode-list">
          <button
            className={brush === 'round' ? 'is-selected' : ''}
            data-testid="brush-round"
            onClick={() => { setBrush('round'); setBrushSize(7); }}
          >
            <span className="brush-preview brush-preview--round" /> 원형 붓
          </button>
          <button
            className={brush === 'pen' ? 'is-selected' : ''}
            data-testid="brush-pen"
            onClick={() => { setBrush('pen'); setBrushSize(2); }}
          >
            <span className="brush-preview brush-preview--pen" /> 가는 펜
          </button>
          <button disabled={strokes.length === 0} onClick={() => setStrokes((previous) => previous.slice(0, -1))}>한 획 되돌리기</button>
        </div>
        <label className="touch-brush-size">
          <span>붓 크기</span>
          <input
            aria-label="붓 크기"
            type="range"
            min={brush === 'round' ? 3 : 1}
            max={brush === 'round' ? 14 : 5}
            step="1"
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
          />
          <strong>{brushSize}</strong>
        </label>
        <div className="touch-zoom" aria-label="세부 확대">
          <span>세부 확대</span>
          {[1, 1.5, 2].map((level) => (
            <button key={level} className={zoom === level ? 'is-selected' : ''} onClick={() => setZoom(level)}>
              {level}×
            </button>
          ))}
        </div>
        <div className="touch-palette">
          {PALETTE.map((item) => (
            <button
              key={item}
              className={color === item ? 'is-selected' : ''}
              style={{ background: item }}
              aria-label={`색상 ${item}`}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
      </section>

      <p className="touch-status" data-testid="touch-status">
        {progress >= 0.85
          ? `멋져요! ${theme.id === 'ocean' ? '바다' : '정글'}로 내보내 볼까요?`
          : '색을 고르고 도안 안을 천천히 문질러 보세요.'}
      </p>
    </main>
  );
}
