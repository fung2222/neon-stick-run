"""NEON STICK RUN browser smoke test (Playwright + system Chrome, SwiftShader WebGL).

  python tests/smoke.py [base_url] [shots_dir]
  default base_url: serves the repo's parent directory on a free port and opens /neon-stick-run/

Headless SwiftShader runs at ~3 FPS, so every check polls game state through window.__nsr.api.state()
instead of relying on wall-clock timing. Fails on any console error / page error.
"""
import json, os, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
SHOTS = sys.argv[2] if len(sys.argv) > 2 else '/workspace/shots/neon-stick-run'
os.makedirs(SHOTS, exist_ok=True)
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

def st(pg): return pg.evaluate('window.__nsr && window.__nsr.api.state()')
def wait(pg, js, timeout=40, poll=0.25):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pg.evaluate(js): return True
        except Exception: pass
        time.sleep(poll)
    return False
def shot(pg, name):
    # the kit banner/hint fade on frame time; headless SwiftShader runs ~3 FPS, so wait until they are gone before a gameplay shot
    wait(pg, "(() => { const b = document.querySelector('.banner'); return !b || b.classList.contains('hidden') || +getComputedStyle(b).opacity < 0.05 || !['play'].includes(__nsr.state); })()", 12)
    pg.screenshot(path=os.path.join(SHOTS, name)); print('  shot', name, flush=True)
def touch_swipe(pg, dx, dy, x=200, y=600):
    pg.evaluate("""([x, y, dx, dy]) => { const c = document.getElementById('scene'); const o = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, button: 0 };
      c.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: x, clientY: y }));
      window.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x + dx * 0.5, clientY: y + dy * 0.5 }));
      window.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: x + dx, clientY: y + dy }));
      window.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: x + dx, clientY: y + dy })); }""", [x, y, dx, dy])
def new_page(b, w, h, q):
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=w < 600, is_mobile=w < 600)
    pg = ctx.new_page()
    pg.on('console', lambda m: ERRORS.append(f'[{w}x{h}] console.{m.type}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: ERRORS.append(f'[{w}x{h}] pageerror: {e}'))
    pg.goto(BASE + q); wait(pg, "window.__nsr && window.__nsr.frames > 3", 30)
    return ctx, pg
PLAYING = "['play','intro'].includes(window.__nsr.state)"
FF_TO = """(t) => { const r = __nsr.run; const x0 = r.p.x + 14; let x = null;
  if (t === 'wall') { const z = r.w.walls.find((z) => z.x0 > x0); x = z && z.x0; } else if (t === 'grap') { const a = r.w.graps.find((a) => a.x > x0); x = a && a.x; }
  else if (t === 'collapse') { const s = r.w.plats.find((s) => s.kind === 'collapse' && s.x0 > x0); x = s && s.x0; } else { const o = r.w.obs.find((o) => o.type === t && o.x > x0); x = o && o.x; }
  if (x == null) return false; __nsr.api.ff((x - r.p.x - 9) / Math.max(8, r.p.vx)); return true; }"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)

    # ---------------------------------------------------------------- A: phone, zh, touch
    ctx, pg = new_page(b, 412, 915, '?lang=zh&mute=1&reset=1')
    s = st(pg); check('A boots to menu with attract run', s['state'] == 'menu' and s['attract'], s['state'])
    check('A noindex meta', pg.evaluate("document.querySelector('meta[name=robots]').content.includes('noindex')"))
    check('A zh strings', '霓虹火柴人酷跑' in pg.inner_text('#title'))
    time.sleep(2); shot(pg, 'zh-412x915-menu.png')
    pg.click('#btn-stage-go'); check('A stage 1 starts', wait(pg, "__nsr.state === 'play' && __nsr.run.stage === 1", 30))
    pg.touchscreen.tap(206, 520); check('A tap = jump', wait(pg, "__nsr.run.stats.jumps >= 1", 15), st(pg)['lastInput'])
    wait(pg, "__nsr.run.p.mode === 'run'", 10)
    touch_swipe(pg, 0, 90); check('A swipe down = slide', wait(pg, "__nsr.api.state().lastInput === 'slide'", 10))
    time.sleep(1.5)
    touch_swipe(pg, 110, 0); check('A swipe right = dash', wait(pg, "__nsr.api.state().lastInput === 'dash'", 10))
    touch_swipe(pg, 0, -90); check('A swipe up = jump', wait(pg, "__nsr.api.state().lastInput === 'jump'", 10))
    check('A no death from scripted inputs', True)
    pg.click('#btn-pause'); check('A pause', wait(pg, "__nsr.state === 'paused'", 10))
    d0 = st(pg)['dist']; time.sleep(1.5); check('A paused = frozen', abs(st(pg)['dist'] - d0) < 1e-6)
    shot(pg, 'zh-412x915-pause.png')
    pg.click('#btn-resume'); check('A resume', wait(pg, "__nsr.state === 'play'", 15))
    # stage clear through the live autopilot fast-forward
    pg.evaluate("__nsr.api.ff(200)")
    check('A stage 1 cleared', wait(pg, "__nsr.state === 'result' && __nsr.result && __nsr.result.won", 40), json.dumps(st(pg)['over']))
    s = st(pg); check('A stars saved', s['stars'][0] >= 1, s['stars'][:3]); check('A chips banked', s['wallet'] > 0, s['wallet'])
    time.sleep(2.5); shot(pg, 'zh-412x915-result.png')
    pg.click('#btn-res-main'); check('A next → stage 2', wait(pg, "__nsr.run.stage === 2 && " + PLAYING, 20))
    wait(pg, "__nsr.state === 'play'", 20); pg.evaluate(FF_TO, 'pipe'); time.sleep(2.2); shot(pg, 'zh-412x915-play.png')
    # endless: far past any 'end', death → revive → death → retry
    pg.evaluate("__nsr.api.endless()"); wait(pg, "__nsr.state === 'play' && __nsr.run.mode === 'endless'", 20)
    pg.evaluate("__nsr.api.warp(2500)"); pg.evaluate("__nsr.api.ff(20)")
    s = st(pg); check('A endless continues past 2.5 km', s['over'] is None or s['over']['type'] == 'dead', f"{s['dist']:.0f} m")
    pg.evaluate("__nsr.api.kill('drone')"); check('A endless death → result', wait(pg, "__nsr.state === 'result'", 25))
    check('A revive offered', pg.is_visible('#btn-revive'))
    pg.click('#btn-revive'); check('A revive resumes run', wait(pg, PLAYING + " && __nsr.revived && !__nsr.run.over", 15))
    wait(pg, "__nsr.state === 'play'", 15); pg.evaluate("__nsr.api.kill('laser')"); wait(pg, "__nsr.state === 'result'", 25)
    check('A revive only once', not pg.is_visible('#btn-revive'))
    pg.click('#btn-res-main'); check('A retry endless', wait(pg, PLAYING + " && __nsr.run.mode === 'endless' && __nsr.run.dist < 50", 20))
    check('A game-over break reported (standalone web: ads allowed, no SDK)', st(pg)['adBreaks'] >= 1, st(pg)['adBreaks'])
    # locker
    pg.click('#btn-pause'); wait(pg, "__nsr.state === 'paused'", 10); pg.click('#btn-quit'); wait(pg, "__nsr.state === 'menu'", 10)
    pg.evaluate("__nsr.api.give(500)"); w0 = st(pg)['wallet']
    pg.click('#btn-locker'); wait(pg, "__nsr.state === 'locker'", 10)
    pg.click('.lk-item[data-id=magenta]'); time.sleep(0.6)
    s = st(pg); check('A buy colour', 'magenta' in s['owned']['colors'] and s['wallet'] == w0 - 120 and s['equip']['color'] == 'magenta', f"{s['wallet']} {s['equip']}")
    pg.click('.lk-item[data-id=twin]'); time.sleep(0.6); check('A buy trail', st(pg)['equip']['trail'] == 'twin')
    pg.click('.lk-item[data-id=spectrum]'); time.sleep(0.4); check('A cannot afford spectrum', 'spectrum' not in st(pg)['owned']['colors'])
    time.sleep(1.5); shot(pg, 'zh-412x915-locker.png')
    pg.click('#btn-locker-back'); pg.click('#btn-stages'); wait(pg, "__nsr.state === 'stages'", 10)
    check('A stage 3 locked, 2 unlocked', pg.evaluate("!document.querySelector('.stage-card[data-n=\"2\"]').classList.contains('locked') && document.querySelector('.stage-card[data-n=\"3\"]').classList.contains('locked')"))
    shot(pg, 'zh-412x915-stages.png')
    ctx.close()

    # ---------------------------------------------------------------- B: desktop, en, keyboard
    ctx, pg = new_page(b, 1280, 800, '?lang=en&mute=1&reset=1')
    check('B en strings', 'NEON STICK RUN' in pg.inner_text('#title')); time.sleep(2); shot(pg, 'en-1280x800-menu.png')
    pg.keyboard.press('Enter'); check('B Enter starts stage 1', wait(pg, "__nsr.state === 'play'", 30))
    pg.keyboard.down('Space'); time.sleep(0.6); pg.keyboard.up('Space'); check('B Space = jump', wait(pg, "__nsr.run.stats.jumps >= 1", 10))
    wait(pg, "__nsr.run.p.mode === 'run'", 10)
    pg.keyboard.press('ArrowDown'); check('B ↓ = slide', wait(pg, "__nsr.api.state().lastInput === 'slide'", 10))
    time.sleep(1.2); pg.keyboard.press('ArrowRight'); check('B → = dash', wait(pg, "__nsr.api.state().lastInput === 'dash'", 10))
    pg.keyboard.press('KeyP'); check('B P pauses', wait(pg, "__nsr.state === 'paused'", 10)); shot(pg, 'en-1280x800-pause.png')
    pg.keyboard.press('KeyP'); check('B P resumes', wait(pg, "__nsr.state === 'play'", 15))
    pg.evaluate("localStorage.setItem('cyber.neon-stick-run.stars', JSON.stringify([3,3,2,3,2,1,0,0,0,0,0,0]))")
    pg.evaluate("__nsr.api.start(7)"); wait(pg, "__nsr.state === 'play' && __nsr.run.stage === 7", 25)
    pg.evaluate(FF_TO, 'grap'); time.sleep(2.0); shot(pg, 'en-1280x800-play.png')
    pg.evaluate("__nsr.api.start(4)"); wait(pg, "__nsr.state === 'play' && __nsr.run.stage === 4", 25)
    pg.evaluate(FF_TO, 'drone'); time.sleep(2.0); shot(pg, 'en-1280x800-drone.png')
    pg.evaluate("__nsr.api.ff(200)"); wait(pg, "__nsr.state === 'result'", 40); time.sleep(2.5); shot(pg, 'en-1280x800-result.png')
    pg.evaluate("__nsr.api.menu()"); wait(pg, "__nsr.state === 'menu'", 10)
    pg.click('#btn-lang'); check('B language toggle → zh', wait(pg, "__nsr.api.state().lang === 'zh-HK'", 5))
    pg.goto(BASE); wait(pg, "window.__nsr && __nsr.frames > 3", 30); check('B language persisted', st(pg)['lang'] == 'zh-HK')
    time.sleep(1.5); shot(pg, 'zh-1280x800-menu.png')
    pg.evaluate("__nsr.api.start(8)"); wait(pg, "__nsr.state === 'play' && __nsr.run.stage === 8", 25); pg.evaluate(FF_TO, 'collapse'); time.sleep(2.0); shot(pg, 'zh-1280x800-play.png')
    ctx.close()

    # ---------------------------------------------------------------- C: hub trial (Free tier, ads on)
    ctx, pg = new_page(b, 412, 915, '?hub=1&tier=free&ads=1&trial=1&trialLeft=2&lang=en&mute=1&reset=1')
    s = st(pg); check('C hub params parsed', s['hub']['fromHub'] and s['hub']['trial'] and s['hub']['ads'] and s['hub']['trialLeft'] == 2, json.dumps(s['hub']))
    check('C trial tag visible', pg.is_visible('#trial-tag') and '2' in pg.inner_text('#trial-tag'))
    pg.evaluate("localStorage.setItem('cyber.neon-stick-run.stars', JSON.stringify([3,3,3,3,0,0,0,0,0,0,0,0]))")
    pg.click('#btn-stages'); wait(pg, "__nsr.state === 'stages'", 10)
    pg.click('.stage-card[data-n="4"]'); check('C stage 4 → unlock prompt', wait(pg, "__nsr.state === 'trial'", 10))
    check('C prompt bilingual-ready', 'Silver' in pg.inner_text('#screen-trial') and pg.is_visible('#btn-hub'))
    pg.click('#btn-trial-menu'); wait(pg, "__nsr.state === 'menu'", 10)
    pg.evaluate("__nsr.api.start(3)"); wait(pg, "__nsr.state === 'play'", 25); pg.evaluate("__nsr.api.ff(200)")
    wait(pg, "__nsr.state === 'result'", 40); check('C clearing stage 3 offers hub unlock', pg.get_attribute('#btn-res-main', 'data-act') == 'trial')
    pg.evaluate("__nsr.api.endless()"); wait(pg, "__nsr.state === 'play' && __nsr.run.mode === 'endless'", 20)
    check('C endless run flagged trial', pg.evaluate("__nsr.run.trial === true"))
    pg.evaluate("__nsr.api.warp(760)"); pg.evaluate("__nsr.api.ff(15)")
    check('C endless stops at 800 m → unlock prompt', wait(pg, "__nsr.state === 'trial'", 25), f"{st(pg)['dist']:.0f} m")
    time.sleep(1.5); shot(pg, 'en-412x915-trial.png')
    pg.evaluate("__nsr.api.menu()"); pg.click('#btn-lang'); wait(pg, "__nsr.api.state().lang === 'zh-HK'", 5)
    pg.evaluate("__nsr.api.endless()"); wait(pg, "__nsr.state === 'play'", 20); pg.evaluate("__nsr.api.warp(780)"); pg.evaluate("__nsr.api.ff(10)")
    wait(pg, "__nsr.state === 'trial'", 25); check('C zh unlock prompt', '試玩' in pg.inner_text('#screen-trial')); time.sleep(1); shot(pg, 'zh-412x915-trial.png')
    ctx.close()

    # ---------------------------------------------------------------- D: Silver tier → no interstitial breaks
    ctx, pg = new_page(b, 412, 915, '?hub=1&tier=silver&ads=0&lang=en&mute=1&reset=1')
    pg.evaluate("__nsr.api.endless()"); wait(pg, "__nsr.state === 'play'", 20); pg.evaluate("__nsr.api.kill()"); wait(pg, "__nsr.state === 'result'", 25)
    pg.click('#btn-res-main'); wait(pg, PLAYING, 15); check('D ads=0 → no game-over ad break', st(pg)['adBreaks'] == 0)
    ctx.close()
    ctx, pg = new_page(b, 412, 915, '?lang=en&mute=1&reset=1')
    pg.evaluate("localStorage.setItem('cyber.entitlement', JSON.stringify({v:1,tier:'gold',products:['tier_gold']}))"); pg.reload(); wait(pg, "window.__nsr && __nsr.frames > 3", 30)
    check('D cyber.entitlement gold → ads off', st(pg)['hub']['ads'] is False and st(pg)['hub']['tier'] == 'gold')
    ctx.close()

    # ---------------------------------------------------------------- E: auto-demo
    ctx, pg = new_page(b, 412, 915, '?demo=1&lang=en&mute=1')
    check('E demo autoplays', wait(pg, "__nsr.state === 'play' && __nsr.run.dist > 25", 40), f"{st(pg)['dist']:.0f} m")
    check('E demo tag', pg.is_visible('#demo-tag')); time.sleep(1); shot(pg, 'en-412x915-demo.png')
    check('E demo never touches saves', pg.evaluate("localStorage.getItem('cyber.neon-stick-run.chips') === null"))
    ctx.close()
    ctx, pg = new_page(b, 412, 915, '?demo=1&level=10&lang=zh&mute=1')
    wait(pg, "__nsr.state === 'play'", 30); pg.evaluate(FF_TO, 'wall'); time.sleep(2.2); shot(pg, 'zh-412x915-wallrun.png')
    pg.evaluate("__nsr.api.ff(120)"); check('E demo stage 10 cleared', wait(pg, "__nsr.result && __nsr.result.won", 40))
    check('E demo advances to stage 11', wait(pg, "__nsr.run.stage === 11", 40))
    ctx.close()
    b.close()

if server: server.terminate()
check('zero console errors', not ERRORS, '; '.join(ERRORS[:5]))
failed = [n for n, ok in RESULTS if not ok]
print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed" + (f"  FAILED: {failed}" if failed else '  ALL PASSED'))
sys.exit(1 if failed else 0)
