"""색칠 화면 UI 스모크: 폰 크기에서 터치 색칠 흐름을 실제로 눌러 보고 스크린샷을 남긴다.

`make ui-smoke`로 web-bot 컨테이너(격리 Playwright Chromium)에서 실행한다. 빌드 통과만으로는
화면이 깨졌는지 알 수 없어서, 아래를 실제 브라우저로 확인한다.

- 390x844 / 360x740 폰 화면에서 가로 스크롤·잘림이 없는가
- 모든 도안의 선화 이미지가 200으로 로드되는가, 색칠 칸이 충분한가
- 칸을 한 번 탭하면 한 칸만 채워지고, 되돌리기 한 번으로 정확히 원복되는가
- 월드: 원래 살던 친구(NPC)가 보이고, 내 친구가 알에서 부화하며, 내가 칠한 색이 그대로 남고, 모두 실제로 움직이는가
- 콘솔 오류와 실패한 요청이 없는가

실패하면 종료 코드 1. 스크린샷은 $AIRCANVAS_EVIDENCE_ROOT/ui-smoke/ 아래에 저장된다.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import Page, async_playwright

PHONE_BASE = os.environ.get("AIRCANVAS_PHONE_URL", "http://127.0.0.1:7101/")
EVIDENCE = Path(os.environ.get("AIRCANVAS_EVIDENCE_ROOT", "/workspace/logs/evidence")) / "ui-smoke"
VIEWPORTS = [(390, 844), (360, 740)]
MIN_REGIONS = 12

failures: list[str] = []
console_errors: list[str] = []
bad_responses: list[str] = []


def check(ok: bool, message: str) -> None:
    print(("  ✓ " if ok else "  ✗ ") + message)
    if not ok:
        failures.append(message)


async def filled_count(page: Page) -> int:
    return await page.locator("path.touch-region.is-filled").count()


async def open_touch_game(page: Page) -> None:
    await page.goto(PHONE_BASE, wait_until="networkidle")
    await page.get_by_text("카메라 없이 터치로 해보기").first.click()
    await page.locator('[data-testid="touch-game"]').wait_for(timeout=15_000)
    await page.wait_for_timeout(500)


async def overflow_report(page: Page) -> dict:
    return await page.evaluate(
        """() => {
          const vw = window.innerWidth;
          const wide = [...document.querySelectorAll('.touch-game *')]
            .filter((el) => {
              const r = el.getBoundingClientRect();
              if (!(r.width > 0 && (r.right > vw + 1 || r.left < -1))) return false;
              // 가로 스크롤 칩 줄(테마·도안 선택) 안쪽은 의도된 넘침이다
              for (let p = el.parentElement; p; p = p.parentElement) {
                const ox = getComputedStyle(p).overflowX;
                if (ox === 'auto' || ox === 'scroll') return false;
              }
              return true;
            })
            .slice(0, 5)
            .map((el) => (el.tagName + '.' + el.className.toString()).slice(0, 50) + ':' + Math.round(el.getBoundingClientRect().right));
          return { scrollW: document.documentElement.scrollWidth, vw, wide };
        }"""
    )



async def paint_regions(page: Page, count: int) -> list[str]:
    """앞쪽 영역 count개를 서로 다른 팔레트 색으로 탭해 칠하고, 쓴 색(rgb)을 돌려준다."""
    chips = page.locator(".palette-chip")
    used: list[str] = []
    for i in range(count):
        chip = chips.nth(i * 2)
        rgb = await chip.evaluate("el => getComputedStyle(el).backgroundColor")
        await chip.click()
        target = page.locator("path.touch-region").nth(i)
        point = await target.evaluate(
            """(el) => {
              const svg = el.ownerSVGElement; const len = el.getTotalLength();
              for (let i = 0; i < 80; i++) {
                const p = el.getPointAtLength((len * i) / 80);
                const q = svg.createSVGPoint(); q.x = p.x; q.y = p.y;
                const s = q.matrixTransform(svg.getScreenCTM());
                if (document.elementFromPoint(s.x, s.y) === el) return { x: s.x, y: s.y };
              }
              return null;
            }"""
        )
        if point:
            await page.touchscreen.tap(point["x"], point["y"])
            used.append(rgb)
    return used


COLOR_PROBE = """async (targets) => {
  // 내 친구(mine-*)의 부위 레이어를 한 캔버스에 겹쳐 놓고, 칠한 색 근처 픽셀 수를 센다
  const actor = document.querySelector('.w-actor[data-actor^="mine-"]');
  if (!actor) return null;
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 384;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  for (const img of actor.querySelectorAll('image')) {
    const el = new Image(); el.src = img.getAttribute('href');
    await el.decode(); ctx.drawImage(el, 0, 0, 384, 384);
  }
  const data = ctx.getImageData(0, 0, 384, 384).data;
  return targets.map(([r, g, b]) => {
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && Math.abs(data[i] - r) < 14 && Math.abs(data[i + 1] - g) < 14 && Math.abs(data[i + 2] - b) < 14) n++;
    }
    return n;
  });
}"""


async def check_world(page: Page, width: int, height: int) -> None:
    """칠한 뒤 '친구 깨우기'로 월드에 들어가 부화·NPC·색 보존·움직임을 확인한다."""
    print("  [월드]")
    await page.locator(".touch-art-list button").first.click()
    await page.wait_for_timeout(300)
    used = await paint_regions(page, 3)
    check(len(used) == 3, f"서로 다른 색으로 3칸 칠함 {used}")
    await page.locator(".wake-up-btn").click(force=True)
    await page.locator('[data-testid="touch-world"]').wait_for(timeout=10_000)

    # 부화 연출: 알이 보였다가 사라지고 안내가 뜬다
    saw_egg = False
    for _ in range(40):
        if await page.locator(".w-spawn-prop").count():
            saw_egg = True
            break
        await page.wait_for_timeout(150)
    check(saw_egg, "내 친구가 나타나기 전에 알(부화 연출)이 보임")
    await page.get_by_text("나타났어요", exact=False).first.wait_for(timeout=8_000)
    check(True, "부화 후 '나타났어요' 안내가 뜸")
    await page.wait_for_timeout(2500)
    await page.screenshot(path=str(EVIDENCE / f"{width}x{height}-world-1.png"))

    actors = await page.locator(".w-actor").count()
    species = await page.locator(".w-actor").evaluate_all("els => [...new Set(els.map(e => e.dataset.art))]")
    check(actors >= 6, f"월드에 친구 {actors}마리 (원래 살던 친구 + 내 친구, >= 6)")
    check(len(species) >= 4, f"서로 다른 도안 {len(species)}종 {species}")
    check(await page.locator('.w-actor[data-actor^="mine-"]').count() == 1, "내 친구가 월드에 1마리 있음")

    # 색 보존: 칠한 색이 월드의 내 친구에 그대로 남아 있어야 한다(예전에는 한 색으로 뭉개졌다)
    targets = []
    for rgb in used:
        nums = [int(v) for v in rgb.replace("rgb(", "").replace("rgba(", "").replace(")", "").split(",")[:3]]
        targets.append(nums)
    counts = await page.evaluate(COLOR_PROBE, targets)
    check(counts is not None and all(c > 150 for c in counts), f"칠한 색 3가지가 월드의 내 친구에 모두 남음 (픽셀 수 {counts})")

    # 움직임: 몇 초 사이에 여러 친구의 위치가 실제로 바뀐다
    async def positions() -> list[float]:
        return await page.locator(".w-actor").evaluate_all(
            "els => els.map(e => { const r = e.getBoundingClientRect(); return Math.round(r.x + r.width / 2); })"
        )

    before = await positions()
    await page.wait_for_timeout(5500)
    after = await positions()
    moved = sum(1 for b, a in zip(before, after) if abs(a - b) > 6)
    check(moved >= 3, f"5.5초 사이에 {moved}마리가 이동 (>= 3)")
    await page.screenshot(path=str(EVIDENCE / f"{width}x{height}-world-2.png"))

    # 친구를 누르면 반응(하트/별 파티클)
    hero = page.locator('.w-actor[data-actor^="mine-"] rect').first
    box = await hero.bounding_box()
    if box:
        await page.touchscreen.tap(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        await page.wait_for_timeout(200)
        check(await page.locator(".world-layer--fx text").count() > 0, "친구를 누르면 반응 파티클이 뜸")

    report = await page.evaluate(
        "() => ({ scrollW: document.documentElement.scrollWidth, vw: window.innerWidth, sceneH: document.querySelector('.touch-world__scene').getBoundingClientRect().height })"
    )
    check(report["scrollW"] <= report["vw"] + 1, f"월드 화면 가로 스크롤 없음 (scrollWidth={report['scrollW']})")
    check(report["sceneH"] > 230, f"월드 장면이 충분히 큼 (높이 {round(report['sceneH'])}px)")


async def run_viewport(browser, width: int, height: int) -> None:
    print(f"\n[{width}x{height}]")
    context = await browser.new_context(
        viewport={"width": width, "height": height}, device_scale_factor=2, is_mobile=True, has_touch=True
    )
    page = await context.new_page()
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: console_errors.append(str(e)))
    page.on(
        "response",
        lambda r: bad_responses.append(f"{r.status} {r.url}") if r.status >= 400 else None,
    )
    image_status: dict[str, int] = {}
    page.on(
        "response",
        lambda r: image_status.__setitem__(r.url, r.status) if "/artworks/images/" in r.url else None,
    )

    await open_touch_game(page)
    await page.locator('.touch-theme-chip', has_text="공룡").click()
    names = await page.locator(".touch-art-list button").all_inner_texts()
    check(len(names) >= 5, f"공룡 도안 {len(names)}종 표시")

    for idx, name in enumerate(names):
        await page.locator(".touch-art-list button").nth(idx).click()
        await page.wait_for_timeout(400)
        regions = await page.locator("path.touch-region").count()
        check(regions >= MIN_REGIONS, f"{name}: 색칠 칸 {regions}개 (>= {MIN_REGIONS})")
        shot = EVIDENCE / f"{width}x{height}-{idx}-{name}.png"
        await page.screenshot(path=str(shot), full_page=True)

    # 탭 1회 = 채우기 1회 = 되돌리기 1회 (중복 이벤트 회귀 방지)
    await page.locator(".touch-art-list button").first.click()
    await page.wait_for_timeout(300)
    before = await filled_count(page)
    target = page.locator("path.touch-region").nth(3)
    box = await target.bounding_box()
    check(box is not None, "대상 칸의 화면 좌표 확보")
    if box:
        # 칸 안쪽의 실제 점을 찾아 진짜 터치(탭)로 누른다
        point = await target.evaluate(
            """(el) => {
              const svg = el.ownerSVGElement; const len = el.getTotalLength();
              for (let i = 0; i < 60; i++) {
                const p = el.getPointAtLength((len * i) / 60);
                const q = svg.createSVGPoint(); q.x = p.x; q.y = p.y;
                const m = svg.getScreenCTM(); const s = q.matrixTransform(m);
                const t = document.elementFromPoint(s.x, s.y);
                if (t === el) return { x: s.x, y: s.y };
              }
              return null;
            }"""
        )
        if point is None:
            point = {"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}
        await page.touchscreen.tap(point["x"], point["y"])
        await page.wait_for_timeout(300)
        after = await filled_count(page)
        check(after == before + 1, f"한 번 탭하면 한 칸만 채워짐 ({before} → {after})")
        await page.get_by_label("한 단계 되돌리기").click()
        await page.wait_for_timeout(200)
        check(await filled_count(page) == before, "되돌리기 한 번에 원복")

    report = await overflow_report(page)
    check(report["scrollW"] <= report["vw"] + 1, f"가로 스크롤 없음 (scrollWidth={report['scrollW']}, viewport={report['vw']})")
    check(not report["wide"], f"화면 밖으로 나간 요소 없음 {report['wide'] or ''}")

    for url, status in image_status.items():
        check(status == 200, f"선화 이미지 로드 {status} {url.rsplit('/', 1)[-1]}")

    # 자유 붓칠 모드 안내 문구가 한 덩어리로 보인다(예전에는 이름과 겹쳐 깨졌다)
    await page.get_by_role("button", name="자유 붓칠").click()
    label = await page.locator(".touch-board-label").bounding_box()
    check(label is not None and label["height"] < 40 and label["x"] >= 0 and label["x"] + label["width"] <= width + 1,
          f"붓칠 안내 문구가 한 줄로 화면 안에 들어옴 ({label and round(label['height'])}px)")
    await page.screenshot(path=str(EVIDENCE / f"{width}x{height}-brush-label.png"))
    await page.get_by_role("button", name="칸 채우기").click()

    if width == VIEWPORTS[0][0]:
        await check_world(page, width, height)
    await context.close()


async def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(args=["--no-sandbox"])
        for width, height in VIEWPORTS:
            await run_viewport(browser, width, height)
        await browser.close()

    print("\n[공통]")
    check(not console_errors, f"콘솔 오류 없음 {console_errors[:3] or ''}")
    check(not bad_responses, f"실패한 요청 없음 {bad_responses[:3] or ''}")
    (EVIDENCE / "result.json").write_text(
        json.dumps({"url": PHONE_BASE, "failures": failures}, ensure_ascii=False, indent=2)
    )
    print(f"\n{'통과' if not failures else f'실패 {len(failures)}건'} — 증적: {EVIDENCE}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
