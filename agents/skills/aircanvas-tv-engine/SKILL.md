---
name: aircanvas-tv-engine
description: >-
  AirCanvas Kids TV 렌더링 엔진(PixiJS), TVCommandHandler, SVG Path 영역 분할 및 채색, 파티클 이펙트 시스템 가이드.
---

# AirCanvas Kids TV 렌더링 엔진 가이드

TV 클라이언트는 React + PixiJS 기반의 무상태(Stateless) 고성능 2D 씬 렌더러입니다. 폰으로부터 수신된 `TVCommand`를 60FPS 하드웨어 가속 그래픽스로 변환합니다.

## 1. 렌더링 파이프라인 및 계층 구조

TV 앱의 핵심은 `apps/tv/src/engine/GameEngine.ts`와 `apps/tv/src/engine/TVCommandHandler.ts`입니다.

```text
GameEngine (PixiJS Application)
├── BackgroundLayer    (테마별 인터랙티브 배경, 그라데이션)
├── ArtworkLayer       (외곽선 SVG Path + 채색 가능한 분할 영역 Graphics)
├── DrawLayer          (사용자 자유 드로잉 브러시 스트로크 궤적)
├── ParticleLayer      (완성 축하 폭죽, 별가루, 파동 이펙트)
└── CursorLayer        (원형/별 모양 인덱스 핑거 포인터)
```

---

## 2. `TVCommandHandler` 디스패치 원칙

TV 클라이언트는 웹소켓 메시지 수신 시 자체적인 씬 전환 계산을 하지 않고 디스패처를 통해 엔진 메서드를 호출합니다.

```ts
export class TVCommandHandler {
  constructor(private engine: GameEngine) {}

  handle(command: TVCommand) {
    switch (command.type) {
      case 'load-scene':
        this.engine.loadScene(command.scene, command.payload);
        break;
      case 'set-cursor':
        this.engine.updateCursor(command.x, command.y, command.visible, command.color);
        break;
      case 'draw-stroke':
        this.engine.drawStroke(command.points, command.color);
        break;
      case 'fill-region':
        this.engine.fillRegion(command.regionId, command.color);
        break;
      case 'play-effect':
        this.engine.triggerEffect(command.effect, command.params);
        break;
      case 'set-progress':
        this.engine.updateProgress(command.percent);
        break;
    }
  }
}
```

---

## 3. SVG Path 분할 및 채색 (Region Coloring)

- 아트워크는 외곽선과 여러 개의 독립된 영역(`RegionRuntime`)으로 구성됩니다.
- 각 영역은 SVG Path 문자열(`d="..."`)을 PixiJS `Graphics`로 파싱하여 생성됩니다.
- 채색 로직:
  - 지정된 `regionId`의 내부 채우기 색상을 갱신.
  - 전체 영역 중 채색 완료된 비율을 계산하여 진행도(`percent`) 산출.
  - 진행도 85% 이상 도달 시 자동으로 완성 축하 연출(Burst/Confetti)을 트리거하고 갤러리로 전환 가능.

---

## 4. 성능 최적화 가이드 (Smart TV 환경)

스마트 TV 브라우저는 저사양 칩셋(ARM Quad-core)을 사용하는 경우가 많으므로 다음 최적화 규칙을 엄격히 준수합니다:
1. **가비지 컬렉션(GC) 최소화**: 매 프레임 임시 객체/배열 생성을 지양하고 단일 `PIXI.Graphics` 인스턴스 재사용.
2. **배치 렌더링**: 동일 텍스처/스타일의 파티클은 `ParticleContainer` 활용.
3. **해상도 적응**: TV 뷰포트 크기에 맞춰 `resizeTo: window` 및 정규화(0..1) 좌표 기반 스케일링.
