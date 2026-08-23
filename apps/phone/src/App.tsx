import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Artwork, Theme } from '@ht/tv-art';
import { artworksByTheme } from '@ht/tv-art';
import { PALETTE, wsUrl } from '@ht/protocol';
import { useWsSend } from './hooks/useWsSend';
import { loadHandLandmarker, toTrackedHand } from './lib/tracking';
import { applyHomography, computeHomography, reprojError } from './lib/homography';
import type { CornerPair } from './lib/homography';
import { OneEuroPair } from './lib/oneEuro';
import { loadCalibration, saveCalibration, clearCalibration } from './lib/calibrationStore';
import type { CalibrationData } from './lib/calibrationStore';
import { PhoneControls } from './components/PhoneControls';
import { CalibViewfinder, CALIB_TARGETS } from './components/CalibViewfinder';

type Screen = 'connect' | 'calib' | 'play';

const SERVER_BASE = (() => {
  // 개발 기본값: PC에서 릴레이 서버(:8080) 구동 가정.
  // 배포 시 ?server=http://host:port 쿼리로 오버라이드.
  const q = new URLSearchParams(location.search);
  return q.get('server') ?? `${location.protocol}//${location.hostname}:8080`;
})();

export default function App() {
  const [screen, setScreen] = useState<Screen>('connect');
  const qrRoom = useMemo(() => new URLSearchParams(location.search).get('room') ?? '', []);
  const [roomInput, setRoomInput] = useState(qrRoom);
  const [joinedRoom, setJoinedRoom] = useState('');
  const [theme] = useState<Theme>('dino');
  const artworks: Artwork[] = useMemo(() => artworksByTheme(theme), [theme]);
  const [artIndex] = useState(0);
  const [mode, setMode] = useState<'fill' | 'free'>('fill');
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [livePoint, setLivePoint] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [calibStep, setCalibStep] = useState(0);
  const [calibError, setCalibError] = useState<number | null>(null);

  const { status, send } = useWsSend(joinedRoom ? wsUrl(SERVER_BASE, 'phone', joinedRoom) : '');

  // --- 추적 파이프라인 ref들: React 렌더와 분리된 고빈도 상태 ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof loadHandLandmarker>> | null>(null);
  const homographyRef = useRef<number[] | null>(null);
  const filterRef = useRef(new OneEuroPair());
  const lastPointRef = useRef<{ x: number; y: number; pinch: boolean } | null>(null);
  const strokeOpenRef = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    const cal: CalibrationData | null = loadCalibration();
    if (cal) {
      homographyRef.current = cal.matrix;
      setCalibError(cal.errorPct);
    }
  }, []);

  // --- 카메라 + MediaPipe 추적 루프 (play 화면에서만 구동) ---
  useEffect(() => {
    if (screen !== 'play') return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    let frames = 0;
    let fpsTimer = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      const lm = landmarkerRef.current;
      if (!v || !lm || v.readyState < 2) return;
      const now = performance.now();

      // ~30Hz로 스로틀
      const last = Number(v.dataset.lastDetect ?? 0);
      if (now - last < 33) return;
      v.dataset.lastDetect = String(now);

      const res = lm.detectForVideo(v, now);
      const hand = res.landmarks?.[0] ? toTrackedHand(res.landmarks[0]) : null;
      const H = homographyRef.current;
      if (!hand || !H) return;

      const raw = applyHomography(H, hand.indexTip.x, hand.indexTip.y);
      const sm = filterRef.current.filter(raw.x, raw.y, now);
      const clamped = { x: Math.min(1, Math.max(0, sm.x)), y: Math.min(1, Math.max(0, sm.y)) };
      lastPointRef.current = { ...clamped, pinch: hand.pinch };
      send(JSON.stringify({ type: 'point', x: clamped.x, y: clamped.y, pinch: hand.pinch, t: now }));

      frames++;
      if (now - fpsTimer > 1000) {
        setFps(frames);
        frames = 0;
        fpsTimer = now;
        setLivePoint({ x: clamped.x, y: clamped.y });
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return;
        let v = videoRef.current;
        if (!v) {
          v = document.createElement('video');
          videoRef.current = v;
        }
        v.srcObject = stream;
        v.playsInline = true;
        v.muted = true;
        await v.play();
        landmarkerRef.current = await loadHandLandmarker();
        rafRef.current = requestAnimationFrame(loop);
      } catch {
        /* 카메라 권한 거부: 컨트롤 화면의 상태 배지로 확인 가능 */
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [screen, send]);

  const joinRoom = useCallback(() => {
    const code = roomInput.trim().toUpperCase();
    if (code.length !== 6) return;
    setJoinedRoom(code);
    if (!loadCalibration()) setScreen('calib');
    else setScreen('play');
  }, [roomInput]);

  // --- QR 진입 시 자동 입장 (방 코드가 URL 파라미터로 들어온 경우) ---
  useEffect(() => {
    if (qrRoom.length === 6) joinRoom();
    // 최초 마운트 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 캘리브레이션 샘플 수집 → 4점 모이면 호모그래피 계산·저장 ---
  const onSample = useCallback((camPt: { x: number; y: number }) => {
    setCalibStep((step) => {
      const nextLen = step + 1;
      return Math.min(nextLen, 4);
    });
    // pairs 는 클로저 대신 함수형 갱신으로 관리
    setPairs((prev) => {
      const targetIdx = prev.length;
      const next = [...prev, { cam: camPt, tv: CALIB_TARGETS[targetIdx] }];
      if (next.length === 4) {
        const H = computeHomography(next);
        if (H) {
          const err = reprojError(H, next);
          homographyRef.current = H;
          filterRef.current = new OneEuroPair();
          setCalibError(err);
          saveCalibration({ corners: next, matrix: H, errorPct: err, savedAt: Date.now() });
          setTimeout(() => setScreen('play'), 500);
        }
      }
      return next;
    });
  }, []);
  const [, setPairs] = useState<CornerPair[]>([]);

  const redoCalib = useCallback(() => {
    clearCalibration();
    homographyRef.current = null;
    setPairs([]);
    setCalibStep(0);
    setCalibError(null);
    setScreen('calib');
  }, []);

  const sendStrokeStart = useCallback(
    () => {
      if (!strokeOpenRef.current) {
        strokeOpenRef.current = true;
        send(JSON.stringify({ type: 'stroke-start', color }));
      }
    },
    [send, color],
  );

  const sendStrokeEnd = useCallback(
    () => {
      if (strokeOpenRef.current) {
        strokeOpenRef.current = false;
        send(JSON.stringify({ type: 'stroke-end' }));
      }
    },
    [send],
  );

  const sendFill = useCallback(
    (x: number, y: number, c: string) => send(JSON.stringify({ type: 'fill', x, y, color: c })),
    [send],
  );

  if (screen === 'calib') {
    return (
      <div className="phone-root">
        <header>
          <h1>캘리브레이션</h1>
          <span className="badge">{Math.min(calibStep, 4)}/4</span>
        </header>
        <CalibViewfinder step={Math.min(calibStep, 3)} onSample={onSample} />
        {calibError !== null && (
          <p className="muted">
            저장됨 — 재투영 평균 오차 {(calibError * 100).toFixed(2)}%
            {calibError > 0.03 ? ' (다시 시도 권장)' : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {/* 추적 전용 비디오(화면에는 숨김). play 화면에서만 스트림이 붙는다 */}
      <video
        ref={(el) => {
          videoRef.current = el;
        }}
        playsInline
        muted
        className="hidden-video"
      />
      <PhoneControls
        roomInput={roomInput}
        setRoomInput={(v) => setRoomInput(v.toUpperCase())}
        onJoin={joinRoom}
        joined={status === 'open'}
        status={status}
        livePoint={livePoint}
        fps={fps}
        mode={mode}
        setMode={(m) => {
          setMode(m);
          sendStrokeEnd();
        }}
        color={color}
        setColor={setColor}
        onPaintToggle={(on) => (on ? sendStrokeStart() : sendStrokeEnd())}
        sendFill={sendFill}
        artworks={artworks}
        artIndex={artIndex}
        onSelectTheme={(t) => send(JSON.stringify({ type: 'select-theme', theme: t }))}
        onSelectArtwork={(t, i) => send(JSON.stringify({ type: 'select-artwork', theme: t, index: i }))}
      />
      {screen === 'play' && (
        <button className="link-btn" onClick={redoCalib}>
          캘리브레이션 다시 하기
        </button>
      )}
    </>
  );
}
