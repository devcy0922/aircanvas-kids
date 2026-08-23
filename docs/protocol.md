# 통신 프로토콜 명세 (v0.1)

단일 WebSocket 엔드포인트에서 JSON 텍스트 프레임으로 통신한다.
스키마의 단일 진실원은 `packages/protocol/src/index.ts` 이며, 서버 Rust 구현은 이 문서와 동기화를 유지한다.

## 1. 연결

```
ws://<server>:8080/ws?role=tv&room=ABC123
ws://<server>:8080/ws?role=phone&room=ABC123
```

- `room`: 6자리 대문자 영숫자. TV가 생성하고 폰이 입력한다.
- 한 room 에 `tv`는 최대 1대, `phone`은 최대 4대까지 허용(v0.1은 1대 사용).
- 첫 메시지로 서버→클라이언트 `welcome`, 두 번째 클라이언트 접속 시 상대에게 `peer-joined` 전송.

## 2. 메시지 공통 형태

모든 메시지는 `type` 필드를 갖는다.

```ts
interface BaseMessage { type: string }
```

## 3. TV → 서버

### `hello-tv`
```json
{ "type": "hello-tv", "displayName": "Living Room TV", "screen": { "w": 1920, "h": 1080 } }
```

### `create-room` (생략 가능 — 쿼리의 room 우선)
```json
{ "type": "create-room" }
```
응답으로 서버가 `room-created`를 보낸다.

## 4. 폰 → 서버 → TV (좌표 스트림, 핵심 경로)

### `hello-phone`
```json
{ "type": "hello-phone", "displayName": "Dad's Phone" }
```

### `point` (약 30Hz, 지속 전송)
```json
{ "type": "point", "x": 0.512, "y": 0.337, "pinch": false, "t": 1724448000000 }
```
- `x,y`: **TV 좌표계 정규화 값(0..1)** — 캘리브레이션 호모그래피 적용 후 값.
- `pinch`: 엄지-검지 핀치 여부(그리기 on/off 트리거로 사용 가능). v0.1 TV는 드로잉 모드 토글을 별도 UI로도 제공.
- `t`: 폰 기준 타임스탬프(ms). 지연 측정·보간 참고용.

### `stroke-start` / `stroke-end`
```json
{ "type": "stroke-start", "color": "#e63946" }
{ "type": "stroke-end" }
```

### `fill`
```json
{ "type": "fill", "x": 0.42, "y": 0.61, "color": "#457b9d" }
```
색칠 모드에서 영역 채우기 요청. TV가 SVG region hit-test를 수행한다.

### `undo`
```json
{ "type": "undo" }
```

## 3.5 폰 → 서버 → TV (게임 제어)

### `select-theme`
```json
{ "type": "select-theme", "theme": "dino" }
```
테마 선택(공룡 `dino` / 정글 `jungle` / 바다 `ocean`). TV는 홈/갤러리에서 이 메시지를 받으면
해당 테마의 첫 작품으로 캘리브레이션→플레이 흐름을 시작한다. **테마 선택 UI는 폰에만 존재한다.**

### `select-artwork`
```json
{ "type": "select-artwork", "theme": "ocean", "index": 3 }
```
테마 내 작품 선택(0-based 인덱스). TV는 즉시 해당 아트워크로 그리기 화면을 로드한다.

## 5. 서버 → 클라이언트 (제어)

### `welcome`
```json
{ "type": "welcome", "room": "ABC123", "role": "tv", "peers": ["phone"] }
```

### `room-created`
```json
{ "type": "room-created", "room": "ABC123" }
```

### `peer-joined`
```json
{ "type": "peer-joined", "role": "phone", "displayName": "Dad's Phone" }
```

### `peer-left`
```json
{ "type": "peer-left", "role": "phone" }
```

### `error`
```json
{ "type": "error", "code": "ROOM_NOT_FOUND", "message": "..." }
```
에러 코드: `ROOM_NOT_FOUND`, `ROOM_FULL`, `ROLE_CONFLICT`, `BAD_REQUEST`.

## 6. 트래픽 예산

| 메시지 | 빈도 | 크기(대략) | 대역폭 |
|---|---|---|---|
| point | 30/s | ~80B | ~2.4KB/s |
| fill/stroke | 이벤트성 | <200B | 무시 가능 |

영상 스트리밍(720p H.264 ≈ 1~3Mbps) 대비 **1/1000 수준**이다.
