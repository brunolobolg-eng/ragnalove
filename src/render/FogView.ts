import * as THREE from 'three';
import type { Simulation } from '../core/sim/Simulation';
import { tileToWorld } from './coords';
import { softCircle } from './textures';

/**
 * Neblina densa da floresta — só visual. Cada tile de neblina ganha tufos de névoa rasteira
 * que derivam devagar; quando a tocha clareia o tile (estado na simulação), a névoa se desfaz.
 */
export class FogView {
  readonly group = new THREE.Group();
  private readonly mesh?: THREE.InstancedMesh;
  private readonly tiles: { x: number; y: number; base: THREE.Vector3; phase: number; scale: number; k: number }[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private t = 0;

  constructor(private sim: Simulation) {
    const b = sim.board;
    const PER = 3;
    for (let y = 0; y < b.height; y++)
      for (let x = 0; x < b.width; x++) {
        if (!b.hasFog(x, y)) continue;
        for (let i = 0; i < PER; i++) {
          const base = tileToWorld(x, y).add(new THREE.Vector3((hash(x, y, i) - 0.5) * 0.9, 0.15 + i * 0.32 + hash(y, x, i) * 0.25, (hash(x + 7, y, i) - 0.5) * 0.9));
          this.tiles.push({ x, y, base, phase: hash(x, y, i + 3) * 6.28, scale: 1.1 + hash(x, y + 3, i) * 0.9, k: 1 });
        }
      }
    if (!this.tiles.length) return;
    const mat = new THREE.MeshBasicMaterial({ map: softCircle(), color: 0xffffff, transparent: true, opacity: 0.26, depthWrite: false, fog: true });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, this.tiles.length);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 6;
    this.mesh.frustumCulled = false;
    // névoa esverdeada e fria (não "nuvem branca"): mistura com o verde da floresta
    for (let i = 0; i < this.tiles.length; i++) this.mesh.setColorAt(i, this.c.setRGB(0.62 + hash(i, 1, 2) * 0.08, 0.74 + hash(i, 2, 3) * 0.06, 0.7));
    this.group.add(this.mesh);
  }

  bind(sim: Simulation): void {
    this.sim = sim;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose();
  }

  update(dt: number, camQ: THREE.Quaternion): void {
    if (!this.mesh) return;
    this.t += dt;
    for (let i = 0; i < this.tiles.length; i++) {
      const f = this.tiles[i];
      // clareada pela tocha: some suave (2 s)
      const target = this.sim.board.isFogged(f.x, f.y) ? 1 : 0;
      f.k += (target - f.k) * Math.min(1, dt * 1.5);
      const drift = Math.sin(this.t * 0.25 + f.phase) * 0.35;
      this.v.set(f.base.x + drift, f.base.y + Math.sin(this.t * 0.4 + f.phase) * 0.08, f.base.z + Math.cos(this.t * 0.2 + f.phase) * 0.25);
      const sc = f.scale * (0.35 + 0.65 * f.k);
      this.s.set(sc * 1.4, sc, 1);
      this.m.compose(this.v, camQ, f.k < 0.02 ? this.s.set(0, 0, 0) : this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    void this.q;
  }
}

function hash(a: number, b: number, c: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
