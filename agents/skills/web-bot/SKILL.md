---
name: web-bot
version: 1.2.0
description: "Python Playwright/CDP 기반 web-bot 실행 provider를 engine-process 및 다른 오케스트레이터에 안전하게 연결하는 가이드"
tags:
  - browser
  - web-bot
  - playwright
  - cdp
  - hitl
  - evidence
  - engine-process
  - mcp
owner: ai-service-infra
compatibility:
  codex: true
  gemini: true
  claude: true
  runtime: true
---

# web-bot 실행 provider

`web-bot`은 Python Playwright/CDP로 보호된 브라우저 세션을 실행하는 provider다.
작업 계획, LLM 호출, 장기 세션 오케스트레이션과 승인 정책은 소비자 또는
`engine-process`가 소유한다. web-bot은 브라우저 연결·사용자 핸드오프·결과 검증·증적과
알림을 실행 경계 안에서 담당한다.

## 1. 경계와 불변식

- web-bot은 `engine-process`를 import하거나 모델을 호출하지 않는다.
- CDP는 localhost 또는 인증된 내부 브라우저 노드에만 바인딩한다. 사용자에게 CDP 포트나
  DevTools URL을 전달하지 않는다.
- 하나의 `operationId`/`sessionId` 안에서 브라우저 프로필과 할당된 CDP endpoint를 고정한다.
  다른 provider나 다른 프로필로 조용히 전환하지 않는다.
- 비밀번호, OTP, 쿠키, authorization header, 세션 전체 HTML을 로그·증적·LLM 입력에
  저장하지 않는다.
- CAPTCHA·MFA·로그인은 자동 우회하지 않는다. 사용자가 안전한 핸드오프 화면에서 직접
  처리하면 같은 브라우저 세션의 읽기 전용 상태를 확인한 뒤 작업을 재개한다.
- 외부 등록·구매·삭제 같은 변경은 명시적 승인과 provider idempotency/reconciliation
  없이는 실행하지 않는다. 연결 끊김은 성공으로 추정하지 않고 `effect_uncertain`으로
  반환한다.

## 2. 현재 실행 표면

현재 web-bot 저장소에서 확인 가능한 표면은 다음과 같다.

### CLI/probe

공개 정보 조회와 인증 상태 확인은 CLI/probe를 통해 실행한다. 각 실행은 저장소의
`logs/evidence/<runId>/`에 다음을 남긴다.

- `manifest.json`: 작업, 상태, 시각, 안전한 URL, 결과 요약, artifact hash
- `events.jsonl`: 상태 전이와 알림 결과
- 필요한 경우 screenshot과 선별된 텍스트 snapshot

최소 상태는 아래처럼 구분한다.

```text
completed | awaiting_auth | failed | expired | effect_uncertain
```

`completed`는 목표 페이지에 도착했다는 뜻이 아니라, 목표와 결과 검증을 모두 마쳤다는
뜻이다. 인증이 필요하면 `awaiting_auth`로 반환하고, 사용자가 인증을 끝냈다는 사실은
페이지/세션 상태를 다시 읽어서 확인한다.

### CDP 포트 풀과 수명

M1 브라우저 노드의 web-bot CDP는 단일 포트를 공유하지 않고 내부 lifecycle controller가
작업별 lease를 할당한다.

- CDP 포트 풀은 `9222-9231`이다. `9222`는 기본 인증 프로필, 나머지는 작업별 격리
  프로필에 사용한다.
- lifecycle controller는 `9240`에서 내부망으로만 제공한다. 실제 값은 배포 환경의
  `CDP_LIFECYCLE_URL`로 주입하며, 이 URL이나 개별 CDP 포트를 외부에 공개하지 않는다.
- 연결할 때 고정값 `9222`를 직접 사용하지 말고 controller가 반환한 `cdpPort`를 같은
  `operationId`/`sessionId`의 연결 주소에 적용한다.
- 작업 종료·실패·TTL 만료 시 lease를 반드시 반환한다. CDP 포트 풀(`9222-9231`)은
  web-bot 전용 lifecycle 경계이므로 controller가 기동한 프로세스인지와 무관하게
  lease가 없는 idle 브라우저를 종료한다. controller 재시작 시에도 상태 reconcile이
  stale idle 슬롯을 정리한다.
- 포트 고갈은 새 브라우저를 무한히 생성하는 신호가 아니다. 활성 lease와 controller
  상태를 먼저 읽고, 종료 누락·TTL 만료를 정리한 뒤 `failed` 또는 `expired`로 반환한다.

CDP 포트 풀(`9222-9231`)과 Browser Node HTTP 서비스 풀(`8765-8774`)은 서로 다른
실행 표면이다. web-bot이 Browser Node 포트를 직접 점유하거나 engine-process가 CDP
프로세스를 관리하지 않는다.

### 모바일 세션 handoff

사용자가 서버 브라우저에서 네이버 로그인처럼 직접 입력해야 하는 경우에는 세션 서버가
짧은 TTL의 one-time handoff URL을 만든다.

```bash
python3 -m web_bot.session_server --target naver-login
```

현재 세션 서버의 표면은 다음과 같다.

- `POST /v1/browser-sessions`: 세션 생성. 제어 토큰은 서버 간 호출에만 사용한다.
- `GET /browser-sessions/handoff/{oneTimeToken}`: 사용자에게 보여줄 보호된 화면.
- `WebSocket /browser-sessions/{sessionId}/ws`: 터치·키보드·화면 프레임 전달.
- 명시적 close 또는 WebSocket 단절 시 page/Playwright 연결과 CDP lease를 즉시 정리한다.
  인증 완료 세션은 결과 polling을 위해 상태 레코드만 짧게 유지하고 브라우저 manager는
  닫는다. 미완료 세션은 상태 레코드도 정리한다.

handoff URL은 채팅·로그·증적에 장기 보관하지 않는다. 사용자에게는 URL, 만료 시각,
해야 할 작업만 전달한다. 세션 완료 후 소비자는 동일 `sessionId`와 `operationId`로
인증 상태 확인을 요청한다.

## 3. engine-process 연결

engine-process에 연결할 때는 web-bot 코어를 엔진 안으로 복사하지 않고, 별도의 MCP 또는
RemoteTool adapter를 둔다. adapter는 최소한 다음 메타데이터를 왕복시킨다.

```text
operationId
sessionId
tool/effect
status
approvalReceiptIds        # 외부 변경인 경우
evidenceRefs              # manifest/event/screenshot의 안전한 식별자
effectStatus              # committed | not_committed | unknown
```

예를 들어 소비자 레포의 provider 설정은 배포 환경에서 adapter가 실제로 제공될 때만
작성한다.

```json
{
  "mcpServers": {
    "web-bot": {
      "url": "https://<protected-web-bot-adapter>/mcp",
      "allowlist": [
        "web-bot.browser_probe",
        "web-bot.browser_session_status"
      ]
    }
  }
}
```

위 URL은 예시 placeholder다. 현재 모바일 세션 게이트웨이만 배포된 상태라면 그것은
화면 핸드오프 HTTP/WS surface일 뿐 MCP 서버가 아니다. `GET /manifest`·`POST /execute`
또는 MCP tool이 구현·배포되었다는 증거 없이 `CY_PROCESS_MCP_CONFIG`에 직접 등록하지
않는다.

engine-process 소비자 지침에는 provider 선택과 함께 다음을 명시한다.

```text
web-bot은 브라우저 실행 provider다.
인증은 awaiting_auth로 중단하고 one-time handoff를 사용자에게 요청한다.
완료 후 같은 operationId/sessionId로 상태를 확인하고 evidenceRefs를 보존한다.
결과 불명확한 외부 변경은 재시도하지 않고 effect_uncertain으로 사람에게 넘긴다.
```

## 4. 승인·알림·증적

- 읽기/탐색도 `runId`, `operationId`, `sessionId`를 연결해 기록한다.
- 외부 변경은 승인 전 제안과 승인 후 실행을 구분하고, 승인 영수증 식별자만 기록한다.
- 알림 lifecycle은 `task.started` → `task.progress`/`awaiting_auth` →
  `task.completed` 또는 `task.failed`를 사용한다. 같은 작업은 같은 `runId`로 갱신한다.
- 알림 본문에는 비밀번호·OTP·쿠키·전체 URL query secret을 넣지 않는다.
- 증적은 안전한 URL, 결과 요약, 상태, artifact hash, screenshot reference 중심으로
  남긴다. 원본 HTML과 세션 저장소는 증적 대상이 아니다.
- `effect_uncertain`에서는 자동 재실행·자동 구매·자동 게시를 하지 않고, 읽기 전용
  검증이나 사람 확인만 다음 단계로 허용한다.

## 5. 소비자별 선택

| 요구 | 선택 |
| --- | --- |
| 빠른 공개 정보 조회·접근성 트리 조작 | `agent-browser` provider |
| 실제 로그인·MFA·CAPTCHA를 사용자가 모바일에서 처리 | `web-bot` + handoff |
| 승인 영수증과 외부 변경 정책이 핵심 | `computer-use` tool provider 또는 그 adapter |
| 장기 대화·재개·도구 정책·LLM 루프 | `engine-process` |

`agent-browser`, `web-bot`, `computer-use`는 한 operation에서 무작위로 섞지 않는다.
작업을 다른 provider로 옮겨야 하면 새 실행 경계를 만들고, 기존 결과와 증적을 먼저
확인한 뒤 명시적으로 전환한다.

## 6. 점검 순서

1. lifecycle controller가 건강하고 lease 가능한 CDP 포트가 있는지 확인한다.
2. controller가 반환한 `cdpPort`와 CDP endpoint가 loopback/보호된 내부 주소인지 확인한다.
3. 세션이 전용 profile과 TTL을 사용하는지 확인한다.
4. 인증 필요 여부를 판정해 `awaiting_auth`를 먼저 반환한다.
5. 사용자가 입력한 뒤 로그인 상태를 읽기 전용으로 확인한다.
6. evidence manifest/events와 알림 lifecycle을 확인한다.
7. 외부 변경이면 승인 영수증, idempotency key, 결과 검증을 모두 확인한다.
