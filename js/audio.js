// NEON STICK RUN sounds — all synthesised live (cyber-kit SynthAudio + 'drive' synthwave music). No audio files.
import { SynthAudio, mtof } from 'cyber-kit';
export class RunAudio extends SynthAudio {
  constructor(store) { super({ store, music: { bpm: 112, bpmPerLevel: 2, bpmMax: 128, roots: [45, 41, 48, 43], chords: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 3, 7]], kick: 'four', hats: true, bass: 'eighths', arp: true, pad: 0.024, gain: 0.38 } }); }
  jump() { this.osc({ type: 'sine', f: 320, f2: 720, dur: 0.11, vol: 0.06 }); this.noiseHit({ dur: 0.06, vol: 0.025, type: 'highpass', f: 4000 }); }
  dbl() { this.osc({ type: 'triangle', f: 520, f2: 1240, dur: 0.16, vol: 0.06, send: 0.3 }); this.whoosh(0.04); }
  land(k = 1) { this.noiseHit({ dur: 0.08 + k * 0.05, vol: 0.05 + k * 0.05, type: 'lowpass', f: 900, f2: 120 }); this.osc({ type: 'sine', f: 110, f2: 50, dur: 0.1, vol: 0.06 * k }); }
  slide() { this.noiseHit({ dur: 0.35, vol: 0.05, type: 'bandpass', f: 1400, f2: 500, q: 0.8, a: 0.02 }); }
  dash() { this.noiseHit({ dur: 0.22, vol: 0.08, type: 'highpass', f: 2200, f2: 7000, a: 0.01 }); this.osc({ type: 'sawtooth', f: 160, f2: 420, dur: 0.18, vol: 0.04, lp: 2400 }); }
  smash() { this.noiseHit({ dur: 0.4, vol: 0.18, type: 'lowpass', f: 4000, f2: 150, a: 0.002 }); this.osc({ type: 'square', f: 180, f2: 40, dur: 0.3, vol: 0.08, lp: 1500 }); [0, 7, 12].forEach((x, i) => this.osc({ type: 'triangle', f: mtof(79 + x), t: 0.03 + i * 0.04, dur: 0.12, vol: 0.04, send: 0.4 })); }
  chip(n = 0) { this.osc({ type: 'square', f: mtof(84 + (n % 5) * 2), dur: 0.05, vol: 0.03, lp: 6000, send: 0.25 }); }
  pow() { [0, 4, 7, 12].forEach((x, i) => this.osc({ type: 'triangle', f: mtof(72 + x), t: i * 0.05, dur: 0.16, vol: 0.06, send: 0.4 })); }
  shieldBreak() { this.osc({ type: 'sawtooth', f: 880, f2: 220, dur: 0.3, vol: 0.07, lp: 3000 }); this.noiseHit({ dur: 0.25, vol: 0.1, type: 'bandpass', f: 2500, f2: 800 }); }
  wall() { this.osc({ type: 'sine', f: 240, f2: 260, dur: 0.4, vol: 0.04, send: 0.3 }); this.noiseHit({ dur: 0.3, vol: 0.03, type: 'bandpass', f: 3000, f2: 2000 }); }
  grap() { this.osc({ type: 'square', f: 1600, f2: 400, dur: 0.12, vol: 0.04, lp: 4000 }); this.osc({ type: 'sine', f: 90, dur: 0.3, vol: 0.06 }); }
  release() { this.whoosh(0.07); this.osc({ type: 'triangle', f: 600, f2: 1400, dur: 0.18, vol: 0.05, send: 0.3 }); }
  vault() { this.osc({ type: 'triangle', f: 700, f2: 1000, dur: 0.08, vol: 0.04 }); this.noiseHit({ dur: 0.08, vol: 0.03, f: 5000 }); }
  crumble() { this.noiseHit({ dur: 0.6, vol: 0.08, type: 'lowpass', f: 600, f2: 80, a: 0.05 }); }
  die() { this.osc({ type: 'sawtooth', f: 300, f2: 40, dur: 0.8, vol: 0.12, lp: 1800 }); this.noiseHit({ dur: 0.7, vol: 0.14, type: 'lowpass', f: 2500, f2: 80, a: 0.003 }); }
  clear() { [0, 4, 7, 12, 16, 19].forEach((x, i) => this.osc({ type: 'square', f: mtof(67 + x), t: i * 0.08, dur: 0.3, vol: 0.05, lp: 4200, send: 0.45 })); }
  star(i) { this.osc({ type: 'triangle', f: mtof(81 + i * 4), dur: 0.35, vol: 0.08, send: 0.5 }); }
  milestone() { [0, 7, 12, 19].forEach((x, i) => this.osc({ type: 'square', f: mtof(69 + x), t: i * 0.07, dur: 0.25, vol: 0.05, lp: 4500, send: 0.4 })); }
}
