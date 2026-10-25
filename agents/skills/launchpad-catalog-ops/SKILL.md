---
name: launchpad-catalog-ops
description: "GoVail 대시보드와 SSO 전환 화면의 /srv 프로젝트 인벤토리 및 Nginx 라우트 카탈로그 운영 스킬"
---

# 런치패드 프로젝트 카탈로그 운영 스킬

## 목적

GoVail 대시보드와 SSO 전환 화면에서 `/srv` 프로젝트를 누락 없이 안내하고, 실제 nginx 라우트가 있는 항목만 실행 링크로 제공한다.

## 변경 절차

1. `/srv/platform`, `/srv/products`, `/srv/internal`의 프로젝트 목록을 확인한다.
2. `config/nginx/conf.d/*.conf`의 `server_name`과 upstream을 대조한다.
3. 실행 주소가 있는 프로젝트는 `dashboard/index.html`에 HTTPS 링크와 설명을 추가한다.
4. 운영 upstream이 없는 내부 프로젝트는 가짜 URL을 만들지 않고 비활성 상태 카드로 표시한다.
5. 새로운 운영 UI를 노출할 때는 먼저 nginx 설정과 Keycloak/OAuth2-Proxy 인증 경계를 추가한다.
6. `docs/launchpad-project-catalog-architecture.md`의 카탈로그 표를 같은 변경에 맞춰 갱신한다.

## 검증 게이트

- `docker compose config`가 성공해야 한다.
- nginx 컨테이너가 실행 중이면 `docker compose exec -T nginx nginx -t`를 통과해야 한다.
- 대시보드 마운트 경로가 `./dashboard:/usr/share/nginx/html/dashboard:ro`인지 확인한다.
- 대시보드에 운영 프로젝트와 내부 상태 항목이 각각 존재하는지 정적 검색으로 확인한다.
- 새 nginx 도메인은 HTTP 301, HTTPS 인증 경계 또는 서비스 응답을 운영 호스트에서 확인한다.

## 불변 규칙

- 인증 쿠키를 JavaScript에서 직접 읽지 않는다. 인증 상태는 `/dashboard/auth-state`를 사용한다.
- `control.govail.cloud`처럼 upstream이 확정되지 않은 주소는 대시보드에 활성 링크로 추가하지 않는다.
- `pocket-control`처럼 웹 UI가 없는 에이전트는 `에이전트 전용`으로 표시한다.
- nginx 컨테이너 내부에서 설정을 수정하지 않고 저장소의 `config/nginx/`만 변경한다.
