---
name: observability-ops
description: "cy-server 관측성 스택(Grafana, Loki, Promtail, Prometheus, node-exporter, cAdvisor) 운영 스킬. 로그 수집 파이프라인(Promtail→Loki), 메트릭 스크레이핑(Prometheus), 대시보드 관리(Grafana), 알림 설정, OIDC SSO 연동, 보존 정책 및 스토리지 용량 관리를 담당한다. ai-service-infra 저장소 소유 스킬."
---

# 관측성 스택 운영 스킬 (observability-ops)

> **소유 저장소**: `ai-service-infra` (`/srv/platform/ai-service-infra`)  
> **로그 기준 경로**: `/storage/kodak/ai-service-infra/logs/services`

---

## 1. 스택 구성 및 포트

| 서비스 | 컨테이너명 | 이미지 | 포트 | 역할 |
|---|---|---|---|---|
| Grafana | `shared-grafana` | `grafana/grafana:10.4.1` | **3400** | 대시보드·알림 UI |
| Loki | `shared-loki` | `grafana/loki:2.9.2` | **3100** | 로그 집계 백엔드 |
| Promtail | `shared-promtail` | `grafana/promtail:2.9.2` | — | 로그 수집 에이전트 |
| Prometheus | `shared-prometheus` | `prom/prometheus:v2.51.0` | **9090** | 메트릭 집계 |
| Monitor(cAdvisor+node-exp) | `shared-monitor` | — | **3190** | 컨테이너·호스트 메트릭 |

---

## 2. 로그 수집 파이프라인 (Promtail → Loki)

```
cy-server (컨테이너/호스트 로그)
   └─▶ Promtail (로그 테일링)
          └─▶ Loki :3100 (집계·인덱싱)
                 └─▶ Grafana :3400 (LogQL 조회·대시보드)
```

### 핵심 규칙

- **Promtail positions 파일**은 영속 경로에 마운트하여 컨테이너 재기동 시 중복 수집을 방지한다.
- Loki 보존 정책(`retention_period`)과 스토리지 사용량은 함께 확인한다.
- Promtail 파이프라인 정합성: `docker compose logs promtail`로 주기적으로 모니터링한다.

### Promtail 설정 경로

```
promtail/
└── config.yml   # 수집 타겟, 레이블, positions 파일 경로 설정
```

---

## 3. Prometheus 메트릭 스크레이핑

```
config/
└── observability-targets.json  # 스크레이프 대상 SSOT (그룹별 등록)
prometheus/
└── prometheus.yml   # generate-prometheus-config.py로 자동 생성됨. 직접 수정 금지
scripts/
└── generate-prometheus-config.py  # observability-targets.json → prometheus.yml 렌더링
```

> [!IMPORTANT]
> 스크레이프 대상 추가/변경은 `prometheus.yml`을 직접 고치지 않고 `config/observability-targets.json`에 그룹(`cy-server`/`db-server`/`remote-dgx`/...)별로 타겟을 등록한 뒤 `./scripts/generate-prometheus-config.py`를 실행해 재생성한다. `--check` 옵션으로 생성물이 최신인지 검증할 수 있다.

### 주요 스크레이프 타겟

| 잡명 | 타겟 | 비고 |
|---|---|---|
| `litellm` | `localhost:14000/metrics` | Bearer 인증 필요 |
| `node-exporter` | `localhost:9100` | 호스트 메트릭 |
| `cadvisor` | `localhost:8083/metrics` | 컨테이너 메트릭 |
| `loki` | `localhost:3100/metrics` | Loki 자체 메트릭 |
| `grafana` | `localhost:3400/metrics` | Grafana 자체 메트릭 |
| `db-server-kafka-exporter` | `db-server:9308/metrics` | Kafka 토픽 오프셋·컨슈머 그룹 lag (`ai-data-infra` 소유, §9 참고) |
| `db-server-redis-exporter` | `db-server:9121/metrics` | Redis 키스페이스·커맨드 처리량 (`ai-data-infra` 소유, §9 참고) |

---

## 4. Grafana 대시보드 관리

```
grafana/
├── provisioning/
│   ├── dashboards/
│   │   ├── dashboards.yaml          # 대시보드 프로비저닝 설정
│   │   ├── json/
│   │   │   ├── litellm-model-status.json  # LiteLLM 모델 상태 SSOT
│   │   │   └── *.json                     # 기타 대시보드
│   │   ├── db-infra/
│   │   │   ├── db-server-overview.json
│   │   │   ├── db-services-overview.json          # 컨테이너 uptime·메모리
│   │   │   └── kafka-redis-observability.json     # 토픽 처리량·컨슈머 lag·Redis 키스페이스 (§9)
│   │   └── dart-ai-trading-bot/     # DART 전용 대시보드 폴더
│   └── datasources/
│       └── datasources.yaml         # Loki, Prometheus 데이터소스 설정
```

### OIDC SSO 연동

- **Identity Provider**: `auth.aircanvas.kr` (Keycloak 24, AirCanvas realm)
- Grafana OIDC 클라이언트 Issuer URL SSOT: `https://auth.aircanvas.kr/realms/<realm>`
- SSO 설정 변경 시 `/srv/platform-edge-infra`와 함께 확인한다.

---

## 5. 운영 명령

```bash
# 전체 관측 스택 상태 확인
docker compose ps grafana loki promtail prometheus

# 로그 확인
docker compose logs -f loki
docker compose logs -f promtail
docker compose logs -f grafana

# Prometheus 타겟 상태 확인
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Loki 상태 확인
curl -s http://localhost:3100/ready
curl -s http://localhost:3100/metrics | grep loki_ingester

# Grafana API 헬스체크
curl -s http://localhost:3400/api/health | jq .

# Promtail 타겟 확인
curl -s http://localhost:9080/targets 2>/dev/null | head -30
```

---

## 6. Grafana 재시작 시 주의사항

```bash
# Grafana 재기동 (Loki/Prometheus 데이터소스 먼저 확인)
docker compose restart grafana

# 대시보드 프로비저닝 재적용 (설정 변경 후)
docker compose up -d grafana
```

> [!WARNING]
> Grafana SQLite DB(`/var/lib/grafana/grafana.db`)가 마운트 경로에 있어야 재기동 후 설정이 보존된다.
> 볼륨 마운트 경로 변경 시 기존 DB 경로 확인 필수.

---

## 7. 스토리지 및 보존 정책

- **Loki 청크 저장소**: `docker compose exec loki df -h /loki` 로 용량 확인
- **보존 기간**: `local-config.yaml`의 `retention_period` 확인
- **로그 기준 경로**: `/storage/kodak/ai-service-infra/logs/services`

```bash
# Loki 스토리지 사용량
docker compose exec loki du -sh /loki/chunks/ 2>/dev/null

# Prometheus TSDB 사용량
docker compose exec prometheus du -sh /prometheus/
```

---

## 8. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| Grafana 데이터소스 연결 실패 | Loki/Prometheus 미기동 | `docker compose up -d loki prometheus` |
| Promtail 로그 중복 수집 | positions 파일 초기화 | positions 파일 경로 영속 마운트 확인 |
| Prometheus 타겟 `down` | 스크레이프 엔드포인트 변경 | `prometheus.yml` 타겟 URL 확인 |
| Loki 스토리지 full | 보존 정책 미설정 | `retention_period` 설정 후 Loki 재기동 |
| Grafana OIDC 로그인 실패 | Issuer URL 불일치 | `auth.aircanvas.kr/realms/<realm>` SSOT 확인 |

---

## 9. db-server 데이터 인프라 익스포터 (Kafka / Redis)

> 컨테이너 정의 소유 저장소는 `ai-data-infra`(`/srv/platform/ai-data-infra`)다. `ai-service-infra`는 스크레이프 등록과 대시보드만 소유한다.

| 익스포터 | 컨테이너명 | 이미지 | 포트 | 대상 |
|---|---|---|---|---|
| kafka-exporter | `shared-kafka-exporter` | `danielqsj/kafka-exporter:v1.7.0` | **9308** | `kafka:9092` (토픽 오프셋, 컨슈머 그룹 lag) |
| redis-exporter | `shared-redis-exporter` | `oliver006/redis_exporter:v1.62.0-alpine` | **9121** | `redis:6379` (키스페이스, 커맨드 처리량) |

- 배포: `ai-data-infra`의 `docker-compose.yml`을 수정한 뒤 `make deploy`로 db-server에 반영한다(상태 비저장 컨테이너라 데이터 손실 위험 없음).
- 스크레이프 등록: `ai-service-infra`의 `config/observability-targets.json` `db-server` 그룹에 타겟을 추가하고 `./scripts/generate-prometheus-config.py`로 `prometheus.yml`을 재생성한 뒤 `docker compose restart prometheus`.
- 대시보드: `grafana/provisioning/dashboards/db-infra/kafka-redis-observability.json` (폴더 `DB Infra`). 토픽별 처리량(`rate(kafka_topic_partition_current_offset[5m])`), 컨슈머 그룹 lag(`kafka_consumergroup_lag`), Redis 커맨드 처리량(`rate(redis_commands_processed_total[5m])`)·키스페이스(`redis_db_keys`)·캐시 적중률을 패널로 노출한다.
- `kafka_consumergroup_lag`가 빈 결과라면 컨슈머 그룹이 아직 등록되지 않은 것이지 익스포터 장애가 아니다. `docker exec shared-kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list`로 먼저 실제 그룹 존재 여부를 확인한다.

```bash
# 익스포터 상태 확인 (db-server)
ssh db-server "curl -s http://localhost:9308/metrics | grep ^kafka_brokers"
ssh db-server "curl -s http://localhost:9121/metrics | grep ^redis_up"

# Prometheus 타겟 확인 (cy-server)
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job|test("kafka|redis")) | {job: .labels.job, health}'
```
