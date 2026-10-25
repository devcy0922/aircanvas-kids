# TV Kiosk 모드 설정 가이드

> **목표:** TV 전원을 켜면 자동으로 AirCanvas TV 앱(웹페이지)이 실행되어,
> 사용자가 TV를 별도로 조작할 필요 없이 즉시 게임 대기 상태에 들어간다.

## 사전 조건

- AirCanvas 릴레이 서버가 LAN 내 PC에서 실행 중 (`http://<서버IP>:7180`)
- TV 앱이 빌드되어 서빙 중 (`http://<서버IP>:7100` 또는 별도 호스트)
- TV와 서버가 **같은 Wi-Fi/LAN**에 연결

## 방법 1: 일반 PC/노트북을 TV 대용으로 (테스트용, 가장 쉬움)

Chrome/Chromium을 Kiosk 모드로 실행하여 전체 화면으로 TV 앱을 표시한다.

### Linux (cy-server / Raspberry Pi)

```bash
# Chromium Kiosk 모드 실행
chromium-browser --kiosk --noerrdialogs --disable-infobars \
  --disable-session-crashed-bubble --disable-translate \
  "http://192.168.0.10:7100?room=DEMO01"
```

### macOS

```bash
# Chrome Kiosk 모드
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --kiosk --noerrdialogs --disable-infobars \
  "http://192.168.0.10:7100?room=DEMO01"
```

### Windows

```powershell
# Chrome Kiosk 모드
Start-Process "chrome.exe" -ArgumentList "--kiosk", "--noerrdialogs", "--disable-infobars", "http://192.168.0.10:7100?room=DEMO01"
```

### 부팅 시 자동 실행 (Linux systemd)

```ini
# /etc/systemd/system/aircanvas-tv.service
[Unit]
Description=AirCanvas TV Kiosk
After=network-online.target graphical.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
ExecStart=/usr/bin/chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble "http://192.168.0.10:7100?room=DEMO01"
Restart=on-failure
RestartSec=5

[Install]
WantedBy=graphical.target
```

```bash
sudo systemctl enable aircanvas-tv
sudo systemctl start aircanvas-tv
```

## 방법 2: Raspberry Pi + 모니터/TV (권장 — 저렴하고 안정적)

Raspberry Pi를 TV에 HDMI로 연결하여 전용 Kiosk 장치로 사용한다.

### 설정 절차

1. **Raspberry Pi OS Lite** 설치 후 X 서버 + Chromium 설치:
   ```bash
   sudo apt update && sudo apt install -y xserver-xorg xinit chromium-browser
   ```

2. **자동 로그인** 활성화:
   ```bash
   sudo raspi-config  # System Options → Boot / Auto Login → Console Autologin
   ```

3. **Kiosk 스크립트** 생성 (`/home/pi/kiosk.sh`):
   ```bash
   #!/bin/bash
   xset -dpms       # 화면 절전 비활성화
   xset s off        # 스크린세이버 비활성화
   xset s noblank

   # TV 앱 URL (서버 IP와 방 코드 설정)
   TV_URL="http://192.168.0.10:7100?room=DEMO01"

   chromium-browser --kiosk --noerrdialogs --disable-infobars \
     --disable-session-crashed-bubble --disable-translate \
     --check-for-update-interval=31536000 \
     "$TV_URL"
   ```
   ```bash
   chmod +x /home/pi/kiosk.sh
   ```

4. **부팅 시 자동 실행** (`~/.bash_profile` 끝에 추가):
   ```bash
   [[ -z $DISPLAY && $XDG_VTNR -eq 1 ]] && startx /home/pi/kiosk.sh
   ```

5. **재부팅하면** Raspberry Pi가 자동으로 TV 앱을 전체 화면으로 표시한다.

## 방법 3: Android TV / Fire TV Stick

### Fully Kiosk Browser 사용

1. **Fully Kiosk Browser** 앱을 Google Play / Amazon Appstore에서 설치
   - 무료 버전 또는 유료($7.90, 더 안정적)
2. **시작 URL** 설정: `http://<서버IP>:7100?room=DEMO01`
3. **Settings → Other Settings → Launch on Boot** 활성화
4. **Settings → Web Content Settings → Autoplay Videos** 활성화
5. TV를 켜면 자동으로 AirCanvas TV 앱이 실행됨

### 대안: TV Bro 브라우저 + AutoStart

1. TV Bro 브라우저 설치
2. 홈페이지를 AirCanvas TV 앱 URL로 설정
3. AutoStart 앱으로 부팅 시 TV Bro 자동 실행 설정

## 방법 4: Samsung Tizen TV (커스텀 웹앱)

> ⚠️ 개발자 모드 활성화 필요. 테스트용으로만 권장.

1. **Tizen Studio** 설치 (PC에서)
2. **TV 개발자 모드** 활성화: TV 앱스 → 리모컨으로 `12345` 입력 → Developer mode ON → 개발 PC IP 입력
3. **Tizen 웹 프로젝트** 생성 → `index.html`에서 TV 앱 URL로 리다이렉트:
   ```html
   <!DOCTYPE html>
   <html>
   <head><meta http-equiv="refresh" content="0;url=http://192.168.0.10:7100?room=DEMO01"></head>
   <body></body>
   </html>
   ```
4. **패키징 → TV에 설치** (Tizen Studio의 Run As > Tizen Web Application)

## 방법 5: LG webOS TV (커스텀 앱)

> ⚠️ 개발자 모드 활성화 필요. 모드가 48시간마다 만료됨에 주의.

1. **webOS SDK** 설치
2. **TV 개발자 모드** 활성화: LG Content Store → Dev Mode 앱 설치
3. 웹앱 프로젝트 생성 → `index.html`에서 TV 앱으로 리다이렉트
4. `ares-package` → `ares-install` → TV에 설치

---

## 권장 조합 (테스트 환경)

| 시나리오 | 추천 방법 | 비용 | 난이도 |
|---|---|---|---|
| **빠른 테스트** | 방법 1 (PC Chrome Kiosk) | 무료 | ⭐ |
| **실제 TV 테스트** | 방법 2 (Raspberry Pi) | ~₩50,000 | ⭐⭐ |
| **Android TV 보유** | 방법 3 (Fully Kiosk) | 무료~$8 | ⭐ |
| **Samsung TV 보유** | 방법 4 (Tizen 웹앱) | 무료 | ⭐⭐⭐ |

---

## 전체 사용 시나리오

```
[1회 설정]
   └→ TV(또는 Kiosk 장치)에 위 방법 중 하나 적용

[매번 사용]
   1. 사용자가 TV 전원을 켠다 (유일한 TV 조작)
   2. TV가 부팅 → Kiosk 브라우저 → AirCanvas TV 앱 자동 실행
   3. TV 앱이 릴레이 서버에 WS 연결 → 대기 화면 표시
   4. 사용자가 폰 웹 브라우저에서 AirCanvas 폰 앱 접속
   5. 폰이 서버의 /announce API로 TV 자동 발견
   6. TV가 1대면 3초 후 자동 연결 → 게임 시작!
```
