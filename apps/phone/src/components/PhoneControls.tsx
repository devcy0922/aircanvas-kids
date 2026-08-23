import { useState } from 'react';
import type { Artwork } from '@ht/tv-art';
import { THEME_META } from '@ht/tv-art';
import { PALETTE } from '@ht/protocol';
import type { ThemeId } from '@ht/protocol';

type Mode = 'fill' | 'free';

const THEME_ORDER: ThemeId[] = ['dino', 'jungle', 'ocean'];

interface Props {
  roomInput: string;
  setRoomInput: (v: string) => void;
  onJoin: () => void;
  joined: boolean;
  status: string;
  /** 현재 추적 좌표(TV 정규화) — 디버그 표시용 */
  livePoint?: { x: number; y: number } | null;
  fps?: number;
  mode: Mode;
  setMode: (m: Mode) => void;
  color: string;
  setColor: (c: string) => void;
  /** 자유선 그리기 토글 (true=시작, false=종료) */
  onPaintToggle: (on: boolean) => void;
  sendFill: (x: number, y: number, color: string) => void;
  onSelectTheme: (t: ThemeId) => void;
  onSelectArtwork: (t: ThemeId, index: number) => void;
  artworks: Artwork[];
  artIndex: number;
}

/**
 * 폰 컨트롤러 화면:
 *  - 방 코드 입력 또는 QR 자동 입장 → 서버 접속
 *  - 테마(공룡/정글/바다) 선택 → TV 게임 시작
 *  - 테마 내 작품 선택 → TV가 해당 그림 로드
 *  - 모드(색칠/그리기)와 8색 팔레트, 채우기/스트로크 전송
 */
export function PhoneControls({
  roomInput,
  setRoomInput,
  onJoin,
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
  onSelectTheme,
  onSelectArtwork,
  artworks,
  artIndex,
}: Props) {
  const [paintOn, setPaintOn] = useState(false);

  return (
    <div className="phone-root">
      <header>
        <h1>AirCanvas</h1>
        <span className={`badge ${joined ? 'ok' : ''}`}>{status}</span>
      </header>

      <section className="join">
        <input
          value={roomInput}
          onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
          maxLength={6}
          placeholder="방 코드"
          inputMode="text"
          autoComplete="off"
        />
        <button onClick={onJoin} disabled={roomInput.length !== 6}>
          연결
        </button>
      </section>

      <section>
        <h2 className="section-title">테마 선택</h2>
        <div className="theme-grid">
          {THEME_ORDER.map((t) => (
            <button key={t} disabled={!joined} onClick={() => onSelectTheme(t)} style={{ borderColor: THEME_META[t].accent }}>
              <span className="theme-emoji">{t === 'dino' ? '🦕' : t === 'jungle' ? '🐒' : '🐠'}</span>
              {THEME_META[t].label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">작품 고르기</h2>
        <div className="arts">
          {artworks.map((a, i) => (
            <button
              key={a.id}
              disabled={!joined}
              className={`art-chip ${i === artIndex ? 'sel' : ''}`}
              onClick={() => {
                const theme = a.theme as ThemeId;
                onSelectArtwork(theme, i);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      </section>

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
          className="big-btn"
          disabled={!livePoint || !joined}
          onClick={() => {
            if (livePoint) sendFill(livePoint.x, livePoint.y, color);
          }}
        >
          이 위치 채우기
        </button>
      ) : (
        <button
          className={`big-btn ${paintOn ? 'danger' : ''}`}
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

      <footer className="debug">
        <span>
          손: {livePoint ? `(${livePoint.x.toFixed(2)}, ${livePoint.y.toFixed(2)})` : '감지 없음'} · {fps ?? 0}fps
        </span>
      </footer>
    </div>
  );
}
