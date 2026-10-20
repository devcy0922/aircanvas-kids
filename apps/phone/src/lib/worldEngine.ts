import { PART_ORDER } from './creatureSprite';
import type { BakedCreature, PartName } from './creatureSprite';
import { sound } from './sound';

/**
 * 월드 장면 엔진: 캐릭터마다 다른 행동(걷기·포효·돌진·활공·헤엄)을 requestAnimationFrame으로 움직인다.
 * React는 장면 배경만 그리고, 캐릭터는 이 엔진이 SVG에 직접 그린다(매 프레임 React 렌더를 피한다).
 * 캐릭터는 CSS 애니메이션이나 filter/blend 없이 부위 레이어(<image>)의 transform만 바꾼다.
 */

export const SCENE_W = 160;
export const SCENE_H = 128;

export type WorldKind = 'dino' | 'jungle' | 'ocean';
export type Species = 'trex' | 'brachio' | 'stego' | 'trike' | 'ptera' | 'lion' | 'elephant' | 'fish' | 'whale' | 'generic';
type Habitat = 'ground' | 'sky' | 'water';
type Mode = 'spawn' | 'cheer' | 'walk' | 'idle' | 'roar' | 'graze' | 'look' | 'wag' | 'charge' | 'pounce' | 'trumpet' | 'fly' | 'glide' | 'swoop' | 'swim' | 'breach';

export function speciesOf(artworkId: string): Species {
  const table: Species[] = ['trex', 'brachio', 'stego', 'trike', 'ptera', 'lion', 'elephant', 'fish', 'whale'];
  return table.find((name) => artworkId.includes(name)) ?? 'generic';
}

interface Cfg {
  habitat: Habitat;
  size: number;
  speed: [number, number];
  stepHz: number;
  bob: number;
  lean: number;
  roll: number;
  leg: number;
  tail: number;
  tailHz: number;
  head: number;
  wing: number;
  moves: Array<[Mode, number]>;
}

const CFG: Record<Species, Cfg> = {
  trex: { habitat: 'ground', size: 1, speed: [9, 12], stepHz: 1.7, bob: 2.4, lean: 2, roll: 2.4, leg: 9, tail: 6, tailHz: 0.8, head: 2.5, wing: 0, moves: [['walk', 0.45], ['roar', 0.3], ['look', 0.25]] },
  brachio: { habitat: 'ground', size: 1.05, speed: [4, 6], stepHz: 0.9, bob: 1.2, lean: 0.5, roll: 1.2, leg: 5, tail: 5, tailHz: 0.5, head: 4, wing: 0, moves: [['walk', 0.45], ['graze', 0.35], ['look', 0.2]] },
  stego: { habitat: 'ground', size: 0.95, speed: [5, 7], stepHz: 1.3, bob: 1.4, lean: 0.8, roll: 4, leg: 7, tail: 12, tailHz: 1.6, head: 3, wing: 0, moves: [['walk', 0.5], ['wag', 0.3], ['graze', 0.2]] },
  trike: { habitat: 'ground', size: 1, speed: [7, 9], stepHz: 1.7, bob: 1.8, lean: 1.5, roll: 2, leg: 8, tail: 5, tailHz: 1, head: 3, wing: 0, moves: [['walk', 0.35], ['charge', 0.35], ['graze', 0.3]] },
  ptera: { habitat: 'sky', size: 0.9, speed: [16, 22], stepHz: 3.2, bob: 2.5, lean: 6, roll: 3, leg: 4, tail: 0, tailHz: 1, head: 3, wing: 26, moves: [['fly', 0.45], ['glide', 0.3], ['swoop', 0.25]] },
  lion: { habitat: 'ground', size: 0.95, speed: [10, 14], stepHz: 2, bob: 1.4, lean: 2, roll: 1.8, leg: 12, tail: 12, tailHz: 1.2, head: 2, wing: 0, moves: [['walk', 0.45], ['pounce', 0.25], ['idle', 0.3]] },
  elephant: { habitat: 'ground', size: 1.15, speed: [5, 7], stepHz: 1, bob: 1.4, lean: 0.8, roll: 1.5, leg: 6, tail: 6, tailHz: 0.7, head: 5, wing: 0, moves: [['walk', 0.5], ['trumpet', 0.25], ['idle', 0.25]] },
  fish: { habitat: 'water', size: 0.8, speed: [12, 18], stepHz: 3, bob: 0, lean: 0, roll: 4, leg: 0, tail: 18, tailHz: 3, head: 0, wing: 0, moves: [['swim', 1]] },
  whale: { habitat: 'water', size: 1.2, speed: [6, 9], stepHz: 1, bob: 0, lean: 0, roll: 2, leg: 0, tail: 10, tailHz: 1, head: 0, wing: 0, moves: [['swim', 0.6], ['breach', 0.25], ['idle', 0.15]] },
  generic: { habitat: 'ground', size: 1, speed: [7, 10], stepHz: 1.6, bob: 1.6, lean: 1.5, roll: 2, leg: 8, tail: 6, tailHz: 1, head: 2, wing: 0, moves: [['walk', 0.7], ['look', 0.3]] },
};

const GROUND_FAR = 90;
const GROUND_NEAR = 121;
const LANES = [92, 100, 108, 116, 121];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const approach = (v: number, target: number, step: number) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const SVGNS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVGNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export interface ActorSpec {
  id: string;
  name: string;
  species: Species;
  baked: BakedCreature;
  /** 내가 칠한 친구(크게, 알에서 부화) */
  hero?: boolean;
  /** 같은 종 NPC를 서로 다르게 보이게 하는 배율 */
  scale?: number;
  /** 시작 위치(없으면 무작위) */
  at?: { x: number; y: number };
}

interface Actor {
  spec: ActorSpec;
  cfg: Cfg;
  root: SVGGElement;
  shadow: SVGEllipseElement;
  bodyG: SVGGElement;
  parts: Partial<Record<PartName, SVGGElement>>;
  ax: number;
  ay: number;
  sprDir: 1 | -1;
  x: number;
  y: number;
  baseY: number;
  dir: 1 | -1;
  flip: number;
  scale: number;
  mode: Mode;
  modeT: number;
  modeDur: number;
  tx: number;
  ty: number;
  speed: number;
  phase: number;
  seed: number;
  react: number;
  spawn?: { t: number; prop: SVGGElement; kind: WorldKind; burst: boolean };
  fxClock: number;
  /** 부화 직후 0→1로 커지는 팝 배율 */
  pop?: number;
}

interface Particle {
  el: SVGElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  age: number;
  spin: number;
  rot: number;
  grow: number;
  size: number;
}

export interface EngineOptions {
  /** 캐릭터가 들어갈 레이어(깊이 정렬용 그룹) */
  stage: SVGGElement;
  ground: SVGGElement;
  sky: SVGGElement;
  fx: SVGGElement;
  svg: SVGSVGElement;
  kind: WorldKind;
  reducedMotion: boolean;
  onToast: (text: string) => void;
}

export class WorldEngine {
  private actors: Actor[] = [];
  private particles: Particle[] = [];
  private raf = 0;
  private last = 0;
  private clock = 0;
  private sortClock = 0;
  private shake = 0;
  private slot = 0;
  constructor(private opts: EngineOptions) {}

  start() {
    if (this.opts.reducedMotion) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.actors.forEach((a) => a.root.remove());
    this.particles.forEach((p) => p.el.remove());
    this.actors = [];
    this.particles = [];
  }

  addActor(spec: ActorSpec) {
    const cfg = CFG[spec.species];
    const { baked } = spec;
    const isGround = cfg.habitat === 'ground';
    const ax = (baked.bounds.x0 + baked.bounds.x1) / 2;
    const ay = isGround ? baked.bounds.y1 : (baked.bounds.y0 + baked.bounds.y1) / 2;

    const root = svgEl('g', { class: 'w-actor', 'data-actor': spec.id, 'data-species': spec.species });
    const shadow = svgEl('ellipse', { class: 'w-actor__shadow', fill: '#0b2a1a', opacity: isGround ? 0.22 : 0 });
    const bodyG = svgEl('g', { class: 'w-actor__body' });
    const parts: Actor['parts'] = {};
    for (const name of PART_ORDER) {
      const href = baked.layers[name];
      if (!href) continue;
      const g = svgEl('g', { 'data-part': name });
      const img = svgEl('image', { x: 0, y: 0, width: 100, height: 100, 'pointer-events': 'none' });
      img.setAttribute('href', href);
      g.appendChild(img);
      bodyG.appendChild(g);
      parts[name] = g;
    }
    const b = baked.bounds;
    const hit = svgEl('rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, fill: '#000', 'fill-opacity': 0, 'pointer-events': 'all' });
    bodyG.appendChild(hit);
    root.append(shadow, bodyG);
    (cfg.habitat === 'sky' ? this.opts.sky : this.opts.ground).appendChild(root);
    root.style.cursor = 'pointer';

    const heroBoost = spec.hero ? 1.18 : 1;
    const actor: Actor = {
      spec,
      cfg,
      root,
      shadow,
      bodyG,
      parts,
      ax,
      ay,
      sprDir: baked.facingLeft ? -1 : 1,
      x: 0,
      y: 0,
      baseY: 0,
      dir: Math.random() > 0.5 ? 1 : -1,
      flip: 1,
      scale: (spec.scale ?? 1) * cfg.size * heroBoost,
      mode: 'idle',
      modeT: 0,
      modeDur: 1,
      tx: 0,
      ty: 0,
      speed: 0,
      phase: Math.random() * 6,
      seed: Math.random() * 100,
      react: 0,
      fxClock: 0,
    };
    actor.flip = actor.dir * actor.sprDir;

    // 처음부터 한곳에 뭉치지 않도록 황금비로 흩어 놓는다
    const slot = this.slot++;
    const spread = (min: number, max: number) => min + ((slot * 0.618 + 0.13) % 1) * (max - min);
    if (cfg.habitat === 'ground') {
      actor.x = spec.at?.x ?? spread(24, 136);
      actor.y = spec.at?.y ?? LANES[(slot * 2 + 1) % LANES.length];
    } else if (cfg.habitat === 'sky') {
      actor.x = spec.at?.x ?? spread(12, 148);
      actor.y = spec.at?.y ?? rand(14, 36);
    } else {
      actor.x = spec.at?.x ?? spread(20, 140);
      actor.y = spec.at?.y ?? rand(34, 92);
    }
    actor.baseY = actor.y;

    root.addEventListener('click', (event) => {
      event.stopPropagation();
      this.pet(actor, event as MouseEvent);
    });

    this.chooseMode(actor, true);
    if (!this.opts.reducedMotion) {
      if (spec.hero) {
        this.beginSpawn(actor);
      } else {
        actor.bodyG.style.opacity = '0';
        actor.modeT = -rand(0, 0.8); // 살짝 시차를 두고 나타난다
      }
    }
    this.actors.push(actor);
    this.pose(actor);
    return actor;
  }

  /* ───── 행동 ───── */

  private pet(actor: Actor, event: MouseEvent) {
    actor.react = 0.8;
    sound.playJump();
    const p = this.toScene(event.clientX, event.clientY);
    const emojis = ['💖', '🌟', '✨', '🐾'];
    for (let i = 0; i < 3; i++) {
      this.emit('text', p.x + rand(-4, 4), p.y - 4, { text: emojis[Math.floor(rand(0, emojis.length))], vy: -rand(14, 22), vx: rand(-6, 6), life: 1.1, size: 7 });
    }
  }

  private toScene(clientX: number, clientY: number) {
    const svg = this.opts.svg;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? pt.matrixTransform(ctm.inverse()) : { x: SCENE_W / 2, y: SCENE_H / 2 };
  }

  /** 배경을 눌렀을 때 먹이/별이 떠오른다 */
  sprinkle(clientX: number, clientY: number, emojis: string[]) {
    const p = this.toScene(clientX, clientY);
    this.emit('text', p.x, p.y, { text: emojis[Math.floor(rand(0, emojis.length))], vy: -rand(12, 20), vx: rand(-5, 5), life: 1.2, size: 8 });
    // 가까이 있는 친구가 관심을 보인다
    const near = this.actors
      .filter((a) => a.cfg.habitat !== 'sky' && !a.spawn)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (near && Math.hypot(near.x - p.x, near.y - p.y) < 60) {
      near.tx = clamp(p.x, 16, 144);
      near.ty = near.baseY;
      near.mode = 'walk';
      near.modeT = 0;
      near.modeDur = 6;
      near.speed = rand(...near.cfg.speed) * 1.2;
    }
  }

  private chooseMode(a: Actor, first = false) {
    const cfg = a.cfg;
    const total = cfg.moves.reduce((sum, [, w]) => sum + w, 0);
    let roll = rand(0, total);
    let mode: Mode = cfg.moves[0][0];
    for (const [m, w] of cfg.moves) {
      roll -= w;
      if (roll <= 0) {
        mode = m;
        break;
      }
    }
    if (first && (mode === 'roar' || mode === 'charge' || mode === 'pounce' || mode === 'breach')) mode = cfg.moves[0][0];
    this.enter(a, mode);
  }

  private enter(a: Actor, mode: Mode) {
    const cfg = a.cfg;
    a.mode = mode;
    a.modeT = 0;
    a.fxClock = 0;
    const [lo, hi] = cfg.speed;
    switch (mode) {
      case 'walk':
      case 'charge': {
        const spot = this.pickSpot(a, 20, 140, LANES, mode === 'charge' ? 50 : 24);
        a.tx = spot.x;
        a.ty = spot.y;
        a.speed = rand(lo, hi) * (mode === 'charge' ? 2.6 : 1);
        a.modeDur = 12;
        break;
      }
      case 'fly':
      case 'glide': {
        const spot = this.pickSpot(a, -10, 170, [12, 18, 24, 30, 38], 20);
        a.tx = spot.x;
        a.ty = spot.y;
        a.speed = rand(lo, hi) * (mode === 'glide' ? 0.75 : 1);
        a.modeDur = 14;
        break;
      }
      case 'swoop': {
        const spot = this.pickSpot(a, 25, 135, [56, 62, 68], 40);
        a.tx = spot.x;
        a.ty = spot.y;
        a.speed = hi * 1.25;
        a.modeDur = 9;
        break;
      }
      case 'swim': {
        const spot = this.pickSpot(a, 18, 142, [36, 48, 60, 72, 84, 94], 30);
        a.tx = spot.x;
        a.ty = spot.y;
        a.speed = rand(lo, hi);
        a.modeDur = 14;
        break;
      }
      case 'roar':
        a.modeDur = 2.2;
        break;
      case 'graze':
      case 'look':
      case 'wag':
      case 'trumpet':
        a.modeDur = rand(2.2, 3.6);
        break;
      case 'pounce':
        a.modeDur = 1.6;
        break;
      case 'breach':
        a.modeDur = 2.4;
        break;
      case 'cheer':
        a.modeDur = 2.2;
        break;
      default:
        a.modeDur = rand(1.4, 2.8);
    }
    if (mode === 'walk' || mode === 'charge' || mode === 'swim' || mode === 'fly' || mode === 'glide' || mode === 'swoop') {
      a.dir = a.tx >= a.x ? 1 : -1;
    }
    if (mode === 'roar') {
      sound.playPop(160);
      this.emit('text', a.x, a.y - this.heightOf(a) - 4, { text: '크아앙!', vy: -8, life: 1.6, size: 7, bold: true });
      this.shake = 0.45;
    }
    if (mode === 'trumpet') this.emit('text', a.x, a.y - this.heightOf(a) - 2, { text: '뿌우~', vy: -8, life: 1.6, size: 6.5, bold: true });
    if (mode === 'breach') {
      this.splash(a.x, a.y);
      sound.playPop(300);
    }
  }

  /** 다른 친구와 가장 멀리 떨어진 목적지를 고른다(한곳에 몰려 겹치지 않게) */
  private pickSpot(a: Actor, minX: number, maxX: number, lanes: number[], minDist: number) {
    const others = this.actors.filter((o) => o !== a && o.cfg.habitat === a.cfg.habitat && !o.spawn);
    let best = { x: clamp(a.x + rand(-30, 30), minX, maxX), y: lanes[0], score: -1 };
    for (let i = 0; i < 10; i++) {
      const x = rand(minX, maxX);
      const y = lanes[Math.floor(rand(0, lanes.length))];
      if (Math.abs(x - a.x) < minDist) continue;
      let score = 1e9;
      for (const o of others) {
        const ox = o.mode === 'walk' || o.mode === 'charge' || o.mode === 'fly' || o.mode === 'glide' || o.mode === 'swim' || o.mode === 'swoop' ? o.tx : o.x;
        const oy = o.mode === 'walk' || o.mode === 'charge' ? o.ty : o.baseY;
        score = Math.min(score, Math.hypot(x - ox, (y - oy) * 2.2));
      }
      if (score > best.score) best = { x, y, score };
    }
    return best;
  }

  private heightOf(a: Actor) {
    const b = a.spec.baked.bounds;
    return (b.y1 - b.y0) * a.scale * this.laneScale(a) * (a.cfg.habitat === 'ground' ? 1 : 0.5);
  }

  private laneScale(a: Actor) {
    if (a.cfg.habitat !== 'ground') return a.cfg.habitat === 'sky' ? 0.4 : 0.42;
    return 0.26 + 0.24 * clamp((a.y - GROUND_FAR) / (GROUND_NEAR - GROUND_FAR), 0, 1);
  }

  /* ───── 연출: 부화 ───── */

  private beginSpawn(a: Actor) {
    const kind = this.opts.kind;
    const prop = svgEl('g', { class: 'w-spawn-prop' });
    const hero = a.cfg.habitat;
    if (hero === 'ground') {
      a.x = rand(50, 110);
      a.y = rand(104, 118);
    } else if (hero === 'sky') {
      a.x = rand(50, 110);
      a.y = 100;
    } else {
      a.x = rand(50, 110);
      a.y = rand(60, 84);
    }
    prop.innerHTML = this.propMarkup(kind);
    this.opts.fx.appendChild(prop);
    a.baseY = a.y;
    a.spawn = { t: 0, prop, kind, burst: false };
    a.mode = 'spawn';
    a.bodyG.style.opacity = '0';
    a.shadow.setAttribute('opacity', '0');
  }

  private propMarkup(kind: WorldKind) {
    if (kind === 'jungle') {
      return `<g class="w-prop-in"><ellipse cx="0" cy="0" rx="9" ry="3" fill="#18381f" opacity=".35"/>
        <g class="w-prop-body"><circle cx="-5" cy="-6" r="6" fill="#2f7a3f"/><circle cx="5" cy="-7" r="7" fill="#3a8c49"/><circle cx="0" cy="-12" r="6.5" fill="#46a056"/>
        <path d="M-6 -4 q2 -6 4 0 M3 -9 q3 -6 5 0" stroke="#256033" stroke-width="1" fill="none"/></g></g>`;
    }
    if (kind === 'ocean') {
      return `<g class="w-prop-in"><ellipse cx="0" cy="0" rx="3" ry="1" fill="#fff" opacity=".0"/>
        <g class="w-prop-body"><circle cx="0" cy="-9" r="9.5" fill="#e8fbff" fill-opacity=".35" stroke="#fff" stroke-width="1.1"/>
        <ellipse cx="-3.2" cy="-12.5" rx="2.6" ry="1.6" fill="#fff" opacity=".85" transform="rotate(-30 -3.2 -12.5)"/></g></g>`;
    }
    return `<g class="w-prop-in"><ellipse cx="0" cy="0" rx="11" ry="3.2" fill="#6b4423"/>
      <path d="M-11 0 q3 -4 6 -1 M5 -1 q3 -3 6 1 M-4 1 q4 -3 8 0" stroke="#a87b3c" stroke-width="1" fill="none"/>
      <g class="w-prop-body"><path d="M0 -1 C-8 -1 -8.5 -17 0 -19 C8.5 -17 8 -1 0 -1Z" fill="#fff4d6" stroke="#e5cf9d" stroke-width=".8"/>
      <circle cx="-3" cy="-11" r="1.6" fill="#8fd27a"/><circle cx="3" cy="-7" r="1.3" fill="#8fd27a"/><circle cx="2" cy="-14.5" r="1.1" fill="#8fd27a"/>
      <path class="w-crack" d="M-4.5 -10 l2 2 l2 -3 l2 3 l2 -2 l1.5 2" stroke="#9a7a45" stroke-width=".9" fill="none" stroke-linejoin="round"/></g></g>`;
  }

  private updateSpawn(a: Actor, dt: number) {
    const s = a.spawn!;
    s.t += dt;
    const t = s.t;
    const k = this.laneScale(a);
    const prop = s.prop;
    const popIn = clamp(t / 0.45, 0, 1);
    const ps = easeOutBack(popIn) * (a.cfg.habitat === 'sky' ? 1.05 : 1.15) * Math.max(0.5, k * 2.2);
    const wobble = t > 0.6 ? Math.sin(t * 22) * clamp((t - 0.6) * 5, 0, 1) * 7 : 0;
    const bodyEl = prop.querySelector('.w-prop-body');
    prop.setAttribute('transform', `translate(${a.x} ${a.y}) scale(${ps})`);
    if (bodyEl) (bodyEl as SVGElement).setAttribute('transform', `rotate(${wobble} 0 -2)`);
    const crack = prop.querySelector('.w-crack') as SVGElement | null;
    if (crack) crack.setAttribute('opacity', String(clamp((t - 0.9) / 0.5, 0, 1)));

    if (t > 0.7 && Math.floor(t * 5) !== Math.floor((t - dt) * 5)) {
      this.emit('spark', a.x + rand(-5, 5), a.y - rand(6, 14), { vy: -rand(10, 22), vx: rand(-6, 6), life: 0.8, size: rand(0.8, 1.5), color: '#ffe27a' });
    }

    if (t >= 1.7 && !s.burst) {
      s.burst = true;
      sound.playMagicSpawn();
      prop.remove();
      this.burst(a.x, a.y - 8, s.kind);
      a.bodyG.style.opacity = '1';
      a.shadow.setAttribute('opacity', a.cfg.habitat === 'ground' ? '0.22' : '0');
      this.opts.onToast(`짠! ${a.spec.name} 친구가 나타났어요!`);
      this.shake = 0.35;
    }
    if (s.burst) {
      const u = clamp((t - 1.7) / 0.7, 0, 1);
      a.react = 0;
      // 튀어나오며 커지는 팝 효과는 pose()에서 spawnPop을 읽는다
      a.pop = easeOutBack(u);
      if (t > 2.5) {
        a.spawn = undefined;
        a.pop = undefined;
        this.enter(a, a.cfg.habitat === 'ground' ? 'cheer' : a.cfg.habitat === 'sky' ? 'fly' : 'swim');
        if (a.cfg.habitat === 'sky') {
          a.ty = rand(14, 30);
          a.tx = rand(10, 150);
          a.dir = a.tx >= a.x ? 1 : -1;
        }
      }
    }
  }

  private burst(x: number, y: number, kind: WorldKind) {
    const colors = kind === 'ocean' ? ['#dffcfb', '#ffffff', '#9be7ff'] : kind === 'jungle' ? ['#6fcf6f', '#b9f08a', '#ffe27a'] : ['#fff4d6', '#ffe27a', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(14, 34);
      this.emit(i < 6 && kind === 'dino' ? 'shell' : 'spark', x, y, {
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 14,
        life: rand(0.7, 1.2),
        size: rand(1, 2.4),
        color: colors[i % colors.length],
      });
    }
    this.emit('ring', x, y + 6, { life: 0.7, size: 4, grow: 38, color: '#fff7c2' });
  }

  private splash(x: number, y: number) {
    for (let i = 0; i < 10; i++) {
      this.emit('spark', x + rand(-6, 6), y, { vx: rand(-14, 14), vy: -rand(14, 34), g: 60, life: 0.9, size: rand(0.8, 1.6), color: '#dffcfb' });
    }
  }

  /* ───── 파티클 ───── */

  private emit(
    type: 'spark' | 'shell' | 'text' | 'ring' | 'dust' | 'bubble',
    x: number,
    y: number,
    o: { vx?: number; vy?: number; g?: number; life?: number; size?: number; grow?: number; color?: string; text?: string; bold?: boolean }
  ) {
    if (this.particles.length > 90) return;
    let el: SVGElement;
    const size = o.size ?? 1.5;
    const color = o.color ?? '#fff';
    if (type === 'text') {
      el = svgEl('text', { 'text-anchor': 'middle', 'font-size': size, 'font-weight': o.bold ? 800 : 400, fill: o.bold ? '#7c2d12' : '#000', stroke: o.bold ? '#fff' : 'none', 'stroke-width': o.bold ? 0.5 : 0, 'paint-order': 'stroke' });
      el.textContent = o.text ?? '';
    } else if (type === 'shell') {
      el = svgEl('path', { d: 'M0 0 L2.4 -1.2 L1.6 1.8 Z', fill: '#fff4d6', stroke: '#e5cf9d', 'stroke-width': 0.3 });
    } else if (type === 'ring') {
      el = svgEl('circle', { r: size, fill: 'none', stroke: color, 'stroke-width': 1.2 });
    } else if (type === 'bubble') {
      el = svgEl('circle', { r: size, fill: 'none', stroke: '#e6fdff', 'stroke-width': 0.4, opacity: 0.8 });
    } else {
      el = svgEl('circle', { r: size, fill: color, opacity: type === 'dust' ? 0.55 : 1 });
    }
    el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
    if (type === 'ring' || type === 'bubble' || type === 'spark' || type === 'dust') {
      el.setAttribute('cx', x.toFixed(2));
      el.setAttribute('cy', y.toFixed(2));
      el.removeAttribute('transform');
    }
    this.opts.fx.appendChild(el);
    this.particles.push({ el, x, y, vx: o.vx ?? 0, vy: o.vy ?? 0, g: o.g ?? (type === 'spark' || type === 'shell' ? 40 : 0), life: o.life ?? 1, age: 0, spin: type === 'shell' ? rand(-420, 420) : 0, rot: 0, grow: o.grow ?? (type === 'dust' ? 4 : 0), size });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.el.remove();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      const u = p.age / p.life;
      const tag = p.el.tagName;
      p.el.setAttribute('opacity', String(clamp(1.6 * (1 - u), 0, 1)));
      if (tag === 'circle') {
        const radius = p.size + p.grow * u * 0.25;
        p.el.setAttribute('r', radius.toFixed(2));
        p.el.setAttribute('cx', p.x.toFixed(2));
        p.el.setAttribute('cy', p.y.toFixed(2));
      } else {
        p.el.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.rot.toFixed(1)})`);
      }
    }
  }

  /* ───── 프레임 ───── */

  private update(dt: number) {
    this.clock += dt;
    for (const a of this.actors) {
      if (a.modeT < 0) {
        a.modeT += dt; // 등장 대기
        if (a.modeT >= 0) {
          a.bodyG.style.opacity = '1';
          this.emit('spark', a.x, a.y - 12, { vy: -10, life: 0.6, size: 1.2, color: '#fff7c2' });
        }
        continue;
      }
      if (a.spawn) this.updateSpawn(a, dt);
      else this.behave(a, dt);
      this.pose(a);
    }
    this.updateParticles(dt);

    this.sortClock += dt;
    if (this.sortClock > 0.3) {
      this.sortClock = 0;
      this.sortDepth();
    }

    if (this.shake > 0) {
      this.shake -= dt;
      if (this.shake <= 0) this.opts.stage.removeAttribute('transform');
      const m = this.shake > 0 ? Math.sin(this.clock * 70) * this.shake * 1.6 : 0;
      this.opts.stage.setAttribute('transform', m ? `translate(${m.toFixed(2)} ${(m * 0.6).toFixed(2)})` : '');
    }
  }

  private sortDepth() {
    const layer = this.opts.ground;
    const ordered = this.actors.filter((a) => a.cfg.habitat !== 'sky' && a.root.parentNode === layer).sort((a, b) => a.y - b.y);
    ordered.forEach((a, i) => {
      if (layer.children[i] !== a.root) layer.insertBefore(a.root, layer.children[i] ?? null);
    });
  }

  private behave(a: Actor, dt: number) {
    a.modeT += dt;
    a.react = Math.max(0, a.react - dt);
    const moving = a.mode === 'walk' || a.mode === 'charge' || a.mode === 'fly' || a.mode === 'glide' || a.mode === 'swoop' || a.mode === 'swim';

    if (moving) {
      const dx = a.tx - a.x;
      const dy = a.ty - a.baseY;
      const step = a.speed * dt;
      if (Math.abs(dx) > 1.5) {
        a.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
        a.dir = dx > 0 ? 1 : -1;
      }
      const vy =
        a.cfg.habitat === 'ground' ? step * 0.35 : Math.max(step * 0.25, (Math.abs(dy) / Math.max(0.4, Math.abs(dx) / Math.max(1, a.speed))) * dt);
      a.baseY += clamp(dy, -vy, vy);
      const arrived = Math.abs(dx) <= 1.5 && (a.cfg.habitat !== 'ground' || Math.abs(dy) <= 1.5);
      a.phase += dt * a.cfg.stepHz * (a.mode === 'charge' ? 1.8 : 1) * Math.PI * 2;
      if (arrived || a.modeT > a.modeDur) this.chooseMode(a);
      // 걸을 때 발이 닿는 순간 먼지
      if (a.cfg.habitat === 'ground') {
        const k = Math.floor(a.phase / Math.PI);
        if (k !== a.fxClock) {
          a.fxClock = k;
          if (a.mode === 'charge' || (a.spec.species === 'trex' && k % 2 === 0) || (a.spec.hero && k % 3 === 0)) {
            this.emit('dust', a.x - a.dir * 4, a.y - 1, { vx: -a.dir * rand(2, 6), vy: -rand(2, 6), life: 0.5, size: 0.9, color: '#d9c7a0' });
          }
        }
      }
      if (a.mode === 'swim' && Math.random() < dt * 0.9) this.emit('bubble', a.x + a.dir * 4, a.baseY - 3, { vy: -rand(8, 14), life: 1.3, size: rand(0.6, 1.2) });
    } else {
      a.phase += dt * 1.4 * Math.PI * 2 * 0.25;
      if (a.mode === 'pounce' && a.modeT > a.modeDur * 0.35) a.x = clamp(a.x + a.dir * dt * 26, 16, 144);
      if (a.mode === 'breach') a.x = clamp(a.x + a.dir * dt * 10, 14, 146);
      if (a.modeT > a.modeDur) this.chooseMode(a);
    }

    // 하늘/물 캐릭터는 몸 전체가 물결치며 위아래로 흔들린다
    a.y = a.baseY;
    if (a.cfg.habitat !== 'ground') a.y += Math.sin(this.clock * (a.cfg.habitat === 'sky' ? 1.7 : 1.3) + a.seed) * (a.cfg.habitat === 'sky' ? 2.2 : 1.6);

    // 장면 밖으로 나가면 반대편에서 돌아오게 한다(하늘)
    if (a.cfg.habitat === 'sky' && (a.x < -14 || a.x > SCENE_W + 14)) a.dir = a.x < 0 ? 1 : -1;

    // 방향 전환은 종이처럼 뒤집히며 부드럽게
    const wantFlip = a.dir * a.sprDir;
    a.flip = approach(a.flip, wantFlip, dt * 5);
  }

  private pose(a: Actor) {
    const cfg = a.cfg;
    const t = this.clock;
    const m = a.mode;
    const mt = a.modeT;
    const u = clamp(mt / Math.max(0.01, a.modeDur), 0, 1);
    const fw = a.sprDir; // 몸 안쪽 좌표계에서 "앞" 방향(-1 왼쪽, +1 오른쪽)
    const moving = m === 'walk' || m === 'charge' || m === 'fly' || m === 'glide' || m === 'swoop' || m === 'swim';

    const step = Math.sin(a.phase);
    let lift = moving && cfg.habitat === 'ground' ? Math.abs(step) * cfg.bob : Math.sin(t * 2.2 + a.seed) * 0.5;
    let rot = moving ? step * cfg.roll : Math.sin(t * 1.3 + a.seed) * 0.6;
    let lean = moving ? cfg.lean * (m === 'charge' ? 3.5 : 1) : 0;
    let sx = 1;
    let sy = 1 + (moving ? 0 : Math.sin(t * 2.2 + a.seed) * 0.012);
    let head = Math.sin(t * 1.6 + a.seed) * cfg.head;
    let tail = Math.sin(t * cfg.tailHz * Math.PI * 2 * 0.5 + a.seed) * cfg.tail * (moving ? 1 : 0.6);
    let limbNear = moving ? step * cfg.leg : 0;
    let limbFar = -limbNear;
    let arm = Math.sin(t * 4 + a.seed) * 3;
    let wing = 0;

    if (cfg.habitat === 'sky') {
      const flapHz = m === 'glide' ? 0.9 : m === 'swoop' ? 1.6 : cfg.stepHz;
      wing = Math.sin(t * flapHz * Math.PI * 2 + a.seed) * cfg.wing * (m === 'glide' ? 0.25 : 1);
      lift = wing * 0.04;
      lean = m === 'swoop' ? (a.ty > a.baseY ? 10 : -8) : m === 'glide' ? 0 : -3;
      rot = Math.sin(t * 1.2 + a.seed) * 3;
      limbNear = Math.sin(t * 3 + a.seed) * 4;
      limbFar = -limbNear;
    }
    if (cfg.habitat === 'water') {
      lift = 0;
      rot = Math.sin(t * cfg.tailHz * 2 + a.seed) * cfg.roll;
      tail = Math.sin(t * cfg.tailHz * Math.PI * 2 + a.seed) * cfg.tail;
      arm = Math.sin(t * 3 + a.seed) * 10;
    }

    switch (m) {
      case 'roar': {
        const k = Math.sin(Math.PI * clamp(u * 1.15, 0, 1));
        head = -fw * (18 * k) + Math.sin(t * 38) * 1.4 * k;
        sy = 1 + 0.05 * k;
        sx = 1 + 0.03 * k;
        lift = k * 1.5;
        tail += Math.sin(t * 9) * 5 * k;
        arm = Math.sin(t * 14) * 8 * k;
        break;
      }
      case 'graze': {
        const k = Math.sin(Math.PI * u) ** 0.6;
        head = fw * (a.spec.species === 'brachio' ? 16 : 11) * k + Math.sin(t * 11) * 1.5 * k;
        break;
      }
      case 'look': {
        head = -fw * Math.sin(u * Math.PI * 2) * 9 + Math.sin(t * 1.6 + a.seed) * 2;
        rot += Math.sin(u * Math.PI * 2) * 1.2;
        break;
      }
      case 'wag': {
        tail = Math.sin(t * 13) * cfg.tail * 1.5;
        rot += Math.sin(t * 13) * 1.2;
        break;
      }
      case 'trumpet': {
        const k = Math.sin(Math.PI * clamp(u * 1.2, 0, 1));
        head = -fw * 15 * k;
        lift = k * 1.2;
        sy = 1 + 0.04 * k;
        break;
      }
      case 'charge':
        head = fw * 6 + Math.sin(a.phase * 2) * 2;
        sy = 1 - 0.02;
        break;
      case 'pounce': {
        // 웅크렸다가 앞으로 뛰어오른다
        if (u < 0.35) {
          const k = u / 0.35;
          sy = 1 - 0.14 * k;
          sx = 1 + 0.08 * k;
          lean = -fw * 3 * k;
        } else {
          const k = (u - 0.35) / 0.65;
          lift = Math.sin(Math.PI * k) * 16;
          lean = 6;
          sy = 1 + 0.06 * Math.sin(Math.PI * k);
          limbNear = -28 * Math.sin(Math.PI * k);
          limbFar = 28 * Math.sin(Math.PI * k);
        }
        break;
      }
      case 'breach': {
        const k = Math.sin(Math.PI * u);
        lift = k * 34;
        rot = (u - 0.5) * 36 * -a.dir;
        tail = Math.sin(t * 8) * cfg.tail * 1.3;
        if (u > 0.92 && a.fxClock !== -1) {
          a.fxClock = -1;
          this.splash(a.x, a.baseY);
        }
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(mt * 6.5)) * Math.max(0, 1 - mt / a.modeDur);
        lift = hop * 11;
        sy = 1 + (hop > 0.05 ? 0.03 : -0.04);
        head = -fw * 7 * hop;
        tail = Math.sin(t * 12) * cfg.tail * 1.4;
        arm = Math.sin(t * 16) * 9;
        break;
      }
      default:
    }

    if (a.react > 0) {
      const k = a.react / 0.8;
      lift += Math.sin(Math.PI * (1 - k)) * 12;
      sy *= 1 + 0.05 * Math.sin(Math.PI * (1 - k));
      head += -fw * 6 * k;
    }

    // 부화 직후 튀어나오는 팝
    const popS = a.pop === undefined ? 1 : Math.max(0.01, a.pop);

    const s = this.laneScale(a) * a.scale * popS;
    const fx = a.flip * sx;
    a.bodyG.setAttribute(
      'transform',
      `translate(${a.x.toFixed(2)} ${(a.y - lift * s).toFixed(2)}) rotate(${(lean * a.dir).toFixed(2)}) rotate(${(rot * 1).toFixed(2)}) scale(${(fx * s).toFixed(4)} ${(sy * s).toFixed(4)}) translate(${(-a.ax).toFixed(2)} ${(-a.ay).toFixed(2)})`
    );
    a.shadow.setAttribute('cx', a.x.toFixed(2));
    a.shadow.setAttribute('cy', (a.y + 0.6).toFixed(2));
    a.shadow.setAttribute('rx', (22 * s * (1 - lift * 0.01)).toFixed(2));
    a.shadow.setAttribute('ry', (3.6 * s).toFixed(2));

    const set = (name: PartName, deg: number) => {
      const g = a.parts[name];
      const p = a.spec.baked.pivots[name];
      if (g && p) g.setAttribute('transform', `rotate(${deg.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    };
    set('head', head);
    set('tail', tail);
    set('limbNear', limbNear);
    set('limbFar', limbFar);
    set('arm', arm);
    set('wingL', wing);
    set('wingR', -wing);
  }
}
