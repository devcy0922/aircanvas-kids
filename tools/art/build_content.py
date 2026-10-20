#!/usr/bin/env python3
"""콘텐츠 빌드: content-src/ (YAML + 일러스트 PNG) → 매니페스트 · 영역 path · 선화 · 썸네일 · 스프라이트.

테마·작품·월드 설정·캐릭터 행동은 모두 YAML이 원본이다. 테마를 추가해도 앱 코드는 고치지 않는다.
색칠 영역은 손으로 쓰지 않고 일러스트의 실제 외곽선·색 경계에서 시드 워터셰드로 뽑는다.
그래서 영역·선화·썸네일이 항상 같은 그림에서 나오고 서로 어긋나지 않는다.

입력 (content-src/)
  behaviors.yml                       월드 캐릭터 행동 프리셋 (걷는 속도·꼬리 흔들기·행동 확률 등)
  themes/<테마>/theme.yml             라벨·색·이모지·월드 장면/등장 연출 설정
  themes/<테마>/<작품id>.yml          이름·행동·출처·부위 시드(또는 손으로 쓴 regions)
  themes/<테마>/<작품id>.png          512x512 RGBA 컬러 일러스트 (원본, 서비스 대상 아님)
출력
  content-server/manifest.json                    themes/artworks (행동 프리셋은 작품마다 펼쳐 넣음, version 등 최상위 값은 보존)
  content-server/artworks/images/<id>-line.png    투명 배경 외곽선 선화 (모든 화면이 multiply로 얹음)
  content-server/artworks/thumbnails/<id>.png     256px 컬러 썸네일
  content-server/artworks/sprites/<id>.png        384px 컬러 스프라이트 (월드 NPC)
  packages/tv-art/src/themes.generated.ts         TV 배경용 테마 색 (자동 생성)
  (--debug DIR) 시드/영역 확인용 오버레이 PNG

의존성: numpy, opencv-python-headless, pyyaml  (제작 시에만 필요, 런타임·앱 빌드와 무관)
사용:
  python3 tools/art/build_content.py --check             검증만 (파일을 쓰지 않음)
  python3 tools/art/build_content.py                     전체 빌드
  python3 tools/art/build_content.py --only dino-trex --debug /tmp/art-debug
  python3 tools/art/build_content.py --include-draft     status: draft 작품도 매니페스트에 포함 (미리보기용)
"""
import argparse
import json
import re
import sys
from pathlib import Path

import cv2
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'content-src'
IMG_OUT = ROOT / 'content-server/artworks/images'
THUMB_OUT = ROOT / 'content-server/artworks/thumbnails'
SPRITE_OUT = ROOT / 'content-server/artworks/sprites'
MANIFEST = ROOT / 'content-server/manifest.json'
TS_OUT = ROOT / 'packages/tv-art/src/themes.generated.ts'

SIZE = 512
SPRITE_SIZE = 384      # 월드에서 NPC로 걸어 다니는 컬러 스프라이트 (화면에서 최대 ~140css px)
HOLE_MAX = 1500        # 이보다 작은 내부 투명 구멍(눈 흰자·이빨)은 흰색으로 메운다
MIN_AREA = 40          # 이보다 작은 조각은 버린다 (원본 px)
LINE_RGB = (0x28, 0x2c, 0x1c)  # BGR of #1c2c28

# 앱 코드(worldEngine/WorldScenes)가 이해하는 값. 새 값은 코드 추가가 필요하다.
SCENES = {'dino', 'jungle', 'ocean', 'generic'}
SPAWN_PROPS = {'egg', 'bush', 'bubble', 'cloud', 'star'}
AMBIENTS = {'none', 'clouds', 'stars', 'bubbles', 'petals'}
MODES = {'walk', 'idle', 'roar', 'graze', 'look', 'wag', 'charge', 'pounce', 'trumpet', 'fly', 'glide', 'swoop', 'swim', 'breach'}
HABITATS = {'ground', 'sky', 'water'}
BEHAVIOR_KEYS = {'habitat', 'size', 'speed', 'stepHz', 'bob', 'lean', 'roll', 'leg', 'tail', 'tailHz', 'head', 'wing',
                 'neck', 'altitude', 'dust', 'shout', 'moves'}
# 월드에서 부위별로 움직이게 하는 라벨 단어 (apps/phone/src/lib/creatureSprite.ts partOf와 같은 규칙)
PART_WORDS = ('머리', '얼굴', '꼬리', '다리', '날개', '팔', '몸')
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')
SLUG = re.compile(r'^[a-z][a-z0-9-]*$')


def prepare(im):
    """원본은 흰색 부분(눈 흰자·이빨)이 투명하게 뚫려 있다. 작은 구멍은 흰색으로 메운다."""
    bgr, alpha = im[:, :, :3].copy(), im[:, :, 3].copy()
    num, comp = cv2.connectedComponents((alpha < 128).astype(np.uint8))
    outside = comp[0, 0]
    for i in range(1, num):
        if i != outside and (comp == i).sum() < HOLE_MAX:
            bgr[comp == i] = 255
            alpha[comp == i] = 255
    return bgr, alpha


def nearest_fill(lab, known):
    """known이 아닌 픽셀을 가장 가까운 known 픽셀의 영역 번호로 채운다 (영역별 거리 변환 argmin)."""
    if known.all() or not known.any():
        return lab
    ids = np.unique(lab[known])
    best = np.full(lab.shape, np.inf, np.float32)
    out = lab.copy()
    for i in ids:
        d = cv2.distanceTransform(np.where((lab == i) & known, 0, 1).astype(np.uint8), cv2.DIST_L2, 5)
        closer = d < best
        best[closer] = d[closer]
        out[closer] = i
    return out


def segment(img_bgr, alpha, parts):
    """시드 마커 워터셰드. 반환: 영역 맵 (0=배경, i+1=parts[i]).

    parts[i]['radius']가 있으면 그 부위는 시드에서 radius px 안쪽만 차지한다
    (점무늬·이빨처럼 경계가 흐린 디테일이 주변으로 번지는 것을 막는다).
    """
    blur = cv2.bilateralFilter(img_bgr, 5, 30, 5)
    markers = np.zeros(alpha.shape, np.int32)
    markers[alpha < 128] = 1  # 배경
    for i, part in enumerate(parts):
        for x, y in part['seeds']:
            cv2.circle(markers, (int(x), int(y)), 4, i + 2, -1)
    ws = cv2.watershed(blur, markers)
    lab = np.where(ws >= 2, ws - 1, 0).astype(np.int32)
    inside = alpha >= 128
    # 반지름 제한 부위: 시드에서 먼 픽셀은 해제
    for i, part in enumerate(parts):
        r = part.get('radius')
        if not r:
            continue
        seedmap = np.ones(alpha.shape, np.uint8)
        for x, y in part['seeds']:
            cv2.circle(seedmap, (int(x), int(y)), 1, 0, -1)
        dist = cv2.distanceTransform(seedmap, cv2.DIST_L2, 5)
        lab[(lab == i + 1) & (dist > r)] = 0
    # 어두운 외곽선은 하나로 이어진 수로라 워터셰드가 그 길로 번진다 → 얇은 선 픽셀은 결과를 버린다
    lum, blob = thin_lines(img_bgr, alpha)
    lab[(lum < 80) & ~blob] = 0
    # 해제된 픽셀과 능선(-1)은 반지름 제한이 없는 가장 가까운 영역으로
    free = np.array([not p.get('radius') for p in parts])
    keep = inside & (lab > 0)
    base = keep & np.concatenate([[False], free])[lab]
    full = nearest_fill(lab, base)
    lab = np.where(keep & ~base, lab, full)
    lab[~inside] = 0
    return lab


def region_paths(mask):
    """이진 마스크 → SVG path d (viewBox 100). 구멍은 반대 방향 서브패스."""
    m = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.1)
    m = (m > 0.5).astype(np.uint8)
    contours, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in contours:
        if abs(cv2.contourArea(c)) < MIN_AREA:
            continue
        ap = cv2.approxPolyDP(c, 0.9, True)[:, 0, :]
        if len(ap) < 3:
            continue
        k = 100.0 / SIZE
        pts = ' L'.join(f'{fmt(x * k)} {fmt(y * k)}' for x, y in ap)
        out.append(f'M{pts} Z')
    return ' '.join(out), int(m.sum())


def fmt(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def thin_lines(img_bgr, alpha):
    """어두운 외곽선 중 얇은 선만. 눈동자·콧구멍 같은 굵은 덩이는 칠할 수 있도록 제외한다."""
    lum = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    dark = ((lum < 80) & (alpha > 128)).astype(np.uint8)
    blob = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    blob = cv2.dilate(blob, np.ones((5, 5), np.uint8)) > 0
    return lum, blob


def line_art(img_bgr, alpha):
    """외곽선만 남긴 투명 PNG."""
    lum, blob = thin_lines(img_bgr, alpha)
    soft = np.clip((100 - lum) / 40, 0, 1) * (alpha / 255.0)
    soft[blob] = 0
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    out[:, :, :3] = LINE_RGB
    out[:, :, 3] = (soft * 255).astype(np.uint8)
    return out


class Report:
    """검증 결과를 모아서 한 번에 보여 준다 (고칠 곳을 한 번에 알 수 있게)."""

    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f'{where}: {msg}')

    def warn(self, where, msg):
        self.warnings.append(f'{where}: {msg}')


def read_yaml(path, rep):
    try:
        data = yaml.safe_load(path.read_text(encoding='utf-8'))
    except (OSError, yaml.YAMLError) as e:
        rep.err(path.relative_to(ROOT), f'YAML을 읽을 수 없어요 ({e})')
        return None
    if not isinstance(data, dict):
        rep.err(path.relative_to(ROOT), '최상위가 key: value 형태여야 해요')
        return None
    return data


def is_num_pair(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(x, (int, float)) for x in v)


def check_behavior(where, b, presets, rep):
    """behavior는 프리셋 이름이거나 {preset?, ...덮어쓸 값}."""
    if isinstance(b, str):
        if b not in presets:
            rep.err(where, f'알 수 없는 행동 프리셋 "{b}" (behaviors.yml에 있는 것: {", ".join(sorted(presets))})')
        return
    if not isinstance(b, dict):
        rep.err(where, 'behavior는 프리셋 이름 또는 값 목록이어야 해요')
        return
    if 'preset' in b and b['preset'] not in presets:
        rep.err(where, f'알 수 없는 행동 프리셋 "{b["preset"]}"')
    for k, v in b.items():
        if k == 'preset':
            continue
        if k not in BEHAVIOR_KEYS:
            rep.err(where, f'알 수 없는 행동 값 "{k}" (가능: {", ".join(sorted(BEHAVIOR_KEYS))})')
        elif k == 'habitat' and v not in HABITATS:
            rep.err(where, f'habitat은 {sorted(HABITATS)} 중 하나여야 해요')
        elif k in ('speed', 'altitude') and not is_num_pair(v):
            rep.err(where, f'{k}는 [최소, 최대] 숫자 두 개예요')
        elif k == 'moves':
            ok = isinstance(v, list) and v and all(isinstance(m, list) and len(m) == 2 and m[0] in MODES and isinstance(m[1], (int, float)) for m in v)
            if not ok:
                rep.err(where, f'moves는 [[행동, 가중치], ...]이고 행동은 {sorted(MODES)} 중 하나예요')
        elif k == 'dust' and not isinstance(v, bool):
            rep.err(where, 'dust는 true/false예요')
        elif k == 'shout' and not isinstance(v, str):
            rep.err(where, 'shout는 포효/울음 글자(예: 크아앙!)예요')
        elif k not in ('habitat', 'speed', 'altitude', 'moves', 'dust', 'shout') and not isinstance(v, (int, float)):
            rep.err(where, f'{k}는 숫자예요')


def resolve_behavior(b, behaviors):
    """프리셋 이름 / {preset, 덮어쓸 값} → 완성된 행동 값. 앱은 이 값만 읽는다(프리셋 조회 불필요)."""
    if b is None:
        return dict(behaviors['generic'])
    if isinstance(b, str):
        return dict(behaviors[b])
    out = dict(behaviors[b.get('preset', 'generic')])
    out.update({k: v for k, v in b.items() if k != 'preset'})
    return out


def check_theme(tid, th, rep):
    where = f'themes/{tid}/theme.yml'
    if not SLUG.match(tid):
        rep.err(where, '테마 폴더 이름은 소문자·숫자·하이픈(예: sky)이어야 해요')
    for k in ('label', 'emoji', 'tagline'):
        if not isinstance(th.get(k), str) or not th[k].strip():
            rep.err(where, f'{k}가 필요해요')
    for k in ('bgColor', 'accentColor'):
        if not isinstance(th.get(k), str) or not HEX.match(th[k]):
            rep.err(where, f'{k}는 #rrggbb 형식이어야 해요')
    w = th.get('world')
    if not isinstance(w, dict):
        rep.err(where, 'world 설정이 필요해요')
        return
    for k in ('title', 'lead'):
        if not isinstance(w.get(k), str) or not w[k].strip():
            rep.err(where, f'world.{k}가 필요해요')
    if w.get('scene') not in SCENES:
        rep.err(where, f'world.scene은 {sorted(SCENES)} 중 하나여야 해요')
    if w.get('scene') == 'generic':
        pal = w.get('palette')
        need = ('skyTop', 'skyBottom', 'groundTop', 'groundBottom', 'hill')
        if not isinstance(pal, dict) or any(not isinstance(pal.get(k), str) or not HEX.match(pal[k]) for k in need):
            rep.err(where, f'world.palette에 {", ".join(need)} 색(#rrggbb)이 모두 필요해요')
        if w.get('ambient', 'none') not in AMBIENTS:
            rep.err(where, f'world.ambient는 {sorted(AMBIENTS)} 중 하나예요')
    sp = w.get('spawn')
    if not isinstance(sp, dict) or sp.get('prop') not in SPAWN_PROPS:
        rep.err(where, f'world.spawn.prop은 {sorted(SPAWN_PROPS)} 중 하나여야 해요')
    elif not (isinstance(sp.get('colors'), list) and sp['colors'] and all(isinstance(c, str) and HEX.match(c) for c in sp['colors'])):
        rep.err(where, 'world.spawn.colors는 #rrggbb 색 목록이어야 해요')
    te = w.get('tapEmojis')
    if not (isinstance(te, list) and te and all(isinstance(e, str) for e in te)):
        rep.err(where, 'world.tapEmojis는 이모지 목록이어야 해요')


def check_artwork(tid, aid, y, presets, rep):
    where = f'themes/{tid}/{aid}.yml'
    if not aid.startswith(f'{tid}-') or not SLUG.match(aid):
        rep.err(where, f'파일 이름(작품 id)은 "{tid}-"로 시작하는 소문자·숫자·하이픈이어야 해요')
    if not isinstance(y.get('name'), str) or not y['name'].strip():
        rep.err(where, 'name(한국어 이름)이 필요해요')
    if y.get('status') not in ('ready', 'draft'):
        rep.err(where, 'status는 ready 또는 draft예요')
    prov = y.get('provenance')
    if not isinstance(prov, dict) or not str(prov.get('origin', '')).strip() or not str(prov.get('license', '')).strip():
        rep.err(where, 'provenance.origin(출처)과 provenance.license(이용 허락)가 필요해요 — 수집·생성한 그림의 근거를 남겨요')
    elif '확인 필요' in str(prov.get('license')) or str(prov.get('license')).startswith('미상'):
        rep.warn(where, '이용 허락이 확인되지 않았어요 — 공개 서비스 전에 확인이 필요해요')
    if 'behavior' in y:
        check_behavior(where, y['behavior'], presets, rep)
    has_src, has_reg = 'source' in y, 'regions' in y
    if has_src == has_reg:
        rep.err(where, 'source(일러스트+parts)와 regions(손으로 쓴 path) 중 정확히 하나만 있어야 해요')
        return
    if has_src:
        parts = y.get('parts')
        if not isinstance(parts, list) or not parts:
            rep.err(where, 'parts(부위 시드)가 필요해요')
            return
        ids = set()
        for p in parts:
            pid = p.get('id') if isinstance(p, dict) else None
            if not pid or not isinstance(p.get('label'), str):
                rep.err(where, f'부위에는 id와 label이 필요해요: {p}')
                continue
            if pid in ids:
                rep.err(where, f'부위 id가 겹쳐요: {pid}')
            ids.add(pid)
            sd = p.get('seeds')
            if not (isinstance(sd, list) and sd and all(is_num_pair(s) and 0 <= s[0] < SIZE and 0 <= s[1] < SIZE for s in sd)):
                rep.err(where, f'{pid}: seeds는 [x, y] 목록이고 좌표는 0~{SIZE - 1}이어야 해요')
        if not any(w in p.get('label', '') for p in parts for w in PART_WORDS):
            rep.warn(where, '부위 라벨에 머리/꼬리/다리/날개/몸 같은 단어가 없어서 월드에서 부위별로 움직이지 않아요')
        png = CONTENT / 'themes' / tid / y['source']
        if not png.exists():
            rep.err(where, f'원본 일러스트가 없어요: {png.relative_to(ROOT)}')
        else:
            im = cv2.imread(str(png), cv2.IMREAD_UNCHANGED)
            if im is None or im.ndim != 3 or im.shape[2] != 4:
                rep.err(where, '원본은 투명 배경 RGBA PNG여야 해요')
            elif im.shape[0] != SIZE or im.shape[1] != SIZE:
                rep.err(where, f'원본은 {SIZE}x{SIZE}이어야 해요 (현재 {im.shape[1]}x{im.shape[0]}) — tools/art/ingest.py가 맞춰 줘요')
    else:
        regs = y.get('regions')
        if not (isinstance(regs, list) and regs):
            rep.err(where, 'regions가 비었어요')
            return
        for r in regs:
            if not (isinstance(r, dict) and r.get('id') and r.get('label') and str(r.get('path', '')).strip().endswith('Z')):
                rep.err(where, f'영역은 id, label, 닫힌 path(Z로 끝남)가 필요해요: {str(r)[:60]}')
        if not str(y.get('thumbnailUrl', '')).startswith('/'):
            rep.err(where, 'regions 작품은 thumbnailUrl(예: /artworks/thumbnails/<id>.svg)이 필요해요')


def load_content(rep):
    """content-src를 읽고 검증한다. 반환: (behaviors, themes[{id, cfg, artworks[{id, y}]}])"""
    bpath = CONTENT / 'behaviors.yml'
    behaviors = read_yaml(bpath, rep) or {}
    for name, b in behaviors.items():
        check_behavior(f'behaviors.yml/{name}', b, set(behaviors), rep)
    if 'generic' not in behaviors:
        rep.err('behaviors.yml', '"generic" 프리셋은 반드시 있어야 해요 (프리셋이 없는 작품의 기본값)')
    themes = []
    tdirs = sorted(d for d in (CONTENT / 'themes').iterdir() if d.is_dir() and not d.name.startswith(('_', '.')))
    for d in tdirs:
        th = read_yaml(d / 'theme.yml', rep)
        if th is None:
            continue
        check_theme(d.name, th, rep)
        arts = []
        for f in sorted(d.glob('*.yml')):
            if f.name == 'theme.yml':
                continue
            y = read_yaml(f, rep)
            if y is None:
                continue
            check_artwork(d.name, f.stem, y, set(behaviors), rep)
            arts.append({'id': f.stem, 'y': y})
        arts.sort(key=lambda a: (a['y'].get('order', 999), a['id']))
        themes.append({'id': d.name, 'cfg': th, 'artworks': arts})
    themes.sort(key=lambda t: (t['cfg'].get('order', 999), t['id']))
    return behaviors, themes


def build_assets(tid, aid, y, debug):
    """원본 PNG → 영역/선화/썸네일/스프라이트. 반환: 매니페스트 아트워크 조각."""
    im = cv2.imread(str(CONTENT / 'themes' / tid / y['source']), cv2.IMREAD_UNCHANGED)
    bgr, alpha = prepare(im)
    parts = y['parts']
    lab = segment(bgr, alpha, parts)
    regions = []
    for i, p in enumerate(parts):
        d, area = region_paths(lab == i + 1)
        if not d:
            print(f'  ! {aid}/{p["id"]} 영역이 비었습니다 (시드 위치를 확인하세요)', file=sys.stderr)
            continue
        regions.append({'id': p['id'], 'label': p['label'], 'd': d, 'area': area})
    if not regions:
        raise SystemExit(f'{aid}: 만들어진 영역이 하나도 없어요. --debug로 시드 위치를 확인하세요.')
    # 큰 영역을 아래, 작은 영역을 위에 (구멍/겹침 안전)
    regions.sort(key=lambda r: -r['area'])
    for z, r in enumerate(regions, 1):
        r['zIndex'] = z
    for out in (IMG_OUT, THUMB_OUT, SPRITE_OUT):
        out.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(IMG_OUT / f'{aid}-line.png'), line_art(bgr, alpha))
    thumb = cv2.resize(np.dstack([bgr, alpha]), (256, 256), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(THUMB_OUT / f'{aid}.png'), thumb)
    sprite = cv2.resize(np.dstack([bgr, alpha]), (SPRITE_SIZE, SPRITE_SIZE), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(SPRITE_OUT / f'{aid}.png'), sprite, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    print(f'{aid}: 영역 {len(regions)}개, 최소 면적 {min(r["area"] for r in regions)}px')
    if debug:
        debug_overlay(aid, bgr, alpha, lab, parts, Path(debug))
    return {
        'regions': [{'id': r['id'], 'label': r['label'], 'path': r['d'], 'zIndex': r['zIndex']} for r in regions],
        'thumbnailUrl': f'/artworks/thumbnails/{aid}.png',
        'imageUrl': f'/artworks/images/{aid}-line.png',
        'spriteUrl': f'/artworks/sprites/{aid}.png',
    }


def main():
    ap = argparse.ArgumentParser(description='content-src → 매니페스트/에셋 빌드')
    ap.add_argument('--check', action='store_true', help='검증만 하고 아무것도 쓰지 않는다')
    ap.add_argument('--debug', help='영역 분할 확인용 오버레이 PNG를 저장할 폴더')
    ap.add_argument('--only', help='이 작품만 에셋을 다시 만든다 (나머지는 기존 매니페스트 값을 쓴다)')
    ap.add_argument('--include-draft', action='store_true', help='status: draft 작품도 매니페스트에 넣는다')
    args = ap.parse_args()

    rep = Report()
    behaviors, themes = load_content(rep)
    known = {a['id'] for t in themes for a in t['artworks']}
    if args.only and args.only not in known:
        rep.err('--only', f'"{args.only}" 작품이 없어요')
    for w in rep.warnings:
        print('경고', w, file=sys.stderr)
    if rep.errors:
        for e in rep.errors:
            print('오류', e, file=sys.stderr)
        print(f'\n검증 실패: 오류 {len(rep.errors)}개 (파일은 쓰지 않았어요)', file=sys.stderr)
        sys.exit(2)
    if args.check:
        n = sum(len(t['artworks']) for t in themes)
        print(f'검증 통과: 테마 {len(themes)}개, 작품 {n}개, 경고 {len(rep.warnings)}개')
        return

    manifest = json.loads(MANIFEST.read_text())
    prior = {a['id']: a for t in manifest.get('themes', []) for a in t['artworks']}
    out_themes = []
    for t in themes:
        cfg = t['cfg']
        arts = []
        for a in t['artworks']:
            y, aid = a['y'], a['id']
            if y['status'] == 'draft' and not args.include_draft and aid != args.only:
                continue
            entry = {'id': aid, 'name': y['name'], 'viewBox': '0 0 100 100'}
            if 'source' in y:
                reuse = prior.get(aid)
                if args.only and aid != args.only and reuse and reuse.get('regions'):
                    built = {k: reuse[k] for k in ('regions', 'thumbnailUrl', 'imageUrl', 'spriteUrl') if k in reuse}
                else:
                    built = build_assets(t['id'], aid, y, args.debug)
                entry.update(built)
            else:
                entry['regions'] = [{'id': r['id'], 'label': r['label'], 'path': r['path'], 'zIndex': r.get('zIndex', i + 1)}
                                    for i, r in enumerate(y['regions'])]
                entry['thumbnailUrl'] = y['thumbnailUrl']
            entry['behavior'] = resolve_behavior(y.get('behavior'), behaviors)
            if y['status'] == 'draft':
                entry['draft'] = True
            arts.append(entry)
        if not arts:
            print(f'참고: 테마 {t["id"]}는 공개할 작품이 없어 매니페스트에서 뺐어요', file=sys.stderr)
            continue
        out_themes.append({
            'id': t['id'], 'label': cfg['label'], 'emoji': cfg['emoji'], 'tagline': cfg['tagline'],
            'bgColor': cfg['bgColor'], 'accentColor': cfg['accentColor'], 'world': cfg['world'], 'artworks': arts,
        })
    manifest.pop('behaviors', None)
    manifest['themes'] = out_themes
    MANIFEST.write_text(dump(manifest) + '\n')
    write_theme_meta(out_themes)
    print(f'매니페스트: 테마 {len(out_themes)}개, 작품 {sum(len(t["artworks"]) for t in out_themes)}개')


def write_theme_meta(themes):
    lines = [
        '/**',
        ' * 테마 색 — 자동 생성 파일, 직접 수정하지 않는다.',
        ' * 원본: content-src/themes/<테마>/theme.yml   재생성: python3 tools/art/build_content.py',
        ' */',
        'export const THEME_META: Record<string, { label: string; bg: string; accent: string }> = {',
    ]
    for t in themes:
        lines.append(f"  {json.dumps(t['id'])}: {{ label: {json.dumps(t['label'], ensure_ascii=False)}, "
                     f"bg: {json.dumps(t['bgColor'])}, accent: {json.dumps(t['accentColor'])} }},")
    lines += ['};', '']
    TS_OUT.write_text('\n'.join(lines))


def debug_overlay(aid, bgr, alpha, lab, parts, out):
    """왼쪽: 원본 + 좌표 격자, 오른쪽: 영역 분할(영역 id는 무게중심). 2배 확대."""
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.RandomState(7)
    col = rng.randint(60, 235, (len(parts) + 2, 3)).astype(np.uint8)
    vis = np.full(bgr.shape, 255, np.uint8)
    for i in range(len(parts)):
        vis[lab == i + 1] = col[i + 1]
    edge = cv2.Canny(lab.astype(np.uint8), 0, 1) > 0
    vis[edge] = (0, 0, 0)
    vis = cv2.resize(vis, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
    for i, p in enumerate(parts):
        for x, y in p['seeds']:
            cv2.circle(vis, (int(x) * 2, int(y) * 2), 4, (0, 0, 255), -1)
        ys, xs = np.nonzero(lab == i + 1)
        if len(xs):
            cv2.putText(vis, p['id'][:12], (int(xs.mean() * 2) - 20, int(ys.mean() * 2)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
    orig = cv2.resize(bgr_on_white(bgr, alpha), None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    for v in range(0, SIZE, 32):
        c = (0, 0, 255) if v % 64 == 0 else (200, 200, 255)
        cv2.line(orig, (v * 2, 0), (v * 2, 1023), c, 1)
        cv2.line(orig, (0, v * 2), (1023, v * 2), c, 1)
        if v % 64 == 0:
            cv2.putText(orig, str(v), (v * 2 + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 200), 1)
            cv2.putText(orig, str(v), (2, v * 2 + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 200), 1)
    cv2.imwrite(str(out / f'{aid}-seg.png'), vis)
    cv2.imwrite(str(out / f'{aid}-grid.png'), orig)


def bgr_on_white(bgr, alpha):
    a = (alpha / 255.0)[:, :, None]
    return (bgr * a + 255 * (1 - a)).astype(np.uint8)


def dump(o, ind=0):
    p = '  ' * ind
    j = lambda v: json.dumps(v, ensure_ascii=False)
    if isinstance(o, dict):
        if set(o) >= {'id', 'label', 'path'} or (o and all(not isinstance(v, (dict, list)) or (isinstance(v, list) and all(not isinstance(x, (dict, list)) or (isinstance(x, list) and all(not isinstance(y, (dict, list)) for y in x)) for x in v)) for v in o.values()) and ind >= 2):
            return '{ ' + ', '.join(f'{j(k)}: {j(v)}' for k, v in o.items()) + ' }'
        return '{\n' + ',\n'.join(f'{p}  {j(k)}: {dump(v, ind + 1)}' for k, v in o.items()) + f'\n{p}}}'
    if isinstance(o, list):
        if not o:
            return '[]'
        if all(not isinstance(x, (dict, list)) for x in o):
            return j(o)
        return '[\n' + ',\n'.join(f'{p}  {dump(x, ind + 1)}' for x in o) + f'\n{p}]'
    return j(o)


if __name__ == '__main__':
    main()
