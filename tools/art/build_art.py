#!/usr/bin/env python3
"""색칠 도안 빌드: 컬러 일러스트 PNG + 시드 점(seeds.json) → 영역 path / 선화 PNG / 썸네일.

색칠 영역을 손으로 쓰지 않고 일러스트의 실제 외곽선·색 경계에서 워터셰드로 뽑는다.
그래서 영역·선화·썸네일이 항상 같은 그림에서 나오고 서로 어긋나지 않는다.

입력
  tools/art/source/<id>.png   512x512 RGBA 컬러 일러스트 (원본, 서비스 대상 아님)
  tools/art/seeds.json        작품별 부위 시드 점 (원본 픽셀 좌표, 한 부위에 점 여러 개 가능)
출력
  content-server/artworks/images/<id>-line.png   투명 배경 외곽선 선화 (모든 화면이 multiply로 얹음)
  content-server/artworks/thumbnails/<id>.png    256px 컬러 썸네일
  packages/tv-art/src/artworks/dino.ts           Artwork[] 정의
  content-server/manifest.json                   dino 테마 artworks 영역/이미지 URL
  (--debug DIR) 시드/영역 확인용 오버레이 PNG

의존성: numpy, opencv-python-headless  (pip install numpy opencv-python-headless)
사용:   python3 tools/art/build_art.py [--debug DIR] [--only dino-trex]
"""
import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'tools/art/source'
IMG_OUT = ROOT / 'content-server/artworks/images'
THUMB_OUT = ROOT / 'content-server/artworks/thumbnails'
MANIFEST = ROOT / 'content-server/manifest.json'
TS_OUT = ROOT / 'packages/tv-art/src/artworks/dino.ts'
SEEDS = ROOT / 'tools/art/seeds.json'

SIZE = 512
HOLE_MAX = 1500        # 이보다 작은 내부 투명 구멍(눈 흰자·이빨)은 흰색 내부로 메운다
MIN_AREA = 40          # 이보다 작은 조각은 버린다 (원본 px)
LINE_RGB = (0x28, 0x2c, 0x1c)  # BGR of #1c2c28


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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--debug')
    ap.add_argument('--only')
    args = ap.parse_args()
    seeds = json.loads(SEEDS.read_text())
    manifest = json.loads(MANIFEST.read_text())
    dino_theme = next(t for t in manifest['themes'] if t['id'] == 'dino')
    by_id = {a['id']: a for a in dino_theme['artworks']}
    ts_items = []
    for art in seeds['artworks']:
        aid = art['id']
        if args.only and aid != args.only:
            ts_items.append(None)
            continue
        im = cv2.imread(str(SRC / f'{aid}.png'), cv2.IMREAD_UNCHANGED)
        bgr, alpha = prepare(im)
        parts = art['parts']
        lab = segment(bgr, alpha, parts)
        regions = []
        for i, p in enumerate(parts):
            d, area = region_paths(lab == i + 1)
            if not d:
                print(f'  ! {aid}/{p["id"]} 영역이 비었습니다', file=sys.stderr)
                continue
            regions.append({'id': p['id'], 'label': p['label'], 'd': d, 'area': area})
        # 큰 영역을 아래, 작은 영역을 위에 (구멍/겹침 안전)
        regions.sort(key=lambda r: -r['area'])
        for z, r in enumerate(regions, 1):
            r['zIndex'] = z
        art['_regions'] = regions
        cv2.imwrite(str(IMG_OUT / f'{aid}-line.png'), line_art(bgr, alpha))
        thumb = cv2.resize(np.dstack([bgr, alpha]), (256, 256), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(THUMB_OUT / f'{aid}.png'), thumb)
        m = by_id[aid]
        m['regions'] = [{'id': r['id'], 'label': r['label'], 'path': r['d'], 'zIndex': r['zIndex']} for r in regions]
        m['thumbnailUrl'] = f'/artworks/thumbnails/{aid}.png'
        m['imageUrl'] = f'/artworks/images/{aid}-line.png'
        print(f'{aid}: 영역 {len(regions)}개, 최소 면적 {min(r["area"] for r in regions)}px')
        if args.debug:
            debug_overlay(aid, bgr, alpha, lab, parts, Path(args.debug))
    write_manifest(manifest)
    write_ts(dino_theme['artworks'])


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
        if set(o) >= {'id', 'label', 'path'}:
            return '{ ' + ', '.join(f'{j(k)}: {j(v)}' for k, v in o.items()) + ' }'
        return '{\n' + ',\n'.join(f'{p}  {j(k)}: {dump(v, ind + 1)}' for k, v in o.items()) + f'\n{p}}}'
    if isinstance(o, list):
        if not o:
            return '[]'
        if all(not isinstance(x, (dict, list)) for x in o):
            return j(o)
        return '[\n' + ',\n'.join(f'{p}  {dump(x, ind + 1)}' for x in o) + f'\n{p}]'
    return j(o)


def write_manifest(manifest):
    MANIFEST.write_text(dump(manifest) + '\n')


def write_ts(artworks):
    lines = [
        "import type { Artwork } from '../types';",
        '',
        '/**',
        ' * 공룡 테마 아트워크 — 자동 생성 파일, 직접 수정하지 않는다.',
        ' * 원본: tools/art/source/*.png + tools/art/seeds.json',
        ' * 재생성: python3 tools/art/build_art.py',
        ' */',
        'export const DINO_ARTWORKS: Artwork[] = [',
    ]
    for m in artworks:
        lines += ['  {', f"    id: '{m['id']}',", "    theme: 'dino',", f"    name: '{m['name']}',",
                  "    viewBox: '0 0 100 100',", f"    imageUrl: '{m['imageUrl']}',", '    regions: [']
        regs = m['regions']
        for i, r in enumerate(regs):
            comma = ',' if i < len(regs) - 1 else ''
            lines.append(f"      {{ id: {json.dumps(r['id'])}, label: {json.dumps(r['label'], ensure_ascii=False)}, "
                         f"d: {json.dumps(r['path'])}, zIndex: {r.get('zIndex', i + 1)} }}{comma}")
        lines += ['    ],', '  },']
    lines += ['];', '']
    TS_OUT.write_text('\n'.join(lines))


if __name__ == '__main__':
    main()
