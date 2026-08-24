import type { TVCommand } from '@ht/protocol';

export interface TVCommandSenderCallbacks {
  onStatusChange?: (status: 'idle' | 'connecting' | 'open' | 'closed' | 'error') => void;
  onError?: (error: string) => void;
}

/**
 * TV로 TVCommand 전송 전용 WebSocket 채널
 * - 서버 릴레이 경유 (폰 → 서버 → TV)
 * - 재접속 백오프 내장
 */
export class TVCommandSender {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: TVCommandSenderCallbacks;
  private retryMs = 1000;
  private closed = false;
  private sendQueue: TVCommand[] = [];

  constructor(url: string, callbacks: TVCommandSenderCallbacks = {}) {
    this.url = url;
    this.callbacks = callbacks;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.closed = false;
    this.retryMs = 1000;
    this.doConnect();
  }

  disconnect() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  send(cmd: TVCommand) {
    const text = JSON.stringify(cmd);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(text);
    } else {
      this.sendQueue.push(cmd);
    }
  }

  private doConnect() {
    this.callbacks.onStatusChange?.('connecting');
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.handleError(`WebSocket 생성 실패: ${e}`);
      return;
    }

    this.ws.onopen = () => {
      this.retryMs = 1000;
      this.callbacks.onStatusChange?.('open');
      // 큐에 쌓인 커맨드 플러시
      while (this.sendQueue.length > 0) {
        const cmd = this.sendQueue.shift()!;
        this.ws?.send(JSON.stringify(cmd));
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onStatusChange?.(this.closed ? 'closed' : 'connecting');
      if (!this.closed) {
        setTimeout(() => this.doConnect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 5000);
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onStatusChange?.('error');
    };
  }

  private handleError(msg: string) {
    this.callbacks.onError?.(msg);
    console.error('[TVCommandSender]', msg);
  }

  getStatus(): 'idle' | 'connecting' | 'open' | 'closed' | 'error' {
    if (!this.ws) return 'idle';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN: return 'open';
      case WebSocket.CLOSING: return 'closed';
      case WebSocket.CLOSED: return 'closed';
      default: return 'error';
    }
  }

  updateUrl(newUrl: string) {
    this.url = newUrl;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect();
      this.connect();
    }
  }
}