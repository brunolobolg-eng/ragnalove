import * as THREE from 'three';
import { GAME_CONFIG } from '../../../config/gameConfig';
import { ribbonTexture } from './vfxTextures';
import { VFX } from './vfxSettings';

const MAX_PTS = 32;

/**
 * Rastro em fita (ribbon trail): tira de triângulos que segue um ponto, sempre de frente
 * para a câmera, afinando e sumindo com a idade de cada ponto. Pool pré-alocado.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pts: { p: THREE.Vector3; age: number }[] = [];
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private life = 0.25;
  private width = 0.2;
  active = false;
  private emitting = false;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_PTS * 2 * 3);
    this.alpha = new Float32Array(MAX_PTS * 2);
    const uv = new Float32Array(MAX_PTS * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i < MAX_PTS; i++) {
      uv.set([i / (MAX_PTS - 1), 0, i / (MAX_PTS - 1), 1], i * 4);
      if (i < MAX_PTS - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: ribbonTexture() }, uColor: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: `attribute float aAlpha; varying float vA; varying vec2 vUv;
        void main(){ vA = aAlpha; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vA; varying vec2 vUv;
        void main(){ float a = texture2D(uTex, vec2(0.5, vUv.y)).a * vA; if (a < 0.003) discard;
          // miolo mais claro que as bordas
          float core = smoothstep(0.35, 0.5, 0.5 - abs(vUv.y - 0.5));
          gl_FragColor = vec4(uColor * (1.0 + core * 1.2), a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
  }

  start(color: THREE.Color, width: number, life: number): this {
    this.pts.length = 0;
    this.mesh.material.uniforms.uColor.value.copy(color);
    this.width = width;
    this.life = life;
    this.active = true;
    this.emitting = true;
    this.mesh.visible = true;
    return this;
  }

  push(p: THREE.Vector3): void {
    if (!this.emitting) return;
    const last = this.pts[this.pts.length - 1];
    if (last && last.p.distanceToSquared(p) < 0.0004) return;
    this.pts.push({ p: p.clone(), age: 0 });
    if (this.pts.length > MAX_PTS) this.pts.shift();
  }

  /** Para de receber pontos; a fita some sozinha. */
  stop(): void {
    this.emitting = false;
  }

  update(dt: number, camPos: THREE.Vector3): void {
    if (!this.active) return;
    for (const q of this.pts) q.age += dt;
    while (this.pts.length && this.pts[0].age > this.life) this.pts.shift();
    if (!this.emitting && this.pts.length < 2) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    const n = this.pts.length;
    const tan = new THREE.Vector3();
    const view = new THREE.Vector3();
    const side = new THREE.Vector3();
    for (let i = 0; i < MAX_PTS; i++) {
      const k = Math.min(i, n - 1);
      if (n === 0) break;
      const q = this.pts[k];
      const a = n > 1 ? this.pts[Math.min(n - 1, k + 1)].p : q.p;
      const b = n > 1 ? this.pts[Math.max(0, k - 1)].p : q.p;
      tan.subVectors(a, b);
      if (tan.lengthSq() < 1e-8) tan.set(1, 0, 0);
      view.subVectors(camPos, q.p);
      side.crossVectors(tan, view).normalize();
      const f = Math.max(0, 1 - q.age / this.life);
      const head = Math.min(1, (n - 1 - k) / 2 + 0.35); // ponta fina perto do projétil
      const w = this.width * 0.5 * f * head;
      this.pos.set([q.p.x + side.x * w, q.p.y + side.y * w, q.p.z + side.z * w, q.p.x - side.x * w, q.p.y - side.y * w, q.p.z - side.z * w], i * 6);
      const al = i < n ? f * f : 0;
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = al;
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
  }
}

export class RibbonPool {
  private readonly pool: Ribbon[] = [];
  constructor(scene: THREE.Scene) {
    for (let i = 0; i < GAME_CONFIG.vfx.maxRibbons; i++) {
      const r = new Ribbon();
      scene.add(r.mesh);
      this.pool.push(r);
    }
  }
  /** Fita livre (ou undefined se o orçamento acabou / fitas desligadas). */
  acquire(color: THREE.Color, width: number, life: number): Ribbon | undefined {
    if (!VFX.ribbons) return undefined;
    return this.pool.find((r) => !r.active)?.start(color, width, life);
  }
  update(dt: number, camPos: THREE.Vector3): void {
    for (const r of this.pool) r.update(dt, camPos);
  }
  clear(): void {
    for (const r of this.pool) {
      r.stop();
      r.active = false;
      r.mesh.visible = false;
    }
  }
  activeCount(): number {
    return this.pool.filter((r) => r.active).length;
  }
}
