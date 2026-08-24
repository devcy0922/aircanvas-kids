# AirCanvas Kids 🖐️📺 v0.2

**스마트폰 카메라 1대 + 스마트 TV 1대 + Wi-Fi** 만으로 플레이하는 공중 제스처 드로잉·색칠 게임.

아이(또는 아이와 부모가 함께)가 TV 앞 허공에서 손가락으로 그림을 그리면,
폰 카메라가 **손 좌표만** 추적해 TV 화면의 커서를 움직입니다.
색칠을 완성하면 작품이 파티클 이펙트와 함께 **공룡 / 정글 / 바다** 테마 월드에 투입됩니다.

> **핵심 원칙**: **카메라 영상은 어디로도 전송되지 않습니다.** 폰은 좌표(초당 수 KB)만 보내고,
> 모든 렌더링은 TV에서 일어납니다. 프라이버시 안전 + 초저지연 + 초저트래픽.

## 아키텍처: Phone = Brain, TV = Thin Display

```
┌─────────────────┐     HTTPS      ┌─────────────┐     로컬 WS      ┌──────────────┐
│  콘텐츠 서버      │ ◄───────────── │   폰        │ ──────────────► │     TV       │
│  (Nginx/정적)     │  manifest/에셋  │  (브레인)    │   TVCommand    │  (씬 렌더러)   │
└─────────────────┘                 └─────────────┘                 └──────────────┘
        ▲                                    │
        │          mDNS/HTTP 브로드캐스트      │
        └────────────────────────────────────┘
              TV 자동 탐색 (QR 폴백)
```

- **폰**: 게임 상태 머신 운영, 손 추적, 캘리브레이션, 패키지 관리, TV 탐색, 렌더 커맨드 송신
- **TV**: PixiJS 렌더 엔진만 보유, 폰 커맨드 수신 실행 (상태 없음)
- **서버**: 방 코드 세션 매칭 + 커맨드 릴레이만 담당
- **콘텐츠 서버**: 게임 패키지(매니페스트+에셋) 버전관리/서빙

## 저장소 구조

```
aircanvas-kids/
├─ apps/
│  ├─ phone/        # 폰 클라이언트: MediaPipe 손추적, 캘리브레이션, 게임 상태 머신, TV 탐색
│  └─ tv/           # TV 클라이언트: PixiJS 렌더링, TVCommand 핸들러
├─ packages/
│  ├─ protocol/     # WS 메시지/TVCommand/게임패키지 스키마 단일 진실원 (@ht/protocol)
│  └─ tv-art/       # 아트워크 30종 데이터 (공룡·정글·바다 × 10) (@ht/tv-art)
├─ server/          # Rust(Axum) WebSocket 릴레이 — 방 코드 세션 매칭
├─ content-server/  # Nginx 정적 파일 서빙 (manifest.json + 썸네일)
├─ tools/           # 가짜 폰 시뮬레이터, 릴레이 스모크 테스트
└─ docs/            # 아키텍처/프로토콜/캘리브레이션/콘텐츠/로드맵 문서
```

## 빠른 시작

### 0) 요구 사항
- Node.js 20+ / npm 10+
- Rust (stable)
- 같은 Wi-Fi(또는 LAN)에 연결된 스마트폰과 스마트 TV

### 1) 설치 & 전체 빌드

```bash
# 의존성 설치 + 프로토콜/아트워크 빌드
npm run setup

# 전체 빌드 (TV/폰 앱 프로덕션)
npm run build

# 서버 체크 (Rust)
cargo check --manifest-path server/Cargo.toml
```

### 2) 실행 (개발 모드, 터미널 3개 필요)

**터미널 1: 콘텐츠 서버 (Nginx)**
```bash
cd content-server
nginx -c nginx.conf -p $(pwd)
# http://localhost:8081/manifest.json 으로 확인
```

**터미널 2: 릴레이 서버 (Rust)**
```bash
cargo run --manifest-path server/Cargo.toml
# 기본 0.0.0.0:8080
# 환경변수로 변경: HT_BIND=0.0.0.0:8081 cargo run ...
```

**터미널 3: TV 앱 (Vite)**
```bash
npm run dev:tv
# http://<PC_IP>:5173 접속 → TV 브라우저에서 열기
```

**터미널 4: 폰 앱 (Vite)**
```bash
npm run dev:phone
# http://<PC_IP>:5174 접속 → 폰 브라우저에서 열기
```

> **중요**: 폰 카메라 권한은 HTTPS 또는 localhost에서만 허용됨.
> 개발 시 크롬 `chrome://flags/#unsafely-treat-insecure-origin-as-secure` 에 `http://<PC_IP>:5174` 추가 필요.

### 3) 플레이 흐름

1. **TV 브라우저 접속** → 홈 화면에 QR 코드 + 방 코드 6자리 표시
2. **폰에서 TV 자동 찾기** 탭 → 같은 Wi-Fi의 TV 자동 탐색 → 선택
   - 또는 QR 스캔 → 서버 주소·방 코드 자동 입력 → 자동 입장
3. **폰에서 테마(공룡/정글/바다) 선택** → TV에 해당 테마 월드 로드
4. **폰에서 작품 선택** → 자동으로 **4코너 캘리브레이션** 진입
   - TV 화면의 네 점을 카메라 십자에 맞춰 캡처 ×4
   - 한 번만 하면 로컬스토리지에 저장되어 재실행 불필요
5. **폰을 TV 앞(또는 살짝 옆)에 고정** → 아이가 허공에 손으로 그림
6. **폰에서 색/모드(색칠·그리기) 선택**, **"이 위치 채우기"** 로 영역 색칠
7. 진행도 85% 달성 → 완성 이펙트 → 테마 월드 갤러리에 작품 등장

#### URL 파라미터 레퍼런스

| 앱 | 파라미터 | 설명 |
|---|---|---|
| TV (`:5173`) | `?server=http://IP:8080` | 릴레이 서버 주소 오버라이드 |
| TV | `?phoneApp=http://IP:5174` | QR에 넣을 폰 앱 주소 오버라이드 |
| 폰 (`:5174`) | `?server=http://IP:8080` | 릴레이 서버 주소 (QR로 자동 전달) |
| 폰 | `?room=ABC123` | 방 코드 자동 입력 + 자동 입장 (QR로 자동 전달) |
| 폰 | `?content=http://IP:8081` | 콘텐츠 서버 주소 오버라이드 |

기본값: TV/폰 모두 같은 호스트의 `:8080` 서버, 콘텐츠 서버 `:8081` 사용 가정.

### 데모(폰 없이) 검증

PC에서 시뮬레이터로 좌표를 흘려보내 TV 커서가 도는 것을 확인:

```bash
node tools/fake-phone-sim.mjs DEMO01   # TV 화면의 방 코드와 동일하게 입력
node tools/smoke-relay.mjs             # 서버 릴레이 자동 스모크 테스트
```

## 기술 스택

- **TV**: React 18 · PixiJS 8 · qrcode(QR 생성) · Vite
- **Phone**: React 18 · MediaPipe Tasks Vision(Hand Landmarker, WASM/GPU) · One-Euro 필터 · Vite
- **Server**: Rust · Axum 0.8 · tokio-tungstenite
- **Content Server**: Nginx + 정적 파일 (manifest.json + SVG 썸네일)
- **공유**: TypeScript 워크스페이스 모노레포, 좌표는 항상 0..1 정규화(TV 좌표계)

## 현재 상태 (v0.2)

- [x] 릴레이 서버: 방 코드 매칭, 좌표/커맨드 중계 (스모크 테스트 통과)
- [x] 폰: MediaPipe 손 추적 → 호모그래피 변환 → One-Euro 스무딩 → 30Hz 전송
- [x] TV: 커서/자유선/영역 색칠, 진행도 집계, 완성 파티클, 테마 갤러리
- [x] 콘텐츠: 공룡·정글·바다 × 10 = 30종 (패키지 매니페스트로 관리)
- [x] QR 스캔 연결 + 수동 입력 폴백
- [x] **폰 주도 테마/작품 선택** (`select-theme` / `select-artwork` → `load-scene`)
- [x] **Phone=Brain / TV=Thin Display** 아키텍처 적용
- [x] **콘텐츠 서버(Nginx) + 패키지 매니페스트**로 아트워크 버전 관리
- [x] **TV 자동 탐색** (mDNS/HTTP 브로드캐스트) + QR 폴백
- [ ] 폰↔TV 실기기 E2E 플레이 테스트 및 추적 안정성 튜닝 (M3 첫 항목)
- [ ] 폰 카메라 HTTPS 접근 구성(basic-ssl 또는 Caddy 리버스 프록시)
- [ ] 핀치 제스처 → TV 브러시 on/off 완전 연결
- [ ] 자동 마커 인식 캘리브레이션 (OpenCV.js/ArUco)

## 문서

| 문서 | 내용 |
|---|---|
| [docs/architecture.md](docs/architecture.md) | 시스템 구성요소, 데이터 흐름, Mermaid 다이어그램 |
| [docs/protocol.md](docs/protocol.md) | WebSocket/TVCommand/콘텐츠API 메시지 명세 |
| [docs/calibration.md](docs/calibration.md) | 4코너 호모그래피 캘리브레이션 절차·품질 기준 |
| [docs/content-pipeline.md](docs/content-pipeline.md) | 아트워크 패키지 규격과 색칠 진행도 알고리즘 |
| [docs/roadmap.md](docs/roadmap.md) | M3~M5 계획 및 기술 부채 |
| [agents/rules.md](agents/rules.md) | 프로젝트 작업 규칙 |

## 라이선스

사내/개인 포트폴리오 용도 (TBD)