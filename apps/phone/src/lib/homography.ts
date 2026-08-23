/**
 * 3×3 호모그래피 계산과 적용 (순수 함수, 의존성 없음)
 *
 * 4점 대응(카메라 정규화 좌표 → TV 정규화 좌표)으로 행렬을 풀고,
 * 추적 좌표에 적용한다. docs/calibration.md 참조.
 */

export type Mat3 = number[]; // 길이 9, row-major

export interface CornerPair {
  /** 카메라 정규화 좌표 */
  cam: { x: number; y: number };
  /** TV 목표 좌표 */
  tv: { x: number; y: number };
}

/** 8×8 선형시스템을 가우스 소거로 푼다 */
function solve8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * 4코너 대응으로 호모그래피를 계산한다.
 * 반환: [h11 h12 h13 h21 h22 h23 h31 h32 h33] (h33=1)
 */
export function computeHomography(pts: CornerPair[]): Mat3 | null {
  if (pts.length !== 4) return null;
  const A: number[][] = [];
  const b: number[] = [];
  for (const { cam, tv } of pts) {
    const { x: u, y: v } = cam;
    const { x: x, y: y } = tv;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  const sol = solve8(A, b);
  if (!sol || sol.some((v) => !Number.isFinite(v))) return null;
  // sol = [h11 h12 h13 h21 h22 h23 h31 h32]
  return [...sol, 1];
}

/** 정규화 좌표에 호모그래피 적용 */
export function applyHomography(H: Mat3, nx: number, ny: number): { x: number; y: number } {
  const w = H[6] * nx + H[7] * ny + H[8];
  const x = (H[0] * nx + H[1] * ny + H[2]) / (w === 0 ? 1e-9 : w);
  const y = (H[3] * nx + H[4] * ny + H[5]) / (w === 0 ? 1e-9 : w);
  return { x, y };
}

/** 재투영 평균 오차(0..1 스케일). 캘리브레이션 품질 판정용. */
export function reprojError(H: Mat3, pts: CornerPair[]): number {
  let sum = 0;
  for (const { cam, tv } of pts) {
    const p = applyHomography(H, cam.x, cam.y);
    sum += Math.hypot(p.x - tv.x, p.y - tv.y);
  }
  return sum / pts.length;
}
