import { useEffect, useMemo, useState } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import { PALETTE } from '@ht/protocol';
import { TouchColoringBoard, type TouchMode, type TouchPoint } from './TouchColoringBoard';

type PaletteColor = typeof PALETTE[number];

interface Props {
  themes: ThemePack[];
  artworks: ArtworkPack[];
  onExit: () => void;
}

export function TouchColoringGame({ themes, artworks, onExit }: Props) {
  const [themeId, setThemeId] = useState(themes[0]?.id ?? '');
  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  const themeArtworks = useMemo(() => {
    if (!theme) return [];
    const artworkMap = new Map(artworks.map((artwork) => [artwork.id, artwork]));
    return theme.artworks.map((ref) => artworkMap.get(ref.id)).filter(Boolean) as ArtworkPack[];
  }, [artworks, theme]);
  const [artworkId, setArtworkId] = useState(themeArtworks[0]?.id ?? '');
  const artwork = themeArtworks.find((item) => item.id === artworkId) ?? themeArtworks[0];
  const [mode, setMode] = useState<TouchMode>('fill');
  const [color, setColor] = useState<PaletteColor>(PALETTE[0]);
  const [filledRegions, setFilledRegions] = useState<Set<string>>(new Set());
  const [strokes, setStrokes] = useState<TouchPoint[][]>([]);

  useEffect(() => {
    setArtworkId(themeArtworks[0]?.id ?? '');
    setFilledRegions(new Set());
    setStrokes([]);
  }, [themeId, themeArtworks]);

  useEffect(() => {
    setFilledRegions(new Set());
    setStrokes([]);
  }, [artworkId]);

  if (!theme || !artwork) {
    return (
      <main className="touch-game">
        <p>색칠할 그림을 준비하지 못했어요.</p>
        <button className="btn-ghost" onClick={onExit}>처음으로</button>
      </main>
    );
  }

  const progress = artwork.regions.length === 0 ? 0 : filledRegions.size / artwork.regions.length;

  return (
    <main className="touch-game" data-testid="touch-game">
      <header className="touch-game__header">
        <div>
          <p className="touch-game__eyebrow">카메라 없이도 충분해요</p>
          <h1>손끝 색칠공부</h1>
        </div>
        <button className="btn-ghost small" onClick={onExit}>처음으로</button>
      </header>

      <p className="touch-game__lead">화면을 톡 눌러 공룡을 채우고, 손가락으로 자유롭게 그려보세요.</p>

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
          <span>{filledRegions.size}/{artwork.regions.length} 칸을 색칠했어요</span>
          <strong>{Math.round(progress * 100)}%</strong>
        </div>
        <TouchColoringBoard
          artwork={artwork}
          theme={theme}
          mode={mode}
          color={color}
          filledRegions={filledRegions}
          strokes={strokes}
          onFillRegion={(regionId) => {
            if (filledRegions.has(regionId)) return;
            setFilledRegions((previous) => new Set(previous).add(regionId));
            navigator.vibrate?.(12);
          }}
          onStroke={(points) => setStrokes((previous) => [...previous, points])}
        />
      </section>

      <section className="touch-tools" aria-label="색칠 도구">
        <div className="touch-mode-list">
          <button className={mode === 'fill' ? 'is-selected' : ''} onClick={() => setMode('fill')}>🪣 칸 채우기</button>
          <button className={mode === 'free' ? 'is-selected' : ''} onClick={() => setMode('free')}>✏️ 자유 그리기</button>
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
        {progress >= 1 ? '완성했어요! 다른 그림도 칠해볼까요?' : mode === 'fill' ? '색을 고르고 그림 속 칸을 눌러보세요.' : '손가락을 떼면 선이 남아요.'}
      </p>
    </main>
  );
}
