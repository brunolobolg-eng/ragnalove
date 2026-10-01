import * as THREE from 'three';
import { GAME_CONFIG } from '../../../config/gameConfig';
import { decalTexture, type DecalKind } from './vfxTextures';
import { VFX } from './vfxSettings';

export interface DecalSpec {
  kind: DecalKind;
  pos: THREE.Vector3;
  size: number;
  color: THREE.Color;
  /** Duração total (s). */
  life: number;
  additive?: boolean;
  fadeIn?: number;
  /** Fração final da vida usada para sumir (0..1). */
  fadeOut?: number;
  /** Escala final (anéis de choque crescem). */
  sizeEnd?: number;
  /** Crescimento linear (temporizador), em vez de desacelerar no fim. */
  linear?: boolean;
  spin?: number;
  rotation?: number;
  /** Dissolve com ruído no fim (marcas de queimado/gelo). */
  dissolve?: boolean;
  opacity?: number;
}

/**
 * Decalques de chão em pool (queimado, gelo, rachadura, círculo rúnico, onda de choque).
 * Um material por slot, criado uma vez — trocar textura/cor não recompila shader.
 */
class Decal {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  spec?: DecalSpec;
  age = 0;
  constructor(geo: THREE.PlaneGeometry, layer: number) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: null }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0 }, uDissolve: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity; uniform float uDissolve; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec4 t = texture2D(uTex, vUv);
          float a = t.a * uOpacity;
          if (uDissolve > 0.0) a *= smoothstep(uDissolve, uDissolve + 0.12, n(vUv * 9.0));
          if (a < 0.003) discard;
          gl_FragColor = vec4(t.rgb * uColor, a);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2 - layer * 0.01,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
  }
}

export class DecalLayer {
  private readonly pool: Decal[] = [];
  private next = 0;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < GAME_CONFIG.vfx.maxDecals; i++) {
      const d = new Decal(geo, i);
      scene.add(d.mesh);
      this.pool.push(d);
    }
  }

  spawn(s: DecalSpec): void {
    // marcas "de sujeira" respeitam a opção; círculos/anéis de leitura sempre aparecem
    const cosmetic = s.kind === 'scorch' || s.kind === 'frost' || s.kind === 'crack';
    if (cosmetic && !VFX.decals) return;
    // reaproveita o slot livre ou o mais antigo
    let d = this.pool.find((x) => !x.spec);
    if (!d) {
      d = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
    }
    d.spec = s;
    d.age = 0;
    const m = d.mesh;
    const U = m.material.uniforms;
    U.uTex.value = decalTexture(s.kind);
    U.uColor.value.copy(s.color);
    m.material.blending = s.additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.position.copy(s.pos);
    m.position.y = Math.max(m.position.y, 0.012 + (this.pool.indexOf(d) % 16) * 0.0008);
    m.rotation.z = s.rotation ?? Math.random() * Math.PI * 2;
    m.scale.setScalar(s.size);
    m.visible = true;
  }

  update(dt: number): void {
    for (const d of this.pool) {
      const s = d.spec;
      if (!s) continue;
      d.age += dt;
      const t = d.age / s.life;
      if (t >= 1) {
        d.spec = undefined;
        d.mesh.visible = false;
        continue;
      }
      const fi = s.fadeIn ?? 0.05;
      const fo = s.fadeOut ?? 0.4;
      const inK = Math.min(1, d.age / Math.max(0.001, fi));
      const outK = t > 1 - fo ? (1 - t) / fo : 1;
      const U = d.mesh.material.uniforms;
      U.uOpacity.value = (s.opacity ?? 1) * inK * outK;
      U.uDissolve.value = s.dissolve && t > 1 - fo ? (t - (1 - fo)) / fo : 0;
      if (s.sizeEnd !== undefined) d.mesh.scale.setScalar(s.size + (s.sizeEnd - s.size) * (s.linear ? t : 1 - (1 - t) * (1 - t)));
      if (s.spin) d.mesh.rotation.z += s.spin * dt;
    }
  }

  clear(): void {
    for (const d of this.pool) {
      d.spec = undefined;
      d.mesh.visible = false;
    }
  }

  activeCount(): number {
    return this.pool.filter((d) => d.spec).length;
  }
}
