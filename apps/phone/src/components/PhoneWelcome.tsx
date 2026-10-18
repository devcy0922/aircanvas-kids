import { APP_VERSION_LABEL } from '@ht/protocol';

interface Props {
  onStart: () => void;
  onCameraStart: () => void;
  onTouchStart: () => void;
}

export function PhoneWelcome({ onStart, onCameraStart, onTouchStart }: Props) {
  return (
    <main className="phone-welcome" data-testid="phone-welcome">
      <div className="phone-welcome__orb phone-welcome__orb--top" />
      <div className="phone-welcome__orb phone-welcome__orb--bottom" />
      <div className="phone-welcome__dino" aria-hidden="true">🦖</div>

      <div className="phone-welcome__content">
        <p className="phone-welcome__eyebrow">손끝으로 시작되는 작은 모험</p>
        <h1>AirCanvas <span>Kids</span></h1>
        <p className="phone-welcome__lead">
          손짓으로 공룡 세계에 색을 입혀요.
          <br />
          이 기기에서 바로 시작하거나 큰 화면으로 이어갈 수 있어요.
        </p>

        <div className="phone-welcome__route" aria-label="게임 시작 순서">
          <span className="is-active">소개</span>
          <i />
          <span>공룡 선택</span>
          <i />
          <span>시작</span>
        </div>

        <button className="phone-welcome__start" data-testid="phone-camera-start" type="button" onClick={onCameraStart}>
          카메라로 바로 해보기 <span aria-hidden="true">→</span>
        </button>
        <button className="phone-welcome__tv" data-testid="phone-start" type="button" onClick={onStart}>
          TV에 연결해서 큰 화면으로 하기 <span aria-hidden="true">↗</span>
        </button>
        <button className="phone-welcome__touch" data-testid="phone-touch-start" type="button" onClick={onTouchStart}>
          카메라 없이 터치로 해보기
        </button>
        <p className="phone-welcome__hint">카메라 영상은 이 기기 안에서만 처리돼요.</p>
        <p className="phone-welcome__version">{APP_VERSION_LABEL}</p>
      </div>
    </main>
  );
}
