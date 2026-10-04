import * as THREE from 'three';
import { GAME_CONFIG } from '../../config/gameConfig';
import { flameAtlas, glowTexture, smokeAtlas, sparkTexture } from './kit/vfxTextures';

export interface EmitOptions {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  /** Aleatoriedade somada à posição e velocidade. */
  posJitter?: number;
  velJitter?: number;
  life: number;
  size: number;
  sizeEnd?: number;
  color: THREE.Color;
  colorEnd?: THREE.Color;
  alpha?: number;
  gravity?: number; // positivo = cai, negativo = sobe
  drag?: number;
  count?: number;
  /** Giro da textura em rad/s (aleatório em ± spin). Rotação inicial é sempre aleatória. */
  spin?: number;
}

const VERT = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aLifeT;
  attribute float aRot;
  uniform float uScale;
  varying vec4 vColor;
  varying float vLifeT;
  varying float vRot;
  varying float vY;
  varying float vSize;
  void main() {
    vColor = aColor;
    vLifeT = aLifeT;
    vRot = aRot;
    vY = position.y;
    vSize = aSize;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform float uFrames;     // lado do atlas (1 = textura única)
  uniform float uGroundFade; // 1 = some suavemente ao encostar no chão
  varying vec4 vColor;
  varying float vLifeT;
  varying float vRot;
  varying float vY;
  varying float vSize;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float s = sin(vRot), co = cos(vRot);
    vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
    if (uFrames > 1.0) {
      // flipbook: o quadro acompanha a vida da partícula
      float total = uFrames * uFrames;
      float f = min(total - 1.0, floor(vLifeT * total));
      vec2 cell = vec2(mod(f, uFrames), uFrames - 1.0 - floor(f / uFrames));
      uv = (clamp(uv, 0.0, 1.0) + cell) / uFrames;
    }
    vec4 t = texture2D(uTex, uv);
    float a = vColor.a * t.a;
    // partícula "soft": não corta seco no chão
    a *= mix(1.0, smoothstep(0.0, max(0.05, vSize * 0.35), vY), uGroundFade);
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

interface SystemOpts {
  additive: boolean;
  texture?: THREE.Texture;
  /** Lado do atlas flipbook (4 = 16 quadros). */
  frames?: number;
  groundFade?: boolean;
}

/** Pool de partículas em GPU (um draw call por sistema), ring buffer — sem alocação por frame. */
export class ParticleSystem {
  /** Densidade global (preset de qualidade): 1 = tudo; 0.3 = 30% das partículas. Só visual. */
  static density = 1;
  /** Partículas vivas no último update (HUD de debug). */
  aliveCount = 0;
  /** Há partículas vivas (ou recém-emitidas): sem isso o update pula tudo. */
  private active = true;
  readonly points: THREE.Points;
  private readonly max: number;
  private head = 0;
  private readonly geo: THREE.BufferGeometry;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly lifeT: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly c0: Float32Array;
  private readonly c1: Float32Array;
  private readonly a0: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly mat: THREE.ShaderMaterial;

  constructor(max: number, o: SystemOpts | boolean) {
    const opts: SystemOpts = typeof o === 'boolean' ? { additive: o } : o;
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.lifeT = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    const dyn = (a: Float32Array, n: number) => new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', dyn(this.pos, 3));
    this.geo.setAttribute('aColor', dyn(this.col, 4));
    this.geo.setAttribute('aSize', dyn(this.size, 1));
    this.geo.setAttribute('aLifeT', dyn(this.lifeT, 1));
    this.geo.setAttribute('aRot', dyn(this.rot, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTex: { value: opts.texture ?? glowTexture() },
        uScale: { value: 600 },
        uFrames: { value: opts.frames ?? 1 },
        uGroundFade: { value: opts.groundFade ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = opts.additive ? 3 : 2;
  }

  setScale(s: number): void {
    this.mat.uniforms.uScale.value = s;
  }

  emit(o: EmitOptions): void {
    // arredondamento estocástico: com densidade 0.4, "count: 1" ainda sai 40% das vezes
    const raw = (o.count ?? 1) * ParticleSystem.density;
    const n = Math.floor(raw) + (Math.random() < raw - Math.floor(raw) ? 1 : 0);
    if (n > 0) this.active = true;
    const pj = o.posJitter ?? 0;
    const vj = o.velJitter ?? 0;
    const ce = o.colorEnd ?? o.color;
    for (let k = 0; k < n; k++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      const i3 = i * 3;
      this.pos[i3] = o.pos.x + (Math.random() * 2 - 1) * pj;
      this.pos[i3 + 1] = o.pos.y + (Math.random() * 2 - 1) * pj * 0.5;
      this.pos[i3 + 2] = o.pos.z + (Math.random() * 2 - 1) * pj;
      this.vel[i3] = (o.vel?.x ?? 0) + (Math.random() * 2 - 1) * vj;
      this.vel[i3 + 1] = (o.vel?.y ?? 0) + (Math.random() * 2 - 1) * vj;
      this.vel[i3 + 2] = (o.vel?.z ?? 0) + (Math.random() * 2 - 1) * vj;
      const l = o.life * (0.75 + Math.random() * 0.5);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.s0[i] = o.size;
      this.s1[i] = o.sizeEnd ?? o.size;
      this.c0[i3] = o.color.r;
      this.c0[i3 + 1] = o.color.g;
      this.c0[i3 + 2] = o.color.b;
      this.c1[i3] = ce.r;
      this.c1[i3 + 1] = ce.g;
      this.c1[i3 + 2] = ce.b;
      this.a0[i] = o.alpha ?? 1;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.rot[i] = Math.random() * Math.PI * 2;
      this.spin[i] = (Math.random() * 2 - 1) * (o.spin ?? 0);
    }
  }

  update(dt: number): void {
    if (!this.active) return; // sem partículas vivas: pula scan + upload
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.col[i4 + 3] = 0;
        }
        continue;
      }
      this.life[i] -= dt;
      alive++;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[i3 + 1] = 0.02;
        this.vel[i3 + 1] *= -0.3;
      }
      this.rot[i] += this.spin[i] * dt;
      this.lifeT[i] = t;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i4] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i4 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i4 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
      // fade-in rápido, fade-out suave
      const fade = Math.min(1, t * 8) * (1 - t) * (1 - t);
      this.col[i4 + 3] = this.a0[i] * fade;
    }
    this.aliveCount = alive;
    if (alive === 0) this.active = false;
    for (const k of ['position', 'aColor', 'aSize', 'aLifeT', 'aRot']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
  }
}

/**
 * Os sistemas compartilhados por todos os efeitos:
 *  - glow: brilhos e brasas (aditivo, círculo suave)
 *  - spark: faíscas com cruz de brilho (aditivo)
 *  - fire: labaredas em flipbook (aditivo, some no chão)
 *  - smoke: fumaça/poeira em flipbook (normal, some no chão)
 */
export class ParticleLayer {
  readonly glow: ParticleSystem;
  readonly spark: ParticleSystem;
  readonly fire: ParticleSystem;
  readonly smoke: ParticleSystem;
  private readonly all: ParticleSystem[];
  constructor(scene: THREE.Scene) {
    const B = GAME_CONFIG.vfx.particleBudget;
    this.glow = new ParticleSystem(B.glow, { additive: true });
    this.spark = new ParticleSystem(B.spark, { additive: true, texture: sparkTexture() });
    this.fire = new ParticleSystem(B.fire, { additive: true, texture: flameAtlas(), frames: 4, groundFade: true });
    this.smoke = new ParticleSystem(B.smoke, { additive: false, texture: smokeAtlas(), frames: 4, groundFade: true });
    this.all = [this.glow, this.spark, this.fire, this.smoke];
    scene.add(this.smoke.points, this.fire.points, this.glow.points, this.spark.points);
  }
  aliveCount(): number {
    return this.all.reduce((s, p) => s + p.aliveCount, 0);
  }
  update(dt: number): void {
    for (const p of this.all) p.update(dt);
  }
  setScale(s: number): void {
    for (const p of this.all) p.setScale(s);
  }
  clear(): void {
    for (const p of this.all) p.clear();
  }
}
