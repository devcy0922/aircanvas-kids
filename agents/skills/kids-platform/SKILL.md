---
name: kids-platform
description: >-
  kids.aircanvas.kr 사이트 구성(포털 /, 게임 /play/, TV /tv/, 엄빠 /cafe/)과 모노레포 운영 절차. 새 서비스를 포털에 추가하거나, 경로·QR 호환·빌드·배포·스모크 검증을 다룰 때 사용한다.
---

# kids 플랫폼(포털 + 서비스) 운영 가이드

> 구조·결정 기록: `docs/platform-plan.md`, 다이어그램: `docs/architecture.md` §9, 규칙: `agents/rules.md` §1.1·§7.

## 구조 한눈에

| 경로 | 앱 | 비고 |
| --- | --- | --- |
| `/` | `apps/portal` | Vite 정적 앱. 카드 목록은 `apps/portal/services.json` |
| `/play/` | `apps/phone` | 게임. Vite `base: '/play/'` |
| `/tv/` | `apps/tv` | QR 진입. 경로 유지 |
| `/cafe/` | `apps/cafe` | Node 컨테이너 `kids-cafe`(:8124). nginx가 접두를 떼고 프록시 |
| `/manifest.json`, `/artworks/`, `/ws`, `/announce` | content-server / Rust 릴레이 | 루트 경로 유지(게임 호환) |

- 앱 사이 import 금지, 공유는 `packages/`(디자인 토큰은 `packages/ui`).
- 게임 코드에 포털·엄빠 로직을 넣지 않는다. 반대도 같다.

## 새 서비스를 포털에 올리기

`docs/platform-plan.md` §8 순서를 그대로 따른다. 포털 코드는 고치지 않고 `services.json`에 항목만 추가한다.
엣지 nginx(`/srv/platform/platform-edge-infra/nginx/config/conf.d/aircanvas.conf`)는 **저장소 밖 공용 설정**이므로 사용자 확인 없이 고치지 않는다.
변경 전 백업 → `docker exec edge-nginx nginx -t` → graceful reload 순서.

## 호환 조건(깨뜨리지 말 것)

- 예전 링크 `/?room=…&server=…`는 포털 `index.html` 인라인 스크립트가 `/play/`로 쿼리 보존 이동시킨다(`room|server|content|phoneApp|debug`).
- TV QR 기본 주소는 `…/play/?server=…&room=…`(`apps/tv/src/App.tsx` `PHONE_APP_BASE`).
- HTTPS 페이지에서 사설 IP `http://` 파라미터는 앱이 무시한다(rules §3).

## 빌드 · 배포 · 검증

```bash
npm run build && make site          # site/ 조립(포털 /, 게임 /play/)
# 배포는 agents/rules.md §7-8: site/ → /srv/airCanvas/aircanvas-kids/apps/phone/dist/ (마운트 이름은 옛 phone/dist, 지금은 사이트 루트)
make site-smoke                     # 포털·게임·엄빠 연결(기본: 공개 URL, AIRCANVAS_SITE_URL로 변경)
make ui-smoke                       # 게임 색칠/월드(기본: https://kids.aircanvas.kr/play/)
```

- 로컬에서 nginx를 모사하려면 정적 서버 하나로 `/`→site, `/tv/`→apps/tv/dist, `/manifest.json`·`/artworks/`→content-server, `/cafe/`→:8124(접두 제거)를 라우팅한다.
- 배포 후에는 공개 URL에서 `/manifest.json` 버전과 `/`·`/play/` 번들 해시를 읽어 확인한다.

## 하지 않는 것

- `.env`·토큰을 커밋하지 않는다. `git add -A` 금지(경로 지정).
- 구 `s-kids` 저장소·컨테이너(`s-kids`, :8123, `sk.moru.my`)는 전환 완료 전에 지우지 않는다. 단계 5(리다이렉트·아카이브)는 사용자 확인 후.
- 저장소 전체가 하나의 semver를 쓴다(앱별 태그는 사용자와 먼저 정한다).
