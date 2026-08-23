interface DrawSceneProps {
  artworkName: string;
  progress: number;
  accent: string;
  paletteHint?: boolean;
  onNext: () => void;
  onUndo: () => void;
}

/** 그리기/색칠 씬: HUD(작품명, 진행도, 팔레트 안내)만 오버레이로 렌더링한다. 실제 캔버스는 엔진 소유. */
export function DrawScene({ artworkName, progress, accent, onNext }: DrawSceneProps) {
  const pct = Math.round(progress * 100);
  return (
    <>
      <div className="hud top">
        <span className="art-name">{artworkName}</span>
        <div className="progress-wrap">
          <div className="progress-bar" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <span className="progress-label">{pct}%</span>
      </div>
      <div className="hud bottom">
        <span className="muted">색칠 모드: 손을 영역 위에 올리고 폰에서 채우기 · 그리기 모드: 손으로 자유선</span>
        <button className="btn primary" onClick={onNext}>
          다음 →
        </button>
      </div>
    </>
  );
}
