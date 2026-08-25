# AirCanvas Kids — Claude Code Guide

작업 시작 시 다음 순서로 컨텍스트를 로드합니다:
1. [`agents/rules.md`](agents/rules.md) (프로젝트 규칙 SSOT)
2. [`agents/skills/frontend-design/SKILL.md`](agents/skills/frontend-design/SKILL.md) (UI 디자인 스킬 가이드)
3. [`agents/skills/`](agents/skills/) (프로젝트 전용 도메인 스킬)

## 빠른 빌드 & 검증
```bash
make check        # 전체 TypeScript 빌드 + cargo check
make dev-phone    # 폰 앱 개발 서버 (:5174)
make dev-phone-ssl# 폰 앱 HTTPS 개발 서버 (WebRTC 카메라용)
make dev-tv       # TV 앱 개발 서버 (:5173)
make dev-server   # Rust 릴레이 서버 (:8080)
```

도구 동기화: `make agents-link`
