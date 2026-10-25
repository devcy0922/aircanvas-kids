---
name: skm-usage
version: 1.5.0
description: "Skills Market의 skm CLI 설치, 탭 완성, 스킬 설치/업데이트, .skmrc 구성, 외부 스킬 2단계 import, Agents SSOT 동기화 및 트러블슈팅을 안내하는 운영 가이드"
---

# Skills Market 사용 가이드 (`skm-usage`)

## 1. 언제 활성화하는가

- `skm` CLI를 처음 설치하거나 다른 레포지토리에서 사용하는 경우
- 스킬을 `agents/skills/`, `.codex/skills/`, `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`에 설치하거나 업데이트하는 경우
- 레포지토리에 `.skmrc` 설정을 구성하거나 타겟/레지스트리를 변경하는 경우
- `skm info`, `add`, `status`, `update`, `fleet`, `set`, `load`, `sync`, `check`, `import`, `completion` 명령어를 사용하는 경우
- 스킬 갱신 시 버전 불일치나 캐시 문제 등 트러블슈팅이 필요한 경우
- 외부 오픈소스(GitHub 등) 스킬을 안전하게 2단계(다운로드 -> 확인 -> 레포 추가)로 가져오는 경우
- 실무 레포의 스킬을 `skm publish` 또는 `skm pack`으로 공용 마켓 및 OCI 레지스트리에 등록하는 경우
- `skills-market` 레포 자체의 `internal/`, `skills/`, `packages/`, `vendor/` 구조를 수정하는 경우

## 2. 핵심 구조

- `internal/`: 사내 자체 개발 특성 스킬 원본 (SSOT)
- `vendor/`: 외부 OSS 스킬 업스트림 정의 및 캐시 (`vendor/cache/`)
- `skills/`: 배포용으로 최종 취합된 스킬 카탈로그 (배포 SSOT)
- `packages/`: `@` 접두사를 사용하는 스킬 번들 묶음 정의 (JSON)
- `bin/skm`: 서버 어디서든 실행 가능한 글로벌 CLI 엔트리포인트
- `scripts/`:
  - `completion.bash`: 초경량 탭 자동완성 스크립트 (1ms 미만 응답, 무외부 프로세스)
  - `sync.sh`: `internal/`과 `vendor/`를 `skills/`로 동기화
  - `validate.mjs`: `SKILL.md` frontmatter 규격 점검기
  - `test-cli.sh`: CLI 종합 테스트 스위트

> **원칙**: 새 사내 스킬은 먼저 `internal/<name>/SKILL.md`와 `skill.yml`에 작성한 뒤 `make sync`를 실행한다. `skills/` 디렉터리만 직접 수정하지 않는다.

## 3. 최초 설치 및 탭 자동완성

```bash
cd /srv/company/strategy/skills-market
make install
```

- `~/.local/bin/skm`에 CLI 심링크가 등록되어 어느 디렉토리에서든 `skm`을 실행할 수 있습니다.
- `~/.local/share/bash-completion/completions/skm`에 탭 자동완성이 자동 설치됩니다.
- 새 터미널을 열거나 `source ~/.local/share/bash-completion/completions/skm`을 실행하면 즉시 탭 자동완성이 활성화됩니다.
- **초경량 탭 자동완성**: 외부 무거운 런타임(Node.js/Python) 호출 없이 순수 Bash 내장 기능으로 동작하여 1ms 미만의 빠른 응답 속도를 보장합니다.

## 4. 다른 레포에서 스킬 사용 및 타겟 설정

```bash
cd /path/to/project

# 1) 스킬 목록 확인 및 초경량 탭 완성
skm list
skm info docker-deploy       # 설치 전 상세 정보와 SKILL.md 본문 앞부분 미리보기
skm info @cloud-native       # 패키지 설명 및 포함 스킬 요약
skm add <TAB>          # 사용 가능한 스킬 및 @패키지 목록 즉시 제안
skm add d<TAB>         # docker-deploy, design-system 등 자동완성
skm add @<TAB>         # @cloud-native, @cy-infra 등 패키지 완성

# 2) 스킬 및 패키지 설치
skm add docker-deploy
skm add @cloud-native

# 3) 글로벌(전역) 설치 (-g, --global)
skm add -g @cy-infra
```

### 글로벌 설치 대상 (`skm add -g`)

홈 디렉터리에 **이미 존재하는** 에이전트 폴더에만 배포합니다 (하나도 없으면 `~/.agents/skills`, `~/.cursor/skills` 생성).

| 에이전트 | 글로벌 스킬 경로 |
|---|---|
| Claude | `~/.claude/skills` |
| Codex | `~/.codex/skills` |
| Gemini (agy/Antigravity) | `~/.gemini/config/skills` |
| Cursor | `~/.cursor/skills` |
| 공용 | `~/.agents/skills` |

- **Gemini(agy/Antigravity) 프로젝트 로컬**: 스킬은 `.agents/skills/`, 규칙은 `.agents/rules/*.md`(또는 루트 `GEMINI.md`/`AGENTS.md`)에서 읽습니다. `.gemini/skills`는 읽지 않으므로 `skm set gemini`도 `.agents/skills`를 가리킵니다.
- OpenCode(`.opencode`)는 지원 대상에서 제외되었습니다.
- **`skm update -g`**: 이미 각 에이전트 폴더에 설치된 스킬만 **그 폴더 안에서 제자리 갱신**합니다. 다른 에이전트 폴더로 전파하거나 새로 설치하지 않습니다. 스킬명을 지정했는데 어디에도 없으면 신규 설치합니다.
- 로컬 모드는 `.cursor`, `.claude`, `.agents`, `.codex` 중 존재하는 폴더를 자동 감지합니다. `skm set claude|codex|cursor|agents`로 고정할 수도 있습니다.

### 설치 전 미리보기 (`skm info`)

`skm info <스킬명>`은 설치나 동기화 없이 버전, 설명, 출처, 파일 목록과 `SKILL.md` 본문 앞부분을 보여줍니다. `@패키지명`을 지정하면 패키지 설명과 포함 스킬별 버전을 요약합니다.

### 레포 설정 파일 (`.skmrc`) 및 타겟 지정 (`skm set`)

`.skmrc`는 해당 프로젝트 레포의 스킬 배포 SSOT 경로와 OCI 레지스트리 동작을 정의하는 JSON 설정 파일입니다.

```json
{
  "target": "agents",
  "registry": "db-server:5010",
  "insecure": false
}
```

#### 설정 필드 설명
- **`target`**: 스킬이 설치되는 SSOT 기준 디렉터리입니다.
  - `"agents"` (권장): 사내 표준 SSOT 모드로 `agents/skills/`에 원본을 설치하고 `skm sync`를 통해 `.agents/`, `.cursor/`, `.claude/`, `.codex/`로 자동 투영합니다.
  - `"cursor"`: `.cursor/skills/`에 직접 설치
  - `"claude"`: `.claude/skills/`에 직접 설치
  - `"codex"`: `.codex/skills/`에 직접 설치
- **`registry`**: 스킬 아티팩트를 pull/push할 OCI 레지스트리 주소입니다. (기본값: `db-server:5010`)
  - `"none"` 또는 `"local"`: 원격 OCI 레지스트리를 비활성화하고 로컬 마켓 카탈로그(`$SKILLS_MARKET_ROOT/skills`)만 직접 사용합니다.
- **`insecure`**: HTTP(비보안) 연결 허용 여부 (`true` / `false`)

#### 설정 명령어 예시
```bash
# 실무 프로젝트 디렉토리에서 실행
skm set agents                      # 타겟을 사내 표준 SSOT (agents/)로 설정
skm set registry db-server:5010     # OCI 레지스트리 주소 지정
skm set registry none               # 레지스트리 비활성화 (로컬 마켓 전용 모드)
```

- **`.gitignore` 자동 보호**: `skm set` 또는 `skm sync` 실행 시 에이전트 도구별 투영 디렉터리(`.agents/`, `.claude/`, `.cursor/`, `.codex/`)와 투영 파일(`.github/copilot-instructions.md`)이 `.gitignore`에 등록되어 있는지 검사하고 누락된 항목을 자동 추가합니다.
- **기존 Git 추적 캐시 자동 해제**: 이미 Git으로 트래킹 중이던 투영 디렉터리가 발견되면, 실제 작업 파일은 보존한 채 Git 인덱스에서 `git rm -r --cached`로 자동 제외하여 커밋 충돌을 방지합니다.
- 원본 SSOT인 `agents/`는 Git 추적을 유지하고, 자동 생성되는 투영 산출물만 안전하게 커밋에서 제외됩니다.

## 5. 외부 스킬 2단계 분리 가져오기 (`skm import`)

외부 오픈소스(GitHub 등)의 검증된 스킬을 다운로드하여 마켓에 등록하고, 현재 프로젝트에 안전하게 추가합니다.

```bash
# 1) 특정 스킬 지정하여 가져오기
skm import antfu/skills:vitest
skm import https://github.com/anthropics/skills frontend-design

# 2) 레포지토리 전체 스킬 탐색 및 선택 다운로드
skm import antfu/skills

# 3) skm add 에 외부 URL/레포를 입력해도 동일하게 1단계 다운로드 후 질의 진행
skm add antfu/skills:vitest
```

### 1, 2단계 분리 워크플로우 (중요)
1. **1단계 (외부 스킬 다운로드)**: 외부 저장소를 클론하여 마켓 카탈로그(`skills/<스킬명>/`) 및 `vendor/cache/`에 안전하게 배치합니다. **이 시점에서는 현재 프로젝트에 절대 자동으로 추가되지 않습니다.**
2. **2단계 (레포 add 질의 및 승인)**:
   ```text
   👉 다운로드한 스킬 '<스킬명>'을(를) 현재 레포(/path/to/project)에 설치(add)하시겠습니까? [y/N]: 
   ```
   - `y` 승인 시: 2단계로 진행되어 현재 레포에 `skm add <스킬명>` 실행.
   - `n` 거절 시: 마켓에만 다운로드된 상태로 보관되며 현재 레포는 변경되지 않음.
   - CI/자동화 환경용 `-y` / `--yes` 옵션 지원.

## 6. 사내 표준 Agents SSOT 환경 구축 및 동기화

`agents/`의 규칙과 스킬을 각 도구별 네이티브 디렉터리로 전파하는 파이프라인을 구축합니다.

```bash
# 1) Agents SSOT 환경 일괄 세팅
skm load agents-ssot

# 2) 규칙이나 스킬 변경 후 각 에이전트로 즉시 전파
skm sync

# 3) rules.md 및 스킬 frontmatter 규격 검사
skm check
```

- `load agents-ssot`는 `agents/rules.md`를 보존/생성하고, `agents/scripts/sync-agent-assets.sh`를 설치하며, `.skmrc`와 `.gitignore`를 자동 구성합니다.
- `skm sync` 실행 시 `.cursor`, `.claude`, `.codex`, `.agents` 네이티브 경로로 스킬이 투영되고, 규칙은 도구별 파일(`.claude/CLAUDE.md`, `.codex/AGENTS.md`, `.agents/rules/project-rules.md`, `.cursor/rules/project-rules.mdc`)로 투영됩니다.

## 7. 스킬 버전 관리 및 최신화 (`skm update`)

```bash
# 설치된 스킬의 버전 및 최신 마켓 업데이트 여부 확인
skm status

# 스킬 최신 버전으로 갱신
skm update docker-deploy
skm update                    # 현재 레포의 모든 스킬 일괄 갱신
skm update -g                 # 전역(홈 디렉터리) 스킬 일괄 갱신

# 실무 레포 스킬을 마켓으로 발행 (SemVer 자동 bump 및 OCI 레지스트리 push)
skm publish my-custom-skill
skm publish --bump minor my-custom-skill

# 여러 스킬을 번들 패키지로 묶기
skm pack @my-kit skill-a skill-b
```

### `skm update`의 버전 선택 메커니즘
- `skm update`는 OCI 레지스트리(`db-server:5010`)의 `latest` 이미지와 로컬 마켓 카탈로그(`$SKILLS_MARKET_ROOT/skills/`)를 모두 확인합니다.
- **SemVer 비교 안전장치**: 두 소스 중 **더 높은 버전**을 자동으로 판별하여 배포합니다. 레지스트리가 아직 이전 버전에 머물러 있어도 로컬 마켓의 최신 버전을 덮어쓰지 않고 최신 버전을 안전하게 유지합니다.
- 갱신이 완료되면 `SSOT 모드(target: agents)`에서는 즉시 `skm sync`를 트리거하여 `.agents/`, `.cursor/`, `.claude/`, `.codex/` 등 모든 에이전트 폴더에 최신 스킬이 일괄 동기화됩니다.

## 7-1. 구독 레포 일괄 관리 (`skm fleet`)

레포마다 `skm update`를 돌리다 깜빡하면 일부 레포가 과거 스킬을 쓰게 됩니다. `/srv` 아래에서 스킬을 설치한 레포를 찾아 마켓 최신과 비교하고, 뒤처진 레포를 한 번에 갱신합니다. 어느 디렉터리에서 실행해도 됩니다.

```bash
skm fleet list                  # 레포 × 스킬 × 설치/최신 버전 현황 (읽기 전용)
skm fleet list --outdated       # 뒤처진 항목만
skm fleet scan                  # 현황을 ~/.skm/fleet.json 에 저장
skm fleet sync                  # dry-run: 갱신 예정/건너뜀만 출력 (기본)
skm fleet sync --apply          # 실제 반영 (각 레포에서 뒤처진 스킬만 skm update)
skm fleet sync --apply --repo works/ --skill skm-usage,govail-gateway
skm fleet sync --apply --allow-major   # major 버전 변경도 허용
skm fleet sync --apply --idle-days 21  # 3주 넘게 조용한 레포만
```

- 스캔 루트 기본값은 `/srv` (`--root DIR` 또는 `SKM_FLEET_ROOT`로 변경). 마켓 레포 자신은 제외합니다.
- **건너뛰는 경우**: major 변경(`--allow-major` 필요), 설치본이 마켓보다 최신인 경우(미발행 로컬 변경 가능), 마켓에 없는 로컬 전용 스킬.
- 적용 후 실제로 버전이 올라갔는지 재검증하고, 결과를 `~/.skm/fleet-sync.log`에 남깁니다. 실패가 있으면 종료 코드 1을 반환합니다. 꺼져 있던 레포는 다음 실행에서 따라잡습니다.
- **제자리 갱신**: `skm update`/`skm sync`를 호출하지 않고, 스킬이 이미 설치된 위치(`agents/skills`, `.claude/skills` 등)의 해당 스킬 폴더만 교체합니다. 심볼릭 링크는 실경로로 풀어 한 번만 갱신하며, `rules.md`·`.gitignore`·git 인덱스·새 디렉터리는 건드리지 않습니다.
- **주의**: 설치된 스킬 폴더를 통째로 덮어쓰므로 레포에서 직접 수정한 스킬은 보존되지 않습니다. `agents/skills`가 git에 추적되는 레포에서는 갱신분이 미커밋 수정으로 보이니 각 레포에서 커밋 여부를 판단하세요.
- **활동 중이 아닌 레포만**: `--idle-days N`은 마지막 커밋과 수정 중인 추적 파일이 모두 N일 넘게 조용한 레포만 대상으로 합니다(git 저장소가 아니거나 커밋 이력이 없으면 제외).

### 발행과 동시에 구독 레포 최신화 (`skm publish`)
```bash
skm publish --bump minor my-skill           # 발행 후 구독 레포를 자동으로 최신화 (뒤처진 스킬만, major 변경은 건너뜀)
skm publish --push --bump patch my-skill     # + 마스터 저장소에 이 스킬 경로(internal/, skills/)만 커밋/푸시
skm publish --no-fleet my-skill              # 구독 레포 최신화 생략 (SKM_FLEET_AUTO=0 도 동일)
```
- `--push`는 기본 꺼짐입니다. 마스터에서 해당 스킬 경로 외의 변경은 커밋하지 않습니다.
- `skm fleet list`는 순수 bash 로 버전을 읽어 `/srv` 전체(약 350개 스킬)를 1초 미만에 확인합니다.

### 구독 레포 커밋 규칙 (`fleet sync`가 만드는 커밋)
일부 레포는 배포 사전 점검이 깨끗한 작업 트리를 요구하므로, `fleet sync --apply`는 갱신 후 **git에 이미 추적 중인 스킬 경로만** 커밋합니다. 푸시는 하지 않습니다.

- **커밋 제목은 항상 같은 형식**입니다: `fleet: skill update <스킬명> v<버전>[, ...]` (5개 이상이면 `외 N개`). 본문에 자동 생성 안내와 경로 목록이 있고, 트레일러 `Skm-Fleet: sync`가 붙습니다. 다른 AI/세션은 이 커밋을 스킬 파일만 바꾼 자동 커밋으로 보고 넘어가면 됩니다. 찾기: `git log --grep='^fleet: skill update'`.
- **커밋하지 않는 경우**: 스테이징된 변경이 있는 위치, 사용자가 직접 고쳐 마켓과 내용이 다른 위치(덮어쓰지도 않음), HEAD에 없는 새 untracked 폴더, 서드파티 클론(`/srv/opensource`, `SKM_FLEET_EXCLUDE`로 변경).
- **레포 정책으로 커밋이 거부되면**(예: main 커밋마다 version 증가를 요구하는 게이트) 스테이징을 풀고 작업 트리 변경만 남깁니다. 레포마다 정책이 달라 맞추지 않으며, 알림은 같은 실패에 대해 한 번만 갑니다.
- 이미 반영됐지만 미커밋인 변경은 `skm fleet commit --apply`로 정리합니다 (마켓과 내용이 완전히 같은 경우만).
- 커밋을 원치 않으면 `skm fleet sync --apply --no-commit`.

### 정기 실행 (systemd 사용자 타이머)
`scripts/systemd/skm-fleet-sync.{service,timer}`가 1시간마다 `skm fleet sync --apply`를 실행합니다. 설치: `scripts/fleet-sync-timer.sh`를 `~/.local/bin/skm-fleet-sync-timer`로 링크하고 유닛을 `~/.config/systemd/user/`에 복사한 뒤 `systemctl --user enable --now skm-fleet-sync.timer`. 갱신이 일어났거나 실패했을 때만 ops-notifier로 알리고, 같은 실패는 한 번만 알립니다. 끄기: `systemctl --user disable --now skm-fleet-sync.timer`.

## 8. 스킬 업데이트 트러블슈팅 (FAQ)

### Q1. `skm status`에는 업데이트 가능(▲)으로 뜨는데, `skm update`를 실행해도 버전이 올라가지 않아요.
- **원인**:
  1. **레지스트리 버전 역전**: OCI 레지스트리(`db-server:5010`)에 새 버전이 `publish`되지 않아 레지스트리의 `latest` 태그가 구버전을 가리키고 있을 때 발생할 수 있습니다.
  2. **`.skmrc` 부재 또는 타겟 불일치**: 프로젝트에 `.skmrc`가 없어 `agents/` 원본 대신 엉뚱한 경로로 배포되었거나 투영 경로와 꼬인 경우입니다.
- **해결 방법**:
  1. **타겟 확정**: 프로젝트 루트에서 `skm set agents`를 실행하여 `.skmrc`를 생성하고 `agents/skills`를 SSOT 타겟으로 고정합니다.
  2. **로컬 마켓 직접 동기화**: 만약 레지스트리 push가 지연된 경우, `.skmrc`에 `"registry": "none"`을 설정하거나 `skm update` 최신 CLI(v1.5.0+)를 사용하면 로컬 마켓 카탈로그의 최신 버전을 우선 적용합니다.
  3. **레지스트리 발행**: 스킬 원본을 수정한 경우 마켓 루트나 레포에서 `skm publish <스킬명>`을 실행하여 중앙 OCI 레지스트리에도 최신 버전 태그와 `latest`를 함께 push합니다.

### Q2. 스킬 파일을 직접 수정했는데 `skm status`에서 반영되지 않아요.
- 사내 표준 레포에서는 항상 `agents/skills/<스킬명>/` 안의 파일과 `skill.yml`의 `version`을 수정한 뒤 `skm sync`를 실행해야 각 도구(`.agents/`, `.cursor/` 등)로 전파됩니다.

## 9. 변경 시 검증 절차

```bash
make sync        # internal + vendor -> skills 배포 SSOT 동기화
make validate    # 전체 SKILL.md 규격 유효성 검사
make test        # 22개 종합 CLI 테스트 스위트 실행
make install     # CLI 및 최신 completion 배포
```
