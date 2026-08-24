# 콘텐츠 파이프라인 v0.2 — 패키지 기반 아트워크 관리

## 1. 데이터 모델

### 1.1 런타임 아트워크 (TV 전송용)
```ts
interface ArtworkRuntime {
  id: string;
  name: string;
  viewBox: string;
  regions: RegionRuntime[];
}

interface RegionRuntime {
  id: string;
  label: string;
  path: string; // SVG path 데이터
}
```

### 1.2 패키지 아트워크 (폰 캐시용)
```ts
interface ArtworkPack {
  id: string;
  name: string;
  viewBox: string;
  regions: RegionPack[];
  thumbnailUrl: string; // 썸네일 이미지 URL
}

interface RegionPack {
  id: string;
  label: string;
  path: string; // SVG path
  zIndex: number; // 렌더링 순서
}
```

### 1.3 테마 팩
```ts
interface ThemePack {
  id: ThemeId; // 'dino' | 'jungle' | 'ocean'
  label: string;
  bgColor: string;
  accentColor: string;
  artworks: ArtworkPack[];
}
```

### 1.4 게임 패키지 매니페스트
```ts
interface GamePackageManifest {
  id: string; // 'aircanvas-kids'
  version: string; // semver
  title: string;
  description: string;
  entryScene: 'home';
  themes: ThemePack[];
  minProtocolVersion: string; // '0.2.0'
  assetsBaseUrl: string; // CDN 베이스 URL
}
```

## 2. 콘텐츠 서버 구조

```
content-server/
├── manifest.json                 # 게임 패키지 매니페스트
├── nginx.conf                    # Nginx 설정
├── artworks/
│   ├── thumbnails/               # 썸네일 이미지 (SVG)
│   │   ├── dino-trex.svg
│   │   ├── dino-brachio.svg
│   │   └── ...
│   └── data/                     # 아트워크 데이터 (선택적, 매니페스트에 포함됨)
```

## 3. v0.2 콘텐츠 목록 (샘플 7종)

| # | 공룡 (3) | # | 정글 (2) | # | 바다 (2) |
|---|---|---|---|---|---|
| 1 | 티라노사우루스 | 1 | 사자 | 1 | 열대어 |
| 2 | 브라키오사우루스 | 2 | 코끼리 | 2 | 고래 |
| 3 | 스테고사우루스 | | | | |

> **전체 30종(공룡/정글/바다 × 10)은 `packages/tv-art/src/artworks/*.ts` 에 정의되어 있으며, 콘텐츠 서버 매니페스트와 동기화되어야 함.**

## 4. 색칠 진행도 판정 알고리즘 (TV 측 GameEngine)

1. 아트워크 로드 시: 각 region 을 오프스크린 캔버스(256×256)에 흑백으로 렌더 → 면적 픽셀 수 `A` 산출
2. 사용자 `fill-region(regionId, color)` 요청 → TV가 해당 region 클립 후 브러시 스탬프 누적
3. 주기적 진행도 집계: 채색 레이어에서 region bbox 스캔 → 채워진 픽셀 수 `p` / `A` = 진행도
4. 전체 진행도 = Σ(p)/Σ(A). 85% 이상이면 "완성" 판정
5. 완성 판정 시:
   - 파티클 버스트(PixiJS) + 스케일 펄스 연출
   - 1.6초 후 해당 테마 월드 씬으로 전환, 아트워크가 제자리에 부유하며 등장
   - 갤러리에는 작품 썸네일(채색 레이어 snapshot)이 누적됨

## 5. 아트워크 추가/수정 방법 (v0.2)

### 5.1 콘텐츠 서버 업데이트 (운영팀)
1. `content-server/manifest.json` 에 새 아트워크/테마 추가
2. `content-server/artworks/thumbnails/{id}.svg` 썸네일 배치
3. 버전 번호 증가 (semver: patch/minor/major)
4. Nginx 리로드: `nginx -s reload`

### 5.2 폰 앱 자동 반영
- 폰 앱 시작 시 `manifest.json` 버전 체크
- 버전 변경 시 변경된 에셋만 증분 다운로드 → IndexedDB 캐시 갱신
- **TV 앱 코드 수정 불필요** (런타임에 아트워크 데이터 수신)

### 5.3 개발 시 로컬 테스트
```bash
# 콘텐츠 서버 로컬 실행
cd content-server
nginx -c nginx.conf -p $(pwd)

# 매니페스트 확인
curl http://localhost:8081/manifest.json
```

## 6. 아트워크 제작 가이드

### 6.1 SVG Path 요구사항
- **닫힌 경로(`Z` 종료)** 필수 — `isPointInFill` 히트테스트용
- `viewBox="0 0 100 100"` 통일 — 좌표계 단순화
- 절대 좌표 명령어(M/L/Q/C/Z)만 사용 — 상대 명령어 지양
- Path 간 겹침은 `zIndex`(렌더링 순서)로 제어

### 6.2 Region 분할 원칙
- `regions[0]` = 가장 큰 영역(몸통 등) → 이후 세부 영역 순
- 색칠 난이도 고려: 영역당 최소 500px² 이상 권장 (진행도 분해능)
- 어린이 가독성: 영역 라벨은 한국어, 직관적 명칭 사용

### 6.3 썸네일 규격
- 200×200 SVG, 투명 배경 또는 연한 회색 배경
- 아트워크 외곽선만 표시 (채색 전 상태)
- 파일명: `{artworkId}.svg`

## 7. 버전 관리 전략

| 변경 유형 | 버전 증가 | 예시 |
|---|---|---|
| 아트워크 추가/수정 | Patch (0.2.0 → 0.2.1) | 새 공룡 1종 추가 |
| 테마 추가/구조 변경 | Minor (0.2.0 → 0.3.0) | '우주' 테마 신설 |
| 프로토콜/스키마 변경 | Major (0.2.0 → 1.0.0) | TVCommand 필드 추가 |

- 폰은 `minProtocolVersion` 체크로 호환성 보장
- 강제 업데이트: 서버 측에서 특정 버전 미만 차단 가능 (추후 구현)

## 8. 배포 체크리스트

- [ ] `manifest.json` JSON 문법 유효성 검사 (`jq empty manifest.json`)
- [ ] 모든 `thumbnailUrl` 파일 존재 확인
- [ ] 썸네일 SVG 렌더링 테스트 (브라우저에서 열기)
- [ ] `assetsBaseUrl` 경로 일치 확인 (절대/상대 경로)
- [ ] 버전 번호 semver 준수
- [ ] Nginx 설정 테스트 (`nginx -t -c nginx.conf`)
- [ ] 폰 앱에서 매니페스트 로드/캐시 테스트