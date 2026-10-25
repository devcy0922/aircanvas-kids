# MCP 경계와 처리 위치

## 1. 외부 클라이언트가 직접 GoVail을 호출하는 경우

1. 클라이언트의 MCP adapter가 `initialize`와 `tools/list`를 수행한다.
2. 허용된 schema만 OpenAI `tools[].function`으로 변환해 Gateway에 보낸다.
3. 모델이 `tool_calls`를 반환하면 클라이언트 adapter가 `tools/call`을 실행한다.
4. 결과를 `role: "tool"`, 동일한 `tool_call_id`로 다음 `/v1/chat/completions` 요청에
   추가한다.

Gateway는 이 loop의 정책 지점이다. `tools[]`가 있는 요청을 runtime 검색·계획으로
재해석하지 않으며, DLP/AuthZ/쿼터/감사와 upstream 전달을 수행한다.

## 2. engine-process가 durable 실행을 소유하는 경우

호출자에게만 보이는 로컬 파일·브라우저·MCP는 Gateway나 engine-process 서버에
credential을 복사하지 않는다.

```text
agent-run + clientTools descriptor
  -> waiting_for_client_tool
  -> caller-side MCP tools/call
  -> POST .../client-tool-results(callId, attempt)
  -> same checkpoint resume
```

`callId + attempt`가 일치하는 결과만 callback하며, 같은 hash의 재전송은 멱등으로
처리하고 다른 결과는 충돌로 다룬다. `waiting_for_client_tool`에서 일반 `resume`을
호출하거나 새로운 operation id로 같은 요청을 복제하지 않는다.

## 3. 서버에 배포된 MCP를 engine-process가 소유하는 경우

engine-process 배포자가 `CY_PROCESS_MCP_CONFIG`에 server URL/command, allowlist,
필요한 secret, timeout을 등록한다. 클라이언트는 요청에서 `mcpServers` boolean과
`toolNames`로 이미 허용된 범위를 좁힐 수만 있다. Gateway의 `tools[]`와
engine-process의 `mcpServers`는 서로 다른 계층의 설정이므로 한 JSON 필드로 합치지
않는다.
