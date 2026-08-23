/**
 * 캘리브레이션 상태의 저장/로드.
 * localStorage 키: ht.calibration.v1
 */
import type { Mat3 } from './homography';
import type { CornerPair } from './homography';

const KEY = 'ht.calibration.v1';

export interface CalibrationData {
  corners: CornerPair[];
  matrix: Mat3;
  errorPct: number;
  savedAt: number;
}

export function saveCalibration(data: CalibrationData) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function loadCalibration(): CalibrationData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CalibrationData;
    if (!data?.matrix || data.matrix.length !== 9 || !Array.isArray(data.corners)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearCalibration() {
  localStorage.removeItem(KEY);
}
