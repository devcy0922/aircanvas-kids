---
name: runtime-version-ops
description: "BuildRuntime 테이블 단일 레지스트리 기반 컨테이너 및 프로세스 배포 버전 등록 운영 스킬"
---

# Runtime Version Ops Skill

## 목적

`BuildRuntime` 테이블을 단일 런타임 버전 레지스트리로 운영해,
컨테이너/프로세스 배포 반영 여부를 빠르게 확인한다.

## 스코프

- 저장소: `ai-service-infra`
- DB: `dart_db`
- 테이블: `public.BuildRuntime`

## 사용 스크립트

- 컨테이너 등록: `scripts/register-runtime-versions.sh containers`
- 프로세스 등록(일반): `scripts/register-runtime-versions.sh process`
- 프로세스 등록(dart-bot 전용): `scripts/register-dart-bot-process-runtime.sh`

## 자동화(cron)

- 컨테이너 등록: 10분마다
- `dart-bot` 프로세스 등록: 매일 06:05

로그 경로:

- `/storage/kodak/ai-service-infra/logs/services/buildruntime-register.log`
- `/storage/kodak/ai-service-infra/logs/services/buildruntime-process-register.log`

## 운영 점검 절차

1. 크론 등록 확인

```bash
crontab -l | rg 'buildruntime-register'
```

2. 최근 등록 로그 확인

```bash
tail -n 50 /storage/kodak/ai-service-infra/logs/services/buildruntime-register.log
tail -n 50 /storage/kodak/ai-service-infra/logs/services/buildruntime-process-register.log
```

3. DB 반영 확인

```bash
PGPASSWORD="$POSTGRES_PASSWORD" psql -h db-server -p 5432 -U postgres -d dart_db -c \
"SELECT \"startedAt\", \"service\", \"runtimeKind\", \"releaseVersion\", COALESCE(\"imageRef\", '-') AS image_ref, COALESCE(\"runtimePid\"::text, '-') AS pid FROM \"BuildRuntime\" ORDER BY \"startedAt\" DESC LIMIT 30;"
```

## 장애 대응

- 로그 파일이 비어 있으면:
  - 로그 경로 생성 권한 확인 (`/storage/kodak/ai-service-infra/logs/services`)
  - 크론 사용자와 수동 실행 사용자의 권한 차이 확인
- DB insert 실패 시:
  - `db-server:5432` PostgreSQL 연결 상태 점검
  - `dart_db` 접근 가능 여부 점검
  - `BuildRuntime` 테이블 존재 여부 재확인
- `dart-bot` 프로세스 미탐지 시:
  - `pgrep -f '/target/release/dart-bot'` 결과 점검
  - 기동 경로/프로세스명이 바뀌었는지 점검
