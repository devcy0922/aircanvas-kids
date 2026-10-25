---
name: ops-notifier
version: 1.1.0
description: "사내 비동기 작업 및 파이프라인(engine-cli, engine-process, ycy-mvp, CI/CD 등) 및 AI 에이전트들의 TaskEvent 수신, 텔레그램(Telegram) 단일 메시지 실시간 갱신·알림 및 이메일(Email / Resend 트랜잭션 메일) 발송·관제, 통합 MCP 도구(ops-notifier-hub) 연동 가이드. Trigger on '텔레그램 알림', '이메일 발송', 'ops-notifier', 'TaskEvent', 'send_email', '메일 알림', '작업 알림 발송'."
---

# ops-notifier (Telegram & Email 공통 관제 허브) 연동 가이드

사내 분산 비동기 작업 및 파이프라인(`engine-cli`, `engine-process`, `ycy-mvp`, CI/CD, 주기적 크론 등) 및 AI 에이전트들이 **Telegram 실시간 작업 알림** 및 **Email(Resend 트랜잭션 메일) 발송·관제**를 수행할 때 사용하는 통합 연동 스킬입니다.

개별 레포지토리에 Telegram Bot Token이나 SMTP 인증 정보를 직접 심지 않고, 중앙 `ops-notifier` 허브의 단일 엔드포인트(`POST /v1/events`, `POST /v1/email/send`) 및 MCP 도구를 통해 안전하게 알림을 처리합니다.

---

## 1. 핵심 아키텍처 원칙

1. **단일 진입점 및 시크릿 분리:**
   - HTTP Base URL: `http://ops-notifier.cy-server.internal:8090` (동일 호스트: `http://127.0.0.1:8090`)
   - 생산자(Producer) 레포지토리는 텔레그램 토큰, 채팅방 ID, SMTP API Key를 알 필요가 없습니다.
2. **텔레그램 단일 메시지 실시간 갱신 (Single-Message Lifecycle):**
   - 각 작업(`runId`)마다 메시지를 새로 전송해 채널을 도배하지 않습니다.
   - `task.started` 시 첫 텔레그램 메시지가 발송되며, 이후 `task.progress`, `task.completed`, `task.failed` 이벤트는 동일 메시지를 `editMessageText`로 실시간 수정·갱신합니다.
3. **이메일 멀티 테넌시 및 동적 발신자(`From`) 지원:**
   - Resend 트랜잭션 SMTP 기반으로, 각 레포나 서비스 요청 시 **원하는 발신자(`from`)**를 자유롭게 지정할 수 있습니다. (예: `AirCanvas Kids <kids@aircanvas.kr>`, `AirCanvas Ops <ops@aircanvas.kr>`, `Billing <billing@aircanvas.kr>`)
   - 내장 HTML 템플릿(`task`, `alert`, `notice`) 및 수신 그룹 프리셋(`@ops-team`, `@dev-alert`)을 지원합니다.
4. **Kodak SSD 감사 로깅:**
   - 모든 메일 발송 내역은 `/storage/kodak/ops-notifier/logs/email-audit.jsonl`에 실시간 append 기록되며 Dagu 일일 로테이션과 연동됩니다.
5. **수신 포워딩 구조 (Inbound):**
   - 대표 문의 메일(`ns-help@aircanvas.kr`)은 ImprovMX를 통해 운영자 메일(`devcy0922@gmail.com`)로 1초 내에 실시간 포워딩되며, Gmail 필터를 통해 `ns-aircanvas` 라벨로 자동 분류됩니다.

---

## 2. HTTP API 규격

### A. 이메일 직접 발송 (`POST /v1/email/send`)

```bash
curl -X POST http://ops-notifier.cy-server.internal:8090/v1/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "from": "AirCanvas Kids <kids@aircanvas.kr>",
    "to": "user@example.com",
    "subject": "[AirCanvas] 주간 그림 분석 리포트",
    "template": "task",
    "templateData": {
      "project": "aircanvas-kids",
      "task": "weekly-drawing-analysis",
      "status": "COMPLETED",
      "stage": "ai-vision",
      "summary": "어린이 그림 AI 감정 및 창의성 분석 리포트 생성이 완료되었습니다.",
      "links": {
        "report": "https://aircanvas.kr/reports/123"
      }
    }
  }'
```

- **주요 필드:**
  - `to`: 수신 이메일 주소 (단일, 배열, 콤마 구분 또는 `@ops-team` 같은 그룹 키)
  - `from`: (선택) 표시할 발신자 명의/주소 (미지정 시 기본 ops 발신자)
  - `subject`: 메일 제목
  - `template`: `"task"` (작업 카드) | `"alert"` (긴급 경보) | `"notice"` (공지사항)
  - `templateData`: 템플릿에 바인딩할 데이터 (`project`, `task`, `status`, `stage`, `summary`, `links` 등)
  - `text` / `html`: 템플릿 대신 커스텀 텍스트/HTML 전송 시 사용

---

### B. TaskEvent 규격 (`POST /v1/events`)

Telegram 단일 메시지 갱신과 동시에 이메일 통보가 필요한 경우:

```typescript
export interface TaskEvent {
  runId: string;            // [필수] 작업 실행 고유 식별자 (예: "ycy-mvp-15-deploy-001")
  source: string;           // [필수] 발신처 시스템 ("ycy-mvp" | "engine-cli" | "github" | "cron")
  project: string;          // [필수] 프로젝트/레포 이름
  type:                     // [필수] 이벤트 단계
    | "task.started"        // ⏳ 시작
    | "task.progress"       // ⏳ 진행 (퍼센트 및 경과시간 갱신)
    | "task.completed"      // ✅ 완료
    | "task.failed";        // ❌ 실패
  task: string;             // [필수] 작업 명칭
  
  stage?: string;           // 세부 단계
  summary?: string;         // 진행/결과 요약
  progress?: number;        // 진행률 (0 ~ 100)
  
  targetEmail?: string | string[]; // 이메일 동시 수신자 지정
  notifyEmail?: boolean;           // true 시 프로젝트 기본 이메일 그룹으로 동시 발송
  
  links?: {                 // 인라인 링크 버튼
    logs?: string;
    github?: string;
    demo?: string;
  };
}
```

---

## 3. MCP (Model Context Protocol) 연동

AI 에이전트(Claude Desktop, Antigravity, Gemini 등)는 `ops-notifier-hub` MCP 서버를 통해 별도 HTTP 호출 없이 도구로 바로 알림을 전송할 수 있습니다.

### MCP 서버 설정 (`claude_desktop_config.json` 등)
```json
{
  "mcpServers": {
    "ops-notifier": {
      "command": "node",
      "args": ["/srv/internal/ops-notifier/bin/ops-notifier-mcp.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 제공되는 MCP 도구 목록
| 영역 | 도구명 | 설명 |
| :--- | :--- | :--- |
| **Telegram** | `send_telegram_notification` | 텔레그램 메시지 발송 (`runId` 지정 시 단일 메시지 수정 가능) |
| | `update_telegram_notification` | 기존 메시지를 제자리에서 실시간 수정 (`editMessageText`) |
| | `get_telegram_observability` | 특정 runId 상태 및 최근 발송 이력 조회 |
| | `list_telegram_bots` | 발송 가능한 봇 목록 조회 |
| | `list_telegram_channels` | 발송 가능한 채널/그룹 목록 조회 |
| **Email** | `send_email` | 이메일 발송 (`to`, `subject`, `from`, `template`, `templateData` 등) |
| | `list_email_transports` | 등록된 SMTP 전송 계정 풀 목록 조회 |
| | `list_email_groups` | 등록된 수신 그룹 프리셋(`@ops-team` 등) 목록 조회 |
| | `get_email_history` | 최근 이메일 발송 이력 및 DB 기록 조회 |
| | `verify_email_connection` | SMTP 서버 연결 상태 점검 |

---

## 4. 생산자 레포지토리 연동 예시 (TypeScript)

```typescript
// utils/notifier.ts
const NOTIFIER_URL = process.env.OPS_NOTIFIER_URL || "http://ops-notifier.cy-server.internal:8090";

export async function sendOpsEmail(options: {
  to: string | string[];
  from?: string;
  subject: string;
  summary: string;
  template?: "task" | "alert" | "notice";
}) {
  try {
    await fetch(`${NOTIFIER_URL}/v1/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: options.from || "AirCanvas Ops <ops@aircanvas.kr>",
        to: options.to,
        subject: options.subject,
        template: options.template || "notice",
        templateData: {
          summary: options.summary,
        },
      }),
    });
  } catch (err) {
    console.warn("[notifier] 이메일 발송 요청 실패 (Best-effort):", err);
  }
}
```
