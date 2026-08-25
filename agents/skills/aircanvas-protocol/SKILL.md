---
name: aircanvas-protocol
description: >-
  AirCanvas Kids WebSocket 프로토콜, TVCommand 명세(fill-at 포함), 정규화 좌표계 규약, 디스커버리(/announce), 도메인 독립성 및 타입 동기화 가이드.
---

# AirCanvas Kids 프로토콜 가이드 (v0.2)

AirCanvas Kids의 모든 실시간 데이터 교환은 WebSocket 단일 엔드포인트(`ws(s)://<host>/ws`) 상의 JSON 텍스트 프레임으로 이루어집니다.

## 1. 연결 및 방(Room) 수명주기

### WebSocket 연결 파라미터
- 폰: `ws(s)://<server>/ws?role=phone&room=<ROOM_CODE>`
- TV: `ws(s)://<server>/ws?role=tv&room=<ROOM_CODE>`
- `room`: 6자리 영숫자 대문자(예: `DEMO01`, `KIDS01`).

### 세션 핸드셰이크 메시지
1. **서버 → 클라이언트 (환영):**
   ```json
   { "type": "welcome", "room": "ABC123", "role": "tv", "peers": ["phone"] }
   ```
2. **서버 → 상대 피어 (접속 통보):**
   ```json
   { "type": "peer-joined", "role": "phone", "displayName": "Kid's Phone" }
   ```
3. **서버 → 상대 피어 (이탈 통보):**
   ```json
   { "type": "peer-left", "role": "phone" }
   ```

---

## 2. v0.2 `TVCommand` 명세 (Phone → TV)

`packages/protocol/src/index.ts`가 단일 진실원(SSOT)입니다.

### 1) `load-scene` (씬 전환)
```ts
{
  type: 'load-scene',
  scene: 'home' | 'calib' | 'play' | 'gallery',
  payload: LoadScenePayload
}
```

### 2) `set-cursor` (커서 이동, ~30Hz)
```ts
{
  type: 'set-cursor',
  x: number, // 0.0 ~ 1.0 (TV 정규화 좌표)
  y: number, // 0.0 ~ 1.0 (TV 정규화 좌표)
  visible: boolean,
  color?: string
}
```

### 3) `draw-stroke` (자유 드로잉 선분)
```ts
{
  type: 'draw-stroke',
  points: [{ x: number, y: number }, ...],
  color: string
}
```

### 4) `fill-at` (좌표 기반 영역 채색 - 권장 표준)
```ts
{
  type: 'fill-at',
  x: number, // 0.0 ~ 1.0 (TV 화면 정규화 좌표)
  y: number, // 0.0 ~ 1.0 (TV 화면 정규화 좌표)
  color: string
}
```
*TV 렌더러가 내부에서 `Path2D.isPointInPath` 히트테스트를 수행하여 해당 영역을 클립 채색합니다.*

### 5) `fill-region` (영역 ID 기반 채색)
```ts
{ type: 'fill-region', regionId: string, color: string }
```

### 6) `play-effect` (특수효과 연출)
```ts
{
  type: 'play-effect',
  effect: 'burst' | 'confetti' | 'pulse',
  params: { x?: number, y?: number, color?: string }
}
```

### 7) `set-progress` (진행도 갱신)
```ts
{
  type: 'set-progress',
  percent: number, // 0 ~ 100
  artworkName?: string
}
```

---

## 3. 좌표계 및 도메인 규약

- **좌표 정규화:** 모든 좌표는 `0.0 ~ 1.0` (TV 화면 좌상단 `(0,0)`, 우하단 `(1,1)`).
- **도메인 독립성 (play.aircanvas.kr 등):**
  - 클라이언트는 URL 쿼리 파라미터(`?server=`, `?content=`)가 없으면 `location.protocol` 및 `location.host`를 기반으로 동적 탐지.
  - `wsUrl` 헬퍼 함수는 `https://`를 `wss://`로, `http://`를 `ws://`로 자동 변환.

---

## 4. TV 디스커버리 프로토콜 (`GET /announce`)

Rust 서버는 CORS `*` 헤더와 함께 로컬 TV 디스커버리 정보를 응답합니다:
```json
GET /announce
{
  "type": "tv-announce",
  "roomCode": "DEMO01",
  "tvName": "AirCanvas TV",
  "tvId": "tv-demo01",
  "wsUrl": "ws://127.0.0.1:8080/ws?role=tv&room=DEMO01",
  "httpUrl": "http://127.0.0.1:8080",
  "capabilities": {
    "maxResolution": { "width": 1920, "height": 1080 },
    "supportsWebGL2": true,
    "supportsWASMSIMD": true,
    "pixiVersion": "8.0"
  },
  "timestamp": 1724448000000
}
```
