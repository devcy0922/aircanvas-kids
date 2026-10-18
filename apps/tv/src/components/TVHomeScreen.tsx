import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APP_VERSION_LABEL } from '@ht/protocol';

interface Props {
  roomCode: string;
  joinUrl: string;
  status: string;
}

export function TVHomeScreen({ roomCode, joinUrl, status }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setQrDataUrl(null);
    QRCode.toDataURL(joinUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#15231d', light: '#fffdf7' },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [joinUrl]);

  return (
    <section className="tv-home" data-testid="tv-home" aria-label="AirCanvas Kids 소개 홈">
      <div className="tv-home__glow tv-home__glow--one" />
      <div className="tv-home__glow tv-home__glow--two" />
      <div className="tv-home__leaf tv-home__leaf--one" />
      <div className="tv-home__leaf tv-home__leaf--two" />

      <div className="tv-home__content">
        <div className="tv-home__copy">
          <p className="tv-home__eyebrow">손끝으로 시작되는 작은 모험</p>
          <h1 className="tv-home__title">AirCanvas <span>Kids</span></h1>
          <p className="tv-home__description">
            휴대폰을 연결하고, 오늘의 공룡 친구를 골라보세요.
            <br />
            손짓만으로 TV 화면에 색이 피어납니다.
          </p>

          <div className="tv-home__steps" aria-label="게임 시작 순서">
            <span className="is-current">01 소개</span>
            <i />
            <span>02 공룡 선택</span>
            <i />
            <span>03 색칠 시작</span>
          </div>
        </div>

        <div className="tv-home__connect">
          <div className="tv-home__qr-frame">
            {qrDataUrl ? (
              <img className="tv-home__qr" src={qrDataUrl} alt="휴대폰 연결용 QR 코드" />
            ) : (
              <div className="tv-home__qr-fallback" aria-label="QR 코드를 준비하는 중" />
            )}
          </div>
          <p className="tv-home__scan-label">휴대폰 카메라로 스캔해서 시작하기</p>
          <div className="tv-home__room-label">방 코드</div>
          <div className="tv-home__room-code" aria-label={`방 코드 ${roomCode}`}>{roomCode}</div>
          <p className="tv-home__status">
            <span className={`tv-home__status-dot ${status === 'open' ? 'is-connected' : ''}`} />
            {status === 'open' ? '연결 준비가 되었어요' : 'TV를 연결하는 중이에요'}
          </p>
          <p className="tv-home__version">{APP_VERSION_LABEL}</p>
        </div>
      </div>
    </section>
  );
}
