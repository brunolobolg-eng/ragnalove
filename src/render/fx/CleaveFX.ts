import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import type { Vec2 } from '../../core/grid/types';
import { tileToWorld } from '../coords';
import { Flash, FlickerLight, Timeline, type FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';
import { VFX } from './kit/vfxSettings';

/** Momento do golpe dentro da animação (o GameView adia a reação dos alvos até aqui). */
export const CLEAVE_IMPACT = 0.26;
const SWEEP0 = 0.13;
const SWEEP1 = 0.32;

const C_SLASH = new THREE.Color(2.4, 2.8, 3.0);
const C_EDGE = new THREE.Color(0.3, 1.5, 1.25);
const C_SPARK = new THREE.Color(3, 2.3, 1.2);
const C_SPARK_END = new THREE.Color(0.9, 0.3, 0.05);
const C_DUST = new THREE.Color(0.42, 0.38, 0.33);

const SLASH_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SLASH_FRAG = /* glsl */ `
  uniform float uProg; uniform float uFade; uniform vec3 uCore; uniform vec3 uEdge; uniform float uTime;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  void main(){
    float head = smoothstep(uProg - 0.45, uProg, vUv.x) * step(vUv.x, uProg + 0.02);
    float taper = sin(3.14159 * vUv.x);
    float band = pow(sin(3.14159 * vUv.y), 1.5) * taper;
    float edge = smoothstep(0.55, 1.0, vUv.y) * taper; // borda externa mais afiada
    float noise = n(vec2(vUv.x * 18.0 - uTime * 4.0, vUv.y * 4.0));
    float a = (band * 0.9 + edge * 1.1) * head * (1.0 - uFade) * (0.7 + noise * 0.5);
    a *= smoothstep(uFade * 1.1, uFade * 1.1 + 0.2, noise + 0.1); // dissolve
    if (a < 0.003) discard;
    vec3 col = mix(uEdge, uCore, edge + band * 0.4);
    gl_FragColor = vec4(col * a, a);
  }`;

/** Golpe em Área: preparo → varredura com fita e lâmina de luz → faíscas nos alvos → poeira. */
export class CleaveFX {
  readonly group = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly tl = new Timeline();
  private readonly flashes: Flash[] = [];
  private readonly light: FlickerLight;
  private ribbon?: Ribbon;
  private ribbon2?: Ribbon;
  private readonly center: THREE.Vector3;
  private readonly a0: number;
  private readonly a1: number;
  done = false;

  constructor(origin: Vec2, facing: Vec2, _tiles: Vec2[], hitTiles: Vec2[], kit: FxKit, onImpact?: () => void) {
    this.center = tileToWorld(origin.x, origin.y);
    const fa = Math.atan2(facing.y, facing.x); // grade y → mundo z
    const half = (VISUAL_CONFIG.cleave as { halfAngle?: number }).halfAngle ?? 1.05;
    // da direita para a esquerda do guerreiro
    this.a0 = fa + half + 0.25;
    this.a1 = fa - half - 0.25;
    const R0 = 0.55;
    const R1 = 1.55;
    const H = 0.72;
    const N = 24;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = this.a0 + (this.a1 - this.a0) * s;
      const tilt = Math.sin(s * Math.PI) * 0.12; // leve arco para cima no meio
      for (const [r, v] of [
        [R0, 0],
        [R1, 1],
      ] as const)
        pos.push(this.center.x + Math.cos(a) * r, H + tilt + (v ? 0.08 : 0), this.center.z + Math.sin(a) * r), uv.push(s, v);
      if (i < N) {
        const b = i * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VERT,
      fragmentShader: SLASH_FRAG,
      uniforms: { uProg: { value: 0 }, uFade: { value: 0 }, uCore: { value: C_SLASH.clone().multiplyScalar(VFX.flash) }, uEdge: { value: C_EDGE }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const slash = new THREE.Mesh(geo, this.mat);
    slash.renderOrder = 7;
    slash.frustumCulled = false;
    this.group.add(slash);
    this.light = new FlickerLight(kit.stage, 0xbfe8ff, 0, 4, 0.1);
    this.light.set(this.center.clone().setY(1));
    const P = kit.particles;

    // 1. antecipação: poeira girando nos pés e brilho na lâmina
    P.smoke.emit({ pos: this.center.clone().setY(0.1), posJitter: 0.35, vel: new THREE.Vector3(0, 0.25, 0), velJitter: 0.5, life: 0.6, size: 0.35, sizeEnd: 0.8, color: C_DUST, alpha: 0.4, count: 4, spin: 3 });
    const bladeStart = this.arcPoint(0, 1.2, 0.95);
    P.spark.emit({ pos: bladeStart, life: 0.18, size: 0.35, sizeEnd: 0.1, color: C_SLASH, count: 1 });

    // 2+3. varredura com duas fitas (lâmina e rastro interno)
    this.tl.at(SWEEP0, () => {
      this.ribbon = kit.ribbons.acquire(new THREE.Color(0.9, 1.6, 1.5), 0.32, 0.16);
      this.ribbon2 = kit.ribbons.acquire(new THREE.Color(0.25, 0.9, 0.8), 0.5, 0.2);
      kit.stage.kick(0.06);
    });
    // 4. impacto
    this.tl.at(CLEAVE_IMPACT, () => {
      onImpact?.();
      const hits = hitTiles.length;
      for (const t of hitTiles) {
        const p = tileToWorld(t.x, t.y, undefined, 0.65);
        P.spark.emit({ pos: p, posJitter: 0.08, vel: new THREE.Vector3(Math.cos(fa) * 1.5, 1.4, Math.sin(fa) * 1.5), velJitter: 2.4, life: 0.35, size: 0.1, sizeEnd: 0.02, color: C_SPARK, colorEnd: C_SPARK_END, gravity: 8, drag: 1, count: 9 });
        this.flashes.push(new Flash(this.group, p, C_SLASH, 0.9, 0.12));
      }
      kit.decals.spawn({ kind: 'ring', pos: this.center.clone(), size: 0.6, sizeEnd: 2.6, color: new THREE.Color(0.5, 1.1, 1.0).multiplyScalar(VFX.flash), life: 0.3, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
      kit.stage.addShake(VISUAL_CONFIG.cleave.shakePerHit * Math.min(5, hits));
      kit.hitStop(Math.min(0.09, 0.035 + hits * 0.012));
      if (hits >= 3) kit.stage.aberrate(0.003);
    });
    // 5. rescaldo: poeira baixando
    this.tl.at(CLEAVE_IMPACT + 0.05, () =>
      P.smoke.emit({ pos: this.arcPoint(0.5, 1.0, 0.15), posJitter: 0.6, vel: new THREE.Vector3(0, 0.2, 0), velJitter: 0.4, life: 0.9, size: 0.45, sizeEnd: 1.1, color: C_DUST, alpha: 0.35, count: 4, spin: 1 }),
    );
  }

  private arcPoint(s: number, r: number, h: number): THREE.Vector3 {
    const a = this.a0 + (this.a1 - this.a0) * s;
    return new THREE.Vector3(this.center.x + Math.cos(a) * r, h, this.center.z + Math.sin(a) * r);
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    const t = this.tl.time;
    for (const f of this.flashes) f.update(dt);
    const prog = Math.min(1, Math.max(0, (t - SWEEP0) / (SWEEP1 - SWEEP0)));
    const eased = 1 - (1 - prog) * (1 - prog);
    this.mat.uniforms.uProg.value = eased;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uFade.value = Math.max(0, (t - SWEEP1) / 0.22);
    if (prog > 0 && prog < 1) {
      this.ribbon?.push(this.arcPoint(eased, 1.35, 0.8));
      this.ribbon2?.push(this.arcPoint(eased, 0.95, 0.75));
    } else if (prog >= 1) {
      this.ribbon?.stop();
      this.ribbon2?.stop();
    }
    const lk = t > SWEEP0 && t < SWEEP1 + 0.15 ? 1.8 : 0;
    this.light.update(dt, lk);
    if (t > SWEEP1 + 0.3) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.ribbon2?.stop();
    this.light.release();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
