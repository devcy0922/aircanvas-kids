---
name: ai-infra-ops
version: 1.3.4
description: GPU 서버(dgx-spark), 인프라 서버(cy-server), 모델 노드(M1 Max) 환경을 제어하고 Docker Compose, vLLM, llama.cpp, GPU 자원 관리 및 멀티 노드 릴리스 배포를 수행하는 공통 운영 스킬
---

# AI 인프라 통합 운영 스킬 (ai-infra-ops)

본 스킬은 M1 Max 모델 노드, cy-server 인프라 노드, dgx-spark GPU 연산 노드로 구성된 온프레미스 인프라 환경에서 에이전트가 통일된 가이드라인과 절차를 준수하여 인프라를 운영, 배포 및 모니터링할 수 있도록 돕는 지침서입니다. 
이 지침은 `ai-gateway-infra`, `govail`, `ai-service-infra` 등 동일 계열의 모든 인프라 관리 저장소에 공통으로 적용됩니다.

---

## 1. 물리 인프라 토폴로지 및 역할 (SSOT)

에이전트는 원격 제어 또는 코드 배포 요청을 수행할 때, 다음의 호스트 정보를 기준으로 동작해야 합니다.

| 호스트명 | IP 주소 | 주요 OS / 환경 | 역할 및 기동 서비스 | 스토리지 정책 |
| :--- | :--- | :--- | :--- | :--- |
| **cy-server** | `192.168.0.10` | Linux (Ubuntu 24.04) | 중앙 Control Plane, LiteLLM, 관측성 백엔드 (Grafana, Loki, Prometheus) | **중앙 스토리지 독점 관리** (`/storage/kodak`, `/storage/nas`) |
| **dgx-spark** | `192.168.0.22` | Linux (Ubuntu CUDA 환경) | `govail/thinker` (:18025, vLLM Qwen3.8-27B), `govail/fast` (:18026, SGLang Spark-X2.5-4B), FLUX2 이미지 생성 | 로컬 NVMe 전용 (`/storage` 마운트·CIFS automount 없음) |
| **llm-server** | `192.168.0.21` | Linux (Ubuntu 26.04 AMD Strix Halo) | `govail/batch` (:18015, 컨테이너 :8001, Qwen3.6-35B-A3B Q4_K_M GGUF, Vulkan Radeon 8060S, seq 8, 128K context) — 상시 배치 및 DGX thinker 백업 | 로컬 NVMe 전용 (`/storage` 마운트 없음) |
| **M1 Max** | `192.168.0.8` | macOS (Apple Silicon M1 Max 64GB) | LiteLLM `govail/worker` primary (:18035); M1 연결 실패 시 thinker fallback. 직접 M1 readiness는 별도 확인 | 로컬 APFS 전용 (`/storage` 마운트 없음) |
| **Mac mini** | `192.168.0.5` | macOS (Apple Silicon M4) | `jina-embeddings-v5-text-small` :18081, `jina-reranker-v3` :18082, `Qwen3-0.6B` :18083 | 로컬 APFS 전용 (`auto_smb`/`/storage` 마운트 없음) |

### 1.1 노드별 provider 포트 블록

| 노드 | 독점 host port 범위 | stable (`5–9`) | 실험 (`0–4`) |
|---|---:|---|---|
| llm-server | `18010–18019` | `18015` batch | `18010–18014` |
| DGX Spark | `18020–18029` | `18025` thinker, `18026` fast | `18020–18024` |
| M1 Max | `18030–18039` | `18035` worker | `18030` vLLM-Metal, `18031/18032` pair, `18033` Qwen candidate, `18034` oMLX |

각 노드는 자기 10-port block 안에서만 새 provider의 host port를 할당한다. 마지막 자리가 `0–4`면 실험용, `5–9`면 해당 모델과 런타임 점유가 확정된 stable용이다. 컨테이너 내부 포트는 host port와 다를 수 있다. 포트 LISTEN, `/health`, `/v1/models`만으로 stable 처리하지 말고 기대 model ID를 지정한 짧은 completion을 확인한다. 사용자가 M1 primary route를 요청했는데 M1이 미연결이면 `:18035`를 primary로 설정할 수 있지만, connection failure fallback을 실요청으로 검증하고 M1 직접 readiness는 미완료로 남긴다.

### 1.2 스토리지 분리 및 I/O 블로킹 방지 원칙
- **단일 관리**: KODAK SSD(`/storage/kodak`) 및 NAS SMB(`/storage/nas`)는 오직 **cy-server**에서만 마운트·소유합니다.
- **부노드 CIFS/SMB 금지**: DGX Spark 및 Mac mini 등 연산 노드에는 autofs(`auto_smb`)나 CIFS automount를 구성하지 않습니다. (파일 검색, 명령어 실행 시 발생하는 심각한 I/O 타임아웃 및 Hang 방지)
- **통신 원칙**: 노드 간 데이터 및 모델 공유는 로컬 캐시/가중치 디렉토리(`~/models`, `~/.cache/huggingface`) 또는 HTTP/gRPC/OCI API를 통해 수행합니다.

---

## 2. Docker Compose 기반 IaC 운영 규격

모든 인프라 컨테이너 및 오케스트레이션 서비스는 `docker-compose.yml`을 통해 선언적으로 관리합니다.

* **동작 검증 규칙:** 설정이나 컴포넌트를 변경한 후에는 반드시 로컬 및 원격의 Docker Compose 상태를 검증합니다.
* **주요 서비스 기동 및 관리 커맨드:**
  * 서비스 상태 확인: `docker compose ps`
  * 서비스 백그라운드 구동: `docker compose up -d`
  * 특정 서비스 재시작: `docker compose restart <service_name>`
  * 로그 실시간 추적: `docker compose logs -f --tail=100 <service_name>`
* **가드레일:** 컨테이너 내부 설정을 직접 수정하기보다는 반드시 호스트 환경변수(`.env` 또는 `.env.dgx-spark`) 및 `docker-compose.yml` 볼륨 마운트 구조를 활용하여 선언적 구성을 유지합니다.

---

## 3. GPU 모니터링 및 런타임 상태 관리

`dgx-spark`는 128GB UMA 등 대용량 메모리를 기반으로 추론 인스턴스를 구동하므로, VRAM의 분배 및 OOM 방지가 핵심입니다.

### 3.1 GPU 자원 실시간 체크
에이전트는 모델 배포나 스케일 아웃을 시도하기 전, GPU 메모리를 계측합니다.
```bash
# Makefile 활용 (권장)
make vram

# 직접 계측
ssh user@192.168.0.22 "nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits"
```

### 3.2 모델 런타임 라이프사이클 제어 (Makefile 기반)
운영자는 루트 `Makefile` 또는 `ops/control/runtimectl.sh`를 통해 모델 라이프사이클을 일관되게 제어합니다.
* **전체 상태 조회:** `make status` (또는 `make health`로 HTTP readiness 직접 검증)
* **노드별 상태 조회:** `make status-dgx` (govail/thinker), `make status-m1` (govail/worker), `make status-batch` (govail/batch)
* **전체 시동/중지:** `make start`, `make stop`, `make restart`
* **노드별 시동/중지:**
  * DGX Spark (`govail/thinker`): `make start-dgx`, `make stop-dgx`, `make restart-dgx`, `make logs-dgx`
  * M1 Max (`govail/worker`): `make start-m1`, `make stop-m1`, `make restart-m1`, `make logs-m1`
  * llm-server (`govail/batch`): `make start-batch`, `make stop-batch`, `make restart-batch`, `make logs-batch`
* **GPU/VRAM 계측:** `make vram` (DGX Spark), `make vram-llm` (llm-server Radeon 8060S)
* **VRAM 임시 확보 (LoRA 학습 등):** `make lora-mode` (DGX 모델 중지 및 VRAM 반환)
* **런타임 감시 및 자동 복구:** `make watchdog`

### 3.3 VRAM 및 메모리 안전 가이드라인
* **DGX Spark (`govail/thinker`):** `.env.dgx-spark`의 VRAM 예산(`VLLM_MODEL_GPU_UTIL` 또는 llama.cpp layers)을 준수
* **M1 Max (`govail/worker`):** `ops/runtime/m1-qwen36-35b-server.sh`의 모델 상주, 슬롯 및 context 사양 준수
* **안전 마진:** 항상 최소 20GB 이상의 여유 물리 메모리를 확보하여 예상치 못한 Context Window 팽창 시의 OOM을 예방합니다.

### 3.4 M1 resident llama.cpp worker 프로파일
M1 worker는 Unsloth Qwen3.6-35B-A3B UD-Q4_K_M GGUF (22.1GB)를 llama.cpp Metal 실행기로 서버 시작 시 메모리에 상주시키며, 시스템 LaunchDaemon(`com.govail.llama-qwen36`, 로그인 불필요)이 프로세스 수명주기를 관리한다. `make start-m1`, `make stop-m1`, `make restart-m1`, `make status-m1`, `make install-m1-launchd`로 관리한다.

| 항목 | 값 |
|---|---:|
| 동시 sequence | 4 |
| sequence별 context budget | 32,768 tokens (32K/slot) |
| 전체 llama.cpp context pool | 131,072 tokens (`--ctx-size 131072 --parallel 4`) |
| llama.cpp KV cache | K/V `f16` (`--cache-type-k f16 --cache-type-v f16`) |
| prompt cache | `--cache-prompt` (LCP prefix reuse) |
| 플래그 | `--cont-batching`, `--flash-attn on`, `--jinja`, `-fit off` |
| 최대 출력 | 4096 tokens |
| HTTP/API alias | `govail/worker` (:18035 primary; M1 직접 readiness 별도 readback) |
| 관리 데몬 | `/Library/LaunchDaemons/com.govail.llama-qwen36.plist` |

`/v1/models`와 `/health`만으로 readiness를 판정하지 말고 실제 completion을 보낸다. 2026-10-02 실측 기준 4seq 동시 부하 상황에서 TTFT 2.07s (프리필 138.7 tok/s), 개별 디코드 21.04 tok/s (합산 77.55 tok/s), RSS 23.8GB (64GB 중 여유 40GB+), Swap 증분 0MB로 검증되었다.

### 3.5 M1 소형 fast 모델 프로파일
M1의 Qwen3.5-4B fast 프로파일은 다음 계약을 사용한다. 슬롯당 context는 입력과 출력을 합친 값이며,
출력 4096을 예약하면 일반적인 입력 예산은 약 12288 토큰이다.

| 항목 | 값 |
|---|---:|
| 동시 슬롯 | 8 |
| 슬롯당 context | 16384 |
| llama.cpp 전체 `--ctx-size` | 131072 |
| 최대 출력 | 4096 |
| KV cache | K/V `q8_0` |
| thinking | 비활성화 |

이 프로파일을 변경할 때는 `--parallel N`과 `--ctx-size N*16384`의 일관성을 확인하고,
`/props`의 slot 수, `/slots`의 슬롯별 `n_ctx`, 실제 8개 동시 짧은 completion을 모두 검증한다.
KV cache 메모리는 정적 계산만으로 판정하지 말고 동시 요청 직후 프로세스의 실제 footprint와 swap을 측정한다.
4B 양자화 모델은 이론적인 full-precision 추정치보다 작게 증가할 수 있으나, 측정 전에는 여유 자원으로 간주하지 않는다.

### 3.6 llm-server resident llama.cpp batch worker 프로파일
`llm-server`(`192.168.0.21`, AMD Ryzen AI MAX+ 395 128GB UMA / Radeon 8060S 40CU)는 `unsloth/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf`를 Vulkan 하드웨어 가속으로 상주 서빙하며, 대용량 비동기 배치 작업 및 DGX Spark 점검 시 자동 fallback thinker 역할을 수행한다. `/opt/govail-runtime/docker-compose.yml`로 관리한다.

| 항목 | 값 |
|---|---:|
| 동시 슬롯 | 8 |
| 슬롯당 context | 16,384 tokens (16K/slot) |
| 전체 llama.cpp context pool | 131,072 tokens (`-c 131072 -np 8`) |
| 가속 백엔드 | Vulkan (`Radeon 8060S Graphics (RADV STRIX_HALO)`) 99 layers offload |
| 플래그 | `--cont-batching`, `-fa on`, `--cache-prompt`, `-b 2048 -ub 512` |
| HTTP/API alias | `govail/batch`, `govail/thinker-backup` (host :18015 → runtime :8001) |

- **LiteLLM 및 GoVail Gateway 연동 구조**:
  - `ai-service-infra` LiteLLM 프록시에 `govail/batch` 모델 슬롯 등록 (`max_parallel_requests: 8`, context: 131,072)
  - `govail/thinker*` 오류·점검 시 `["govail/batch"]`로 자동 fallback 전환
  - GoVail Gateway(`apps/gateway`) 및 내장 웹 콘솔(`apps/console`)에 `govail/batch` ("Batch", 상시 배치·대용량 병렬 작업) 공식 공개 슬롯 등록 및 실시간 서빙

---

## 4. Mac mini 소형 모델 교체 및 readiness

Mac mini는 cy-server의 단일 Git 작업 사본에서 승인한 릴리스만 배포한다. 모델 가중치는
`/Users/yooncy/models`에 별도로 준비하며 릴리스 번들에 넣지 않는다.

```bash
# 가중치 준비
make prepare-macmini

# Mac mini 릴리스 배포 및 재기동
make deploy-macmini
make restart-macmini
```

현재 조합과 계약은 다음과 같다.

| 포트 | 모델 | 기능 검증 |
|---:|---|---|
| `18081` | `jina-embeddings-v5-text-small` Q8 | `/v1/embeddings`, 1024차원 벡터 |
| `18082` | `jina-reranker-v3` Q8 + `projector.safetensors` | `/v1/rerank`, 점수·순위 구분 |
| `18083` | `Qwen3-0.6B` Q8 | `/v1/chat/completions`, 구조화 출력 |

교체 전에는 기존 운영 포트를 중단하지 않은 상태에서 임시 포트로 세 모델을 로드하고
실제 기능 요청을 실행한다. 모델 목록이나 포트 LISTEN만으로 통과시키지 않는다.
Jina reranker가 현재 `llama-server` 바이너리에서 정상 점수를 반환하지 않으면 운영 포트로
전환하지 않고 기존 reranker를 유지한다. 중앙 LiteLLM/Gateway 인증이 없는 세션은
provider readiness만 기록하며 전체 변경 완료로 판정하지 않는다.

## 5. 멀티 노드 코드 동기화 및 릴리즈 프로세스

> [!IMPORTANT]
> **단일 Git 작업 사본 원칙**: `ai-gateway-infra` Git 작업 사본은 **cy-server(`/srv/ai-gateway-infra`)에만 존재**한다.
> DGX Spark와 M1 Max에는 Git 레포를 두지 않으며, 승인된 릴리스 번들만 배포된다.
> DGX/M1/Mac mini에 기존 Git checkout이 잔존한다면 삭제해야 한다 (5.4 참고).

### 5.1 배포 전 검증 (Pre-deployment Validation)
원격 노드로의 배포 전에 cy-server 단일 작업 사본에서 검증 작업을 우선 수행합니다:
1. `docker compose config`를 실행하여 문법적 오류 체크.
2. `./scripts/validate` 또는 `./scripts/generate` 등 프로젝트 고유 검증 스크립트 실행.

### 5.2 표준 릴리스 번들 배포 절차 (현행)

cy-server에서 승인된 commit을 불변 번들로 생성 후 대상 런타임 노드에 설치합니다.

```bash
# 전체 노드 릴리스 배포 및 에이전트 지침 동기화 (권장)
make deploy

# 특정 노드만 릴리스 배포
make deploy-dgx    # DGX Spark에만 배포
make deploy-m1     # M1 Max에만 배포

# 에이전트 지침 동기화
make deploy-agents
```

릴리스 번들은 `/opt/govail-runtime/releases/<release-id>/`에 설치되며,
검증 완료 후 `current` 심링크를 전환하고 서비스를 자동 재기동합니다.

### 5.3 롤백 및 복구
배포 후 원격 서비스 오류 발생 시, 이전 안정 릴리스로 즉시 롤백합니다.

```bash
# 이전 안정 릴리스로 원클릭 롤백
make rollback
```

> [!WARNING]
> ❌ **레거시 금지**: DGX/M1에 `rsync --delete`로 `/srv/projects/ai-gateway-infra/`를 직접 동기화하거나, 원격 노드에서 `git pull`을 실행하지 않는다. 이는 단일 Git 사본 원칙 위반이다.

### 5.4 DGX/M1/Mac mini 잔존 Git 레포 삭제 절차

DGX 또는 M1에 기존 Git checkout(`/srv/ai-gateway-infra`, `/srv/projects/ai-gateway-infra` 등)이 잔존하는 경우 아래 순서로 제거합니다.

```bash
# 1. 현재 런타임이 해당 경로를 직접 참조하는지 확인
ssh kin123s@192.168.0.22 "grep -r '/srv/ai-gateway-infra\|/srv/projects/ai-gateway-infra' \
  /opt/govail-runtime/releases/current/ 2>/dev/null | head -20"

# 2. serve-models.sh, promtail 등 실행 중인 프로세스 경로 확인
ssh kin123s@192.168.0.22 "lsof +D /srv/ai-gateway-infra 2>/dev/null || echo 'no open files'"

# 3. 서비스 정상 동작 확인 (completion 테스트 통과 후 삭제)
curl -s http://192.168.0.22:18025/v1/models | jq '.data[].id'

# 4. Git 레포 삭제 (위 확인 후 진행)
ssh kin123s@192.168.0.22 "rm -rf /srv/ai-gateway-infra"
# M1의 경우
ssh studio-server@192.168.0.8 "rm -rf /srv/ai-gateway-infra"

# 5. 삭제 후 서비스 재확인
ssh kin123s@192.168.0.22 "curl -s http://localhost:18025/health && echo OK"
```

> [!CAUTION]
> 삭제 전 반드시 completion 테스트(`POST /v1/chat/completions`)가 정상임을 확인한 뒤 진행한다.
> 서비스 이상 발생 시 즉시 중단하고 macmini에서 원인을 분석한다.

---

## 6. 중앙화 로그 분석 및 트러블슈팅

분산 컨테이너 및 vLLM 로그는 로컬에 분산되어 쌓이므로, 수집 스크립트 및 통합 모니터링을 적극 활용합니다.

1. **vLLM 로그 통합 수집:**
   원격 노드의 vLLM 컨테이너 로그를 통합해 로컬 파일로 저장하려면 루트 경로의 `collect-vllm-logs.sh`를 실행합니다:
   ```bash
   ./collect-vllm-logs.sh
   ```
2. **Promtail & Grafana Loki 연계:**
   `promtail` 컨테이너가 정상적으로 각 노드의 `/var/log` 데이터를 긁어가고 있는지 주기적으로 `docker compose logs promtail`로 파이프라인 정합성을 모니터링합니다.


## 7. 중앙 LiteLLM 경계와 provider 연결

- LiteLLM의 Compose, 모델 슬롯, fallback, 시크릿, DB 연결은 cy-server의 ai-service-infra가 단일 소유한다.
- 외부 LLM 요청의 공식 경로는 GoVail Gateway를 거쳐 cy-server LiteLLM으로 들어간다. ai-gateway-infra는 LiteLLM 설정을 복제하거나 직접 호출 경로를 만들지 않는다.
- LiteLLM의 active primary mapping은 llm-server batch `:18015`, DGX thinker `:18025`, DGX fast `:18026`, M1 worker `:18035`다. M1이 응답하지 않으면 worker failure를 thinker fallback으로 처리하며, fallback 통과를 M1 readiness로 기록하지 않는다. M1 직접 readiness는 기대 model ID와 짧은 completion으로 별도 확인한다. SSH loopback tunnel과 18001/28080 테스트 경로를 운영 구성으로 복원하지 않는다.
- provider 변경 후에는 DGX/M1 provider, cy-server LiteLLM, GoVail Gateway 순서로 모델 목록과 짧은 completion을 검증한다.
- fast 모델은 LiteLLM과 Gateway 양쪽에 `max_tokens=4096`, context `16384`, thinking off를 동일하게 선언한다.
- Gateway의 context-boundary 계산은 입력 토큰을 먼저 차감하고 남은 범위로 `max_tokens`를 clamp해야 한다. 구조화 응답 파싱 실패 재시도도 모델 capability의 출력 상한을 올려 우회해서는 안 되며,
  출력 스트리밍은 정상 chunk와 `[DONE]`까지 확인한다.
- `/v1/models`, `/health`, 포트 LISTEN만으로 readiness를 판정하지 않는다. 각 경계에서 인증된 짧은 completion을 실행하고,
  가능하면 인증된 streaming completion까지 확인한다. 중앙 Gateway/LiteLLM credential이 없는 세션은 provider readiness까지만 기록하며,
  인증을 우회하거나 임의의 키를 생성하지 않는다.
- 변경 완료 후 LiteLLM 로그에서 `Connection error`, `Server disconnected`, `Invalid model name` 및 예외 traceback이 없는지 확인한다.

---

## 8. HF 캐시·모델 가중치 경로 표준

DGX/M1 양쪽에서 `HF_HOME`이 호스트마다, 심지어 모델 폴더마다 제각각 생기는 문제가 반복 확인됐다 (2026-09-18 감사).

* **표준**: `HF_HOME`은 항상 호스트 유저 홈의 `~/.cache/huggingface` 하나로 통일한다. DGX는 `/home/kin123s/.cache/huggingface`, M1은 `/Users/studio/.cache/huggingface`.
* **`models/` 디렉토리는 HF 캐시가 아니다.** GGUF, MLX 변환본, ComfyUI 체크포인트처럼 HF Hub 캐시 포맷을 쓰지 않는 가중치 전용이다. `models/<name>/.cache/huggingface` 같은 모델별 개별 캐시를 새로 만들지 않는다 — HF 다운로드가 필요하면 `HF_HOME`을 표준 경로로 지정해서 공용 캐시를 쓰게 한다.
* **컨테이너에서 다운로드할 때는 host 유저 UID로 실행**하거나 다운로드 후 `chown`한다. root로 받은 파일이 host 캐시에 섞이면 이후 비-root 프로세스가 못 읽는 사고가 난다.
* **HF_TOKEN의 SSOT는 `~/.config/govail/huggingface.env`** (DGX 기준, mode 600)이다. `.env.dgx-spark`나 다른 설정 파일에 토큰 값을 직접 적지 않고, `--env-file`로 이 파일만 참조한다. 새 노드에 토큰이 필요하면 이 파일과 같은 패턴(홈 디렉토리 `.config/govail/`, mode 600, git 추적 제외)을 따른다.
* **정리 전 반드시 확인**: 어떤 캐시/모델 디렉토리든 삭제·이동 전에 `/opt/govail-runtime/current/`와 실행 중인 컨테이너 인자(`docker top`, `docker inspect`)에서 그 경로를 실제로 참조하는지 grep한다. 참조 없는 고아 디렉토리만 즉시 삭제 대상이다.

### 2026-09-18 감사 스냅샷 (참고용, 정리 완료 후 갱신 필요)

| 호스트 | 경로 | 용량 | 상태 |
|---|---|---:|---|
| DGX | `~/.cache/huggingface` | 266G | 표준 경로, 실사용 중 (root 소유 파일 혼재) |
| DGX | `~/.cache/huggingface-dgx` | 22M | 고아 — 현재 릴리스 어디서도 미참조, 삭제 대상 |
| DGX | `~/models/comfyui` | 107G | FLUX2 가중치 |
| DGX | `~/models/wan22-i2v-nvfp4` | 27G | Wan2.2-I2V-A14B NVFP4 + distill LoRA, 8/5 다운로드 |
| DGX | `~/models/insecure-wan22-nvfp4` | 40K | 사실상 빈 폴더, 삭제 대상 |
| DGX | `/srv/ai/models/gguf` | 11G | llama.cpp fallback GGUF |
| M1 | `~/.cache/huggingface` | 6.0M | 표준 경로 |
| M1 | `~/models/.cache/huggingface` | 20K | 모델별 고아 캐시 |
| M1 | `~/models/Qwen3.6-35B-A3B-UD-MLX-4bit/.cache/huggingface` | 64K | 모델별 고아 캐시 |
