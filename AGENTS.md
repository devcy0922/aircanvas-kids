# AirCanvas Kids — AI 에이전트 협업 가이드

> **MANDATORY**: 모든 AI 에디터(Cursor, Claude Code, Antigravity, Gemini, Codex)는 작업 전 아래 규칙과 스킬을 로드합니다.

## 1. 부트 스트림 (Boot Sequence)

1. [`agents/rules.md`](agents/rules.md) — 프로젝트 로컬 규칙 및 제약 사항 (SSOT)
2. `frontend-design` 스킬 — UI 변경 시 적용되는 디자인 원칙
3. [`agents/skills/`](agents/skills/) — 도메인별 스킬 가이드 (아키텍처, 프로토콜, 캘리브레이션/트래킹, TV엔진, 릴레이서버)
4. [`.ai/state/task-board.json`](.ai/state/task-board.json) — 글로벌 백로그 및 작업 상태

---

## 2. 핵심 아키텍처 원칙 (Phone=Brain / TV=Thin Display)

- **Phone**: 게임 브레인 (MediaPipe WASM 손추적, 4코너 호모그래피, 게임 상태머신, 패키지 캐시, TVCommand 발행).
- **TV**: 씬 렌더러 (React + PixiJS, 무상태 Stateless, 수신된 TVCommand 즉시 실행).
- **Relay Server**: 초저지연 WebSocket 룸 릴레이 (Rust/Axum).
- **Zero-Frame 원칙**: 스마트폰 카메라 영상은 온디바이스에서만 처리하며 네트워크로 절대 전송하지 않습니다.
- **Touch fallback**: 카메라가 없는 웹에서는 소개 홈에서 폰 로컬 터치 색칠 모드로 진입합니다.

---

## 3. 코딩 툴 동기화

- **SSOT**: 원본은 항상 `agents/` 디렉터리에만 둡니다.
- **링크 동기화**: `make agents-link` 실행 시 `.agents`, `.cursor/rules`, `.github/copilot-instructions.md`를 `agents/` 기준으로 연결합니다.
- **검증**: 문서나 앱 변경 후 `make check`; 공개 웹 동작은 `/srv/demo/web-bot` 격리 브라우저와 공개 URL readback으로 별도 확인합니다.
