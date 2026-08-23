interface GallerySceneProps {
  themeLabel: string;
  count: number;
  total: number;
  onBack: () => void;
  onNextArt: () => void;
}

/** 갤러리 씬: 완성된 작품들이 테마 월드에 부유하는 화면 (캔버스는 엔진이 렌더링) */
export function GalleryScene({ themeLabel, count, total, onBack, onNextArt }: GallerySceneProps) {
  return (
    <>
      <div className="hud top">
        <h2 style={{ margin: 0 }}>
          {themeLabel} 월드 — 우리의 작품 {count}/{total}
        </h2>
      </div>
      <div className="hud bottom">
        <button className="btn ghost" onClick={onBack}>
          처음으로
        </button>
        {count < total && (
          <button className="btn primary" onClick={onNextArt}>
            다음 작품 색칠하기
          </button>
        )}
      </div>
    </>
  );
}
