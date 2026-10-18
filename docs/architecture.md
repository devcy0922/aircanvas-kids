# AirCanvas Kids — 시스템 아키텍처 v0.2

## 1. 개요

AirCanvas Kids는 **폰 브라우저만으로 시작하는 터치 색칠 모드**와
**스마트폰 카메라 1대 + 스마트 TV 1대 + Wi-Fi LAN**으로 동작하는 공중 제스처 게임을
함께 제공한다.

### 핵심 원칙 (변경 없음)
- **카메라 영상은 어디로도 전송되지 않는다.** 폰에서 좌표만 추출 → 서버 릴레이 → TV 렌더링
- **터치 모드 예외:** 카메라 없는 웹 경로는 폰에서 SVG를 직접 렌더링하며 카메라·릴레이·TV를 사용하지 않는다.
- 네트워크 부하 극히 낮음(초당 수 KB), 지연은 LAN 기준 수십 ms 이내

### 아키텍처 진화: Phone = Brain, TV = Thin Display

```
┌─────────────────────────────────────────────────────────────────┐
│  콘텐츠 서버 (Nginx + 정적 파일)                                   │
│  - 게임/테마 패키지 버전관리 (manifest.json + 에셋 CDN)            │
│  - 폰이 주기적 폴링으로 업데이트 체크                               │
└────────────────────────────┬──────────────────────────────────────┘
                             │ HTTPS (인터넷)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  폰 (브레인 / 터치 플레이어)                                      │
│  - 패키지 캐시 (IndexedDB)                                        │
│  - 게임 상태 머신 (로비/캘리브/플레이/갤러리)                      │
│  - 손 추적 + 호모그래피 + One-Euro 필터                           │
│  - TV 탐색 (mDNS/HTTP 브로드캐스트)                               │
│  - TV로 렌더 커맨드 전송 (WS)                                     │
│  - 카메라 없는 SVG 칸 채우기/자유 그리기                           │
└────────────────────────────┬──────────────────────────────────────┘
                             │ 로컬 WS (초저지연, ~30Hz)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  TV (씬 렌더러)                                                  │
│  - PixiJS 렌더 엔진만 보유                                        │
│  - 폰에서 오는 커맨드 실행:                                       │
│    loadScene(sceneId, payload)                                   │
│    drawStroke(points, color)                                     │
│    fillRegion(regionId, color)                                   │
│    playEffect(effectType, params)                                │
│  - 상태 없음 (Stateless)                                         │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 구성 요소

| 구성요소 | 기술 | 책임 |
|---|---|---|
| `apps/phone` | React + Vite + MediaPipe Tasks Vision | 카메라 제어, 손 랜드마크 추적, 캘리브레이션, 게임 상태 머신, 패키지 관리, TV 탐색, 렌더 커맨드 송신, 터치 색칠 모드 |
| `apps/tv` | React + Vite + PixiJS 8 | 렌더 커맨드 수신/실행, GameEngine을 통한 그리기/색칠/이펙트 렌더링 |
| `server/` | Rust + Axum + tokio-tungstenite | 방 코드 세션 매칭, 좌표/커맨드 릴레이, 헬스체크 |
| `packages/protocol` | TypeScript | 폰/TV/서버/콘텐츠서버가 공유하는 메시지 스키마 단일 진실원 |
| `packages/tv-art` | TypeScript | 아트워크 30종 데이터 (공룡·정글·바다 × 10) |
| `content-server/` | Nginx + 정적 파일 | 게임 패키지 매니페스트/에셋 서빙 (HTTPS) |

## 3. 데이터 흐름 (프레임별)

1. **초기화**: 폰 앱 실행 → 콘텐츠 서버에서 `manifest.json` 다운로드 → IndexedDB 캐시
2. **진입 선택**: 소개 홈에서 `카메라 없이 터치로 해보기` 또는 `시작하기`를 선택
3. **터치 경로**: 패키지의 SVG region을 폰에서 직접 렌더링 → 칸 채우기/자유 그리기 → 로컬 진행 상태 표시
4. **TV 탐색**: 연결 경로에서 폰이 LAN 브로드캐스트/mDNS로 TV 자동 발견 → 사용자가 TV 선택
5. **연결**: 선택된 TV의 WS URL로 접속 → 서버 릴레이로 폰↔TV 세션 성립
6. **로비**: 폰이 `load-scene: home` 전송 → TV 홈 화면 표시 (방 코드 QR 표시)
7. **게임 시작**: 폰 소개 홈에서 `시작하기` → 테마 선택 → `이 테마로 시작` → 폰이 `load-scene: calib` + 페이로드 전송
8. **캘리브레이션**: TV 화면의 4코너 마커를 폰 카메라로 측정 → 호모그래피 H 계산 → 저장
9. **플레이**: 폰이 `load-scene: play` + 아트워크 데이터 전송 → TV 렌더링 시작
10. **추적**: 폰 카메라 30fps → MediaPipe 손 랜드마크 → 검지 끝 → 정규화 → H 적용 → One-Euro 필터
11. **커맨드 전송**: 폰이 매 프레임 `set-cursor`, 스트로크 시 `draw-stroke`, 탭 시 `fill-region` 전송
12. **릴레이**: 서버는 방(room)에 접속한 TV로 메시지를 그대로 전달
13. **렌더**: TV는 커서 표시 + `draw-stroke`로 경로 연결, `fill-region`으로 영역 채움
14. **판정**: TV가 진행도 집계 → 85% 도달 시 `play-effect: burst` → `load-scene: gallery`
15. **연출**: 완성 그림이 파티클 버스트와 함께 해당 테마 월드(갤러리 씬)에 배치됨

### 3.1 사용자 진입 흐름

게임은 TV 브라우저를 열자마자 플레이를 시작하지 않는다. 첫 화면은 제품 소개와
세션 연결을 위한 **홈(Home)** 이며, 폰에서 사용자가 명시적으로 시작을 승인한 뒤에만
테마 선택과 캘리브레이션으로 진행한다.

```text
TV: 연결 대기 → 소개 홈(방 코드/QR) ─────────────────────────────┐
                                                                  │
Phone: 소개 홈 → 시작하기 → TV 연결 → 테마 선택(공룡/정글/바다) │
                                  → 이 테마로 시작               │
                                  → 캘리브레이션 → 플레이        │
                                                                  │
TV: home 렌더링 ← load-scene: home ← Phone ----------------------┘
TV: calib 렌더링 ← load-scene: calib ← Phone
TV: play 렌더링  ← load-scene: play  ← Phone
```

- TV 홈은 렌더링·연결 안내만 담당하며 테마나 게임 상태를 결정하지 않는다.
- Phone은 `시작하기`, 테마 선택, `이 테마로 시작`을 소유하는 게임 브레인이다.
- 테마 카드 선택과 게임 시작은 분리한다. 카드 선택만으로 카메라 권한이나 플레이를
  시작하지 않는다.
- QR/방 코드가 없는 경우에도 TV 홈은 독립적으로 표시되어야 하며, 사용자는 홈에서
  연결 상태와 다음 행동을 이해할 수 있어야 한다.

### 3.2 카메라 없는 웹 터치 흐름

터치 모드는 연결 게임을 대체하는 별도 폴백 경로다. 콘텐츠 패키지를 이미 로드한 폰이
SVG artwork region을 직접 그리므로 카메라 권한, TV 탐색, WebSocket 릴레이가 필요 없다.

```text
Phone: 소개 홈 → 카메라 없이 터치로 해보기
      → 테마 선택 → 작품 선택
      → 칸 채우기(fill) 또는 자유 그리기(free)
      → 폰 화면에 진행도 표시
```

- 이 모드의 입력과 진행 상태는 현재 폰 화면 로컬 상태다.
- 터치 모드에서 TVCommand를 발행하지 않는다. TV 연동이 필요하면 소개 홈으로 돌아가
  `시작하기`를 선택해 연결 게임 경로로 진입한다.

## 4. 좌표계 및 캘리브레이션

TV 화면에 4개 코너 마커를 순차 표시하고, 폰 카메라로 각 마커의 화면상 위치를 측정하여
3×3 호모그래피 행렬 H를 계산한다(상세: `docs/calibration.md`). 폰이 TV 정면이 아니라
살짝 비스듬히 놓여도 원근 보정이 가능하다. H는 폰 로컬 저장소에 보관하여 재실시하지 않아도 된다.

## 5. 네트워크 토폴로지

```
[Phone] ──ws://server:8180/ws?role=phone&room=ABC123──┐
                                                       │  Rust Relay
[TV]    ──ws://server:8180/ws?role=tv&room=ABC123─────┘
```

HTTPS 공개 배포에서는 위 로컬 주소 대신 same-origin `wss://<host>/ws`를 사용한다.

- 서버는 상태를 거의 갖지 않는 stateless 릴레이(방 코드 → 소켓 맵)이다.
- 로컬 연결 게임은 같은 LAN에서 동작하며, 공개 배포는 Nginx가 TLS와 same-origin 중계를 담당한다.
- 좌표/커맨드 메시지 크기 ≈ 100~300 bytes, 30Hz 기준 ≈ 3~9 KB/s per client — 영상 스트리밍 대비 4자리수 낮은 트래픽.
- 공개 HTTPS 배포에서는 Nginx가 `/ws`, `/announce`, `/manifest.json`, `/artworks/`를 같은
  출처로 중계한다. 브라우저는 `https://kids.aircanvas.kr`에서 `wss://kids.aircanvas.kr/ws`로 연결한다.
- HTTPS 페이지의 `server=http://사설IP:8180` 파라미터는 Mixed Content를 만들 수 있으므로
  앱이 무시하고 같은 출처로 폴백한다. 로컬 HTTP 개발에서만 사설 IP 오버라이드를 사용한다.

### 폰 온보딩 (QR + 자동 탐색)

TV 홈 화면이 폰 앱 URL에 `?server=<릴레이 주소>&room=<방코드>`를 담은 QR을 렌더링한다
(`phoneJoinUrl()` — `packages/protocol`). 폰 앱은 두 파라미터를 읽어 자동 입장하므로,
가족 누구나 QR 스캔 한 번으로 세션에 합류한다. **추가로 폰에서 "TV 자동 찾기"로 탐색 가능.**

## 6. 콘텐츠 파이프라인

- 콘텐츠 서버(Nginx)가 `manifest.json` + 썸네일/데이터 에셋을 정적 파일로 서빙
- 폰이 시작 시 매니페스트 버전 체크 → 변경 시 증분 다운로드 → IndexedDB 캐시
- 신규 게임/테마 추가는 콘텐츠 서버에 파일 올리기만 하면 폰이 자동 수신, **TV 코드 수정 불필요**
- 버전별 롤아웃, A/B 테스트, 강제 업데이트 가능

## 7. 보안·프라이버시

- 카메라 영상은 브라우저 내부에서만 처리되며 **절대 업로드되지 않는다.**
- 서버는 좌표/커맨드 외 어떤 미디어도 취급하지 않는다.
- 방 코드(6자리)로 세션을 격리해 가족 단위 안전 매칭을 보장.
- 콘텐츠 서버 통신도 HTTPS(인증서) 권장.

## 8. 확장 로드맵 요약

MVP(그리기+색칠+월드 투입) 이후 계획은 `docs/roadmap.md` 참조:
모양 인식, 펜 물체 추적, 다인 동시 입장, 사운드, PWA 오프라인 등.

---

## Mermaid 시스템 다이어그램

```mermaid
flowchart TB
    subgraph ContentServer["콘텐츠 서버 (Nginx/HTTPS)"]
        MANIFEST["manifest.json + 에셋"]
    end

    subgraph Phone["스마트폰 (브레인)"]
        TOUCH["Touch Coloring\n(SVG fill/free)"]
        CAM["Camera (getUserMedia)"]
        MP["MediaPipe HandLandmarker (WASM)"]
        CAL["호모그래피 변환\n(카메라 → TV 좌표계)"]
        SMOOTH["원-유로 필터\n(지터 제거)"]
        PKG["패키지 매니저\n(매니페스트/캐시)"]
        DISCOVERY["TV 탐색\n(mDNS/HTTP)"]
        STATE["게임 상태 머신\n(로비/캘리브/플레이/갤러리)"]
        CMD["TV 커맨드 송신기\n(WS ~30Hz)"]
    end

    subgraph Server["릴레이 서버 (Rust/Axum)"]
        MATCH["세션 매칭\n(6자리 방 코드)"]
        RELAY["커맨드 릴레이\n폰 → TV"]
    end

    subgraph TV["스마트 TV (씬 렌더러)"]
        WS["WS 클라이언트"]
        DISPATCH["커맨드 디스패처"]
        ENGINE["GameEngine (PixiJS)\n- 커서/스트로크/채우기\n- 진행도/이펙트"]
    end

    ContentServer -. "HTTPS: manifest/에셋" .-> PKG
    PKG --> TOUCH
    CAM --> MP --> CAL --> SMOOTH
    DISCOVERY --> MATCH
    PKG --> STATE
    STATE --> CMD
    CMD -- "TVCommand (JSON)" --> MATCH
    RELAY -- "동일 방 TV로" --> WS
    WS --> DISPATCH --> ENGINE
    ENGINE -. "진행도/완료 이벤트" .-> STATE
```

---

## Mermaid 시퀀스 다이어그램 (게임 시작~플레이)

```mermaid
sequenceDiagram
    participant Phone
    participant User
    participant Server
    participant TV
    participant ContentServer

    alt 카메라 없는 터치 경로
        User->>Phone: 소개 홈 → 터치 모드
        Phone->>ContentServer: GET manifest.json (버전 체크)
        ContentServer-->>Phone: 매니페스트 + 에셋 URL
        Phone->>Phone: IndexedDB 캐시 및 SVG region 렌더링
        User->>Phone: 칸 채우기 또는 자유 그리기
    else 연결 게임 경로
        Phone->>ContentServer: GET manifest.json (버전 체크)
        ContentServer-->>Phone: 매니페스트 + 에셋 URL
        Phone->>Phone: IndexedDB 캐시 저장/갱신

        Phone->>Phone: TV 탐색 (mDNS/HTTP 브로드캐스트)
        Phone->>User: 발견된 TV 목록 표시
        User->>Phone: TV 선택
        Phone->>Server: WS 연결 (role=phone, room=ABC123)
        TV->>Server: WS 연결 (role=tv, room=ABC123)
        Server->>Phone: welcome + peer-joined
        Server->>TV: welcome + peer-joined

        Phone->>Server: load-scene: home
        Server->>TV: load-scene: home
        TV->>TV: showBackdrop(theme)

        Phone->>Server: load-scene: calib (theme, artworkName, corners)
        Server->>TV: load-scene: calib
        TV->>TV: showBackdrop + 코너 마커 표시

        loop 캘리브레이션 4점
            Phone->>Phone: 카메라로 마커 촬영 → H 계산
            Phone->>Server: load-scene: calib (업데이트)
            Server->>TV: load-scene: calib (마커 이동)
        end

        Phone->>Server: load-scene: play (artworkRuntime, theme)
        Server->>TV: load-scene: play
        TV->>TV: loadArtwork + 렌더 시작

        loop 플레이 매 프레임 (~30Hz)
            Phone->>Phone: 손 추적 → 호모그래피 → 필터
            Phone->>Server: set-cursor / draw-stroke / fill-region
            Server->>TV: 커맨드 릴레이
            TV->>TV: GameEngine 실행
        end

        TV->>TV: 진행도 85% 도달 감지
        TV->>Server: play-effect: burst (via phone relay)
        Server->>Phone: play-effect: burst
        Phone->>Server: load-scene: gallery
        Server->>TV: load-scene: gallery
    end
```
