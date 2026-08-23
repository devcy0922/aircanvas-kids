/**
 * MediaPipe HandLandmarker 래퍼.
 *
 * - WASM/모델은 CDN에서 로드(오프라인 배포 시 로컬 assets 으로 교체 가능)
 * - 검지 끝(LANDMARK #8)과 엄지 끝(#4) 거리로 핀치 판정
 * - 카메라 프레임을 video 엘리먼트에 그리고 detectForVideo 로 추론
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const INDEX_TIP = 8;
export const THUMB_TIP = 4;

let landmarkerPromise: Promise<HandLandmarker> | null = null;

export function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })();
  }
  return landmarkerPromise;
}

export interface TrackedHand {
  /** 검지 끝 정규화 좌표 (카메라 이미지 기준) */
  indexTip: { x: number; y: number };
  /** 핀치 여부 (엄지-검지 거리가 손 크기의 일정 비율 이하) */
  pinch: boolean;
}

/** results.landmarks[0] 을 TrackedHand 로 변환 */
export function toTrackedHand(lm: { x: number; y: number; z: number }[]): TrackedHand | null {
  if (!lm || lm.length <= Math.max(INDEX_TIP, THUMB_TIP)) return null;
  const tip = lm[INDEX_TIP];
  const thumb = lm[THUMB_TIP];
  // 손 크기 정규화: 손목(#0)~중지 뿌리(#9) 거리를 기준 스케일로 사용
  const wrist = lm[0];
  const midRoot = lm[9];
  const scale = Math.hypot(midRoot.x - wrist.x, midRoot.y - wrist.y) || 1e-6;
  const d = Math.hypot(tip.x - thumb.x, tip.y - thumb.y);
  return {
    indexTip: { x: tip.x, y: tip.y },
    pinch: d / scale < 0.42,
  };
}
