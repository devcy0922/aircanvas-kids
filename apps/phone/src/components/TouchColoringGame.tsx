import { useEffect, useMemo, useState } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import { PALETTE } from '@ht/protocol';
import {
  TouchColoringBoard,
  estimatePaintCoverage,
  type BrushKind,
  type PaintStroke,
  type TouchMode,
} from './TouchColoringBoard';
import { TouchJungleWorld } from './TouchJungleWorld';
import { sound } from '../lib/sound';

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
    return Array.isArray(value) ? value.slice(-16) : [];
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

  const [mode, setMode] = useState<TouchMode>('brush');
  const [brush, setBrush] = useState<BrushKind>('round');
  const [brushSize, setBrushSize] = useState(7);
  const [zoom, setZoom] = useState(1);
  const [color, setColor] = useState<PaletteColor>(PALETTE[0]);
  const [strokes, setStrokes] = useState<PaintStroke[]>([]);
  const [filledRegions, setFilledRegions] = useState<Record<string, string>>({});
  const [isExported, setIsExported] = useState(false);
  const [isAwakening, setIsAwakening] = useState(false);
  const [creations, setCreations] = useState<WorldCreation[]>(() => loadCreations(storageKey));
  const [isMuted, setIsMuted] = useState(() => sound.getMuted());

  const progress = useMemo(
    () => (artwork ? estimatePaintCoverage(artwork, strokes, filledRegions) : 0),
    [artwork, strokes, filledRegions]
  );

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(creations));
  }, [creations, storageKey]);

  useEffect(() => {
    setArtworkId(themeArtworks[0]?.id ?? '');
    setStrokes([]);
    setFilledRegions({});
    setZoom(1);
    setIsExported(false);
    setIsAwakening(false);
  }, [themeId, themeArtworks]);

  useEffect(() => {
    setStrokes([]);
    setFilledRegions({});
    setZoom(1);
    setIsExported(false);
    setIsAwakening(false);
  }, [artworkId]);

  if (!theme || !artwork) {
    return (
      <main className="touch-game">
        <p>색칠할 그림을 준비하지 못했어요.</p>
        <button className="btn-ghost" onClick={onExit}>
          처음으로
        </button>
      </main>
    );
  }

  const artworkIndex = themeArtworks.findIndex((item) => item.id === artwork.id);
  const nextArtwork =
    artworkIndex >= 0 && themeArtworks.length > 0
      ? themeArtworks[(artworkIndex + 1) % themeArtworks.length]
      : undefined;

  const handleFillRegion = (regionId: string, regionColor: string) => {
    setFilledRegions((prev) => ({
      ...prev,
      [regionId]: regionColor,
    }));
  };

  const handleClear = () => {
    sound.playClick();
    setStrokes([]);
    setFilledRegions({});
  };

  const handleWakeUp = () => {
    sound.playMagicSpawn();
    setIsAwakening(true);

    const filledIds = Object.keys(filledRegions);
    const creationId = `${artwork.id}-${Date.now().toString(36)}`;
    const newCreation: WorldCreation = {
      id: creationId,
      artworkId: artwork.id,
      themeId: theme.id,
      color: filledRegions[artwork.regions[0]?.id] || color,
      paintStrokes: strokes,
      filledRegionIds: filledIds,
      routeSeed: Math.floor(Math.random() * 100),
    };

    setCreations((current) => [...current, newCreation]);

    setTimeout(() => {
      setIsAwakening(false);
      setIsExported(true);
    }, 1100);
  };

  const toggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) sound.playClick();
  };

  if (isExported) {
    const worldCreations = creations.filter((creation) => creation.themeId === theme.id);
    return (
      <TouchJungleWorld
        theme={theme}
        artworks={artworks}
        creations={worldCreations}
        onBack={() => setIsExported(false)}
        onNext={() => {
          if (nextArtwork) {
            setArtworkId(nextArtwork.id);
          }
          setIsExported(false);
        }}
        onReset={() => {
          setCreations([]);
          sessionStorage.removeItem(storageKey);
          setStrokes([]);
          setFilledRegions({});
          setIsExported(false);
        }}
      />
    );
  }

  const percentLabel = Math.min(100, Math.round(progress * 100));

  return (
    <main className="touch-game" data-testid="touch-game" style={{ position: 'relative' }}>
      {/* 생명 부여 (깨어나기) 연출 오버레이 */}
      {isAwakening && (
        <div
          className="awakening-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            animation: 'fadeIn 0.3s ease-out forwards',
          }}
        >
          <div style={{ fontSize: 72, animation: 'bounce 0.6s infinite alternate' }}>✨</div>
          <h2 style={{ fontSize: 28, color: '#2a5a40', marginTop: 16 }}>내 친구가 깨어나고 있어요!</h2>
          <p style={{ color: '#557b66', fontWeight: 600 }}>생태 월드로 힘차게 뛰어갑니다...</p>
        </div>
      )}

      {/* 헤더 & 네비게이션 */}
      <header className="touch-game__header">
        <div className="touch-game__header-actions">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => {
              sound.playClick();
              onExit();
            }}
          >
            ← 홈으로
          </button>
          <button
            className="btn-ghost sound-btn"
            type="button"
            onClick={toggleSound}
            aria-label={isMuted ? '소리 켜기' : '소리 끄기'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>

        <div className="touch-game__title-wrap">
          <p className="touch-game__eyebrow">{theme.label} 친구 만들기</p>
          <h1>{artwork.name}</h1>
        </div>

        {/* 테마 탭 */}
        <div className="touch-theme-nav touch-theme-list" role="tablist" aria-label="테마 선택">
          {themes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`touch-theme-chip ${item.id === theme.id ? 'is-active' : ''}`}
              style={{
                borderColor: item.id === theme.id ? item.accentColor : 'transparent',
                backgroundColor: item.id === theme.id ? item.bgColor : 'rgba(255,255,255,0.7)',
                color: item.id === theme.id ? item.accentColor : '#555',
              }}
              onClick={() => {
                sound.playClick();
                setThemeId(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 도안 선택 탭 */}
        <div className="touch-art-list" role="tablist" aria-label="작품 선택">
          {themeArtworks.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === artwork.id ? 'is-selected' : ''}
              onClick={() => {
                sound.playClick();
                setArtworkId(item.id);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      </header>

      {/* 색칠 모드 선택 바 (채우기 💧 vs 브러시 🖌️) */}
      <section className="touch-mode-selector" aria-label="색칠 도구 모드">
        <div className="mode-toggle-group">
          <button
            type="button"
            className={`mode-btn ${mode === 'fill' ? 'is-selected' : ''}`}
            onClick={() => {
              sound.playClick();
              setMode('fill');
            }}
          >
            <span className="mode-icon">💧</span>
            <strong>칸 채우기</strong>
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === 'brush' ? 'is-selected' : ''}`}
            onClick={() => {
              sound.playClick();
              setMode('brush');
            }}
          >
            <span className="mode-icon">🖌️</span>
            <strong>자유 붓칠</strong>
          </button>
        </div>

        {/* 칠하기 진척도 */}
        <div className="touch-progress-pill" aria-live="polite">
          <div className="touch-progress-pill__bar" style={{ width: `${percentLabel}%` }} />
          <span>{percentLabel}% 채색됨</span>
        </div>
      </section>

      {/* 메인 캔버스 보드 */}
      <TouchColoringBoard
        artwork={artwork}
        theme={theme}
        color={color}
        mode={mode}
        brush={brush}
        brushSize={brushSize}
        zoom={zoom}
        strokes={strokes}
        filledRegions={filledRegions}
        onStroke={(newStroke) => setStrokes((prev) => [...prev, newStroke])}
        onFillRegion={handleFillRegion}
      />

      {/* 하단 팔레트 및 도구 제어기 */}
      <footer className="touch-game__toolbar">
        {mode === 'brush' && (
          <div className="brush-controls">
            <div className="brush-kind-group">
              <button
                type="button"
                className={`btn-sub ${brush === 'round' ? 'is-active' : ''}`}
                onClick={() => {
                  sound.playClick();
                  setBrush('round');
                }}
              >
                둥근 붓
              </button>
              <button
                type="button"
                className={`btn-sub ${brush === 'pen' ? 'is-active' : ''}`}
                onClick={() => {
                  sound.playClick();
                  setBrush('pen');
                }}
              >
                가는 펜
              </button>
            </div>
            <div className="brush-size-group">
              {[4, 7, 12].map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`size-dot ${brushSize === size ? 'is-active' : ''}`}
                  style={{ width: size + 16, height: size + 16 }}
                  onClick={() => {
                    sound.playClick();
                    setBrushSize(size);
                  }}
                  aria-label={`크기 ${size}`}
                >
                  <span style={{ width: size, height: size, borderRadius: '50%', background: color }} />
                </button>
              ))}
            </div>
            <div className="touch-zoom" aria-label="세부 확대">
              <span>세부 확대</span>
              {[1, 1.5, 2].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={zoom === level ? 'is-selected' : ''}
                  onClick={() => {
                    sound.playClick();
                    setZoom(level);
                  }}
                >
                  {level}×
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 컬러 팔레트 */}
        <div className="palette-grid" role="radiogroup" aria-label="색상 선택">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`palette-chip ${c === color ? 'is-selected' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => {
                sound.playPop();
                setColor(c);
              }}
              aria-label={`색상 ${c}`}
            />
          ))}
        </div>

        {/* 하단 주요 액션 버튼 */}
        <div className="touch-footer-actions">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleClear}
            disabled={strokes.length === 0 && Object.keys(filledRegions).length === 0}
          >
            모두 지우기
          </button>
          <button
            type="button"
            className={`big-btn wake-up-btn ${percentLabel >= 20 ? 'pulse' : ''}`}
            data-testid="touch-export"
            onClick={handleWakeUp}
          >
            🌟 친구 깨우기! (월드로 보내기)
          </button>
        </div>
      </footer>
    </main>
  );
}
