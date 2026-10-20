"""사이트 구조 스모크: 포털(/) · 게임(/play/) · 엄빠(/cafe/) 연결을 실제 브라우저로 확인한다.

`make site-smoke`로 web-bot 컨테이너에서 실행한다(기본: 공개 URL, AIRCANVAS_SITE_URL로 변경).
- 포털: 서비스 카드 2개, 가로 넘침 없음(360/390/1280), 콘솔 오류·실패 요청 없음
- 포털 → 게임: 카드를 누르면 /play/ 소개 홈이 열리고 '카메라 없이 터치로 해보기'가 보인다
- 예전 링크: /?room=…&server=… 가 /play/ 로 이동하며 쿼리가 그대로 남는다
- 게임 → 포털: 소개 홈의 'kids 홈' 링크로 돌아온다
- 포털 → 엄빠: /cafe/ 가 열리고 시설 카드가 보이며, 데모 안내문과 포털 복귀 링크가 있다
실패하면 종료 코드 1. 스크린샷은 $AIRCANVAS_EVIDENCE_ROOT/site-smoke/ 아래에 저장된다.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

SITE = os.environ.get("AIRCANVAS_SITE_URL", "https://kids.aircanvas.kr/").rstrip("/") + "/"
EVIDENCE = Path(os.environ.get("AIRCANVAS_EVIDENCE_ROOT", "/workspace/logs/evidence")) / "site-smoke"
failures: list[str] = []
problems: list[str] = []


def check(ok: bool, message: str) -> None:
    print(("  ✓ " if ok else "  ✗ ") + message)
    if not ok:
        failures.append(message)


async def main() -> int:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for width, height in [(390, 844), (360, 640), (1280, 800)]:
            print(f"[포털 {width}x{height}]")
            page = await browser.new_page(viewport={"width": width, "height": height})
            page.on("console", lambda m: problems.append(f"console: {m.text}") if m.type == "error" else None)
            page.on("requestfailed", lambda r: problems.append(f"요청 실패: {r.url}"))
            page.on("response", lambda r: problems.append(f"HTTP {r.status}: {r.url}") if r.status >= 400 else None)
            await page.goto(SITE, wait_until="networkidle")
            await page.wait_for_timeout(800)
            check(await page.locator("li.portal__item").count() == 2, "서비스 카드 2개")
            over = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            check(over <= 0, f"가로 넘침 없음 (초과 {over}px)")
            await page.screenshot(path=str(EVIDENCE / f"portal-{width}.png"))
            await page.close()

        print("[포털 → 게임]")
        page = await browser.new_page(viewport={"width": 390, "height": 844})
        await page.goto(SITE, wait_until="networkidle")
        await page.get_by_test_id("service-play").click()
        await page.wait_for_url("**/play/**")
        await page.get_by_text("카메라 없이 터치로 해보기").first.wait_for(timeout=15_000)
        check(urlparse(page.url).path == "/play/", f"게임 주소 {urlparse(page.url).path}")
        await page.screenshot(path=str(EVIDENCE / "play-home.png"))

        print("[게임 → 포털]")
        await page.get_by_test_id("phone-home-link").click()
        await page.wait_for_url(SITE)
        check(await page.locator("li.portal__item").count() == 2, "'kids 홈'으로 포털에 돌아옴")

        print("[예전 링크]")
        await page.goto(SITE + "?room=ABC123&server=https%3A%2F%2Fexample.test", wait_until="networkidle")
        u = urlparse(page.url)
        check(u.path == "/play/" and "room=ABC123" in u.query and "server=" in u.query, f"/play/ 로 이동, 쿼리 보존: {u.path}?{u.query}")

        print("[포털 → 엄빠]")
        await page.goto(SITE, wait_until="networkidle")
        await page.get_by_test_id("service-cafe").click()
        await page.wait_for_url("**/cafe/**")
        await page.wait_for_selector(".facility-card", timeout=15_000)
        check(urlparse(page.url).path == "/cafe/", f"엄빠 주소 {urlparse(page.url).path}")
        check(await page.locator(".facility-card").count() >= 1, "시설 카드가 보임")
        check(await page.locator(".demo-notice").count() == 1, "데모 안내문이 보임")
        over = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        check(over <= 0, f"엄빠 가로 넘침 없음 (초과 {over}px)")
        await page.screenshot(path=str(EVIDENCE / "cafe.png"))
        await page.locator("#kidsHome").click()
        await page.wait_for_url(SITE)
        check(await page.locator("li.portal__item").count() == 2, "엄빠에서 포털로 돌아옴")
        await browser.close()

    check(not problems, "콘솔 오류·실패 요청 없음" + (f" — {problems[:5]}" if problems else ""))
    print("\n실패 %d건" % len(failures) if failures else "\n모두 통과")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
