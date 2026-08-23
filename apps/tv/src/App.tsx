import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientEvent } from '@ht/protocol';
import type { ThemeId } from '@ht/protocol';
import { makeRoomCode, wsUrl } from '@ht/protocol';
import { ALL_ARTWORKS, THEME_META } from '@ht/tv-art';
import type { Artwork, Theme } from '@ht/tv-art';
import { useWsChannel } from './hooks/useWsChannel';
import { GameEngine } from './engine/GameEngine';
import { HomeScene } from './scenes/HomeScene';
import { DrawScene } from './scenes/DrawScene';
import { GalleryScene } from './scenes/GalleryScene';

type Phase = 'home' | 'calib' | 'draw' | 'reveal' | 'gallery';

const THEMES: Theme[] = ['dino', 'jungle', 'ocean'];

/** 릴레이 서버 기준 URL (?server= 로 오버라이드 가능) */
const SERVER_BASE = (() => {
  const q = new URLSearchParams(location.search);
  return q.get('server') ?? `${location.protocol}//${location.hostname}:8080`;
})();

/** 폰 앱 기준 URL — QR 에 인코딩된다 (?phoneApp= 또는 ?phonePort= 로 오버라이드) */
const PHONE_APP_BASE = (() => {
  const q = new URLSearchParams(location.search);
  if (q.get('phoneApp')) return q.get('phoneApp')!;
  return `${location.protocol}//${location.hostname}:${q.get('phonePort') ?? '5174'}`;
})();

export function App() {
  const [phase, setPhase] = useState<Phase>('home');
  const [room, setRoom] = useState(() => makeRoomCode());
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [theme, setTheme] = useState<Theme>('dino');
  const [artworks, setArtworks] = useState<Artwork[]>(() => ALL_ARTWORKS.filter((a) => a.theme === 'dino'));
  const [artIndex, setArtIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const drawModeRef = useRef<'fill' | 'free'>('fill');
  const colorRef = useRef('#e63946');

  // --- 폰 제어 수신: select-* 메시지는 최신 핸들러로 위임 (ref 경유) ---
  const selectHandlersRef = useRef<{
    handleSelectTheme: (t: ThemeId) => void;
    handleSelectArtwork: (t: ThemeId, index: number) => void;
  } | null>(null);

  // --- WebSocket 채널 (서버 릴레이) ---
  const onEvent = useCallback(
    (ev: ClientEvent) => {
      const engine = engineRef.current;
      switch (ev.type) {
        case 'welcome':
          break;
        case 'peer-joined':
          if (ev.role === 'phone') setPhoneConnected(true);
          break;
        case 'peer-left':
          if (ev.role === 'phone') {
            setPhoneConnected(false);
            engine?.setCursorVisible(false);
          }
          break;
        case 'point':
          if (!('x' in ev)) break;
          engine?.onPoint(ev.x, ev.y);
          break;
        case 'fill':
          if (!('x' in ev)) break;
          engine?.onFill(ev.x, ev.y, ev.color);
          break;
        case 'stroke-start':
          engine?.beginStroke(ev.color);
          break;
        case 'stroke-end':
          engine?.endStroke();
          break;
        case 'undo':
          engine?.undo();
          break;
        case 'select-theme':
          selectHandlersRef.current?.handleSelectTheme(ev.theme as Theme);
          break;
        case 'select-artwork':
          selectHandlersRef.current?.handleSelectArtwork(ev.theme as Theme, ev.index);
          break;
      }
    },
    [],
  );

  const { status, send } = useWsChannel(wsUrl(SERVER_BASE, 'tv', room), onEvent);

  // --- 엔진 초기화: PixiJS는 React 렌더 사이클 밖에서 캔버스를 소유한다 ---
  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new GameEngine(canvasRef.current, {
      onComplete: (pct) => {
        setProgress(pct);
        if (pct >= 0.85) {
          setTimeout(() => setPhase('reveal'), 900);
        }
      },
    });
    engineRef.current = engine;
    engine.start();
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // --- 씬 전환 시 엔진에 현재 아트워크 반영 ---
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (phase === 'draw') {
      const art = artworks[artIndex];
      if (art) engine.loadArtwork(art);
    }
    if (phase === 'gallery') engine.showGallery(theme, artworks.slice(0, artIndex + 1));
    if (phase === 'home' || phase === 'calib') engine.showBackdrop(theme);
  }, [phase, theme, artworks, artIndex]);

  useEffect(() => {
    if (phase !== 'draw') return;
    const timer = setInterval(() => {
      const p = engineRef.current?.getProgress() ?? 0;
      setProgress(p);
    }, 500);
    return () => clearInterval(timer);
  }, [phase]);

  // --- 폴백 입력: 마우스/터치로도 동일한 경로를 태울 수 있게 한다 (데모/테스트용) ---
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toNorm = (e: PointerEvent) => ({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
    let down = false;
    const onDown = (e: PointerEvent) => {
      if (phase !== 'draw') return;
      down = true;
      const p = toNorm(e);
      if (drawModeRef.current === 'free') engineRef.current?.beginStroke(colorRef.current);
      else engineRef.current?.onFill(p.x, p.y, colorRef.current);
      engineRef.current?.onPoint(p.x, p.y, true, colorRef.current);
    };
    const onMove = (e: PointerEvent) => {
      if (phase !== 'draw') return;
      const p = toNorm(e);
      engineRef.current?.onPoint(p.x, p.y, down && drawModeRef.current === 'fill', colorRef.current);
    };
    const onUp = () => {
      if (phase !== 'draw') return;
      down = false;
      engineRef.current?.endStroke();
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [phase]);

  // --- 폰 제어 수신: 테마/작품 선택은 폰이 주도한다 ---
  const handleSelectTheme = useCallback(
    (t: ThemeId) => {
      if (!THEMES.includes(t)) return;
      setTheme(t);
      const list = ALL_ARTWORKS.filter((a) => a.theme === t);
      setArtworks(list);
      setArtIndex(0);
      setPhase('calib');
    },
    [],
  );

  const handleSelectArtwork = useCallback(
    (t: ThemeId, index: number) => {
      const list = ALL_ARTWORKS.filter((a) => a.theme === t);
      if (!list[index]) return;
      setTheme(t);
      setArtworks(list);
      setArtIndex(index);
      setPhase('draw');
    },
    [],
  );

  useEffect(() => {
    selectHandlersRef.current = { handleSelectTheme, handleSelectArtwork };
  }, [handleSelectTheme, handleSelectArtwork]);

  const startDrawing = useCallback(() => setPhase('draw'), []);
  const nextArt = useCallback(() => {
    if (artIndex < artworks.length - 1) {
      setArtIndex((i) => i + 1);
      setPhase('draw');
    } else {
      setPhase('gallery');
    }
  }, [artIndex, artworks.length]);

  const art = artworks[artIndex];
  const meta = THEME_META[theme];

  const body = useMemo(() => {
    switch (phase) {
      case 'home':
        return (
          <HomeScene
            room={room}
            wsStatus={status}
            phoneConnected={phoneConnected}
            phoneAppBase={PHONE_APP_BASE}
            serverBase={SERVER_BASE}
            onRegenerate={() => setRoom(makeRoomCode())}
          />
        );
      case 'calib':
        return (
          <CalibrationOverlay
            room={room}
            connected={status === 'open' && phoneConnected}
            onStart={startDrawing}
          />
        );
      case 'draw':
        return (
          <DrawScene
            artworkName={art.name}
            progress={progress}
            accent={meta.accent}
            paletteHint
            onNext={nextArt}
            onUndo={() => send(JSON.stringify({ type: 'noop-undo' }))}
          />
        );
      case 'reveal':
        return (
          <RevealOverlay
            name={art.name}
            onDone={() => setPhase(artIndex < artworks.length - 1 ? 'gallery' : 'gallery')}
          />
        );
      case 'gallery':
        return (
          <GalleryScene
            themeLabel={meta.label}
            count={artIndex + 1}
            total={artworks.length}
            onBack={() => setPhase('home')}
            onNextArt={nextArt}
          />
        );
    }
  }, [phase, room, status, phoneConnected, art, artIndex, artworks, progress, meta, nextArt]);

  return (
    <div className="tv-root">
      <canvas ref={canvasRef} className="tv-canvas" />
      {body}
    </div>
  );
}

function CalibrationOverlay({ room, connected, onStart }: { room: string; connected: boolean; onStart: () => void }) {
  return (
    <div className="overlay center">
      <h2>캘리브레이션</h2>
      <p className="muted">폰에서 방 코드를 입력하고 화면의 네 점을 카메라로 비춰주세요.</p>
      <div className="room-code">{room}</div>
      <div className={`badge ${connected ? 'ok' : ''}`}>{connected ? '폰 연결됨' : '폰 대기 중…'}</div>
      <button className="btn primary" disabled={!connected} onClick={onStart}>
        그리기 시작
      </button>
    </div>
  );
}

function RevealOverlay({ name, onDone }: { name: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="overlay center reveal">
      <h1>완성!</h1>
      <p>
        <b>{name}</b> 가 테마 월드에 투입됩니다…
      </p>
    </div>
  );
}
