---
name: kids-cafe
description: >-
  엄빠(서울형 키즈카페 일정 비교, apps/cafe) 수정·운영 가이드. 데모 데이터 표기 원칙, 공공데이터·예약 사이트 정책, /cafe/ 하위 경로 동작, 컨테이너 배포를 다룰 때 사용한다.
---

# 엄빠(`apps/cafe`) 가이드

> 구 `s-kids` 저장소를 이력 보존(`git subtree`)으로 이관한 앱이다. 제품·정책 문서는 `apps/cafe/docs/`(PRODUCT, DATA_PIPELINE, LEGAL_AND_ROBOTS, `cafe-rules.md`, `demo.md`).

## 반드시 지킬 것

- **예약 현황은 시뮬레이션**(결정적 해시, `server.js`의 데모 시뮬레이터)이다. "실시간"·실제 수치로 표시하지 않는다. UI의 `.demo-notice`와 포털 카드의 "데모 데이터" 배지를 유지한다.
- 실제 예약 사이트(우리동네키움포털) 자동 수집·대리 예약·로그인 대행을 하지 않는다. 사용자가 포털에서 본인 계정으로 직접 예약하도록 안내한다.
  실수집은 `docs/LEGAL_AND_ROBOTS.md`의 허용 확인 전에는 구현하지 않는다(403/429/CAPTCHA 시 중단).
- "서울형 키즈카페" 정체성과 서울시 공공데이터(OA-21716) 출처를 UI 최상단에 둔다(`.seoul-badge`는 서울시 파란색 유지).
- 시설 데이터는 예시이며 `SC240801`만 실제 ID다. 가상 ID를 실제 시설처럼 소개하지 않는다.

## 구조

- `server.js`: 의존성 없는 Node 서버(API + 정적). `PORT` 기본 8124. API: `/healthz`, `/api/districts`, `/api/facilities`, `/api/facilities/{id}`, `POST …/availability/refresh`.
- `public/index.html`: 단일 파일 UI. `BASE`(문서 위치로 계산: `/` 이면 `''`, `/cafe/` 이면 `/cafe`)를 붙여 API를 호출한다. **API를 `/api/…` 절대경로로 쓰지 않는다.**
- `public/kids-tokens.css`: `packages/ui/tokens.css`의 복사본(생성물). 토큰을 바꾸면 `npm run sync-ui -w @ht/cafe`. 낡으면 `npm run build -w @ht/cafe`가 실패한다.
- 색은 `index.html`의 `--primary`(살구)·`--accent`(숲 녹색) 매핑을 쓴다. 살구색 글자는 흰 바탕에서 대비가 낮으므로 글자에는 `--primary-deep`.

## 실행·배포

```bash
npm start -w apps/cafe                                          # :8124
docker compose -f apps/cafe/docker-compose.yml up -d --build    # 컨테이너 kids-cafe
curl -s localhost:8124/healthz
```

- 공개 경로 `/cafe/`는 엣지 nginx가 접두를 떼고 `:8124`로 프록시한다(`kids-platform` 스킬, 엣지 변경은 사용자 확인).
- UI 변경 후에는 `make site-smoke`(엄빠 카드·데모 안내·포털 복귀)와 폰 크기 스크린샷을 확인한다.
