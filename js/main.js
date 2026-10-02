// NEON STICK RUN — one-thumb 3D neon stickman parkour across rainy Kowloon rooftops. 12 stages + endless.
import * as THREE from 'three';
import { i18n, t, flags, createStore, createStage, ThemeController, THEMES, U, Particles, Shockwaves, FxState, NeonCity, CyberUI, Platform, createAds } from 'cyber-kit';
import { GAME_ID, STEP, PHYS, STAGES, TRIAL, COLORS, TRAILS } from './config.js';
import { createRun, step, revive as simRevive, createBot, simulate, runScore, starsOf, speedAt, platsNear, obsNear, topOf } from './sim.js';
import { STAGE_NAMES } from './strings.js';
import { StickRunner } from './runner.js';
import { CourseView, Skyline, SpeedLines } from './world.js';
import { RunAudio } from './audio.js';
import { readHub, returnToHub } from './hub.js';
import { createGesture } from './gesture.js';

const $ = (id) => document.getElementById(id);
const store = createStore(GAME_ID);
if (flags.reset) store.clear();
const hub = readHub();
const ui = new CyberUI({ screens: ['start', 'stages', 'locker', 'pause', 'result', 'trial'] });
const stage = createStage({ canvas: $('scene'), bloom: 0.72, bloomRadius: 0.5, bloomThreshold: 0.84, fov: 50, exposure: 1.05, far: 1200, onFatal: (m) => ui.fatal(m) });
const { scene, camera } = stage;
scene.add(camera);
const theme = new ThemeController(); theme.set(THEMES[0], true);
const city = new NeonCity(stage, { floor: 'none', buildings: 1, billboard: null, signs: false, dust: false, rain: true, traffic: true, innerRadius: 60 });
if (city.city) city.city.visible = false;
const skyline = new Skyline(stage, scene);
const course = new CourseView(stage, scene);
const speedLines = new SpeedLines(camera);
const runner = new StickRunner(scene);
const particles = new Particles(scene, 2600, { floorY: -60 });
stage.onResize((w, h, pr) => particles.resize(h, pr));
const waves = new Shockwaves(scene, 10);
const fx = new FxState();
const audio = new RunAudio(store); ui.setMuted(audio.muted || flags.mute);
const ads = createAds({ gameId: GAME_ID, interstitialCooldownSec: 180, breaksBetweenInterstitials: 2, graceSec: 120, units: { android: {} }, onAdOpen: (on) => audio.duckAll(on) });
const turbo = Math.max(1, Math.min(40, flags.num('turbo', 1)));

// ------------------------------------------------------------------ save data
const save = {
  stars: () => { const a = store.getJSON('stars', []); return Array.from({ length: 12 }, (_, i) => a[i] | 0); },
  times: () => store.getJSON('times', []),
  wallet: () => store.getNum('chips', 0),
  addChips(n) { store.setNum('chips', save.wallet() + n); },
  owned: () => store.getJSON('owned', { colors: ['cyan'], trails: ['streak'] }),
  equip: () => store.getJSON('equip', { color: 'cyan', trail: 'streak' }),
  hints: () => store.getJSON('hints', {}),
};
const unlockedUpTo = () => { const s = save.stars(); let n = 1; while (n < 12 && s[n - 1] > 0) n++; return flags.get('unlock') === 'all' ? 12 : n; };
const stageName = (n) => STAGE_NAMES[n - 1][i18n.lang === 'en' ? 1 : 0];
const stageNameOther = (n) => STAGE_NAMES[n - 1][i18n.lang === 'en' ? 0 : 1];
const fmtTime = (s) => { const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`; };

// ------------------------------------------------------------------ state
const timers = []; const later = (tt, fn) => timers.push({ t: tt, fn });   // frame-time timers (pause-aware)
const S = { state: 'menu', demo: !!flags.demo, run: null, attract: true, bot: null, acc: 0, stageN: 1, mode: 'stage', revived: false, banked: false, overT: 0, overHandled: false,
  introT: 0, camY: 2, hintT: 0, gestures: 0, lastLand: 0, chipCombo: 0, chipT: 0, adBreaks: 0, interstitials: 0, rewardedAsks: 0, frames: 0, hub, record: false, result: null };
window.__nsr = S;   // test hook
function applyCosmetics() {
  const e = save.equip(), c = COLORS.find((x) => x.id === e.color) || COLORS[0];
  runner.setColor(c.hex, !!c.cycle); runner.setTrail(e.trail);
  document.documentElement.style.setProperty('--me', '#' + new THREE.Color(c.cycle ? 0x00e5ff : c.hex).getHexString());
}
applyCosmetics();

function newRun(mode, n, attract = false) {
  const run = createRun({ mode, stage: n, seed: attract ? (Math.random() * 1e9) >>> 0 : (mode === 'endless' ? (flags.seed ?? (Math.random() * 1e9) >>> 0) : null), trial: hub.trial && !attract });
  timers.length = 0;   // drop callbacks that belonged to the previous run (result screens, attract restarts)
  S.run = run; S.attract = attract; S.acc = 0; S.overT = 0; S.overHandled = false; S.revived = false; S.banked = false; S.record = false;
  S.bot = (attract || S.demo) ? createBot({ dashCost: 0.5, horizon: 1.7, every: 2 }) : null;
  course.setRun(run, { best: mode === 'endless' && !attract ? store.getNum('bestDist', 0) : 0, trialM: mode === 'endless' && run.trial ? TRIAL.endlessM : 0 });
  runner.resetTrails(); runner.roll = 0;
  S.camY = run.p.y + 2; frameCamera(0, 0, true);
  return run;
}

function setState(s) {
  S.state = s;
  ui.show({ menu: 'start', stages: 'stages', locker: 'locker', paused: 'pause', result: 'result', trial: 'trial' }[s] || null);
  const playing = s === 'play' || s === 'intro';
  ui.hud(playing || s === 'paused');
  gesture.setEnabled(playing && !S.demo);
  $('demo-tag').classList.toggle('hidden', !S.demo);
  document.body.classList.toggle('in-menu', s === 'menu' || s === 'stages' || s === 'locker');
}

// ------------------------------------------------------------------ menus
function refreshMenu() {
  const st = save.stars(), tot = st.reduce((a, b) => a + b, 0);
  ui.setText('m-best', store.getNum('bestDist', 0) ? Math.floor(store.getNum('bestDist', 0)) + ' m' : '—');
  ui.setText('m-stars', `${tot} / 36`); ui.setText('m-chips', save.wallet());
  const tr = $('trial-tag'); tr.classList.toggle('hidden', !hub.trial);
  if (hub.trial) tr.textContent = t('trialTag') + (hub.trialLeft != null ? ' · ' + t('trialLeft', { n: hub.trialLeft }) : '');
  const next = Math.min(unlockedUpTo(), hub.trial ? TRIAL.stages : 12);
  ui.setText('stage-go-sub', `${t('stageN', { n: next })} · ${stageName(next)}`);
}
function showMenu() {
  newRun('endless', 1, true); theme.set(THEMES[0]); refreshMenu(); setState('menu');
}
function buildStageGrid() {
  const st = save.stars(), times = save.times(), up = unlockedUpTo();
  $('stage-grid').innerHTML = STAGES.map((s, i) => {
    const n = i + 1, locked = n > up, trialLocked = hub.trial && n > TRIAL.stages;
    const stars = [0, 1, 2].map((k) => `<i class="${k < st[i] ? 'on' : ''}">★</i>`).join('');
    return `<button class="stage-card${locked ? ' locked' : ''}${trialLocked ? ' trial-locked' : ''}" data-n="${n}" style="--tc:#${new THREE.Color(THEMES[s.theme].c1).getHexString()}">
      <span class="sc-n">${String(n).padStart(2, '0')}</span><span class="sc-name">${stageName(n)}</span><span class="sc-en">${stageNameOther(n)}</span>
      <span class="sc-stars">${stars}</span><span class="sc-time">${locked ? '🔒 ' + t('locked') : trialLocked ? '🔒 ' + t('trialLock') : times[i] ? t('bestTime', { t: fmtTime(times[i]) }) : '&nbsp;'}</span></button>`;
  }).join('');
}
function showStages() { buildStageGrid(); setState('stages'); }
function pickStage(n) {
  if (hub.trial && n > TRIAL.stages) { showTrial('stage'); return; }
  if (n > unlockedUpTo()) { audio.back && audio.back(); ui.toast(t('locked')); return; }
  startStage(n);
}
function buildLocker() {
  const o = save.owned(), e = save.equip();
  ui.setText('l-wallet', t('wallet', { n: save.wallet() }));
  const card = (kind, it) => {
    const own = o[kind].includes(it.id), eq = e[kind === 'colors' ? 'color' : 'trail'] === it.id;
    const sw = kind === 'colors' ? `<span class="sw${it.cycle ? ' cyc' : ''}" style="--sw:#${new THREE.Color(it.hex).getHexString()}"></span>` : `<span class="sw trail t-${it.id}"></span>`;
    return `<button class="lk-item${eq ? ' eq' : ''}${own ? ' own' : ''}" data-kind="${kind}" data-id="${it.id}">${sw}<b>${i18n.lang === 'en' ? it.en : it.zh}</b><small>${eq ? t('equipped') : own ? t('equip') : t('buy', { p: it.price })}</small></button>`;
  };
  $('lk-colors').innerHTML = COLORS.map((c) => card('colors', c)).join('');
  $('lk-trails').innerHTML = TRAILS.map((c) => card('trails', c)).join('');
}
function showLocker() { buildLocker(); setState('locker'); }
function lockerTap(kind, id) {
  const list = kind === 'colors' ? COLORS : TRAILS, it = list.find((x) => x.id === id); if (!it) return;
  const o = save.owned(), e = save.equip();
  if (!o[kind].includes(id)) {
    const w = save.wallet(); if (w < it.price) { ui.toast(t('tooPoor', { n: it.price - w })); audio.back && audio.back(); return; }
    save.addChips(-it.price); o[kind].push(id); store.setJSON('owned', o); audio.pow(); ui.toast(t('bought', { name: i18n.lang === 'en' ? it.en : it.zh }));
  } else audio.click && audio.click();
  e[kind === 'colors' ? 'color' : 'trail'] = id; store.setJSON('equip', e); applyCosmetics(); buildLocker();
}

// ------------------------------------------------------------------ run flow
function startStage(n) {
  audio.init(); audio.startMusic(); S.mode = 'stage'; S.stageN = n;
  newRun('stage', n); theme.set(THEMES[STAGES[n - 1].theme]);
  hudSetup();
  ui.banner(stageName(n), `${t('stageTag', { n })} · ${stageNameOther(n)}`, '');
  S.introT = 1.1; setState('intro'); maybeHint('jump', n === 1 ? 0.5 : -1);
}
function startEndless() {
  audio.init(); audio.startMusic(); S.mode = 'endless';
  newRun('endless', 1); theme.set(THEMES[0]);
  hudSetup();
  ui.banner(t('endlessBanner'), 'ENDLESS · ∞', hub.trial ? t('trialTag') : t('endlessNote'));
  S.introT = 1.1; setState('intro');
}
function hudSetup() {
  const r = S.run;
  ui.setText('h-mode', r.mode === 'stage' ? `${t('stageTag', { n: r.stage })} · ${stageName(r.stage)}` : t('endlessBanner') + (r.trial ? ' · TRIAL' : ''));
  $('h-prog').classList.toggle('hidden', r.mode !== 'stage' && !r.trial);
  $('gesture-bar').classList.remove('fade'); S.gestures = 0;
}
function retry() { if (S.mode === 'stage') startStage(S.stageN); else startEndless(); }
function bank() {
  if (S.banked || S.demo || S.attract || !S.run) return; S.banked = true;
  const r = S.run, earn = r.stats.chips + r.stats.bonusChips; save.addChips(earn);
  if (r.mode === 'endless') { if (r.dist > store.getNum('bestDist', 0)) { store.setNum('bestDist', Math.floor(r.dist)); S.record = true; } if (store.submitBest(runScore(r))) S.record = true; }
}
function onOver() {
  const r = S.run; S.overHandled = true;
  if (r.over.type === 'clear') {
    audio.clear(); fx.kick({ slowmo: 0.7, aberr: 0.6 }); ui.flash('rgba(125,255,58,0.25)', 300); Platform.haptic('success');
    later(1.1, () => showResult());
  } else if (r.over.type === 'trial') {
    bank(); audio.milestone(); later(0.8, () => showTrial('endless'));
  } else {
    later(1.15, () => showResult());
  }
}
function showResult() {
  const r = S.run; if (!r || S.state === 'menu') return;
  const won = r.over && r.over.type === 'clear', stg = r.mode === 'stage';
  let stars = 0;
  if (won) {
    stars = starsOf(r);
    if (!S.demo) {
      const st = save.stars(); if (stars > st[r.stage - 1]) { st[r.stage - 1] = stars; store.setJSON('stars', st); }
      const tm = save.times(); if (!tm[r.stage - 1] || r.t < tm[r.stage - 1]) { tm[r.stage - 1] = +r.t.toFixed(2); store.setJSON('times', tm); S.record = true; }
    }
    bank();
  }
  S.result = { won, stars, dist: r.dist, t: r.t };
  ui.setText('res-kicker', stg ? `${t('stageTag', { n: r.stage })} · ${stageName(r.stage)}` : t('endlessBanner'));
  const title = won ? t('clear') : stg ? t('fail') : t('gameOver'); const te = $('res-title'); te.textContent = title; te.dataset.text = title; te.classList.toggle('danger', !won);
  ui.setText('res-en', won ? (r.stage === 12 ? t('allClear') : t('starsGot', { n: stars })) : t('c_' + (r.over?.cause || 'fell')));
  $('res-stars').classList.toggle('hidden', !stg);
  $('res-stars').innerHTML = [0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s">★</i>`).join('');
  if (won) [0, 1, 2].forEach((k) => { if (k < stars) later(0.25 + k * 0.28, () => audio.star(k)); });
  const stats = stg
    ? [[t('sTime'), fmtTime(r.t)], [t('sChips'), `${r.stats.chips}/${r.w.chipTotal}`], [t('sDist'), `${Math.floor(Math.min(r.dist, r.w.len))} m`], [t('sStyle'), r.stats.style]]
    : [[t('sDist'), Math.floor(r.dist) + ' m'], [t('sChips'), r.stats.chips + (r.stats.bonusChips ? ` +${r.stats.bonusChips}` : '')], [t('sSpeed'), speedAt(r.w, r.dist).toFixed(1) + ' m/s'], [t('sScore'), runScore(r)]];
  $('res-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  const hasNext = won && r.stage < 12, trialStop = won && hub.trial && r.stage >= TRIAL.stages;
  ui.setText('res-main-zh', trialStop ? t('toHub') : hasNext ? t('next') : t('retry')); ui.setText('res-main-en', trialStop ? t('toHubS') : hasNext ? t('nextS') : t('retryS'));
  $('btn-res-main').dataset.act = trialStop ? 'trial' : hasNext ? 'next' : 'retry';
  const canRevive = !won && r.over && r.over.type === 'dead' && !S.revived && ads.rewardedAvailable();
  $('btn-revive').classList.toggle('hidden', !canRevive); ui.setText('revive-sub', ads.isNative ? t('reviveAd') : t('reviveFree'));
  $('res-record').classList.toggle('hidden', !S.record);
  setState('result');
  if (S.demo) later(2.4, () => { if (S.state === 'result') demoNext(); });
}
// interstitials: ONLY after a game over (death / endless end), only when the hub says ads are allowed (Free tier)
async function gameOverBreak() {
  const r = S.run; if (!r || !r.over || r.over.type === 'clear' || !hub.ads) return;
  S.adBreaks++; if (await ads.naturalBreak('gameover')) S.interstitials++;
}
async function resultMain() {
  if (S.state !== 'result') return; const act = $('btn-res-main').dataset.act; audio.click && audio.click();
  if (act === 'trial') { showTrial('stage'); return; }
  if (act === 'next') { startStage(S.run.stage + 1); return; }
  bank(); await gameOverBreak(); retry();
}
async function resultMenu() { if (S.state !== 'result') return; bank(); await gameOverBreak(); showMenu(); }
async function resultStages() { if (S.state !== 'result') return; bank(); await gameOverBreak(); showStages(); }
async function doRevive() {
  if (S.state !== 'result' || S.revived || !S.run || !S.run.over || S.run.over.type !== 'dead') return;
  S.rewardedAsks++;
  const res = await ads.rewarded('revive'); if (!res.rewarded) { ui.toast(t('kit.rewardOffline')); return; }
  S.revived = true; simRevive(S.run); S.overHandled = false; S.overT = 0;
  ui.banner(t('revived'), 'REVIVE', ''); S.introT = 0.8; setState('intro'); Platform.haptic('success');
}
function showTrial(from) {
  ui.setText('trial-from', from === 'endless' ? `${t('endlessBanner')} · ${Math.floor(S.run?.dist || TRIAL.endlessM)} m` : t('trialLock'));
  setState('trial');
}
function demoNext() {
  const r = S.run;
  if (r.mode === 'stage' && r.over && r.over.type === 'clear') { if (r.stage < 12) startStage(r.stage + 1); else startEndless(); }
  else retry();
}
function pause() { if (S.state !== 'play' && S.state !== 'intro') return; S.pausedFrom = S.state; setState('paused'); audio.duckMusic && audio.duckMusic(); }
function resume() { if (S.state !== 'paused') return; S.introT = Math.max(S.introT, 0.5); setState('intro'); audio.unduckMusic && audio.unduckMusic(); }

// ------------------------------------------------------------------ hints (first time a mechanic appears)
const HINT_FOR = { pipe: 'pipe', board: 'board', drone: 'drone', laser: 'laser', vault: 'vault' };
function maybeHint(key, delay = 0) {
  if (S.demo || delay < 0) return; const h = save.hints(); if (h[key]) return;
  h[key] = 1; store.setJSON('hints', h);
  later(delay, () => { const el = $('hint'); el.textContent = t('h_' + key); el.classList.remove('hidden', 'show'); void el.offsetWidth; el.classList.add('show'); S.hintT = 3.2; });
}
let hintScan = 0;
function scanHints(r) {
  if ((hintScan = (hintScan + 1) % 20) !== 0) return;
  const x = r.p.x;
  for (const o of obsNear(r.w, x + 6, x + 26, [])) if (HINT_FOR[o.type]) maybeHint(HINT_FOR[o.type]);
  for (const z of r.w.walls) if (z.x0 > x + 4 && z.x0 < x + 26) maybeHint('wall');
  for (const a of r.w.graps) if (a.x > x + 4 && a.x < x + 26) maybeHint('grap');
  for (const s of platsNear(r.w, x + 6, x + 26, [])) if (s.kind === 'collapse') maybeHint('collapse');
  const ps = platsNear(r.w, x, x + 22, []); for (let i = 1; i < ps.length; i++) if (ps[i].x0 - ps[i - 1].x1 > 7.5) maybeHint('gapWide');
}

// ------------------------------------------------------------------ input
const gesture = createGesture(window, {
  onAny() { audio.init(); if (S.state === 'play' || S.state === 'intro') audio.startMusic(); },
  onAction(kind) {
    S.gestures++; if (S.gestures > 14) $('gesture-bar').classList.add('fade');
    const g = $('g-' + kind); if (g) { g.classList.remove('lit'); void g.offsetWidth; g.classList.add('lit'); }
  },
  onPause() { if (ui.modalOpen) { ui.closeModal(); return; } if (S.state === 'play' || S.state === 'intro') pause(); else if (S.state === 'paused') resume(); else if (S.state === 'stages' || S.state === 'locker') showMenu(); },
  onMute() { audio.init(); ui.setMuted(audio.toggleMute()); },
  onPrimary() {
    if (ui.modalOpen) return;
    if (S.state === 'menu') pickStage(Math.min(unlockedUpTo(), hub.trial ? TRIAL.stages : 12));
    else if (S.state === 'result') resultMain(); else if (S.state === 'paused') resume(); else if (S.state === 'trial') returnToHub(hub);
  },
});
ui.on('btn-stage-go', () => pickStage(Math.min(unlockedUpTo(), hub.trial ? TRIAL.stages : 12)));
ui.on('btn-stages', showStages); ui.on('btn-endless', () => startEndless()); ui.on('btn-locker', showLocker);
ui.on('btn-stages-back', showMenu); ui.on('btn-locker-back', showMenu);
$('stage-grid').addEventListener('click', (e) => { const b = e.target.closest('.stage-card'); if (b) { e.stopPropagation(); pickStage(+b.dataset.n); } });
$('screen-locker').addEventListener('click', (e) => { const b = e.target.closest('.lk-item'); if (b) { e.stopPropagation(); lockerTap(b.dataset.kind, b.dataset.id); } });
ui.on('btn-pause', pause); ui.on('btn-mute', () => { audio.init(); ui.setMuted(audio.toggleMute()); });
ui.on('btn-resume', resume); ui.on('btn-restart', () => { retry(); }); ui.on('btn-quit', () => { showMenu(); });
ui.on('btn-res-main', resultMain); ui.on('btn-res-menu', resultMenu); ui.on('btn-res-stages', resultStages); ui.on('btn-revive', doRevive);
ui.on('btn-hub', () => returnToHub(hub)); ui.on('btn-trial-menu', showMenu);
Platform.onBack(() => {
  if (ui.closeModal()) return true;
  if (S.state === 'play' || S.state === 'intro') { pause(); return true; } if (S.state === 'paused') { resume(); return true; }
  if (S.state === 'result') { resultMenu(); return true; } if (S.state === 'stages' || S.state === 'locker' || S.state === 'trial') { showMenu(); return true; }
  return false;
});
Platform.onPause(() => { if (!S.demo) pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && !S.demo) pause(); });

// ------------------------------------------------------------------ sim events → feel
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const meCol = () => runner.cycle && runner._cyc ? runner._cyc.clone() : runner.color.clone();
const xy = (v) => { const s = stage.toScreen(v); return [s.x, s.y]; };
function handleEvents(r) {
  const live = S.state === 'play' || S.state === 'intro';
  const sfx = live && !S.attract;
  const p = r.p;
  for (const e of r.ev) {
    switch (e.type) {
      case 'jump': if (sfx) audio.jump(); particles.burst(V3(p.x, p.y + 0.05), meCol(), 10, { speed: 2.5, up: 1, life: 0.35, size: 0.6 }); break;
      case 'dbl': if (sfx) audio.dbl(); waves.spawn(V3(p.x, p.y + 0.4), meCol(), { r0: 0.2, r1: 1.8, h: 0.15, dur: 0.35 }); particles.burst(V3(p.x, p.y + 0.6), meCol(), 18, { speed: 3.5, up: 0, life: 0.4, size: 0.7 }); break;
      case 'land': {
        const imp = e.imp || 0; runner.land(imp);
        if (imp > 9) { if (sfx) audio.land(Math.min(1.4, imp / 20)); particles.burst(V3(p.x, p.y + 0.05), new THREE.Color(0x9fb4ff), Math.min(40, 6 + imp), { speed: 2 + imp * 0.12, up: 0.8, life: 0.4, size: 0.6 }); if (imp > 20) { fx.kick({ trauma: 0.12 }); if (live) Platform.haptic('light'); } }
        break;
      }
      case 'slide': if (sfx) audio.slide(); break;
      case 'slam': if (sfx) audio.dash(); break;
      case 'dash': if (sfx) audio.dash(); fx.kick({ fovKick: 0.7, aberr: 0.35 }); particles.burst(V3(p.x, p.y + 0.9), meCol(), 22, { speed: 4, up: 0.2, life: 0.35, size: 0.8 }); break;
      case 'vault': if (sfx) audio.vault(); r.lastStyle = 'vault'; if (live && !S.attract) popupAt(V3(p.x, p.y + 2.4), t('vault'), '+40'); break;
      case 'mantle': if (sfx) audio.vault(); break;
      case 'wall': if (sfx) audio.wall(); if (live && !S.attract) popupAt(V3(p.x, p.y + 2.4), t('wallrun'), '+80'); particles.burst(V3(p.x, p.y + 1), new THREE.Color(0xffffff), 20, { speed: 3, up: 1, life: 0.4, size: 0.6 }); break;
      case 'wallJump': case 'wallEnd': if (sfx) audio.release(); break;
      case 'grap': if (sfx) audio.grap(); waves.spawn(V3(p.grap ? p.grap.a.x : p.x, p.grap ? p.grap.a.y : p.y + 3), new THREE.Color(0xfff35c), { r0: 0.2, r1: 2.4, h: 0.3, dur: 0.4 }); break;
      case 'grapEnd': if (sfx) audio.release(); if (live && !S.attract) popupAt(V3(p.x, p.y + 2.4), t('swing'), '+80'); break;
      case 'chip': {
        S.chipCombo = S.chipT > 0 ? S.chipCombo + 1 : 0; S.chipT = 0.5; if (sfx) audio.chip(S.chipCombo);
        particles.burst(V3(e.x, e.y), new THREE.Color(0xfff35c), 6, { speed: 2, up: 1, life: 0.3, size: 0.55 });
        if (live && !S.attract) { const c = $('h-chips'); ui.bump(c); } break;
      }
      case 'pow': {
        if (sfx) audio.pow(); const col = new THREE.Color(e.kind === 'magnet' ? 0xff2bd6 : e.kind === 'shield' ? 0x00f0ff : 0x7dff3a);
        particles.burst(V3(e.x, e.y), col, 40, { speed: 5, up: 2, life: 0.6, size: 0.9 }); waves.spawn(V3(e.x, e.y - 0.5), col, { r0: 0.3, r1: 3, h: 0.6, dur: 0.5 });
        if (live && !S.attract) { popupAt(V3(e.x, e.y + 1.2), t('p_' + e.kind), '', 'big'); Platform.haptic('light'); } break;
      }
      case 'smash': {
        if (sfx) audio.smash(); fx.kick({ trauma: 0.32, aberr: 0.9, glitch: 0.3 });
        particles.burst(V3(e.x, e.y), new THREE.Color(e.kind === 'drone' ? 0xff3b5c : 0xff2bd6), 70, { speed: 9, up: 3, life: 0.8, size: 1.1, color2: new THREE.Color(1, 1, 1) });
        waves.spawn(V3(e.x, e.y), new THREE.Color(0xff3b5c), { r0: 0.3, r1: 4, h: 0.8, dur: 0.5 }); S.hitstop = 0.06;
        if (live && !S.attract) { popupAt(V3(e.x, e.y + 1), t('smash'), '+120', 'big'); Platform.haptic('medium'); } break;
      }
      case 'shield': if (sfx) audio.shieldBreak(); fx.kick({ trauma: 0.3, aberr: 0.8 }); ui.flash('rgba(0,240,255,0.22)', 220); if (live && !S.attract) popupAt(V3(p.x, p.y + 2.2), t('shieldUsed'), '', 'big'); particles.burst(V3(p.x, p.y + 1), new THREE.Color(0x00f0ff), 60, { speed: 7, up: 2, life: 0.6, size: 0.9 }); break;
      case 'collapse': if (sfx) audio.crumble(); fx.kick({ trauma: 0.08 }); break;
      case 'die': {
        if (sfx) audio.die(); runner.hitFlash(); fx.kick({ trauma: 0.55, aberr: 1.2, glitch: 0.7, slowmo: 0.9 }); if (live) { ui.flash('rgba(255,43,80,0.3)', 280); Platform.haptic('heavy'); }
        particles.burst(V3(p.x, p.y + 1), meCol(), 90, { speed: 8, up: 3, life: 0.9, size: 1.1, color2: new THREE.Color(1, 1, 1) });
        break;
      }
      case 'revive': particles.burst(V3(e.x, e.y + 1), meCol(), 60, { speed: 5, up: 4, life: 0.8, size: 1 }); waves.spawn(V3(e.x, e.y + 0.1), meCol(), { r0: 0.3, r1: 4, h: 1, dur: 0.6 }); break;
      case 'milestone':
        if (sfx) audio.milestone(); theme.set(THEMES[e.n % THEMES.length]);
        if (live && !S.attract) { ui.banner(t('milestone', { m: e.m }), t('milestoneS'), (i18n.lang === 'en' ? THEMES[e.n % THEMES.length].en : THEMES[e.n % THEMES.length].name)); Platform.haptic('success'); }
        break;
      case 'clear': break;
      default: break;
    }
  }
  r.ev.length = 0;
}
function popupAt(v, text, sub = '', cls = '') { const [x, y] = xy(v); ui.popup(x, y, text, sub, cls); }

// ------------------------------------------------------------------ camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tP = new THREE.Vector3(), tL = new THREE.Vector3();
function groundUnder(r) {
  const p = r.p; if (p.ground) return topOf(r, p.ground);
  let best = -30; for (const s of platsNear(r.w, p.x - 0.3, p.x + 0.3, [])) { const tp = topOf(r, s); if (tp <= p.y + 0.01 && tp > best) best = tp; }
  return best;
}
// portrait = high chase camera (track recedes up the screen); landscape = classic side-on view with a slight angle.
const CAM = { P: { yaw: 1.3, dist: 10.5, h: 4.6, ahead: 1.6, fov: 62, look: 1.2 }, L: { yaw: 0.3, dist: 14.5, h: 4.4, ahead: 5.5, fov: 44, look: 3.4 } };
{ const c = flags.get('cam'); if (c) { const [yaw, dist, h, ahead] = c.split(',').map(Number); Object.assign(CAM.P, { yaw, dist, h, ahead }); } }
const lerp = THREE.MathUtils.lerp;
function frameCamera(dt, now, instant = false) {
  const r = S.run; if (!r) return;
  const p = r.p, aspect = stage.width / stage.height;
  const kA = THREE.MathUtils.smoothstep(aspect, 0.6, 1.25), P = CAM.P, L = CAM.L;
  const menu = S.state === 'menu' || S.state === 'stages' || S.state === 'locker' || S.state === 'trial';
  const v = speedAt(r.w, p.x), vk = THREE.MathUtils.clamp((v - 9) / 12, 0, 1);
  const yaw = lerp(P.yaw, L.yaw, kA) + (menu ? lerp(-0.25, 0.22, kA) + Math.sin(now * 0.13) * 0.05 : 0);
  const vfov = lerp(P.fov, L.fov, kA) + vk * 4 + fx.fovKick * 5;
  camera.fov += (vfov - camera.fov) * (instant ? 1 : 1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix();
  // vertical follow: track ground-ish height, but keep the runner on screen during big jumps / falls
  const g = groundUnder(r), want = p.mode === 'dead' ? p.y : Math.max(Math.min(p.y, g + 1.5), p.y - 3.2, g);
  S.camY += (want - S.camY) * (instant ? 1 : 1 - Math.exp(-dt * (p.y < S.camY - 2 ? 6 : 2.6)));
  const dist = lerp(P.dist, L.dist, kA) * (menu ? 1.1 : 1) + vk * 1.5;
  const ahead = lerp(P.ahead, L.ahead, kA) + vk * 1.5 + (menu ? lerp(0, 3.5, kA) : 0);
  const lx = p.x + ahead, ly = S.camY + lerp(P.look, L.look, kA) + (menu ? lerp(-2.4, 0, kA) : 0);
  tL.set(lx, ly, 0); tP.set(lx - Math.sin(yaw) * dist, ly + lerp(P.h, L.h, kA) + vk * 0.6, Math.cos(yaw) * dist);
  const k = instant ? 1 : 1 - Math.exp(-dt * 7);
  camPos.lerp(tP, k); camLook.lerp(tL, k);
  if (instant) { camPos.copy(tP); camLook.copy(tL); }
  camPos.x = tP.x; camLook.x = tL.x;    // no lag along the run direction (keeps the runner steady)
  camera.position.copy(camPos); camera.lookAt(camLook); fx.shake(camera, now, 0.6);
}

// ------------------------------------------------------------------ HUD
let hudAcc = 0;
function updateHud(r, dt) {
  hudAcc += dt; if (hudAcc < 0.08) return; hudAcc = 0;
  const d = Math.floor(r.dist);
  ui.setText('h-dist', r.mode === 'stage' ? Math.min(d, r.w.len) : d);
  ui.setText('h-chips', r.stats.chips + r.stats.bonusChips);
  if (r.mode === 'stage') { $('h-bar').style.width = Math.min(100, r.dist / r.w.len * 100) + '%'; ui.setText('h-sub', fmtTime(r.t)); }
  else { if (r.trial) $('h-bar').style.width = Math.min(100, r.dist / TRIAL.endlessM * 100) + '%'; ui.setText('h-sub', speedAt(r.w, r.p.x).toFixed(1) + ' m/s'); }
  const p = r.p, pw = [];
  if (p.shield) pw.push(`<span class="pw shield">${t('p_shield')}</span>`);
  if (p.magnetT > 0) pw.push(`<span class="pw magnet"><i style="width:${p.magnetT / PHYS.magnetT * 100}%"></i>${t('p_magnet')}</span>`);
  if (p.slowT > 0) pw.push(`<span class="pw slow"><i style="width:${p.slowT / PHYS.slowT * 100}%"></i>${t('p_slow')}</span>`);
  const html = pw.join(''); const el = $('h-pows'); if (el._h !== html) { el.innerHTML = html; el._h = html; }
}

// ------------------------------------------------------------------ main loop
const NO_INPUT = { press: false, held: false, slide: false, dash: false };
function simFrame(dt) {
  const r = S.run; if (!r) return;
  const slow = r.p.slowT > 0 ? PHYS.slowScale : 1;
  S.acc += dt * slow * (fx.timeScale ?? 1) * (S.attract ? 1 : turbo);
  let n = 0; const cap = S.attract ? 8 : 12 * turbo;
  while (S.acc >= STEP && n < cap) {
    S.acc -= STEP; n++;
    if (r.over) break;
    const inp = S.bot ? S.bot.act(r) : gesture.consume();
    step(r, inp);
    if (r.over) break;
  }
  if (n >= cap) S.acc = 0;
  handleEvents(r);
}
function tick(dt, now) {
  S.frames++;
  U.uTime.value = now; theme.update(dt); fx.update(dt);
  for (const tm of timers.slice()) { if (S.state === 'paused') break; tm.t -= dt; if (tm.t <= 0) { timers.splice(timers.indexOf(tm), 1); tm.fn(); } }
  const r = S.run;
  if (S.hitstop > 0) S.hitstop -= dt;
  else if (r && S.state !== 'paused') {
    if (S.state === 'intro') { S.introT -= dt; if (S.introT <= 0) { setState('play'); if (!S.revived || r.stats.revives === 0) { /* go */ } } }
    else if (S.state === 'play' || S.attract) {
      simFrame(dt);
      if (S.state === 'play') { scanHints(r); updateHud(r, dt); }
      if (r.over && !S.overHandled) {
        if (S.state === 'play') onOver();
        else if (S.attract) { S.overHandled = true; later(1.4, () => { if (S.attract && (S.state === 'menu' || S.state === 'stages' || S.state === 'locker' || S.state === 'trial')) newRun('endless', 1, true); }); }
      }
      if (S.attract && r.dist > 900 && !r.over) newRun('endless', 1, true);
    }
  }
  S.chipT = Math.max(0, S.chipT - dt);
  if (S.hintT > 0) { S.hintT -= dt; if (S.hintT <= 0) $('hint').classList.remove('show'); }
  if (S.run) {
    const p = S.run.p; p.groundY = groundUnder(S.run);
    runner.update(p, dt, now, { idle: S.state === 'intro' && S.run.t === 0 });
    if (p.dashT > 0 || (p.mode === 'air' && p.flipT > 0)) particles.emit(runner.joints.footF, V3(-3, 0.5), meCol(), { life: 0.25, size: 0.7 });
    if (p.mode === 'run' && p.slideT > 0 && Math.random() < 0.6) particles.emit(V3(p.x - 0.2, p.y + 0.05), V3(-4 - Math.random() * 3, 1.5 + Math.random(), (Math.random() - 0.5) * 2), new THREE.Color(0xffd27a), { life: 0.25, size: 0.5 });
    if (runner.trail === 'sparks' && Math.random() < 0.7) particles.emit(runner.joints.neck, V3(-2 - Math.random() * 2, Math.random() - 0.2, (Math.random() - 0.5)), meCol(), { life: 0.45, size: 0.55, grav: -2 });
    course.update(S.run, p.x, now, dt);
    frameCamera(dt, now);
    skyline.update(camera.position.x, now);
    const v = p.mode === 'dead' ? 0 : p.vx;
    speedLines.set(THREE.MathUtils.clamp((v - 11) / 9, 0, 1) * (S.state === 'play' ? 1 : 0.4) + (p.dashT > 0 ? 0.6 : 0), stage.width / stage.height);
  }
  particles.update(dt); waves.update(dt);
  city.update(now, dt, camera);
  city.group.position.set(camera.position.x, camera.position.y - 20, camera.position.z);
  if (city.rain) city.rain.material.uniforms.uCenter.value.set(0, 0, -14);
  fx.applyPost(stage, now); ui.tick(dt); stage.render(dt);
}

// ------------------------------------------------------------------ test / QA API (window.__nsr.api)
S.api = {
  simulateStage: (n, o = {}) => simulate({ mode: 'stage', stage: n, ...o }),
  simulateEndless: (dist = 2000, o = {}) => simulate({ mode: 'endless', maxDist: dist, maxT: 9999, seed: 42, ...o }),
  /** let the autopilot drive the live run (true) or give control back to the player (false) */
  autopilot(on = true) { S.bot = on ? createBot({ dashCost: 0.5 }) : null; },
  /** synchronously advance the live run by `sec` seconds (with autopilot), processing all events */
  ff(sec = 5) {
    const r = S.run; if (!r || (S.state !== 'play' && S.state !== 'intro')) return false;
    if (S.state === 'intro') { S.introT = 0; setState('play'); }
    const bot = S.bot || createBot({ dashCost: 0.5 }); const n = Math.round(sec / STEP);
    for (let i = 0; i < n && !r.over; i++) { step(r, bot.act(r)); if (r.ev.length > 200) r.ev.splice(0, r.ev.length - 50); }
    handleEvents(r); return true;
  },
  /** teleport (endless/trial checks) */
  warp(x) { const r = S.run; const s = r.w.plats.find((q) => q.kind === 'roof' && q.x1 > x + 4) || r.w.cur; Object.assign(r.p, { x: Math.max(s.x0 + 1, x), y: s.y, vy: 0, mode: 'run', ground: s, dashT: 0, slideT: 0 }); r.dist = Math.max(r.dist, r.p.x); },
  kill(cause = 'fell') { const r = S.run; if (r && !r.over) { r.p.mode = 'dead'; r.p.cause = cause; r.over = { type: 'dead', cause }; r.ev.push({ type: 'die', cause, x: r.p.x, y: r.p.y }); } },
  input: (kind) => gesture.inject(kind),
  give: (n) => save.addChips(n),
  state: () => ({ state: S.state, mode: S.run?.mode, stage: S.run?.stage, dist: S.run?.dist, t: S.run?.t, over: S.run?.over, chips: S.run?.stats.chips, wallet: save.wallet(), stars: save.stars(), lang: i18n.lang, hub, attract: S.attract, frames: S.frames, adBreaks: S.adBreaks, interstitials: S.interstitials, lastInput: gesture.last.kind, revived: S.revived, equip: save.equip(), owned: save.owned(), rewardedAsks: S.rewardedAsks, p: S.run && { x: S.run.p.x, y: S.run.p.y, mode: S.run.p.mode, slideT: S.run.p.slideT, dashT: S.run.p.dashT, vy: S.run.p.vy } }),
  start: (n) => startStage(n), endless: () => startEndless(), menu: () => showMenu(), pause, resume,
};

// ------------------------------------------------------------------ boot
i18n.bindToggle($('btn-lang')); i18n.bindToggle($('btn-lang2'));
i18n.onChange(() => {
  refreshMenu(); if (S.state === 'stages') buildStageGrid(); if (S.state === 'locker') buildLocker();
  if (S.run && (S.state === 'play' || S.state === 'intro' || S.state === 'paused')) hudSetup();
});
async function boot() {
  if (document.fonts) await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  if (flags.mute) { audio.muted = true; ui.setMuted(true); }
  showMenu(); frameCamera(0, 0, true); ui.loaded();
  const want = flags.get('mode');
  if (S.demo) { if (want === 'endless') startEndless(); else startStage(Math.min(12, flags.level)); }
  else if (flags.autostart || want) { if (want === 'endless') startEndless(); else if (want === 'stages') showStages(); else if (want === 'locker') showLocker(); else pickStage(Math.min(12, flags.level)); }
  stage.loop(tick, { isActive: () => S.state === 'play', fpsEl: $('fps') });
  if (flags.fps) $('fps').classList.remove('hidden');
  ads.init().catch(() => {});
}
boot().catch((e) => { console.error(e); ui.fatal('載入失敗 Failed to start: ' + e.message); });
