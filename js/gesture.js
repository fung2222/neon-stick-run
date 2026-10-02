// One-thumb gesture + keyboard input for a runner. Written for this game (cyber-kit createInput is tap/hold/dir based,
// but parkour needs "hold = higher jump" on the SAME touch that started the jump, plus a follow-up swipe mid-air).
//
//   tap (anywhere)          → jump, finger kept down = held (higher jump)   · tap again mid-air = double jump
//   swipe ↑                 → jump (held while the finger stays down)
//   swipe ↓                 → slide (on ground) / fast-fall into a slide (in the air)
//   swipe →                 → dash / air-kick
//   second finger           → jump
//   keys: Space ↑ W K jump (hold) · ↓ S J slide · → D L Shift dash · P Esc pause · M mute · Enter primary
//
// The game polls consume() once per fixed simulation step; edges are delivered exactly once.
const INTENT_MS = 70, SWIPE_PX = 22, FOLLOW_PX = 30;
const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyK']);
const SLIDE_KEYS = new Set(['ArrowDown', 'KeyS', 'KeyJ']);
const DASH_KEYS = new Set(['ArrowRight', 'KeyD', 'KeyL', 'ShiftLeft', 'ShiftRight']);

export function createGesture(target, cb = {}) {
  const q = { press: 0, slide: 0, dash: 0 };
  const touches = new Map();          // pointerId → { x0, y0, t0, kind: null|'jump'|'slide'|'dash', follow, timer }
  const keysHeld = new Set();
  let enabled = false, last = { kind: '', t: 0 };
  const out = { press: false, held: false, slide: false, dash: false };
  const fire = (kind) => { if (!enabled) return; q[kind === 'jump' ? 'press' : kind]++; last = { kind, t: performance.now() }; cb.onAction && cb.onAction(kind); };
  const ignore = (e) => { const el = e.target; return !!(el && el.closest && el.closest('button, a, input, [data-no-input], .screen:not(.hidden) .panel')); };

  function decide(tc, kind) { if (tc.kind) return; clearTimeout(tc.timer); tc.kind = kind; fire(kind); }
  function onDown(e) {
    cb.onAny && cb.onAny();
    if (!enabled || ignore(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (touches.size >= 1) { const tc = { x0: e.clientX, y0: e.clientY, t0: performance.now(), kind: 'jump', follow: true, timer: 0 }; touches.set(e.pointerId, tc); fire('jump'); return; }
    const tc = { x0: e.clientX, y0: e.clientY, t0: performance.now(), kind: null, follow: false, timer: 0 };
    tc.timer = setTimeout(() => decide(tc, 'jump'), INTENT_MS);
    touches.set(e.pointerId, tc);
    try { target.setPointerCapture && target.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  }
  function onMove(e) {
    const tc = touches.get(e.pointerId); if (!tc || !enabled) return;
    const dx = e.clientX - tc.x0, dy = e.clientY - tc.y0, ax = Math.abs(dx), ay = Math.abs(dy);
    const need = tc.kind ? FOLLOW_PX : SWIPE_PX;
    if (Math.max(ax, ay) < need || (tc.kind && tc.follow)) return;
    let kind = null;
    if (ay > ax * 1.1) kind = dy < 0 ? 'jump' : 'slide'; else if (dx > 0) kind = 'dash'; else return;  // swipe left: nothing
    if (!tc.kind) decide(tc, kind);
    else if (kind !== 'jump') { tc.follow = true; fire(kind); }   // one follow-up swipe after a jump (e.g. jump → dash)
    tc.x0 = e.clientX; tc.y0 = e.clientY;
  }
  function onUp(e) {
    const tc = touches.get(e.pointerId); if (!tc) return;
    if (!tc.kind && enabled) decide(tc, 'jump');   // quick tap released before the intent window
    clearTimeout(tc.timer); touches.delete(e.pointerId);
  }
  target.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  target.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    cb.onAny && cb.onAny();
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const c = e.code;
    if (c === 'KeyP' || c === 'Escape') { e.preventDefault(); cb.onPause && cb.onPause(); return; }
    if (c === 'KeyM') { cb.onMute && cb.onMute(); return; }
    if (c === 'Enter' || c === 'NumpadEnter') { if (!e.repeat) { e.preventDefault(); cb.onPrimary && cb.onPrimary(); } return; }
    if (JUMP_KEYS.has(c) || SLIDE_KEYS.has(c) || DASH_KEYS.has(c)) {
      if (!enabled) { if (c === 'Space' && !e.repeat) { e.preventDefault(); cb.onPrimary && cb.onPrimary(); } return; }
      e.preventDefault(); if (e.repeat) return;
      keysHeld.add(c);
      fire(JUMP_KEYS.has(c) ? 'jump' : SLIDE_KEYS.has(c) ? 'slide' : 'dash');
    }
  });
  window.addEventListener('keyup', (e) => keysHeld.delete(e.code));
  window.addEventListener('blur', () => { keysHeld.clear(); touches.clear(); });

  const api = {
    /** call once per simulation step */
    consume() {
      out.press = q.press > 0; out.slide = q.slide > 0; out.dash = q.dash > 0;
      if (q.press) q.press--; if (q.slide) q.slide--; if (q.dash) q.dash--;
      let held = false; for (const k of keysHeld) if (JUMP_KEYS.has(k)) held = true;
      for (const tc of touches.values()) if (tc.kind === 'jump' || (!tc.kind && performance.now() - tc.t0 < 400)) held = true;
      out.held = held; return out;
    },
    setEnabled(on) { enabled = !!on; if (!on) { q.press = q.slide = q.dash = 0; for (const tc of touches.values()) clearTimeout(tc.timer); touches.clear(); keysHeld.clear(); } },
    get enabled() { return enabled; },
    get last() { return last; },
    /** synthetic input for tests / demo */
    inject(kind) { fire(kind); },
  };
  return api;
}
