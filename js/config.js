// NEON STICK RUN — tuning, stage table, cosmetics. Pure data (no DOM / THREE) so Node tests can import it.
export const GAME_ID = 'neon-stick-run';
export const STEP = 1 / 90;                 // fixed simulation step (s)

// Player physics (metres, seconds). Jump apex: tap ≈ 2.1 m, full hold ≈ 3.6 m, + double jump ≈ +1.65 m.
export const PHYS = {
  g: 40, jumpV: 13, holdG: 0.42, holdMax: 0.24, dblV: 11.5, dblHold: 0.14, maxFall: 32,
  halfW: 0.3, hStand: 1.75, hSlide: 0.8, mantle: 0.55,
  slideT: 0.6, dashT: 0.3, dashCd: 0.8, dashBoost: 0.6, coyote: 0.1, buffer: 0.13, fastFall: 22,
  wallLaunch: 10.5, wallJump: 13, grapRange: 7.2, grapRelease: 0.92, killY: -16,
  magnetT: 9, slowT: 6, slowScale: 0.6, magnetR: 6.5, chipR: 0.8, powR: 1.0, invuln: 1.1,
};

// Patterns: the procedural building blocks (js/sim.js PATTERNS). Each stage enables a subset; `feature` (the stage's
// signature move) is forced every 4th pattern so e.g. GRAPPLE LINE really is full of grapples.
// Stars: 1 = clear · 2 = clear with ≥ 50 % chips · 3 = ≥ 80 % chips and no revive.
export const STAR_CHIPS = [0.5, 0.8];
export const STAGES = [
  { id: 1,  len: 600,  v0: 9.0,  v1: 10.0, d: 0.08, theme: 0, feature: 'gap', pool: ['flat', 'gap', 'vault', 'step'] },
  { id: 2,  len: 680,  v0: 9.4,  v1: 10.4, d: 0.14, theme: 0, feature: 'pipe', pool: ['flat', 'gap', 'vault', 'pipe', 'step', 'pipe'] },
  { id: 3,  len: 760,  v0: 9.8,  v1: 10.8, d: 0.2,  theme: 3, feature: 'gapWide', pool: ['gap', 'gapWide', 'step', 'pipe', 'vault'] },
  { id: 4,  len: 820,  v0: 10.2, v1: 11.2, d: 0.26, theme: 3, feature: 'drone', pool: ['gap', 'gapWide', 'drone', 'pipe', 'vault', 'step'] },
  { id: 5,  len: 900,  v0: 10.6, v1: 11.8, d: 0.32, theme: 1, feature: 'laser', pool: ['gap', 'laser', 'drone', 'pipe', 'vault', 'gapWide', 'billboard'] },
  { id: 6,  len: 980,  v0: 11.0, v1: 12.2, d: 0.38, theme: 1, feature: 'wall', pool: ['gap', 'wall', 'laser', 'drone', 'pipe', 'gapWide', 'billboard', 'combo'] },
  { id: 7,  len: 1050, v0: 11.4, v1: 12.8, d: 0.44, theme: 2, feature: 'grapple', pool: ['gap', 'grapple', 'wall', 'laser', 'drone', 'billboard', 'combo'] },
  { id: 8,  len: 1120, v0: 11.8, v1: 13.2, d: 0.5,  theme: 2, feature: 'collapse', pool: ['collapse', 'gap', 'grapple', 'pipe', 'drone', 'vault', 'gapWide', 'billboard', 'combo'] },
  { id: 9,  len: 1200, v0: 12.2, v1: 13.8, d: 0.58, theme: 4, feature: 'billboard', pool: ['billboard', 'laserPulse', 'collapse', 'wall', 'drone', 'gapWide', 'pipe'] },
  { id: 10, len: 1300, v0: 12.6, v1: 14.4, d: 0.66, theme: 4, pool: ['gap', 'gapWide', 'wall', 'grapple', 'collapse', 'laser', 'laserPulse', 'drone', 'pipe', 'billboard', 'billboard', 'vault', 'combo'] },
  { id: 11, len: 1400, v0: 13.0, v1: 15.0, d: 0.74, theme: 5, pool: ['gapWide', 'wall', 'grapple', 'collapse', 'laserPulse', 'drone', 'droneLow', 'pipe', 'billboard', 'billboard', 'combo'] },
  { id: 12, len: 1500, v0: 13.4, v1: 15.6, d: 0.82, theme: 5, pool: ['gapWide', 'wall', 'grapple', 'collapse', 'laserPulse', 'laser', 'drone', 'droneLow', 'pipe', 'billboard', 'billboard', 'combo', 'combo'] },
];
export const ENDLESS_POOL = ['flat', 'gap', 'gapWide', 'step', 'vault', 'pipe', 'billboard', 'drone', 'droneLow', 'laser', 'laserPulse', 'wall', 'grapple', 'collapse', 'combo'];
// Endless: speed and density rise forever but saturate (cyber-kit endlessCurve) so a run can never be "beaten" nor become impossible.
export const ENDLESS = { v0: 10, vCap: 21, vTau: 10, vEvery: 300, d0: 0.18, dCap: 0.88, dTau: 8, dEvery: 350, milestone: 500 };
export const TRIAL = { stages: 3, endlessM: 800 };

// Cosmetics bought with data chips (saved in localStorage cyber.neon-stick-run.*)
export const COLORS = [
  { id: 'cyan',     hex: 0x00e5ff, price: 0,    zh: '電光青', en: 'VOLT CYAN' },
  { id: 'magenta',  hex: 0xff2bd6, price: 120,  zh: '霓虹粉', en: 'NEON PINK' },
  { id: 'lime',     hex: 0x7dff3a, price: 200,  zh: '毒液綠', en: 'TOXIC LIME' },
  { id: 'amber',    hex: 0xffa51f, price: 300,  zh: '琥珀橙', en: 'AMBER' },
  { id: 'violet',   hex: 0xa45cff, price: 420,  zh: '紫電', en: 'VIOLET ARC' },
  { id: 'crimson',  hex: 0xff3048, price: 560,  zh: '赤紅', en: 'CRIMSON' },
  { id: 'white',    hex: 0xe9f6ff, price: 750,  zh: '白熱', en: 'WHITE HOT' },
  { id: 'spectrum', hex: 0xffffff, price: 1200, zh: '光譜', en: 'SPECTRUM', cycle: true },
];
export const TRAILS = [
  { id: 'streak', price: 0,   zh: '光帶', en: 'STREAK' },
  { id: 'twin',   price: 150, zh: '雙腳光軌', en: 'TWIN RAILS' },
  { id: 'sparks', price: 280, zh: '火花', en: 'SPARKS' },
  { id: 'ghost',  price: 450, zh: '殘影', en: 'AFTERIMAGE' },
  { id: 'prism',  price: 800, zh: '稜鏡', en: 'PRISM' },
];

export const SCORE = { chip: 5, vault: 40, wall: 80, grapple: 80, smash: 120, metre: 1 };
