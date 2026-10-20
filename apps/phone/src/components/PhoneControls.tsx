import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ArtworkPack, ThemePack, GamePhase } from '@ht/protocol';
import { APP_VERSION_LABEL, PALETTE } from '@ht/protocol';

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
  onStartTheme: () => void;
  onSelectArtwork: (artworkId: string) => void;
  currentTheme: ThemePack | undefined;
  themes: ThemePack[];
  selectedArtwork: ArtworkPack | undefined;
  gamePhase: GamePhase;
  onUndo: () => void;
  onNextArt: () => void;
  onSkipArtwork: () => void;
  onExport: () => void;
  onGoHome: () => void;
  progress: number;
  tvConnected: boolean;
  onDisconnect: () => void;
  onCastTV?: () => void;
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
  onStartTheme,
  onSelectArtwork,
  currentTheme,
  themes,
  selectedArtwork,
  gamePhase,
  onUndo,
  onNextArt,
  onSkipArtwork,
  onExport,
  onGoHome,
  progress,
  tvConnected,
  onDisconnect,
  roomInput,
  setRoomInput,
  onJoin,
  onCastTV,
}: Props) {
  const [paintOn, setPaintOn] = useState(false);

  // Discover screen mode
  const isDiscover = !joined && !!roomInput;

  const isLobby = gamePhase === 'lobby';
  const isPlaying = gamePhase === 'playing';
  const isGallery = gamePhase === 'gallery';
  const isWorld = gamePhase === 'world';

  return (
    <div className="phone-root">
      <header>
        <h1>AirCanvas</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onCastTV && !tvConnected && (
            <button className="btn-ghost small" onClick={onCastTV} title="스마트 TV로 화면 띄우기">
              📺 TV로 띄우기
            </button>
          )}
          <span className={`badge ${tvConnected ? 'ok' : ''}`}>
            {tvConnected ? 'TV 연결됨' : status}
          </span>
        </div>
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
          <div className="lobby-heading">
            <div>
              <p className="section-kicker">두 번째 장면</p>
              <h2 className="lobby-title">어느 세계로 갈까요?</h2>
            </div>
            <span className="lobby-step">02 / 03</span>
          </div>
          <div className="theme-grid">
            {themes.map((t) => (
              <button
                key={t.id}
                disabled={!joined}
                className={currentTheme?.id === t.id ? 'selected' : ''}
                data-testid={`theme-${t.id}`}
                onClick={() => onSelectTheme(t.id)}
                style={{ '--theme-accent': t.accentColor } as CSSProperties}
              >
                <span className="theme-emoji">{t.emoji ?? '🎨'}</span>
                <span>{t.label}</span>
                <small>{t.tagline ?? ''}</small>
              </button>
            ))}
          </div>
          <div className={`theme-choice ${currentTheme ? 'has-selection' : ''}`}>
            {currentTheme ? (
              <>
                <div>
                  <span className="theme-choice__label">선택한 세계</span>
                  <strong>{currentTheme.label}에서 첫 작품을 준비해요</strong>
                </div>
                <button
                  className="big-btn theme-start-btn"
                  data-testid="theme-start"
                  disabled={!joined || artworks.length === 0}
                  onClick={onStartTheme}
                >
                  이 테마로 시작 <span aria-hidden="true">→</span>
                </button>
              </>
            ) : (
              <p>테마 카드를 고르면 시작 버튼이 나타나요.</p>
            )}
          </div>
        </section>
      )}

      {!isLobby && !isWorld && currentTheme && (
        <section className="theme-info">
          <span className="theme-badge" style={{ background: currentTheme.accentColor }}>
            {currentTheme.emoji ?? '🎨'} {currentTheme.label}
          </span>
        </section>
      )}

      {!isLobby && !isWorld && (
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
            <button className="btn-ghost" data-testid="skip-artwork" onClick={onSkipArtwork} disabled={!joined}>
              다음으로 (건너뛰기)
            </button>
          </section>
        </>
      )}

      {isGallery && (
        <section className="gallery-actions">
          <p className="gallery-text">
            {progress >= 0.85 ? '작품이 갤러리에 저장되었습니다!' : '여기까지 만든 모습 그대로 다음 장면으로 갈 수 있어요.'}
          </p>
          <button className="big-btn export-btn" data-testid="export-world" onClick={onExport}>
            내 캐릭터 정글로 내보내기
          </button>
          <button className="big-btn" onClick={onNextArt}>
            다음 작품 색칠하기
          </button>
          <button className="btn-ghost" onClick={onGoHome}>
            처음으로
          </button>
        </section>
      )}

      {isWorld && (
        <section className="gallery-actions world-actions">
          <p className="gallery-text">내 캐릭터가 실제 정글을 돌아다니고 있어요!</p>
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
        <span className="version-label">{APP_VERSION_LABEL}</span>
      </footer>
    </div>
  );
}
