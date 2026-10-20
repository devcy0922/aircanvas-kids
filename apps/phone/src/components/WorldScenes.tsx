import type { CSSProperties } from 'react';
import type { WorldPack } from '@ht/protocol';

/**
 * 월드 배경(160x128). 캐릭터는 worldEngine이 이 위에 그린다.
 * 움직임은 CSS transform 애니메이션만 쓴다(filter·blend·opacity 애니메이션 없이 합성 비용을 낮춘다).
 * 배경(Scene)은 캐릭터 뒤, 전경(Foreground)은 캐릭터 앞에 놓인다.
 */

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

function Cloud({ x, y, s = 1, dur, delay }: { x: number; y: number; s?: number; dur: number; delay: number }) {
  return (
    <g className="w-cloud" style={cssVars({ '--dur': `${dur}s`, '--delay': `${delay}s` })}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill="#ffffff" opacity="0.92">
        <ellipse cx="0" cy="0" rx="14" ry="4.6" />
        <circle cx="-6" cy="-3" r="5" />
        <circle cx="3" cy="-5" r="6.5" />
        <circle cx="10" cy="-2" r="4.5" />
      </g>
    </g>
  );
}

/** 잎이 부채꼴로 퍼지는 고사리/소철 */
function Fern({ x, y, s = 1, color, dark, flip = false, delay = 0 }: { x: number; y: number; s?: number; color: string; dark: string; flip?: boolean; delay?: number }) {
  const leaves = [
    'M0 0 Q-9 -16 -26 -20',
    'M0 0 Q-5 -22 -14 -34',
    'M0 0 Q1 -26 2 -40',
    'M0 0 Q8 -22 16 -33',
    'M0 0 Q10 -14 27 -19',
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <g className="w-sway" style={cssVars({ '--delay': `${delay}s` })}>
        {leaves.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke={dark} strokeWidth="3.4" strokeLinecap="round" />
            <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray="1.8 0.9" />
          </g>
        ))}
      </g>
    </g>
  );
}

function Palm({ x, y, h, s = 1, delay = 0 }: { x: number; y: number; h: number; s?: number; delay?: number }) {
  const top = -h;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d={`M-2.2 0 Q-1 ${top * 0.5} 1 ${top} L3.4 ${top} Q2 ${top * 0.5} 3 0Z`} fill="#7b4f2a" />
      <path d={`M-1.2 ${top * 0.25} h4 M-0.8 ${top * 0.5} h4 M-0.2 ${top * 0.75} h3.6`} stroke="#5a3719" strokeWidth="0.7" fill="none" />
      <g transform={`translate(2 ${top})`}>
        <g className="w-sway" style={cssVars({ '--delay': `${delay}s` })}>
          {[
            'M0 0 Q-12 -6 -22 6',
            'M0 0 Q-8 -14 -16 -8',
            'M0 0 Q0 -16 6 -18',
            'M0 0 Q9 -13 18 -7',
            'M0 0 Q12 -5 23 7',
          ].map((d, i) => (
            <path key={i} d={d} fill="none" stroke={i % 2 ? '#3f8f3a' : '#2f7a32'} strokeWidth="4" strokeLinecap="round" />
          ))}
          <circle cx="-1.5" cy="2" r="1.6" fill="#8a5b2d" />
          <circle cx="2" cy="2.4" r="1.6" fill="#8a5b2d" />
        </g>
      </g>
    </g>
  );
}

function Tufts({ spots, color }: { spots: Array<[number, number, number]>; color: string }) {
  return (
    <g stroke={color} strokeWidth="0.7" strokeLinecap="round" fill="none">
      {spots.map(([x, y, s], i) => (
        <path key={i} d={`M${x - 2 * s} ${y} q${0.5 * s} ${-3 * s} ${1 * s} ${-4 * s} M${x} ${y} q0 ${-4 * s} ${0.4 * s} ${-6 * s} M${x + 2 * s} ${y} q${-0.5 * s} ${-3 * s} ${-1 * s} ${-4 * s}`} />
      ))}
    </g>
  );
}

function Flowers({ spots }: { spots: Array<[number, number, string]> }) {
  return (
    <g>
      {spots.map(([x, y, c], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <path d="M0 0 v2.4" stroke="#3a7d32" strokeWidth="0.5" />
          <circle cx="0" cy="-0.2" r="1" fill={c} />
          <circle cx="0" cy="-0.2" r="0.4" fill="#fff4b0" />
        </g>
      ))}
    </g>
  );
}

/* ───────────── 공룡 월드 ───────────── */

export function DinoScene() {
  return (
    <>
      <defs>
        <linearGradient id="wd-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#76c8ee" />
          <stop offset="0.5" stopColor="#bfe9ef" />
          <stop offset="0.85" stopColor="#ffe9b4" />
          <stop offset="1" stopColor="#ffd9a0" />
        </linearGradient>
        <radialGradient id="wd-sun">
          <stop stopColor="#fffbd0" stopOpacity="0.95" />
          <stop offset="0.5" stopColor="#ffe27a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffe27a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wd-volcano" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e4a52" />
          <stop offset="1" stopColor="#8f6a63" />
        </linearGradient>
        <radialGradient id="wd-crater">
          <stop stopColor="#fff2a8" />
          <stop offset="0.6" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wd-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9bd36f" />
          <stop offset="0.45" stopColor="#6fb558" />
          <stop offset="1" stopColor="#4a8f3f" />
        </linearGradient>
        <linearGradient id="wd-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8be0ee" />
          <stop offset="1" stopColor="#3fa6c4" />
        </linearGradient>
      </defs>

      <rect width="160" height="100" fill="url(#wd-sky)" />

      {/* 해와 천천히 도는 햇살 */}
      <circle cx="124" cy="24" r="26" fill="url(#wd-sun)" />
      <g transform="translate(124 24)">
        <g className="w-spin">
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M-1.6 -13 L0 -22 L1.6 -13Z" fill="#fff0a6" opacity="0.7" transform={`rotate(${i * 30})`} />
          ))}
        </g>
      </g>
      <circle cx="124" cy="24" r="9" fill="#fff6bd" />

      <Cloud x={20} y={20} dur={70} delay={-18} />
      <Cloud x={70} y={34} s={0.7} dur={95} delay={-60} />
      <Cloud x={110} y={12} s={0.85} dur={80} delay={-40} />
      <Cloud x={-20} y={44} s={0.6} dur={110} delay={-90} />

      {/* 멀리 날아가는 익룡 떼 */}
      <g className="w-flock" fill="none" stroke="#3b4a63" strokeWidth="0.8" strokeLinecap="round">
        <g className="w-flap" transform="translate(30 30)"><path d="M0 0 q3 -3 6 0 q3 -3 6 0" /></g>
        <g className="w-flap w-flap--b" transform="translate(44 26) scale(.8)"><path d="M0 0 q3 -3 6 0 q3 -3 6 0" /></g>
        <g className="w-flap" transform="translate(52 34) scale(.7)"><path d="M0 0 q3 -3 6 0 q3 -3 6 0" /></g>
      </g>

      {/* 먼 산 */}
      <path d="M0 76 L14 60 L26 70 L44 52 L60 72 L78 58 L94 73 L112 56 L130 72 L148 60 L160 68 V82 H0Z" fill="#a9c4dc" />
      <path d="M0 80 L18 68 L36 78 L56 64 L76 79 L98 66 L120 80 L142 68 L160 76 V86 H0Z" fill="#8fb4c8" opacity="0.85" />

      {/* 화산 */}
      <path d="M6 84 L30 44 Q38 38 46 44 L72 84Z" fill="url(#wd-volcano)" />
      <path d="M33 44 Q38 41 43 44 L41 47 Q38 45 35 47Z" fill="#3e2a30" />
      <ellipse cx="38" cy="43" rx="9" ry="4" fill="url(#wd-crater)" className="w-lava" />
      <g className="w-lava" fill="#ff7b2c">
        <path d="M37 46 q-2 8 -6 14 q4 -2 5 -6 q0 4 3 6 q-1 -8 -2 -14Z" />
        <path d="M41 46 q3 7 8 12 q-4 0 -6 -4 q-1 3 -3 4 q1 -6 1 -12Z" />
      </g>
      <g fill="#e7dccd" className="w-smoke-group">
        <circle className="w-smoke" cx="38" cy="38" r="3.5" style={cssVars({ '--delay': '0s' })} />
        <circle className="w-smoke" cx="39" cy="38" r="3.5" style={cssVars({ '--delay': '-1.6s' })} />
        <circle className="w-smoke" cx="37" cy="38" r="3.5" style={cssVars({ '--delay': '-3.2s' })} />
        <circle className="w-smoke" cx="38" cy="38" r="3.5" style={cssVars({ '--delay': '-4.8s' })} />
      </g>
      <g fill="#ffb347">
        <circle className="w-ember" cx="34" cy="40" r="0.7" style={cssVars({ '--delay': '0s' })} />
        <circle className="w-ember" cx="42" cy="40" r="0.6" style={cssVars({ '--delay': '-1s' })} />
        <circle className="w-ember" cx="38" cy="39" r="0.8" style={cssVars({ '--delay': '-2s' })} />
      </g>

      {/* 중간 언덕과 먼 나무 */}
      <path d="M0 82 Q30 72 64 80 T128 78 T160 80 V92 H0Z" fill="#9ad27a" />
      <g fill="#4f9a45">
        <circle cx="82" cy="75" r="4.5" /><circle cx="90" cy="76" r="4" /><circle cx="98" cy="75" r="4.8" />
        <circle cx="136" cy="77" r="4.4" /><circle cx="146" cy="76" r="4" />
      </g>
      <Palm x={110} y={82} h={16} s={0.8} delay={-1} />
      <Palm x={60} y={83} h={13} s={0.65} delay={-2} />

      {/* 호수 */}
      <path d="M72 82 Q96 77 128 80 Q144 82 134 86 Q104 90 76 87 Q66 85 72 82Z" fill="url(#wd-lake)" />
      <g stroke="#e9fbff" strokeWidth="0.5" strokeLinecap="round" opacity="0.8">
        <path className="w-shimmer" d="M82 82 h6" style={cssVars({ '--delay': '0s' })} />
        <path className="w-shimmer" d="M98 84 h8" style={cssVars({ '--delay': '-1.4s' })} />
        <path className="w-shimmer" d="M114 82 h6" style={cssVars({ '--delay': '-2.6s' })} />
      </g>

      {/* 땅 */}
      <path d="M0 84 Q40 78 84 83 T160 81 V128 H0Z" fill="url(#wd-ground)" />
      <path d="M-4 118 Q40 100 92 108 T170 100 V110 Q118 118 66 113 T-4 124Z" fill="#dcc080" opacity="0.5" />
      <ellipse cx="40" cy="102" rx="22" ry="5" fill="#5da24a" opacity="0.45" />
      <ellipse cx="120" cy="96" rx="18" ry="4" fill="#5da24a" opacity="0.4" />
      <g fill="#a8a29a">
        <ellipse cx="14" cy="96" rx="4.2" ry="2.6" /><ellipse cx="18" cy="97.5" rx="2.6" ry="1.8" fill="#bdb7ae" />
        <ellipse cx="148" cy="110" rx="5" ry="3" /><ellipse cx="143" cy="112" rx="2.6" ry="1.8" fill="#bdb7ae" />
      </g>
      {/* 큰 발자국 */}
      <g fill="#7c6a3c" opacity="0.28">
        <path d="M70 114 l2 -4 l1.5 3 l1.5 -3 l2 4 q-3 2 -7 0Z" />
        <path d="M84 118 l2 -4 l1.5 3 l1.5 -3 l2 4 q-3 2 -7 0Z" />
      </g>
      <Tufts spots={[[8, 90, 1.2], [58, 92, 1], [104, 90, 1], [150, 94, 1.2], [30, 112, 1.4], [132, 120, 1.4], [76, 100, 1]]} color="#3f8a38" />
      <Flowers spots={[[24, 93, '#ff7aa8'], [52, 99, '#ffd34e'], [96, 94, '#ff7aa8'], [126, 104, '#ffffff'], [64, 108, '#ffd34e'], [146, 99, '#ff7aa8']]} />

      {/* 양옆 큰 나무 */}
      <Palm x={10} y={96} h={46} s={1} delay={0} />
      <Palm x={150} y={92} h={38} s={0.9} delay={-1.8} />

      {/* 반짝이는 꽃가루 */}
      <g fill="#fff8c4">
        {[[20, 70], [58, 62], [96, 66], [138, 58], [78, 90], [124, 84]].map(([x, y], i) => (
          <circle key={i} className="w-mote" cx={x} cy={y} r="0.8" style={cssVars({ '--delay': `${-i * 1.1}s` })} />
        ))}
      </g>
    </>
  );
}

export function DinoForeground() {
  return (
    <>
      <Fern x={8} y={134} s={1.25} color="#3f9a3a" dark="#256e2b" delay={0} />
      <Fern x={30} y={136} s={0.9} color="#52ad45" dark="#2c7a32" flip delay={-1.4} />
      <Fern x={152} y={134} s={1.3} color="#3f9a3a" dark="#256e2b" flip delay={-0.7} />
      <Fern x={132} y={137} s={0.85} color="#52ad45" dark="#2c7a32" delay={-2.1} />
      {/* 앞쪽 둥지와 알 */}
      <g transform="translate(88 126)">
        <ellipse cx="0" cy="0" rx="9" ry="2.6" fill="#6b4423" />
        <ellipse cx="-3" cy="-3" rx="2.6" ry="3.4" fill="#fff4d6" stroke="#e5cf9d" strokeWidth="0.4" />
        <ellipse cx="2.4" cy="-2.6" rx="2.4" ry="3.1" fill="#ffeab8" stroke="#e5cf9d" strokeWidth="0.4" />
      </g>
    </>
  );
}

/* ───────────── 정글 월드 ───────────── */

export function JungleScene() {
  return (
    <g>
      <defs>
        <linearGradient id="wj-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8fd0a6" />
          <stop offset="0.5" stopColor="#d6e8a2" />
          <stop offset="1" stopColor="#4a7048" />
        </linearGradient>
        <radialGradient id="wj-light" cx="50%" cy="0" r="85%">
          <stop stopColor="#fff4a9" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff4a9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wj-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fbf6a" />
          <stop offset="1" stopColor="#3f8a45" />
        </linearGradient>
      </defs>
      <rect width="160" height="128" fill="url(#wj-sky)" />
      <rect width="160" height="128" fill="url(#wj-light)" />
      <circle cx="124" cy="22" r="10" fill="#ffe08a" opacity="0.9" />
      <Cloud x={30} y={24} dur={90} delay={-30} />
      <Cloud x={92} y={14} s={0.7} dur={120} delay={-70} />

      <path d="M0 62 Q20 44 40 62 Q58 36 80 62 Q102 34 128 62 Q146 44 160 58 V100 H0Z" fill="#6d9060" opacity="0.7" />
      <path d="M0 78 Q22 64 44 78 T88 76 T132 77 T176 74 V110 H0Z" fill="#3e6b4c" />
      <g fill="#f4f7c7" opacity="0.18">
        <path d="M30 0 h12 l14 90 h-16Z" /><path d="M96 0 h9 l12 84 h-13Z" />
      </g>
      <path d="M0 92 Q34 82 76 90 T160 86 V128 H0Z" fill="url(#wj-floor)" />
      <path d="M-4 118 Q40 102 92 110 T170 102 V112 Q118 120 66 115 T-4 126Z" fill="#c9b27a" opacity="0.45" />
      <Tufts spots={[[12, 100, 1.3], [60, 98, 1], [108, 96, 1.1], [150, 102, 1.2], [36, 118, 1.4], [128, 122, 1.4]]} color="#2f7a3a" />
      <Flowers spots={[[26, 104, '#ff7aa8'], [70, 108, '#ffd34e'], [112, 100, '#ffffff'], [142, 110, '#ff7aa8']]} />

      <g className="w-tree-jungle">
        <path d="M10 98 Q6 56 16 14 Q24 40 21 98Z" fill="#513e29" />
        <g fill="#245b3c"><circle cx="4" cy="20" r="15" /><circle cx="30" cy="16" r="18" /><circle cx="15" cy="6" r="16" /></g>
      </g>
      <g className="w-tree-jungle">
        <path d="M146 100 Q150 62 142 20 Q136 48 140 100Z" fill="#513e29" />
        <g fill="#2f6c42"><circle cx="154" cy="26" r="15" /><circle cx="136" cy="18" r="16" /></g>
      </g>
      {/* 늘어진 덩굴 */}
      <g fill="none" stroke="#2e7a3d" strokeWidth="1.2" strokeLinecap="round">
        <path className="w-sway" style={cssVars({ '--delay': '0s' })} d="M60 0 q-3 14 1 28 M68 0 q3 10 -1 20" />
        <path className="w-sway" style={cssVars({ '--delay': '-1.5s' })} d="M104 0 q4 12 0 24 M112 0 q-3 8 1 16" />
      </g>
      <g className="w-flock" fill="none" stroke="#244432" strokeWidth="0.8" strokeLinecap="round">
        <g className="w-flap" transform="translate(40 36)"><path d="M0 0 q3 -3 6 0 q3 -3 6 0" /></g>
        <g className="w-flap w-flap--b" transform="translate(56 30) scale(.8)"><path d="M0 0 q3 -3 6 0 q3 -3 6 0" /></g>
      </g>
      <g fill="#ffeaa7">
        {[[48, 84], [95, 74], [140, 88], [28, 96], [120, 100]].map(([x, y], i) => (
          <circle key={i} className="w-mote" cx={x} cy={y} r="1" style={cssVars({ '--delay': `${-i * 1.3}s` })} />
        ))}
      </g>
    </g>
  );
}

export function JungleForeground() {
  return (
    <>
      <Fern x={6} y={134} s={1.2} color="#3f9a3a" dark="#1f5f2b" delay={0} />
      <Fern x={154} y={134} s={1.25} color="#3f9a3a" dark="#1f5f2b" flip delay={-1} />
      <Fern x={134} y={138} s={0.8} color="#56b24a" dark="#2a7433" delay={-2} />
    </>
  );
}

/* ───────────── 바다 월드 ───────────── */

export function OceanScene() {
  return (
    <g>
      <defs>
        <linearGradient id="wo-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8be6e8" />
          <stop offset="0.4" stopColor="#1f93b4" />
          <stop offset="1" stopColor="#063a62" />
        </linearGradient>
        <linearGradient id="wo-ray" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#effff7" stopOpacity="0.5" />
          <stop offset="1" stopColor="#effff7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="160" height="128" fill="url(#wo-water)" />
      <g className="w-rays">
        <path d="M14 0 H52 L88 108 H62Z" fill="url(#wo-ray)" />
        <path d="M78 0 H104 L134 100 H108Z" fill="url(#wo-ray)" />
      </g>
      {/* 먼 바위와 산호 */}
      <path d="M0 104 Q22 90 44 104 T92 102 T160 100 V128 H0Z" fill="#17617f" opacity="0.8" />
      <path d="M0 112 Q28 106 54 113 T106 109 T160 112 V128 H0Z" fill="#d6c07c" />
      <path d="M0 120 Q38 114 80 121 T160 117 V128 H0Z" fill="#b8a56a" opacity="0.7" />
      <g fill="none" strokeLinecap="round">
        <g className="w-sway" style={cssVars({ '--delay': '0s' })}>
          <path d="M16 114 Q18 100 16 92 M18 104 L25 98 M17 108 L11 102" stroke="#ef765e" strokeWidth="3" />
        </g>
        <g className="w-sway" style={cssVars({ '--delay': '-1s' })}>
          <path d="M36 114 Q36 102 42 95 M38 105 L32 99 M40 100 L47 98" stroke="#f0c05a" strokeWidth="2.6" />
        </g>
        <g className="w-sway" style={cssVars({ '--delay': '-0.5s' })}>
          <path d="M128 116 Q122 102 129 93 M132 116 Q139 103 135 91 M144 116 Q138 100 145 93" stroke="#4db080" strokeWidth="2.2" />
        </g>
      </g>
      <g fill="none" stroke="#dffcfb" strokeWidth="0.7">
        {[[22, 90, 0], [30, 80, -1], [136, 78, -0.6], [146, 66, -1.8], [80, 96, -1.2], [100, 88, -2.4]].map(([x, y, d], i) => (
          <circle key={i} className="w-bubble" cx={x} cy={y} r={1 + (i % 3) * 0.5} style={cssVars({ '--delay': `${d}s` })} />
        ))}
      </g>
      <g className="w-flock w-flock--fish" fill="#bff3f0" opacity="0.5">
        {[0, 1, 2, 3].map((i) => (
          <path key={i} d="M0 0 q3 -2 6 0 q-3 2 -6 0 M6 0 l2.5 -1.6 v3.2Z" transform={`translate(${20 + i * 7} ${50 + (i % 2) * 5})`} />
        ))}
      </g>
    </g>
  );
}

export function OceanForeground() {
  return (
    <g fill="none" strokeLinecap="round">
      <g className="w-sway" style={cssVars({ '--delay': '-0.3s' })}>
        <path d="M4 130 Q-2 112 5 100 M9 130 Q16 112 11 98" stroke="#2f9a72" strokeWidth="3.4" />
      </g>
      <g className="w-sway" style={cssVars({ '--delay': '-1.1s' })}>
        <path d="M150 130 Q144 112 151 99 M155 130 Q162 112 157 100" stroke="#2f9a72" strokeWidth="3.4" />
      </g>
    </g>
  );
}

/* ───────────── 팔레트 장면: 코드 수정 없이 새 테마를 꾸미는 기본 장면 ───────────── */

type Palette = NonNullable<WorldPack['palette']>;

/** theme.yml의 world.palette·ambient만으로 그려지는 장면(하늘·우주·설원 같은 새 테마용) */
export function GenericScene({ palette, ambient = 'none' }: { palette: Palette; ambient?: WorldPack['ambient'] }) {
  return (
    <g>
      <defs>
        <linearGradient id="wg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.skyTop} />
          <stop offset="1" stopColor={palette.skyBottom} />
        </linearGradient>
        <linearGradient id="wg-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={palette.groundTop} />
          <stop offset="1" stopColor={palette.groundBottom} />
        </linearGradient>
        <radialGradient id="wg-sun">
          <stop stopColor={palette.sun ?? '#fffbd0'} stopOpacity="0.95" />
          <stop offset="0.55" stopColor={palette.sun ?? '#ffe27a'} stopOpacity="0.4" />
          <stop offset="1" stopColor={palette.sun ?? '#ffe27a'} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="160" height="128" fill="url(#wg-sky)" />
      {palette.sun && (
        <g>
          <circle cx="130" cy="24" r="26" fill="url(#wg-sun)" />
          <g className="w-spin" style={cssVars({ transformOrigin: '130px 24px' })} stroke={palette.sun} strokeWidth="1.4" strokeLinecap="round" opacity="0.7">
            {Array.from({ length: 10 }, (_, i) => (
              <path key={i} d="M130 4 v-3" transform={`rotate(${i * 36} 130 24)`} />
            ))}
          </g>
          <circle cx="130" cy="24" r="9" fill={palette.sun} />
        </g>
      )}
      {ambient === 'stars' &&
        [[14, 12, 0], [36, 28, -0.8], [58, 10, -1.6], [82, 30, -0.4], [104, 14, -2.1], [148, 40, -1.2], [24, 52, -1.9], [118, 50, -0.2], [70, 56, -2.6]].map(([x, y, d], i) => (
          <path key={i} className="w-twinkle" d="M0 -2.6 L0.8 -0.8 L2.6 0 L0.8 0.8 L0 2.6 L-0.8 0.8 L-2.6 0 L-0.8 -0.8Z" fill="#fff9d6" transform={`translate(${x} ${y})`} style={cssVars({ '--delay': `${d}s` })} />
        ))}
      {(ambient === 'clouds' || ambient === 'none') && (
        <>
          <Cloud x={20} y={22} s={1.1} dur={110} delay={-30} />
          <Cloud x={70} y={42} s={0.8} dur={90} delay={-70} />
          <Cloud x={110} y={14} s={1} dur={130} delay={-10} />
        </>
      )}
      {ambient === 'petals' &&
        [[16, 4, 0], [44, 0, -2], [72, 6, -4], [100, 2, -1], [128, 8, -3], [150, 0, -5]].map(([x, y, d], i) => (
          <ellipse key={i} className="w-fall" cx={x} cy={y} rx="1.6" ry="0.9" fill="#ffd1dc" style={cssVars({ '--delay': `${d}s` })} />
        ))}
      {ambient === 'bubbles' && (
        <g fill="none" stroke="#ffffff" strokeWidth="0.6">
          {[[22, 100, 0], [48, 92, -1], [78, 104, -2], [104, 96, -3], [132, 102, -1.5], [150, 90, -2.5]].map(([x, y, d], i) => (
            <circle key={i} className="w-bubble" cx={x} cy={y} r={1 + (i % 3) * 0.6} style={cssVars({ '--delay': `${d}s` })} />
          ))}
        </g>
      )}
      <path d="M0 84 Q26 66 54 82 T112 80 T160 76 V128 H0Z" fill={palette.hill} opacity="0.55" />
      <path d="M0 94 Q34 80 70 92 T160 88 V128 H0Z" fill={palette.hill} opacity="0.85" />
      <path d="M0 100 Q40 92 80 100 T160 98 V128 H0Z" fill="url(#wg-ground)" />
      <Tufts color={palette.groundBottom} spots={[[14, 108, 1], [44, 116, 1.1], [86, 110, 0.9], [118, 118, 1.2], [146, 109, 1]]} />
    </g>
  );
}

export function GenericForeground({ palette }: { palette: Palette }) {
  return (
    <g>
      <Tufts color={palette.groundBottom} spots={[[10, 126, 1.6], [34, 128, 1.2], [128, 127, 1.5], [152, 126, 1.8]]} />
    </g>
  );
}
