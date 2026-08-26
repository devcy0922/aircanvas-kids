import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent } from '@ht/protocol';
import { parseTVCommand, wsUrl } from '@ht/protocol';
import { TVCommandHandler } from './engine/TVCommandHandler';
import { useWsChannel } from './hooks/useWsChannel';

type Phase = 'connecting' | 'ready';

const SERVER_BASE = (() => {
  const q = new URLSearchParams(location.search);
  return q.get('server') ?? `${location.protocol}//${location.hostname}:7180`;
})();

export function App() {
  const [phase, setPhase] = useState<Phase>('connecting');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handlerRef = useRef<TVCommandHandler | null>(null);

  const onEvent = useCallback((ev: ClientEvent) => {
    if (ev.type === 'welcome') {
      setPhase('ready');
      return;
    }
    const cmd = parseTVCommand(JSON.stringify(ev));
    if (cmd) {
      handlerRef.current?.handleCommand(cmd);
    }
  }, []);

  const { status } = useWsChannel(wsUrl(SERVER_BASE, 'tv', new URLSearchParams(location.search).get('room') ?? 'DEMO01'), onEvent);

  useEffect(() => {
    if (!canvasRef.current) return;
    const handler = new TVCommandHandler(canvasRef.current, {
      onProgress: (pct, name) => console.log('[TV] Progress:', pct, name),
      onComplete: (name) => console.log('[TV] Complete:', name),
      onError: (err) => console.error('[TV] Error:', err),
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
        <div className="overlay center" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', zIndex: 10 }}>
          <div className="spinner" style={{ width: 48, height: 48, border: '4px solid #333', borderTopColor: '#e63946', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16 }}>TV 대기 중... (서버: {SERVER_BASE})</p>
          <p style={{ fontSize: 12, opacity: 0.7 }}>WS 상태: {status}</p>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  );
}