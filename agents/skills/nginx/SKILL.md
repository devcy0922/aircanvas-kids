---
name: nginx
description: Platform Edge Nginx 리버스 프록시, 도메인 라우팅, SSL/Certbot, 설정 문법 검증 및 무중단 Graceful Reload 운영 스킬
---

# Nginx 엣지 프록시 운영 스킬 (nginx)

이 스킬은 `platform-edge-infra` 환경에서 Nginx 리버스 프록시, 가상 호스트(vhost), 도메인 라우팅, SSL/TLS 인증서 및 보안 헤더를 안전하게 변경·검증·운영하기 위한 표준 지침입니다.

---

## 1. 핵심 불변 원칙: 무중단 Graceful Reload

Nginx 설정 변경 시 **절대로 컨테이너를 직접 재시작(`restart`), 종료(`down`), 또는 스택 전체 빌드(`up -d --build`)하지 않습니다.**
설정 오류가 포함된 채로 컨테이너를 재시작하면 서비스 전체 장애가 발생합니다.

### 표준 리로드 절차 (`scripts/nginx-reload.sh`)

모든 Nginx 설정 변경 후에는 아래 전용 스크립트로 검증과 리로드를 수행합니다:

```bash
# platform-edge-infra 디렉터리에서 실행
./scripts/nginx-reload.sh
```

**내부 검증 단계:**
1. `docker compose config --quiet`: 환경변수 및 Compose interpolation 검증
2. `docker compose exec -T nginx nginx -t -c /etc/nginx-host/nginx.conf`: Nginx 설정 문법 및 include 파일 유효성 검사
3. `docker compose exec -T nginx nginx -s reload`: 기존 worker를 유지한 채 무중단(graceful) 프로세스 리로드

> 검증이 실패하면 reload를 수행하지 않으므로 기존 정상 라우팅과 트래픽 처리가 안전하게 유지됩니다.

---

## 2. 디렉터리 구조 및 설정 분리

```text
platform-edge-infra/
├── nginx/
│   ├── nginx.conf                 # Nginx 메인 설정
│   └── config/                    # 공통 프록시 파라미터, SSL 옵션, 템플릿
├── generated/
│   └── nginx/                     # edge-controller가 자동 생성한 도메인별 *.conf
└── scripts/
    └── nginx-reload.sh            # 무중단 검증 & 리로드 스크립트
```

* 컨테이너 내부 셸에서 직접 설정을 편집하지 않고, 호스트의 소스 파일을 수정한 뒤 반영합니다.

---

## 3. 서비스 연동 및 Docker 라벨 표준

외부에 노출할 서비스 컨테이너는 `docker-compose.yml`에 다음과 같은 라벨을 선언합니다:

```yaml
services:
  my-service:
    image: my-service:latest
    labels:
      edge.enable: "true"
      edge.id: "my-service"
      edge.name: "서비스 이름"
      edge.domain: "service.govail.cloud"
      edge.port: "8080"
      edge.auth: "login" # public | login | admin | app
```

* **`edge.auth` 정책:**
  - `public`: 인증 없이 공개 노출
  - `login`: Keycloak 일반 사용자 SSO 로그인 필수
  - `admin`: 관리자 권한(`master-admin` 등) 전용 보호 라우트
  - `app`: 애플리케이션 자체 Native JWT/OIDC 검증

## 권한 거부 안내

관리자 역할 검사는 Nginx `auth_request`에서 유지합니다. 역할이 부족한 HTML 문서 요청은
realm 안내 페이지로 리다이렉트하고 API 요청은 HTTP 403을 반환합니다. 정적 처리기는
`nginx/config/snippets/authorization-denied-*-server.conf`와 `*-location.conf`를 사용하고,
페이지 원본은 `nginx/config/pages/`에 둡니다. `/access-denied`는 공개 정적 경로여야 하며
추가 인증을 걸지 않습니다. upstream 403은 확인된 인가 응답에 한해서만 HTML 요청을
안내 페이지로 연결하고 API는 403과 upstream 응답 본문을 유지합니다. 앱 자체 403을 가로챌
때는 루트 HTML 등 범위를 확인한 location에만 `proxy_intercept_errors on`을 둡니다. OSS
Check처럼 API도 같은 앱 허용 목록 검사를 받는 경우 `/api/*` location에는 이를 적용하지
않습니다. 401 로그인, callback 오류, 5xx/upstream 장애 처리는 권한 안내와 섞지 않습니다.

---

## 4. 보안 및 신뢰 경계

1. **도메인 Allowlist 검증**:
   - 도메인은 `EDGE_ALLOWED_DOMAIN_SUFFIXES`에 등록된 검증된 도메인만 허용합니다.
   - 외부 사용자 입력값을 Nginx directive 문자열에 직접 삽입하지 않습니다.
2. **표준 프록시 헤더 설정**:
   - `Host $host`
   - `X-Real-IP $remote_addr`
   - `X-Forwarded-For $proxy_add_x_forwarded_for`
   - `X-Forwarded-Proto $scheme`
   - WebSocket 지원 시 `Upgrade $http_upgrade`, `Connection $connection_upgrade`
3. **SSL/TLS 및 Certbot**:
   - Let's Encrypt를 통한 자동 갱신 및 무중단 적용.
   - HTTP(80) 요청은 상시 HTTPS(443) 301 Permanent Redirect 처리.
4. **장애 격리 및 Dynamic Upstream 방어 (중요)**:
   - `upstream { server container:port; }`와 같이 Docker 컨테이너명을 정적 upstream 블록에 선언하면, 해당 컨테이너가 중지되어 있을 때 Nginx가 `[emerg] host not found in upstream` 오류와 함께 전체 종료됩니다.
   - **표준 방어 패턴:** 동적 컨테이너 프록시 시에는 반드시 Docker 내장 DNS resolver와 변수를 활용하여 런타임에 지연 해석하도록 구성합니다:
     ```nginx
     resolver 127.0.0.11 valid=30s ipv6=off;
     set $target_backend http://my-container:8080;
     location /api/ {
         proxy_pass $target_backend;
     }
     ```
   - 또는 상시 연결이 보장되는 `host.docker.internal:<port>`를 사용합니다.

---

## 5. 데모 프로젝트 빌드 집합체 라우팅 규격 (`moru.my/prj/`)

`/srv/demo` 하위의 데모 및 PoC 프로젝트들은 `moru.my` 도메인을 통해 통합 서빙됩니다.

### 5.1 볼륨 마운트 구조
* **호스트 소스:** `/srv/demo`
* **Nginx 내부 경로:** `/var/www/demo:ro`

### 5.2 라우팅 규칙 및 우선순위
1. **공통 빌드 아웃풋 (`/srv/demo/_dist/<name>/`)**:
   - `https://moru.my/prj/_dist/<name>/`
2. **개별 데모 정적 빌드물 직접 서빙**:
   - `https://moru.my/prj/meetup/` -> `/var/www/demo/meetup/dist/`
   - `https://moru.my/prj/works-agent/` -> `/var/www/demo/works-agent-demo/`
3. **SPA 절대 경로 에셋 대응 (권장: 와일드카드 서브도메인)**:
   - Vite/Webpack SPA 빌드물이 `/assets/...` 절대 경로를 참조하는 경우, 기존 `*.moru.my` 와일드카드 SSL 인증서를 활용하여 `<name>.moru.my` 독립 vhost를 함께 지원합니다.

## 6. 배포 전 구조 검증

Nginx 설정의 배포 원본은 Git의 정적 텍스트 설정과 `edge-controller`의 서비스 라벨·승인
상태입니다. YAML은 배포 입력이 아니라 배포 전 검토용 파생 산출물입니다.

```bash
make nginx-predeploy
```

`make nginx-predeploy`는 다음 순서로 실행합니다.

1. `docker compose config --quiet`
2. 실행 중 Nginx 컨테이너의 `nginx -t`
3. `nginx -T` effective config 및 generated route staging
4. Crossplane 0.5.8 parse → JSON/YAML inventory
5. Crossplane build → AST round-trip 비교

결과는 `.artifacts/nginx-predeploy/`에 기록하며 reload는 수행하지 않습니다. 인증서 key
관련 directive는 저장되는 inventory에서 제외하고, 전체 AST 비교는 메모리 내에서만 수행합니다.
검증 결과 확인과 운영 승인을 마친 뒤 기존 `make nginx-reload`로 graceful reload합니다.
