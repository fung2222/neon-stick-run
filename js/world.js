// Course + city view for NEON STICK RUN. Everything is world-fixed (the runner really moves along +x) and pooled:
// rooftops (instanced, procedural windows / wet roofs / neon rims), crumbling scaffolds, roof props, hazards,
// pickups, wall-run billboards, grapple anchors, finish gate, parallax skyline layers, holograms, hanging signs,
// street glow far below and camera-space speed lines. Theme colours come from cyber-kit's shared uniforms (U).
import * as THREE from 'three';
import { U, NOISE_GLSL } from 'cyber-kit';
import { platsNear, obsNear, droneY, laserOn, topOf } from './sim.js';

const ZH = '"Noto Sans CJK TC","Noto Sans TC","PingFang HK","Microsoft JhengHei","Noto Serif CJK TC",sans-serif';
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ROOF_D = 7, ROOF_Z = -1.6, STREET_Y = -42;
const glow = (c, k = 2.4) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });
const addGlow = (c, k = 2, o = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ------------------------------------------------------------------------------------------------ building shader
// geometry convention: unit box spans x∈[0,1], z∈[-0.5,0.5]; roofs have their top at local y=0 (box below), skyline at y=1.
function buildingMaterial({ dim = 1, fogMul = 1, roof = true }) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uC3: U.uC3, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uDim: { value: dim }, uFogMul: { value: fogMul }, uTopY: { value: roof ? 0 : 1 }, uWin: { value: roof ? 0.8 : 0.62 }, uLit: { value: roof ? 0.74 : 0.72 } },
    vertexShader: /* glsl */`
      attribute float aSeed; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vL = position;
        vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)); vSeed = aSeed;
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uDim, uFogMul, uFogDensity, uTopY, uWin, uLit; uniform vec3 uC1, uC2, uC3, uFogColor;
      varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vS; varying float vSeed;
      ${NOISE_GLSL}
      void main(){
        float dist = length(vW - cameraPosition);
        vec3 neon = vSeed < 0.33 ? uC1 : (vSeed < 0.66 ? uC2 : uC3);
        vec3 col = vec3(0.006, 0.005, 0.014);
        float topDist = (uTopY - vL.y) * vS.y;
        if (vN.y > 0.5) {
          vec2 p = vW.xz;
          vec2 g = abs(fract(p * 0.5) - 0.5); float tile = smoothstep(0.47, 0.5, max(g.x, g.y));
          float pud = smoothstep(0.42, 0.72, vnoise(p * 0.32 + vSeed * 17.0));
          col = vec3(0.022, 0.018, 0.04) + tile * 0.018;
          col += mix(uC1, uC2, 0.5 + 0.5 * sin(p.x * 0.09 + vSeed * 6.0)) * pud * 0.16 * (0.7 + 0.3 * sin(p.x * 1.7 + uTime * 0.6));
          col += vec3(0.8, 0.85, 1.0) * pud * 0.03 * step(0.97, fract(p.x * 0.31 + uTime * 0.05));
          float zf = (0.5 - vL.z) * vS.z, zb = (vL.z + 0.5) * vS.z, xf = vL.x * vS.x, xe = min(xf, vS.x - xf);
          ${roof ? 'col += uC1 * 1.3 * smoothstep(0.1, 0.0, zf) + neon * 0.7 * smoothstep(0.08, 0.0, zb); col += uC1 * 1.1 * smoothstep(0.1, 0.0, xe);' : 'col += neon * 1.2 * smoothstep(0.25, 0.0, min(min(zf, zb), xe)) * step(0.5, fract(vSeed * 13.0));'}
        } else if (vN.y > -0.5) {
          float u = abs(vN.x) > 0.5 ? vW.z : vW.x;
          vec2 wc = vec2(u / (0.85 * uWin), vW.y / (1.1 * uWin));
          float aa = clamp(1.6 - max(fwidth(wc.x), fwidth(wc.y)) * 2.2, 0.0, 1.0);
          vec2 cell = floor(wc), f = fract(wc);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.24, f.y) * step(f.y, 0.76);
          float h = hash12(cell + vSeed * 57.3);
          float lit = step(uLit, h);
          vec3 wcol = h > 0.95 ? uC1 : (h > 0.9 ? uC2 : vec3(1.0, 0.68, 0.38));
          vec3 wl = win * lit * wcol * (0.3 + h * 0.85) * (0.85 + 0.15 * sin(uTime * (2.0 + h * 7.0) + h * 30.0));
          col += mix(vec3(0.05, 0.035, 0.05), wl, aa) + win * (1.0 - lit) * vec3(0.012, 0.016, 0.035);
          ${roof ? 'col += uC1 * 1.2 * smoothstep(0.1, 0.0, topDist) + neon * 0.6 * smoothstep(0.06, 0.0, abs(topDist - 0.55));' : 'col += neon * 1.6 * smoothstep(0.2, 0.0, topDist) * step(0.4, fract(vSeed * 2.9));'}
          float edge = abs(vN.x) > 0.5 ? min((vL.z + 0.5) * vS.z, (0.5 - vL.z) * vS.z) : min(vL.x * vS.x, (1.0 - vL.x) * vS.x);
          col += neon * 1.8 * smoothstep(0.16, 0.0, edge) * step(0.55, fract(vSeed * 7.31));
          float band = vS.y * (0.2 + 0.5 * fract(vSeed * 3.7));
          col += neon * 1.5 * smoothstep(0.12, 0.0, abs(topDist - band)) * step(0.62, fract(vSeed * 5.13));
        }
        col *= uDim;
        float fo = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * uFogMul);
        gl_FragColor = vec4(mix(col, uFogColor, clamp(fo, 0.0, 1.0)), 1.0);
      }`,
  });
}

function scaffoldMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity, uC3: U.uC3 },
    vertexShader: /* glsl */`attribute float aWarn; varying vec3 vW; varying vec3 vN; varying float vWarn;
      void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vWarn = aWarn; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime, uFogDensity; uniform vec3 uFogColor, uC3; varying vec3 vW; varying vec3 vN; varying float vWarn;
      void main(){
        float dist = length(vW - cameraPosition);
        float stripe = step(0.5, fract((vW.x + vW.y) * 1.6));
        vec3 warnC = mix(vec3(2.4, 1.6, 0.1), vec3(2.6, 0.2, 0.15), vWarn);
        vec3 col = vN.y > 0.5 ? vec3(0.05, 0.04, 0.06) + warnC * 0.25 * step(0.86, fract(vW.x * 2.5)) + warnC * 0.25 * step(0.86, fract(vW.z * 2.5)) : mix(vec3(0.03), warnC * 0.8, stripe);
        col += vec3(2.6, 0.25, 0.2) * vWarn * (0.5 + 0.5 * sin(uTime * 30.0)) * 0.6;
        float fo = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
        gl_FragColor = vec4(mix(col, uFogColor, clamp(fo, 0.0, 1.0)), 1.0);
      }`,
  });
}

function holoMaterial(tex, color = new THREE.Color(1, 1, 1), strength = 2.0) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: U.uTime, tMap: { value: tex }, uColor: { value: color }, uK: { value: strength }, uFogDensity: U.uFogDensity, uFade: { value: 1 } },
    vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uTime, uK, uFogDensity, uFade; uniform sampler2D tMap; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      void main(){ vec2 uv = vUv; float gl = step(0.985, fract(sin(floor(uTime * 7.0) + vW.x) * 4375.5));
        uv.x += gl * (fract(sin(floor(uv.y * 24.0) + uTime) * 999.0) - 0.5) * 0.05;
        vec4 t = texture2D(tMap, uv); float scan = 0.72 + 0.28 * sin(uv.y * 260.0 - uTime * 5.0);
        float fl = 0.9 + 0.1 * sin(uTime * 31.0 + vW.x) * sin(uTime * 11.0);
        float d = length(vW - cameraPosition); float f = exp(-uFogDensity * uFogDensity * d * d * 0.35);
        gl_FragColor = vec4(t.rgb * uColor * t.a * scan * fl * uK * f * uFade, 1.0); }`,
  });
}

// ------------------------------------------------------------------------------------------------ textures
const SIGN_WORDS = ['茶餐廳', '大押', '跌打', '冰室', '電器', '涼茶', '金舖', '網吧', '旅館', '士多', '飛躍', '天台'];
const SIGN_COLS = ['#ff2bd6', '#00f0ff', '#fff35c', '#ff6a3a', '#7dff3a', '#b45cff'];
function signAtlas() {
  // 12 vertical signs in a 6×2 atlas (each 128×512)
  return canvasTex(768, 1024, (g) => {
    SIGN_WORDS.forEach((w, i) => {
      const x = (i % 6) * 128, y = Math.floor(i / 6) * 512, col = SIGN_COLS[i % SIGN_COLS.length];
      g.fillStyle = 'rgba(8,2,18,0.94)'; g.fillRect(x + 6, y + 6, 116, 500);
      g.strokeStyle = col; g.lineWidth = 6; g.shadowColor = col; g.shadowBlur = 14; g.strokeRect(x + 12, y + 12, 104, 488);
      const ch = [...w], fs = Math.min(100, 440 / ch.length); g.font = `900 ${fs}px ${ZH}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      ch.forEach((c, k) => { const cy = y + 30 + fs / 2 + k * fs; g.shadowBlur = 20; g.fillStyle = col; g.fillText(c, x + 64, cy); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(c, x + 64, cy); });
    });
  });
}
const BOARD_ADS = [['營業中', 'OPEN 24H'], ['賽博', 'CYBER'], ['極速', 'SPEED'], ['電子', 'ELECTRONICS'], ['九龍', 'KOWLOON'], ['數據', 'DATA BANK'], ['義體', 'AUGMENT'], ['霓虹', 'NEON']];
function boardTex(i) {
  const [zh, en] = BOARD_ADS[i % BOARD_ADS.length], col = SIGN_COLS[i % SIGN_COLS.length];
  return canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = 'rgba(6,2,16,0.96)'; g.fillRect(0, 0, W, H);
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, col + '55'); grd.addColorStop(1, '#00000000'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = col; g.lineWidth = 14; g.shadowColor = col; g.shadowBlur = 24; g.strokeRect(14, 14, W - 28, H - 28);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${zh.length > 2 ? 120 : 170}px ${ZH}`; g.fillStyle = '#fff'; g.shadowBlur = 30; g.fillText(zh, W / 2, H * 0.42);
    g.font = '900 52px Orbitron, sans-serif'; g.fillStyle = col; g.shadowBlur = 16; g.fillText(en, W / 2, H * 0.78);
  });
}
const WALL_ADS = [['飛簷走壁', 'WALL RUN'], ['勇往直前', 'NEVER STOP'], ['光速九龍', 'LIGHTSPEED'], ['夜之城', 'NIGHT CITY']];
function wallTex(i) {
  const [zh, en] = WALL_ADS[i % WALL_ADS.length];
  return canvasTex(1024, 512, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, 0); grd.addColorStop(0, 'rgba(0,240,255,0.35)'); grd.addColorStop(1, 'rgba(255,43,214,0.35)'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#00f0ff'; g.lineWidth = 10; g.strokeRect(10, 10, W - 20, H - 20);
    for (let y = 30; y < H; y += 12) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, W, 2); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff2bd6'; g.shadowBlur = 34; g.fillStyle = '#fff'; g.font = `900 170px ${ZH}`; g.fillText(zh, W / 2, H * 0.44);
    g.shadowColor = '#00f0ff'; g.fillStyle = '#9ff8ff'; g.font = '900 64px Orbitron, sans-serif'; g.fillText(en, W / 2, H * 0.82);
  });
}
const HOLO_ADS = [['酷跑', 'NEON RUN'], ['九龍', 'KOWLOON'], ['未來', 'FUTURE'], ['霓虹', 'NEON CITY'], ['數碼', 'DIGITAL'], ['自由', 'FREE RUN']];
function holoTex(i) {
  const [zh, en] = HOLO_ADS[i % HOLO_ADS.length];
  return canvasTex(1024, 384, (g, W, H) => {
    g.strokeStyle = i % 2 ? '#ff2bd6' : '#00f0ff'; g.lineWidth = 5; g.strokeRect(8, 8, W - 16, H - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = i % 2 ? '#00f0ff' : '#ff2bd6'; g.shadowBlur = 30; g.fillStyle = '#fff';
    g.font = `900 170px ${ZH}`; g.fillText(zh, W / 2, 158); g.fillStyle = i % 2 ? '#ff9af0' : '#7ff8ff'; g.font = '900 56px Orbitron, sans-serif'; g.fillText(en, W / 2, 300);
  });
}
function gateTex(zh, en, col) {
  return canvasTex(1024, 256, (g, W, H) => {
    g.fillStyle = 'rgba(5,1,15,0.6)'; g.fillRect(0, 0, W, H); g.strokeStyle = col; g.lineWidth = 8; g.shadowColor = col; g.shadowBlur = 20; g.strokeRect(8, 8, W - 16, H - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = `900 120px ${ZH}`; g.fillText(zh, W * 0.33, H / 2 + 4); g.font = '900 72px Orbitron, sans-serif'; g.fillStyle = col; g.fillText(en, W * 0.72, H / 2 + 4);
  });
}

// ------------------------------------------------------------------------------------------------ CourseView
export class CourseView {
  constructor(stage, scene) {
    this.scene = scene; this.stage = stage;
    this.group = new THREE.Group(); scene.add(this.group);
    // rooftops
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0.5, -0.5, 0);
    this.roofs = new THREE.InstancedMesh(box, buildingMaterial({ roof: true }), 48); this.roofs.frustumCulled = false; this.roofs.count = 0;
    this.roofSeed = new THREE.InstancedBufferAttribute(new Float32Array(48), 1); box.setAttribute('aSeed', this.roofSeed); this.roofSeed.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.roofs);
    const slab = new THREE.BoxGeometry(1, 1, 1); slab.translate(0.5, -0.5, 0);
    this.scaf = new THREE.InstancedMesh(slab, scaffoldMaterial(), 24); this.scaf.frustumCulled = false; this.scaf.count = 0;
    this.scafWarn = new THREE.InstancedBufferAttribute(new Float32Array(24), 1).setUsage(THREE.DynamicDrawUsage); slab.setAttribute('aWarn', this.scafWarn);
    this.group.add(this.scaf);
    this.cables = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 4), glow(0x5a4a80, 1), 96); this.cables.frustumCulled = false; this.cables.count = 0; this.group.add(this.cables);
    // props
    const metal = new THREE.MeshStandardMaterial({ color: 0x15102a, roughness: 0.45, metalness: 0.75 });
    this.ac = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), metal, 160); this.tank = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 18), metal, 60);
    this.mast = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.06, 1, 6), metal, 80); this.beacon = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), glow(0xff3b5c, 3), 80);
    this.rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.05, 0.05), glow(0xffffff, 1.0), 120); this.ring = new THREE.InstancedMesh(new THREE.TorusGeometry(0.86, 0.025, 6, 32), glow(0xff2bd6, 2.2), 60);
    for (const m of [this.ac, this.tank, this.mast, this.beacon, this.rail, this.ring]) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
    // hanging vertical signs on building fronts (atlas)
    const atlas = signAtlas();
    const sg = new THREE.PlaneGeometry(1.5, 6);
    this.signMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { tMap: { value: atlas }, uTime: U.uTime, uFogDensity: U.uFogDensity, uFogColor: U.uFogColor },
      vertexShader: /* glsl */`attribute float aCell; varying vec2 vUv; varying vec3 vW; varying float vC;
        void main(){ vC = aCell; vUv = vec2((mod(aCell, 6.0) + uv.x) / 6.0, (floor(aCell / 6.0) < 0.5 ? 0.5 : 0.0) + uv.y * 0.5);
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform sampler2D tMap; uniform float uTime, uFogDensity; uniform vec3 uFogColor; varying vec2 vUv; varying vec3 vW; varying float vC;
        void main(){ vec4 t = texture2D(tMap, vUv); float fl = sin(uTime * 23.0 + vC * 7.0) * sin(uTime * 6.1 + vC) > -0.9 ? 1.0 : 0.25;
          float d = length(vW - cameraPosition); float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
          gl_FragColor = vec4(mix(t.rgb * 2.2 * fl, uFogColor, clamp(f, 0.0, 1.0)), t.a); }` });
    this.signs = new THREE.InstancedMesh(sg, this.signMat, 40); this.signCell = new THREE.InstancedBufferAttribute(new Float32Array(40), 1).setUsage(THREE.DynamicDrawUsage);
    sg.setAttribute('aCell', this.signCell); this.signs.frustumCulled = false; this.signs.count = 0; this.group.add(this.signs);
    // pickups
    const chipGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 6); chipGeo.rotateX(Math.PI / 2);
    this.chipMat = glow(0xfff35c, 1.5);
    this.chips = new THREE.InstancedMesh(chipGeo, this.chipMat, 320); this.chips.frustumCulled = false; this.chips.count = 0; this.group.add(this.chips);
    this.chipCore = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.1), glow(0xffffff, 1.1), 320); this.chipCore.frustumCulled = false; this.chipCore.count = 0; this.group.add(this.chipCore);
    // templates for pooled objects
    this.pools = {}; this.live = new Map(); this.boardMats = BOARD_ADS.map((_, i) => new THREE.MeshBasicMaterial({ map: boardTex(i), toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    this.wallTexs = WALL_ADS.map((_, i) => wallTex(i));
    this.tmpl = this.makeTemplates();
    // finish / trial / best markers
    this.markers = new THREE.Group(); this.group.add(this.markers);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(); this.e = new THREE.Euler();
    this.decor = new Map(); this.run = null;
  }
  makeTemplates() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 0.35, metalness: 0.85 });
    const T = {};
    // pipe: horizontal duct across the path with glowing bands
    T.pipe = () => { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6, 14), dark); p.rotation.x = Math.PI / 2; g.add(p);
      for (const z of [-1.8, -0.6, 0.6, 1.8]) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 20), glow(0xff8a1f, 2.6)); b.position.z = z; g.add(b); }
      for (const z of [-2.9, 2.9]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2, 0.12), dark); s.position.set(0, 0.8, z); g.add(s); }
      const warn = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 6.02), glow(0xff3b5c, 1.6)); warn.position.y = -0.2; g.add(warn); return g; };
    // billboard hanging across the run line (smashable)
    T.board = () => { const g = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1, 3.2), [dark, dark, dark, dark, dark, dark]); g.add(m); g.userData.panel = m;
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1, 0.08), glow(0x00f0ff, 2.4)); fr.position.z = 1.62; g.add(fr); g.userData.frame = fr;
      for (const z of [-1.4, 1.4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 6, 4), dark); c.position.set(0, 3.5, z); g.add(c); } return g; };
    // laser fence
    T.laser = () => { const g = new THREE.Group(); g.userData.beams = [];
      for (const z of [-2.2, 2.2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), dark); post.position.set(0, 0.5, z); g.add(post); g.userData.posts = (g.userData.posts || []).concat(post);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xff1030, 3)); head.position.set(0, 1, z); g.add(head); g.userData.heads = (g.userData.heads || []).concat(head); }
      const bm = addGlow(0xff1a3a, 3, 1);
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), bm); b.position.set(0, 0.5, -1.6 + i * 0.8); g.add(b); g.userData.beams.push(b); }
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1), addGlow(0xff1a3a, 1, 0.12)); sheet.rotation.y = Math.PI / 2; sheet.position.y = 0.5; g.add(sheet); g.userData.sheet = sheet; g.userData.bm = bm; return g; };
    // security drone
    T.drone = () => { const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 12), dark); body.scale.set(1.25, 0.6, 1.25); g.add(body);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), glow(0xff2040, 3.5)); eye.position.set(-0.36, 0, 0); g.add(eye);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.03, 6, 32), glow(0xff2bd6, 2.5)); ring.rotation.x = Math.PI / 2; g.add(ring); g.userData.ring = ring;
      for (const [x, z] of [[0.45, 0.45], [-0.45, 0.45], [0.45, -0.45], [-0.45, -0.45]]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.015, 4, 16), glow(0x00f0ff, 2)); r.rotation.x = Math.PI / 2; r.position.set(x, 0.18, z); g.add(r); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 20, 1, true), addGlow(0xff2040, 1, 0.12)); cone.position.y = -1.4; g.add(cone); g.userData.cone = cone; return g; };
    // vault crate
    T.vault = () => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 2.4), dark); b.position.set(0.65, 0.5, 0); g.add(b);
      const t1 = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.05, 2.44), glow(0x00f0ff, 2.2)); t1.position.set(0.65, 1.0, 0); g.add(t1);
      for (let i = 0; i < 4; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.02), glow(0xfff35c, 1.4)); v.position.set(0.65, 0.25 + i * 0.16, 1.21); g.add(v); } return g; };
    // wall-run billboard wall
    T.wall = () => { const g = new THREE.Group(); const mat = holoMaterial(this.wallTexs[0], new THREE.Color(1, 1, 1), 1.6); const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); g.add(m); g.userData.panel = m;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.25), new THREE.MeshStandardMaterial({ color: 0x0c0818, roughness: 0.4, metalness: 0.8 })); back.position.z = -0.16; g.add(back); g.userData.back = back;
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.1), glow(0x00f0ff, 2.6)); g.add(rim); g.userData.rim = rim; const rim2 = rim.clone(); g.add(rim2); g.userData.rim2 = rim2;
      const legs = []; for (let i = 0; i < 2; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), dark); g.add(l); legs.push(l); } g.userData.legs = legs; return g; };
    // grapple anchor
    T.grap = () => { const g = new THREE.Group(); const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), glow(0xfff35c, 3)); g.add(core); g.userData.core = core;
      const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 36), glow(0x00f0ff, 2.6)); g.add(r1); g.userData.r1 = r1;
      const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.02, 6, 36), glow(0xff2bd6, 2.2)); g.add(r2); g.userData.r2 = r2;
      const range = new THREE.Mesh(new THREE.RingGeometry(6.9, 7.2, 64), addGlow(0x00f0ff, 1, 0.06)); g.add(range); g.userData.range = range;
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 30, 4), glow(0x6050a0, 1)); line.position.y = 15; g.add(line); return g; };
    // power-ups
    T.magnet = () => { const g = new THREE.Group(); const u = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20, Math.PI), glow(0xff2bd6, 2.8)); u.rotation.z = Math.PI; g.add(u);
      for (const x of [-0.3, 0.3]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.19), glow(0xffffff, 2)); tip.position.set(x, 0.06, 0); g.add(tip); } return this.powHalo(g, 0xff2bd6); };
    T.shield = () => { const g = new THREE.Group(); const h = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 6, 6), glow(0x00f0ff, 2.8)); g.add(h); const c = new THREE.Mesh(new THREE.CircleGeometry(0.26, 6), addGlow(0x00f0ff, 1.5, 0.5)); g.add(c); return this.powHalo(g, 0x00f0ff); };
    T.slow = () => { const g = new THREE.Group(); const a = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 4), glow(0xfff35c, 2.8)); a.position.y = 0.16; a.rotation.x = Math.PI; g.add(a); const b = a.clone(); b.position.y = -0.16; b.rotation.x = 0; g.add(b);
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.03, 6, 30), glow(0xfff35c, 2)); g.add(r); return this.powHalo(g, 0xfff35c); };
    return T;
  }
  powHalo(g, c) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), addGlow(c, 1, 0.18)); g.add(h); g.userData.spin = true; return g; }
  acquire(kind) { const pool = this.pools[kind] || (this.pools[kind] = []); const o = pool.pop() || this.tmpl[kind](); o.visible = true; this.group.add(o); return o; }
  release(kind, o) { o.visible = false; this.group.remove(o); (this.pools[kind] || (this.pools[kind] = [])).push(o); }

  setRun(run, { best = 0, trialM = 0 } = {}) {
    for (const [, e] of this.live) this.release(e.kind, e.o); this.live.clear(); this.decor.clear(); this.run = run;
    this.markers.clear();
    const w = run.w;
    if (run.mode === 'stage') this.addGate(w.len, '終點', 'FINISH', '#7dff3a');
    if (run.mode === 'endless' && trialM) this.addGate(trialM, '試玩終點', 'TRIAL END', '#ff3b5c');
    if (run.mode === 'endless' && best > 50) this.addGate(best, '最佳', `BEST ${Math.floor(best)}m`, '#fff35c', true);
  }
  addGate(x, zh, en, col, thin = false) {
    const g = new THREE.Group(); g.position.x = x; g.userData.gateX = x;
    const c = new THREE.Color(col);
    if (!thin) for (const z of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, 5.2, 0.22), glow(c, 2.4)); p.position.set(0, 2.6, z); g.add(p); }
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(thin ? 0.08 : 5.4, thin ? 7 : 0.08), addGlow(c, 2.4, 0.9)); plane.rotation.y = Math.PI / 2; plane.position.y = thin ? 3.5 : 5.2; g.add(plane);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), addGlow(c, 1, 0.07)); sheet.rotation.y = Math.PI / 2; sheet.position.y = 2.6; g.add(sheet);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), holoMaterial(gateTex(zh, en, col), new THREE.Color(1, 1, 1), 1.8)); banner.position.set(0, thin ? 7.4 : 6.3, 0); g.add(banner);
    this.markers.add(g);
  }
  // decorative props for a platform (deterministic per id)
  decorFor(p) {
    let d = this.decor.get(p.id); if (d) return d;
    d = []; const len = p.x1 - p.x0, r = (k) => hash(p.id * 13.7 + k);
    if (p.kind === 'roof' && len > 4) {
      const nAc = Math.min(5, Math.floor(len / 9)); for (let i = 0; i < nAc; i++) d.push({ t: 'ac', x: p.x0 + (i + 0.5) * len / nAc + (r(i) - 0.5) * 2, z: -3.4 - r(i + 9) * 1.2 });
      if (len > 10 && r(40) < 0.65) d.push({ t: 'tank', x: p.x0 + 2 + r(41) * (len - 4), z: -4.0 });
      if (r(50) < 0.7) d.push({ t: 'mast', x: p.x0 + 1 + r(51) * (len - 2), z: -4.4, h: 3 + r(52) * 5 });
      if (len > 6) d.push({ t: 'rail', x0: p.x0 + 0.3, x1: p.x1 - 0.3, z: -4.9 });
      const nS = Math.min(3, Math.floor(len / 14) + (r(60) < 0.5 ? 1 : 0)); for (let i = 0; i < nS; i++) d.push({ t: 'sign', x: p.x0 + (i + 0.5) * len / Math.max(1, nS), cell: Math.floor(r(61 + i) * 12), dy: 2.6 + r(70 + i) * 5 });
    }
    this.decor.set(p.id, d); if (this.decor.size > 300) this.decor.delete(this.decor.keys().next().value);
    return d;
  }
  /** sync meshes with the sim each frame */
  update(run, camX, t, dt) {
    const w = run.w, x0 = camX - 26, x1 = camX + 120, m4 = this.m4, q = this.q, v = this.v, s = this.s;
    // ---- rooftops / scaffolds / props
    let nR = 0, nS = 0, nC = 0, nAc = 0, nT = 0, nM = 0, nRail = 0, nSign = 0;
    const plats = platsNear(w, x0, x1, []);
    for (const p of plats) {
      const top = topOf(run, p);
      if (p.kind === 'collapse') {
        if (nS >= 24) continue;
        const shake = run.m.collapse.has(p.id) ? Math.sin(t * 60 + p.id) * 0.04 : 0;
        m4.compose(v.set(p.x0, top + shake, ROOF_Z + 1.6), q.identity(), s.set(p.x1 - p.x0, 0.4, 3.2)); this.scaf.setMatrixAt(nS, m4);
        const t0 = run.m.collapse.get(p.id); this.scafWarn.array[nS] = t0 === undefined ? 0 : Math.min(1, (run.t - t0) / 0.3); nS++;
        for (const cx of [p.x0 + 0.3, p.x1 - 0.3]) for (const cz of [-1.4, 1.4]) if (nC < 96) { m4.compose(v.set(cx, top + 6, cz), q.identity(), s.set(1, 12, 1)); this.cables.setMatrixAt(nC++, m4); }
        continue;
      }
      if (nR >= 48) continue;
      m4.compose(v.set(p.x0, top, ROOF_Z), q.identity(), s.set(p.x1 - p.x0, top - STREET_Y, ROOF_D)); this.roofs.setMatrixAt(nR, m4); this.roofSeed.array[nR] = hash(p.id); nR++;
      for (const d of this.decorFor(p)) {
        if (d.t === 'ac' && nAc < 160) { m4.compose(v.set(d.x, top + 0.35, d.z), q.identity(), s.set(1, 1, 1)); this.ac.setMatrixAt(nAc++, m4); }
        else if (d.t === 'tank' && nT < 60) { m4.compose(v.set(d.x, top + 2.0, d.z), q.identity(), s.set(1, 1, 1)); this.tank.setMatrixAt(nT, m4); m4.compose(v.set(d.x, top + 2.6, d.z), q.setFromEuler(this.e.set(Math.PI / 2, 0, 0)), s.set(1, 1, 1)); this.ring.setMatrixAt(nT, m4); nT++; }
        else if (d.t === 'mast' && nM < 80) { m4.compose(v.set(d.x, top + d.h / 2, d.z), q.identity(), s.set(1, d.h, 1)); this.mast.setMatrixAt(nM, m4); m4.compose(v.set(d.x, top + d.h + 0.05, d.z), q.identity(), s.set(1, 1, 1)); this.beacon.setMatrixAt(nM, m4); nM++; }
        else if (d.t === 'rail' && nRail < 120) { m4.compose(v.set((d.x0 + d.x1) / 2, top + 1.0, d.z), q.identity(), s.set(d.x1 - d.x0, 1, 1)); this.rail.setMatrixAt(nRail++, m4); }
        else if (d.t === 'sign' && nSign < 40) { m4.compose(v.set(d.x, top - d.dy - 3, ROOF_Z + ROOF_D / 2 + 0.9), q.setFromEuler(this.e.set(0, 0.35, 0)), s.set(1, 1, 1)); this.signs.setMatrixAt(nSign, m4); this.signCell.array[nSign] = d.cell; nSign++; }
      }
    }
    this.roofs.count = nR; this.roofs.instanceMatrix.needsUpdate = true; this.roofSeed.needsUpdate = true;
    this.scaf.count = nS; this.scaf.instanceMatrix.needsUpdate = true; this.scafWarn.needsUpdate = true; this.cables.count = nC; this.cables.instanceMatrix.needsUpdate = true;
    this.ac.count = nAc; this.tank.count = nT; this.ring.count = nT; this.mast.count = nM; this.beacon.count = nM; this.rail.count = nRail; this.signs.count = nSign; this.signCell.needsUpdate = true;
    for (const m of [this.ac, this.tank, this.ring, this.mast, this.beacon, this.rail, this.signs]) m.instanceMatrix.needsUpdate = true;
    this.beacon.material.color.setRGB(Math.sin(t * 4) > 0 ? 3 : 0.4, 0.3, 0.4);
    // ---- pooled hazards / walls / anchors / power-ups
    const seen = new Set();
    const want = (key, kind, init) => { seen.add(key); let e = this.live.get(key); if (!e) { e = { kind, o: this.acquire(kind) }; this.live.set(key, e); init && init(e.o); } return e.o; };
    for (const o of obsNear(w, x0, x1, [])) {
      const smashed = run.m.smashed.has(o.id);
      if (smashed && o.type !== 'vault') continue;
      if (o.type === 'pipe') { const g = want(o.id, 'pipe'); g.position.set(o.x + o.w / 2, (o.y0 + o.y1) / 2, 0); }
      else if (o.type === 'vault') { const g = want(o.id, 'vault'); g.position.set(o.x, o.y0, 0); }
      else if (o.type === 'board') { const g = want(o.id, 'board'); const h = o.y1 - o.y0; g.position.set(o.x + o.w / 2, o.y0, 0); g.userData.panel.scale.y = h; g.userData.panel.position.y = h / 2; g.userData.frame.scale.y = h; g.userData.frame.position.y = h / 2;
        const mat = this.boardMats[o.label % this.boardMats.length]; const pm = g.userData.panel.material; if (pm[4] !== mat) { pm[4] = mat; pm[1] = mat; } g.children.forEach((c, i) => { if (i >= 2) c.position.y = h + 3; }); }
      else if (o.type === 'laser') { const g = want(o.id, 'laser'); const h = o.y1 - o.y0; g.position.set(o.x, o.y0, 0);
        for (const b of g.userData.beams) { b.scale.y = h; b.position.y = h / 2; } for (const p of g.userData.posts) { p.scale.y = h; p.position.y = h / 2; } for (const hd of g.userData.heads) hd.position.y = h;
        g.userData.sheet.scale.y = h; g.userData.sheet.position.y = h / 2;
        const on = laserOn(o, run.t); const fl = on ? 0.75 + 0.25 * Math.sin(t * 50 + o.id) : 0.06; g.userData.bm.color.setRGB(3 * fl, 0.25 * fl, 0.5 * fl); g.userData.sheet.material.opacity = on ? 0.12 : 0.0; }
      else if (o.type === 'drone') { const g = want(o.id, 'drone'); g.position.set(o.x, droneY(o, run.t), 0); g.userData.ring.rotation.z = t * 6; g.rotation.y = Math.sin(t * 1.3 + o.id) * 0.4; g.userData.cone.material.opacity = 0.08 + 0.05 * Math.sin(t * 9 + o.id); }
    }
    for (const z of w.walls) {
      if (z.x1 < x0 || z.x0 > x1) continue;
      const g = want('w' + z.id, 'wall', (g) => { g.userData.panel.material.uniforms.tMap.value = this.wallTexs[z.id % this.wallTexs.length]; });
      const L = z.x1 - z.x0 + 1.6, H = 5.2, cx = (z.x0 + z.x1) / 2, cy = z.y + 1.4;
      g.position.set(cx, cy, -1.45); g.userData.panel.scale.set(L, H, 1); g.userData.back.scale.set(L + 0.2, H + 0.2, 1);
      g.userData.rim.scale.x = L + 0.3; g.userData.rim.position.y = H / 2 + 0.05; g.userData.rim2.scale.x = L + 0.3; g.userData.rim2.position.y = -H / 2 - 0.05;
      g.userData.legs.forEach((l, i) => { const hh = cy - H / 2 - STREET_Y; l.scale.y = hh; l.position.set((i ? 1 : -1) * L * 0.36, -H / 2 - hh / 2, -0.4); });
    }
    const p = run.p;
    for (const a of w.graps) {
      if (a.x < x0 || a.x > x1) continue;
      const g = want('g' + a.id, 'grap'); g.position.set(a.x, a.y, 0); g.userData.core.rotation.set(t * 1.5, t * 2, 0); g.userData.r1.rotation.set(t * 0.9, t * 0.4, 0); g.userData.r2.rotation.set(-t * 0.6, t * 0.8, 0);
      const dx = a.x - p.x, dy = a.y - (p.y + 1.9), inR = dx > -0.6 && dx < 6.5 && dy > 1.2 && dy < 7 && Math.hypot(dx, dy) < 7.2 && p.mode === 'air';
      g.userData.range.material.opacity += ((inR ? 0.5 : 0.06) - g.userData.range.material.opacity) * Math.min(1, dt * 10); g.userData.range.lookAt(g.position.x, g.position.y, 50);
    }
    // power-ups + chips
    let nChip = 0; const base = this.chipMat.color;
    for (const k of w.picks) {
      if (k.x < x0) continue; if (k.x > x1) break;
      if (run.m.taken.has(k.id)) continue;
      if (k.type === 'chip') { if (nChip >= 320) continue; const bob = Math.sin(t * 3 + k.x) * 0.06; m4.compose(v.set(k.x, k.y + bob, 0), q.setFromEuler(this.e.set(0, t * 2.4 + k.x, 0)), s.set(1, 1, 1)); this.chips.setMatrixAt(nChip, m4); this.chipCore.setMatrixAt(nChip, m4); nChip++; }
      else { const g = want('k' + k.id, k.type); g.position.set(k.x, k.y + Math.sin(t * 2.5 + k.x) * 0.12, 0); g.rotation.y = t * 1.8; }
    }
    this.chips.count = nChip; this.chipCore.count = nChip; this.chips.instanceMatrix.needsUpdate = true; this.chipCore.instanceMatrix.needsUpdate = true;
    base.copy(U.uC3.value).lerp(new THREE.Color(1, 0.95, 0.4), 0.5).multiplyScalar(2.6);
    for (const [key, e] of this.live) if (!seen.has(key)) { this.release(e.kind, e.o); this.live.delete(key); }
    // gates face camera-ish (fixed) — pulse
    for (const g of this.markers.children) g.visible = Math.abs(g.userData.gateX - camX) < 140;
  }
}

// ------------------------------------------------------------------------------------------------ Skyline + atmosphere
export class Skyline {
  constructor(stage, scene) {
    this.scene = scene; this.layers = [];
    const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0.5, 0.5, 0);
    const defs = [
      { n: 40, span: 300, z: [-24, -38], w: [6, 12], h: [-14, 6], dim: 0.55, fog: 1.6 },
      { n: 52, span: 440, z: [-55, -90], w: [8, 16], h: [4, 40], dim: 0.55, fog: 1.1 },
      { n: 44, span: 700, z: [-120, -190], w: [14, 28], h: [30, 110], dim: 0.55, fog: 0.3 },
    ];
    let seed = 1;
    for (const d of defs) {
      const geo = box.clone(); const seeds = new Float32Array(d.n); const mesh = new THREE.InstancedMesh(geo, buildingMaterial({ roof: false, dim: d.dim, fogMul: d.fog }), d.n);
      const items = [];
      for (let i = 0; i < d.n; i++) { const r = (k) => hash(seed++ * 7.3 + k); const w = d.w[0] + r(1) * (d.w[1] - d.w[0]);
        items.push({ x: (i + r(2) * 0.6) * d.span / d.n, z: d.z[0] + r(3) * (d.z[1] - d.z[0]), w, dd: w * (0.6 + r(4) * 0.8), h: d.h[0] + r(5) * (d.h[1] - d.h[0]) }); seeds[i] = r(6); }
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1)); mesh.frustumCulled = false; scene.add(mesh);
      this.layers.push({ ...d, mesh, items });
    }
    // holograms (mid layer) + big vertical signs (near layer)
    this.holos = [];
    for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(26, 9.75), holoMaterial(holoTex(i), new THREE.Color(1, 1, 1), 1.4)); scene.add(m); this.holos.push({ m, x: i * 95 + 30, y: 22 + (i % 3) * 9, z: -48 - (i % 2) * 14, span: 570 }); }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(9, 0.25, 8, 80), addGlow(0x00f0ff, 2, 0.7)); scene.add(this.ring); this.ring2 = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.15, 8, 60), addGlow(0xff2bd6, 2, 0.7)); scene.add(this.ring2);
    // street far below: lanes of moving lights
    this.street = new THREE.Mesh(new THREE.PlaneGeometry(600, 160), new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uC1: U.uC1, uC2: U.uC2, uFogColor: U.uFogColor, uFogDensity: U.uFogDensity },
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`uniform float uTime, uFogDensity; uniform vec3 uC1, uC2, uFogColor; varying vec3 vW;
        ${NOISE_GLSL}
        void main(){ vec3 col = vec3(0.01, 0.008, 0.02);
          float lane = fract(vW.z / 6.0); float inLane = smoothstep(0.08, 0.0, abs(lane - 0.5));
          float dir = mod(floor(vW.z / 6.0), 2.0) * 2.0 - 1.0; float seg = vW.x - dir * uTime * 18.0;
          float car = step(0.82, hash12(vec2(floor(seg / 7.0), floor(vW.z / 6.0)))) * smoothstep(0.5, 0.0, abs(fract(seg / 7.0) - 0.5) - 0.2);
          col += inLane * car * mix(vec3(2.0, 0.3, 0.3), vec3(2.0, 1.9, 1.6), step(0.0, dir)) * 0.9;
          col += uC2 * 0.08 * smoothstep(0.04, 0.0, abs(fract(vW.z / 12.0) - 0.5) - 0.45) + uC1 * 0.05 * vnoise(vW.xz * 0.05);
          float d = length(vW - cameraPosition); float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d * 0.55);
          gl_FragColor = vec4(mix(col, uFogColor, clamp(f, 0.0, 1.0)), 1.0); }` }));
    this.street.rotation.x = -Math.PI / 2; this.street.position.set(0, STREET_Y, -40); scene.add(this.street);
    // dust motes that wrap around the camera (world-fixed so they parallax)
    const N = 380, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) pos.set([Math.random() * 80, -6 + Math.random() * 20, -12 + Math.random() * 18], i * 3);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uCam: { value: 0 }, uC1: U.uC1, uC2: U.uC2, uPR: { value: Math.min(2, devicePixelRatio || 1) } },
      vertexShader: /* glsl */`uniform float uTime, uCam, uPR; varying float vS; void main(){ vec3 p = position; p.x = uCam - 20.0 + mod(p.x - uCam, 80.0); p.y += sin(uTime * 0.5 + position.x) * 0.4;
        vS = fract(position.x * 7.13); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (2.0 + vS * 3.0) * uPR * 10.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uC1, uC2; varying float vS; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * 0.5; gl_FragColor = vec4(mix(uC1, uC2, step(0.5, vS)) * a, 1.0); }` }));
    this.dust.frustumCulled = false; scene.add(this.dust);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  update(camX, t) {
    const { m4, q, v, s } = this;
    for (const L of this.layers) {
      L.items.forEach((b, i) => { const x = b.x + L.span * Math.round((camX + L.span * 0.25 - b.x) / L.span); m4.compose(v.set(x - b.w / 2, -40, b.z), q.identity(), s.set(b.w, b.h + 40, b.dd)); L.mesh.setMatrixAt(i, m4); });
      L.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const h of this.holos) { h.m.position.set(h.x + h.span * Math.round((camX + 60 - h.x) / h.span), h.y + Math.sin(t * 0.4 + h.x) * 0.6, h.z); }
    const rx = camX + 70 - ((camX + 70) % 260) + 120; this.ring.position.set(rx, 34, -70); this.ring.rotation.set(t * 0.3, t * 0.5, 0); this.ring2.position.copy(this.ring.position); this.ring2.rotation.set(-t * 0.4, t * 0.2, t * 0.3);
    this.street.position.x = camX; this.dust.material.uniforms.uCam.value = camX;
  }
}

// camera-space speed streaks
export class SpeedLines {
  constructor(camera) {
    const N = 46, pos = new Float32Array(N * 6), seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const y = (Math.random() - 0.5) * 2.6, z = -2.5 - Math.random() * 2, x = Math.random() * 6 - 3, l = 0.4 + Math.random() * 1.2; pos.set([x, y, z, x + l, y, z], i * 6); seed[i * 2] = seed[i * 2 + 1] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.uTime, uK: { value: 0 }, uC1: U.uC1, uAspect: { value: 1 } },
      vertexShader: /* glsl */`attribute float aSeed; uniform float uTime, uK, uAspect; varying float vA; void main(){ vec3 p = position; float sp = 6.0 + aSeed * 8.0;
        p.x = mod(p.x + 3.0 - uTime * sp, 6.0) - 3.0; p.x *= max(1.0, uAspect); vA = uK * (0.15 + aSeed * 0.4) * smoothstep(0.35, 0.9, abs(p.y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uC1; varying float vA; void main(){ gl_FragColor = vec4(mix(vec3(1.0), uC1, 0.5) * vA, 1.0); }` });
    this.lines = new THREE.LineSegments(g, this.mat); this.lines.frustumCulled = false; this.lines.renderOrder = 10; camera.add(this.lines);
  }
  set(k, aspect) { this.mat.uniforms.uK.value += (k - this.mat.uniforms.uK.value) * 0.15; this.mat.uniforms.uAspect.value = aspect; }
}
