import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArtworkPack, ThemePack } from '@ht/protocol';
import { APP_VERSION_LABEL, PALETTE } from '@ht/protocol';
import { loadHandLandmarker, toTrackedHand } from '../lib/tracking';
import { OneEuroPair } from '../lib/oneEuro';
import type { TouchPoint, TouchMode } from './TouchColoringBoard';
import { TouchJungleWorld } from './TouchJungleWorld';

type PaletteColor = typeof PALETTE[number];

interface Props {
  themes: ThemePack[];
  artworks: ArtworkPack[];
  onExit: () => void;
  onTouchFallback: () => void;
}

type CameraState = 'starting' | 'ready' | 'error';

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function distance(a: TouchPoint, b: TouchPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function CameraColoringGame({ themes, artworks, onExit, onTouchFallback }: Props) {
  const [themeId, setThemeId] = useState(themes[0]?.id ?? '');
  const theme = themes.find((item) => item.id === themeId) ?? themes[0];
  const themeArtworks = useMemo(() => {
    if (!theme) return [];
    const artworkMap = new Map(artworks.map((artwork) => [artwork.id, artwork]));
    return theme.artworks.map((ref) => artworkMap.get(ref.id)).filter(Boolean) as ArtworkPack[];
  }, [artworks, theme]);
  const [artworkId, setArtworkId] = useState(themeArtworks[0]?.id ?? '');
  const artwork = themeArtworks.find((item) => item.id === artworkId) ?? themeArtworks[0];
  const [mode, setMode] = useState<TouchMode>('fill');
  const [color, setColor] = useState<PaletteColor>(PALETTE[0]);
  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [livePoint, setLivePoint] = useState<TouchPoint | null>(null);
  const [fps, setFps] = useState(0);
  const [filledRegions, setFilledRegions] = useState<Set<string>>(new Set());
  const [strokes, setStrokes] = useState<TouchPoint[][]>([]);
  const [draft, setDraft] = useState<TouchPoint[]>([]);
  const [completed, setCompleted] = useState(false);
  const [isExported, setIsExported] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const boardRef = useRef<SVGSVGElement>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof loadHandLandmarker>> | null>(null);
  const filterRef = useRef(new OneEuroPair());
  const rafRef = useRef(0);
  const pinchRef = useRef(false);
  const draftRef = useRef<TouchPoint[]>([]);
  const modeRef = useRef(mode);
  const colorRef = useRef(color);
  const mirrorRef = useRef(mirrorCamera);
  const fillAtRef = useRef<(point: TouchPoint) => void>(() => undefined);
  const finishStrokeRef = useRef<() => void>(() => undefined);

  modeRef.current = mode;
  colorRef.current = color;
  mirrorRef.current = mirrorCamera;

  useEffect(() => {
    setArtworkId(themeArtworks[0]?.id ?? '');
    setFilledRegions(new Set());
    setStrokes([]);
    setDraft([]);
    draftRef.current = [];
    setCompleted(false);
    setIsExported(false);
  }, [themeId, themeArtworks]);

  useEffect(() => {
    setFilledRegions(new Set());
    setStrokes([]);
    setDraft([]);
    draftRef.current = [];
    setCompleted(false);
    setIsExported(false);
  }, [artworkId]);

  const fillRegionAtPoint = (point: TouchPoint) => {
    const svg = boardRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clientX = rect.left + point.x * rect.width;
    const clientY = rect.top + point.y * rect.height;
    const hitTarget = document.elementsFromPoint(clientX, clientY)
      .find((element): element is SVGPathElement =>
        element instanceof SVGPathElement && Boolean(element.dataset.regionId));
    const regionId = hitTarget?.dataset.regionId;
    if (!regionId) return;

    setFilledRegions((previous) => {
      if (previous.has(regionId)) return previous;
      const next = new Set(previous).add(regionId);
      navigator.vibrate?.(18);
      return next;
    });
  };

  const finishStroke = () => {
    const points = draftRef.current;
    if (points.length > 1) setStrokes((previous) => [...previous, points]);
    draftRef.current = [];
    setDraft([]);
  };

  fillAtRef.current = fillRegionAtPoint;
  finishStrokeRef.current = finishStroke;

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error');
      setCameraError('이 브라우저는 카메라 입력을 지원하지 않아요. 터치 모드로 시작해 주세요.');
      return;
    }

    let stream: MediaStream | null = null;
    let cancelled = false;
    let frames = 0;
    let fpsTimer = performance.now();

    const finishIfNeeded = () => {
      if (pinchRef.current && modeRef.current === 'free') finishStrokeRef.current();
      pinchRef.current = false;
    };

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !landmarker || video.readyState < 2) return;

      const now = performance.now();
      const last = Number(video.dataset.lastDetect ?? 0);
      if (now - last < 33) return;
      video.dataset.lastDetect = String(now);

      const result = landmarker.detectForVideo(video, now);
      const hand = result.landmarks?.[0] ? toTrackedHand(result.landmarks[0]) : null;
      if (!hand) {
        finishIfNeeded();
        setLivePoint(null);
        return;
      }

      const raw = {
        x: mirrorRef.current ? 1 - hand.indexTip.x : hand.indexTip.x,
        y: hand.indexTip.y,
      };
      const smoothed = filterRef.current.filter(raw.x, raw.y, now);
      const point = { x: clamp(smoothed.x), y: clamp(smoothed.y) };
      const wasPinching = pinchRef.current;
      pinchRef.current = hand.pinch;
      setLivePoint(point);

      if (modeRef.current === 'fill') {
        if (hand.pinch) fillAtRef.current(point);
      } else if (hand.pinch) {
        const previous = draftRef.current;
        const lastPoint = previous[previous.length - 1];
        if (!lastPoint || distance(lastPoint, point) >= 0.006) {
          const next = [...previous, point];
          draftRef.current = next;
          setDraft(next);
        }
      } else if (wasPinching) {
        finishStrokeRef.current();
      }

      frames += 1;
      if (now - fpsTimer > 1000) {
        setFps(frames);
        frames = 0;
        fpsTimer = now;
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) return;

        const facingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
        const shouldMirror = facingMode !== 'environment';
        mirrorRef.current = shouldMirror;
        setMirrorCamera(shouldMirror);

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.playsInline = true;
        video.muted = true;
        await video.play();
        landmarkerRef.current = await loadHandLandmarker();
        if (cancelled) return;
        setCameraState('ready');
        rafRef.current = requestAnimationFrame(loop);
      } catch (error) {
        if (cancelled) return;
        setCameraState('error');
        setCameraError(`카메라를 시작하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      finishIfNeeded();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const progress = artwork?.regions.length ? filledRegions.size / artwork.regions.length : 0;

  useEffect(() => {
    if (progress >= 0.85) setCompleted(true);
  }, [progress]);

  if (!theme || !artwork) {
    return (
      <main className="camera-game">
        <p>색칠할 그림을 준비하지 못했어요.</p>
        <button className="btn-ghost" onClick={onExit}>처음으로</button>
      </main>
    );
  }

  const currentArtworkIndex = themeArtworks.findIndex((item) => item.id === artwork.id);
  const goNextArtwork = () => {
    const next = themeArtworks[(currentArtworkIndex + 1) % themeArtworks.length];
    if (next) setArtworkId(next.id);
  };

  if (isExported) {
    return (
      <TouchJungleWorld
        artwork={artwork}
        theme={theme}
        color={color}
        filledRegions={filledRegions}
        strokes={strokes}
        onBack={() => setIsExported(false)}
        onNext={() => {
          setIsExported(false);
          goNextArtwork();
        }}
      />
    );
  }

  return (
    <main className="camera-game" data-testid="camera-game">
      <header className="camera-game__header">
        <div>
          <p className="camera-game__eyebrow">카메라 로컬 플레이</p>
          <h1>허공에 그려요</h1>
        </div>
        <div className="camera-game__header-actions">
          <span className="version-label">{APP_VERSION_LABEL}</span>
          <button className="btn-ghost small" onClick={onExit}>처음으로</button>
        </div>
      </header>

      <p className="camera-game__lead">
        엄지와 검지를 붙이면 칠해져요. 카메라 영상은 이 기기 안에서만 처리됩니다.
      </p>

      <section className="camera-stage" aria-label="카메라 손 추적 화면">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`camera-stage__video ${mirrorCamera ? 'is-mirrored' : ''}`}
        />
        {livePoint && cameraState === 'ready' && (
          <span
            className={`camera-stage__cursor ${pinchRef.current ? 'is-pinching' : ''}`}
            style={{ left: `${livePoint.x * 100}%`, top: `${livePoint.y * 100}%` }}
            aria-hidden="true"
          />
        )}
        <div className="camera-stage__status">
          {cameraState === 'starting' && '손 추적 준비 중...'}
          {cameraState === 'ready' && `손 추적 중 · ${fps}fps`}
          {cameraState === 'error' && '카메라를 사용할 수 없음'}
        </div>
      </section>

      {cameraState === 'error' && (
        <section className="camera-error" role="alert">
          <strong>{cameraError}</strong>
          <button className="big-btn" onClick={onTouchFallback}>터치로 대신 시작하기</button>
        </section>
      )}

      <section className="camera-section" aria-label="테마 선택">
        <div className="camera-section__heading"><span>색칠 세계</span><strong>{theme.label}</strong></div>
        <div className="camera-chip-row">
          {themes.map((item) => (
            <button
              key={item.id}
              className={item.id === theme.id ? 'is-selected' : ''}
              onClick={() => setThemeId(item.id)}
            >
              {item.id === 'dino' ? '🦕' : item.id === 'jungle' ? '🐒' : '🐠'} {item.label}
            </button>
          ))}
        </div>
        <div className="camera-chip-row camera-chip-row--artworks">
          {themeArtworks.map((item) => (
            <button key={item.id} className={item.id === artwork.id ? 'is-selected' : ''} onClick={() => setArtworkId(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
      </section>

      <section className="camera-play-section">
        <div className="camera-progress-row">
          <span>{filledRegions.size}/{artwork.regions.length} 칸을 색칠했어요</span>
          <strong>{Math.round(progress * 100)}%</strong>
        </div>
        <div className="camera-board-shell">
          <svg ref={boardRef} className="camera-board" viewBox={artwork.viewBox} role="img" aria-label={`${artwork.name} 카메라 색칠판`}>
            <rect x="0" y="0" width="100" height="100" fill="#fffdf7" opacity="0.72" pointerEvents="none" />
            {artwork.regions.map((region) => (
              <path
                key={region.id}
                d={region.path}
                fill={filledRegions.has(region.id) ? color : '#fffdf7'}
                fillOpacity={filledRegions.has(region.id) ? 0.92 : 0.98}
                stroke={theme.accentColor}
                strokeWidth="1.2"
                strokeLinejoin="round"
                data-region-id={region.id}
              />
            ))}
            {[...strokes, draft].filter((points) => points.length > 1).map((points, index) => (
              <polyline
                key={`camera-stroke-${index}`}
                points={points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
            {livePoint && (
              <circle
                cx={livePoint.x * 100}
                cy={livePoint.y * 100}
                r="3"
                fill={color}
                stroke="#fffdf7"
                strokeWidth="1.4"
                pointerEvents="none"
              />
            )}
          </svg>
        </div>
        <p className="camera-board-hint">카메라 화면에서 손을 움직여 커서를 맞추고, 핀치를 유지해 보세요.</p>
      </section>

      <section className="camera-tools" aria-label="카메라 플레이 도구">
        <div className="camera-mode-row">
          <button className={mode === 'fill' ? 'is-selected' : ''} onClick={() => { finishStrokeRef.current(); setMode('fill'); }}>🪣 칸 채우기</button>
          <button className={mode === 'free' ? 'is-selected' : ''} onClick={() => { finishStrokeRef.current(); setMode('free'); }}>✏️ 자유 그리기</button>
        </div>
        <div className="camera-palette">
          {PALETTE.map((item) => (
            <button
              key={item}
              className={color === item ? 'is-selected' : ''}
              style={{ background: item }}
              aria-label={`색상 ${item}`}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
      </section>

      <section className="camera-export-row" aria-label="작품 다음 단계">
        <button className="big-btn camera-export-btn" type="button" onClick={() => setIsExported(true)}>
          내 캐릭터 정글로 내보내기
        </button>
        <button className="btn-ghost camera-skip-btn" type="button" onClick={goNextArtwork}>
          다음으로 (건너뛰기)
        </button>
        <span>모든 칸을 채우지 않아도 지금 만든 모습 그대로 이동해요.</span>
      </section>

      <p className="camera-status" data-testid="camera-status">
        {completed ? '잘했어요! 정글로 내보내 볼까요?' : mode === 'fill' ? '핀치를 유지하면서 커서를 칸 위로 움직여 보세요.' : '핀치를 유지하며 손을 움직이면 선이 그려져요.'}
      </p>

      {completed && (
        <section className="camera-complete">
          <strong>작품 완성!</strong>
          <button className="big-btn" onClick={goNextArtwork}>다음 작품 색칠하기</button>
        </section>
      )}
    </main>
  );
}
