"""NEON STICK RUN showcase screenshots + live-build stage playtest (Playwright + system Chrome, SwiftShader).

  python tests/shots.py [base_url] [shots_dir]

- plays every stage 1-12 in the live page with the autopilot (api.ff) and checks each one clears;
- takes curated screenshots at 412x915 (touch) and 1280x800 in zh-HK and en (gameplay moments: wall-run, grapple,
  drone, collapse, endless milestone) into shots_dir, and WebP copies for the README into docs/shots/;
- fails on any console error / page error.
"""
import os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/workspace/shots/neon-stick-run'
DOCS = os.path.join(ROOT, 'docs', 'shots')
os.makedirs(SHOTS, exist_ok=True); os.makedirs(DOCS, exist_ok=True)
server = None
if len(sys.argv) > 1 and sys.argv[1].startswith('http'):
    BASE = sys.argv[1].rstrip('/') + '/'
else:
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    server = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1'], cwd=os.path.dirname(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    BASE = f'http://127.0.0.1:{port}/{os.path.basename(ROOT)}/'
ERRORS, RESULTS = [], []
def check(name, cond, info=''):
    RESULTS.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + (f'  [{info}]' if info else ''), flush=True)
def wait(pg, js, timeout=40, poll=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(poll)
    return False
CLEAR = "(() => { const b = document.querySelector('.banner'); return !b || b.classList.contains('hidden') || +getComputedStyle(b).opacity < 0.05; })()"
def shot(pg, name, docs=None, settle=1.6):
    time.sleep(settle); wait(pg, CLEAR, 15)
    path = os.path.join(SHOTS, name); pg.screenshot(path=path); print('  shot', path, flush=True)
    if docs:
        pg.screenshot(path=os.path.join(DOCS, docs + '.png'))
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', os.path.join(DOCS, docs + '.png'), '-c:v', 'libwebp', '-quality', '80', os.path.join(DOCS, docs + '.webp')], check=False)
        try: os.remove(os.path.join(DOCS, docs + '.png'))
        except OSError: pass
FF_TO = """(t) => { const r = __nsr.run; const x0 = r.p.x + 14; let x = null;
  if (t === 'wall') { const z = r.w.walls.find((z) => z.x0 > x0); x = z && z.x0; } else if (t === 'grap') { const a = r.w.graps.find((a) => a.x > x0); x = a && a.x; }
  else if (t === 'collapse') { const s = r.w.plats.find((s) => s.kind === 'collapse' && s.x0 > x0); x = s && s.x0; } else { const o = r.w.obs.find((o) => o.type === t && o.x > x0); x = o && o.x; }
  if (x == null) return false; __nsr.api.ff((x - r.p.x - 9) / Math.max(8, r.p.vx)); return true; }"""
# step the live run with the autopilot until the runner is in a given pose (nice action frames)
FF_UNTIL = """([pred, maxSec]) => { const r = __nsr.run; const f = new Function('r', 'p', 'return ' + pred);
  for (let i = 0; i < maxSec * 90; i++) { __nsr.api.ff(1 / 90); if (r.over || f(r, r.p)) return true; } return false; }"""
def page(b, w, h, q):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=w < 600, is_mobile=w < 600)
    pg = ctx.new_page()
    pg.on('console', lambda m: ERRORS.append(f'[{w}x{h}] console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: ERRORS.append(f'[{w}x{h}] pageerror: {e}'))
    pg.goto(BASE + q); wait(pg, "window.__nsr && window.__nsr.frames > 3", 30)
    return ctx, pg
def start(pg, n):
    pg.evaluate(f"__nsr.api.start({n})"); wait(pg, f"__nsr.state === 'play' && __nsr.run.stage === {n}", 30)
    pg.evaluate("__nsr.api.autopilot(true)")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
    # ---------------------------------------------------------------- live playtest: every stage clears with the autopilot
    ctx, pg = page(b, 412, 915, '?lang=en&mute=1&reset=1&unlock=all')
    for n in range(1, 13):
        pg.evaluate(f"__nsr.api.start({n})"); wait(pg, f"['play','intro'].includes(__nsr.state) && __nsr.run.stage === {n}", 30)
        pg.evaluate("__nsr.api.ff(170)")
        ok = wait(pg, "__nsr.result && __nsr.result.won && __nsr.state === 'result'", 30)
        s = pg.evaluate("({ t: __nsr.run.t, chips: __nsr.run.stats.chips, tot: __nsr.run.w.chipTotal, stars: __nsr.result && __nsr.result.stars, over: __nsr.run.over })")
        check(f'live stage {n} clears', ok, f"{s['t']:.0f}s chips {s['chips']}/{s['tot']} stars {s['stars']} {s['over']}")
    ctx.close()

    for lang in ('zh', 'en'):
        # ------------------------------------------------------------ portrait 412x915 (touch)
        ctx, pg = page(b, 412, 915, f'?lang={lang}&mute=1&reset=1&unlock=all')
        pg.evaluate("localStorage.setItem('cyber.neon-stick-run.stars', JSON.stringify([3,3,2,3,2,1,0,0,0,0,0,0])); localStorage.setItem('cyber.neon-stick-run.chips', '1280')")
        pg.goto(BASE + f'?lang={lang}&mute=1&unlock=all'); wait(pg, "window.__nsr && window.__nsr.frames > 3", 30)
        shot(pg, f'{lang}-412x915-menu.png', docs='menu-portrait' if lang == 'zh' else None, settle=3)
        start(pg, 10); pg.evaluate(FF_TO, 'wall'); pg.evaluate(FF_UNTIL, ["p.mode === 'wall' && p.y > r.p.y - 1", 12])
        shot(pg, f'{lang}-412x915-wallrun.png', docs='wallrun-portrait' if lang == 'zh' else None)
        start(pg, 7); pg.evaluate(FF_TO, 'grap'); pg.evaluate(FF_UNTIL, ["p.mode === 'grap'", 12]); pg.evaluate("__nsr.api.ff(0.25)")
        shot(pg, f'{lang}-412x915-grapple.png', docs='grapple-portrait' if lang == 'en' else None)
        start(pg, 4); pg.evaluate(FF_TO, 'drone'); pg.evaluate(FF_UNTIL, ["p.dashT > 0.12", 4])
        shot(pg, f'{lang}-412x915-drone.png', docs='play-portrait' if lang == 'zh' else None)
        pg.evaluate("__nsr.api.endless()"); wait(pg, "__nsr.state === 'play' && __nsr.run.mode === 'endless'", 20); pg.evaluate("__nsr.api.autopilot(true)")
        pg.evaluate("__nsr.api.warp(1460)"); pg.evaluate(FF_UNTIL, ["r.dist > 1503", 12])
        time.sleep(0.6); pg.screenshot(path=os.path.join(SHOTS, f'{lang}-412x915-milestone.png')); print('  shot', f'{lang}-412x915-milestone.png')
        pg.evaluate("__nsr.api.pause()"); shot(pg, f'{lang}-412x915-pause.png', settle=1.2)
        ctx.close()
        # ------------------------------------------------------------ landscape 1280x800 (keyboard)
        ctx, pg = page(b, 1280, 800, f'?lang={lang}&mute=1&reset=1&unlock=all')
        shot(pg, f'{lang}-1280x800-menu.png', docs='menu-desktop' if lang == 'en' else None, settle=3)
        start(pg, 8); pg.evaluate(FF_TO, 'collapse'); pg.evaluate(FF_UNTIL, ["p.mode === 'air' && p.vy < 0", 4])
        shot(pg, f'{lang}-1280x800-collapse.png')
        start(pg, 9); pg.evaluate(FF_TO, 'laser'); pg.evaluate(FF_UNTIL, ["p.mode === 'air'", 4])
        shot(pg, f'{lang}-1280x800-play.png', docs='play-desktop' if lang == 'en' else None)
        start(pg, 7); pg.evaluate(FF_TO, 'grap'); pg.evaluate(FF_UNTIL, ["p.mode === 'grap'", 12]); pg.evaluate("__nsr.api.ff(0.3)")
        shot(pg, f'{lang}-1280x800-grapple.png')
        pg.evaluate("__nsr.api.ff(200)"); wait(pg, "__nsr.state === 'result'", 40); shot(pg, f'{lang}-1280x800-result.png', settle=2.5)
        ctx.close()
    b.close()
if server: server.terminate()
check('zero console errors', not ERRORS, '; '.join(ERRORS[:5]))
failed = [n for n, ok in RESULTS if not ok]
print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed" + (f"  FAILED: {failed}" if failed else '  ALL PASSED'))
sys.exit(1 if failed else 0)
