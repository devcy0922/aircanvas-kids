import type { TVAnnouncement } from '@ht/protocol';

export interface DiscoveredTV {
  announcement: TVAnnouncement;
  lastSeen: number;
}

export interface TVDiscoveryCallbacks {
  onTVFound?: (tv: DiscoveredTV) => void;
  onTVLost?: (tvId: string) => void;
  onError?: (error: string) => void;
}

/**
 * 로컬 네트워크에서 TV 탐색
 * - mDNS (bonjour/avahi) 지원 시: _aircanvas._tcp.local 쿼리
 * - 폴백: HTTP 브로드캐스트 (255.255.255.255) 또는 서브넷 스캔
 * - TV는 주기적으로 /announce 엔드포인트로 자기 알림
 */
export class TVDiscovery {
  private callbacks: TVDiscoveryCallbacks;
  private discoveredTVs = new Map<string, DiscoveredTV>();
  private scanInterval: ReturnType<typeof setInterval> | null = null;
  private broadcastSocket: WebSocket | null = null;
  private serverBase?: string;

  constructor(callbacks: TVDiscoveryCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** 탐색 시작 */
  start(serverBase?: string) {
    this.stop();
    if (serverBase) this.serverBase = serverBase;

    // 1. 현재 접속한 서버의 /announce 즉시 확인 (가장 빠름: 50ms 이내)
    if (this.serverBase) {
      this.probeServerUrl(this.serverBase);
    }

    // 2. HTTP 서브넷 스캔
    this.startHTTPDiscovery();

    // 3. 주기적 재스캔 (5초마다)
    this.scanInterval = setInterval(() => {
      if (this.serverBase) this.probeServerUrl(this.serverBase);
      this.startHTTPDiscovery();
    }, 5000);
  }

  /** 탐색 중지 */
  stop() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    this.broadcastSocket?.close();
    this.broadcastSocket = null;
  }

  /** 발견된 TV 목록 반환 */
  getTVs(): DiscoveredTV[] {
    const now = Date.now();
    // 30초 이상 응답 없으면 제거
    for (const [id, tv] of this.discoveredTVs) {
      if (now - tv.lastSeen > 30000) {
        this.discoveredTVs.delete(id);
        this.callbacks.onTVLost?.(id);
      }
    }
    return Array.from(this.discoveredTVs.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  /** 특정 TV 선택 → 연결 정보 반환 */
  selectTV(tvId: string): { wsUrl: string; roomCode: string } | null {
    const tv = this.discoveredTVs.get(tvId);
    if (!tv) return null;
    let url = tv.announcement.wsUrl;
    // 만약 wsUrl이 127.0.0.1/localhost인데 serverBase가 다른 호스트인 경우 serverBase 기준 wsUrl로 치환
    if (this.serverBase && (url.includes('127.0.0.1') || url.includes('localhost'))) {
      const isHttps = this.serverBase.startsWith('https://');
      const wsProtocol = isHttps ? 'wss://' : 'ws://';
      const cleanHost = this.serverBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
      url = `${wsProtocol}${cleanHost}/ws?role=phone&room=${encodeURIComponent(tv.announcement.roomCode)}`;
    }
    return { wsUrl: url, roomCode: tv.announcement.roomCode };
  }

  private async probeServerUrl(serverBase: string): Promise<void> {
    const cleanBase = serverBase.replace(/\/$/, '');
    const url = `${cleanBase}/announce`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        this.handleAnnouncement(data, url);
      }
    } catch {
      // 무시
    }
  }



  private startHTTPDiscovery() {
    // 방법 1: 브로드캐스트 UDP (브라우저에서 불가)
    // 방법 2: 알려진 서브넷 범위 스캔 (fetch로 /announce 호출)
    // 방법 3: 웹소켓 브로드캐스트 서버 경유 (릴레이 서버가 중계)
    this.discoverViaRelayServer();
  }

  private async discoverViaRelayServer() {
    // 릴레이 서버의 /health 또는 /tvs 엔드포인트 활용
    // 현재 서버에 TV 목록 API가 없으므로 로컬 스캔 방식 사용
    this.scanLocalSubnet();
  }

  private async scanLocalSubnet() {
    const baseIp = await this.getLocalIPBase();
    if (!baseIp) return;

    // 일반적인 홈 네트워크: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
    // 마지막 옥텟 1-254 스캔 (병렬, 타임아웃 짧게)
    const promises: Promise<void>[] = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${baseIp}.${i}`;
      promises.push(this.probeTV(ip));
    }
    await Promise.allSettled(promises);
  }

  private async getLocalIPBase(): Promise<string | null> {
    // WebRTC로 로컬 IP 알아내기
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      await pc.createOffer().then((offer) => pc.setLocalDescription(offer));
      return new Promise<string | null>((resolve) => {
        const handler = (e: RTCPeerConnectionIceEvent) => {
          if (e.candidate) {
            const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+)\.\d+/);
            if (match) {
              pc.onicecandidate = null;
              pc.close();
              resolve(match[1]);
            }
          }
        };
        pc.onicecandidate = handler;
        setTimeout(() => { pc.onicecandidate = null; pc.close(); resolve(null); }, 1000);
      });
    } catch {
      return null;
    }
  }

  private async probeTV(ip: string): Promise<void> {
    // TV의 /announce 엔드포인트 호출 (HTTP)
    // CORS 문제로 fetch 실패 가능 → no-cors 모드 시도 후 웹소켓으로 폴백
    const urls = [
      `http://${ip}:8080/announce`,
      `http://${ip}:3000/announce`,
      `http://${ip}:5173/announce`,
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 500);
        const res = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          this.handleAnnouncement(data, url);
          return;
        }
      } catch {
        // 다음 URL 시도
      }
    }
  }

  private handleAnnouncement(data: any, _sourceUrl: string) {
    if (!data || data.type !== 'tv-announce') return;
    const announcement = data as TVAnnouncement;
    const existing = this.discoveredTVs.get(announcement.tvId);
    this.discoveredTVs.set(announcement.tvId, {
      announcement,
      lastSeen: Date.now(),
    });
    if (!existing) {
      this.callbacks.onTVFound?.({
        announcement,
        lastSeen: Date.now(),
      });
    }
  }
}

/** TV 측에서 구현해야 할 /announce 응답 예시
GET /announce
{
  "type": "tv-announce",
  "roomCode": "ABC123",
  "tvName": "Living Room TV",
  "tvId": "tv-abc123",
  "wsUrl": "ws://192.168.0.10:8080/ws?role=tv&room=ABC123",
  "httpUrl": "http://192.168.0.10:8080",
  "capabilities": {
    "maxResolution": { "width": 1920, "height": 1080 },
    "supportsWebGL2": true,
    "supportsWASMSIMD": true,
    "pixiVersion": "8.6.6"
  },
  "timestamp": 1724448000000
}
*/