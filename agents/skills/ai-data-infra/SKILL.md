---
name: ai-data-infra
description: AI 플랫폼 중앙 데이터 인프라(PostgreSQL, MariaDB, Redis, SurrealDB, Kafka, Dagu, DbGate) 원격 배포 및 운영 스킬
---

# AI 플랫폼 데이터 인프라 운영 스킬 (ai-data-infra)

이 스킬은 AI 플랫폼의 데이터베이스, 캐시, 메시징 브로커, 스케줄러 인프라를 안전하게 관리하고 배포하기 위한 표준 가이드입니다. 
`/srv/platform/ai-data-infra` 저장소 및 데이터 인프라와 연동하는 애플리케이션 서비스 개발/운영 시 적용합니다.

---

## 1. 아키텍처 토폴로지 및 역할

| 호스트 / 위치 | IP 주소 | 역할 및 설명 |
| :--- | :--- | :--- |
| **cy-server** | `192.168.0.10` | 소스 관리 SSOT (`/srv/platform/ai-data-infra`), 배포 제어 및 명령 실행 위치 |
| **db-server** | `192.168.0.15` | 실제 컨테이너 및 데이터 볼륨이 상주하는 실행 노드 (Ubuntu 24.04) |

* 모든 배포 및 컨테이너 관리는 **`cy-server`에서 `make` 명령어로만** 수행합니다.

---

## 2. 관리 대상 컴포넌트

1. **PostgreSQL 16 (`shared-postgres`)**:
   - `pgvector/pgvector:pg16` 기반 + `postgresql-16-postgis-3` 확장 이미지(`Dockerfile.postgres`).
   - `dart_db`, `langfuse`, `temporal`, `keycloak` 등 다중 운영 DB 통합 호스팅.
   - 외부 포트: `5432`, 영속 볼륨: `/opt/ai-data-infra/data/postgres`.
2. **Demo PostgreSQL 16 (`demo-postgres`)**:
   - `/srv/demo` 프로젝트(laycard, weplot, slicerag 등) 전용 격리 DB 인스턴스 (`demo_db`).
   - 마스터 관리자: `id: demo-admin`, `pw: demo-admin` (모든 데모 스키마 관리 가능).
   - 각 데모별 독립 스키마 및 전용 계정 격리 운영 (`create_demo_tenant` 헬퍼 제공).
   - 외부 포트: `5433`, 내부 DNS: `demo-postgres:5432`, 영속 볼륨: `/opt/ai-data-infra/data/demo-postgres`.
   - 초기화 스크립트: `db-init-demo/01-init-demo-db.sql`.
3. **MariaDB 11.4 LTS (`shared-mariadb`)**:
   - `moru`, `bottari` 등 경량 RDBMS 허브.
   - 영속 볼륨: `/opt/ai-data-infra/data/mariadb`.
4. **Redis 7 (`shared-redis`)**:
   - 중앙 캐시, 세션 스토어, 분산 락.
   - 영속 볼륨: `/opt/ai-data-infra/data/redis`.
5. **SurrealDB 2.2 (`shared-surrealdb`)**:
   - 멀티모델 문서/그래프 DB.
   - 영속 볼륨: `/opt/ai-data-infra/data/surrealdb`.
6. **Dagu 2.7.5 (`shared-dagu`)**:
   - 중앙 Cron & DAG 워크플로우 오케스트레이터 (`dagu/dags/`).
   - 애플리케이션 서비스 대상 HTTP 호출 및 스케줄링.
   - 영속 볼륨: `/opt/ai-data-infra/data/dagu`.
7. **Apache Kafka 3.8 KRaft (`shared-kafka`)**:
   - 단일 노드 중앙 이벤트 버스 & 비동기 스트림 파이프라인.
   - 영속 볼륨: `/opt/ai-data-infra/data/kafka`.
8. **DbGate Community 7.2.6 (`shared-dbgate`)**:
   - 내부망 전용 DB 관리 UI (`db-server:8181`).
   - 외부 접근은 `platform-edge` Nginx `https://dbgate.govail.cloud` 및 Keycloak `govail` realm의 `master-admin` 역할 필수.
   - `PostgreSQL`, `Demo PostgreSQL (demo-admin)`, `MariaDB`, `Redis` 커넥션이 기본 프리셋으로 등록되어 즉시 조회 및 관리 가능.
9. **zot 2.1.2 (`shared-zot`)**:
   - `skm` 스킬 레지스트리용 OCI 아티팩트 스토어. git 파일 기반 스킬 배포를 대체하는 목적.
   - 외부 포트: `5010` (`db-server:5010`), 영속 볼륨: `/opt/ai-data-infra/data/zot`.
   - 설정 파일: 레포 루트 `zot-config.json` (배포 시 rsync로 동기화).
   - `oras --plain-http push/pull db-server:5010/<name>/<artifact>:<tag>`로 push/pull.
   - **알려진 제한**: 인증 미적용(익명 pull/push 허용), 내부망 전용으로만 노출한다. htpasswd 기반 인증 잠금은 후속 작업.

---

## 3. 표준 운영 커맨드 (`cy-server` 기준)

```bash
# 1. 원격 db-server로 배포 및 컨테이너 기동
make deploy

# 2. 원격 컨테이너 상태 확인
make ps

# 3. 원격 로그 실시간 스트리밍
make logs

# 4. 로컬 Compose 및 원격 DAG 문법 검증 (문법만 검증, 실행 이력은 안 나옴)
make validate
make dagu-validate

# 5. Kafka 표준 토픽 목록 및 초기화/동기화
make kafka-topics
make kafka-init

# 6. 원격 컨테이너 안전 재시작
make restart
```

---

## 4. 변경 유형별 작업 기준

### 4.1 데이터베이스 스키마 및 DB 추가
- **운영 데이터베이스 (`shared-postgres`)**: 새 DB는 `POSTGRES_MULTIPLE_DATABASES`와 `.env.example`에 함께 등록하고, `db-init/`에 초기화 스크립트를 작성합니다. 기존 운영 DB는 마이그레이션 도구로 버전 관리합니다.
- **데모 전용 데이터베이스 (`demo-postgres`)**:
  - `/srv/demo` 프로젝트는 운영 DB와 완전 격리된 `demo-postgres`(`db-server:5433` / 내부 `demo-postgres:5432`)를 사용합니다.
  - 마스터 계정: `id: demo-admin`, `pw: demo-admin`.
  - 신규 데모 테넌트 추가: `demo_db` 접속 후 `SELECT create_demo_tenant('<repo_name>', '<password>');` 실행 시 스키마와 격리 계정(`demo_<repo_name>`)이 자동 프로비저닝됩니다.
  - DbGate(`https://dbgate.govail.cloud`)의 `Demo PostgreSQL` 프리셋을 통해 Keycloak 인증 후 즉시 접속·관리할 수 있습니다.
- **영속 데이터 디렉터리 보호**: `/opt/ai-data-infra/data/*`는 절대 임의로 삭제하거나 초기화하지 않습니다.

### 4.2 Kafka 이벤트 버스 계약
- **선행 계약**: 토픽 신설 및 보존 정책 변경 시 `docs/kafka-event-bus-guide.md` 문서를 먼저 갱신합니다.
- **포맷 표준**: 이벤트 페이로드는 CloudEvents 1.0 JSON 규격을 준수합니다.
- **소비자 멱등성**: 네트워크 재시도에 대비하여 소비자는 중복 전달을 전제로 멱등 처리해야 합니다.
- **DLQ 처리**: 처리 실패 메시지는 원본 토픽의 `.dlq`로 격리하고 원본 오프셋을 기록합니다.

### 4.3 Dagu 워크플로우 정의
- DAG 정의 파일은 Git 저장소의 `dagu/dags/*.yaml`에서 관리합니다.
- DAG 내에는 소유 서비스, timeout, retry, overlap 방지 정책, 복구 담당자를 주석으로 명시합니다.
- Dagu 호출은 내부 Docker 네트워크 또는 지정된 사설 포트로만 수행합니다.
- **SSOT 드리프트 주의**: `make deploy`는 `dagu/dags/`를 `rsync --delete`로 db-server 런타임 디렉터리에 그대로 미러링합니다. db-server에서 `docker exec shared-dagu ls /var/lib/dagu/dags`로 확인했을 때 git 저장소에 없는 `.yaml`이 보이면, 그건 다음 배포 때 조용히 삭제될 살아있는 스케줄일 수 있습니다 — 삭제 전에 반드시 `dagu/dags/`로 역이전(git add/commit)합니다.
- **스케줄·실행 성공/실패 확인**:
  - 웹 UI: `http://db-server:8080` (`.env`의 `DAGU_AUTH_BASIC_USERNAME`/`PASSWORD`로 로그인, 사내망 전용)
  - API (db-server 내부 또는 SSH):
    ```bash
    ssh db-server 'U=$(docker exec shared-dagu printenv DAGU_AUTH_BASIC_USERNAME); \
      P=$(docker exec shared-dagu printenv DAGU_AUTH_BASIC_PASSWORD); \
      curl -s -u "$U:$P" http://localhost:8080/api/v1/dags'
    ```
    결과의 `schedule`(cron), `latestDAGRun.statusLabel`(succeeded/failed), `nextRun`으로 등록된 스케줄과 최근 성공/실패를 한 번에 확인합니다. 특정 실행의 실패 단계·에러는 `.../api/v1/dags/<dag-name>/dag-runs/<dagRunId>`로 조회합니다.
  - `make dagu-validate`는 문법 검증만 수행하며 실행 이력·성공 여부는 보여주지 않습니다.

---

## 5. 불변 안전 가드레일 (Safety Guardrails)

1. **데이터 파괴 방지**: 운영 중인 컨테이너 볼륨 삭제(`docker compose down -v`)를 일절 금지합니다.
2. **네트워크 격리**: DB 및 Kafka 포트는 내부망에서만 접근 가능해야 하며, 공인 IP로 직접 노출하지 않습니다.
3. **Secret 보호**: DB 패스워드, JWT Secret 등은 코드 및 문서에 기록하지 않고 호스트의 `.env`를 통해 주입합니다.
4. **DbGate 보안**: 운영 DB 연결 시 원칙적으로 읽기 전용(Read-Only) DB 계정을 생성하여 연결합니다.
5. **Dagu 배포 전 드리프트 확인**: `make deploy` 실행 전 `docker exec shared-dagu ls /var/lib/dagu/dags`(db-server)와 로컬 `dagu/dags/`를 비교합니다. git에 없는 DAG 파일을 발견하면 원인 파악 없이 그대로 배포(=삭제)하지 않습니다.
