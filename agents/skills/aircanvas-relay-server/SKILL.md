---
name: aircanvas-relay-server
description: >-
  AirCanvas Kids의 Rust/Axum 릴레이 서버 아키텍처, WebSocket 세션 라우팅, 방 매칭(roomCode), 디스커버리 엔드포인트(/announce), 빌드/실행 환경 가이드.
---

# AirCanvas Kids 릴레이 서버 가이드 (Rust / Axum)

서버는 무거운 비즈니스 로직 없이 **초저지연 WebSocket 프레임 라우팅** 및 **룸 세션 관리**를 전담하는 고성능 Rust 백엔드입니다.

## 1. 서버 아키텍처 및 기술 스택

- **프레임워크:** Axum + tokio-tungstenite (비동기 I/O)
- **상태 관리:** `Arc<RwLock<AppState>>` 기반 인메모리 룸 맵 (`HashMap<RoomCode, RoomSession>`).
- **룸 관리:**
  - 6자리 대문자 영숫자 `roomCode`로 폰과 TV를 페어링.
  - TV 1대와 Phone 최대 4대(기본 1대) 수용.
  - 피어 간 송수신은 `broadcast::Sender` 또는 MPSC 채널을 통해 즉시 바이패스.

---

## 2. 주요 엔드포인트 명세

| 엔드포인트 | 메서드 / 프로토콜 | 설명 |
|---|---|---|
| `/health` | `GET` | 헬스체크 (`"status": "ok"`) |
| `/announce` | `GET` | TV/서버 디스커버리 JSON 반환 (CORS `*` 헤더 필수) |
| `/ws` | `WebSocket` | 실시간 릴레이 (`?role=tv&room=XXX` 또는 `?role=phone&room=XXX`) |

---

## 3. 실행 및 환경 변수

- 기본 포트: `8080` (호스트 환경 충돌 시 `HT_BIND` 환경변수로 조정 가능).
  - 예: `HT_BIND=0.0.0.0:18080 cargo run`
- 환경별 바인딩 주의사항:
  - `cy-server` 등 공용 인프라에서 8080/8081이 다른 서비스(FLEVO/GoVail 등)에 의해 점유되어 있을 경우, 포트 충돌에 유의하여 실행.

---

## 4. Rust 코드 작성 및 검증 규칙

- TypeScript 프로토콜 타입(`packages/protocol/src/index.ts`)과의 동기화를 엄격히 유지.
- 검증 명령어:
  ```bash
  cargo check
  cargo test
  ```
- 클라이언트 빌드와의 호환성 확인:
  ```bash
  npm run build
  ```
