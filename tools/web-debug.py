"""web-bot 컨테이너에서 실행하는 AirCanvas Kids 웹 연동 검증.

실기기 카메라 대신 앱의 ``?debug=1`` 패널을 사용하지만, 폰 상태 머신 →
릴레이 → TV 커맨드 핸들러 경로는 그대로 통과한다. 브라우저는 기존 호스트
CDP 세션에 붙지 않고, web-bot 이미지 안에서 격리된 Playwright Chromium을
실행한다. 원본 HTML/쿠키/쿼리 문자열은 증적에 저장하지 않고, 선별 텍스트·
스크린샷·상태 전이만 남긴다.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from urllib.parse import urlencode

from playwright.async_api import Page, async_playwright
from web_bot.core.evidence import EvidenceRecorder, safe_url


ROOM = os.environ.get("AIRCANVAS_DEBUG_ROOM", "WEBDBG")
TV_BASE = os.environ.get("AIRCANVAS_TV_URL", "http://127.0.0.1:7100/")
PHONE_BASE = os.environ.get("AIRCANVAS_PHONE_URL", "http://127.0.0.1:7101/")
SERVER = os.environ.get("AIRCANVAS_SERVER", "http://127.0.0.1:8180")
CONTENT = os.environ.get("AIRCANVAS_CONTENT", "http://127.0.0.1:8081")
EVIDENCE_ROOT = Path(os.environ.get("AIRCANVAS_EVIDENCE_ROOT", "/workspace/logs/evidence"))


def app_url(base: str, **params: str) -> str:
    query = urlencode(params)
    return f"{base.rstrip('/')}/?{query}"


async def wait_for_text(page: Page, selector: str, text: str, timeout_ms: int = 30_000) -> str:
    deadline = time.monotonic() + timeout_ms / 1000
    locator = page.locator(selector)
    last = ""
    while time.monotonic() < deadline:
        try:
            last = await locator.inner_text(timeout=500)
            if text in last:
                return last
        except Exception:
            pass
        await asyncio.sleep(0.25)
    raise AssertionError(f"{selector}에서 {text!r}을 확인하지 못했습니다. 마지막 텍스트={last!r}")


async def click_and_wait(
    page: Page,
    selector: str,
    wait_selector: str,
    wait_text: str | None = None,
) -> None:
    await page.locator(selector).click()
    if wait_text is not None:
        await wait_for_text(page, wait_selector, wait_text)
    else:
        await page.locator(wait_selector).wait_for(state="visible", timeout=30_000)


def attach_diagnostics(
    pages: dict[str, Page], diagnostics: dict[str, list[str]]
) -> None:
    for name, page in pages.items():
        page.on(
            "console",
            lambda message, page_name=name: diagnostics["consoleErrors"].append(
                f"{page_name}:{message.type}:{message.text[:300]}"
            )
            if message.type == "error"
            else None,
        )
        page.on(
            "pageerror",
            lambda error, page_name=name: diagnostics["pageErrors"].append(
                f"{page_name}:{str(error)[:300]}"
            ),
        )
        page.on(
            "requestfailed",
            lambda request, page_name=name: diagnostics["requestFailures"].append(
                f"{page_name}:{request.url.split('?')[0]}:{request.failure}"
            ),
        )


async def main() -> int:
    run_id = f"aircanvas-web-{int(time.time())}"
    task = "AirCanvas Kids 웹 디버그: 소개 홈에서 플레이 커맨드까지"
    recorder = EvidenceRecorder(run_id, task, root=EVIDENCE_ROOT / run_id)
    diagnostics: dict[str, list[str]] = {
        "consoleErrors": [],
        "pageErrors": [],
        "requestFailures": [],
    }
    pages: dict[str, Page] = {}

    recorder.record("init", "started", "웹 디버그 실행을 시작합니다.", {"room": ROOM})
    browser = None
    try:
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server"],
            )
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="ko-KR",
                timezone_id="Asia/Seoul",
            )
            tv = await context.new_page()
            phone = await context.new_page()
            pages = {"tv": tv, "phone": phone}
            attach_diagnostics(pages, diagnostics)

            tv_url = app_url(TV_BASE, server=SERVER, room=ROOM, phoneApp=PHONE_BASE, debug="1")
            phone_url = app_url(PHONE_BASE, server=SERVER, content=CONTENT, room=ROOM, debug="1")
            recorder.record(
                "navigate",
                "running",
                "TV와 폰 웹 페이지를 같은 테스트 방으로 엽니다.",
                {"tvUrl": safe_url(tv_url), "phoneUrl": safe_url(phone_url)},
            )
            await tv.goto(tv_url, wait_until="domcontentloaded", timeout=30_000)
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "scene=home")
            await wait_for_text(tv, "[data-testid='tv-home']", "AirCanvas Kids")
            await recorder.save_screenshot(tv, "01-tv-home.png")

            await phone.goto(phone_url, wait_until="domcontentloaded", timeout=30_000)
            await wait_for_text(phone, "[data-testid='phone-welcome']", "AirCanvas Kids")
            await recorder.save_screenshot(phone, "02-phone-welcome.png")
            recorder.record("verify_home", "completed", "TV 홈과 폰 소개 홈을 확인했습니다.")

            await click_and_wait(phone, "[data-testid='phone-start']", "[data-testid='theme-dino']")
            await wait_for_text(phone, "body", "TV 연결됨")
            await click_and_wait(phone, "[data-testid='theme-dino']", "[data-testid='theme-start']")
            await click_and_wait(
                phone,
                "[data-testid='theme-start']",
                "[data-testid='web-debug-panel']",
                "캘리브레이션",
            )
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "scene=calib")
            await recorder.save_screenshot(phone, "03-phone-calibration.png")
            recorder.record(
                "verify_selection",
                "completed",
                "시작하기 → 공룡 선택 → 테마 시작 → 캘리브레이션을 확인했습니다.",
            )

            await click_and_wait(
                phone,
                "[data-testid='web-debug-calibrate']",
                "[data-testid='web-debug-panel']",
                "플레이",
            )
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "scene=play")
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "content=dino-trex")
            await recorder.save_screenshot(phone, "04-phone-play.png")
            await recorder.save_screenshot(tv, "05-tv-play.png")
            recorder.record("verify_play", "completed", "웹 자동 캘리브레이션 후 TV play 씬을 확인했습니다.")

            await phone.locator("[data-testid='web-debug-point']").click()
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "last=set-cursor")
            await phone.locator("[data-testid='web-debug-fill']").click()
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "last=fill-at")
            await phone.locator("[data-testid='web-debug-stroke']").click()
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "last=draw-stroke")
            recorder.record(
                "verify_commands",
                "completed",
                "커서·채우기·스트로크 커맨드가 TV까지 전달되었습니다.",
            )
            await recorder.save_screenshot(tv, "06-tv-after-commands.png")

            phone_text = await phone.locator("body").inner_text()
            tv_text = await tv.locator("[data-testid='tv-debug-state']").inner_text()
            canvas_state = await tv.locator("canvas").evaluate(
                """(canvas) => ({
                    width: canvas.width,
                    height: canvas.height,
                    clientWidth: canvas.clientWidth,
                    clientHeight: canvas.clientHeight,
                    webgl2: Boolean(canvas.getContext('webgl2')),
                    webgl: Boolean(canvas.getContext('webgl')),
                })"""
            )
            recorder.save_text("phone-state.txt", phone_text)
            recorder.save_text("tv-state.txt", tv_text)
            recorder.save_json(
                "result.json",
                {
                    "status": "completed",
                    "transport": "isolated_playwright_in_web_bot_container",
                    "room": ROOM,
                    "tvUrl": safe_url(tv_url),
                    "phoneUrl": safe_url(phone_url),
                    "states": ["home", "calib", "play"],
                    "commands": ["set-cursor", "fill-at", "draw-stroke"],
                    "canvas": canvas_state,
                    "diagnostics": diagnostics,
                },
            )
            recorder.finish("completed", {"message": "웹 디버그 플로우와 TV 커맨드 전달을 검증했습니다."})
            print(
                json.dumps(
                    {"status": "completed", "runId": run_id, "evidenceDir": str(recorder.root)},
                    ensure_ascii=False,
                )
            )
            await browser.close()
            browser = None
            return 0
    except Exception as error:
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass
        for name, page in pages.items():
            try:
                await recorder.save_screenshot(page, f"failure-{name}.png")
            except Exception:
                pass
        recorder.save_json(
            "failure.json",
            {"status": "failed", "error": str(error), "diagnostics": diagnostics},
        )
        recorder.finish("failed", {"message": str(error)})
        print(
            json.dumps(
                {
                    "status": "failed",
                    "runId": run_id,
                    "evidenceDir": str(recorder.root),
                    "error": str(error),
                },
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
