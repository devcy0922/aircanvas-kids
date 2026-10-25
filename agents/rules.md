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

## 1.1 사이트 구성: kids = 여러 서비스의 묶음 (v0.8.0)

> 사용자 결정(2026-10-21). 구조·URL·이행 기록은 [`docs/platform-plan.md`](../docs/platform-plan.md), 다이어그램은 `docs/architecture.md` §9.

- `kids.aircanvas.kr`은 포털(`/`, `apps/portal`)이고 공중 색칠 게임은 `/play/`(`apps/phone`), TV는 `/tv/`, 서울형 키즈카페 "엄빠"는 `/cafe/`(`apps/cafe`)다.
  저장소는 모노레포이며 새 서비스는 `apps/<이름>`으로 추가하고 `apps/portal/services.json`에 카드를 올린다.
- 위 §1~§4의 게임 규칙은 `/play/` 서비스에 그대로 유효하다. 게임 코드(`apps/phone`·`apps/tv`·`packages/protocol`·`server/`)에 포털·엄빠 로직을 넣지 않고,
  앱 사이 직접 import를 하지 않는다(공유는 `packages/`로. 공용 디자인 토큰은 `packages/ui/tokens.css`).
- **엄빠의 예약 현황은 시뮬레이션 데이터**다. 실시간·실제 수치처럼 표시하지 않고 데모 안내(`.demo-notice`)와 포털 카드의 "데모 데이터" 표기를 유지한다.
  실제 수집·재표시는 운영기관 허용을 확인하기 전에는 하지 않는다(`apps/cafe/docs/LEGAL_AND_ROBOTS.md`).
- 다음은 **실행 직전에 사용자 확인**을 받는다: 엣지 nginx(저장소 밖 공용 설정) 변경, `sk.moru.my` 전환·리다이렉트, 원격 저장소 이름 변경, 구 `s-kids` 저장소 아카이브·삭제.
  구 `s-kids` 저장소와 운영 컨테이너(`s-kids`, :8123)는 전환이 끝나기 전에 지우지 않는다.
- 버전·태그는 저장소 전체가 하나의 semver(`vX.Y.Z`)를 쓴다. 앱별 독립 배포가 필요해지면 접두 태그로 전환하는 것을 먼저 사용자와 정한다.

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

- 로컬 개발 포트: TV `:7100`, Phone `:7101`(주소는 `/play/`), Portal `:7102`, Content `:8081`, Relay `:8180`, 엄빠 `:8124`.
- 공개 웹 주소: `https://kids.aircanvas.kr/` (포털), `https://kids.aircanvas.kr/play/` (게임: 폰 소개/카메라 로컬/터치 모드),
  `https://kids.aircanvas.kr/tv/?room=WEB001` (TV 대기 화면), `https://kids.aircanvas.kr/cafe/` (엄빠).
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
  태그를 만든다. 현재 릴리스 기준선은 `v0.7.0`이며 후속 작업은 변경 종류에 맞춰 다음 버전으로 올린다(기능=minor, 수정=patch).
- 웹 디버깅은 `/srv/company/llm/web-bot`의 격리 Playwright 실행을 사용한다. 페이지 도착만으로
  성공 처리하지 않고 UI 상태, 콘솔 오류, 요청 실패, 실제 커맨드/터치 결과를 확인한다.
- 기존 사용자의 dirty worktree 변경은 요청 범위와 겹치지 않으면 건드리지 않는다.
- UI(TSX)에 새 `className`을 쓰면 같은 변경에서 CSS를 추가하고, 쓰지 않게 된 CSS 규칙은 제거한다.
  전역 요소 선택자(`header`, `button` 등)가 새 화면을 깨지 않는지 확인한다. 마크업만 바꾸고 CSS를 빠뜨려
  화면이 깨졌던 전례(v0.4.0)가 있다.
- 테마·작품·월드 설정·캐릭터 행동은 `content-src/`(YAML + 일러스트 PNG)가 원본이고, `content-server/manifest.json`과 영역·선화·썸네일·스프라이트,
  `packages/tv-art/src/themes.generated.ts`는 `python3 tools/art/build_content.py`가 만드는 생성물이다. 생성물을 손으로 고치지 않고, 새 테마·작품에
  앱 코드의 테마별 분기(`theme.id === 'xxx'`)를 추가하지 않는다. 코드 수정이 필요한 "새로운 종류"는 `docs/content-pipeline.md` §9.5.
  `make content-check`(= `build_content.py --check`)가 통과해야 한다.
- 화면을 바꾼 작업은 코드가 컴파일된다는 사실만으로 완료로 보지 않는다. `make ui-smoke`와
  스크린샷을 직접 보고 판단한다. 움직이는 화면(월드 등)은 정지 화면 한 장으로 판단하지 않고
  시간 간격을 둔 연속 프레임을 보고 잔상·겹침·쏠림을 확인한다.
- 캐릭터가 부위별로 움직일 때는 원본 그림을 그대로 깔아 두지 않는다(원래 자리에 남아 잔상이 된다).
  부위 레이어가 서로 겹치지 않도록 `apps/phone/src/lib/creatureSprite.ts`로 구워 쓴다.

## 6. 금지 사항

- 카메라 영상/프레임을 서버·TV로 전송하지 않는다.
- HTTPS 운영 URL에서 사설 IP `http://`를 사용하도록 문서화하지 않는다.
- 검증 없이 배포 완료, 실기기 E2E 완료, 자동 재기동 보장을 주장하지 않는다.
- `.env`, 인증서, 토큰 등 시크릿을 커밋하지 않는다.

## 6.1 콘텐츠 제작 주체 (정글·바다·하늘 테마, 신규 공룡)

> 사용자 지시(2026-10-21): 정글·바다·하늘(신규) 테마와 신규 공룡은 **클라우드 LLM 개입 없이** 사용자가 직접 만든다.
> 그림 후보를 찾고 만드는 일은 사람 또는 **자체 런타임·로컬 모델**이 해도 된다.

- 그림(일러스트 원본, 월드 일러스트)과 도안 분할 결과는 사용자 또는 로컬 도구가 만든다. 클라우드 LLM 에이전트는 이 그림을 대신 그리거나
  생성·보정하지 않고, 원본 그림을 외부 서비스(클라우드 LLM·이미지 생성 API)에 올리지 않는다.
- 이 콘텐츠 요청을 받으면 에이전트가 하는 일은 **사람·로컬 런타임이 혼자 따라 할 수 있는 길**을 유지하는 것으로 한정한다:
  `docs/content-pipeline.md` §9 런북과 `agents/skills/aircanvas-content` 스킬 갱신, 파이프라인 스크립트(`tools/art`)의 검증·오류 메시지·일반화,
  접점 코드 변경(§9.5). 요청 없이 그림 자체나 도안 분할 결과를 만들어 커밋하지 않는다.
- 수집·생성한 그림에는 `provenance`(출처·이용 허락)를 남긴다. 이용 허락을 에이전트가 추정해서 적지 않으며, 확인되지 않은 그림은 공개 전에 사람이 확인한다.
- 런북대로 하면 막히는 곳을 발견하면 우회해서 대신 처리하지 말고 런북의 "알려진 제약"에 기록한다.

## 7. 작업 완료 체크리스트 (모든 작업은 이 순서로 끝낸다)

변경이 있는 작업은 아래를 **모두** 마쳐야 완료다. 건너뛴 항목이 있으면 완료라고 하지 않고 이유를 보고한다.

1. [ ] **설계/문서 선반영**: 구조·흐름·URL·프로토콜·콘텐츠 규격이 바뀌었으면 `docs/`와 `README.md`를 갱신했다.
2. [ ] **검증 게이트**: `make check`(TypeScript 빌드 + cargo check)가 통과했다. 실패 출력은 숨기지 않는다.
3. [ ] **버전 bump**: semver를 올렸다. 아래 위치가 모두 같은 값이다.
   `package.json`, `package-lock.json`, `apps/*/package.json`(portal·cafe 포함), `packages/*/package.json`(ui 포함)
   (`npm version X.Y.Z --no-git-tag-version --workspaces --include-workspace-root`),
   `packages/protocol/src/index.ts`의 `APP_VERSION`, `content-server/manifest.json`의 `version`, `README.md` 제목.
4. [ ] **CHANGELOG**: `CHANGELOG.md`에 `## vX.Y.Z — YYYY-MM-DD` 항목을 추가했다(원인·변경·검증).
5. [ ] **task-board**: `.ai/state/task-board.json`에 작업 항목과 `verification`을 기록했다.
6. [ ] **커밋**: 요청 범위의 파일만 스테이징했다(`git add <경로>`, `git add -A` 금지). 무관한 dirty 변경,
   `__pycache__`, `logs/evidence`, 시크릿은 제외했다. 메시지는 한국어 `type: 요약`.
7. [ ] **main 푸시 + 태그**: `git push origin main` 후 `git tag -a vX.Y.Z -m "..."` → `git push origin vX.Y.Z`.
   푸시 후 `git ls-remote origin main vX.Y.Z`로 원격 커밋이 로컬 HEAD와 같은지 확인했다.
8. [ ] **배포**: 빌드 산출물을 nginx가 읽는 경로로 동기화했다.
   - nginx(`edge-nginx`)는 canonical 원본 `/srv/company/prd/kids/aircanvas-kids`의 `site/`·`apps/tv/dist`·`content-server`를 직접 마운트한다.
   - **사이트 루트(포털 `/` + 게임 `/play/`)**는 `npm run build && make site`로 조립한다. 구형 배포 clone으로 rsync하지 않는다.
   - bind source 변경은 Edge 소유 레포의 predeploy 검증 뒤 해당 Nginx만 재생성하고 공개 URL을 readback한다. 기존 clone은 복구/미병합 작업 보존본으로만 유지한다.
   - **엄빠**(`apps/cafe`)를 바꿨으면 `docker compose -f apps/cafe/docker-compose.yml up -d --build`로 `kids-cafe`(:8124)를 다시 만들고 `/healthz`를 확인한다.
   - 릴레이(Rust) 코드를 바꿨을 때만 서버를 재빌드·재기동한다.
9. [ ] **공개 URL readback**: `https://kids.aircanvas.kr/manifest.json`의 `version`이 방금 올린 버전이고,
   `index.html`이 가리키는 JS 번들이 새 빌드의 것임을 확인했다.
10. [ ] **실제 브라우저 확인**: 화면이 바뀐 작업은 `make ui-smoke`(게임, 공개 URL `/play/`)를 통과시키고 스크린샷을 직접 확인했다. 포털·`/play/`·`/cafe/` 연결이나 URL이 바뀐 작업은 `make site-smoke`도 통과시킨다.
    연결 게임 경로를 건드렸다면 `make web-debug`도 통과시켰다.
11. [ ] **보고**: 무엇을 했고 무엇을 검증했는지, 하지 못한 것(실기기 카메라/TV 등)을 구분해서 보고했다.

> 예외: 지침·문서만 바꾼 작업(`agents/`, `docs/`, `README.md` 본문 등, 앱 산출물·콘텐츠 변화 없음)은 3(버전 bump)·8(배포)·9·10을
> 건너뛰고 태그도 만들지 않는다. 대신 1·2·6·7(푸시 후 `git ls-remote` 확인)·11을 지키고, 건너뛴 항목은 보고에 명시한다.

> 이 체크리스트는 사용자 지시("커밋·푸시·태그·배포·즉시 확인을 계속 유지")에 따른 상시 규칙이다.
> 원격 푸시와 공개 배포는 현재 사용자가 없는 상태에서 승인된 흐름이며, 사용자가 생기면 배포 전 확인 절차를 재검토한다.
