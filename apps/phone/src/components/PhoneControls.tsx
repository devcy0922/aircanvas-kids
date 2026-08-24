import { useState } from 'react';
import type { ArtworkPack, ThemePack, GamePhase } from '@ht/protocol';
import { PALETTE } from '@ht/protocol';

type Mode = 'fill' | 'free';

interface Props {
  // Discover screen props (optional)
  roomInput?: string;
  setRoomInput?: (v: string) => void;
  onJoin?: () => void;
  // Common props
  joined: boolean;
  status: string;
  livePoint?: { x: number; y: number } | null;
  fps?: number;
  mode: Mode;
  setMode: (m: Mode) => void;
  color: string;
  setColor: (c: string) => void;
  onPaintToggle: (on: boolean) => void;
  sendFill: (x: number, y: number, color: string) => void;
  artworks: ArtworkPack[];
  onSelectTheme: (themeId: string) => void;
  onSelectArtwork: (artworkId: string) => void;
  currentTheme: ThemePack | undefined;
  themes: ThemePack[];
  selectedArtwork: ArtworkPack | undefined;
  gamePhase: GamePhase;
  onUndo: () => void;
  onNextArt: () => void;
  onGoHome: () => void;
  progress: number;
  tvConnected: boolean;
  onDisconnect: () => void;
}

export function PhoneControls({
  joined,
  status,
  livePoint,
  fps,
  mode,
  setMode,
  color,
  setColor,
  onPaintToggle,
  sendFill,
  artworks,
  onSelectTheme,
  onSelectArtwork,
  currentTheme,
  themes,
  selectedArtwork,
  gamePhase,
  onUndo,
  onNextArt,
  onGoHome,
  progress,
  tvConnected,
  onDisconnect,
  roomInput,
  setRoomInput,
  onJoin,
}: Props) {
  const [paintOn, setPaintOn] = useState(false);

  // Discover screen mode
  const isDiscover = !!roomInput;

  const isLobby = gamePhase === 'lobby';
  const isPlaying = gamePhase === 'playing';
  const isGallery = gamePhase === 'gallery';

  return (
    <div className="phone-root">
      <header>
        <h1>AirCanvas</h1>
        <span className={`badge ${tvConnected ? 'ok' : ''}`}>
          {tvConnected ? 'TV 연결됨' : status}
        </span>
      </header>

      {isDiscover && (
        <section className="join-form">
          <input
            value={roomInput}
            onChange={(e) => setRoomInput?.(e.target.value.toUpperCase())}
            maxLength={6}
            placeholder="방 코드 6자리"
            inputMode="text"
            autoComplete="off"
          />
          <button onClick={onJoin} disabled={!roomInput || roomInput.length !== 6}>
            연결
          </button>
        </section>
      )}

      {isLobby && (
        <section className="lobby-section">
          <h2 className="section-title">테마 선택</h2>
          <div className="theme-grid">
            {themes.map((t) => (
              <button key={t.id} disabled={!joined} onClick={() => onSelectTheme(t.id)} style={{ borderColor: t.accentColor }}>
                <span className="theme-emoji">{t.id === 'dino' ? '🦕' : t.id === 'jungle' ? '🐒' : '🐠'}</span>
                {t.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {!isLobby && currentTheme && (
        <section className="theme-info">
          <span className="theme-badge" style={{ background: currentTheme.accentColor }}>
            {currentTheme.id === 'dino' ? '🦕' : currentTheme.id === 'jungle' ? '🐒' : '🐠'} {currentTheme.label}
          </span>
        </section>
      )}

      {!isLobby && (
        <section>
          <h2 className="section-title">작품 고르기</h2>
          <div className="arts">
            {artworks.map((a) => (
              <button
                key={a.id}
                disabled={!joined || isPlaying}
                className={`art-chip ${a.id === selectedArtwork?.id ? 'sel' : ''}`}
                onClick={() => onSelectArtwork(a.id)}
              >
                {a.name}
              </button>
            ))}
          </div>
          {selectedArtwork && (
            <p className="selected-art">선택됨: <strong>{selectedArtwork.name}</strong></p>
          )}
        </section>
      )}

      {isPlaying && (
        <>
          <section className="modes">
            <button className={mode === 'fill' ? 'sel' : ''} onClick={() => setMode('fill')}>
              🪣 색칠
            </button>
            <button className={mode === 'free' ? 'sel' : ''} onClick={() => setMode('free')}>
              ✏️ 그리기
            </button>
          </section>

          <section className="palette">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`swatch ${color === c ? 'sel' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`색상 ${c}`}
              />
            ))}
          </section>

          {mode === 'fill' ? (
            <button
              className="big-btn fill-btn"
              disabled={!livePoint || !joined}
              onClick={() => {
                if (livePoint) sendFill(livePoint.x, livePoint.y, color);
              }}
            >
              이 위치 채우기
            </button>
          ) : (
            <button
              className={`big-btn stroke-btn ${paintOn ? 'danger' : ''}`}
              disabled={!joined}
              onClick={() => {
                const next = !paintOn;
                setPaintOn(next);
                onPaintToggle(next);
              }}
            >
              {paintOn ? '선 끝기' : '선 긋기 시작'}
            </button>
          )}

          <section className="progress-section">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="progress-text">{Math.round(progress * 100)}% 완료</span>
          </section>

          <section className="actions">
            <button className="btn-ghost" onClick={onUndo} disabled={!joined}>
              ↩ 실행취소
            </button>
          </section>
        </>
      )}

      {isGallery && (
        <section className="gallery-actions">
          <p className="gallery-text">작품이 갤러리에 저장되었습니다!</p>
          <button className="big-btn" onClick={onNextArt}>
            다음 작품 색칠하기
          </button>
          <button className="btn-ghost" onClick={onGoHome}>
            처음으로
          </button>
        </section>
      )}

      <footer className="debug">
        <span>
          손: {livePoint ? `(${livePoint.x.toFixed(2)}, ${livePoint.y.toFixed(2)})` : '감지 없음'} · {fps ?? 0}fps
        </span>
        {tvConnected && <button className="btn-ghost small" onClick={onDisconnect}>TV 연결 해제</button>}
      </footer>
    </div>
  );
}