---
name: aircanvas-tv-engine
description: >-
  AirCanvas Kids TV 렌더링 엔진(PixiJS), TVCommandHandler, Path2D 기반 fill-at 영역 판정 및 채색, 파티클 이펙트 시스템 가이드.
---

# AirCanvas Kids TV 렌더링 엔진 가이드

TV 클라이언트는 React + PixiJS 기반의 무상태(Stateless) 고성능 2D 씬 렌더러입니다. 폰으로부터 수신된 `TVCommand`를 60FPS 하드웨어 가속 그래픽스로 변환합니다.

## 1. 렌더링 파이프라인 및 계층 구조

```text
GameEngine (PixiJS Application)
├── BackgroundLayer    (테마별 인터랙티브 배경, 그라데이션)
├── ArtworkLayer       (외곽선 SVG Path + 채색 가능한 분할 영역 Graphics/Canvas)
├── DrawLayer          (사용자 자유 드로잉 브러시 스트로크 궤적)
├── ParticleLayer      (완성 축하 폭죽, 별가루, 파동 이펙트)
└── CursorLayer        (원형 인덱스 핑거 포인터)
```

---

## 2. `TVCommandHandler` 디스패처

```ts
export class TVCommandHandler {
  handleCommand(cmd: TVCommand) {
    switch (cmd.type) {
      case 'load-scene':
        this.handleLoadScene(cmd);
        break;
      case 'set-cursor':
        this.handleSetCursor(cmd);
        break;
      case 'draw-stroke':
        this.handleDrawStroke(cmd);
        break;
      case 'fill-at':
        this.handleFillAt(cmd); // engine.onFill(cmd.x, cmd.y, cmd.color)
        break;
      case 'fill-region':
        this.handleFillRegion(cmd);
        break;
      case 'play-effect':
        this.handlePlayEffect(cmd);
        break;
      case 'set-progress':
        this.callbacks.onProgress?.(cmd.percent, cmd.artworkName);
        break;
      case 'undo':
        this.engine.undo();
        break;
    }
  }
}
```

---

## 3. `fill-at` 좌표 기반 영역 히트테스트 & 채색

- `GameEngine.onFill(nx: number, ny: number, color: string)`:
  1. 정규화 좌표 `(nx, ny)`를 화면 픽셀 좌표 `(px, py)`로 변환.
  2. 아트워크 논리 좌표계(0..100)로 역변환.
  3. 등록된 각 영역의 `Path2D`에 대해 `CanvasRenderingContext2D.isPointInPath(hitPath, ax, ay)` 수행.
  4. 매칭된 영역의 `clipPath`로 클립하여 색상 스탬프를 찍고 진행도(`evaluate`) 자동 갱신.
  5. 완성 임계치(85%) 도달 시 파티클 버스트 연출 자동 재생.
