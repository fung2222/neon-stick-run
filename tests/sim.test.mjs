// NEON STICK RUN — headless simulation tests (node tests/sim.test.mjs). No browser, no THREE.
import { createRun, step, simulate, revive, speedAt, diffAt, runScore, starsOf, starTargets, createBot, PATTERNS } from '../js/sim.js';
import { STAGES, ENDLESS, TRIAL, STEP, COLORS, TRAILS } from '../js/config.js';

let pass = 0, fail = 0;
const t = (name, fn) => { const t0 = Date.now(); try { fn(); pass++; console.log(`✓ ${name} (${Date.now() - t0} ms)`); } catch (e) { fail++; console.log(`✗ ${name}\n   ${e.message}`); } };
const ok = (c, m) => { if (!c) throw new Error(m); };
const NONE = { press: false, held: false, slide: false, dash: false };

t('12 stages, lengths and speeds rise monotonically', () => {
  ok(STAGES.length === 12, 'need 12 stages');
  for (let i = 1; i < 12; i++) { ok(STAGES[i].len > STAGES[i - 1].len, 'len'); ok(STAGES[i].v0 > STAGES[i - 1].v0, 'v0'); ok(STAGES[i].d > STAGES[i - 1].d, 'density'); }
});

const results = [];
t('autopilot clears every stage in 60–120 s', () => {
  for (let s = 1; s <= 12; s++) {
    const r = simulate({ stage: s }); results.push(r);
    ok(r.cleared, `stage ${s} not cleared: ${r.causes.join(',')}`);
    ok(r.t >= 60 && r.t <= 120, `stage ${s} took ${r.t.toFixed(1)} s`);
  }
  console.log('   times', results.map((r, i) => `${i + 1}:${r.t.toFixed(0)}s`).join(' '));
});

t('stages exercise every mechanic somewhere', () => {
  const sum = (k) => results.reduce((a, r) => a + r.stats[k], 0);
  for (const k of ['jumps', 'vaults', 'walls', 'graps', 'smashed', 'pows']) ok(sum(k) > 0 || k === 'smashed', `no ${k}`);
  const demo = [4, 9, 12].map((s) => simulate({ stage: s, bot: { dashCost: 0.5 } }));
  ok(demo.every((r) => r.cleared), 'demo bot must clear'); ok(demo.reduce((a, r) => a + r.stats.smashed, 0) > 0, 'demo bot never smashed a drone/billboard');
});

t('autopilot can earn 3 stars on stage 1 and stars rule is sane', () => {
  const r = createRun({ stage: 1 }); const bot = createBot({}); while (!r.over && r.t < 200) { step(r, bot.act(r)); r.ev.length = 0; }
  ok(r.over.type === 'clear', 'clear'); const s = starsOf(r); ok(s >= 1 && s <= 3, 'stars ' + s);
  r.stats.chips = 0; ok(starsOf(r) === 1, 'no chips → 1 star'); r.stats.chips = r.w.chipTotal; r.stats.revives = 1; ok(starsOf(r) === 2, 'revive caps at 2 stars');
});

t('★★★ is reachable on every stage (chip-chasing autopilot, no revive)', () => {
  const got = [];
  for (let n = 1; n <= 12; n++) {
    let r = null;   // a few chip-chasing styles (careful → greedy); the best clean clear counts
    for (const cfg of [{ chipValue: 3 }, { chipValue: 1.5, horizon: 2 }, { chipValue: 3, every: 1 }]) {
      const q = createRun({ stage: n }); const bot = createBot(cfg); while (!q.over && q.t < 300) { step(q, bot.act(q)); q.ev.length = 0; }
      if (q.over && q.over.type === 'clear' && (!r || q.stats.chips > r.stats.chips)) r = q;
      if (r && starsOf(r) === 3) break;
    }
    ok(r, `stage ${n}: chip-chasing autopilot never cleared`);
    const [n2, n3] = starTargets(r); got.push(`${n}:${r.stats.chips}/${n3}`);
    ok(r.over && r.over.type === 'clear', `stage ${n} cleared`); ok(n2 < n3 && n3 <= r.w.chipTotal, 'targets ordered');
    ok(starsOf(r) === 3, `stage ${n}: ${r.stats.chips} chips < ★★★ target ${n3} of ${r.w.chipTotal}`);
  }
  console.log('   chips/★★★ ' + got.join(' '));
});

t('difficulty rises: sloppy player dies more in late stages', () => {
  const rate = (s) => { let d = 0, m = 0; for (let k = 0; k < 4; k++) { const r = simulate({ stage: s, noise: 0.42, rngSeed: 100 + k * 7, revives: 99, bot: { horizon: 1.2, every: 4 } }); d += r.deaths; m += r.dist; } return d / m * 1000; };
  const early = [1, 2, 3].map(rate), late = [9, 10, 11, 12].map(rate);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`   deaths/km early ${early.map((x) => x.toFixed(1))} late ${late.map((x) => x.toFixed(1))}`);
  ok(avg(late) > avg(early) * 1.5, 'late stages should be clearly harder');
  ok(avg(early) < 1.5, 'early stages should be gentle');
});

t('endless never ends, speed rises but saturates', () => {
  const r = simulate({ mode: 'endless', seed: 7, maxDist: 6000, maxT: 9999 });
  ok(!r.cleared, 'endless cannot be cleared'); ok(r.dist >= 6000 || r.dead, 'ran far');
  const run = createRun({ mode: 'endless', seed: 7 });
  const v = [0, 500, 2000, 10000, 100000].map((x) => speedAt(run.w, x));
  for (let i = 1; i < v.length; i++) ok(v[i] >= v[i - 1], 'speed non-decreasing');
  ok(v[4] <= ENDLESS.vCap + 1e-6, 'speed capped'); ok(diffAt(run.w, 1e6) <= ENDLESS.dCap + 1e-6, 'density capped');
  console.log(`   endless 6 km: ${r.t.toFixed(0)} s, deaths ${r.deaths}, speed ${v.map((x) => x.toFixed(1)).join('→')}`);
});

t('endless generation keeps memory bounded', () => {
  const run = createRun({ mode: 'endless', seed: 3 }); const bot = createBot({});
  while (run.dist < 4000 && !run.over) { step(run, bot.act(run)); run.ev.length = 0; }
  ok(run.w.plats.length < 400 && run.w.obs.length < 400 && run.w.picks.length < 1500, `pruning: ${run.w.plats.length}/${run.w.obs.length}/${run.w.picks.length}`);
});

t('trial run stops at 800 m in endless', () => {
  const run = createRun({ mode: 'endless', seed: 5, trial: true }); const bot = createBot({}); let n = 0;
  while (!run.over && n++ < 90 * 300) { step(run, bot.act(run)); run.ev.length = 0; }
  ok(run.over && run.over.type === 'trial', 'trial over: ' + JSON.stringify(run.over)); ok(Math.abs(run.dist - TRIAL.endlessM) < 2, 'at 800 m: ' + run.dist);
});

t('deterministic stage layouts and replays', () => {
  const a = simulate({ stage: 5 }), b = simulate({ stage: 5 });
  ok(a.t === b.t && a.chips === b.chips && a.chipTotal === b.chipTotal, 'same result');
  const r1 = createRun({ stage: 3 }), r2 = createRun({ stage: 3 });
  ok(JSON.stringify(r1.w.plats.slice(0, 40).map((p) => [p.x0, p.x1, p.y])) === JSON.stringify(r2.w.plats.slice(0, 40).map((p) => [p.x0, p.x1, p.y])), 'same plats');
});

t('physics: tap jump < hold jump < double jump; slide ducks; dash smashes drones', () => {
  const apex = (prog) => { const r = createRun({ stage: 1 }); let max = 0; for (let i = 0; i < 90; i++) { const inp = prog(i); step(r, inp); max = Math.max(max, r.p.y); } return max; };
  const tap = apex((i) => ({ ...NONE, press: i === 0, held: i < 2 })), hold = apex((i) => ({ ...NONE, press: i === 0, held: i < 30 })), dbl = apex((i) => ({ ...NONE, press: i === 0 || i === 30, held: i < 30 || (i > 30 && i < 45) }));
  ok(tap > 1.6 && tap < hold && hold < dbl, `apex tap ${tap.toFixed(2)} hold ${hold.toFixed(2)} dbl ${dbl.toFixed(2)}`);
  const r = createRun({ stage: 1 }); step(r, { ...NONE, slide: true }); ok(r.p.slideT > 0, 'slide');
  const r2 = createRun({ stage: 4 }); const dr = r2.w.obs.find((o) => o.type === 'drone'); ok(dr, 'stage 4 has a drone');
  const s = r2.w.plats.find((p) => p.x0 <= dr.x - 3 && p.x1 >= dr.x + 1); if (s) { Object.assign(r2.p, { x: dr.x - 2.2, y: s.y, ground: s, mode: 'run' }); step(r2, { ...NONE, dash: true }); for (let i = 0; i < 40 && !r2.over; i++) step(r2, NONE); ok(r2.m.smashed.has(dr.id), 'drone smashed by dash'); }
});

t('falling kills, revive puts the runner back on a safe roof', () => {
  const r = createRun({ stage: 2 }); let n = 0; while (!r.over && n++ < 90 * 60) step(r, NONE);
  ok(r.over && r.over.type === 'dead', 'idle runner dies'); revive(r); ok(!r.over && r.p.mode === 'run' && r.p.inv > 0, 'revived'); ok(r.stats.revives === 1, 'counted');
});

t('scoring + cosmetics data', () => {
  const r = createRun({ stage: 1 }); r.dist = 100; r.stats.chips = 10; r.stats.style = 40; ok(runScore(r) === 100 + 50 + 40, 'score');
  ok(COLORS[0].price === 0 && TRAILS[0].price === 0, 'free defaults'); ok(new Set(COLORS.map((c) => c.id)).size === COLORS.length, 'unique ids');
  ok(Object.keys(PATTERNS).length >= 14, 'patterns'); ok(Math.abs(STEP - 1 / 90) < 1e-9, 'step');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
