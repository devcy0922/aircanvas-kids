#!/usr/bin/env python3
"""그림 후보 1장 → content-src 초안(draft).

사람이나 로컬 런타임/모델이 찾았거나 만든 그림을 서비스 규격으로 맞춘다.
  1) 배경 제거(알파가 없으면 테두리 색을 배경으로 보고 걷어낸다) → 512x512 RGBA 로 정렬
  2) 색 덩어리로 부위 시드를 자동 제안 (라벨은 `칸 NN` — 사람이/모델이 머리·꼬리·다리 등으로 고친다)
  3) content-src/themes/<테마>/<id>.png + <id>.yml 작성 (status: draft, 매니페스트에는 들어가지 않음)

출처(--origin)와 이용 허락(--license)은 필수다. 수집·생성한 그림의 근거를 남기기 위해서다.
클라우드 서비스로 그림을 보내지 않는다 (모든 처리는 이 스크립트 안에서 로컬로 한다).

사용:
  python3 tools/art/ingest.py 후보.png --theme sky --id sky-balloon --name 열기구 \
      --origin "로컬 SDXL 생성(prompt: ...)" --license "자체 생성" [--behavior flyer] [--parts 10]
이후:
  python3 tools/art/build_content.py --only sky-balloon --debug /tmp/art-debug   # 분할 확인
  (yml의 라벨/시드 보정 → status: ready) → python3 tools/art/build_content.py
"""
import argparse
import hashlib
import sys
from pathlib import Path

import cv2
import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / 'content-src'
SIZE = 512
MARGIN = 20          # 그림 둘레 여백(px)
BG_TOL = 28.0        # 배경색과의 Lab 거리 허용치
MIN_PART = 260       # 이보다 작은 색 덩어리는 부위로 만들지 않는다(px)


def load_rgba(path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise SystemExit(f'이미지를 읽을 수 없어요: {path}')
    if im.ndim == 2:
        im = cv2.cvtColor(im, cv2.COLOR_GRAY2BGRA)
    elif im.shape[2] == 3:
        im = cv2.cvtColor(im, cv2.COLOR_BGR2BGRA)
    return im


def remove_background(im):
    """알파가 이미 있으면 그대로 쓰고, 없으면 테두리에서 번지는 배경색을 걷어낸다."""
    alpha = im[:, :, 3]
    if (alpha < 250).mean() > 0.02:
        return im, '알파 채널 사용'
    bgr = im[:, :, :3]
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    bg = np.median(border, axis=0)
    if np.abs(border - bg).max(axis=1).mean() > 18:
        print('경고: 가장자리 색이 고르지 않아요. 배경이 단색이 아니면 결과가 거칠 수 있어요 — 투명 배경 PNG를 권장해요.', file=sys.stderr)
    dist = np.linalg.norm(lab - bg, axis=2)
    near = (dist < BG_TOL).astype(np.uint8)
    # 가장자리와 이어진 배경만 제거 (그림 속 흰 눈·이빨은 보존)
    n, comp = cv2.connectedComponents(near)
    edge_ids = set(np.unique(np.concatenate([comp[0], comp[-1], comp[:, 0], comp[:, -1]]))) - {0}
    bgmask = np.isin(comp, list(edge_ids))
    fg = (~bgmask).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    num, lbl, stats, _ = cv2.connectedComponentsWithStats(fg)
    if num <= 1:
        raise SystemExit('배경을 걷어내고 나니 남은 그림이 없어요. 투명 배경 PNG를 사용해 주세요.')
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    fg = (lbl == big).astype(np.uint8)
    fg = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.8)
    out = im.copy()
    out[:, :, 3] = np.clip(fg * 255, 0, 255).astype(np.uint8)
    return out, '테두리 배경색 제거'


def fit_square(im):
    """그림 영역을 잘라 512x512 중앙에 맞춘다 (비율 유지)."""
    ys, xs = np.nonzero(im[:, :, 3] > 128)
    if len(xs) == 0:
        raise SystemExit('보이는 픽셀이 없어요.')
    crop = im[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = crop.shape[:2]
    k = (SIZE - 2 * MARGIN) / max(h, w)
    crop = cv2.resize(crop, (max(1, round(w * k)), max(1, round(h * k))), interpolation=cv2.INTER_AREA)
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    h, w = crop.shape[:2]
    y0, x0 = (SIZE - h) // 2, (SIZE - w) // 2
    out[y0:y0 + h, x0:x0 + w] = crop
    return out


def propose_parts(im, k):
    """색 덩어리(Lab k-means) → 연결 성분마다 부위 1개. 시드는 덩어리 안쪽에서 가장 깊은 점."""
    bgr, alpha = im[:, :, :3], im[:, :, 3]
    inside = alpha >= 128
    lab = cv2.cvtColor(cv2.bilateralFilter(bgr, 7, 40, 7), cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    pts = lab[inside.reshape(-1)]
    k = max(2, min(k, len(pts) // 50))
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 1.0)
    cv2.setRNGSeed(7)  # 같은 그림은 같은 제안이 나오게
    _, labels, _ = cv2.kmeans(pts, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
    cmap = np.full(alpha.shape, -1, np.int32)
    cmap[inside] = labels.reshape(-1)
    dark = (cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY) < 70) & inside   # 어두운 외곽선은 부위로 치지 않는다
    comps = []
    for c in range(k):
        m = ((cmap == c) & ~dark).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        num, lbl, stats, _ = cv2.connectedComponentsWithStats(m)
        for i in range(1, num):
            if stats[i, cv2.CC_STAT_AREA] < MIN_PART:
                continue
            region = (lbl == i).astype(np.uint8)
            dt = cv2.distanceTransform(region, cv2.DIST_L2, 5)
            y, x = np.unravel_index(int(np.argmax(dt)), dt.shape)
            comps.append((int(stats[i, cv2.CC_STAT_AREA]), int(x), int(y)))
    comps.sort(key=lambda t: -t[0])
    comps = comps[:24]
    return [{'id': f'p{n:02d}', 'label': f'칸 {n:02d}', 'seeds': [[x, y]]} for n, (_, x, y) in enumerate(comps, 1)]


class Flow(list):
    pass


yaml.SafeDumper.add_representer(Flow, lambda d, v: d.represent_sequence('tag:yaml.org,2002:seq', v, flow_style=True))


def main():
    ap = argparse.ArgumentParser(description='그림 후보 → content-src 초안')
    ap.add_argument('image')
    ap.add_argument('--theme', required=True, help='content-src/themes/ 아래 테마 폴더 이름')
    ap.add_argument('--id', required=True, help='작품 id (<테마>-이름, 소문자·숫자·하이픈)')
    ap.add_argument('--name', required=True, help='한국어 이름')
    ap.add_argument('--origin', required=True, help='출처 (어디서 찾았나 / 어떤 모델·프롬프트로 만들었나)')
    ap.add_argument('--license', required=True, help='이용 허락 (예: 자체 생성, CC0, CC-BY-4.0 ...)')
    ap.add_argument('--url', help='출처 주소(선택)')
    ap.add_argument('--author', help='저작자(선택)')
    ap.add_argument('--behavior', default='generic', help='월드 행동 프리셋 (behaviors.yml 이름, 기본 generic)')
    ap.add_argument('--parts', type=int, default=10, help='부위 제안 개수 상한(색 덩어리 수)')
    ap.add_argument('--force', action='store_true', help='이미 있는 초안을 덮어쓴다')
    args = ap.parse_args()

    tdir = CONTENT / 'themes' / args.theme
    if not (tdir / 'theme.yml').exists():
        raise SystemExit(f'테마가 없어요: {tdir}\n새 테마는 먼저 만드세요: cp -r content-src/themes/_template content-src/themes/{args.theme}')
    if not args.id.startswith(f'{args.theme}-'):
        raise SystemExit(f'작품 id는 "{args.theme}-"로 시작해야 해요')
    png, yml = tdir / f'{args.id}.png', tdir / f'{args.id}.yml'
    if (png.exists() or yml.exists()) and not args.force:
        raise SystemExit(f'이미 있어요: {yml.relative_to(ROOT)} (덮어쓰려면 --force)')

    raw = Path(args.image)
    im, how = remove_background(load_rgba(raw))
    im = fit_square(im)
    parts = propose_parts(im, args.parts)
    if not parts:
        raise SystemExit('부위를 하나도 찾지 못했어요. 그림이 너무 단색이거나 작아요.')
    cv2.imwrite(str(png), im, [cv2.IMWRITE_PNG_COMPRESSION, 9])

    prov = {'origin': args.origin, 'license': args.license, 'sha256': hashlib.sha256(raw.read_bytes()).hexdigest()[:16]}
    if args.url:
        prov['url'] = args.url
    if args.author:
        prov['author'] = args.author
    doc = {
        'name': args.name,
        'status': 'draft',
        'behavior': args.behavior,
        'source': png.name,
        'provenance': prov,
        'parts': [dict(p, seeds=Flow(Flow(s) for s in p['seeds'])) for p in parts],
    }
    yml.write_text(
        '# 초안: 라벨을 머리/꼬리/다리/날개/몸 같은 이름으로 고치고, 필요하면 seeds를 보정한 뒤 status: ready 로 바꾼다.\n'
        + yaml.dump(doc, Dumper=yaml.SafeDumper, allow_unicode=True, sort_keys=False, width=100, default_flow_style=None),
        encoding='utf-8')
    print(f'배경: {how} / 부위 제안 {len(parts)}개')
    print(f'작성: {png.relative_to(ROOT)}, {yml.relative_to(ROOT)}')
    print(f'다음: python3 tools/art/build_content.py --only {args.id} --debug /tmp/art-debug')


if __name__ == '__main__':
    main()
