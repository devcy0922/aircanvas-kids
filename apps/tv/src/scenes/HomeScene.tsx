import { useMemo } from 'react';
import QRCode from 'qrcode';
import { phoneJoinUrl } from '@ht/protocol';

interface HomeSceneProps {
  room: string;
  wsStatus: string;
  phoneConnected: boolean;
  /** 폰 앱이 서빙되는 기준 URL (예: http://192.168.0.10:5174) */
  phoneAppBase: string;
  /** 릴레이 서버 기준 URL (예: http://192.168.0.10:8080) */
  serverBase: string;
  onRegenerate: () => void;
}

/** 홈 씬: QR 스캔 연결 + 방 코드(폴백). 테마 선택은 폰에서 진행한다. */
export function HomeScene({ room, wsStatus, phoneConnected, phoneAppBase, serverBase, onRegenerate }: HomeSceneProps) {
  const joinUrl = useMemo(() => phoneJoinUrl(phoneAppBase, serverBase, room), [phoneAppBase, serverBase, room]);

  // QR 데이터 URL은 방 코드/서버 주소가 바뀔 때만 다시 생성한다
  const qrDataUrl = useMemo(() => {
    let url = '';
    QRCode.toDataURL(joinUrl, { width: 360, margin: 2 }, (_err, data) => {
      url = data;
    });
    return url;
  }, [joinUrl]);

  return (
    <div className="overlay center">
      <h1 className="title">AirCanvas Kids</h1>
      <p className="muted">폰으로 접속하고 테마를 골라 허공에 그림을 그려요!</p>

      <div className="card qr-card">
        <div className="qr-area">
          {qrDataUrl ? <img src={qrDataUrl} alt="폰 연결 QR" className="qr-img" /> : <div className="qr-fallback" />}
          <p className="qr-hint">
            폰 카메라로 QR을 스캔하면
            <br />
            자동으로 연결돼요
          </p>
        </div>
        <div className="qr-divider" />
        <div className="qr-side">
          <div className="row">
            <span className="label">방 코드</span>
            <span className="room-code small">{room}</span>
            <button className="btn ghost" onClick={onRegenerate}>
              새 코드
            </button>
          </div>
          <div className={`badge ${wsStatus === 'open' ? '' : 'warn'}`}>
            서버 {wsStatus === 'open' ? '연결됨' : `연결 중(${wsStatus})`}
          </div>
          <div className={`badge ${phoneConnected ? 'ok' : ''}`}>
            {phoneConnected ? '폰 연결됨 — 폰에서 테마를 선택하세요' : '폰 대기 중… (QR 스캔 또는 코드 입력)'}
          </div>
        </div>
      </div>

      <p className="theme-note">🦕 공룡 · 🐒 정글 · 🐠 바다 — 테마와 작품은 폰에서 고를 수 있어요</p>
    </div>
  );
}
