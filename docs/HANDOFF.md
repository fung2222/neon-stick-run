# NEON STICK RUN 霓虹火柴人酷跑 — Handoff

Status: **web build v1.0** · live https://fung2222.github.io/neon-stick-run/ · auto-demo `?demo=1` · not yet packaged for Android.
Series rules: `fung2222/cyber-arcade/docs/ARCADE-HANDOFF.md` (master rules) and `docs/MONETIZATION.md` (tiers / hub contract). Tier: **Silver**.
Everything here was written from scratch for this game on cyber-kit **v0.2.1** (vendored). No code from any older repo.

## 1. Design in one paragraph
A glowing neon stickman auto-runs along +x across procedurally generated rainy Kowloon rooftops. The player only chooses *timing*
with one thumb: jump (hold = higher, tap again = double jump), slide, dash/air-kick. Vault, mantle, wall-run and grapple swing are
contextual (they trigger when you run or jump into them), so the move set stays rich without extra buttons. Sessions are short:
stages last 60–120 s; endless runs end on the first mistake (one rewarded revive per run).

## 2. Controls
| Input | Touch | Keyboard |
|---|---|---|
| Jump (hold = higher) / double jump in the air / wall-jump / early grapple release | tap anywhere or swipe ↑ (finger held = held jump) · second finger = jump | `Space` `↑` `W` `K` (hold) |
| Slide (ground) / fast-fall into a slide (air) | swipe ↓ | `↓` `S` `J` |
| Dash / air-kick (smashes drones + billboards) | swipe → | `→` `D` `L` `Shift` |
| Pause / resume | ⏸ button (top right) | `P` `Esc` |
| Mute | 🔈 button | `M` |
| Menu confirm | — | `Enter` (Space on menus) |

`js/gesture.js`: 70 ms intent window — if the finger moves ≥ 22 px inside it the touch becomes a swipe, otherwise a jump fires
(at 70 ms or on release). After a jump one follow-up swipe (≥ 30 px, e.g. jump → dash) is allowed on the same touch.
Swipe left does nothing. Buttons / `[data-no-input]` / visible menu panels never feed gameplay. The game polls `consume()` once per
fixed simulation step so edges are delivered exactly once. Android back: pause → resume; result/stages/locker → menu.

## 3. Simulation (`js/sim.js`, pure, Node-importable)
- Fixed step `STEP = 1/90 s`; all tuning in `js/config.js PHYS` (g 40, jumpV 13, hold gravity ×0.42 for ≤ 0.24 s, dblV 11.5,
  slide 0.6 s, dash 0.3 s (+60 % speed, cooldown 0.8 s), coyote 0.1 s, input buffer 0.13 s, mantle ≤ 0.55 m, grapple range 7.2 m).
  Apex: tap ≈ 2.1 m, full hold ≈ 3.6 m, double jump adds ≈ 1.65 m.
- Player modes: `run`, `air`, `wall`, `grap`, `dead`. Collision is 2D (x, y); z is visual only.
- World = platforms (`roof` / `collapse` scaffolds, sorted), obstacles (`pipe`, `board`, `laser` [static or pulsing], `drone`
  [hover or patrol], `vault` crates), pickups (`chip`, `magnet`, `shield`, `slow`), `walls` (wall-run zones), `graps` (anchors).
- Generation is a sequence of **patterns** (`PATTERNS`: flat, gap, gapWide, step, vault, pipe, billboard, drone, droneLow, laser,
  laserPulse, wall, grapple, collapse, combo). Each pattern sizes itself from current speed `v` and density `d`, so gaps are always
  jumpable at that speed. Every stage has a `pool` and a `feature` pattern forced every 4th pick (stage 7 really is grapples).
- **Stages** (`STAGES` in config): length 600 → 1500 m, speed 9 → 15.6 m/s, density 0.08 → 0.82, theme index, pool, feature.
  Stage seed = `7919·stage + 13` → layouts are identical for every player (fair star ratings).
- **Endless**: random seed; speed & density follow cyber-kit `endlessCurve` (speed 10 → cap 21 m/s, density 0.18 → cap 0.88);
  patterns unlock gradually by distance; chunks generated 340 m ahead and pruned 70 m behind (bounded memory). No finish exists.
  Milestone every 500 m: +25 bonus chips, district theme shift.
- Hazards: hitting a building face above mantle height (`wall`), pipe/board (`pipe`/`board`), laser (`laser`), drone (`drone`),
  falling (`fell`). Shield absorbs one hit (and smashes the drone/board). Dash through a drone/billboard = smash (+120 style).
- Collapse scaffolds start sinking 0.35 s after you first land (`COLLAPSE_DELAY`), accelerating; keep moving.
- Stars (`starsOf`): ★ clear · ★★ ≥ 50 % of the stage's chips · ★★★ ≥ 80 % chips and no revive.
- Score (endless): metres + chips×5 + style (vault 40, wall-run 80, swing 80, smash 120).
- API: `createRun({mode:'stage'|'endless', stage, seed, trial})`, `step(run, {press, held, slide, dash})`, `revive(run)`,
  `runScore`, `starsOf`, `speedAt`, `diffAt`, `platsNear`, `obsNear`, `topOf`, `droneY`, `laserOn`,
  `createBot({horizon, every, noise, rng, dashCost})`, `simulate({...})`. Events are pushed to `run.ev`
  (jump, dbl, land{imp}, slide, slam, dash, vault, mantle, wall, wallJump, wallEnd, grap, grapEnd, chip, pow{kind}, smash{kind},
  shield, collapse, die{cause}, revive, milestone{n,m}, clear, trial) and consumed by `main.js` for FX/sound.
- **Autopilot** (`createBot`): receding-horizon search over short input programs, simulated on a cheap clone with the exact same
  `step()`. Used by the menu attract run, `?demo=1`, the tests and the in-browser QA API. `dashCost < 1` makes it prefer smashing.

## 4. Rendering / feel (`js/runner.js`, `js/world.js`, `js/main.js`)
- `StickRunner`: procedural 2D FK skeleton (run cycle that tightens with speed, jump up/down, tuck flip on double jump, slide,
  dash, air-kick, vault, hang/swing, wall-run tilt, ragdoll-ish dead pose), glowing capsule bones + joint orbs + visor,
  landing squash spring, shield bubble, magnet aura, floor glow, grapple rope, ribbon trails (streak / twin / sparks / ghost
  afterimages / prism shader), spectrum colour cycling.
- `CourseView`: instanced rooftops with a procedural building shader (wet tiles, puddle reflections, neon rims, lit windows),
  hazard-striped collapse scaffolds that flash red when triggered, roof props (AC units, water tanks, masts + beacons, rails),
  hanging vertical neon signs, pooled hazard meshes (pipes, 8 canvas-drawn bilingual billboards, laser fences, drones with
  rotors + scan cone, crates, wall holo panels, grapple anchors with range ring), instanced chips, finish / trial-end / best gates.
- `Skyline`: three wrapping parallax building layers, holograms, rings, moving street lights 42 m below, dust. cyber-kit
  `NeonCity` supplies sky, rain, traffic, lights (its own buildings are hidden; its group follows the camera).
- Camera: portrait = high chase camera (track recedes up the screen, runner centred low); landscape = side-on with slight angle;
  smoothly interpolated by aspect. Speed raises FOV; dash kicks FOV; shake on impacts. `?cam=yaw,dist,h,ahead` overrides portrait.
- FX: particles (jump dust, landing puffs, chip sparks, smash explosions, slide sparks), shockwaves, hit-stop on smash,
  chromatic aberration/glitch kicks, camera-space speed lines, slow-mo on death and in the slow-mo power-up (0.6×).
- Audio (`js/audio.js`): `RunAudio extends SynthAudio`, every sound synthesised (jump, double, land, slide, dash, smash, chip
  arpeggio, power-up, shield break, wall-run, grapple, crumble, death, clear, stars, milestone) + custom synthwave music preset.

## 5. Game flow (`js/main.js`)
States: `menu` (attract endless run by the autopilot behind the title) → `stages` (grid of 12, sequential unlock) / `locker` /
`intro` (1.1 s banner) → `play` → `paused` → `result` (stars, stats, next / retry / revive / stage list / menu) or `trial`.
Saves (`createStore('neon-stick-run')` → `localStorage cyber.neon-stick-run.*`): `stars` [12], `times` [12], `chips` (wallet),
`bestDist`, `best` (endless score), `owned` {colors, trails}, `equip` {color, trail}, `hints`, `muted`. Chips are banked once per run
(on clear, trial end, or when leaving a result). Demo mode never writes saves. First-time hints appear the first time each mechanic
shows up ahead (`maybeHint`). `?reset=1` wipes saves; `?unlock=all` unlocks all stages (QA).

## 6. Hub contract (cyber-arcade MONETIZATION.md §4 + §8) — `js/hub.js`
- Reads `?hub=1&tier=free|silver|gold&ads=0|1[&trial=1&trialLeft=N]`, falling back to `localStorage cyber.entitlement.tier`.
- `ads`: the `ads` param wins; else `tier === 'free'`; standalone web defaults to allowed (the web build shows no real ads anyway).
- `trial=1` → **stages 1–3 only** and **endless stops at 800 m** (`TRIAL` in config). Stage 4+ cards are locked with a trial label;
  tapping one, clearing stage 3 ("next" becomes "unlock in hub"), or reaching 800 m shows the bilingual `#screen-trial` prompt.
  Its main button calls `returnToHub()`: same-origin `?ret=` URL if given → `history.back()` when launched by the hub → `../cyber-arcade/`.
  The game never hard-codes any hub path. Trial runs per day are counted by the hub, not the game (`trialLeft` is display-only).
- These values are user-editable on the web; they only gate ads and trial caps. Real gating = Play Billing in the app build.

## 7. Ad placements (cyber-kit `createAds`; web = no-op)
| Placement | Type | Code | Rule |
|---|---|---|---|
| `gameover` | interstitial | `gameOverBreak()` from `resultMain()` / `resultMenu()` / `resultStages()` | only after a **death / endless end**, only when hub `ads` is on; never after a stage clear, never at launch; kit caps: 120 s grace, 180 s cooldown, every 2nd break |
| `revive` | rewarded | `doRevive()` → `ads.rewarded('revive')` | opt-in button on the result screen after a death, once per run; reward only when the SDK reports it |

## 8. Files
```
index.html        HUD (distance, mode, progress bar, timer/speed, chips, power-up timers, pause/mute, hint, gesture bar), screens
css/game.css      HUD + menus + stage grid + locker + portrait/landscape rules
js/config.js      PHYS, STAGES, ENDLESS, TRIAL, COLORS, TRAILS, SCORE (pure data)
js/sim.js         simulation, generation, autopilot (pure; Node tests import it)
js/rng.js         mulberry32 seeded RNG
js/runner.js      StickRunner rig + trails
js/world.js       CourseView, Skyline, SpeedLines, textures, shaders
js/audio.js       RunAudio
js/gesture.js     one-thumb gestures + keyboard
js/hub.js         hub params / entitlement / return-to-hub
js/strings.js     zh-HK / en table (+ STAGE_NAMES)
js/main.js        states, loop, events → FX, camera, HUD, saves, ads, QA API
vendor/cyber-kit  cyber-kit v0.2.1 (do not edit here; update from the kit repo)
privacy.html      bilingual privacy policy
tests/            sim.test.mjs (Node), smoke.py (Playwright)
```
QA hook `window.__nsr` (state object) with `api`: `state()`, `start(n)`, `endless()`, `menu()`, `pause()`, `resume()`,
`ff(sec)` (advance the live run synchronously with the autopilot), `autopilot(on)`, `warp(x)`, `kill(cause)`, `input(kind)`,
`give(chips)`, `simulateStage(n, opts)`, `simulateEndless(dist, opts)`. URL `?turbo=N` speeds up real-time play (headless checks).

## 9. Tests
- `node tests/sim.test.mjs` — 12 tests: monotonic stage table; autopilot clears all 12 stages in 60–120 s (63 → 100 s);
  every mechanic used, demo bot smashes; star rule; **difficulty curve** (sloppy bot with 0–0.42 s timing noise:
  deaths/km stages 1–3 ≈ 0–0.7 vs stages 9–12 ≈ 2.5–4.8); endless never ends, speed rises and saturates (10 → 21 m/s, 6 km
  without a death by the autopilot); bounded memory; trial stops at 800 m; determinism; jump physics; revive; scoring/cosmetics.
- `python tests/smoke.py [url] [shots_dir]` — 52 checks in headless Chrome (SwiftShader): 412×915 touch (tap, swipes, pause,
  stage clear, stars, next stage, endless past 2.5 km, revive once, retry + game-over ad break, locker buy/equip/insufficient
  chips, stage lock), 1280×800 keyboard (Enter, Space, ↓, →, P), language toggle + persistence, hub trial (stage-4 prompt,
  stage-3 clear → unlock, endless 800 m prompt in en + zh), Silver `ads=0` (no break), `cyber.entitlement` gold, demo
  autoplay/no saves/stage advance, **zero console errors**. Screenshots → `/workspace/shots/neon-stick-run/`.
- Headless SwiftShader runs ≈ 3 FPS — checks poll state and use `api.ff()`; phones run at 60 FPS with kit auto-quality.

## 10. Android packaging
Same recipe as the other CYBER games (Capacitor 8 + `@capacitor-community/admob` v8, AdMob test units until release, UMP consent).
Suggested app id `hk.fung2222.neonstickrun`, portrait. In the arcade app it is launched by the hub with the §8 params.

## 11. Known gaps / ideas
- Collision is 2D; z-depth is cosmetic. Drones are smash-only by dash (no stomp).
- Difficulty was tuned with bots, not humans — watch real players on stages 9–12 (billboards are the main killer).
- No haptics settings toggle yet (kit `Platform.haptic` is on by default). No daily challenge / ghost race yet.
- Ideas: ghost of your best run, daily seed, more cosmetics (head shapes), weather variants per stage, iOS/Android share card.
