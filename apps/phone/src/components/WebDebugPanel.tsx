type DebugPhase = 'calib' | 'play';

interface Props {
  phase: DebugPhase;
  onAutoCalibrate: () => void;
  onPoint: () => void;
  onFill: () => void;
  onStroke: () => void;
}

/**
 * ?debug=1에서만 노출되는 카메라 없는 웹 검증 조작 패널.
 * 실기기 입력을 대체하지만 GameStateMachine과 TVCommandSender를 그대로 통과한다.
 */
export function WebDebugPanel({ phase, onAutoCalibrate, onPoint, onFill, onStroke }: Props) {
  return (
    <aside className="web-debug-panel" data-testid="web-debug-panel">
      <div className="web-debug-panel__heading">
        <span className="web-debug-panel__dot" />
        <strong>웹 디버그</strong>
        <span>{phase === 'calib' ? '캘리브레이션' : '플레이'}</span>
      </div>
      <p>카메라 없이 실제 게임 상태 머신과 TV 커맨드를 확인합니다.</p>
      {phase === 'calib' ? (
        <button type="button" data-testid="web-debug-calibrate" onClick={onAutoCalibrate}>
          4점 자동 캡처 → 플레이
        </button>
      ) : (
        <div className="web-debug-panel__actions">
          <button type="button" data-testid="web-debug-point" onClick={onPoint}>커서 보내기</button>
          <button type="button" data-testid="web-debug-fill" onClick={onFill}>영역 채우기</button>
          <button type="button" data-testid="web-debug-stroke" onClick={onStroke}>선 그리기</button>
        </div>
      )}
    </aside>
  );
}
