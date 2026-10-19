import { useCallback, useEffect, useRef, useState } from 'react';
import type { GamePhase } from '@ht/protocol';
import { PALETTE, wsUrl } from '@ht/protocol';
import { loadHandLandmarker, toTrackedHand } from './lib/tracking';
import { applyHomography, computeHomography, reprojError } from './lib/homography';
import type { CornerPair } from './lib/homography';
import { OneEuroPair } from './lib/oneEuro';
import { loadCalibration, saveCalibration, clearCalibration } from './lib/calibrationStore';
import { PackageManager } from './lib/packageManager';
import { TVDiscovery, DiscoveredTV } from './lib/tvDiscovery';
import { GameStateMachine } from './lib/gameStateMachine';
import type { GameState } from './lib/gameStateMachine';
import { TVCommandSender } from './lib/tvCommandSender';
import { PhoneControls } from './components/PhoneControls';
import { CalibViewfinder, CALIB_TARGETS } from './components/CalibViewfinder';
import { PhoneWelcome } from './components/PhoneWelcome';
import { WebDebugPanel } from './components/WebDebugPanel';
import { TouchColoringGame } from './components/TouchColoringGame';
import { CameraColoringGame } from './components/CameraColoringGame';

const query = new URLSearchParams(location.search);

function safeQueryBase(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, location.origin);
    // 예전 LAN QR 주소가 HTTPS 운영 페이지에서 ws://로 내려가지 않도록 한다.
    if (location.protocol === 'https:' && parsed.protocol !== 'https:') return null;
    return value;
  } catch {
    return null;
  }
}

const SERVER_BASE = (() => {
  const explicit = safeQueryBase(query.get('server'));
  if (explicit) return explicit;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `${location.protocol}//${location.hostname}:8180`;
  }
  // 운영 도메인은 Nginx가 /ws, /announce를 같은 출처로 중계한다.
  return location.origin;
})();

const CONTENT_SERVER_BASE = (() => {
  const explicit = safeQueryBase(query.get('content'));
  if (explicit) return explicit;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return `${location.protocol}//${location.hostname}:8081`;
  }
  // 운영 도메인은 /manifest.json과 /artworks를 같은 출처로 서빙한다.
  return location.origin;
})();

const DEBUG_MODE = query.get('debug') === '1';

type Screen = 'loading' | 'intro' | 'camera' | 'touch' | 'discover' | 'lobby' | 'calib' | 'play' | 'gallery' | 'world' | 'error';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [discoveredTVs, setDiscoveredTVs] = useState<DiscoveredTV[]>([]);
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const [packageLoadProgress, setPackageLoadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 핵심 모듈 refs
  const packageManagerRef = useRef<PackageManager | null>(null);
  const tvDiscoveryRef = useRef<TVDiscovery | null>(null);
  const gameStateRef = useRef<GameStateMachine | null>(null);
  const tvCommandSenderRef = useRef<TVCommandSender | null>(null);

  // 추적 파이프라인 ref들
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof loadHandLandmarker>> | null>(null);
  const homographyRef = useRef<number[] | null>(null);
  const filterRef = useRef(new OneEuroPair());
  const lastPointRef = useRef<{ x: number; y: number; pinch: boolean } | null>(null);
  const strokeOpenRef = useRef(false);
  const strokePointsRef = useRef<{ x: number; y: number }[]>([]);
  const rafRef = useRef(0);
  const calibPairsRef = useRef<CornerPair[]>([]);

  // UI 상태
  const [livePoint, setLivePoint] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [calibStep, setCalibStep] = useState(0);
  const [calibError, setCalibError] = useState<number | null>(null);
  const [mode, setMode] = useState<'fill' | 'free'>('fill');
  const [color, setColor] = useState<string>(PALETTE[0]);

  const autoConnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const journeyStartedRef = useRef(false);
  const wsStatusRef = useRef(wsStatus);
  wsStatusRef.current = wsStatus;
  const onTVSelectRef = useRef<((tv: DiscoveredTV) => void) | null>(null);

  // 초기화
  useEffect(() => {
    // 패키지 매니저
    packageManagerRef.current = new PackageManager({
      onProgress: (_stage, pct) => setPackageLoadProgress(pct),
      onError: (err) => {
        setErrorMessage(err);
        setScreen('error');
      },
      onReady: (pkg) => {
        gameStateRef.current?.setPackage(pkg);
        // QR로 자동 연결 중이어도 소개 화면을 먼저 보여준다.
        // 사용자가 시작하기를 눌러야 테마 선택으로 넘어간다.
        setScreen('intro');
      },
    });

    // TV 디스커버리
    tvDiscoveryRef.current = new TVDiscovery({
      serverBase: SERVER_BASE,
      onTVFound: (tv) => {
        setDiscoveredTVs((prev) => {
          const exists = prev.find((t) => t.announcement.tvId === tv.announcement.tvId);
          if (exists) return prev.map((t) => t.announcement.tvId === tv.announcement.tvId ? tv : t);
          const newList = [...prev, tv];
          
          if (newList.length === 1 && wsStatusRef.current === 'idle' && !autoConnectTimerRef.current) {
            autoConnectTimerRef.current = setTimeout(() => {
              if (wsStatusRef.current === 'idle' && onTVSelectRef.current) {
                onTVSelectRef.current(newList[0]);
              }
              autoConnectTimerRef.current = null;
            }, 3000);
          }
          
          return newList;
        });
      },
      onTVLost: (id) => setDiscoveredTVs((prev) => prev.filter((t) => t.announcement.tvId !== id)),
      onError: (err) => console.warn('[TVDiscovery]', err),
    });

    // 게임 상태 머신
    gameStateRef.current = new GameStateMachine({
      onStateChange: (state) => {
        setGameState({ ...state });
        if (state.phase === 'lobby' && !journeyStartedRef.current) {
          setScreen('intro');
        } else {
          setScreen(mapPhaseToScreen(state.phase));
        }
        if (state.phase === 'calibrating') {
          setCalibStep(state.calibrationStep);
          setCalibError(state.calibrationError);
        }
      },
      onTVCommand: (cmd) => tvCommandSenderRef.current?.send(cmd),
      onError: (err) => setErrorMessage(err),
    });

    // TV 커맨드 송신기
    // URL은 TV 선택 후 설정

    // 패키지 로드 시작
    packageManagerRef.current.loadOrDownload(CONTENT_SERVER_BASE);

    // 로컬 캘리브레이션 로드
    const cal = loadCalibration();
    if (cal) {
      homographyRef.current = cal.matrix;
      setCalibError(cal.errorPct);
    }

    return () => {
      tvDiscoveryRef.current?.stop();
      tvCommandSenderRef.current?.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // TV 선택 핸들러
  const onTVSelect = useCallback((tv: DiscoveredTV) => {
    if (autoConnectTimerRef.current) {
      clearTimeout(autoConnectTimerRef.current);
      autoConnectTimerRef.current = null;
    }
    const { wsUrl: tvWsUrl, roomCode } = tvDiscoveryRef.current!.selectTV(tv.announcement.tvId)!;
    tvCommandSenderRef.current = new TVCommandSender(tvWsUrl, {
      onStatusChange: (status) => {
        setWsStatus(status);
        if (status === 'open') {
          gameStateRef.current?.onTVConnected(roomCode);
        }
      },
      onError: (err) => setErrorMessage(err),
    });
    tvCommandSenderRef.current.connect();
    tvDiscoveryRef.current?.stop();
  }, []);

  // autoConnect에서 사용하기 위해 최신 콜백 유지
  useEffect(() => {
    onTVSelectRef.current = onTVSelect;
  }, [onTVSelect]);

  // TV 연결 끊기
  const onTVDisconnect = useCallback(() => {
    tvCommandSenderRef.current?.disconnect();
    tvCommandSenderRef.current = null;
    gameStateRef.current?.onTVDisconnected();
    setWsStatus('idle');
    tvDiscoveryRef.current?.start();
    setScreen('discover');
  }, []);

  // 소개 홈에서 명시적으로 시작한 뒤에만 TV 탐색/테마 선택을 허용한다.
  const onStartJourney = useCallback(() => {
    journeyStartedRef.current = true;
    if (wsStatusRef.current === 'open') {
      setScreen('lobby');
      return;
    }
    setScreen('discover');
    tvDiscoveryRef.current?.start();
  }, []);

  // 테마 선택
  const onSelectTheme = useCallback((themeId: string) => {
    gameStateRef.current?.selectTheme(themeId);
  }, []);

  // 작품 선택
  const onSelectArtwork = useCallback((artworkId: string) => {
    gameStateRef.current?.selectArtwork(artworkId);
  }, []);

  // 캘리브레이션 포인트 캡처
  const onCalibSample = useCallback((camPt: { x: number; y: number }) => {
    const pairs = [...calibPairsRef.current, { cam: camPt, tv: CALIB_TARGETS[calibPairsRef.current.length] }];
    calibPairsRef.current = pairs;
    const nextStep = pairs.length;
    setCalibStep(nextStep);

    if (nextStep >= 4) {
      const H = computeHomography(pairs);
      if (H) {
        const err = reprojError(H, pairs);
        homographyRef.current = H;
        filterRef.current = new OneEuroPair();
        setCalibError(err);
        saveCalibration({ corners: pairs, matrix: H, errorPct: err, savedAt: Date.now() });
        gameStateRef.current?.onCalibrationPointCaptured(4, err);
      }
    }
  }, []);

  const redoCalib = useCallback(() => {
    clearCalibration();
    homographyRef.current = null;
    calibPairsRef.current = [];
    setCalibStep(0);
    setCalibError(null);
    gameStateRef.current?.redoCalibration();
  }, []);

  const onDebugAutoCalibrate = useCallback(() => {
    if (!DEBUG_MODE) return;
    calibPairsRef.current = [];
    CALIB_TARGETS.forEach((target) => onCalibSample(target));
  }, [onCalibSample]);

  const onDebugPoint = useCallback(() => {
    if (!DEBUG_MODE) return;
    const point = { x: 0.5, y: 0.5 };
    setLivePoint(point);
    gameStateRef.current?.onTrackedPoint(point.x, point.y, false, color);
  }, [color]);

  const onDebugFill = useCallback(() => {
    if (!DEBUG_MODE) return;
    gameStateRef.current?.onFillAt(0.5, 0.5, color);
  }, [color]);

  const onDebugStroke = useCallback(() => {
    if (!DEBUG_MODE) return;
    gameStateRef.current?.onStrokePoints([
      { x: 0.3, y: 0.5 },
      { x: 0.4, y: 0.44 },
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.56 },
      { x: 0.7, y: 0.5 },
    ], color);
  }, [color]);

  // 카메라 + MediaPipe 추적 루프
  useEffect(() => {
    const state = gameStateRef.current?.getState();
    if (state?.phase !== 'playing' || DEBUG_MODE) return;

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

      const last = Number(v.dataset.lastDetect ?? 0);
      if (now - last < 33) return;
      v.dataset.lastDetect = String(now);

      const res = lm.detectForVideo(v, now);
      const hand = res.landmarks?.[0] ? toTrackedHand(res.landmarks[0]) : null;
      const H = homographyRef.current;
      if (!hand || !H) {
        if (lastPointRef.current) {
          gameStateRef.current?.onTrackingLost();
          lastPointRef.current = null;
          setLivePoint(null);
        }
        return;
      }

      const raw = applyHomography(H, hand.indexTip.x, hand.indexTip.y);
      const sm = filterRef.current.filter(raw.x, raw.y, now);
      const clamped = { x: Math.min(1, Math.max(0, sm.x)), y: Math.min(1, Math.max(0, sm.y)) };
      lastPointRef.current = { ...clamped, pinch: hand.pinch };
      setLivePoint({ x: clamped.x, y: clamped.y });

      // 게임 상태 머신에 포인트 전달
      gameStateRef.current?.onTrackedPoint(clamped.x, clamped.y, hand.pinch, color, mode);

      frames++;
      if (now - fpsTimer > 1000) {
        setFps(frames);
        frames = 0;
        fpsTimer = now;
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      } catch (e) {
        setErrorMessage(`카메라 시작 실패: ${e}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [color, mode]);

  // 진행도 업데이트 수신 (TV에서 오는 메시지 처리 필요 - 현재는 폴링 또는 별도 WS 채널 필요)
  // TODO: TV에서 progress 이벤트 수신하도록 WS 리스너 추가

  // QR 자동 입장 처리
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const qrRoom = q.get('room');
    if (qrRoom && qrRoom.length === 6) {
      // QR로 들어온 경우: TV 디스커버리 건너뛰고 바로 연결
      const tvWsUrl = wsUrl(SERVER_BASE, 'phone', qrRoom);
      tvCommandSenderRef.current = new TVCommandSender(tvWsUrl, {
        onStatusChange: (status) => {
          setWsStatus(status);
          if (status === 'open') {
            gameStateRef.current?.onTVConnected(qrRoom);
          }
        },
        onError: (err) => setErrorMessage(err),
      });
      tvCommandSenderRef.current.connect();
      tvDiscoveryRef.current?.stop();
    }
  }, []);

  // 현재 게임 상태에서 파생된 데이터
  const pkg = packageManagerRef.current?.getCachedPackage();
  const themes = pkg?.themes ?? [];
  const currentTheme = themes.find((t) => t.id === gameState?.selectedTheme);
  const artworks = currentTheme?.artworks ?? [];
  const selectedArtwork = gameState?.selectedArtwork;
  const allArtworks = pkg ? Array.from(pkg.artworksCache.values()) : [];

  // 렌더링
  if (screen === 'loading') {
    return (
      <div className="phone-root">
        <div className="loading-screen">
          <div className="spinner" />
          <p>게임 패키지 로드 중... {packageLoadProgress}%</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="phone-root">
        <div className="error-screen">
          <h2>오류 발생</h2>
          <p>{errorMessage}</p>
          <button onClick={() => window.location.reload()}>새로고침</button>
        </div>
      </div>
    );
  }

  if (screen === 'intro') {
    return (
      <PhoneWelcome
        onStart={onStartJourney}
        onCameraStart={() => {
          tvDiscoveryRef.current?.stop();
          tvCommandSenderRef.current?.disconnect();
          tvCommandSenderRef.current = null;
          setWsStatus('idle');
          setScreen('camera');
        }}
        onTouchStart={() => {
          tvDiscoveryRef.current?.stop();
          tvCommandSenderRef.current?.disconnect();
          setScreen('touch');
        }}
      />
    );
  }

  if (screen === 'touch') {
    return (
      <TouchColoringGame
        themes={themes}
        artworks={allArtworks}
        roomKey={new URLSearchParams(location.search).get('room') ?? 'LOCAL'}
        onExit={() => setScreen('intro')}
      />
    );
  }

  if (screen === 'camera') {
    return (
      <CameraColoringGame
        themes={themes}
        artworks={allArtworks}
        onExit={() => setScreen('intro')}
        onTouchFallback={() => setScreen('touch')}
      />
    );
  }

  if (screen === 'discover') {
    return (
      <div className="phone-root">
        <header>
          <h1>AirCanvas</h1>
          <span className="badge">TV 찾기</span>
        </header>
        <section>
          <h2>사용 가능한 TV</h2>
          {discoveredTVs.length === 0 ? (
            <p className="muted">TV를 검색 중입니다... (TV가 켜져 있고 같은 Wi-Fi에 연결되어 있는지 확인하세요)</p>
          ) : (
            <ul className="tv-list">
              {discoveredTVs.map((tv) => (
                <li key={tv.announcement.tvId} onClick={() => onTVSelect(tv)}>
                  <span className="tv-name">{tv.announcement.tvName}</span>
                  <span className="tv-room">방: {tv.announcement.roomCode}</span>
                </li>
              ))}
            </ul>
          )}
          {discoveredTVs.length === 1 && wsStatus === 'idle' && (
            <p className="muted" style={{ marginTop: '1rem' }}>
              TV가 1대 발견되어 곧 자동 연결됩니다...
            </p>
          )}
        </section>
        <section>
          <h2>또는 수동 입력</h2>
          <ManualJoinForm onJoin={(roomCode) => {
            const tvWsUrl = wsUrl(SERVER_BASE, 'phone', roomCode);
            tvCommandSenderRef.current = new TVCommandSender(tvWsUrl, {
              onStatusChange: (status) => {
                setWsStatus(status);
                if (status === 'open') {
                  gameStateRef.current?.onTVConnected(roomCode);
                  setScreen('lobby');
                }
              },
              onError: (err) => setErrorMessage(err),
            });
            tvCommandSenderRef.current.connect();
            tvDiscoveryRef.current?.stop();
          }} />
        </section>
      </div>
    );
  }

  // 로비/캘리브/플레이/갤러리 공통 UI (PhoneControls 컴포넌트 재사용)
  if (screen === 'calib') {
    return (
      <div className="phone-root">
        <header>
          <h1>캘리브레이션</h1>
          <span className="badge">{Math.min(calibStep, 4)}/4</span>
        </header>
        <CalibViewfinder step={Math.min(calibStep, 3)} onSample={onCalibSample} />
        {calibError !== null && (
          <p className="muted">
            저장됨 — 재투영 평균 오차 {(calibError * 100).toFixed(2)}%
            {calibError > 0.03 ? ' (다시 시도 권장)' : ''}
          </p>
        )}
        {selectedArtwork && (
          <p className="muted">선택된 작품: {selectedArtwork.name} ({currentTheme?.label})</p>
        )}
        {DEBUG_MODE && (
          <WebDebugPanel
            phase="calib"
            onAutoCalibrate={onDebugAutoCalibrate}
            onPoint={onDebugPoint}
            onFill={onDebugFill}
            onStroke={onDebugStroke}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <video
        ref={(el) => { videoRef.current = el; }}
        playsInline muted className="hidden-video"
      />
      <PhoneControls
        roomInput={gameState?.roomCode ?? ''}
        setRoomInput={() => {}}
        onJoin={onTVDisconnect}
        joined={wsStatus === 'open'}
        status={wsStatus}
        livePoint={livePoint}
        fps={fps}
        mode={mode}
        setMode={(m) => { setMode(m); if (m === 'free') strokePointsRef.current = []; }}
        color={color}
        setColor={setColor}
        onPaintToggle={(on) => {
          if (on) {
            strokeOpenRef.current = true;
            strokePointsRef.current = [];
            // stroke-start는 첫 포인트에서 전송
          } else if (strokeOpenRef.current) {
            strokeOpenRef.current = false;
            if (strokePointsRef.current.length >= 2) {
              gameStateRef.current?.onStrokePoints(strokePointsRef.current, color);
            }
            strokePointsRef.current = [];
          }
        }}
        sendFill={(x, y, c) => gameStateRef.current?.onFillAt(x, y, c)}
        artworks={artworks}
        onSelectTheme={onSelectTheme}
        onStartTheme={() => gameStateRef.current?.startTheme()}
        onSelectArtwork={(artworkId) => onSelectArtwork(artworkId)}
        currentTheme={currentTheme}
        themes={themes}
        selectedArtwork={selectedArtwork}
        gamePhase={gameState?.phase ?? 'lobby'}
        onUndo={() => gameStateRef.current?.onUndo()}
        onNextArt={() => gameStateRef.current?.nextArtwork()}
        onSkipArtwork={() => gameStateRef.current?.skipArtwork()}
        onExport={() => gameStateRef.current?.exportToWorld()}
        onGoHome={() => gameStateRef.current?.goHome()}
        progress={gameState?.progress ?? 0}
        tvConnected={wsStatus === 'open'}
        onDisconnect={onTVDisconnect}
      />
      {DEBUG_MODE && screen === 'play' && (
        <WebDebugPanel
          phase="play"
          onAutoCalibrate={onDebugAutoCalibrate}
          onPoint={onDebugPoint}
          onFill={onDebugFill}
          onStroke={onDebugStroke}
        />
      )}
      {screen === 'play' && (
        <button className="link-btn" onClick={redoCalib}>
          캘리브레이션 다시 하기
        </button>
      )}
    </>
  );
}

function mapPhaseToScreen(phase: GamePhase): Screen {
  switch (phase) {
    case 'lobby': return 'lobby';
    case 'connecting': return 'discover';
    case 'calibrating': return 'calib';
    case 'playing': return 'play';
    case 'gallery': return 'gallery';
    case 'world': return 'world';
    case 'error': return 'error';
    default: return 'lobby';
  }
}

interface ManualJoinFormProps {
  onJoin: (roomCode: string) => void;
}

function ManualJoinForm({ onJoin }: ManualJoinFormProps) {
  const [code, setCode] = useState('');
  return (
    <div className="join-form">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        placeholder="방 코드 6자리"
        inputMode="text"
        autoComplete="off"
      />
      <button onClick={() => code.length === 6 && onJoin(code)} disabled={code.length !== 6}>
        연결
      </button>
    </div>
  );
}
