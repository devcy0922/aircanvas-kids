# 콘텐츠 파이프라인 v0.7 — YAML 원본 기반 테마·아트워크 관리

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
  id: ThemeId;          // string. content-src/themes/<id>/ 폴더 이름
  label: string;
  bgColor: string;
  accentColor: string;
  emoji?: string;       // 테마 칩 아이콘
  tagline?: string;     // 부제
  world?: WorldPack;    // 월드 장면·등장 연출·터치 이모지 (§3.2)
  artworks: ArtworkPack[];
}
```
`ArtworkPack`에는 `behavior?: BehaviorPack`(월드 행동 값, 빌드 때 프리셋이 펼쳐져 들어감)이 추가됐다.

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

### 3.1 콘텐츠 원본과 빌드 (`content-src/`, `tools/art`)

색칠 영역(region)을 손으로 쓰지 않는다. 영역·선화·썸네일이 **같은 일러스트에서 나오도록** 생성한다
(손으로 쓴 path와 별도 PNG를 겹치면 서로 어긋나 그림이 망가진다 — v0.4.0 문제).

```
content-src/
├── behaviors.yml                    월드 행동 프리셋(trex, flyer, swimmer ...). 값 표는 파일 머리 주석
└── themes/
    ├── _template/theme.yml          새 테마 견본 (`_`로 시작하는 폴더는 빌드가 무시)
    └── <테마id>/
        ├── theme.yml                라벨·이모지·색·world(장면/등장 연출/터치 이모지)
        ├── <작품id>.yml             이름·행동·출처·부위 시드(또는 손으로 쓴 regions)
        └── <작품id>.png             512×512 RGBA 일러스트 원본 (서비스 대상 아님)
        │  python3 tools/art/build_content.py [--check] [--only 작품id] [--debug DIR]
        ▼
content-server/manifest.json                    themes[].world, artworks[].behavior 포함 (version 등 최상위 값은 보존)
content-server/artworks/images/<id>-line.png    외곽선 선화 (모든 화면이 multiply로 얹음)
content-server/artworks/thumbnails/<id>.png     256px 컬러 썸네일
content-server/artworks/sprites/<id>.png        384px 컬러 스프라이트 (월드 NPC, 부위 레이어로 구워 씀)
packages/tv-art/src/themes.generated.ts         TV 배경 색 (자동 생성, 직접 수정 금지)
```

- 의존성: `pip install numpy opencv-python-headless pyyaml` (제작 시에만 필요, 앱 빌드·런타임과 무관)
- `--check`는 아무것도 쓰지 않고 YAML만 검증한다. 오류는 한 번에 모아서 보여 주며, 오류가 있으면 파일을 쓰지 않는다.
- 분할: 시드 마커 워터셰드. 어두운 외곽선은 하나로 이어진 수로라 영역이 그 길로 번지므로 얇은 선 픽셀은
  결과에서 버리고 가장 가까운 영역에 배정한다. 원본의 흰 눈·이빨은 투명 구멍이라 작은 구멍(<1500px)은 흰색으로 메운다.
- `status: draft` 작품은 매니페스트에 들어가지 않는다(`--only 작품id`는 draft도 에셋을 만든다, `--include-draft`는 미리보기용).
- 손으로 쓴 path 작품(`regions:` + `thumbnailUrl:`, 정글·바다)도 같은 구조를 쓴다. 일러스트(`source:` + `parts:`)로 바꾸면 스프라이트가 생겨 월드 NPC가 정교해진다.
- **월드 부위 분할**: 영역 라벨로 머리·꼬리·다리(가까운/먼)·팔·날개·몸통을 정한다(`creatureSprite.partOf`).
  라벨이 애매한 조각(점무늬·발톱)은 가장 가까운 부위를 따른다. 영역 이름에 `머리`, `꼬리`, `다리`, `날개`, `몸`을 넣으면 월드에서 부위별로 움직인다.
- 결과 확인은 `--debug` 오버레이와 `make ui-smoke` 스크린샷으로 한다. 렌더링 확인 없이 완료하지 않는다.

### 3.2 theme.yml 스키마 (요약 — 전체 주석은 `content-src/themes/_template/theme.yml`)

| 키 | 설명 |
|---|---|
| `label`, `emoji`, `tagline`, `order` | 테마 칩/버튼 표시와 순서 |
| `bgColor`, `accentColor` | 칩 배경, 글자·버튼 강조색 (`#rrggbb`) |
| `world.title`, `world.lead` | 월드 제목과 안내 문구 |
| `world.scene` | `generic`(palette로 그림) \| `dino` \| `jungle` \| `ocean`(앱 내장 전용 장면) |
| `world.palette` | generic 전용. `skyTop skyBottom groundTop groundBottom hill` 필수, `sun` 선택 |
| `world.ambient` | generic 전용. `none clouds stars bubbles petals` |
| `world.spawn` | `prop`(`egg bush bubble cloud star`), `colors`(터지는 반짝이), `shell`(알 껍데기) |
| `world.tapEmojis` | 화면을 눌렀을 때 떠오르는 이모지 |

### 3.3 behavior 값 (요약 — 전체 표는 `content-src/behaviors.yml` 머리 주석)

작품 yml의 `behavior:`는 프리셋 이름(`trex`, `flyer`, `swimmer` ...)이거나 `{preset: flyer, altitude: [10, 90], speed: [10, 16]}`처럼
프리셋 위에 값을 덮어쓰는 사전이다. `habitat`(ground/sky/water), `moves`(행동과 가중치), `altitude`(나는 높이) 등. 빌드가 최종 값을 펼쳐 매니페스트에 넣는다.

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
1. `content-src/`의 YAML/PNG를 추가·수정한다 (`manifest.json`은 생성물이라 직접 고치지 않는다 — §9)
2. `python3 tools/art/build_content.py`로 매니페스트와 에셋을 생성한다
3. 버전 번호 증가 (semver: patch/minor/major)
4. 배포 (`agents/rules.md` §7)

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

## 9. 사람·로컬 도구만으로 콘텐츠 추가하기 (클라우드 LLM 없이)

> 정글·바다·하늘 테마와 신규 공룡은 사용자가 직접 만든다(`agents/rules.md` §6.1). 필요한 도구는 `python3`(+`numpy`, `opencv-python-headless`, `pyyaml`)와
> Node 빌드(`make check`)뿐이다. 그림 후보를 찾거나 만드는 일은 사람 또는 로컬 런타임·로컬 모델이 하며, 원본 그림을 외부 서비스에 올리지 않는다.
> 로컬 런타임이 따라 할 수 있는 절차는 `agents/skills/aircanvas-content/SKILL.md`에도 같은 순서로 적혀 있다.

### 9.1 새 작품(공룡·정글·바다·하늘 …) 한 마리 추가 — 코드 수정 없음

1. **후보 그림 준비**: 투명 배경 PNG를 권장한다(옆모습, 한쪽을 보는 그림). 배경이 단색이면 `ingest.py`가 걷어낸다.
2. **초안 만들기**
   ```bash
   python3 tools/art/ingest.py 후보.png --theme dino --id dino-raptor --name 랩터 \
       --origin "로컬 SDXL 생성(prompt: ...)" --license "자체 생성" --behavior trex
   ```
   `content-src/themes/dino/dino-raptor.{png,yml}`이 생긴다(`status: draft`). 출처·이용 허락은 필수다.
3. **분할 확인**: `python3 tools/art/build_content.py --only dino-raptor --debug /tmp/art-debug` → `*-seg.png`(영역 번호)와 `*-grid.png`(좌표 격자)를 눈으로 본다.
4. **보정**: yml의 `label`을 `머리`/`꼬리`/`다리`/`날개`/`몸`처럼 고치고(월드에서 부위별로 움직임), 영역이 번지거나 비면 `seeds` 좌표를 옮긴다. 자동 제안은 거칠다(색 덩어리 기준).
5. **공개**: `status: ready`로 바꾸고 `python3 tools/art/build_content.py` → `make check` → `make ui-smoke` → 버전 patch bump 후 체크리스트(`agents/rules.md` §7).

`behavior`는 `behaviors.yml`의 프리셋 이름이다. 맞는 프리셋이 없으면 값을 덮어쓴다: `behavior: {preset: generic, speed: [10, 14], tail: 10}`.

### 9.2 새 테마(예: 하늘) 추가 — 코드 수정 없음

```bash
cp -r content-src/themes/_template content-src/themes/sky   # 폴더 이름 = 테마 id
# theme.yml의 label/emoji/색/world 를 고치고, 작품은 §9.1처럼 --theme sky 로 추가 (id는 sky-... 로 시작)
python3 tools/art/build_content.py --check
python3 tools/art/build_content.py
```

- 하늘처럼 새가 나는 테마는 작품 `behavior: flyer`(나는 높이 `altitude`는 프리셋에서 14~84)로 두면 하늘 전체를 난다.
- 테마에 공개 가능한(`ready`) 작품이 하나도 없으면 매니페스트에서 빠진다(빈 테마 칩이 생기지 않는다).
- 테마를 추가·변경하면 `manifest.json`의 `version`을 올린다(폰은 버전이 달라야 새 매니페스트를 받는다).

### 9.3 정글·바다 도안을 일러스트로 교체

`content-src/themes/jungle/*.yml`은 지금 손으로 쓴 `regions:`(자체 제작 path)다. 일러스트가 준비되면 같은 파일에서 `regions`/`thumbnailUrl`을 지우고
`source:` + `parts:`로 바꾸면 된다(§9.1의 2~4). 스프라이트가 생겨 월드 NPC가 영역 색 한 톤에서 일러스트로 바뀐다.

### 9.4 그림 후보 수집 (사람 또는 로컬 런타임)

- 후보를 만드는 방법은 자유다(직접 그림, 로컬 이미지 생성 모델, 허락된 자료 수집). 단 **`provenance`에 출처·이용 허락을 반드시 적는다**.
  이용 허락이 확인되지 않은 그림(`미상`/`확인 필요`)은 빌드가 경고하며, 공개 서비스 전에 확인한다. 현재 공룡 5종이 이 상태다.
- 수집한 그림을 서비스에 올리기 전에 허락 범위(상업·재배포 가능 여부)를 사람이 확인한다. 런타임이 허락을 추정해서 적지 않는다.
- `ingest.py`의 `sha256`은 원본 파일 지문이라 나중에 출처를 추적할 수 있다.

### 9.5 코드 수정이 필요한 경우 (새로운 "종류")

| 하고 싶은 것 | 고칠 곳 |
|---|---|
| 새 전용 월드 장면 그래픽(내장 장면) | `WorldScenes.tsx`에 `XxxScene`/`XxxForeground` 추가, `TouchJungleWorld.tsx`의 장면 선택에 한 줄, `protocol`의 `WorldPack.scene`·빌더 `SCENES`에 이름 추가 |
| 새 등장 소품(알·덤불·물방울·구름·별 외) | `worldEngine.ts` `propMarkup`에 SVG 추가, `protocol`의 `spawn.prop`·빌더 `SPAWN_PROPS`에 이름 추가 |
| 새 행동 모드(예: 구르기) | `worldEngine.ts`의 `Mode`/`enter`/`pose`, 빌더 `MODES`에 이름 추가 후 `behaviors.yml` `moves`에서 사용 |
| 새 ambient(배경에 떠다니는 것) | `WorldScenes.tsx` `GenericScene` + `styles.css` 애니메이션, 빌더 `AMBIENTS` |
| TV 배경 장식 | `apps/tv/src/engine/GameEngine.ts` `showBackdrop` (새 테마는 기본 점 무늬) |

### 9.6 알려진 제약 (v0.7.0)

- 자동 부위 제안(`ingest.py`)은 색 덩어리 기준이라 거칠다. 몸통과 머리가 한 덩어리로 묶이는 일이 흔해서 라벨·시드 보정이 필요하다.
  배경 제거는 단색 배경 가정이며, 복잡한 배경은 투명 PNG를 쓴다.
- `behavior`는 프리셋/값으로만 정한다. 모양(예: 뱀처럼 몸을 구불거림)에 맞는 새 움직임은 §9.5 코드 수정이 필요하다.
- 월드의 하늘/물 서식지 장면은 `generic`이면 하나의 바닥·언덕 구성이다. 물속 전용 배경 등은 전용 장면이 필요하다.
- 정글·바다 NPC는 스프라이트가 없어 영역 색 한 톤이다(§9.3).
- TV 연결 경로의 월드는 테마와 무관하게 하나의 기본 월드(정글 배경, 기존 구현)로 그려진다. 새 테마의 월드 장면·등장 연출·행동은 터치·카메라 로컬 경로에서 쓰인다.
