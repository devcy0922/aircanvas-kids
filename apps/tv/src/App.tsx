import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientEvent } from '@ht/protocol';
import { parseTVCommand, wsUrl } from '@ht/protocol';
import { TVCommandHandler } from './engine/TVCommandHandler';
import { useWsChannel } from './hooks/useWsChannel';

type Phase = 'connecting' | 'ready';

function getDefaultServerBase(): string {
  const q = new URLSearchParams(location.search);
  const explicit = q.get('server');
  if (explicit) return explicit;
  const isHttps = location.protocol === 'https:';
  const hasKidsSubpath = location.pathname.startsWith('/kids');
  const subpathPrefix = hasKidsSubpath ? '/kids' : '';

  if (isHttps || (location.port !== '5173' && location.port !== '5174' && location.port !== '3000')) {
    return `${location.protocol}//${location.host}${subpathPrefix}`;
  }
  return `http://${location.hostname}:8180${subpathPrefix}`;
}

const SERVER_BASE = getDefaultServerBase();

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

  const roomCode = new URLSearchParams(location.search).get('room') ?? 'DEMO01';
  const { status } = useWsChannel(wsUrl(SERVER_BASE, 'tv', roomCode), onEvent);

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
    <div className="tv-root" style={{ width: '100vw', height: '100vh', background: '#181a20', position: 'relative', overflow: 'hidden' }}>
      <canvas ref={canvasRef} className="tv-canvas" style={{ width: '100%', height: '100%', display: 'block' }} />
      {phase === 'connecting' && (
        <div className="overlay center" style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          background: 'rgba(24, 26, 32, 0.95)',
          zIndex: 10,
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <h1 style={{ fontSize: '3rem', margin: '0 0 12px 0', color: '#f4a261', letterSpacing: '-1px' }}>🎨 AirCanvas Kids</h1>
          <p style={{ fontSize: '1.25rem', margin: '0 0 24px 0', opacity: 0.9 }}>
            스마트폰에서 <strong style={{ color: '#e76f51' }}>play.aircanvas.kr/kids/phone/</strong> 로 접속해 주세요!
          </p>
          <div style={{
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '16px 36px',
            borderRadius: '16px',
            border: '2px dashed #e76f51',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '0.9rem', opacity: 0.7, display: 'block', marginBottom: '4px' }}>TV 방 코드</span>
            <span style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '4px', color: '#2a9d8f' }}>{roomCode}</span>
          </div>
          <div style={{ marginTop: '28px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.7, fontSize: '0.9rem' }}>
            <div className="spinner" style={{ width: 16, height: 16, border: '2px solid #555', borderTopColor: '#2a9d8f', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>스마트폰 연결 대기 중... ({status === 'open' ? '서버 연결됨' : '서버 접속 중'})</span>
          </div>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  );
}