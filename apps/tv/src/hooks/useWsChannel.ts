import { useEffect, useRef, useState } from 'react';
import type { ClientEvent } from '@ht/protocol';

export type WsStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

/**
 * 서버 릴레이와의 WebSocket 채널 훅.
 * - 재접속 백오프(1s → 최대 5s)
 * - 수신 메시지는 onEvent 콜백으로 위임
 * - send는 채널이 열렸을 때만 전송
 */
export function useWsChannel(url: string, onEvent: (ev: ClientEvent) => void) {
  const [status, setStatus] = useState<WsStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!url) return;
    let closed = false;
    let retryMs = 1000;
    let ws: WebSocket | null = null;

    const connect = () => {
      setStatus('connecting');
      try {
        ws = new WebSocket(url);
      } catch {
        setStatus('error');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        retryMs = 1000;
        setStatus('open');
        // TV 역할 선언 (서버는 방 매칭에 사용)
        ws?.send(
          JSON.stringify({
            type: 'hello-tv',
            displayName: 'TV',
            screen: { w: window.innerWidth, h: window.innerHeight },
          }),
        );
      };
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(String(e.data)) as ClientEvent;
          handlerRef.current(ev);
        } catch {
          /* 파싱 실패 프레임 무시 */
        }
      };
      ws.onclose = () => {
        setStatus(closed ? 'closed' : 'connecting');
        if (!closed) {
          setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 5000);
        }
      };
      ws.onerror = () => setStatus('error');
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [url]);

  const send = (text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(text);
    }
  };

  return { status, send };
}
