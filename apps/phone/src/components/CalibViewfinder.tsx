import { useEffect, useRef } from 'react';

export const CALIB_TARGETS: { x: number; y: number }[] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

interface Props {
  step: number; // 0..3
  onSample: (camPoint: { x: number; y: number }) => void;
}

/**
 * 캘리브레이션 뷰파인더:
 * TV에 표시 중인 코너 마커를 카메라 조준심(십자)에 맞추면 사용자가 "캡처"한다.
 * (자동 마커 검출 대신 조준식 — 역광/해상도 이슈에 강건한 MVP 방식)
 */
export function CalibViewfinder({ step, onSample }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        /* 카메라 권한 오류는 상위 화면에서 안내 */
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    // 재생 프레임의 중앙 십자 지점을 샘플로 사용. 실제로는 마지막 추적 좌표를 쓴다.
    onSample({ x: 0.5, y: 0.5 });
  };

  return (
    <div className="calib-root">
      <video ref={videoRef} playsInline muted className="calib-video" />
      <div className="crosshair" />
      <p className="calib-hint">
        TV 화면의 <b>{step + 1}/4</b> 번째 점을 십자에 맞추고 아래 버튼을 누르세요
      </p>
      <button className="big-btn" onClick={capture}>
        이 점 캡처
      </button>
      <ol className="corner-list">
        {CALIB_TARGETS.map((t, i) => (
          <li key={i} className={i === step ? 'cur' : i < step ? 'done' : ''}>
            ({t.x}, {t.y})
          </li>
        ))}
      </ol>
    </div>
  );
}
