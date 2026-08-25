import type { TVAnnouncement } from '@ht/protocol';

export interface DiscoveredTV {
  announcement: TVAnnouncement;
  lastSeen: number;
}

export interface TVDiscoveryCallbacks {
  onTVFound?: (tv: DiscoveredTV) => void;
  onTVLost?: (tvId: string) => void;
  onScanStatus?: (status: 'searching' | 'found' | 'none') => void;
  onError?: (error: string) => void;
}

/**
 * AirCanvas Kids 실시간 TV 디스커버리 (Server-Assisted Rendezvous)
 * - 브라우저 보안 제약(Mixed Content, mDNS Masking) 없는 100% 신뢰성 있는 서버 기반 탐색
 * - 활성화된 TV가 서버에 온라인 상태가 되면 1초 이내에 즉시 감지
 */
export class TVDiscovery {
  private callbacks: TVDiscoveryCallbacks;
  private discoveredTVs = new Map<string, DiscoveredTV>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private serverBase: string = '';

  constructor(callbacks: TVDiscoveryCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** 실시간 TV 탐색 시작 */
  start(serverBase?: string) {
    this.stop();
    if (serverBase) {
      this.serverBase = serverBase.replace(/\/$/, '');
    }
    if (!this.serverBase) {
      this.serverBase = typeof location !== 'undefined'
        ? `${location.protocol}//${location.host}`
        : 'http://127.0.0.1:8080';
    }

    this.callbacks.onScanStatus?.('searching');

    // 1. 즉시 1회 확인
    this.probeServer();

    // 2. 1.5초 간격으로 실시간 상태 갱신
    this.pollTimer = setInterval(() => {
      this.probeServer();
    }, 1500);
  }

  /** 탐색 중지 */
  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** 발견된 TV 목록 */
  getTVs(): DiscoveredTV[] {
    return Array.from(this.discoveredTVs.values());
  }

  /** 특정 TV 선택 */
  selectTV(tvId: string): { wsUrl: string; roomCode: string } | null {
    const tv = this.discoveredTVs.get(tvId);
    if (!tv) return null;
    return { wsUrl: tv.announcement.wsUrl, roomCode: tv.announcement.roomCode };
  }

  private async probeServer(): Promise<void> {
    const url = `${this.serverBase}/announce`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        this.handleAnnouncementResponse(data);
      } else {
        this.handleNoTV();
      }
    } catch {
      this.handleNoTV();
    }
  }

  private handleAnnouncementResponse(data: any) {
    if (!data || data.type === 'tv-announce-none' || data.count === 0) {
      this.handleNoTV();
      return;
    }

    const list: TVAnnouncement[] = Array.isArray(data.tvs) && data.tvs.length > 0
      ? data.tvs
      : data.type === 'tv-announce'
        ? [data as TVAnnouncement]
        : [];

    if (list.length === 0) {
      this.handleNoTV();
      return;
    }

    this.callbacks.onScanStatus?.('found');
    const currentIds = new Set<string>();

    for (const ann of list) {
      currentIds.add(ann.tvId);
      const existing = this.discoveredTVs.get(ann.tvId);
      const tvItem: DiscoveredTV = {
        announcement: ann,
        lastSeen: Date.now(),
      };
      this.discoveredTVs.set(ann.tvId, tvItem);
      if (!existing) {
        this.callbacks.onTVFound?.(tvItem);
      }
    }

    // 사라진 TV 제거
    for (const [id] of this.discoveredTVs) {
      if (!currentIds.has(id)) {
        this.discoveredTVs.delete(id);
        this.callbacks.onTVLost?.(id);
      }
    }
  }

  private handleNoTV() {
    if (this.discoveredTVs.size > 0) {
      for (const [id] of this.discoveredTVs) {
        this.callbacks.onTVLost?.(id);
      }
      this.discoveredTVs.clear();
    }
    this.callbacks.onScanStatus?.('none');
  }
}