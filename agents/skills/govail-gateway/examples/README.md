# GoVail Gateway 클라이언트 도구 예제

GoVail Gateway는 OpenAI-compatible 정책 집행 지점이다. 외부 애플리케이션은
`/v1/chat/completions`에 모델과 `tools[]`를 보내고, Gateway가 반환한
`tool_calls`를 자기 adapter 또는 MCP client로 실행한 뒤 `role: "tool"` 결과를
다음 요청에 넣는다.

```text
client ── tools[] + messages ──> GoVail Gateway ──> LLM
client <──────── tool_calls ──── GoVail Gateway <── LLM
client ── local/MCP execution ──> tool result
client ── role=tool messages ───> GoVail Gateway ──> LLM
```

이 구조에서 Gateway는 MCP server를 직접 spawn하거나 호출자의 localhost·credential을
열지 않는다. MCP를 쓰는 클라이언트는 `tools/list` schema를 OpenAI function schema로
변환하고 `tools/call` 결과를 `tool_call_id`에 맞춰 다시 보낸다. durable한
engine-process 실행에서 호출자 로컬 자원을 써야 한다면 raw MCP 설정을 Gateway에
넣는 대신 engine-process `clientTools` descriptor와 callback 경계를 사용한다.

## 실행

```bash
export GOVAIL_GATEWAY_URL="https://gateway.example.invalid"
export GOVAIL_API_KEY="<api-key>"
export GOVAIL_MODEL="govail/worker"
bash examples/tools-chat-completion.sh
```

예제의 `lookup_order`는 호출자 측 읽기 전용 adapter 자리표시자다. 스크립트는 tool schema를 보내고 반환된 `tool_calls`를 출력한다. 클라이언트는 이를
자기 adapter 또는 MCP `tools/call`로 실행하고 `tool_call_id`가 일치하는 `role: "tool"`
결과를 다음 요청에 추가한다. 실제 MCP나 업무 API로 교체할 때에도 인증서·토큰을 모델 입력, tool result, 로그에 넣지 않는다. Gateway
응답의 `x-govail-*` 헤더는 라우팅·예산 관측에 사용하고, tool effect가 커밋됐다는
증거로 해석하지 않는다.
