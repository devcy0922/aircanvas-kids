# 콘텐츠 파이프라인 v0.6 — 패키지 기반 아트워크 및 일러스트 에셋 관리

## 1. 데이터 모델

### 1.1 런타임 아트워크 (TV 전송용)
```ts
interface ArtworkRuntime {
  id: string;
  name: string;
  viewBox: string;
  regions: RegionRuntime[];
  imageUrl?: string; // 투명 외곽선 선화 PNG 경로
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
  thumbnailUrl: string; // 썸네일 이미지 URL (PNG)
  imageUrl?: string;    // 투명 외곽선 선화 PNG URL
  spriteUrl?: string;   // 월드 NPC용 컬러 스프라이트 PNG URL (없으면 영역 색으로 합성)
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
│   ├── images/                   # 투명 배경 외곽선 선화 (PNG, tools/art가 생성)
│   │   ├── dino-trex-line.png
│   │   ├── dino-brachio-line.png
│   │   ├── dino-trike-line.png
│   │   ├── dino-stego-line.png
│   │   └── dino-ptera-line.png
│   ├── thumbnails/               # 256px 컬러 썸네일 (PNG, tools/art가 생성)
│   │   ├── dino-trex.png
│   │   └── ...
│   └── data/                     # 아트워크 데이터 (선택적, 매니페스트에 포함됨)
```

## 3. v0.4 콘텐츠 목록 (주요 9종)

| # | 공룡 (5) | # | 정글 (2) | # | 바다 (2) |
|---|---|---|---|---|---|
| 1 | 티라노사우루스 | 1 | 사자 | 1 | 열대어 |
| 2 | 브라키오사우루스 | 2 | 코끼리 | 2 | 고래 |
| 3 | 스테고사우루스 | | | | |
| 4 | 트리케라톱스 | | | | |
| 5 | 프테라노돈 | | | | |

### 3.1 공룡 도안 생성 파이프라인 (`tools/art`)

색칠 영역(region)을 손으로 쓰지 않는다. 영역·선화·썸네일이 **같은 일러스트에서 나오도록** 생성한다.
손으로 쓴 path와 별도 PNG를 겹치면 서로 어긋나 그림이 망가진다(v0.4.0 문제).

```
tools/art/source/<id>.png   컬러 일러스트 원본 (512×512 RGBA, 서비스 대상 아님)
tools/art/seeds.json        작품별 부위 시드 점(원본 픽셀 좌표) + 한국어 이름, 디테일은 radius로 번짐 제한
        │  python3 tools/art/build_art.py [--only dino-trex] [--debug DIR]
        ▼
content-server/artworks/images/<id>-line.png   외곽선만 남긴 투명 선화 (모든 화면이 multiply로 얹음)
content-server/artworks/thumbnails/<id>.png    컬러 썸네일
content-server/artworks/sprites/<id>.png       384px 컬러 스프라이트 (월드 NPC, 부위 레이어로 구워 쓴다)
content-server/manifest.json                   regions[].path, thumbnailUrl, imageUrl, spriteUrl
packages/tv-art/src/artworks/dino.ts           자동 생성 (직접 수정 금지)
```

- 의존성: `pip install numpy opencv-python-headless` (제작 시에만 필요, 런타임·빌드와 무관)
- 분할: 시드 마커 워터셰드. 어두운 외곽선은 하나로 이어진 수로라 영역이 그 길로 번지므로 얇은 선 픽셀은
  결과에서 버리고 가장 가까운 영역에 배정한다. 원본의 흰 눈·이빨은 투명 구멍이라 작은 구멍(<1500px)은 흰색으로 메운다.
- 새 도안 추가: `source/`에 PNG 추가 → `--debug`로 영역 분할 확인 → `seeds.json`의 시드 보정 → 재생성.
- 결과 확인은 `--debug` 오버레이와 `make ui-smoke` 스크린샷으로 한다. 렌더링 확인 없이 완료하지 않는다.
- 정글·바다 도안은 아직 이 파이프라인이 아닌 수작업 path이다 (후속 과제: 일러스트 PNG 준비 후 동일 적용).
  스프라이트가 없는 도안의 월드 NPC는 영역 색으로 합성한다(`creatureSprite.npcBaseColor`).
- **월드 부위 분할**: 영역 라벨로 머리·꼬리·다리(가까운/먼)·팔·날개·몸통을 정한다(`creatureSprite.partOf`).
  라벨이 애매한 조각(점무늬·발톱)은 가장 가까운 부위를 따른다. 새 도안의 영역 이름은 이 규칙(`꼬리`, `다리`, `날개`, `머리`, `눈` 등)을 따르면 월드에서 부위별로 움직인다.

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

# Nginx가 없는 개발 환경에서는 저장소 루트로 돌아와 CORS 개발 서버 사용
cd ..
python3 tools/content-server.py --host 0.0.0.0 --port 8081 --directory content-server

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
