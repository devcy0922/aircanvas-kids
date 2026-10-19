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
            touch = await context.new_page()
            pages = {"tv": tv, "phone": phone, "touch": touch}
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

            # 모든 영역을 채우지 않아도 갤러리로 넘어가고, 내보내기 후
            # TV가 실제 정글 월드 씬으로 전환되는 제품 요구사항을 확인한다.
            await phone.locator("[data-testid='skip-artwork']").click()
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "scene=gallery")
            await wait_for_text(phone, "body", "여기까지 만든 모습 그대로")
            await phone.locator("[data-testid='export-world']").click()
            await wait_for_text(tv, "[data-testid='tv-debug-state']", "scene=world")
            await wait_for_text(phone, "body", "내 캐릭터가 실제 정글을 돌아다니고 있어요")
            await recorder.save_screenshot(phone, "07-phone-world.png")
            await recorder.save_screenshot(tv, "08-tv-world.png")
            recorder.record(
                "verify_world_export",
                "completed",
                "미완성 작품 건너뛰기 → 갤러리 → 정글 월드 내보내기를 확인했습니다.",
            )

            # 연결 게임과 분리된 터치 경로에서 기본 원형 붓이 지나간
            # 궤적만 남는지 확인하고, 공룡/바다 작품을 각 월드로 내보낸다.
            touch_url = app_url(PHONE_BASE, content=CONTENT, room=ROOM)
            await touch.set_viewport_size({"width": 390, "height": 844})
            await touch.goto(touch_url, wait_until="domcontentloaded", timeout=30_000)
            await wait_for_text(touch, "[data-testid='phone-welcome']", "AirCanvas Kids")
            await touch.locator("[data-testid='phone-touch-start']").click()
            await touch.locator("[data-testid='touch-game']").wait_for(state="visible", timeout=30_000)
            touch_board = touch.locator(".touch-board")
            if await touch_board.get_attribute("data-brush") != "round":
                raise AssertionError("기본 터치 도구가 원형 붓이 아닙니다.")
            if await touch_board.get_attribute("data-brush-size") != "7":
                raise AssertionError("기본 붓이 세부 채색용 크기 7이 아닙니다.")
            await touch.get_by_role("button", name="2×").click()
            if await touch_board.get_attribute("data-zoom") != "2":
                raise AssertionError("2배 세부 확대가 도안에 적용되지 않았습니다.")
            touch_box = await touch_board.bounding_box()
            if touch_box is None:
                raise AssertionError("터치 보드를 찾지 못했습니다.")
            start = {"x": touch_box["x"] + touch_box["width"] * 0.35, "y": touch_box["y"] + touch_box["height"] * 0.55}
            end = {"x": touch_box["x"] + touch_box["width"] * 0.68, "y": touch_box["y"] + touch_box["height"] * 0.58}
            await touch.mouse.move(start["x"], start["y"])
            await touch.mouse.down()
            await touch.mouse.move(end["x"], end["y"], steps=8)
            await touch.mouse.up()
            if await touch.locator("[data-testid='paint-layer'] polyline").count() < 1:
                raise AssertionError("원형 붓 궤적이 SVG 클립 레이어에 남지 않았습니다.")
            await recorder.save_screenshot(touch, "09-touch-painted-mobile.png")
            await touch.locator("[data-testid='touch-export']").click()
            await touch.locator("[data-testid='touch-world']").wait_for(state="visible", timeout=30_000)
            if await touch.locator("[data-testid='touch-world']").get_attribute("data-world") != "jungle":
                raise AssertionError("공룡 작품이 정글 월드로 내보내지지 않았습니다.")
            if await touch.locator(".world-creature[data-route]").count() != 1:
                raise AssertionError("첫 작품이 월드에 하나의 생물로 남지 않았습니다.")
            route = int(await touch.locator(".world-creature").get_attribute("data-route") or "0")
            if route not in range(1, 6):
                raise AssertionError("생물이 5개 월드 경로 중 하나를 선택하지 않았습니다.")
            if await touch.locator(".behavior-stomp").count() != 1:
                raise AssertionError("티라노 고유의 무거운 보행 동작이 선택되지 않았습니다.")
            await recorder.save_screenshot(touch, "10-touch-jungle-world-mobile.png")

            await touch.get_by_role("button", name="이 그림 더 칠하기").click()
            await touch.locator(".touch-theme-list button").filter(has_text="바다").click()
            await touch.locator("[data-testid='touch-game']").wait_for(state="visible")
            touch_box = await touch.locator(".touch-board").bounding_box()
            if touch_box is None:
                raise AssertionError("바다 터치 보드를 찾지 못했습니다.")
            await touch.mouse.move(touch_box["x"] + touch_box["width"] * 0.25, touch_box["y"] + touch_box["height"] * 0.5)
            await touch.mouse.down()
            await touch.mouse.move(touch_box["x"] + touch_box["width"] * 0.66, touch_box["y"] + touch_box["height"] * 0.5, steps=10)
            await touch.mouse.up()
            await touch.locator("[data-testid='touch-export']").click()
            await touch.locator("[data-testid='touch-world'][data-world='ocean']").wait_for(state="visible", timeout=30_000)
            if await touch.locator(".behavior-swim").count() != 1:
                raise AssertionError("열대어가 보행 대신 유영 동작을 사용하지 않았습니다.")
            saved_count = await touch.evaluate(
                "room => JSON.parse(sessionStorage.getItem(`aircanvas.touch-world.v1:${room}`) || '[]').length",
                ROOM,
            )
            if saved_count != 2:
                raise AssertionError(f"같은 룸의 정글·바다 작품 2개가 누적되지 않았습니다: {saved_count}")
            await recorder.save_screenshot(touch, "11-touch-ocean-world-mobile.png")
            await touch.get_by_role("button", name="모두 지우고 새로 그리기").click()
            await touch.locator("[data-testid='touch-game']").wait_for(state="visible")
            saved_count = await touch.evaluate(
                "room => JSON.parse(sessionStorage.getItem(`aircanvas.touch-world.v1:${room}`) || '[]').length",
                ROOM,
            )
            if saved_count != 0:
                raise AssertionError("전체 초기화 후에도 룸 작품이 남아 있습니다.")
            recorder.record(
                "verify_touch_export",
                "completed",
                "원형 붓 궤적 클리핑 → 공룡 정글/물고기 바다 월드 내보내기를 확인했습니다.",
            )

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
                    "states": ["home", "calib", "play", "gallery", "world", "touch-world"],
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
