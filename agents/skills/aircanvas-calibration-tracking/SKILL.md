---
name: aircanvas-calibration-tracking
description: >-
  AirCanvas Kids의 MediaPipe Hand Tracking, 4-Corner Homography 투영 변환, 1-Euro Filter 지터 완화, Pinch 제스처 실연동 및 햅틱 피드백 가이드.
---

# AirCanvas Kids 캘리브레이션 & 핸드 트래킹 가이드

스마트폰 카메라로 어린이가 허공에 그리는 손동작을 TV 화면의 정밀한 좌표로 매핑하는 핵심 비전 및 보정 파이프라인입니다.

## 1. Zero-Frame 비전 원칙 (프라이버시 및 저지연)

- 스마트폰에서 웹캠 비디오 프레임 전체를 네트워크로 송출하는 것은 **엄격히 금지**됩니다.
- 모바일 브라우저의 WebRTC `getUserMedia` 프레임은 온디바이스 WASM 환경(`@mediapipe/tasks-vision`)에서만 처리됩니다.
- 오직 추출된 검지 끝 2D 좌표와 핀치 상태 플래그만 서버로 송신합니다 (~30Hz, 패킷당 ~100B 이하).

---

## 2. 4-코너 호모그래피 (4-Corner Homography)

카메라가 TV 화면을 비스듬히 바라보고 있어도, TV 화면의 4개 코너 점을 기준으로 원근 투영 변환(Perspective Transform)을 수행하여 평면 왜곡을 완벽히 보정합니다.

### 캘리브레이션 프로세스
1. TV 화면 4개 모서리에 순차적으로 타겟 마커(Top-Left, Top-Right, Bottom-Right, Bottom-Left)를 표시.
2. 사용자가 스마트폰 카메라 뷰파인더(`CalibViewfinder.tsx`)에서 TV 모서리 4점을 터치하거나 손끝으로 지정.
3. 카메라 좌표 $(u_i, v_i)$와 정규화된 TV 목표 좌표 $(x_i, y_i) \in \{(0,0), (1,0), (1,1), (0,1)\}$ 간의 $3 \times 3$ 호모그래피 행렬 $H$ 계산.

---

## 3. 손 떨림 및 지터 보정: 1-Euro Filter

- `apps/phone/src/lib/oneEuro.ts`
- **핵심 파라미터:**
  - `minCutoff` ($f_{c,min}$): 저속 이동 시 부드러움을 결정 (기본값: ~1.0 Hz).
  - `beta` ($\beta$): 고속 이동 시 지연을 줄이는 속도 계수 (기본값: ~0.007).
  - `dCutoff`: 도함수 컷오프 주파수 (기본값: 1.0 Hz).

---

## 4. 손 랜드마크 및 Pinch 제스처 실연동

### 랜드마크 인덱스 (MediaPipe Hand Landmarker)
- 검지 끝 (Index Finger Tip): `Landmark #8` (기본 포인터 위치)
- 엄지 끝 (Thumb Tip): `Landmark #4`
- 손목 (Wrist): `Landmark #0`

### 핀치(Pinch) 제스처 인터랙션 모델
- 엄지 끝(#4)과 검지 끝(#8) 간의 거리가 임계값 이하일 때 `hand.pinch = true` 판정.
- **모드별 동작:**
  1. **색칠 모드 (`mode: fill`):**
     - 핀치 시작 순간(`isPinching && !wasPinching`)에 `fill-at` 커맨드 발행.
     - `navigator.vibrate(40)` 햅틱 피드백으로 손끝에 붓이 닿는 느낌 전달.
  2. **그리기 모드 (`mode: free`):**
     - 핀치 유지 중 실시간 좌표 수집, 핀치 해제 시 `draw-stroke` 일괄 전송.
  3. **커서 호버:**
     - 핀치 여부와 무관하게 30Hz로 TV 화면에 매끄러운 원형 포인터(`set-cursor`) 투영.
