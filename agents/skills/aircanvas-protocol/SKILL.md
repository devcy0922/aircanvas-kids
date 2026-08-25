---
name: aircanvas-protocol
description: >-
  AirCanvas Kids WebSocket 프로토콜, TVCommand 명세, 정규화 좌표계 규약, 디스커버리 및 타입 동기화 가이드.
---

# AirCanvas Kids 프로토콜 가이드 (v0.2)

AirCanvas Kids의 모든 실시간 데이터 교환은 WebSocket 단일 엔드포인트(`ws://<host>:8080/ws`) 상의 JSON 텍스트 프레임으로 이루어집니다.

## 1. 연결 및 방(Room) 수명주기

### WebSocket 연결 파라미터
- 폰: `ws://<server>:8080/ws?role=phone&room=<ROOM_CODE>`
- TV: `ws://<server>:8080/ws?role=tv&room=<ROOM_CODE>`
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
- `home`: `{ scene: 'home', roomCode: string, tvName?: string }`
- `calib`: `{ scene: 'calib', theme: ThemeId, artworkName: string, corners: { x: number, y: number }[] }`
- `play`: `{ scene: 'play', artwork: ArtworkRuntime, theme: ThemeId }`
- `gallery`: `{ scene: 'gallery', theme: ThemeId, completed: CompletedArtwork[] }`

### 2) `set-cursor` (커서 이동, ~30Hz)
```ts
{
  type: 'set-cursor',
  x: number, // 0.0 ~ 1.0 (정규화 좌표)
  y: number, // 0.0 ~ 1.0 (정규화 좌표)
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

### 4) `fill-region` / `fill-at` (영역 채색)
```ts
// ID 기반 채색
{ type: 'fill-region', regionId: string, color: string }

// 좌표 기반 히트테스트 채색 (권장 확장)
{ type: 'fill-at', x: number, y: number, color: string }
```

### 5) `play-effect` (특수효과 연출)
```ts
{
  type: 'play-effect',
  effect: 'burst' | 'confetti' | 'pulse',
  params: { x?: number, y?: number, color?: string }
}
```

### 6) `set-progress` (진행도 갱신)
```ts
{
  type: 'set-progress',
  percent: number, // 0 ~ 100
  artworkName?: string
}
```

---

## 3. 좌표계 규약 (Coordinate Normalization)

- **원칙:** 폰에서 송신하는 모든 좌표는 **0.0 ~ 1.0 범위로 정규화된 TV 화면 좌표계**를 기준으로 합니다.
  - `(0.0, 0.0)`: TV 화면 좌상단 (Top-Left)
  - `(1.0, 1.0)`: TV 화면 우하단 (Bottom-Right)
- TV 렌더러(`GameEngine.ts`)는 수신된 정규화 좌표를 `x * screenWidth`, `y * screenHeight`로 스케일하여 렌더링합니다.
- 모바일 카메라 뷰 좌표는 4-코너 호모그래피 투영 변환을 통해 정규화 좌표계로 사전 변환된 후 전송됩니다.

---

## 4. TV 디스커버리 프로토콜

로컬 네트워크에서 폰이 TV를 자동 탐색할 수 있도록 Rust 서버 및 TV는 다음 규격을 제공합니다:

```json
GET /announce
{
  "type": "tv-announce",
  "roomCode": "ABC123",
  "tvName": "Living Room TV",
  "tvId": "tv_9941",
  "wsUrl": "ws://192.168.0.10:8080/ws",
  "httpUrl": "http://192.168.0.10:8080",
  "capabilities": {
    "maxResolution": { "width": 1920, "height": 1080 },
    "supportsWebGL2": true,
    "supportsWASMSIMD": true,
    "pixiVersion": "8.0"
  },
  "timestamp": 1724448000000
}
```
*주의: 브라우저 환경에서 cross-origin fetch를 지원하기 위해 CORS `Access-Control-Allow-Origin: *` 헤더 필수.*
