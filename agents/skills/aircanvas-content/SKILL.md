---
name: aircanvas-content
description: >-
  AirCanvas Kids 콘텐츠(테마·작품·월드·행동) 추가/수정을 코드 수정 없이 YAML로 하는 절차. 그림 후보 수집·초안(ingest)·분할 확인·검증·빌드를 사람 또는 로컬 런타임/로컬 모델이 수행하는 가이드. 새 공룡, 정글·바다·하늘 같은 새 테마를 추가할 때 사용.
---

# AirCanvas Kids 콘텐츠 추가 가이드

> 원본은 `content-src/`(YAML + PNG)다. `content-server/manifest.json`, 선화·썸네일·스프라이트, `packages/tv-art/src/themes.generated.ts`는
> `tools/art/build_content.py`가 만드는 **생성물**이라 직접 고치지 않는다. 자세한 규격: `docs/content-pipeline.md` §3, §9.

## 지켜야 할 것

- 그림 원본을 클라우드 LLM·이미지 생성 API 등 외부 서비스로 보내지 않는다(로컬 모델·도구만 사용).
- 모든 작품에 `provenance.origin`(출처)과 `provenance.license`(이용 허락)를 적는다. **이용 허락을 추정해서 적지 않는다** — 모르면 `미상 - 확인 필요`로 두고 사람이 확인한다.
- 앱 코드에 테마별 분기를 추가하지 않는다. 코드가 필요한 "새 종류"는 `docs/content-pipeline.md` §9.5.
- 끝나면 반드시 `python3 tools/art/build_content.py --check`가 통과해야 한다(오류 메시지에 고칠 위치가 나온다).

## 준비

```bash
python3 -m venv .venv-art && .venv-art/bin/pip install numpy opencv-python-headless pyyaml   # 제작 시에만 필요
```

## 새 작품 1개 (기존 테마에 추가)

1. 후보 그림(가능하면 투명 배경 PNG, 옆모습)을 로컬에서 만들거나 찾는다.
2. 초안: `python3 tools/art/ingest.py 후보.png --theme <테마> --id <테마>-<이름> --name <한국어이름> --origin "<출처>" --license "<이용허락>" [--behavior <프리셋>]`
3. 확인: `python3 tools/art/build_content.py --only <id> --debug /tmp/art-debug` 후 `/tmp/art-debug/<id>-seg.png`(영역 번호), `-grid.png`(좌표 격자)를 본다.
4. 보정: `content-src/themes/<테마>/<id>.yml`
   - `label`을 `머리`/`꼬리`/`다리`/`날개`/`몸`처럼 고친다 → 월드에서 부위별로 움직인다. 눈·이빨은 `눈`, `이빨`.
   - 영역이 번지거나 비면 `seeds`([x, y], 원본 512×512 좌표)를 옮기거나 추가한다. 작은 디테일은 `radius`로 번짐을 제한한다.
   - 3~4를 영역이 알맞게 나뉠 때까지 반복한다(자동 제안은 거칠다).
5. 공개: `status: ready` → `python3 tools/art/build_content.py` → `make check` → `make ui-smoke` → 버전 patch bump(`agents/rules.md` §7).

## 새 테마 (예: 하늘)

```bash
cp -r content-src/themes/_template content-src/themes/sky     # 폴더 이름 = 테마 id
```
`theme.yml`의 `label`/`emoji`/`tagline`/색/`world`를 고친다(`world.scene: generic`이면 palette/ambient/spawn만으로 장면이 그려진다).
작품은 위 절차를 `--theme sky --id sky-<이름>`으로 반복한다. 새가 나는 테마는 `--behavior flyer`(하늘 전체를 날고), 물속은 `swimmer`.
`ready` 작품이 하나도 없으면 테마가 매니페스트에서 빠진다. 테마·작품을 바꾸면 `content-server/manifest.json`의 `version`을 올려야 폰이 새로 받는다.

## 행동(behavior)

`content-src/behaviors.yml`의 프리셋 이름(`trex`, `brachio`, `stego`, `trike`, `ptera`, `lion`, `elephant`, `fish`, `whale`, `generic`, `flyer`, `swimmer`) 또는
`{preset: flyer, altitude: [10, 90], speed: [10, 16]}`처럼 값을 덮어쓴다. 값의 의미는 `behaviors.yml` 머리 주석. 새 프리셋은 그 파일에 한 줄 추가하면 된다.

## 검증 체크리스트

- [ ] `build_content.py --check` 통과(경고의 이용 허락 확인 필요 항목은 사람이 확인)
- [ ] `--debug` 오버레이로 부위가 눈으로 알맞게 나뉨
- [ ] `make check` → `make ui-smoke`(새 테마를 칩으로 선택해 월드까지 확인, 스크린샷을 직접 본다)
- [ ] manifest `version`과 앱 버전 bump, CHANGELOG, 커밋·푸시·배포 (`agents/rules.md` §7)
