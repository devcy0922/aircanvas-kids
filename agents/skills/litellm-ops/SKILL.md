---
name: litellm-ops
description: >-
  Use when operating the central LiteLLM proxy, GoVail model slots, provider connections,
  fallback policy, Langfuse telemetry, or Prometheus metrics in ai-service-infra.
---

# LiteLLM 중앙 프록시 운영 스킬 (litellm-ops)

> **소유 저장소**: `ai-service-infra` (`/srv/platform/ai-service-infra`)  
> **컨테이너**: `govail-litellm` (애플리케이션 노드, `network_mode: host`, port **14000**)  
> **설정 SSOT**: `litellm/config.yaml`

---

## 1. 아키텍처 및 역할

LiteLLM은 GoVail 플랫폼의 **LLM 요청 통합 프록시**다.

```
GoVail Gateway (:8080)
    └─▶ LiteLLM Proxy (:14000)
            ├─▶ vLLM Provider       — govail/thinker (심층 추론 모델)
            ├─▶ llama.cpp Provider  — govail/worker (표준 워커 모델)
            ├─▶ Embedding Provider  — govail/embedding
            ├─▶ Reranker Provider   — govail/reranker
            └─▶ Classifier Provider — govail/classify
```

---

## 2. 공개 논리 슬롯 및 provider 포트 (SSOT)

| 슬롯 | provider 노드/host port | 역할 및 주의 |
|---|---|---|
| `govail/batch` | llm-server `:18015` (컨테이너 `:8001`) | 안정 batch 슬롯 |
| `govail/thinker` / thinker 프로필 | DGX Spark `:18025` (컨테이너 `:8001`) | 추론 슬롯, low 기본 및 프로필별 제어 |
| `govail/fast` | DGX Spark `:18026` (컨테이너 `:8002`) | Spark-X2.5-4B, fast sub-agent 슬롯 |
| `govail/worker` 및 worker 프로필 | M1 Max `:18035` | LiteLLM primary. M1 connection failure 시 worker는 thinker fallback으로 처리한다. fallback 성공은 M1 readiness가 아니다. |
| `govail/classify` | llm-server `:18015` | 별도 classifier가 없으면 batch chat alias로 운영 |

포트 block은 llm-server `18010–18019`, DGX Spark `18020–18029`, M1 Max `18030–18039`다. 각 block에서 마지막 자리 `0–4`는 실험용, `5–9`는 모델·런타임 점유가 확인된 stable용이다. 안정 route는 readiness가 통과한 endpoint를 사용한다. 사용자가 M1 primary 구성을 요청했고 M1이 미응답이면 tested fallback과 함께 `:18035`를 primary로 설정할 수 있으며, 실제 M1 readiness와 fallback readiness를 별도로 기록한다. active provider 설정은 `ai-service-infra/litellm/config.yaml`이 소유하고, 런타임 포트/readiness는 `ai-gateway-infra`가 소유한다.

worker 기본 별칭은 동시 4건(`max_parallel_requests: 4`)을 받으며 장애·동시성 초과 시 설정된 fallback을 따른다. `govail/fast`는 최대 두 번 fallback할 수 있고, worker 프로필은 같은 추론 수준의 thinker 프로필로 전환한다. classify, embedding, reranker는 cross-capability fallback 없이 원인 보존형 오류를 반환한다.

---

## 3. 설정 파일 구조

```
litellm/
├── config.yaml       # 모델 슬롯, provider URL, fallback, 비용 추적 SSOT
├── db-init.sql       # LiteLLM DB 초기화 스크립트
└── fast_failover.py  # fast 슬롯 failover 보조 스크립트
```

### config.yaml 주요 규칙

- **모델 URL**: `govail/batch` `http://llm-server:18015/v1`, `govail/thinker` `http://dgx-spark:18025/v1`, `govail/fast` `http://dgx-spark:18026/v1`을 사용한다. `govail/worker` primary는 `http://m1-max:18035/v1`이며 connection failure 시 thinker fallback을 사용한다.
- **`Invalid model name passed in model=...` 오류**: 요청의 `model` 값이 `model_list[].model_name`과 정확히 일치하는지 확인하고, 설정을 reload/restart한 뒤 LiteLLM 인증 `/v1/models`에서 같은 alias가 보이는지 확인한다. 클라이언트의 `models[].id`는 서버 alias를 등록하지 않는다. GoVail을 통하는 경우 GoVail public catalog는 API key별 `allowed_models` 권한을 보장하지 않으므로, LiteLLM alias 확인과 실제 호출 키의 GoVail authorization 확인을 분리한다.
- **SSH loopback 터널 경로 금지**: `18001`, `28080` 등 테스트 경로를 운영 구성으로 복원하지 않는다.
- **시크릿**: `LITELLM_MASTER_KEY`, `LITELLM_DATABASE_URL`은 `.env` 파일로 주입, 파일에 직접 기재 금지.
- **Langfuse 연동**: `success_callback: ["langfuse"]` + `LANGFUSE_*` 환경변수로 활성화.

---

## 4. 배포 및 운영 명령

```bash
# 컨테이너 재시작
docker compose restart litellm

# 로그 확인
docker compose logs -f litellm

# 모델 목록 확인 (인증 필요)
curl -s http://localhost:14000/v1/models \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" | jq '.data[].id'

# 짧은 completion 검증
curl -s http://localhost:14000/v1/chat/completions \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"govail/worker","messages":[{"role":"user","content":"hi"}],"max_tokens":5}' | jq .

# 설정 다시 로드 (컨테이너 재기동 없이)
curl -s -X POST http://localhost:14000/reload \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

---

## 5. provider 변경 후 검증 체크리스트

1. **Upstream provider** → `/v1/models` 응답 확인
2. **LiteLLM 프록시** → 슬롯별 짧은 completion 확인
3. **GoVail Gateway** → `POST /v1/chat/completions` 인증된 요청 확인
4. **LiteLLM 로그** → `Connection error`, `Server disconnected`, `Invalid model name`, traceback 없음 확인

> [!WARNING]
> `/v1/models`, `/health`, 포트 LISTEN만으로 readiness를 판정하지 않는다.
> 반드시 인증된 짧은 completion을 실행하고, 가능하면 streaming completion까지 확인한다.

---

## 6. Prometheus 메트릭

LiteLLM은 `:14000/metrics` 에서 Prometheus 포맷으로 메트릭을 노출한다.

```yaml
# prometheus/prometheus.yml (스크레이프 타겟)
- job_name: litellm
  static_configs:
    - targets: ['localhost:14000']
  metrics_path: /metrics
  bearer_token: "<LITELLM_MASTER_KEY>"
```

Grafana 대시보드 SSOT: `grafana/provisioning/dashboards/json/litellm-model-status.json`

---

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `Connection error` to provider | Upstream provider 다운 | provider 컨테이너 상태 및 헬스 확인 |
| `Invalid model name` | config.yaml 슬롯명 불일치 | `litellm/config.yaml` 모델명 확인 |
| OOM / 502 응답 | audit.jsonl 등 대용량 로그 메모리 적재 | 로그 로테이션 적용 |
| Langfuse trace 미수집 | `LANGFUSE_*` 환경변수 누락 | `.env` 확인 후 `docker compose restart litellm` |
