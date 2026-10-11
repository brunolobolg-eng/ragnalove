import * as THREE from 'three';
import { PACK_BUDGET } from '../../../config/fx/efeitosPack';
import { SHADER_SPARK } from './packShaders';

/** Uma faísca a emitir. Cor e forma vêm do elemento; a física segue o CPUParticles3D do Godot. */
export interface SparkSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Empuxo em m/s²: positivo sobe, negativo cai. */
  lift: number;
  life: number;
  /** Tamanho em metros (o shader converte em pixels pela distância da câmera). */
  size: number;
  /** Forma da partícula (0 a 7, ver spark.gdshader). */
  shape: number;
  core: readonly [number, number, number];
  edge: readonly [number, number, number];
  /** Semente por partícula (brasas e fios variam de uma para outra). */
  seed: number;
  alpha?: number;
}

/**
 * Faíscas dos efeitos do pacote: um só Points com capacidade fixa (pool), atualizado a cada quadro.
 * Nada é criado por partícula: posições e atributos ficam em arrays pré-alocados, e as mortas são
 * removidas trocando com a última (sem buracos, sem alocação).
 */
export class MagicSparks {
  readonly points: THREE.Points;
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly lift: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly alpha: Float32Array;
  private readonly core: Float32Array;
  private readonly edge: Float32Array;
  /** x = fade (calculado a cada quadro), y = tamanho, z = forma, w = semente. */
  private readonly params: Float32Array;
  private readonly aPos: THREE.BufferAttribute;
  private readonly aCore: THREE.BufferAttribute;
  private readonly aEdge: THREE.BufferAttribute;
  private readonly aParams: THREE.BufferAttribute;
  private count = 0;
  private time = 0;

  constructor(parent: THREE.Object3D, readonly capacity: number = PACK_BUDGET.sparks) {
    const n = capacity;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.lift = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.core = new Float32Array(n * 3);
    this.edge = new Float32Array(n * 3);
    this.params = new Float32Array(n * 4);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCore = new THREE.BufferAttribute(this.core, 3).setUsage(THREE.DynamicDrawUsage);
    this.aEdge = new THREE.BufferAttribute(this.edge, 3).setUsage(THREE.DynamicDrawUsage);
    this.aParams = new THREE.BufferAttribute(this.params, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.aPos);
    this.geo.setAttribute('aCore', this.aCore);
    this.geo.setAttribute('aEdge', this.aEdge);
    this.geo.setAttribute('aParams', this.aParams);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SHADER_SPARK.vertex,
      fragmentShader: SHADER_SPARK.fragment,
      uniforms: { uScale: { value: 600 }, uEnergy: { value: 1.2 }, uAge: { value: 0 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    parent.add(this.points);
  }

  /** Quantas faíscas ainda cabem (o efeito emissor para quando não cabe). */
  get room(): number {
    return this.capacity - this.count;
  }

  /** Pixels por metro a 1 m da câmera (mesma escala das partículas do kit: `stage.projScale()`). */
  setScale(px: number): void {
    this.mat.uniforms.uScale.value = px;
  }

  emit(s: SparkSpec): boolean {
    if (this.count >= this.capacity) return false;
    const i = this.count++;
    const k3 = i * 3;
    const k4 = i * 4;
    this.pos[k3] = s.x;
    this.pos[k3 + 1] = s.y;
    this.pos[k3 + 2] = s.z;
    this.vel[k3] = s.vx;
    this.vel[k3 + 1] = s.vy;
    this.vel[k3 + 2] = s.vz;
    this.lift[i] = s.lift;
    this.age[i] = 0;
    this.life[i] = Math.max(0.05, s.life);
    this.alpha[i] = s.alpha ?? 1;
    this.core[k3] = s.core[0];
    this.core[k3 + 1] = s.core[1];
    this.core[k3 + 2] = s.core[2];
    this.edge[k3] = s.edge[0];
    this.edge[k3 + 1] = s.edge[1];
    this.edge[k3 + 2] = s.edge[2];
    this.params[k4] = 0;
    this.params[k4 + 1] = s.size;
    this.params[k4 + 2] = s.shape;
    this.params[k4 + 3] = s.seed;
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    this.mat.uniforms.uAge.value = this.time;
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.remove(i);
        continue;
      }
      const k3 = i * 3;
      this.vel[k3 + 1] += this.lift[i] * dt;
      this.pos[k3] += this.vel[k3] * dt;
      this.pos[k3 + 1] += this.vel[k3 + 1] * dt;
      this.pos[k3 + 2] += this.vel[k3 + 2] * dt;
      i++;
    }
    this.geo.setDrawRange(0, this.count);
    // sem partículas não há o que enviar à GPU (evita subir os arrays inteiros a cada quadro)
    if (this.count === 0) return;
    // fade igual ao gradiente do Godot: entra até 15% da vida, fica inteira até 60%, some no fim
    for (let j = 0; j < this.count; j++) {
      const k = this.age[j] / this.life[j];
      const fade = k < 0.15 ? k / 0.15 : k < 0.6 ? 1 : Math.max(0, (1 - k) / 0.4);
      this.params[j * 4] = fade * this.alpha[j];
    }
    this.aPos.needsUpdate = true;
    this.aCore.needsUpdate = true;
    this.aEdge.needsUpdate = true;
    this.aParams.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.geo.setDrawRange(0, 0);
  }

  /** Remove a partícula i trocando com a última (os arrays continuam densos). */
  private remove(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.pos.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.core.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.edge.copyWithin(i * 3, last * 3, last * 3 + 3);
    this.params.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.lift[i] = this.lift[last];
    this.age[i] = this.age[last];
    this.life[i] = this.life[last];
    this.alpha[i] = this.alpha[last];
  }
}
