---
name: platform-path-guard
version: 1.2.0
description: "/srv 4대 도메인 계층 구조 및 NAS/KODAK 스토리지 경로 정합성 보장과 레거시 경로 가드 스킬"
---

# Platform Path & Storage Guard Skill

## 목적

`/srv` 하위 4대 도메인 계층 구조(`/srv/platform`, `/srv/products`, `/srv/projects`, `/srv/internal`) 및 NAS 스토리지(`/storage/kodak`, `/storage/nas`)의 경로 참조 정합성을 보장하고, 깨진 심볼릭 링크나 레거시 하드코딩 경로로 인한 인프라 장애를 사전에 방지한다.

## 1. 표준 디렉토리 계층 SSOT

| 계층 | 기준 경로 | 포함 컴포넌트 예시 | 마운트/연동 정책 |
| :--- | :--- | :--- | :--- |
| **Platform** | `/srv/platform/` | `ai-service-infra`, `ai-gateway-infra` | 공통 Docker 인프라, 라우팅, 관측성, DB 허브 |
| **Products** | `/srv/products/` | `govail`, `research-agents`, `frameforge` | 핵심 프로덕트 런타임 및 정적 웹 빌드 배포 |
| **Projects** | `/srv/projects/` | `aircanvas-kids` | 개별 서비스 및 실험 프로젝트 배포 산출물 |
| **Demo** | `/srv/demo/` | `ycy-mvp`, `meetup`, `laycard`, `weplot-app`, `slicerag` | 데모/PoC 빌드 산출물 (`moru.my/prj/...` 및 `demo-postgres:5433` 연동) |
| **Internal** | `/srv/internal/` | `govail-control`, 운영 봇 | 내부 거버넌스 및 제어 자동화 |

### 스토리지 및 볼륨 계층 (cy-server 단일 관리 원칙)

- **스토리지 독점 소유**:
  - `/storage/kodak`(SSD) 및 `/storage/nas`(SMB 공유)는 **cy-server (`192.168.0.10`) 단일 호스트**에서만 마운트·관리한다.
  - **부노드 마운트 금지**: DGX Spark (`192.168.0.22`), Mac mini (`192.168.0.5`), M1 Max (`192.168.0.8`), llm-server-3 (`192.168.0.21`) 등 외부 연산 노드는 `/storage` 마운트를 보유하지 않는다.
  - **CIFS/SMB automount 금지**: 부노드에서 autofs(`auto_smb`) 또는 systemd automount를 활성화하면 파일 탐색(`find`, `ls`, `df`) 시 심각한 I/O 타임아웃 및 블로킹(Hang)이 발생하므로 영구 비활성화한다.
  - 원격 노드는 로컬 스토리지(NVMe, `/srv`, `/var/log`, `~/models`)만 사용하며, 데이터 공유 필요 시 API/엔드포인트(HTTP/gRPC/OCI)를 통해 연동한다.
- **원격 DB 호스트 (`db-server`)**: PostgreSQL, SurrealDB, Redis 등 POSIX 파일 잠금/권한 민감 활성 DB 데이터.
- **KODAK 스토리지 (`/storage/kodak/`, cy-server 로컬 마운트)**:
  - 서비스 로그: `/storage/kodak/ai-service-infra/logs/services/`
  - Promtail positions: `/storage/kodak/ai-service-infra/logs/promtail/`
  - 상태 및 세션: `/storage/kodak/ai-service-infra/state/`
  - DB 백업: `/storage/kodak/dart-ai-trading-bot/db_backup/`

## 2. 점검 및 무결성 검증 절차

### 1) 깨진 심볼릭 링크 검사
```bash
find /srv/platform/ai-service-infra -maxdepth 3 -xtype l
```
- 결과가 없어야 정상. 발견 시 대상 실제 경로로 `ln -sfn` 갱신.

### 2) 레거시 하드코딩 경로 검색
```bash
# 레거시 절대경로 (/Users/ 등) 또는 구형 /srv/ai-service-infra, /srv/nas 검색
rg '/Users/|/srv/ai-service-infra|/srv/nas' /srv/platform/ai-service-infra \
  --glob '!CHANGELOG.md' --glob '!docs/cy-server-migration-architecture.md' --glob '!.git'
```

### 3) Docker Compose 볼륨 마운트 검증
```bash
docker compose config --quiet
```

### 4) Nginx 설정 구문 검사
```bash
docker exec shared-nginx nginx -t
```

## 3. 장애 대응 가이드

- **볼륨 마운트 누락 시**:
  - `docker-compose.yml` 내의 호스트 절대경로가 `/srv/{platform|products|projects}/...` 표준에 맞는지 확인.
- **NAS 스토리지 접근 실패 시**:
  - `df -h | grep /storage`로 CIFS/NFS 마운트 활성 상태 확인.
  - 마운트 해제 시 활성 DB는 로컬 NVMe에 있으므로 서비스 자체는 중단되지 않으나, 백업 및 로그 적재 크론이 안전하게 건너뛰도록 `nas-guarded-cron.sh`가 보호 중인지 점검.
