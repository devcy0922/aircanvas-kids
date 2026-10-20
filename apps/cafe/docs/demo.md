# 엄빠(서울형 키즈카페) 데모

Phase 1 MVP(시설·필터 검색) + Phase 2 구조(5분 캐시 · stale-while-revalidate · 수동 새로고침 cooldown/singleflight)를 **예약 수집 없이** 검증하는 데모 서비스입니다.

## 데모 범위와 한계

- **시설 목록**: 서울 열린데이터광장 '서울형 키즈카페 시설현황정보'(OA-21716) 스키마를 참고한 **예시 데이터** (`data/facilities.json`). `SC240801`만 문서에 인용된 실제 시설 ID이며 나머지는 데모용 가상 ID입니다.
- **예약 현황**: `demo-simulator` — 결정적 해시로 생성된 **시뮬레이션 수치**입니다. 실제 공식 사이트에서 수집·조회하지 않습니다 (Phase 0 법적·봇 정책 검증 미완료, `docs/LEGAL_AND_ROBOTS.md` 준수).
- UI 전체에 데모 배너와 '표시 수치(단위 미검증)' 표기를 노출합니다.
- 공식 예약 버튼은 **검증된 URL**(SC240801)만 직접 연결하고, 나머지는 공식 포털 홈으로 안내합니다.

## 구조

```
apps/cafe/
├── server.js              # zero-dependency Node.js HTTP 서버 (API + 정적)
├── data/facilities.json   # 데모 시설 Registry
├── public/index.html      # 모바일 퍼스트 UI (BASE 경로를 문서 위치에서 구함)
├── public/kids-tokens.css # packages/ui/tokens.css 복사본(생성물, npm run sync-ui)
├── Dockerfile             # node:20-alpine
├── docker-compose.yml     # kids-cafe 컨테이너 :8124
└── .dockerignore
```

## API

| Endpoint | 설명 |
| --- | --- |
| `GET /healthz` | 헬스체크 (mode: demo) |
| `GET /api/districts` | 자치구 목록 |
| `GET /api/facilities?districts=&age_months=&lat=&lng=&radius_km=&date=` | 필터 검색 + 회차별 현황 (캐시 5분, stale 표시) |
| `POST /api/facilities/{id}/availability/refresh` `{date}` | 수동 새로고침. 5분 내 캐시면 200 cached, 60초 cooldown 초과 시에만 200 refreshed, cooldown 내 재요청은 429 + Retry-After + 기존 캐시 |

거리 계산: 사용자 좌표 우선 (직선거리, haversine), 위치 미사용 시 자치구 중심점 기준 fallback, 좌표 없는 시설은 '거리 미제공'.
연령 필터: 개월 기반, 규칙 미확인 시설은 '연령 확인 필요'로 포함.

## 실행 (cy-server 기준)

```bash
cd /srv/products/aircanvas-kids
docker compose -f apps/cafe/docker-compose.yml config        # 검증
docker compose -f apps/cafe/docker-compose.yml up -d --build # 기동 (컨테이너명: kids-cafe, 포트 8124)
docker compose -f apps/cafe/docker-compose.yml ps
curl -s localhost:8124/healthz
```

브라우저: `http://192.168.0.10:8124/` (공개: `https://kids.aircanvas.kr/cafe/`, 엣지가 `/cafe/` 접두를 떼고 전달)

> 이관 전 `s-kids` 컨테이너(:8123, `sk.moru.my`)는 전환이 끝날 때까지 별개로 남아 있다. 이쪽 문서의 `sk.moru.my` 절은 그 구 배포에 대한 기록이다.

## 엣지 도메인 (sk.moru.my, 이관 전 구 배포)

cy-server `edge-nginx`를 통해 `https://sk.moru.my/`로 노출합니다.

- vhost: `platform-edge-infra/nginx/config/conf.d/sk-moru.conf` (저장소 내 백업: `.edge/sk-moru.conf`)
- 인증서: `newsroom-moru-wildcard`(`*.moru.my`) — moru.my 인증서 SAN에 sk.moru.my 추가는 Let's Encrypt HTTP-01 fetch가 cy-server로 도달하지 않는 현상(2026-10-14)이 해결되면 수행
- 프록시: `172.17.0.1:8123` (도커 브리지 게이트웨이 → s-kids 컨테이너 포트). 컨테이너 정지 시 nginx 전체 장애를 막기 위해 static upstream 대신 IP 기반 프록시
- 변경 후 반영: `platform-edge-infra/scripts/nginx-reload.sh` (문법 검증 + graceful reload)

## 운영 노트

- 실제 예약 수집을 활성화하려면 Phase 0(법적/봇 정책) 통과 후 `simulateFetch`를 collector adapter로 교체합니다. SSRF allowlist·rate limit·파서 fixture를 함께 준비해야 합니다 (`docs/DATA_PIPELINE.md` §6).
- 캐시 TTL(300s)·cooldown(60s)은 상수(`CACHE_TTL_MS`, `REFRESH_COOLDOWN_MS`)로 관리하며, 운영 한도 확인 후 조정합니다.
