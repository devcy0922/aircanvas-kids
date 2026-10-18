# agents/rules.md — AirCanvas Kids 프로젝트 로컬 규칙

> 전역 규칙과 에이전트 도구 규칙을 상속하며, 이 저장소의 제품·검증·배포 기준을 정의한다.
> `agents/`가 프로젝트 지침의 원본이다. 변경 후 필요한 도구 투영은 `make agents-link` 또는
> 저장소의 `skm sync` 절차로 확인한다.

## 1. 제품 정의와 세 가지 진입 경로

- AirCanvas Kids는 카메라 장치를 게임 브레인으로 사용하고, 같은 장치의 화면 또는
  선택적인 외부 Display를 씬 렌더러로 사용하는 어린이용 공중 제스처 드로잉·색칠 게임이다.
- **카메라 로컬 경로:** `소개 홈 → 이 기기에서 카메라로 해보기 → 테마/작품 선택 →
  손 추적 → 로컬 플레이`. 외부 Display·릴레이·TV 캘리브레이션 없이 카메라 장치에서
  먼저 완결되어야 한다.
- **연결 게임 경로:** `소개 홈 → 시작하기 → TV 탐색/연결 → 테마 선택 → 명시적 시작 →
  캘리브레이션 → 플레이 → 갤러리`.
- **웹 터치 경로:** `소개 홈 → 카메라 없이 터치로 해보기 → 테마/그림 선택 → 칸 채우기
  또는 자유 그리기`. 카메라·TV·릴레이 없이 폰 브라우저에서 동작하는 테스트/접근성 폴백이다.
- 앱을 열자마자 카메라 권한을 요청하거나 게임을 시작하지 않는다. 소개 홈에서 사용자가
  카메라 로컬, TV 연결, 터치 중 경로를 명시적으로 선택해야 한다.

## 2. 아키텍처 표준: Phone=Brain / TV=Thin Display

- **Controller/Brain:** 게임 상태 머신, 패키지 캐시, 카메라 손 추적, 로컬 좌표 처리,
  외부 Display 연결 시 4코너 호모그래피·One-Euro 필터·`TVCommand` 발행을 담당한다.
- **카메라 로컬 Display:** Controller와 같은 브라우저에서 SVG 아트워크를 렌더링하며
  로컬 플레이에서는 릴레이를 거치지 않는다.
- **Touch mode:** 연결 게임과 분리된 폰 로컬 경로다. 콘텐츠 패키지의 SVG region과 팔레트를
  사용해 채우기/자유 그리기를 직접 렌더링하며 릴레이 프로토콜을 거치지 않는다.
- **TV:** React + PixiJS 씬 렌더러다. 폰이 보낸 `TVCommand`를 실행하며 독자적인 게임
  상태 결정이나 콘텐츠 선택을 하지 않는다.
- **Relay server:** Rust/Axum WebSocket 방 매칭·커맨드 릴레이만 담당한다.
- **Content server:** `manifest.json`과 썸네일/에셋을 정적으로 서빙한다.
- 카메라 영상/프레임은 절대 서버·TV로 보내지 않는다. 네트워크에는 정규화 좌표와 JSON
  커맨드만 흐른다.

## 3. 환경과 URL 규칙

- 로컬 개발 포트: TV `:7100`, Phone `:7101`, Content `:8081`, Relay `:8180`.
- 공개 웹 기본 주소: `https://kids.aircanvas.kr/` (폰 소개/카메라 로컬/터치 모드),
  `https://kids.aircanvas.kr/tv/?room=WEB001` (TV 대기 화면).
- HTTPS 페이지에서 `server=http://192.168.x.x:8180` 같은 오래된 LAN QR 파라미터를
  사용하면 브라우저가 `ws://`를 Mixed Content로 차단할 수 있다. 운영 페이지는 같은 출처의
  `https://kids.aircanvas.kr/ws` → `wss://kids.aircanvas.kr/ws`를 사용한다.
- 코드가 HTTPS 페이지의 안전하지 않은 `server`, `content`, `phoneApp` 파라미터를
  무시하는 것은 의도된 안전장치다. 운영 URL에는 사설 IP를 넣지 않는다.

## 4. 콘텐츠와 프로토콜

- `packages/protocol`이 TypeScript 프로토콜의 단일 진실원이며 서버 구현과 동기화한다.
- 추적 좌표는 항상 0..1 정규화 좌표다.
- 신규 연결 게임 콘텐츠는 `manifest.json`/에셋을 우선 확장하고 TV 코드에 콘텐츠별 분기를
  추가하지 않는다.
- SVG region은 닫힌 path와 명시적인 `region.id`를 갖고, 터치 채우기와 TV 히트테스트가
  같은 아트워크 정의를 공유해야 한다.

## 5. 작업·문서·검증 규칙

- 구조나 진입 흐름을 바꾸기 전에 `docs/architecture.md`의 흐름/다이어그램을 먼저 맞춘다.
- 사용자 진입 흐름, URL, 프로토콜, 콘텐츠 규격을 바꾸면 `README.md`와 관련 `docs/`를
  함께 갱신한다. 에이전트 부트 경로를 바꾸면 `AGENTS.md`, `CODEX.md`, `CLAUDE.md`,
  `GEMINI.md`, `ANTIGRAVITY.md`도 링크와 명령을 확인한다.
- 기본 검증 게이트는 `npm run build`와 `cargo check --manifest-path server/Cargo.toml`이다.
  배포 작업은 빌드 성공과 별도로 정적 파일/원격 커밋/공개 URL readback을 확인한다.
- 작업 완료 전 제품 버전을 semver로 올린다. `package.json`/`package-lock.json`/워크스페이스
  패키지 버전, UI에 표시되는 버전, `CHANGELOG.md`를 같은 버전으로 맞추고 `vMAJOR.MINOR.PATCH`
  태그를 만든다. 이번 릴리스 기준선은 `v0.1.0`이며 후속 작업은 변경 종류에 맞춰 다음 버전으로 올린다.
- 웹 디버깅은 `/srv/demo/web-bot`의 격리 Playwright 실행을 사용한다. 페이지 도착만으로
  성공 처리하지 않고 UI 상태, 콘솔 오류, 요청 실패, 실제 커맨드/터치 결과를 확인한다.
- 기존 사용자의 dirty worktree 변경은 요청 범위와 겹치지 않으면 건드리지 않는다.

## 6. 금지 사항

- 카메라 영상/프레임을 서버·TV로 전송하지 않는다.
- HTTPS 운영 URL에서 사설 IP `http://`를 사용하도록 문서화하지 않는다.
- 검증 없이 배포 완료, 실기기 E2E 완료, 자동 재기동 보장을 주장하지 않는다.
- `.env`, 인증서, 토큰 등 시크릿을 커밋하지 않는다.
