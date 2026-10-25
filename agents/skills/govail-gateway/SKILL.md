---
name: govail-gateway
description: >
  Use when working on apps/gateway — Rust/Axum OpenAI-compatible proxy, auth,
  API keys, DLP redaction, rate limit, SSE streaming, audit logs, LiteLLM/vLLM
  upstream, model slots (fast/thinking/auto), route_target llm|runtime,
  console static serving, /engine-api runtime relay, or gateway tests/Makefile targets.
---

# Govail Gateway — Rust/Axum 도메인 스킬

> **역할**: GoVail Gateway(Rust/Axum) 작업 절차 및 표준 아키텍처 체크리스트.

## 프로젝트 정체성

이 컴포넌트는 **Govail AI 거버넌스 런타임의 정책 집행 지점(PEP)**이다.
- Rust(Axum) 기반 OpenAI-compatible 엔드포인트
- 모든 LLM 요청은 반드시 이 게이트웨이를 통과
- 정책 없이는 어떤 요청도 통과 불가

## 클라이언트 도구와 MCP 예제

외부 클라이언트가 도구를 붙이는 실제 흐름은 [`examples/README.md`](examples/README.md)와
[`examples/tools-chat-completion.sh`](examples/tools-chat-completion.sh)에서 확인한다.

- GoVail Gateway 요청에는 OpenAI-compatible `tools[]`와 `tool_choice`를 보낸다.
- `tools[]`가 비어 있지 않아도 Gateway는 OpenAI-compatible 요청을 검증·중계한다. 도구
  loop와 실제 adapter 실행은 클라이언트가 소유하며 Gateway가 semantic intent를 가로채지 않는다.
- raw MCP `command`/`url`/credential은 Gateway 요청에 넣지 않는다. MCP를 쓰는
  클라이언트가 `initialize → tools/list → tools/call`을 수행하고, 결과를
  `role: "tool"` 메시지 또는 engine-process의 `client-tool-results` callback으로
  변환한다. MCP 경계와 durable callback 흐름은 [`examples/mcp-boundary.md`](examples/mcp-boundary.md)에 있다.
- Gateway의 인증·DLP·쿼터·감사·모델 라우팅 통과는 도구 실행이나 외부 변경 성공의
  증거가 아니다. write/external 효과는 클라이언트/도구 provider의 승인·멱등성·verify
  결과를 별도로 확인한다.

## 개발 워크플로우

```bash
make -C apps/gateway gateway-fmt-check
make -C apps/gateway gateway-typecheck
make -C apps/gateway gateway-lint
make -C apps/gateway gateway-test
make -C apps/gateway gateway-check
```

## 코드 작업 전 확인

- `apps/gateway/gateway/Cargo.toml` · `apps/gateway/gateway/src/` 구조 파악 후 수정
- 라우팅 계약: Gateway 내부 라우팅 문서 및 계약 사양 참조
- 실측 토폴로지: `docs/internal/gateway-routing-topology.md` (비공개 참고용)

## 배포

- 배포 환경: GoVail 컨테이너 런타임 (Docker Compose / 클라우드 네이티브 환경)
- LLM 업스트림: `ai-service-infra` LiteLLM (`GOVAIL_UPSTREAM_URL` 주입)
- 브레이킹 체인지: 태그 전 CHANGELOG 문서화

## Streaming timeout contract

- `upstream.timeout_seconds`는 buffered 요청 예산이다.
- Streaming은 `streaming.first_token_timeout_seconds`와
  `streaming.stream_idle_timeout_seconds`를 사용하며, 첫 chunk 이후 전체 누적
  timeout을 적용하지 않는다.
- `streaming.model_profiles.<logical-model>`로 `govail/thinker`처럼
  논리 모델별 첫 chunk 예산을 조정할 수 있다.
- 실제 적용값은 `x-govail-first-token-timeout-ms`와
  `x-govail-stream-idle-timeout-ms` 응답 헤더로 확인한다.

## OIDC / JWKS 컨테이너 네트워크 검증 (필수)

- Gateway를 컨테이너로 배포할 때 `jwks_url`에 `127.0.0.1` 또는 `localhost`를 사용하지 않는다. 컨테이너의 loopback은 Gateway 자신이며 호스트나 Keycloak 컨테이너를 가리키지 않는다.
- JWKS 주소는 동일 Docker 네트워크의 서비스 DNS를 우선하고, 네트워크가 분리된 배포에서는 환경에 정의된 컨테이너 접근 가능 호스트 주소를 사용한다. 사설 IP를 tracked 설정이나 스킬에 하드코딩하지 않는다.
- 배포 전 렌더링된 Compose 설정과 실제 Gateway 설정의 JWKS URL을 확인한다.
- 배포 후 반드시 **Gateway 컨테이너 네트워크 네임스페이스 안에서** JWKS endpoint를 호출해 HTTP 200과 JWKS JSON 응답을 확인한다. 호스트에서만 실행한 `curl`은 이 검증을 대체하지 못한다.
- `/console-api/v1/me` 또는 `/console-api/v1/keys`의 HTTP 200만으로 OIDC 검증 성공을 판정하지 않는다. Console API는 신뢰된 OAuth2-Proxy 사용자 헤더로 fallback할 수 있으므로, Playground의 `/v1/models`와 `/v1/chat/completions` 인증 경로를 별도로 검증한다.
- `invalid bearer token`이 발생하면 토큰 교체부터 시도하지 말고 다음 순서로 확인한다: OAuth2-Proxy 세션 상태 → 전달된 access-token 헤더 존재 → Gateway 컨테이너의 JWKS 연결 → issuer/audience/kid 검증 → Playground key owner/profile metadata.
- 토큰 원문은 로그나 진단 출력에 남기지 않는다. JWKS 조회 실패와 JWT claim 검증 실패는 원인을 구분해 기록하되 token 값은 기록하지 않는다.

## Credential-bound Execution Profile Architecture

API Credential의 서버측 DB Metadata가 요청 처리 경로(`execution_profile`)를 명시적으로 결정하며, 공통 Shared Governance Layer가 인프라 안전을 집행합니다.

```text
Credential
   ↓
Execution Profile
   ├─ agentic_coding ──> thin inference path (Direct Proxy)
   └─ governed_web ────> explicit Runtime / Grounding / Workflow

Shared Governance Layer (공통 자원/보안 경계)
├─ Auth/AuthZ
├─ DLP (Ingress & Egress Redaction; 구역별 audit|mask|block — `govail-dlp-policy` 참조)
├─ Rate & Budget Limit
├─ Audit & Tracing
├─ Model Policy
└─ Governed External Actions (Shared Governance Boundary)
        ├─ approval / payload hash / durable workflow / write audit
```

- **`govail/fast`**: 초경량·고속 워커 (Qwen 3.5 4B). 고속 텍스트 응답.
- **`govail/worker`**: 표준 워커. 일반/빠른 텍스트 및 코드 처리.
- **`govail/thinker`**: 심층 추론기. 고난도 아키텍처, 딥러닝 추론, 심층 사고.
- **API Key**: 인증·쿼터·감사만. `gv-code`/`gv-web`으로 실행 경로를 가르지 않는다.
- **Invariants**:
  - Client owns orchestration. GoVail owns governance and virtual-model resolution. Explicit models are strictly pinned.

## 공개 모델 해석

Gateway `model` 모듈 및 `gateway.toml`이 공개 모델 계약의 SSOT이다. 독립 Python Router나
자연어 `/decide` 호출은 배포 경로에 존재하지 않는다.

- `model_slot`: 사용하지 않음
- 공개 채팅 모델: `govail/worker` | `govail/thinker` (thinker-low/medium/high, worker-low/medium/high 등 세부 명칭은 thinker/worker로 통합 및 풀백 지원)
- 공개 유틸리티 모델: `govail/embedding` | `govail/reranker`. `govail/classify`는 내부 의도 분류 전용.
- 유틸리티 엔드포인트: `/v1/embeddings`, `/rerank`·`/v1/rerank`. 인증·DLP·감사 후 LiteLLM로 전달하며 Runtime workflow나 채팅 resolver를 거치지 않는다.

## Runtime SSE → OpenAI 어댑터 (필수)

OpenCode 등 표준 OpenAI SDK는 스트림 `data:`를 `{choices}|{error}` 유니온으로만 검증한다.
Runtime pipeline named SSE(`event: status` + `pipeline_started` 등)를 raw proxy하면 `invalid_union`으로 끊긴다.

- **MANDATORY**: GI/web_search `text/event-stream` 응답은 `runtime_sse_adapter::RuntimeSseToOpenAiStream`을 거친 뒤 `EgressFilterStream`에 넣는다.
- 모듈: `apps/gateway/gateway/src/runtime_sse_adapter.rs`, 진행 프레임 헬퍼: `sse_progress.rs`
- Runtime Console용 named SSE 스키마는 바꾸지 않는다. `/v1/chat/completions` 출구에서만 변환한다.
- `stream=false` JSON은 어댑터 생략.
- 문서: `apps/gateway/docs/gateway/2026-08-09-runtime-sse-openai-adapter.md`
- 배포: 루트 `docker compose build gateway && docker compose up -d gateway`

## IDE 에이전트 루프 보존 (OpenCode)

GoVail은 OpenCode/Cursor를 대체하지 않는다. 코딩 에이전트 요청이 GI 웹검색으로 가로채이면 `/g-plan` 등이 무관한 웹 출처만 반환한다.

- **MANDATORY**: Gateway는 `tools[]`와 agents session-lifecycle slash command를 semantic
  classifier에 보내지 않는다. OpenAI tool loop와 slash command 해석은 클라이언트가 소유한다.
- 외부 실행·승인·장기 작업은 클라이언트가 명시적 Runtime API를 호출해야 하며 일반 Chat을
  자연어만으로 Runtime으로 우회하지 않는다.
- 관련 구현은 `apps/gateway/gateway/src/handlers/`의 protocol/policy 경계와
  `apps/gateway/gateway/src/runtime.rs`의 명시적 relay를 확인한다.

## Runtime relay와 Console `/engine-api`

Gateway는 engine-process durable API를 해석하지 않는 thin relay만 제공한다.

| 경로 | 호출자·인증 | 계정 scope |
|---|---|---|
| `/v1/process/agent-runs*` | API key (`auth::authenticate`) | `project:{project}:actor:{actor}` |
| `/engine-api/v1/process/*` | Console OIDC 세션 (`oidc::verify_console_access`) | 검증된 OIDC `sub` |

- 두 경로 모두 호출자의 `Authorization`·`X-Process-Account`를 engine-process로 넘기지 않고
  `GOVAIL_RUNTIME_API_KEY` service credential과 인증 결과에서 만든 scope만 보낸다.
  `GOVAIL_RUNTIME_URL`이 없으면 LLM으로 fallback하지 않고 `workflow_runtime_unavailable`(503).
- `/engine-api`는 `ENGINE_API_SEGMENTS` allowlist(`agent-runs`, `sessions`, `memory`, `feedback`,
  `usage`, `tool-groups`, `config`)만 전달한다. dot segment(`%2e` 포함)·인코딩된 구분자·역슬래시는
  거부한다. allowlist를 넓히면 `BOUNDARIES.md`와 핸들러 테스트를 함께 바꾼다.
- JSON 본문은 같은 ingress DLP를 거친다. 변경 요청만 감사하고 폴링 읽기(GET/HEAD)는 감사하지 않는다.
- Console SPA는 Gateway 이미지(`apps/gateway/Dockerfile.cloud`의 `console-builder`)에 포함되어 Gateway가
  서빙한다. edge는 `console.govail.cloud`를 Gateway로 보내며 별도 Console 컨테이너는 없다.
- 검증: 미인증 `/engine-api/...` 401, allowlist 밖 경로 404, 브라우저 Playground 실행. OIDC 세션이 필요한
  경로는 API key 테스트 키로 대체하지 않는다(`govail-admin-testing` 범위 밖).

## 가상 모델 해석

Gateway의 `auto`와 `code-worker`는 현재 보수적으로 `govail/worker`에 매핑되는
가상 모델이다. 난이도 기반 adaptive CodeRouter는 production 경로에서 제거되었고,
provider 선택과 실제 모델 매핑은 LiteLLM이 담당한다.

응답 헤더: `x-govail-requested-model`, `x-govail-resolved-model`, `x-govail-model-mode`, `x-govail-difficulty`

## V1 추론 파이프라인 개발 원칙

- Gateway는 `Auth/DLP → Model Policy → LiteLLM → Egress/Audit`의 서빙 경계를 소유한다.
  Classifier/Planner/Agent loop 파이프라인은 Gateway에 추가하지 않는다.
- System 프롬프트는 정적 파일(`configs/prompts/executor.md`)만 `system` role에 상주
- Runtime이 제공한 advisory/context가 있더라도 Gateway는 이를 권위 지시로 승격하지 않는다.
- Evaluator는 Zero-Queue Semaphore(N=2)로 한정하여 백그라운드 수행, 용량 초과 시 0ms Drop
- Factual Quality 4대 축(`unnecessary_abstention`, `unsupported_factual_claim`, `stale_fact_used`, `authoritative_source_bypassed`) 메트릭 수집 및 `tests/golden/` 내 Golden Regression Dataset 유지관리

## Zero-Trust Gateway Boundary & Architecture Drift 차단 원칙

- **NEVER**: Gateway 내부에 `agent_loop`, `EvaluatingSufficiency`, `QueryRewrite`, `EvidenceClaim Extraction`, `Factuality Repair`와 같은 Agentic Reasoning 상태 머신이나 특정 인명/지자체 특화 텍스트 하드코딩을 임의 작성하지 않는다.
- **MANDATORY**: Agentic Reasoning, Grounding Validation, Claim Extraction 등 추론 및 근거 평가 상태 머신은 오직 **`govail-runtime` (LangGraph)**이 완전 소유한다.
- Gateway 본연의 역할: OpenAI Protocol Adaptation, Policy/Auth/DLP Enforcement, Transport Security, Metrics, Upstream Proxying, Langfuse Telemetry Read/Write Proxy.

## Langfuse Observability & Gateway Telemetry

- **Observability 데이터 엔진 SSOT**: `Langfuse` (`http://localhost:3300`)
- **보안 감사 SSOT**: `logs/audit.jsonl` (원형 보존)
- **비파괴적 Session 추출**:
  - `extract_session_id`로 클라이언트 헤더(`x-opencode-session`, `x-session-id`, `x-conversation-id`, `session-id`, `conversation-id`) 및 JSON payload `metadata.session_id` 파싱.
- **Trace 전파**:
  - Upstream LiteLLM 및 Langfuse에 `X-GoVail-Trace-Id`, `x-litellm-trace-id`, `x-langfuse-trace-id` 동일 trace ID 전파.
- **Typed Read/Write Proxy Endpoints**:
  - `GET /console-api/v1/observability/metrics`: KPI 메트릭 (전체 요청 수, Worker/Expert/Cloud %, Failback %, Latency p50/p95, 비용).
  - `GET /console-api/v1/observability/traces`: `session_id`, `tier`, `search` 필터 기반 트레이스 목록 조회.
  - `GET /console-api/v1/observability/traces/:id`: 상세 관측, 물리 모델 텔레메트리, 프롬프트/응답, 피드백 점수 조회.
  - `GET /console-api/v1/observability/sessions`: OpenCode 대화 세션 목록 및 요청 수 집계.
  - `POST /console-api/v1/observability/scores`: 운영자 즉시 평가 (`user_quality_score`, `routing_correctness`) 기록.

## 파일 I/O 및 대용량 감사 로그 메모리 가드레일

- `logs/audit.jsonl` 등의 로그 파일을 읽을 때 `read_to_string`으로 전체 파일을 로드하지 않는다. 파일이 수백 MB로 커지면 컨테이너 메모리 제한(1.5GB)에 걸려 OOM Killer로 502 에러가 발생한다.
- 항상 `read_recent_audit_lines`(파일 끝 10MB 버퍼링 역방향 스트리밍) 등 고정 버퍼 스트리밍 방식을 사용한다.
- 주기적인 로그 로테이션(예: `audit.jsonl.bak`)을 유지한다.

## Console API Key 보관 및 UI 동기화 가이드

- 콘솔에서 발급되는 키는 `full_key`를 DB(SurrealDB `api_key` 테이블)에 함께 INSERT하고 응답 DTO에 `full_key`를 포함한다.
- 프론트엔드(`KeysPage.tsx`)는 `k.fullKey`가 존재할 때만 보기(Show) 및 복사(Copy) 버튼을 제공하므로, 백엔드에서 `full_key: None`으로 마스킹하거나 DB INSERT에서 누락하지 않도록 주의한다.

## 내부 전용 데모 키 운영

- 데모 키는 정적 TOML·환경변수에 두지 않고 SurrealDB `api_key` 레코드로 **정확히 1개**만 관리한다.
- 레코드에는 전용 `project`, 최소 `allowed_models`, 낮은 `rpm`, 만료 시각, `allowed_ips`를 함께 기록한다. `allowed_ips`는 현재 Gateway가 관측한 **정확한 원본 IP** 목록이며 CIDR·클라이언트 전달 헤더를 허용하지 않는다.
- Gateway는 소켓 연결에서 관측한 IP로만 제한을 판정한다. `X-Forwarded-For` 등 클라이언트 제공 헤더를 근거로 발급·검증하지 않는다.
- 발급 시 키 원문은 콘솔의 일회성 표시 또는 승인된 비추적 비밀 저장소에서만 전달한다. 코드·문서·로그·커밋에 기록하지 않는다.
- 검증은 허용 원본 IP의 `/v1/models` 또는 최소 추론 요청 `200`과 다른 원본 IP의 `401`을 모두 확인한다. 사용하지 않는 데모 키는 DB에서 revoke 또는 delete한다.

## Agentic Coding 세션 모델 파라미터 변조 금지

- `execution_profile == "agentic_coding"` 세션에서는 `frequency_penalty`나 `presence_penalty`를 주입하지 않는다 (`0.0` 유지).
- 코드 생성 시 단어 반복 억제 페널티가 들어가면 동일 식별자/변수명/타입 재사용을 회피하면서 모델이 존재하지 않는 가짜 변수명을 지어내는 환각(Hallucination)이 발생한다.
