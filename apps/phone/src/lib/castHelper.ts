/**
 * AirCanvas Kids TV 원격 실행 & 캐스팅 헬퍼
 * - W3C Presentation API (스마트 TV / AirPlay / DLNA / Miracast 지원 기기)
 * - Google Cast API (Chromecast / Google TV / Android TV)
 */

declare global {
  interface Window {
    PresentationRequest?: new (urls: string[]) => any;
    cast?: any;
    chrome?: any;
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
  }
}

export class CastHelper {
  private tvUrl: string;
  private presentationRequest: any = null;
  private isCastAvailable = false;

  constructor(tvUrl: string) {
    this.tvUrl = tvUrl;
    this.initPresentationAPI();
    this.initGoogleCast();
  }

  setTvUrl(url: string) {
    this.tvUrl = url;
    this.initPresentationAPI();
  }

  /** W3C 표준 Presentation API 초기화 */
  private initPresentationAPI() {
    if (typeof window !== 'undefined' && window.PresentationRequest) {
      try {
        this.presentationRequest = new window.PresentationRequest([this.tvUrl]);
      } catch (e) {
        console.warn('[CastHelper] PresentationRequest error:', e);
      }
    }
  }

  /** Google Cast Sender SDK 초기화 */
  private initGoogleCast() {
    if (typeof window === 'undefined') return;

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable && window.cast && window.cast.framework) {
        try {
          const context = window.cast.framework.CastContext.getInstance();
          context.setOptions({
            receiverApplicationId: 'CC1AD845', // Default Media Receiver / Custom Web Receiver
            autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          });
          this.isCastAvailable = true;
          console.log('[CastHelper] Google Cast SDK Ready');
        } catch (e) {
          console.warn('[CastHelper] CastContext init error:', e);
        }
      }
    };

    // Cast SDK 스크립트 동적 로드
    if (!document.getElementById('gcast-sdk')) {
      const script = document.createElement('script');
      script.id = 'gcast-sdk';
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
      document.head.appendChild(script);
    }
  }

  /**
   * TV로 화면 띄우기 요청 (원클릭)
   * 1. Presentation API 시도 (스마트 TV, 무선 디스플레이)
   * 2. Google Cast 시도 (Chromecast, Android TV)
   */
  async launchTV(): Promise<{ success: boolean; message?: string }> {
    // 1. Presentation API
    if (this.presentationRequest) {
      try {
        await this.presentationRequest.start();
        return { success: true, message: 'TV에 화면을 전송했습니다.' };
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.warn('[CastHelper] Presentation start failed:', err);
        }
      }
    }

    // 2. Google Cast
    if (window.cast?.framework) {
      try {
        const context = window.cast.framework.CastContext.getInstance();
        await context.requestSession();
        return { success: true, message: 'Google Cast로 TV에 연결했습니다.' };
      } catch (err: any) {
        console.warn('[CastHelper] Cast session error:', err);
      }
    }

    return {
      success: false,
      message: '지원되는 스마트 TV 또는 캐스트 기기를 찾지 못했습니다. TV 브라우저에서 접속하거나 TV 홈 화면 바로가기를 이용해 주세요.',
    };
  }

  isSupported(): boolean {
    return !!(typeof window !== 'undefined' && (window.PresentationRequest || this.isCastAvailable));
  }
}
