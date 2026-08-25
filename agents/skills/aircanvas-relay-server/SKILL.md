---
name: aircanvas-relay-server
description: >-
  AirCanvas Kids의 Rust/Axum 릴레이 서버 아키텍처, WebSocket 세션 라우팅, 방 매칭(roomCode), 디스커버리 엔드포인트(/announce), CORS 설정 및 빌드/실행 가이드.
---

# AirCanvas Kids 릴레이 서버 가이드 (Rust / Axum)

서버는 무거운 비즈니스 로직 없이 **초저지연 WebSocket 프레임 라우팅** 및 **룸 세션 관리**를 전담하는 고성능 Rust 백엔드입니다.

## 1. 서버 아키텍처 및 기술 스택

- **프레임워크:** Axum 0.8 + tokio-tungstenite (비동기 I/O)
- **CORS:** `tower-http`의 `CorsLayer::permissive()`로 모든 Cross-Origin 요청 허용.
- **상태 관리:** `Arc<Mutex<HashMap<RoomCode, RoomState>>>` 기반 인메모리 룸 맵.
- **룸 관리:**
  - 6자리 대문자 영숫자 `roomCode`로 폰과 TV를 페어링.
  - TV 1대와 Phone 최대 4대(기본 1대) 수용.

---

## 2. 주요 엔드포인트 명세

| 엔드포인트 | 메서드 / 프로토콜 | 설명 |
|---|---|---|
| `/health` | `GET` | 헬스체크 (`"ok, rooms=N"`) |
| `/announce` | `GET` | TV/서버 디스커버리 JSON 반환 (CORS 허용) |
| `/ws` | `WebSocket` | 실시간 릴레이 (`?role=tv&room=XXX` 또는 `?role=phone&room=XXX`) |

---

## 3. 실행 및 환경 변수

- 기본 포트: `8080` (환경변수 `HT_BIND`로 변경 가능).
  ```bash
  HT_BIND=0.0.0.0:8080 cargo run --release
  ```
- 검증:
  ```bash
  cargo check
  ```
