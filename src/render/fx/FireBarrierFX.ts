import * as THREE from 'three';
import type { Vec2 } from '../../core/grid/types';
import { tileToWorld } from '../coords';
import { Flash, FlickerLight, Timeline, type FxKit } from './kit/FxKit';
import { VFX } from './kit/vfxSettings';

/**
 * Barreira de Fogo — efeito em 5 fases:
 *  1. Antecipação: círculo rúnico sob o Mago, brasas convergindo para o orbe, runas acendendo na linha.
 *  2. Lançamento: flash no cajado, empurrão de câmera, luz.
 *  3. Presença: ignição tile a tile (do centro para fora) e chama volumétrica em shader
 *     (ruído rolando, núcleo branco-quente), labaredas flipbook, brasas, fumaça, calor, luzes tremulando.
 *  4. Impacto: cada tile acende com anel de choque, faíscas e baforada de fumaça.
 *  5. Rescaldo: chamas se dissolvem, ficam marcas de queimado que se desfazem, brasas e fumaça.
 * Visual puro: dano e bloqueio vêm do efeito da simulação.
 */

const FLAME_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aIgnite;
  uniform float uTime;
  uniform float uFade;
  varying vec2 vUv;
  varying float vSeed;
  varying float vGrow;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    float g = clamp((uTime - aIgnite) / 0.28, 0.0, 1.0);
    // cresce com um pequeno "estouro" e baixa ao apagar
    float grow = g * (1.0 + 0.25 * sin(g * 3.14159)) * (1.0 - uFade * 0.55);
    vGrow = g;
    vec3 p = position;
    float h = p.y;
    p.y *= grow;
    // balanço lateral (vento), mais forte no topo
    p.x += sin(uTime * 2.3 + aSeed * 6.0 + h * 2.0) * 0.06 * h;
    p.z += cos(uTime * 1.9 + aSeed * 4.0 + h * 1.7) * 0.05 * h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FLAME_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uFade;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vSeed;
  varying float vGrow;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; }
    return v;
  }
  void main() {
    vec2 uv = vUv;
    float t = uTime;
    vec2 q = vec2(uv.x * 2.4 + vSeed * 13.0, uv.y * 1.8 - t * 1.9);
    float warp = noise(q * 1.3 + vec2(0.0, -t * 0.7));
    float n = fbm(q + vec2(warp * 0.9, 0.0));
    // contorno orgânico: bordas empurradas pelo ruído e ponta arredondada (nada de "triângulo")
    float wob = (noise(vec2(uv.y * 3.0 - t * 2.2, vSeed * 5.0)) - 0.5) * 0.55 * uv.y;
    float xc = abs(uv.x - 0.5 + wob) * 2.0;
    float width = mix(0.95, 0.35, pow(uv.y, 0.8));
    float body = 1.0 - smoothstep(width * 0.55, width, xc);
    body *= 1.0 - smoothstep(0.55, 1.0, uv.y + (n - 0.5) * 0.35);
    float fl = n * (1.35 - uv.y) * body * 2.2 - uv.y * 0.35;
    // dissolve: ao apagar, o ruído come a chama de cima para baixo
    fl -= uFade * (0.9 + (1.0 - n) * 0.8) * (0.4 + uv.y);
    fl = clamp(fl, 0.0, 1.3);
    vec3 col = mix(vec3(0.55, 0.05, 0.004), vec3(1.0, 0.36, 0.04), smoothstep(0.25, 0.7, fl));
    col = mix(col, vec3(1.5, 1.05, 0.5), smoothstep(0.95, 1.25, fl)); // núcleo quente só nas línguas mais fortes
    float a = smoothstep(0.12, 0.6, fl) * smoothstep(0.0, 0.06, uv.y) * vGrow * uIntensity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col * a * 0.7, a);
  }
`;

const C_EMBER = new THREE.Color(3.2, 1.3, 0.3);
const C_EMBER_END = new THREE.Color(0.8, 0.1, 0.0);
const C_LICK = new THREE.Color(1.3, 0.5, 0.1);
const C_LICK_END = new THREE.Color(0.9, 0.12, 0.02);
const C_SMOKE = new THREE.Color(0.16, 0.13, 0.12);
const C_SMOKE_END = new THREE.Color(0.06, 0.06, 0.07);
const C_RUNE = new THREE.Color(2.4, 0.9, 0.2);
const C_FLASH = new THREE.Color(3, 1.8, 0.8);

export class FireBarrierFX {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly glowMat: THREE.MeshBasicMaterial;
  private readonly tiles: THREE.Vector3[];
  private readonly igniteAt: number[];
  private readonly lights: FlickerLight[] = [];
  private readonly flashes: Flash[] = [];
  private readonly tl = new Timeline();
  private t = 0;
  private ending = -1;
  private emitAcc = 0;
  done = false;

  constructor(
    tiles: Vec2[],
    private readonly kit: FxKit,
    /** ponta do cajado do Mago (para a antecipação); opcional */
    casterTip?: THREE.Vector3,
    casterFeet?: THREE.Vector3,
  ) {
    const LAUNCH = 0.18;
    this.tiles = tiles.map((t) => tileToWorld(t.x, t.y));
    // ignição do centro para as pontas
    const cx = this.tiles.reduce((s, p) => s + p.x, 0) / Math.max(1, this.tiles.length);
    const cz = this.tiles.reduce((s, p) => s + p.z, 0) / Math.max(1, this.tiles.length);
    this.igniteAt = this.tiles.map((p) => LAUNCH + Math.hypot(p.x - cx, p.z - cz) * 0.06);

    // --- malha única da chama: 3 planos cruzados por tile (um draw call) ---
    const planes = 2;
    const n = this.tiles.length * planes;
    const pos = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const seed = new Float32Array(n * 4);
    const ign = new Float32Array(n * 4);
    const idx: number[] = [];
    let q = 0;
    this.tiles.forEach((c, ti) => {
      const s = Math.random();
      for (let k = 0; k < planes; k++) {
        const a = (k / planes) * Math.PI + Math.PI / 4 + (s - 0.5) * 0.4;
        const dx = Math.cos(a) * 0.62;
        const dz = Math.sin(a) * 0.62;
        const H = 1.55 + Math.random() * 0.35;
        const verts = [
          [c.x - dx, 0, c.z - dz, 0, 0],
          [c.x + dx, 0, c.z + dz, 1, 0],
          [c.x - dx, H, c.z - dz, 0, 1],
          [c.x + dx, H, c.z + dz, 1, 1],
        ];
        verts.forEach((v, j) => {
          pos.set([v[0], v[1], v[2]], (q * 4 + j) * 3);
          uv.set([v[3], v[4]], (q * 4 + j) * 2);
          seed[q * 4 + j] = s + k * 0.37;
          ign[q * 4 + j] = this.igniteAt[ti];
        });
        const b = q * 4;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        q++;
      }
    });
    // as alturas (y) ficam relativas à base: o vertex shader escala y pelo "grow"
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aIgnite', new THREE.BufferAttribute(ign, 1));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: FLAME_VERT,
      fragmentShader: FLAME_FRAG,
      uniforms: { uTime: { value: 0 }, uFade: { value: 0 }, uIntensity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const flames = new THREE.Mesh(geo, this.mat);
    flames.frustumCulled = false;
    flames.renderOrder = 4;
    this.group.add(flames);

    // brilho do fogo no chão (uma faixa por tile, aditivo)
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(1.6, 0.55, 0.12), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowGeos = this.tiles.map((c) => new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2).translate(c.x, 0.03, c.z));
    const glow = new THREE.Mesh(mergeFlat(glowGeos), this.glowMat);
    glow.renderOrder = 1;
    this.group.add(glow);

    // --- luzes reais: uma a cada ~3 tiles (o resto é brilho aditivo) ---
    for (let i = 1; i < this.tiles.length; i += 3) {
      const l = new FlickerLight(kit.stage, 0xff7a2a, 0, 5.5, 0.35);
      if (!l.active) break;
      l.set(this.tiles[i].clone().setY(0.9));
      this.lights.push(l);
    }

    // --- 1. antecipação ---
    const D = kit.decals;
    const feet = casterFeet ?? casterTip?.clone().setY(0);
    if (feet) D.spawn({ kind: 'runesFire', pos: feet, size: 1.7, color: C_RUNE, life: 1.1, additive: true, spin: 1.6, fadeIn: 0.12, fadeOut: 0.45 });
    for (const p of this.tiles) D.spawn({ kind: 'glow', pos: p, size: 1.1, color: new THREE.Color(1.4, 0.4, 0.08), life: 0.55, additive: true, fadeIn: 0.12, fadeOut: 0.5, rotation: 0 });
    if (casterTip) {
      // brasas convergindo para o orbe
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const from = casterTip.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, -0.5 + Math.random() * 0.8, Math.sin(a) * 0.9));
        const v = casterTip.clone().sub(from).multiplyScalar(1 / 0.22);
        kit.particles.glow.emit({ pos: from, vel: v, life: 0.22, size: 0.1, sizeEnd: 0.04, color: C_EMBER, colorEnd: C_RUNE });
      }
    }
    // --- 2. lançamento ---
    this.tl.at(LAUNCH, () => {
      if (casterTip) this.flashes.push(new Flash(this.group, casterTip, C_FLASH, 1.6, 0.22));
      kit.stage.kick(0.22);
      kit.stage.addShake(0.05);
    });
    // --- 4. impacto: ignição de cada tile ---
    this.tiles.forEach((p, i) =>
      this.tl.at(this.igniteAt[i], () => {
        const P = kit.particles;
        P.fire.emit({ pos: p.clone().setY(0.3), posJitter: 0.25, vel: new THREE.Vector3(0, 2.4, 0), velJitter: 0.6, life: 0.55, size: 0.9, sizeEnd: 0.35, color: C_LICK, colorEnd: C_LICK_END, count: 5, spin: 1.5 });
        P.spark.emit({ pos: p.clone().setY(0.3), posJitter: 0.2, vel: new THREE.Vector3(0, 2.6, 0), velJitter: 1.8, life: 0.4, size: 0.08, sizeEnd: 0.02, color: C_EMBER, colorEnd: C_EMBER_END, gravity: 2, count: 6 });
        P.smoke.emit({ pos: p.clone().setY(0.2), posJitter: 0.3, vel: new THREE.Vector3(0, 0.6, 0), velJitter: 0.5, life: 1.0, size: 0.6, sizeEnd: 1.3, color: C_SMOKE, colorEnd: C_SMOKE_END, alpha: 0.55, count: 2, spin: 0.6 });
        D.spawn({ kind: 'ring', pos: p, size: 0.3, sizeEnd: 1.7, color: new THREE.Color(1.8, 0.7, 0.2).multiplyScalar(VFX.flash), life: 0.35, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
        if (i % 2 === 0) this.flashes.push(new Flash(this.group, p.clone().setY(0.5), C_FLASH, 1.3, 0.16));
      }),
    );
  }

  /** Simulação encerrou a barreira: começa o rescaldo. */
  end(): void {
    if (this.ending >= 0) return;
    this.ending = 0;
    // 5. rescaldo: marcas de queimado que se dissolvem devagar
    for (const p of this.tiles)
      this.kit.decals.spawn({ kind: 'scorch', pos: p, size: 1.25 + Math.random() * 0.25, color: new THREE.Color(1, 1, 1), life: 7, fadeIn: 0.4, fadeOut: 0.5, dissolve: true, opacity: 0.85 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.tl.update(dt);
    for (const f of this.flashes) f.update(dt);
    const U = this.mat.uniforms;
    U.uTime.value = this.t;
    const FADE = 0.9;
    const fade = this.ending >= 0 ? Math.min(1, (this.ending += dt) / FADE) : 0;
    U.uFade.value = fade;
    const lit = Math.min(1, Math.max(0, (this.t - 0.18) / 0.4)) * (1 - fade);
    this.glowMat.opacity = lit * (0.36 + Math.sin(this.t * 9) * 0.05);
    for (const l of this.lights) l.update(dt, lit * 3.4);

    // 3. presença: labaredas, brasas, fumaça e calor
    this.emitAcc += dt;
    if (this.emitAcc >= 1 / 20) {
      const step = this.emitAcc;
      this.emitAcc = 0;
      const P = this.kit.particles;
      const alive = this.ending < 0 || fade < 0.6;
      this.tiles.forEach((p, i) => {
        if (this.t < this.igniteAt[i]) return;
        const k = step * 20;
        if (alive) {
          P.fire.emit({ pos: p.clone().setY(0.35), posJitter: 0.35, vel: new THREE.Vector3(0, 1.5, 0), velJitter: 0.35, life: 0.55, size: 0.5, sizeEnd: 0.2, color: C_LICK, colorEnd: C_LICK_END, count: 0.6 * k, spin: 2.5 });
          P.glow.emit({ pos: p.clone().setY(0.4), posJitter: 0.35, vel: new THREE.Vector3(0, 1.4, 0), velJitter: 0.5, life: 1.3, size: 0.06, sizeEnd: 0.015, color: C_EMBER, colorEnd: C_EMBER_END, gravity: -0.5, drag: 0.3, count: 0.5 * k });
        }
        P.smoke.emit({ pos: p.clone().setY(1.4), posJitter: 0.3, vel: new THREE.Vector3(0.12, 0.7, 0), velJitter: 0.2, life: 1.8, size: 0.7, sizeEnd: 1.7, color: C_SMOKE, colorEnd: C_SMOKE_END, alpha: alive ? 0.32 : 0.45, count: 0.25 * k, spin: 0.4 });
        if (i % 2 === 0 && alive) this.kit.stage.addHeat(p.clone().setY(1.0), 1.1, lit);
      });
    }

    if (fade >= 1 && this.t > 1) {
      // rescaldo curto de fumaça antes de liberar tudo
      this.dispose();
    }
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    for (const l of this.lights) l.release();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.mat.dispose();
    this.glowMat.dispose();
    this.group.removeFromParent();
  }
}

function mergeFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let base = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    const u = g.attributes.uv.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base);
    base += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

let _gt: THREE.Texture | undefined;
function glowTexture(): THREE.Texture {
  if (_gt) return _gt;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _gt = new THREE.CanvasTexture(c);
  return _gt;
}
