# AirCanvas Kids — Claude Code Guide

작업 시작 시 다음 순서로 컨텍스트를 로드합니다:
1. [`agents/rules.md`](agents/rules.md) (프로젝트 규칙 SSOT)
2. UI 변경 시 `frontend-design` 스킬, 그 외에는 작업에 맞는 도메인 스킬
3. [`agents/skills/`](agents/skills/) (프로젝트 전용 도메인 스킬)

## 빠른 빌드 & 검증
```bash
make check        # 전체 TypeScript 빌드 + cargo check
make dev-phone    # 폰 앱(게임) 개발 서버 (:7101/play/)
make site         # 포털(/) + 게임(/play/) 사이트 루트 조립 (npm run build 선행)
make site-smoke   # 포털·게임·엄빠 연결 스모크 (기본: 공개 URL)
make dev-phone-ssl# 폰 앱 HTTPS 개발 서버 (WebRTC 카메라용)
make dev-tv       # TV 앱 개발 서버 (:7100)
make dev-server   # Rust 릴레이 서버 (:8180)
```

도구 동기화: `make agents-link`
