---
name: docker-maintenance-ops
description: >-
  Use when reviewing, executing, or modifying automated weekly Docker resource maintenance,
  build cache pruning, dangling image cleanup, Dagu schedules, and disk space guards on cy-server.
---

# Docker 주간 정기 유지보수 운영 스킬 (`docker-maintenance-ops`)

이 스킬은 플랫폼 호스트(`cy-server` 및 `db-server`)에서 컨테이너 재빌드와 배포 시 지속적으로 누적되는 **Docker Build Cache와 댕글링(고아) 이미지를 안전하게 정기 회수**하기 위한 운영 표준입니다.

---

## 1. 아키텍처 및 역할 분담 (SSOT)

| 구분 | 위치 및 경로 | 역할 |
|---|---|---|
| **호스트 정리 스크립트** | `/srv/platform/ai-service-infra/scripts/prune-docker.sh` | cy-server 로컬 도커 빌드 캐시 및 고아 이미지 7일 필터 정리 SSOT |
| **중앙 Dagu DAG** | `/srv/platform/ai-data-infra/dagu/dags/weekly-docker-prune.yaml` | 매주 일요일 새벽 04:00 (`0 4 * * 0`) 자동 트리거 및 데드맨 경보 |
| **운영 실행 로그** | `/storage/kodak/ai-service-infra/logs/services/docker-prune.log` | 정기 실행 표준 로그 (Kodak SSD 영구 스토리지 보관) |
| **통합 관제 알림** | `ops-notifier` (`http://cy-server:8090/v1/events`) | 정리 완료 및 용량 회수 내역 텔레그램 실시간 전송 |

---

## 2. 왜 정기 정리가 필수적인가?

1. **Docker 빌드 캐시(BuildKit) 누적:**
   - 도커는 빌드 속도를 위해 `Dockerfile`의 각 스텝 스냅샷 레이어를 영구 보관합니다.
   - 새 코드를 빌드할 때마다 캐시 레이어가 계속 추가되며, 도커 엔진 자체는 이를 자동으로 비우지 않습니다.
2. **Dangling Image (이름 없는 고아 이미지) 발생:**
   - 동일 태그(예: `service:latest`)로 재빌드 시 기존 이미지는 덮어써지지 않고 태그만 새 이미지로 이동하며 `<none>:<none>` 상태로 디스크에 남습니다.
3. **7일(168h) 보존 정책의 안전성 (`until=168h`):**
   - 개발 및 운영 중 빈번한 빌드 시 최근 7일 이내의 캐시는 유지하여 **빌드 속도(캐시 히트)**를 보장합니다.
   - 7일 이상 참조되지 않은 오래된 중간 캐시와 롤백 가치가 소멸된 과거 이미지만 선별하여 안전하게 삭제합니다.

---

## 3. 호스트 정리 스크립트 규격 (`prune-docker.sh`)

```bash
/srv/platform/ai-service-infra/scripts/prune-docker.sh [OPTIONS]
```

### 지원 옵션
- `--dry-run`: 실제 삭제 없이 현재 회수 가능한 Docker 사용량만 출력.
- `--all`: 7일 필터 없이 미사용 리소스를 전면 삭제 (주의: 최근 캐시도 모두 소멸).
- `--no-notify`: `ops-notifier` 알림 발송 생략.

### 실행 예시
```bash
# 1. 상태 점검 (Dry-run)
/srv/platform/ai-service-infra/scripts/prune-docker.sh --dry-run

# 2. 안전한 7일 경과 리소스 수동 즉시 정리
/srv/platform/ai-service-infra/scripts/prune-docker.sh

# 3. 긴급 디스크 풀 상황 시 전면 청소
/srv/platform/ai-service-infra/scripts/prune-docker.sh --all
```

---

## 4. Dagu 중앙 스케줄러 등록 및 상태 확인

중앙 스케줄러 Dagu(`db-server:8080`, `https://dagu.govail.cloud`)에 등록되어 매주 일요일 04:00에 자동 실행됩니다.

### Dagu 상태 및 스케줄 확인
```bash
# Dagu API로 스케줄 및 차기 실행 시각 확인
ssh db-server 'U=$(docker exec shared-dagu printenv DAGU_AUTH_BASIC_USERNAME); \
  P=$(docker exec shared-dagu printenv DAGU_AUTH_BASIC_PASSWORD); \
  curl -s -u "$U:$P" http://localhost:8080/api/v1/dags/weekly-docker-prune | jq "{name: .dag.name, nextRun: .dag.nextRun}"'
```

### DAG 문법 검증
```bash
ssh db-server "docker exec shared-dagu dagu validate /var/lib/dagu/dags/weekly-docker-prune.yaml"
```

---

## 5. 호스트 Crontab 이중 안전망

Dagu 네트워크 장애나 컨테이너 이슈 발생 시에도 호스트 차원에서 무조건 디스크 정리가 수행되도록 `cy-server` 호스트 crontab에 이중 안전망이 등록되어 있습니다:

```cron
# cy-server: crontab -l
0 4 * * 0 /srv/platform/ai-service-infra/scripts/prune-docker.sh >> /storage/kodak/ai-service-infra/logs/services/docker-prune.log 2>&1
```
