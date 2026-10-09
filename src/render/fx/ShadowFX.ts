import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import type { Unit } from '../../core/sim/types';
import type { FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';

/** Paleta do Assassino: roxo de sombra, fumaça escura e um toque de veneno esverdeado. */
export const C_SHADOW = new THREE.Color(1.5, 0.45, 2.2);
export const C_SHADOW_DARK = new THREE.Color(0.22, 0.07, 0.36);
export const C_TOXIN = new THREE.Color(0.7, 1.5, 0.45);

const UP = new THREE.Vector3(0, 1, 0);
const DASH_TIME = 0.26;
const TAIL = 0.4;

/** Execução: rastro de sombra do assassino até o alvo (fita roxa em arco + fumaça escura caindo atrás). */
export class ShadowDashFX {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private stopped = false;
  private readonly ribbon?: Ribbon;
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;

  constructor(from: THREE.Vector3, to: THREE.Vector3, private readonly kit: FxKit) {
    this.from = from.clone().setY(0.9);
    this.to = to.clone().setY(0.9);
    this.ribbon = kit.ribbons.acquire(C_SHADOW.clone(), 0.24, DASH_TIME + TAIL);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t >= 0 && this.t <= DASH_TIME) {
      const s = this.t / DASH_TIME;
      const p = this.from.clone().lerp(this.to, s).addScaledVector(UP, 0.7 * Math.sin(Math.PI * s));
      const dir = this.to.clone().sub(this.from).normalize();
      this.ribbon?.push(p);
      this.kit.particles.smoke.emit({
        pos: p, posJitter: 0.15, vel: dir.clone().multiplyScalar(-0.6).add(new THREE.Vector3(0, 0.4, 0)), velJitter: 0.4,
        life: 0.9, size: 0.22, sizeEnd: 0.8, color: C_SHADOW_DARK, alpha: 0.5, drag: 2.5, count: 1,
      });
    } else if (this.t > DASH_TIME && !this.stopped) {
      this.stopped = true;
      this.ribbon?.stop();
    }
    if (this.t > DASH_TIME + TAIL) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.group.removeFromParent();
  }
}

/**
 * Veneno: enquanto um inimigo tem dano de veneno ativo, a névoa tóxica sai de dentro dele
 * (fumaça escura + fagulhas esverdeadas). Lê a simulação; não altera nada.
 */
export class PoisonMist {
  private readonly timers = new Map<number, number>();

  update(dt: number, units: Iterable<Unit>, positionOf: (u: Unit) => THREE.Vector3 | undefined, kit: FxKit): void {
    const every = VISUAL_CONFIG.arc.poisonMist.every;
    const live = new Set<number>();
    for (const u of units) {
      if (!u.alive || !u.dots?.some((d) => d.source === 'poison')) continue;
      live.add(u.id);
      const left = (this.timers.get(u.id) ?? 0) - dt;
      if (left > 0) {
        this.timers.set(u.id, left);
        continue;
      }
      this.timers.set(u.id, every);
      const p = positionOf(u);
      if (!p) continue;
      kit.particles.smoke.emit({
        pos: p.clone().setY(0.6), posJitter: 0.25, vel: new THREE.Vector3(0, 0.5, 0), velJitter: 0.4,
        life: 0.9, size: 0.2, sizeEnd: 0.7, color: C_SHADOW_DARK, alpha: 0.45, drag: 1.5, count: 1,
      });
      kit.particles.glow.emit({
        pos: p.clone().setY(0.4), posJitter: 0.3, vel: new THREE.Vector3(0, 0.9, 0), velJitter: 0.3,
        life: 0.5, size: 0.08, sizeEnd: 0.02, color: C_TOXIN, count: 1,
      });
    }
    for (const id of this.timers.keys()) if (!live.has(id)) this.timers.delete(id);
  }
}
