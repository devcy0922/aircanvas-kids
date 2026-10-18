interface Props {
  onStart: () => void;
}

export function PhoneWelcome({ onStart }: Props) {
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
          TV와 연결한 뒤, 함께 시작해볼까요?
        </p>

        <div className="phone-welcome__route" aria-label="게임 시작 순서">
          <span className="is-active">소개</span>
          <i />
          <span>공룡 선택</span>
          <i />
          <span>시작</span>
        </div>

        <button className="phone-welcome__start" data-testid="phone-start" type="button" onClick={onStart}>
          시작하기 <span aria-hidden="true">→</span>
        </button>
        <p className="phone-welcome__hint">TV가 켜져 있다면 같은 Wi-Fi에서 바로 찾을 수 있어요.</p>
      </div>
    </main>
  );
}
