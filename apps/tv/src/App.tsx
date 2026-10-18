import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent } from '@ht/protocol';
import { parseTVCommand, phoneJoinUrl, wsUrl } from '@ht/protocol';
import { TVCommandHandler } from './engine/TVCommandHandler';
import { useWsChannel } from './hooks/useWsChannel';
import { TVHomeScreen } from './components/TVHomeScreen';

type Phase = 'connecting' | 'home';
type TVScene = 'home' | 'calib' | 'play' | 'gallery';

const query = new URLSearchParams(location.search);
const ROOM_CODE = query.get('room') ?? 'DEMO01';

const SERVER_BASE = (() => {
  if (query.get('server')) return query.get('server')!;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `${location.protocol}//${location.hostname}:8180`;
  }
  // 운영 도메인은 Nginx가 /ws, /announce를 같은 출처로 중계한다.
  return location.origin;
})();

const PHONE_APP_BASE = query.get('phoneApp') ?? (
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? `${location.protocol}//${location.hostname}:7101`
    : location.origin
);
const PHONE_JOIN_URL = phoneJoinUrl(PHONE_APP_BASE, SERVER_BASE, ROOM_CODE);
const DEBUG_MODE = query.get('debug') === '1';

export function App() {
  const [phase, setPhase] = useState<Phase>('connecting');
  const [scene, setScene] = useState<TVScene>('home');
  const [lastCommand, setLastCommand] = useState('none');
  const [commandCount, setCommandCount] = useState(0);
  const [artworkId, setArtworkId] = useState('none');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlerRef = useRef<TVCommandHandler | null>(null);

  const onEvent = useCallback((ev: ClientEvent) => {
    if (ev.type === 'welcome') {
      setPhase('home');
      setScene('home');
      return;
    }
    const cmd = parseTVCommand(JSON.stringify(ev));
    if (cmd) {
      if (DEBUG_MODE) {
        setLastCommand(cmd.type);
        setCommandCount((count) => count + 1);
      }
      handlerRef.current?.handleCommand(cmd);
    }
  }, []);

  const { status } = useWsChannel(wsUrl(SERVER_BASE, 'tv', ROOM_CODE), onEvent);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handler = new TVCommandHandler(canvasRef.current, {
      onProgress: (pct, name) => console.log('[TV] Progress:', pct, name),
      onComplete: (name) => console.log('[TV] Complete:', name),
      onError: (err) => console.error('[TV] Error:', err),
      onSceneChange: (nextScene) => setScene(nextScene),
      onArtworkLoaded: (nextArtworkId) => setArtworkId(nextArtworkId),
    });
    handlerRef.current = handler;
    handler.start();
    return () => handler.destroy();
  }, []);

  useEffect(() => {
    const onResize = () => handlerRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 폴백: 마우스/터치로도 테스트 가능
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const toNorm = (e: PointerEvent) => ({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
    });
    let down = false;
    const onDown = (e: PointerEvent) => {
      down = true;
      const p = toNorm(e);
      handlerRef.current?.handleCommand({ type: 'set-cursor', x: p.x, y: p.y, visible: true, color: '#e63946' });
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const p = toNorm(e);
      handlerRef.current?.handleCommand({ type: 'set-cursor', x: p.x, y: p.y, visible: true });
    };
    const onUp = () => { down = false; };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  return (
    <div className="tv-root" style={{ width: '100vw', height: '100vh', background: '#111' }}>
      <canvas ref={canvasRef} className="tv-canvas" style={{ width: '100%', height: '100%', display: 'block' }} />
      {phase === 'connecting' && (
        <div className="overlay center" style={{ color: '#fff', zIndex: 10 }}>
          <div className="spinner" style={{ width: 48, height: 48, border: '4px solid #333', borderTopColor: '#e63946', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16 }}>TV 대기 중... (서버: {SERVER_BASE})</p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>WS 상태: {status}</p>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
      {phase === 'home' && scene === 'home' && (
        <TVHomeScreen roomCode={ROOM_CODE} joinUrl={PHONE_JOIN_URL} status={status} />
      )}
      {DEBUG_MODE && (
        <div className="tv-debug-state" data-testid="tv-debug-state">
          web-debug phase={phase} scene={scene} ws={status} content={artworkId} last={lastCommand} count={commandCount}
        </div>
      )}
    </div>
  );
}
