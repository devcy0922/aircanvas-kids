---
name: edge-operations
version: 1.1.4
description: "Platform Edge Infra의 Nginx 리버스 프록시, Keycloak OIDC/SSO, OAuth2-Proxy, Certbot TLS, Fail2ban 및 Docker 라벨 기반 라우팅을 안전하게 설계·검증·운영하는 통합 엔지니어링 스킬"
---

# Edge Operations (엣지 인프라 통합 운영 스킬)

이 스킬은 Docker 단일 호스트 환경에서 Nginx, Keycloak, OAuth2-Proxy, Certbot, Fail2ban 및 `edge-controller`를 연계하여 외부 진입점, OIDC 인증, TLS 종단, 무중단 라우팅을 안전하게 운영하기 위한 실전 플레이북입니다.

---

## 1. 엣지 아키텍처 및 신뢰 경계

```mermaid
flowchart TD
    EXT([외부 사용자 / 클라이언트]) -->|HTTPS 443| N[Nginx Ingress]
    
    subgraph Edge_Infra ["Platform Edge Infra (192.168.0.10)"]
        N -->|정적/SSL 검증| CERT[Certbot Let's Encrypt]
        N -->|realm auth_request| OPG[Govail OAuth2-Proxy :4180]
        N -->|realm auth_request| OPA[AirCanvas OAuth2-Proxy :4189]
        OPG -->|OIDC / Authorization Code| KC[Keycloak :8080\nauth.govail.cloud · auth.aircanvas.kr]
        OPA -->|OIDC / Authorization Code| KC
        KC -->|DB Session| PG[(ai-data-infra Postgres)]
        
        EC[edge-controller] -->|Docker Socket| DOCKER[(Docker Engine)]
        EC -->|선언적 생성| GEN_CONF[generated/nginx/*.conf]
        EC -->|SIGHUP| N
        
        F2B[Fail2ban] -->|로그 감시| N
    end
    
    subgraph Upstream_Services ["내부 업스트림 서비스"]
        N -->|edge.auth: public| S_PUB[공개 웹/API]
        N -->|edge.auth: login / admin| S_PRIV[보호 서비스 (Console, DbGate, YCY)]
    end
```

---

## 2. Docker 라벨 선언 규격 (Label Contract)

외식/내부 서비스는 `docker-compose.yml` 라벨 선언을 통해 엣지에 등록됩니다:

```yaml
services:
  my-app:
    image: my-app:latest
    labels:
      edge.enable: "true"
      edge.id: "my-app"
      edge.name: "My Application"
      edge.domain: "app.govail.cloud"
      edge.port: "8080"
      edge.auth: "login" # public | login | admin | app
```

### `edge.auth` 인증 정책 표준
| 정책 | 인증 주체 | 대상 및 보안 수준 | 비고 |
| :--- | :--- | :--- | :--- |
| `public` | 인증 없음 | 랜딩 페이지, Webhook, Certbot challenge | 외부 완전 공개 |
| `login` | OAuth2-Proxy + Keycloak | 일반 사용자 웹 대시보드, MVP 콘솔 | 로그인 성공 세션 필수 |
| `admin` | realm OAuth2-Proxy + 요청별 RBAC | DbGate, 인프라 관측성, 중앙 제어부 | Nginx 내부 `/oauth2/auth?allowed_groups=role%3A...` 검사 |
| `app` | 서비스 자체 토큰 검증 | REST API, SSE/WebSocket 엔드포인트 | Bearer JWT 직접 검증 |

> **Issuer는 랠름별로 다릅니다.** `govail` → `https://auth.govail.cloud/realms/govail`, `aircanvas` → `https://auth.aircanvas.kr/realms/aircanvas`(같은 Keycloak·DB, realm `frontendUrl`로 분리). 서비스·프록시 설정에는 해당 랠름의 Issuer를 글자까지 맞춰 씁니다. 라벨 기반이 아닌 수기 nginx 서비스(예: NS 뉴스룸 `ns.aircanvas.kr`)가 앱 내장 OIDC를 쓸 때는 Keycloak 클라이언트·그룹을 그 앱 저장소의 멱등 동기화 스크립트로 관리합니다(자세한 패턴은 `keycloak` 스킬 §3.1).

> **경고:** 도메인 및 Redirect URI는 반드시 `.env`의 `EDGE_ALLOWED_DOMAIN_SUFFIXES` 허용 목록 검증을 통과해야 합니다.

### 권한 거부 응답

- 인증 세션이 없는 401은 realm OAuth2-Proxy 로그인으로 보냅니다.
- 역할 검사에서 나온 403은 GoVail 또는 AirCanvas realm의 `/access-denied` 안내 페이지로
  이동시킬 수 있습니다. 브라우저 HTML 요청만 이동시키고 API 요청은 HTTP 403을 유지합니다.
- OSS Check처럼 앱 허용 목록도 별도로 검사하는 경우 Nginx 역할 검사와 앱 응답을 구분합니다.
  확인된 루트 문서 경로의 브라우저 403만 안내 페이지로 연결하고 `/api/*` 응답 본문과
  403 상태는 그대로 보존합니다.
- callback 오류, 5xx, DNS/TLS 및 upstream 장애는 권한 부족 페이지로 위장하지 않습니다.
- `/oauth2/auth`의 `upstream sent too big header` 오류는 Nginx가 OAuth2-Proxy의 역할/그룹
  또는 갱신 쿠키 헤더를 담지 못한 경우입니다. 해당 auth location에
  `snippets/oauth2-auth-response-buffers.conf`를 포함해 기본 응답 버퍼보다 크게 잡고,
  상위 설정에서 같은 크기를 상속하는지 확인합니다. 502/500을 403 안내 페이지로 변환하지
  않습니다.

---

## 3. 무중단 릴리즈 및 운영 플레이북 (Zero-Downtime Playbook)

### ① Nginx 무중단 설정 반영
Nginx 설정을 수정하거나 라우트가 추가되었을 때 **절대로 컨테이너를 restart하거나 down하지 않습니다.**

```bash
# platform-edge-infra 디렉터리에서 실행
./scripts/nginx-reload.sh
```

**스크립트 내부 보장:**
1. `docker compose config --quiet`: Compose 구문 검증
2. `docker compose exec -T nginx nginx -t -c /etc/nginx-host/nginx.conf`: Nginx 문법 오류 검사
3. `docker compose exec -T nginx nginx -s reload`: 검증 성공 시에만 프로세스 무중단 reload

### ② 서비스별 독립 수명주기 제어
Keycloak, OAuth2-Proxy 등 특정 컴포넌트만 재배포하거나 설정 반영 시 전체 스택을 내리지 않고 독립 기동합니다:

```bash
./scripts/edge-service-up.sh keycloak
./scripts/edge-service-up.sh oauth2-proxy
```

---

## 4. Certbot SSL 및 TLS 인증서 운영

### 인증서 발급/갱신 사전 점검 (Dry-run)
```bash
# Let's Encrypt 갱신 dry-run
docker compose run --rm certbot certonly --webroot \
  -w /var/www/certbot \
  -d my-app.govail.cloud \
  --dry-run
```

- 웹루트 경로: `/var/www/certbot` (Nginx의 `/.well-known/acme-challenge/`와 공유 볼륨 마운트)
- 인증서 갱신 후 반드시 `./scripts/nginx-reload.sh`를 실행하여 새 인증서를 worker에 로드합니다.

---

## 5. 실전 트러블슈팅 가이드 (Troubleshooting)

### Q1. Nginx가 `host not found in upstream`으로 비정상 종료되는 현상
- **원인:** 정적 `upstream` 블록에 지정된 컨테이너가 중지되어 있거나 네트워크 미연결 상태일 때 발생.
- **해결 (Dynamic Upstream):**
  ```nginx
  resolver 127.0.0.11 valid=30s ipv6=off;
  set $backend_target http://my-service:8080;
  location / {
      proxy_pass $backend_target;
  }
  ```

### Q2. Keycloak / OAuth2-Proxy 무한 Redirect Loop 또는 403 Forbidden
- **점검 순서:**
  1. Keycloak Realm 클라이언트의 **Valid redirect URIs**에 `https://<domain>/oauth2/callback`(앱 내장 OIDC는 앱이 정한 콜백, 예: `/auth/callback`)이 등록되어 있는가? 서비스의 Issuer가 해당 랠름의 Issuer와 같은가(`auth.govail.cloud` vs `auth.aircanvas.kr`)?
  2. OAuth2-Proxy의 Cookie Domain 설정이 요청 도메인의 상위 도메인(`.govail.cloud`)과 일치하는가?
  3. `admin` 라우트의 경우 Nginx auth subrequest가 `allowed_groups=role%3A<role>`을 사용하고, 로그인한 사용자가 해당 역할을 보유하면 2xx, 역할이 없으면 403을 받는가?
  4. 역할 부족 시 브라우저 HTML만 realm 권한 안내 페이지로 가며 API는 403을 유지하는가?
  5. 인증된 요청이 500이면 Nginx error log에서 `upstream sent too big header`를 확인하고,
     해당 `/oauth2/auth` location에 공통 응답 버퍼 snippet이 포함됐는가?
- **거짓 성공 금지:** 401/403 오류를 2xx로 속이거나 임의 우회하지 않고, 정확한 클레임 및 세션 만료 여부를 진단합니다.

### Q3. Fail2ban 차단 확인 및 IP 언밴
```bash
# Nginx 감시 감옥(Jail) 상태 확인
docker compose exec -T fail2ban fail2ban-client status nginx-http-auth

# 오탐지된 IP 수동 차단 해제
docker compose exec -T fail2ban fail2ban-client set nginx-http-auth unbanip <IP_ADDRESS>
```

---

## 6. 완료 검증 체크리스트 (Verification Gate)

- [ ] `docker compose config --quiet` 통과 확인
- [ ] `./scripts/nginx-reload.sh` 정상 수행 (0 Exit Code)
- [ ] 공개 도메인 HTTPS 응답 및 SSL 만료일 확인 (`curl -Iv https://<domain>`)
- [ ] OIDC 보호 라우트 접근 시 `auth.govail.cloud` 로그인 페이지 리다이렉트 확인 (302)
- [ ] 변경 사항이 재실행해도 동일한 결과를 보장하는 Idempotent 상태인가?
- [ ] API 키, 패스워드, Keycloak Client Secret이 Git 또는 로그에 유출되지 않았는가?
