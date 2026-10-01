import * as THREE from 'three';
import type { FxKit } from './kit/FxKit';

/**
 * Espectro de combate (camada de partículas por cima da aura do modelo):
 *  antecipação: fagulhas convergem para o corpo; presença: fiapos subindo em espiral;
 *  rescaldo: fagulhas se dispersam. Só visual, dura o tempo do golpe/magia.
 */
export class SpectreFX {
  readonly group = new THREE.Group();
  private t = 0;
  private acc = 0;
  done = false;

  constructor(
    private readonly at: () => THREE.Vector3 | undefined,
    private readonly color: THREE.Color,
    private readonly dur: number,
    private readonly kit: FxKit,
  ) {
    const p = at();
    if (!p) return;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const from = p.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, (Math.random() - 0.3) * 0.8, Math.sin(a) * 0.9));
      kit.particles.glow.emit({ pos: from, vel: p.clone().sub(from).multiplyScalar(1 / (dur * 0.4)), life: dur * 0.4, size: 0.07, sizeEnd: 0.04, color: this.color });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const p = this.at();
    if (!p || this.t > this.dur) {
      if (p) this.kit.particles.glow.emit({ pos: p, posJitter: 0.3, velJitter: 1.2, life: 0.4, size: 0.06, sizeEnd: 0.01, color: this.color, drag: 2, count: 6 });
      this.done = true;
      return;
    }
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const k = this.t / this.dur;
    if (k < 0.3) return;
    const a = this.t * 9;
    for (let i = 0; i < 2; i++) {
      const ang = a + i * Math.PI;
      this.kit.particles.glow.emit({
        pos: p.clone().add(new THREE.Vector3(Math.cos(ang) * 0.35, -0.4 + Math.random() * 0.4, Math.sin(ang) * 0.35)),
        vel: new THREE.Vector3(-Math.sin(ang) * 0.5, 1.1, Math.cos(ang) * 0.5),
        life: 0.6,
        size: 0.11,
        sizeEnd: 0.02,
        color: this.color,
        colorEnd: this.color.clone().multiplyScalar(0.1),
        drag: 0.6,
        spin: 2,
      });
    }
  }
}
