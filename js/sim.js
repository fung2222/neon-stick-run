// NEON STICK RUN — pure simulation: procedural rooftop course, runner physics, hazards, pickups, scoring and an
// autopilot (receding-horizon search) used by ?demo=1 and the headless difficulty checks. No DOM, no THREE.
import { PHYS, STEP, STAGES, ENDLESS, ENDLESS_POOL, SCORE, STAR_CHIPS, TRIAL } from './config.js';
import { makeRng } from './rng.js';
import { endlessCurve, milestoneOf } from '../vendor/cyber-kit/core/endless.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ROOF_MIN = -3, ROOF_MAX = 3.5;

// ------------------------------------------------------------------------------------------------ speed / difficulty
export function speedAt(w, x) {
  if (w.mode === 'stage') return lerp(w.S.v0, w.S.v1, clamp(x / w.S.len, 0, 1));
  return endlessCurve(Math.max(0, x) / ENDLESS.vEvery, { start: ENDLESS.v0, cap: ENDLESS.vCap, tau: ENDLESS.vTau });
}
export function diffAt(w, x) {
  if (w.mode === 'stage') return w.S.d;
  return endlessCurve(Math.max(0, x) / ENDLESS.dEvery, { start: ENDLESS.d0, cap: ENDLESS.dCap, tau: ENDLESS.dTau });
}

// ------------------------------------------------------------------------------------------------ world generation
function addPlat(w, x0, x1, y, kind = 'roof') { const p = { id: w.id++, x0, x1, y, kind }; w.plats.push(p); return p; }
function addObs(w, o) { o.id = w.id++; w.obs.push(o); return o; }
function addPick(w, type, x, y) { const k = { id: w.id++, type, x, y }; w.picks.push(k); if (type === 'chip') w.chipTotal++; return k; }
function chipLine(w, x0, x1, y, gap = 1.7) { for (let x = x0; x <= x1; x += gap) addPick(w, 'chip', x, y); }
function chipArc(w, x0, x1, y0, y1, h, n = 6) {
  for (let i = 0; i <= n; i++) { const s = i / n; addPick(w, 'chip', lerp(x0, x1, s), lerp(y0, y1, s) + h * 4 * s * (1 - s)); }
}

/** extend the current roof by len metres (optionally with a chip line and the periodic power-up) */
function run(w, len, chips = true) {
  const c = w.cur, x0 = c.x1; c.x1 += len;
  if (chips && len > 5 && w.rng.chance(0.55)) chipLine(w, x0 + 1.5, c.x1 - 1.5, c.y + 0.95);
  if (c.x1 > w.nextPow && len > 6 && c.kind === 'roof') {
    const kinds = w.mode === 'stage' && w.stage <= 1 ? ['magnet', 'shield'] : ['magnet', 'shield', 'slow'];
    addPick(w, w.rng.pick(kinds), (x0 + c.x1) / 2, c.y + 1.15);
    w.nextPow = c.x1 + w.rng.range(170, 260);
  }
}
/** close the current roof and open a new one after a gap */
function jump(w, gap, dy, kind = 'roof', len = 1) {
  const x0 = w.cur.x1 + gap, y = clamp(w.cur.y + dy, ROOF_MIN, ROOF_MAX);
  w.cur = addPlat(w, x0, x0 + len, y, kind);
  return w.cur;
}
const lead = (v, d) => v * lerp(1.35, 0.7, d);

export const PATTERNS = {
  flat(w, v, d, r) { run(w, v * r.range(0.9, 1.7) * lerp(1, 0.65, d)); },
  gap(w, v, d, r) {
    run(w, lead(v, d)); const g = v * r.range(0.3, 0.42 + 0.12 * d); const dy = g > 0.45 * v ? r.range(-1.6, 0.3) : r.range(-1.6, 1.0);
    const c = w.cur; chipArc(w, c.x1 - 1, c.x1 + g + 1.5, c.y + 0.9, clamp(c.y + dy, ROOF_MIN, ROOF_MAX) + 0.9, 1.9);
    jump(w, g, dy); run(w, v * 0.55, false);
  },
  gapWide(w, v, d, r) {
    run(w, lead(v, d)); const g = v * r.range(0.62, 0.8 + 0.2 * d); const dy = g > 0.85 * v ? r.range(-2, -0.4) : r.range(-1.5, 0.4);
    const c = w.cur; chipArc(w, c.x1 - 0.5, c.x1 + g + 1.5, c.y + 0.9, clamp(c.y + dy, ROOF_MIN, ROOF_MAX) + 0.9, g > 0.85 * v ? 4.2 : 3.0, 8);
    jump(w, g, dy); run(w, v * 0.6, false);
  },
  step(w, v, d, r) {
    run(w, lead(v, d)); const c = w.cur; let g, dy;
    if (c.y < 2.2 && r.chance(0.6)) { dy = r.range(0.9, 1.7); g = v * r.range(0.12, 0.24); } else { dy = -r.range(1.0, 2.2); g = v * r.range(0.15, 0.35); }
    chipArc(w, c.x1 - 1, c.x1 + g + 1.5, c.y + 0.9, clamp(c.y + dy, ROOF_MIN, ROOF_MAX) + 0.9, 1.6, 4);
    jump(w, g, dy); run(w, v * 0.5, false);
  },
  vault(w, v, d, r) {
    run(w, lead(v, d)); const n = d > 0.35 && r.chance(0.5) ? 2 : 1;
    for (let i = 0; i < n; i++) { const c = w.cur, bx = c.x1 + 1; addObs(w, { type: 'vault', x: bx, w: 1.3, y0: c.y, y1: c.y + 1.0 }); chipArc(w, bx - 1.5, bx + 2.8, c.y + 1.1, c.y + 1.1, 1.0, 3); run(w, v * r.range(0.6, 0.8), false); }
  },
  pipe(w, v, d, r) {
    run(w, lead(v, d)); const n = d > 0.45 && r.chance(0.45) ? 2 : 1;
    for (let i = 0; i < n; i++) { const c = w.cur, px = c.x1 + 1; addObs(w, { type: 'pipe', x: px, w: 0.45, y0: c.y + 1.05, y1: c.y + 1.4 }); chipLine(w, px - 2.5, px + 3, c.y + 0.45, 1.4); run(w, v * r.range(0.55, 0.7), false); }
  },
  billboard(w, v, d, r) {
    run(w, lead(v, d)); const c = w.cur, bx = c.x1 + 1;
    addObs(w, { type: 'board', x: bx, w: 0.4, y0: c.y + 1.08, y1: c.y + 3.9, label: r.int(0, 7) }); chipLine(w, bx - 2.5, bx + 3, c.y + 0.45, 1.4); run(w, v * 0.6, false);
  },
  drone(w, v, d, r, low = false) {
    run(w, lead(v, d)); const c = w.cur, dx = c.x1 + 1;
    const patrol = !low && d > 0.5 && r.chance(0.35);
    addObs(w, { type: 'drone', x: dx, r: 0.42, y: c.y + (low ? 0.62 : patrol ? 1.6 : 1.55), amp: patrol ? 0.75 : 0.12, wv: patrol ? 2.2 : 3, ph: r.range(0, 6.28), patrol });
    if (low) chipArc(w, dx - 3, dx + 3, c.y + 1, c.y + 1, 1.5, 4); else chipLine(w, dx - 2.5, dx + 2.5, c.y + 0.45, 1.25);
    run(w, v * 0.6, false);
  },
  droneLow(w, v, d, r) { PATTERNS.drone(w, v, d, r, true); },
  laser(w, v, d, r, pulse = false) {
    run(w, lead(v, d)); const c = w.cur, lx = c.x1 + 1; const two = !pulse && d > 0.45 && r.chance(0.45);
    addObs(w, pulse ? { type: 'laser', x: lx, w: 0.14, y0: c.y, y1: c.y + 2.5, pulse: true, per: 1.5, on: 0.55, ph: r.next() } : { type: 'laser', x: lx, w: 0.14, y0: c.y, y1: c.y + 1.3 });
    chipArc(w, lx - 3, lx + 3, c.y + 1, c.y + 1, pulse ? 2.4 : 1.4, 4);
    if (two) { const l2 = lx + v * r.range(0.5, 0.62); c.x1 = Math.max(c.x1, l2 + 1); addObs(w, { type: 'laser', x: l2, w: 0.14, y0: c.y, y1: c.y + 1.3 }); }
    run(w, v * 0.6, false);
  },
  laserPulse(w, v, d, r) { PATTERNS.laser(w, v, d, r, true); },
  wall(w, v, d, r) {
    run(w, lead(v, d)); const c = w.cur, gs = c.x1, W = v * r.range(1.45, 1.8), wy = clamp(c.y + r.range(0.6, 1.4), ROOF_MIN + 1, ROOF_MAX + 1.2);
    const z = { id: w.id++, x0: gs + v * 0.3, x1: gs + W - v * 0.18, y: wy }; w.walls.push(z);
    chipLine(w, z.x0 + 1, z.x1 - 0.5, wy + 0.95, 1.6);
    jump(w, W, clamp(wy + r.range(-2, -0.5), ROOF_MIN, ROOF_MAX) - c.y); run(w, v * 0.7, false);
  },
  grapple(w, v, d, r) {
    run(w, lead(v, d)); const c = w.cur, gs = c.x1, W = v * r.range(1.25, 1.45), ax = gs + W * 0.4, ay = c.y + r.range(5.0, 5.8);
    w.graps.push({ id: w.id++, x: ax, y: ay });
    for (let i = 0; i <= 6; i++) { const th = -0.7 + 1.5 * i / 6; addPick(w, 'chip', ax + 3.6 * Math.sin(th), ay - 3.6 * Math.cos(th) - 1.0); }
    jump(w, W, r.range(-1.5, 0.4)); run(w, v * 0.7, false);
  },
  collapse(w, v, d, r) {
    run(w, lead(v, d)); const n = 2 + (d > 0.6 ? 1 : 0);
    for (let i = 0; i < n; i++) { const p = jump(w, v * r.range(0.22, 0.32), r.range(-0.6, 0.6), 'collapse'); p.x1 = p.x0 + v * r.range(0.42, 0.55); chipLine(w, p.x0 + 0.8, p.x1 - 0.6, p.y + 0.95, 1.5); }
    jump(w, v * 0.28, r.range(-0.8, 0.4)); run(w, v * 0.6, false);
  },
  combo(w, v, d, r) {
    const pool = ['gap', 'pipe', 'drone', 'laser', 'billboard', 'droneLow', 'vault'];
    const a = r.pick(pool); let b = r.pick(pool); if (b === a) b = 'gap';
    PATTERNS[a](w, v, Math.min(1, d + 0.25), r); PATTERNS[b](w, v, Math.min(1, d + 0.3), r);
  },
};

export function createWorld({ mode = 'stage', stage = 1, seed = 1 } = {}) {
  const S = mode === 'stage' ? STAGES[clamp(stage, 1, STAGES.length) - 1] : null;
  const w = { mode, stage, S, seed, rng: makeRng(seed), plats: [], obs: [], picks: [], walls: [], graps: [], id: 1, chipTotal: 0, nextPow: 140, len: S ? S.len : Infinity, last: null, featN: 0 };
  w.cur = addPlat(w, -40, 26, 0);
  if (S) { genUntil(w, S.len - 30); w.cur.x1 = Math.max(w.cur.x1, S.len + 70); sortWorld(w); }
  else genUntil(w, 320);
  return w;
}
/** make sure the course is generated at least up to x = upto (endless only; stages are fully generated up front) */
export function extendWorld(w, upto) { if (w.len === Infinity && w.cur.x1 < upto) genUntil(w, upto); }
function genUntil(w, upto) {
  const r = w.rng;
  while (w.cur.x1 < upto) {
    const x = w.cur.x1, v = speedAt(w, x), d = diffAt(w, x);
    let pool = w.S ? w.S.pool : ENDLESS_POOL;
    if (!w.S) { // endless: unlock patterns gradually by distance
      const order = ['flat', 'gap', 'step', 'vault', 'pipe', 'billboard', 'gapWide', 'drone', 'laser', 'droneLow', 'wall', 'grapple', 'collapse', 'laserPulse', 'combo'];
      const n = clamp(5 + Math.floor(x / 120), 5, order.length); pool = order.slice(0, n);
    }
    let pat = r.pick(pool); if (pat === w.last && pat !== 'gap' && r.chance(0.6)) pat = r.pick(pool);
    if (w.S && w.S.feature && ++w.featN % 4 === 0) pat = w.S.feature;
    w.last = pat; PATTERNS[pat](w, v, d, r);
    if (r.chance(lerp(0.45, 0.15, d))) PATTERNS.flat(w, v, d, r);
  }
  sortWorld(w);
}
function sortWorld(w) { w.obs.sort((a, b) => a.x - b.x); w.picks.sort((a, b) => a.x - b.x); }
function prune(run) {
  const w = run.w, cut = run.p.x - 70;
  if (w.plats.length && w.plats[0].x1 < cut) w.plats = w.plats.filter((p) => p.x1 >= cut || p === w.cur);
  if (w.obs.length && w.obs[0].x < cut) w.obs = w.obs.filter((o) => o.x >= cut);
  if (w.picks.length && w.picks[0].x < cut) { w.picks = w.picks.filter((k) => k.x >= cut); }
  w.walls = w.walls.filter((z) => z.x1 >= cut); w.graps = w.graps.filter((g) => g.x >= cut);
  for (const [id, t0] of run.m.collapse) if (run.t - t0 > 12) run.m.collapse.delete(id);
  if (run.m.taken.size > 4000) run.m.taken = new Set([...run.m.taken].slice(-1500));
}

// binary search: first index whose key >= v
function lowerBound(arr, v, key) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][key] < v) lo = m + 1; else hi = m; } return lo; }
export function platsNear(w, x0, x1, out = []) { out.length = 0; for (let i = lowerBound(w.plats, x0, 'x1'); i < w.plats.length && w.plats[i].x0 <= x1; i++) out.push(w.plats[i]); return out; }
export function obsNear(w, x0, x1, out = []) { out.length = 0; for (let i = lowerBound(w.obs, x0 - 3, 'x'); i < w.obs.length && w.obs[i].x <= x1; i++) out.push(w.obs[i]); return out; }

// ------------------------------------------------------------------------------------------------ dynamic geometry
const COLLAPSE_DELAY = 0.3, COLLAPSE_ACC = 22;
export function topOf(run, s) {
  if (s.type === 'vault') return s.y1;
  if (s.kind !== 'collapse') return s.y;
  const t0 = run.m.collapse.get(s.id); if (t0 === undefined) return s.y;
  const k = run.t - t0 - COLLAPSE_DELAY; return k > 0 ? s.y - 0.5 * COLLAPSE_ACC * k * k : s.y;
}
export const droneY = (o, t) => o.y + o.amp * Math.sin(o.wv * t + o.ph);
export const laserOn = (o, t) => !o.pulse || ((t / o.per + o.ph) % 1) < o.on;

// ------------------------------------------------------------------------------------------------ run state
export function createRun({ mode = 'stage', stage = 1, seed = null, trial = false } = {}) {
  if (seed === null || seed === undefined) seed = mode === 'stage' ? 7919 * stage + 13 : (Math.random() * 1e9) >>> 0;
  const w = createWorld({ mode, stage, seed });
  const p0 = w.plats[0];
  const p = { x: 0, y: p0.y, vy: 0, vx: speedAt(w, 0), mode: 'run', ground: p0, coyote: 0, jumps: 1, holdT: 0, slideT: 0, slideQ: false, dashT: 0, dashCd: 0, buf: 0,
    wall: null, grap: null, vaultT: 0, shield: false, magnetT: 0, slowT: 0, inv: 0, airT: 0, prevX: 0, lastWall: 0, lastGrap: 0, flipT: 0, cause: null };
  return { mode, stage, seed, trial, w, p, t: 0, m: { taken: new Set(), smashed: new Set(), collapse: new Map() }, ev: [], over: null, dist: 0, milestone: 0, look: false,
    stats: { chips: 0, style: 0, smashed: 0, vaults: 0, walls: 0, graps: 0, jumps: 0, revives: 0, pows: 0, bonusChips: 0 } };
}
export const runScore = (r) => Math.floor(r.dist) * SCORE.metre + r.stats.chips * SCORE.chip + r.stats.style;
export function starsOf(r) {
  if (!r.over || r.over.type !== 'clear') return 0;
  const k = r.w.chipTotal ? r.stats.chips / r.w.chipTotal : 1;
  return 1 + (k >= STAR_CHIPS[0] ? 1 : 0) + (k >= STAR_CHIPS[1] && r.stats.revives === 0 ? 1 : 0);
}

const _plats = [], _obs = [];
function emit(run, e) { if (!run.look) run.ev.push(e); }
function die(run, cause) {
  const p = run.p; if (p.mode === 'dead') return;
  p.mode = 'dead'; p.cause = cause; run.over = { type: 'dead', cause }; emit(run, { type: 'die', cause, x: p.x, y: p.y });
}
function hit(run, cause, o) {
  const p = run.p; if (p.inv > 0) return;
  if (p.shield) { p.shield = false; p.inv = PHYS.invuln; emit(run, { type: 'shield', x: p.x, y: p.y }); if (o && (o.type === 'drone' || o.type === 'board')) smash(run, o, false); return; }
  die(run, cause);
}
function smash(run, o, style = true) {
  run.m.smashed.add(o.id);
  if (style && !run.look) { run.stats.smashed++; run.stats.style += SCORE.smash; }
  emit(run, { type: 'smash', id: o.id, kind: o.type, x: o.x, y: o.type === 'drone' ? droneY(o, run.t) : (o.y0 + o.y1) / 2 });
}
function land(run, s, impact) {
  const p = run.p; p.mode = 'run'; p.ground = s; p.vy = 0; p.jumps = 1; p.holdT = 0; p.lastWall = 0; p.lastGrap = 0; p.airT = 0; p.vaultT = 0;
  if (p.slideQ) { p.slideQ = false; p.slideT = PHYS.slideT; }
  if (s.kind === 'collapse' && !run.m.collapse.has(s.id)) { run.m.collapse.set(s.id, run.t); emit(run, { type: 'collapse', id: s.id }); }
  emit(run, { type: 'land', imp: impact, x: p.x, y: p.y });
}
const pHeight = (p) => (p.slideT > 0 ? PHYS.hSlide : p.mode === 'air' ? 1.55 : PHYS.hStand);

/**
 * Advance one fixed step. inp = { press, held, slide, dash } (press/slide/dash are edge-triggered this step).
 */
export function step(run, inp) {
  if (run.over) return;
  const p = run.p, w = run.w, dt = STEP, P = PHYS;
  run.t += dt;
  p.dashT = Math.max(0, p.dashT - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.inv = Math.max(0, p.inv - dt);
  p.magnetT = Math.max(0, p.magnetT - dt); p.slowT = Math.max(0, p.slowT - dt); p.buf = Math.max(0, p.buf - dt);
  p.coyote = Math.max(0, p.coyote - dt); p.vaultT = Math.max(0, p.vaultT - dt); p.flipT = Math.max(0, p.flipT - dt);
  if (inp.press) p.buf = P.buffer;
  const vRun = speedAt(w, p.x);
  if (inp.dash && p.dashCd <= 0 && (p.mode === 'run' || p.mode === 'air')) {
    p.dashT = P.dashT; p.dashCd = P.dashCd; p.slideT = 0; if (p.mode === 'air') p.vy = Math.max(0, Math.min(p.vy, 2)); emit(run, { type: 'dash', air: p.mode === 'air' });
  }
  if (inp.slide) {
    if (p.mode === 'run') { if (p.slideT <= 0) emit(run, { type: 'slide' }); p.slideT = P.slideT; p.dashT = Math.min(p.dashT, 0.05); }
    else if (p.mode === 'air') { p.vy = Math.min(p.vy, -P.fastFall); p.slideQ = true; p.holdT = 0; p.dashT = 0; emit(run, { type: 'slam' }); }
  }
  const tv = vRun * (p.dashT > 0 ? 1 + P.dashBoost : 1);
  p.vx += (tv - p.vx) * (1 - Math.exp(-dt * (p.dashT > 0 ? 30 : 5)));
  p.prevX = p.x;
  const py = p.y;

  if (p.mode === 'grap') {
    const g = p.grap, a = g.a;
    g.om += -(P.g / g.L) * Math.sin(g.th) * dt; g.om = Math.max(g.om, (vRun / g.L) * 0.8); g.th += g.om * dt;
    p.x = a.x + g.L * Math.sin(g.th); p.y = a.y - g.L * Math.cos(g.th) - 1.9;
    const tap = p.buf > 0 && g.th > -0.25;
    if (g.th >= P.grapRelease || tap) {
      const s = g.om * g.L; p.vy = s * Math.sin(g.th) + (tap ? 3 : 1.5); p.vx = Math.max(vRun, s * Math.cos(g.th));
      p.mode = 'air'; p.jumps = 1; p.buf = 0; p.lastGrap = a.id; p.grap = null; p.holdT = 0; p.airT = 0;
      if (!run.look) { run.stats.graps++; run.stats.style += SCORE.grapple; } emit(run, { type: 'grapEnd', x: p.x, y: p.y });
    }
  } else if (p.mode === 'wall') {
    const z = p.wall;
    p.y += (z.y - p.y) * (1 - Math.exp(-dt * 14)); p.vy = 0; p.x += p.vx * dt;
    if (p.buf > 0) { p.vy = P.wallJump; p.mode = 'air'; p.jumps = 1; p.buf = 0; p.lastWall = z.id; p.wall = null; p.holdT = P.dblHold; emit(run, { type: 'wallJump' }); }
    else if (p.x >= z.x1) { p.vy = P.wallLaunch; p.mode = 'air'; p.jumps = 1; p.lastWall = z.id; p.wall = null; emit(run, { type: 'wallEnd' }); }
  } else if (p.mode === 'run' || p.mode === 'air') {
    if (p.buf > 0) {
      if (p.mode === 'run' || p.coyote > 0) {
        p.vy = P.jumpV; p.holdT = P.holdMax; p.mode = 'air'; p.ground = null; p.coyote = 0; p.buf = 0; p.slideT = 0; p.airT = 0;
        if (!run.look) run.stats.jumps++; emit(run, { type: 'jump', x: p.x, y: p.y });
      } else if (p.jumps > 0 && p.vaultT <= 0) {
        p.vy = P.dblV; p.holdT = P.dblHold; p.jumps--; p.buf = 0; p.flipT = 0.42; p.dashT = 0; emit(run, { type: 'dbl', x: p.x, y: p.y });
      }
    }
    if (p.mode === 'run') {
      const s = p.ground;
      p.x += p.vx * dt;
      const x1 = s.type === 'vault' ? s.x + s.w : s.x1;
      if (p.x - P.halfW * 0.6 > x1) { p.mode = 'air'; p.ground = null; p.coyote = P.coyote; p.vy = 0; p.holdT = 0; }
      else {
        const top = topOf(run, s), sinking = top < p.y - 1e-4; p.y = top;
        if (sinking) p.coyote = P.coyote;
        if (p.slideT > 0) {
          p.slideT -= dt;
          if (p.slideT <= 0) { // never stand up into a pipe / billboard
            for (const o of obsNear(w, p.x - 1, p.x + 1, _obs)) if ((o.type === 'pipe' || o.type === 'board') && !run.m.smashed.has(o.id) && p.x + P.halfW > o.x && p.x - P.halfW < o.x + o.w && p.y + P.hStand > o.y0) { p.slideT = 0.05; break; }
          }
        }
      }
    } else {
      let g = P.g;
      if (p.holdT > 0 && inp.held && p.vy > 0) g *= P.holdG;
      p.holdT = inp.held ? Math.max(0, p.holdT - dt) : 0;
      if (p.dashT > 0) { g = 0; p.vy = Math.max(0, Math.min(p.vy, 0)); }
      p.vy = Math.max(p.vy - g * dt, -P.maxFall);
      p.x += p.vx * dt; p.y += p.vy * dt; p.airT += dt;
      if (p.vy <= 0) {
        let best = null, bestTop = -1e9;
        for (const s of platsNear(w, p.x - P.halfW, p.x + P.halfW, _plats)) {
          if (p.x + P.halfW * 0.8 < s.x0 || p.x - P.halfW * 0.8 > s.x1) continue;
          const top = topOf(run, s); if (py >= top - 0.06 && p.y <= top && top > bestTop) { best = s; bestTop = top; }
        }
        for (const o of obsNear(w, p.x - 2, p.x + 1, _obs)) {
          if (o.type !== 'vault' || p.x + P.halfW * 0.8 < o.x || p.x - P.halfW * 0.8 > o.x + o.w) continue;
          if (py >= o.y1 - 0.06 && p.y <= o.y1 && o.y1 > bestTop) { best = o; bestTop = o.y1; }
        }
        if (best) { const imp = -p.vy; p.y = bestTop; land(run, best, imp); }
      }
      if (p.mode === 'air' && p.dashT <= 0) {
        for (const z of w.walls) {
          if (z.id === p.lastWall || p.x < z.x0 || p.x > z.x1 - 0.6 || p.y < z.y - 2.4 || p.y > z.y + 1.6) continue;
          p.mode = 'wall'; p.wall = z; p.vy = 0; p.holdT = 0; p.slideQ = false;
          if (!run.look) { run.stats.walls++; run.stats.style += SCORE.wall; } emit(run, { type: 'wall', x: p.x, y: p.y }); break;
        }
      }
      if (p.mode === 'air') {
        for (const a of w.graps) {
          if (a.id === p.lastGrap) continue;
          const hx = p.x, hy = p.y + 1.9, dx = a.x - hx, dy = a.y - hy, L = Math.hypot(dx, dy);
          if (dx < -0.6 || dx > 6.5 || dy < 1.2 || dy > 7 || L > P.grapRange) continue;
          const th = Math.atan2(-dx, dy); let om = (p.vx * Math.cos(th) + p.vy * Math.sin(th)) / L; om = Math.max(om, (vRun / L) * 0.8);
          p.mode = 'grap'; p.grap = { a, L, th, om }; p.dashT = 0; p.holdT = 0; p.slideQ = false; emit(run, { type: 'grap', x: p.x, y: p.y, id: a.id }); break;
        }
      }
    }
    // building walls + vault boxes in front
    if (p.mode === 'run' || p.mode === 'air') {
      for (const s of platsNear(w, p.x - P.halfW, p.x + P.halfW, _plats)) {
        if (s === p.ground || p.x + P.halfW <= s.x0 || p.x - P.halfW >= s.x1) continue;
        const top = topOf(run, s); if (p.y >= top - 0.06) continue;
        if (top - p.y <= P.mantle && p.vy <= 3) { p.y = top; land(run, s, 0); emit(run, { type: 'mantle' }); }
        else { die(run, 'wall'); break; }
      }
      if (p.mode === 'run' || p.mode === 'air') for (const o of obsNear(w, p.x - 2, p.x + 1, _obs)) {
        if (o.type !== 'vault' || o === p.ground || p.x + P.halfW < o.x || p.x - P.halfW > o.x + o.w || p.y >= o.y1 - 0.05 || p.vaultT > 0) continue;
        p.vy = Math.max(p.vy, Math.sqrt(2 * P.g * (o.y1 - p.y + 0.32))); p.mode = 'air'; p.ground = null; p.vaultT = 0.34; p.slideT = 0; p.holdT = 0;
        if (!run.look) { run.stats.vaults++; run.stats.style += SCORE.vault; } emit(run, { type: 'vault', x: o.x, y: o.y1 });
      }
    }
  }
  if (p.mode === 'dead') return;

  // hazards
  const h = pHeight(p), bx0 = Math.min(p.prevX, p.x) - P.halfW, bx1 = p.x + P.halfW, by0 = p.y + 0.05, by1 = p.y + h;
  for (const o of obsNear(w, bx0 - 1, bx1 + 1, _obs)) {
    if (o.type === 'vault' || run.m.smashed.has(o.id)) continue;
    if (o.type === 'pipe' || o.type === 'board') {
      if (bx1 > o.x && bx0 < o.x + o.w && by1 > o.y0 && by0 < o.y1) { if (o.type === 'board' && p.dashT > 0) smash(run, o); else hit(run, o.type, o); }
    } else if (o.type === 'laser') {
      if (laserOn(o, run.t) && bx1 > o.x - o.w / 2 && bx0 < o.x + o.w / 2 && by1 > o.y0 && by0 < o.y1) hit(run, 'laser', o);
    } else if (o.type === 'drone') {
      const cy = droneY(o, run.t), qx = clamp(o.x, bx0, bx1), qy = clamp(cy, by0, by1);
      if ((qx - o.x) ** 2 + (qy - cy) ** 2 < o.r * o.r) { if (p.dashT > 0) smash(run, o); else hit(run, 'drone', o); }
    }
    if (p.mode === 'dead') return;
  }
  if (p.y < P.killY * 0.55) { die(run, 'fell'); return; }

  run.dist = Math.max(run.dist, p.x);
  if (run.look) return;
  // pickups
  const cx = p.x, cy = p.y + (p.slideT > 0 ? 0.45 : 0.9);
  const R = p.magnetT > 0 ? P.magnetR : 1.2;
  for (let i = lowerBound(w.picks, cx - R - 0.5, 'x'); i < w.picks.length && w.picks[i].x <= cx + R + 0.5; i++) {
    const k = w.picks[i]; if (run.m.taken.has(k.id)) continue;
    const d2 = (k.x - cx) ** 2 + (k.y - cy) ** 2;
    if (k.type === 'chip') {
      if (d2 < (p.magnetT > 0 ? P.magnetR * P.magnetR : (P.chipR + 0.15) ** 2) || (p.slideT <= 0 && Math.abs(k.x - cx) < 0.6 && k.y > p.y - 0.2 && k.y < p.y + pHeight(p) + 0.3)) {
        run.m.taken.add(k.id); run.stats.chips++; run.ev.push({ type: 'chip', id: k.id, x: k.x, y: k.y });
      }
    } else if (d2 < (P.powR + 0.4) ** 2 || (Math.abs(k.x - cx) < 0.7 && k.y > p.y - 0.3 && k.y < p.y + pHeight(p) + 0.4)) {
      run.m.taken.add(k.id); run.stats.pows++;
      if (k.type === 'magnet') p.magnetT = P.magnetT; else if (k.type === 'shield') p.shield = true; else if (k.type === 'slow') p.slowT = P.slowT;
      run.ev.push({ type: 'pow', kind: k.type, x: k.x, y: k.y });
    }
  }
  if (run.mode === 'stage') {
    if (p.x >= w.len) { run.over = { type: 'clear' }; run.ev.push({ type: 'clear' }); }
  } else {
    const ms = Math.floor(run.dist / ENDLESS.milestone);
    if (ms > run.milestone) { run.milestone = ms; run.stats.bonusChips += 25; run.ev.push({ type: 'milestone', n: ms, m: ms * ENDLESS.milestone }); }
    if (run.trial && run.dist >= TRIAL.endlessM) { run.over = { type: 'trial' }; run.ev.push({ type: 'trial' }); }
    if (w.cur.x1 < p.x + 260) genUntil(w, p.x + 340);
    if (((run.t * 90) | 0) % 90 === 0) prune(run);
  }
}

/** Rewarded revive: put the runner back on the nearest safe roof ahead with brief invulnerability. */
export function revive(run) {
  const p = run.p, w = run.w;
  let s = w.plats.find((q) => q.kind === 'roof' && q.x1 > p.x + 3 && q.x1 - Math.max(q.x0, p.x) > 6);
  if (!s) s = w.cur;
  const x = Math.max(s.x0 + 1.5, Math.min(p.x, s.x1 - 6));
  Object.assign(p, { x, prevX: x, y: s.y, vy: 0, mode: 'run', ground: s, jumps: 1, slideT: 0, slideQ: false, dashT: 0, holdT: 0, wall: null, grap: null, inv: 2.2, cause: null, buf: 0, coyote: 0, vaultT: 0 });
  run.over = null; run.stats.revives++; run.ev.push({ type: 'revive', x, y: s.y });
}

// ------------------------------------------------------------------------------------------------ autopilot
// Receding-horizon search over short input programs. Each program = [[t, action, hold]], action j = jump/tap,
// s = slide, d = dash. Simulated on a cheap clone (no pickups / events) with the exact same step().
const PROGS_G = [[], [[0, 'j', 0.02]], [[0, 'j', 0.12]], [[0, 'j', 0.24]], [[0, 's']], [[0, 'd']], [[0, 'j', 0.24], [0.3, 'j', 0.14]], [[0, 'j', 0.24], [0.5, 'j', 0.14]],
  [[0, 'j', 0.05], [0.25, 'j', 0.14]], [[0, 'j', 0.24], [0.35, 'd']], [[0, 'j', 0.12], [0.42, 'j', 0.14]], [[0, 'j', 0.24], [0.7, 'j', 0.14]], [[0, 'j', 0.02], [0.3, 'd']]];
const PROGS_A = [[], [[0, 'j', 0.14]], [[0, 'j', 0.02]], [[0, 'd']], [[0, 's']], [[0, 'd'], [0.32, 'j', 0.14]], [[0.15, 'j', 0.14]], [[0.3, 'j', 0.14]], [[0.5, 'j', 0.14]]];
const PROGS_X = [[], [[0, 'j', 0.02]], [[0.2, 'j', 0.02]]];

function cloneRun(run) {
  const p = run.p;
  return { ...run, look: true, ev: [], over: null, p: { ...p, grap: p.grap ? { ...p.grap } : null }, m: { taken: run.m.taken, smashed: new Set(run.m.smashed), collapse: new Map(run.m.collapse) } };
}
export function progInput(prog, t, out) {
  out.press = false; out.slide = false; out.dash = false; out.held = false;
  for (const [ta, a, hold] of prog) {
    if (t >= ta && t < ta + STEP - 1e-9) { if (a === 'j') out.press = true; else if (a === 's') out.slide = true; else if (a === 'd') out.dash = true; }
    if (a === 'j' && t >= ta && t < ta + Math.max(hold, STEP)) out.held = true;
  }
  return out;
}
function evalProg(run, prog, H) {
  const r = cloneRun(run), inp = { press: false, held: false, slide: false, dash: false };
  const n = Math.round(H / STEP);
  for (let i = 0; i < n; i++) { step(r, progInput(prog, i * STEP, inp)); if (r.over) return r.over.type === 'dead' ? i * STEP : H + 1; }
  return H;
}
const progCost = (prog, dashCost = 1.4) => prog.reduce((c, [, a, h]) => c + (a === 'j' ? 1 + (h || 0) : a === 'd' ? dashCost : 1.2), 0);
/** Autopilot. dashCost < 1 makes it prefer smashing drones / billboards (used by ?demo=1 for show). */
export function createBot({ horizon = 1.7, every = 2, noise = 0, rng = Math.random, dashCost = 1.4 } = {}) {
  const bot = { prog: null, t: 0, cool: 0, inp: { press: false, held: false, slide: false, dash: false }, plans: 0 };
  bot.act = (run) => {
    const p = run.p;
    if (bot.prog) {
      const end = bot.prog.reduce((m, [ta, a, h]) => Math.max(m, ta + (a === 'j' ? Math.max(h, STEP) : STEP)), 0);
      if (bot.t <= end + 1e-9) { progInput(bot.prog, bot.t, bot.inp); bot.t += STEP; return bot.inp; }
      bot.prog = null;
    }
    if (bot.cool-- > 0) return progInput([], 0, bot.inp);
    bot.cool = every - 1; bot.plans++;
    const progs = p.mode === 'run' ? PROGS_G : p.mode === 'air' ? PROGS_A : PROGS_X;
    let best = progs[0], bestScore = evalProg(run, progs[0], horizon);
    if (bestScore < horizon) {
      bestScore = -1;
      for (const prog of progs) {
        const s = evalProg(run, prog, horizon), sc = s >= horizon ? 100 - progCost(prog, dashCost) : s;
        if (sc > bestScore) { bestScore = sc; best = prog; }
      }
    }
    if (best.length) {
      bot.prog = noise ? best.map(([ta, a, h]) => [ta + rng() * noise, a, h === undefined ? h : Math.max(0, h + (rng() - 0.5) * noise)]) : best;
      bot.t = 0; progInput(bot.prog, 0, bot.inp); bot.t = STEP; return bot.inp;
    }
    return progInput([], 0, bot.inp);
  };
  return bot;
}

/** Run a whole stage / endless stretch headlessly with the autopilot. Used by tests and the in-browser checker. */
export function simulate({ mode = 'stage', stage = 1, seed = null, maxT = 400, maxDist = Infinity, noise = 0, rngSeed = 1, revives = 0, trial = false, bot: botOpts = {} } = {}) {
  const run = createRun({ mode, stage, seed, trial });
  const nr = makeRng(rngSeed);
  const bot = createBot({ noise, rng: nr.next, ...botOpts });
  let deaths = 0; const causes = [];
  while (run.t < maxT && run.dist < maxDist) {
    step(run, bot.act(run)); run.ev.length = 0;
    if (run.over) {
      if (run.over.type !== 'dead') break;
      deaths++; causes.push(run.over.cause + '@' + Math.round(run.p.x));
      if (deaths > revives) break;
      revive(run); bot.prog = null;
    }
  }
  return { cleared: run.over?.type === 'clear', dead: run.over?.type === 'dead', t: run.t, dist: run.dist, chips: run.stats.chips, chipTotal: run.w.chipTotal, stars: starsOf(run), deaths, causes, stats: run.stats, plans: bot.plans };
}
export { milestoneOf };
