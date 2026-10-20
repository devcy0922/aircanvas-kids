"""색칠 화면 UI 스모크: 폰 크기에서 터치 색칠 흐름을 실제로 눌러 보고 스크린샷을 남긴다.

`make ui-smoke`로 web-bot 컨테이너(격리 Playwright Chromium)에서 실행한다. 빌드 통과만으로는
화면이 깨졌는지 알 수 없어서, 아래를 실제 브라우저로 확인한다.

- 390x844 / 360x740 폰 화면에서 가로 스크롤·잘림이 없는가
- 모든 도안의 선화 이미지가 200으로 로드되는가, 색칠 칸이 충분한가
- 칸을 한 번 탭하면 한 칸만 채워지고, 되돌리기 한 번으로 정확히 원복되는가
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
