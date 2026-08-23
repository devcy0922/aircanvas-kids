import { useCallback, useEffect, useRef, useState } from 'react';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

/**
 * 폰 → 서버 WebSocket 채널 훅.
 * 좌표 프레임 전송은 이 훅의 sendRef 를 통해 추적 루프에서 직접 수행한다.
 */
export function useWsSend(url: string) {
  const [status, setStatus] = useState<WsStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!url) {
      setStatus('idle');
      return;
    }
    let disposed = false;
    let retryMs = 1000;
    setStatus('connecting');

    const connect = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;
        ws.onopen = () => {
          retryMs = 1000;
          setStatus('open');
          ws.send(JSON.stringify({ type: 'hello-phone', displayName: 'Phone' }));
        };
        ws.onclose = () => {
          setStatus('closed');
          if (!disposed) {
            setTimeout(connect, retryMs);
            retryMs = Math.min(retryMs * 2, 5000);
          }
        };
        ws.onerror = () => setStatus('error');
      } catch {
        setStatus('error');
      }
    };
    connect();

    return () => {
      disposed = true;
      wsRef.current?.close();
    };
  }, [url]);

  /** 채널이 열려 있으면 전송하고 성공 여부를 반환 */
  const send = useCallback((text: string): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(text);
      return true;
    }
    return false;
  }, []);

  return { status, send };
}
