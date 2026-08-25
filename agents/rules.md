# agents/rules.md — AirCanvas Kids 프로젝트 로컬 규칙

> 전역 규칙(사용자 전역 규칙 문서)을 상속하며, 본 프로젝트에 특화된 사항을 Override 한다.

## 1. 프로젝트 정체성
- **이름:** `AirCanvas Kids` (내부 코드명: `hand-tracking`)
- **한 줄 정의:** 스마트폰 카메라로 아이의 손(검지 끝)을 추적해 좌표만 서버로 보내고, TV 화면 허공에 그림을 그려 색칠하면, 완성작이 이펙트와 함께 공룡/정글/바다 테마 월드에 투입되는 패밀리 게임.
- **핵심 제약:**
  - 스마트폰은 **영상을 전송하지 않는다.** 오직 손 좌표(x, y, pinch 등)만 WebSocket으로 전송하여 네트워크 트래픽을 최소화한다.
  - TV는 렌더링 전담(React + PixiJS). 서버는 좌표 릴레이 + 세션 매칭(Rust/Axum)만 담당한다.
  - 카메라↔TV 좌표계 불일치는 **4코너 호모그래피(Homography)** 캘리브레이션으로 해결한다.

## 2. 실행 환경
- 개발/빌드 머신: Windows(PC) — 본 저장소의 빌드·테스트 수행 주체.
- 배포/실행 대상 환경:
  - 스마트폰: Chrome 기반 모바일 브라우저(WebRTC getUserMedia + MediaPipe Tasks Vision WASM).
  - TV: 스마트 TV 내장 브라우저(가능하면 Chromium 계열), 마우스/터치 폴백 포함.
  - 서버: Wi-Fi LAN 안의 PC 또는 Mac mini 호스트 네이티브 바이너리(Rust).
- M1 Max에서 vLLM 구동 등 무거운 추론을 하지 않는다(전역 규칙 상속). 본 프로젝트는 LLM 추론이 필수가 아니며, 도입 시 llm-gateway(vLLM)/MLX 폴백 정책을 따른다.

## 3. 아키텍처 표준 (v0.2: Phone=Brain / TV=Thin Display)
- **역할 분리 원칙:**
  - 폰 = 게임 브레인. 게임 상태 머신(로비/캘리브/플레이/갤러리), 패키지 관리, TV 탐색, 손 추적을 모두 담당.
  - TV = 씬 렌더러. `TVCommand`(load-scene/set-cursor/draw-stroke/fill-region/play-effect) 수신 실행만 담당, 상태 없음(Stateless).
  - 서버(Rust/Axum) = 방 코드 세션 매칭 + 커맨드 릴레이만 담당.
  - 콘텐츠 서버(Nginx) = 게임 패키지 매니페스트(`content-server/manifest.json`) + 에셋 정적 서빙.
- Design-First: 코드 변경 전 `docs/architecture.md` 및 Mermaid 다이어그램을 갱신한다.
- Rust-First: 서버·고성능 로직은 Rust(Axum + tokio-tungstenite). Node/TS는 프론트엔드(Vite) 빌드에 한해 허용.
- 프로토콜 단일 진실원(Source of Truth): `packages/protocol` 의 TypeScript 타입과 서버 Rust 타입은 항상 동기화 유지.
- 프레임 전송 금지: 폰→서버는 좌표/커맨드 JSON/WebSocket 프레임만. 영상 프레임 절대 전송 금지.
- 좌표 규약: 모든 추적 좌표는 0..1 정규화. TV 렌더링 시점에 화면 해상도로 스케일.
- 콘텐츠 확장 규칙: 신규 게임/테마 추가 시 콘텐츠 서버 매니페스트+에셋만 수정한다(TV 코드 수정 불가 원칙).

## 4. 콘텐츠 규격 (v0.2)
- 테마 3종: 공룡 / 정글 / 바다. 테마당 10종 = 총 30종 아트워크(매니페스트는 샘플 7종, 점진 이관).
- 각 아트워크: SVG path 기반 외곽선 + 영역(region) 분할 → 영역별 색칠 진행도 집계.
- 패키지 버전 관리: semver 준수, `minProtocolVersion` 호환성 체크, 폰 IndexedDB 캐시.
- 색상 팔레트: 8색 고정(어린이 가독성 우선).

## 5. 작업 워크플로우
- 글로벌 백로그: `.ai/state/task-board.json` 에 작업 단위(TASK-xxx)로 기록·갱신.
- 프로젝트 스킬 참조: `agents/skills/` 하위의 스킬 가이드(아키텍처, 프로토콜, 캘리브레이션/트래킹, TV엔진, 릴레이서버, 프론트엔드 디자인)를 우선 참조하여 일관된 설계를 유지한다.
- 세션 종료 시 `agents/state/sessions/{세션명}/state.json` + `handoff-{date}.md` 작성.
- 커밋 메시지는 한국어 요약 + Conventional Prefix(`feat:`, `fix:`, `docs:` …) 권장.
- 검증 게이트: 어떤 기능 추가 후에도 `npm run build`(전체 워크스페이스) + `cargo check`(server) 통과를 원칙으로 한다.
- 개발 환경 참고: cy-server(Ubuntu)에서는 nvm 기반 Node 20 사용(`export NVM_DIR="$HOME/.nvm" && \. "$NVM_DIR/nvm.sh"`), Rust는 linux-gnu 툴체인으로 `cargo check` 수행. Windows 개발 PC용 GNU 툴체인 스크립트(package.json `server:*`)와 구분.

## 6. 금지 사항
- 카메라 영상/프레임의 서버·TV 전송 (프라이버시 및 트래픽 원칙).
- 검증 없는 대규모 리팩터링.
- `.env`, 인증서 등 시크릿의 커밋.

