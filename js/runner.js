// StickRunner — procedural neon stick rig: 2D forward kinematics on the run plane, blended pose targets
// (run cycle, jump tuck, flip, slide, dash/air-kick, vault, wall-run tilt, grapple hang, tumble), landing squash,
// glowing limbs (cylinders + joint orbs), visor, light trails (ribbon / twin / prism), sparks hook and afterimages.
import * as THREE from 'three';

const LEN = { torso: 0.62, neck: 0.12, head: 0.2, ua: 0.36, fa: 0.34, th: 0.46, sh: 0.47 };
const KEYS = ['hipY', 'lean', 'head', 'shF', 'elF', 'shB', 'elB', 'hipF', 'knF', 'hipB', 'knB'];
const POSE = {
  jumpUp:  { hipY: 0.98, lean: 0.12, head: -0.1, shF: 2.5, elF: 0.6, shB: 1.9, elB: 0.9, hipF: 1.35, knF: -1.75, hipB: 0.35, knB: -1.5 },
  jumpDown:{ hipY: 0.98, lean: 0.05, head: 0.05, shF: 1.7, elF: 0.4, shB: -1.2, elB: 0.6, hipF: 0.75, knF: -0.55, hipB: -0.35, knB: -0.7 },
  tuck:    { hipY: 1.05, lean: 0.4, head: -0.3, shF: 1.3, elF: 1.8, shB: 1.1, elB: 1.9, hipF: 2.1, knF: -2.4, hipB: 1.9, knB: -2.3 },
  slide:   { hipY: 0.36, lean: -1.0, head: 0.55, shF: 0.95, elF: 0.35, shB: -0.7, elB: 0.4, hipF: 1.5, knF: -0.08, hipB: 0.75, knB: -1.85 },
  dash:    { hipY: 0.82, lean: 0.85, head: -0.6, shF: -1.1, elF: 0.5, shB: -1.3, elB: 0.4, hipF: 1.0, knF: -1.1, hipB: -0.8, knB: -0.7 },
  airKick: { hipY: 0.98, lean: -0.15, head: 0.1, shF: 1.15, elF: 0.2, shB: -1.25, elB: 0.5, hipF: 1.6, knF: -0.02, hipB: -0.25, knB: -1.6 },
  vault:   { hipY: 1.02, lean: 0.55, head: -0.25, shF: 0.25, elF: 0.0, shB: -0.9, elB: 0.6, hipF: 1.55, knF: -0.5, hipB: 1.25, knB: -0.8 },
  hang:    { hipY: 0.95, lean: 0.0, head: 0.25, shF: 3.05, elF: 0.05, shB: 2.75, elB: 0.25, hipF: 0.55, knF: -0.7, hipB: -0.15, knB: -0.5 },
  dead:    { hipY: 0.5, lean: -1.2, head: 0.6, shF: 2.6, elF: 0.3, shB: 3.0, elB: 0.2, hipF: 1.2, knF: -0.3, hipB: 1.6, knB: -0.6 },
  idle:    { hipY: 0.96, lean: 0.05, head: 0.0, shF: 0.15, elF: 0.3, shB: -0.1, elB: 0.25, hipF: 0.12, knF: -0.08, hipB: -0.1, knB: -0.05 },
};
function runPose(ph, out, fast = 0) {
  const s = Math.sin(ph), c = Math.cos(ph), s2 = Math.sin(ph + Math.PI), c2 = Math.cos(ph + Math.PI);
  out.hipY = 0.9 + 0.06 * Math.abs(c) - fast * 0.04; out.lean = 0.28 + fast * 0.12; out.head = -0.2;
  out.hipF = 0.2 + 0.85 * s; out.knF = -0.25 - 1.25 * Math.max(0, Math.sin(ph - 1.2)) - 0.35 * Math.max(0, -c);
  out.hipB = 0.2 + 0.85 * s2; out.knB = -0.25 - 1.25 * Math.max(0, Math.sin(ph + Math.PI - 1.2)) - 0.35 * Math.max(0, -c2);
  out.shF = -0.95 * s + 0.15; out.elF = 1.55 + 0.25 * s; out.shB = -0.95 * s2 + 0.15; out.elB = 1.55 + 0.25 * s2;
  return out;
}
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------------------ trails
class Ribbon {
  constructor(scene, n = 22, width = 0.16, life = 0.26) {
    this.n = n; this.width = width; this.life = life; this.pts = []; this.prism = false;
    const pos = new Float32Array(n * 2 * 3), ta = new Float32Array(n * 2), idx = [];
    for (let i = 0; i < n; i++) { ta[i * 2] = ta[i * 2 + 1] = i / (n - 1); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aT', new THREE.BufferAttribute(ta, 1)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0x00e5ff) }, uPrism: { value: 0 }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */`attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`uniform vec3 uColor; uniform float uPrism, uTime, uAlpha; varying float vT;
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float a = pow(1.0 - vT, 1.6) * uAlpha; vec3 c = mix(uColor, hue(vT * 1.3 - uTime * 0.8), uPrism);
          gl_FragColor = vec4(c * a * 1.8 + vec3(1.0) * pow(1.0 - vT, 8.0) * 0.6 * uAlpha, 1.0); }` });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  reset() { this.pts.length = 0; }
  push(p, t) { this.pts.unshift({ x: p.x, y: p.y, z: p.z, t }); while (this.pts.length > this.n) this.pts.pop(); }
  update(t) {
    const pos = this.mesh.geometry.attributes.position.array, pts = this.pts;
    while (pts.length > 2 && t - pts[pts.length - 1].t > this.life) pts.pop();
    for (let i = 0; i < this.n; i++) {
      const a = pts[Math.min(i, pts.length - 1)] || { x: 0, y: -999, z: 0 }, b = pts[Math.min(i + 1, pts.length - 1)] || a;
      let dx = a.x - b.x, dy = a.y - b.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const w = this.width * (1 - i / this.n);
      pos.set([a.x - dy * w, a.y + dx * w, a.z, a.x + dy * w, a.y - dx * w, a.z], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mat.uniforms.uTime.value = t;
  }
  set visible(v) { this.mesh.visible = v; }
}

export class StickRunner {
  constructor(scene, color = 0x00e5ff) {
    this.scene = scene; this.color = new THREE.Color(color); this.cycle = false;
    this.root = new THREE.Group(); scene.add(this.root);
    this.pivot = new THREE.Group(); this.root.add(this.pivot);
    this.rig = new THREE.Group(); this.pivot.add(this.rig);
    const mk = (k) => new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(k), toneMapped: false });
    this.matF = mk(2.4); this.matB = mk(1.15); this.matCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), toneMapped: false });
    const cyl = new THREE.CylinderGeometry(0.055, 0.055, 1, 8, 1); cyl.translate(0, 0.5, 0);
    const orb = new THREE.SphereGeometry(0.075, 10, 8);
    this.limbs = {}; this.orbs = [];
    const limb = (n, mat, r = 1) => { const m = new THREE.Mesh(cyl, mat); m.userData.r = r; this.rig.add(m); this.limbs[n] = m; };
    limb('torso', this.matF, 1.35); limb('neck', this.matF, 0.9);
    for (const side of ['F', 'B']) { const mat = side === 'F' ? this.matF : this.matB; limb('ua' + side, mat); limb('fa' + side, mat); limb('th' + side, mat, 1.15); limb('sh' + side, mat, 1.1); }
    for (let i = 0; i < 9; i++) { const o = new THREE.Mesh(orb, i < 5 ? this.matCore : this.matB); this.rig.add(o); this.orbs.push(o); }
    this.head = new THREE.Mesh(new THREE.SphereGeometry(LEN.head, 20, 14), this.matF); this.rig.add(this.head);
    this.visor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.055, 0.34), this.matCore); this.rig.add(this.visor);
    // shield bubble + magnet aura + floor glow
    this.bubble = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 2.4), wireframe: true, transparent: true, opacity: 0.45, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.bubble.visible = false; this.root.add(this.bubble);
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.025, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.4, 2.0), transparent: true, opacity: 0.8, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.aura.visible = false; this.root.add(this.aura);
    this.glow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    this.glow.rotation.x = -Math.PI / 2; scene.add(this.glow);
    // rope for grapple
    this.rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: new THREE.Color(2.5, 2.5, 2.5), toneMapped: false }));
    this.rope.frustumCulled = false; this.rope.visible = false; scene.add(this.rope);
    // trails
    this.ribbons = { neck: new Ribbon(scene, 26, 0.13, 0.3), footF: new Ribbon(scene, 18, 0.07, 0.2), footB: new Ribbon(scene, 18, 0.07, 0.2), hand: new Ribbon(scene, 16, 0.06, 0.16) };
    this.ghosts = []; this.ghostT = 0;
    for (let g = 0; g < 3; g++) {
      const gm = new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(1.4), transparent: true, opacity: 0.32 - g * 0.09, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const grp = new THREE.Group(); const meshes = [];
      for (const m of [...Object.values(this.limbs), this.head]) { const c = new THREE.Mesh(m.geometry, gm); grp.add(c); meshes.push(c); }
      grp.visible = false; scene.add(grp); this.ghosts.push({ grp, meshes, mat: gm });
    }
    this.trail = 'streak';
    this.pose = { ...POSE.idle }; this.tmp = {}; this.phase = 0; this.squash = 0; this.squashV = 0; this.roll = 0; this.tilt = 0; this.flash = 0; this.joints = {};
    this.setTrail('streak');
  }
  setColor(hex, cycle = false) {
    this.cycle = cycle; this.color.set(hex); this.applyColor(this.color);
  }
  applyColor(c) {
    this.matF.color.copy(c).multiplyScalar(2.4); this.matB.color.copy(c).multiplyScalar(1.15); this.glow.material.color.copy(c);
    for (const r of Object.values(this.ribbons)) r.mat.uniforms.uColor.value.copy(c);
    for (const g of this.ghosts) g.mat.color.copy(c).multiplyScalar(1.4);
  }
  setTrail(id) {
    this.trail = id;
    const R = this.ribbons; R.neck.visible = id === 'streak' || id === 'prism' || id === 'ghost' || id === 'sparks'; R.footF.visible = R.footB.visible = id === 'twin' || id === 'prism'; R.hand.visible = id === 'twin';
    for (const r of Object.values(R)) { r.mat.uniforms.uPrism.value = id === 'prism' ? 1 : 0; r.reset(); }
    R.neck.mat.uniforms.uAlpha.value = id === 'sparks' ? 0.45 : 1;
    for (const g of this.ghosts) g.grp.visible = id === 'ghost';
  }
  land(impact) { this.squashV -= Math.min(1.6, impact * 0.09); }
  hitFlash() { this.flash = 0.25; }
  resetTrails() { for (const r of Object.values(this.ribbons)) r.reset(); }
  /** p = sim player, t = time, dt = frame dt, opts = { menu } */
  update(p, dt, t, opts = {}) {
    if (this.cycle) { this._cyc = (this._cyc || new THREE.Color()).setHSL((t * 0.12) % 1, 1, 0.55); this.applyColor(this._cyc); }
    // ---- target pose
    let target, rate = 16, roll = 0, tilt = 0;
    const T = this.tmp;
    if (p.mode === 'dead') { target = POSE.dead; rate = 6; roll = this.roll + dt * 7; }
    else if (p.mode === 'grap') { target = { ...POSE.hang, hipF: 0.55 + 0.5 * Math.sin(t * 7), hipB: -0.15 - 0.4 * Math.sin(t * 7) }; roll = -p.grap.th * 0.95; rate = 18; }
    else if (p.mode === 'wall') { this.phase += dt * p.vx / 2.6 * Math.PI * 2; target = runPose(this.phase, T, 1); tilt = 0.75; rate = 22; }
    else if (p.slideT > 0) { target = POSE.slide; rate = 24; }
    else if (p.dashT > 0) { target = p.mode === 'air' ? POSE.airKick : POSE.dash; rate = 30; if (p.mode === 'run') this.phase += dt * p.vx / 3.2 * Math.PI * 2; }
    else if (p.vaultT > 0) { target = POSE.vault; rate = 26; }
    else if (p.mode === 'air') {
      if (p.flipT > 0) { target = POSE.tuck; rate = 30; roll = -(1 - p.flipT / 0.42) * Math.PI * 2; }
      else target = p.vy > 2 ? POSE.jumpUp : POSE.jumpDown, rate = p.vy > 2 ? 18 : 9;
    } else if (opts.idle) { target = POSE.idle; rate = 6; }
    else { this.phase += dt * Math.max(4, p.vx) / 2.7 * Math.PI * 2; target = runPose(this.phase, T, Math.min(1, Math.max(0, (p.vx - 11) / 8))); rate = 26; }
    const k = 1 - Math.exp(-rate * dt);
    for (const key of KEYS) this.pose[key] += (target[key] - this.pose[key]) * k;
    if (p.mode === 'dead') this.roll = roll; else if (p.mode === 'air' && p.flipT > 0) this.roll = roll; else this.roll += (roll - this.roll) * (1 - Math.exp(-14 * dt));
    this.tilt += (tilt - this.tilt) * (1 - Math.exp(-12 * dt));
    // landing squash spring
    this.squashV += (-this.squash * 220 - this.squashV * 18) * dt; this.squash += this.squashV * dt;
    const sq = Math.max(-0.45, Math.min(0.3, this.squash));
    // ---- FK in rig-local 2D (origin = feet point), x forward
    const P = this.pose, dir = (a) => [Math.sin(a), -Math.cos(a)];
    const hip = [0, P.hipY * (1 + sq * 0.6)];
    const lean = P.lean - sq * 0.6;
    const neck = [hip[0] + Math.sin(lean) * LEN.torso, hip[1] + Math.cos(lean) * LEN.torso];
    const ha = lean + P.head, headC = [neck[0] + Math.sin(ha) * (LEN.neck + LEN.head), neck[1] + Math.cos(ha) * (LEN.neck + LEN.head)];
    const neckTop = [neck[0] + Math.sin(ha) * LEN.neck, neck[1] + Math.cos(ha) * LEN.neck];
    const sh = [hip[0] + Math.sin(lean) * LEN.torso * 0.94, hip[1] + Math.cos(lean) * LEN.torso * 0.94];
    const add = (a, d, l) => [a[0] + d[0] * l, a[1] + d[1] * l];
    const eF = add(sh, dir(P.shF), LEN.ua), hF = add(eF, dir(P.shF + P.elF), LEN.fa);
    const eB = add(sh, dir(P.shB), LEN.ua), hB = add(eB, dir(P.shB + P.elB), LEN.fa);
    const kF = add(hip, dir(P.hipF), LEN.th), fF = add(kF, dir(P.hipF + P.knF), LEN.sh);
    const kB = add(hip, dir(P.hipB), LEN.th), fB = add(kB, dir(P.hipB + P.knB), LEN.sh);
    const zF = 0.13, zB = -0.13, V = (a, z = 0) => new THREE.Vector3(a[0], a[1], z);
    this.bone('torso', V(hip), V(neck)); this.bone('neck', V(neck), V(neckTop));
    this.bone('uaF', V(sh, zF), V(eF, zF)); this.bone('faF', V(eF, zF), V(hF, zF)); this.bone('uaB', V(sh, zB), V(eB, zB)); this.bone('faB', V(eB, zB), V(hB, zB));
    this.bone('thF', V(hip, zF * 0.7), V(kF, zF * 0.7)); this.bone('shF', V(kF, zF * 0.7), V(fF, zF * 0.7)); this.bone('thB', V(hip, zB * 0.7), V(kB, zB * 0.7)); this.bone('shB', V(kB, zB * 0.7), V(fB, zB * 0.7));
    const orbAt = [V(hF, zF), V(fF, zF * 0.7), V(hip), V(hB, zB), V(fB, zB * 0.7), V(eF, zF), V(kF, zF * 0.7), V(eB, zB), V(kB, zB * 0.7)];
    orbAt.forEach((v, i) => this.orbs[i].position.copy(v));
    this.head.position.set(headC[0], headC[1], 0);
    this.visor.position.set(headC[0] + Math.sin(ha + 1.4) * 0.12, headC[1] + Math.cos(ha + 1.4) * 0.12, 0); this.visor.rotation.z = -ha;
    // ---- place rig: feet point at (p.x, p.y). Roll pivots around the hip/centre, tilt (wall-run) around the feet.
    const pivotY = p.mode === 'grap' ? 1.9 : 0.95;
    this.root.position.set(p.x, p.y, p.mode === 'wall' ? -0.75 : 0);
    this.root.rotation.set(this.tilt, 0, 0);
    this.pivot.position.set(0, pivotY, 0); this.pivot.rotation.z = this.roll; this.rig.position.set(0, -pivotY, 0);
    this.root.updateMatrixWorld(true);
    const w = (v) => v.clone().applyMatrix4(this.rig.matrixWorld);
    this.joints = { hip: w(V(hip)), neck: w(V(neck)), head: w(V(headC)), handF: w(V(hF, zF)), handB: w(V(hB, zB)), footF: w(V(fF, zF)), footB: w(V(fB, zB)) };
    // flash / invulnerability shimmer
    this.flash = Math.max(0, this.flash - dt);
    const inv = p.inv > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 1, fl = this.flash > 0 ? 2.5 : 1;
    const base = this.cycle ? this._cyc : this.color; this.matF.color.copy(base).multiplyScalar(2.4 * inv * fl); this.matB.color.copy(base).multiplyScalar(1.15 * inv * fl);
    // auras
    this.bubble.visible = !!p.shield; if (p.shield) { this.bubble.position.set(0, 0.95, 0); this.bubble.rotation.y = t * 0.8; this.bubble.rotation.x = t * 0.5; this.bubble.scale.setScalar(1 + Math.sin(t * 6) * 0.03); }
    this.aura.visible = p.magnetT > 0; if (this.aura.visible) { this.aura.position.set(0, 0.95, 0); this.aura.rotation.set(t * 2, t * 3, 0); this.aura.material.opacity = p.magnetT < 2 ? (Math.sin(t * 20) > 0 ? 0.8 : 0.2) : 0.8; }
    this.glow.position.set(p.x, (p.groundY ?? p.y) + 0.03, 0); const gh = Math.max(0, 1 - (p.y - (p.groundY ?? p.y)) * 0.25); this.glow.material.opacity = 0.4 * gh; this.glow.visible = p.mode !== 'grap' && p.mode !== 'wall';
    // rope
    this.rope.visible = p.mode === 'grap';
    if (this.rope.visible) { const a = p.grap.a, pa = this.rope.geometry.attributes.position; const h = this.joints.handF; pa.setXYZ(0, h.x, h.y, h.z); pa.setXYZ(1, a.x, a.y, 0); pa.needsUpdate = true; }
    // trails
    const R = this.ribbons, J = this.joints;
    R.neck.push(J.neck, t); R.footF.push(J.footF, t); R.footB.push(J.footB, t); R.hand.push(J.handF, t);
    for (const r of Object.values(R)) r.update(t);
    if (this.trail === 'ghost') {
      this.ghostT -= dt;
      if (this.ghostT <= 0) {
        this.ghostT = 0.055;
        for (let g = this.ghosts.length - 1; g >= 0; g--) {
          const src = g === 0 ? [...Object.values(this.limbs), this.head] : this.ghosts[g - 1].meshes, dst = this.ghosts[g].meshes;
          for (let i = 0; i < dst.length; i++) { if (g === 0) { src[i].updateWorldMatrix(true, false); dst[i].matrixAutoUpdate = false; dst[i].matrix.copy(src[i].matrixWorld); } else { dst[i].matrixAutoUpdate = false; dst[i].matrix.copy(src[i].matrix); } }
        }
      }
    }
  }
  bone(n, a, b) {
    const m = this.limbs[n], d = b.clone().sub(a), l = d.length();
    m.position.copy(a); m.scale.set(m.userData.r, Math.max(0.001, l), m.userData.r); m.quaternion.setFromUnitVectors(UP, d.normalize());
  }
}
