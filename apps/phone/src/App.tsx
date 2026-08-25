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
import { TVCommandSender } from './lib/tvCommandSender';
import { PhoneControls } from './components/PhoneControls';
import { CalibViewfinder, CALIB_TARGETS } from './components/CalibViewfinder';
import { CastHelper } from './lib/castHelper';

function getDefaultServerBase(): string {
  const q = new URLSearchParams(location.search);
  const explicit = q.get('server');
  if (explicit) return explicit;
  const isHttps = location.protocol === 'https:';
  const hasKidsSubpath = location.pathname.startsWith('/kids');
  const subpathPrefix = hasKidsSubpath ? '/kids' : '';

  if (isHttps || (location.port !== '5173' && location.port !== '5174' && location.port !== '3000')) {
    return `${location.protocol}//${location.host}${subpathPrefix}`;
  }
  // 로컬 개발 환경 기본값 (릴레이 서버 포트 8180)
  return `http://${location.hostname}:8180${subpathPrefix}`;
}

function getDefaultContentBase(): string {
  const q = new URLSearchParams(location.search);
  const explicit = q.get('content');
  if (explicit) return explicit;
  const isHttps = location.protocol === 'https:';
  const hasKidsSubpath = location.pathname.startsWith('/kids');
  const subpathPrefix = hasKidsSubpath ? '/kids' : '';

  if (isHttps || (location.port !== '5173' && location.port !== '5174' && location.port !== '3000')) {
    return `${location.protocol}//${location.host}${subpathPrefix}/content`;
  }
  return `http://${location.hostname}:8180${subpathPrefix}/content`;
}

const SERVER_BASE = getDefaultServerBase();
const CONTENT_SERVER_BASE = getDefaultContentBase();

type Screen = 'loading' | 'discover' | 'lobby' | 'calib' | 'play' | 'gallery' | 'error';

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [discoveredTVs, setDiscoveredTVs] = useState<DiscoveredTV[]>([]);
  const [scanStatus, setScanStatus] = useState<'searching' | 'found' | 'none'>('searching');
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle');
  const [packageLoadProgress, setPackageLoadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 핵심 모듈 refs
  const packageManagerRef = useRef<PackageManager | null>(null);
  const tvDiscoveryRef = useRef<TVDiscovery | null>(null);
  const gameStateRef = useRef<GameStateMachine | null>(null);
  const tvCommandSenderRef = useRef<TVCommandSender | null>(null);
  const castHelperRef = useRef<CastHelper | null>(null);

  // 추적 파이프라인 ref들
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof loadHandLandmarker>> | null>(null);
  const homographyRef = useRef<number[] | null>(null);
  const filterRef = useRef(new OneEuroPair());
  const lastPointRef = useRef<{ x: number; y: number; pinch: boolean } | null>(null);
  const lastPinchRef = useRef(false);
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
  const modeRef = useRef<'fill' | 'free'>('fill');
  const colorRef = useRef<string>(PALETTE[0]);

  // ref 동기화
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);

  // 초기화
  useEffect(() => {
    // 패키지 매니저
    packageManagerRef.current = new PackageManager({
      onProgress: (_stage, pct) => setPackageLoadProgress(pct),
      onError: (err) => setErrorMessage(err),
      onReady: (pkg) => {
        gameStateRef.current?.setPackage(pkg);
        setScreen('discover');
        tvDiscoveryRef.current?.start(SERVER_BASE);
      },
    });

    // TV 디스커버리
    tvDiscoveryRef.current = new TVDiscovery({
      onTVFound: (tv) => {
        setDiscoveredTVs((prev) => {
          const exists = prev.find((t) => t.announcement.tvId === tv.announcement.tvId);
          if (exists) return prev.map((t) => t.announcement.tvId === tv.announcement.tvId ? tv : t);
          return [...prev, tv];
        });
      },
      onTVLost: (id) => setDiscoveredTVs((prev) => prev.filter((t) => t.announcement.tvId !== id)),
      onScanStatus: (status) => setScanStatus(status),
      onError: (err) => console.warn('[TVDiscovery]', err),
    });

    // 게임 상태 머신
    gameStateRef.current = new GameStateMachine({
      onStateChange: (state) => {
        setScreen(mapPhaseToScreen(state.phase));
        if (state.phase === 'calibrating') {
          setCalibStep(state.calibrationStep);
          setCalibError(state.calibrationError);
        }
      },
      onTVCommand: (cmd) => tvCommandSenderRef.current?.send(cmd),
      onError: (err) => setErrorMessage(err),
    });

    // Cast 헬퍼 초기화 (TV 앱 URL 계산)
    const tvAppUrl = (() => {
      const isHttps = location.protocol === 'https:';
      if (isHttps || (location.port !== '5173' && location.port !== '5174' && location.port !== '3000')) {
        return `${location.protocol}//${location.host}/?mode=tv`;
      }
      return `http://${location.hostname}:5173`;
    })();
    castHelperRef.current = new CastHelper(tvAppUrl);

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

  const onCastTV = useCallback(async () => {
    if (!castHelperRef.current) return;
    const res = await castHelperRef.current.launchTV();
    if (!res.success && res.message) {
      alert(res.message);
    }
  }, []);

  // TV 선택 핸들러
  const onTVSelect = useCallback((tv: DiscoveredTV) => {
    const selected = tvDiscoveryRef.current?.selectTV(tv.announcement.tvId);
    if (!selected) return;
    const { wsUrl: tvWsUrl, roomCode } = selected;
    tvCommandSenderRef.current = new TVCommandSender(tvWsUrl, {
      onStatusChange: (status) => {
        setWsStatus(status);
      },
      onMessage: (msg) => {
        if (msg.type === 'welcome') {
          // peers 에 tv가 실제로 있는 경우에만 TV 연결됨으로 처리
          const peers = Array.isArray(msg.peers) ? msg.peers : [];
          if (peers.includes('tv') || peers.includes('TV')) {
            gameStateRef.current?.onTVConnected(roomCode);
          } else {
            gameStateRef.current?.onTVDisconnected();
          }
        } else if (msg.type === 'peer-joined' && (msg.role === 'tv' || msg.role === 'TV')) {
          gameStateRef.current?.onTVConnected(roomCode);
        } else if (msg.type === 'peer-left' && (msg.role === 'tv' || msg.role === 'TV')) {
          gameStateRef.current?.onTVDisconnected();
        }
      },
      onError: (err) => setErrorMessage(err),
    });
    tvCommandSenderRef.current.connect();
    tvDiscoveryRef.current?.stop();
  }, []);

  // TV 연결 끊기
  const onTVDisconnect = useCallback(() => {
    tvCommandSenderRef.current?.disconnect();
    tvCommandSenderRef.current = null;
    gameStateRef.current?.onTVDisconnected();
    setWsStatus('idle');
    tvDiscoveryRef.current?.start();
    setScreen('discover');
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

  // 카메라 + MediaPipe 추적 루프
  useEffect(() => {
    const state = gameStateRef.current?.getState();
    if (state?.phase !== 'playing') return;

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
      if (!hand || !H) return;

      const raw = applyHomography(H, hand.indexTip.x, hand.indexTip.y);
      const sm = filterRef.current.filter(raw.x, raw.y, now);
      const clamped = { x: Math.min(1, Math.max(0, sm.x)), y: Math.min(1, Math.max(0, sm.y)) };
      lastPointRef.current = { ...clamped, pinch: hand.pinch };
      setLivePoint({ x: clamped.x, y: clamped.y });

      const currentColor = colorRef.current;
      const currentMode = modeRef.current;
      const wasPinching = lastPinchRef.current;
      const isPinching = hand.pinch;
      lastPinchRef.current = isPinching;

      // 1. TV에 실시간 커서 위치 전송 (30Hz)
      gameStateRef.current?.onTrackedPoint(clamped.x, clamped.y, isPinching, currentColor);

      // 2. Pinch 제스처 연동
      if (currentMode === 'fill') {
        // 핀치를 시작하는 순간 (Trigger) 영역 채색
        if (isPinching && !wasPinching) {
          gameStateRef.current?.onFillAt(clamped.x, clamped.y, currentColor);
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(40);
          }
        }
      } else if (currentMode === 'free') {
        // 핀치 중일 때 점 수집
        if (isPinching) {
          if (!wasPinching) {
            strokePointsRef.current = [];
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              navigator.vibrate(20);
            }
          }
          strokePointsRef.current.push({ x: clamped.x, y: clamped.y });
        } else if (wasPinching) {
          // 핀치 해제 시 TV로 스트로크 전송
          if (strokePointsRef.current.length >= 2) {
            gameStateRef.current?.onStrokePoints(strokePointsRef.current, currentColor);
          }
          strokePointsRef.current = [];
        }
      }

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
      } catch (e) {
        setErrorMessage(`카메라 시작 실패: ${e}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [color]);

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
            setScreen('lobby');
          }
        },
        onMessage: (msg) => {
          if (msg.type === 'welcome') {
            const peers = Array.isArray(msg.peers) ? msg.peers : [];
            if (peers.includes('tv') || peers.includes('TV')) {
              gameStateRef.current?.onTVConnected(qrRoom);
            } else {
              gameStateRef.current?.onTVDisconnected();
            }
          } else if (msg.type === 'peer-joined' && (msg.role === 'tv' || msg.role === 'TV')) {
            gameStateRef.current?.onTVConnected(qrRoom);
          } else if (msg.type === 'peer-left' && (msg.role === 'tv' || msg.role === 'TV')) {
            gameStateRef.current?.onTVDisconnected();
          }
        },
        onError: (err) => setErrorMessage(err),
      });
      tvCommandSenderRef.current.connect();
      tvDiscoveryRef.current?.stop();
    }
  }, []);

  // 현재 게임 상태에서 파생된 데이터
  const gameState = gameStateRef.current?.getState();
  const pkg = packageManagerRef.current?.getCachedPackage();
  const themes = pkg?.themes ?? [];
  const currentTheme = themes.find((t) => t.id === gameState?.selectedTheme);
  const artworks = currentTheme?.artworks ?? [];
  const selectedArtwork = gameState?.selectedArtwork;

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

  if (screen === 'discover') {
    return (
      <div className="phone-root" style={{ padding: '20px', maxWidth: '480px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '2rem', color: '#e76f51', margin: '0 0 4px 0' }}>🎨 AirCanvas Kids</h1>
          <span style={{ fontSize: '0.9rem', color: '#666' }}>스마트 TV 연결 가이드</span>
        </header>

        {/* 1. 실시간 TV 발견 카드 */}
        {discoveredTVs.length > 0 ? (
          <section style={{
            background: '#e8f5e9',
            border: '2px solid #4caf50',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(76, 175, 80, 0.15)'
          }}>
            <h2 style={{ fontSize: '1.1rem', color: '#2e7d32', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#4caf50', animation: 'pulse 1.5s infinite' }} />
              온라인 스마트 TV 발견됨!
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {discoveredTVs.map((tv) => (
                <button
                  key={tv.announcement.tvId}
                  onClick={() => onTVSelect(tv)}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #81c784',
                    borderRadius: '12px',
                    padding: '14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '1.05rem', color: '#1b5e20', display: 'block' }}>{tv.announcement.tvName}</strong>
                    <span style={{ fontSize: '0.85rem', color: '#666' }}>방 코드: <strong style={{ color: '#e76f51' }}>{tv.announcement.roomCode}</strong></span>
                  </div>
                  <span style={{ background: '#4caf50', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                    바로 연결 👉
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section style={{
            background: '#fff8e1',
            border: '1.5px solid #ffe082',
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '20px'
          }}>
            <h2 style={{ fontSize: '1rem', color: '#f57f17', margin: '0 0 8px 0' }}>
              {scanStatus === 'searching' ? '📡 TV 상태 확인 중...' : '📺 켜져 있는 TV가 없습니다'}
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 12px 0', lineHeight: 1.4 }}>
              스마트 TV 브라우저에서 <strong style={{ color: '#e76f51' }}>play.aircanvas.kr</strong> 을 열어두시면 이 화면에 즉시 나타납니다.
            </p>
            <button
              onClick={onCastTV}
              style={{
                width: '100%',
                background: '#2a9d8f',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '10px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              📺 스마트 TV로 화면 띄우기 (Cast)
            </button>
          </section>
        )}

        {/* 2. 수동 방 코드 입력 */}
        <section style={{
          background: '#ffffff',
          border: '1px solid #e0e0e0',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '20px'
        }}>
          <h3 style={{ fontSize: '0.95rem', color: '#333', margin: '0 0 8px 0' }}>TV 화면에 보이는 방 코드 직접 입력</h3>
          <ManualJoinForm onJoin={(roomCode) => {
            const tvWsUrl = wsUrl(SERVER_BASE, 'phone', roomCode);
            tvCommandSenderRef.current = new TVCommandSender(tvWsUrl, {
              onStatusChange: (status) => {
                setWsStatus(status);
                if (status === 'open') {
                  setScreen('lobby');
                }
              },
              onMessage: (msg) => {
                if (msg.type === 'welcome') {
                  const peers = Array.isArray(msg.peers) ? msg.peers : [];
                  if (peers.includes('tv') || peers.includes('TV')) {
                    gameStateRef.current?.onTVConnected(roomCode);
                  } else {
                    gameStateRef.current?.onTVDisconnected();
                  }
                } else if (msg.type === 'peer-joined' && (msg.role === 'tv' || msg.role === 'TV')) {
                  gameStateRef.current?.onTVConnected(roomCode);
                } else if (msg.type === 'peer-left' && (msg.role === 'tv' || msg.role === 'TV')) {
                  gameStateRef.current?.onTVDisconnected();
                }
              },
              onError: (err) => setErrorMessage(err),
            });
            tvCommandSenderRef.current.connect();
            tvDiscoveryRef.current?.stop();
          }} />
        </section>

        {/* 3. 스마트폰 단독 테스트 모드 (Solo Mode) */}
        <section style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => {
              gameStateRef.current?.onTVConnected('SOLO01');
              setScreen('lobby');
            }}
            style={{
              background: 'transparent',
              border: '1px dashed #999',
              color: '#666',
              padding: '10px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            💡 TV 없이 스마트폰 단독 테스트 모드
          </button>
        </section>

        <style>{`
          @keyframes pulse {
            0% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.2); opacity: 1; }
            100% { transform: scale(0.95); opacity: 0.8; }
          }
        `}</style>
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
        onSelectArtwork={(artworkId) => onSelectArtwork(artworkId)}
        currentTheme={currentTheme}
        themes={themes}
        selectedArtwork={selectedArtwork}
        gamePhase={gameState?.phase ?? 'lobby'}
        onUndo={() => gameStateRef.current?.onUndo()}
        onNextArt={() => gameStateRef.current?.nextArtwork()}
        onGoHome={() => gameStateRef.current?.goHome()}
        progress={gameState?.progress ?? 0}
        tvConnected={wsStatus === 'open'}
        onDisconnect={onTVDisconnect}
        onCastTV={onCastTV}
      />
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