import * as THREE from 'three';
import { SHARED_FX as K } from '../../../config/fx/shared';
import type { SimEvent } from '../../../core/sim/types';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, groundCircle } from '../kit/Shapes';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';

const rgb = (a: readonly number[]): THREE.Color => new THREE.Color(a[0], a[1], a[2]);

/** Combustão: o fogo estoura no tile atingido, com anel de runas, chamas, faíscas, fumaça e um clarão pequeno. */
class CombustFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly flash: Flash;

  constructor(kit: FxKit, at: THREE.Vector3) {
    const C = K.combust;
    groundCircle(kit, at, { radius: C.ringRadius, color: rgb(C.ringColor), life: C.ringLife, kind: 'runesFire', grow: 0.4, spin: 1.2 });
    kit.particles.fire.emit({
      pos: at.clone().setY(0.2),
      posJitter: C.fireSpread,
      vel: new THREE.Vector3(0, 1.8, 0),
      velJitter: 1.2,
      life: 0.7,
      size: 0.5,
      sizeEnd: 0.1,
      color: rgb(C.fire),
      colorEnd: rgb(C.fireEnd),
      count: C.fireCount,
    });
    kit.particles.spark.emit({
      pos: at.clone().setY(0.6),
      posJitter: 0.2,
      vel: new THREE.Vector3(),
      velJitter: 3.0,
      life: 0.4,
      size: 0.1,
      sizeEnd: 0.02,
      color: rgb(C.sparkColor),
      colorEnd: rgb(C.sparkEnd),
      drag: 2.5,
      count: C.sparks,
    });
    kit.particles.smoke.emit({
      pos: at.clone().setY(0.4),
      posJitter: 0.3,
      vel: new THREE.Vector3(0, 1.0, 0),
      velJitter: 0.4,
      life: 1.0,
      size: 0.4,
      sizeEnd: 1.0,
      color: rgb(C.smokeColor),
      alpha: 0.5,
      count: C.smokeCount,
    });
    this.flash = new Flash(this.group, at.clone().setY(0.6), rgb(C.flashColor), C.flashSize, C.flashLife);
    kit.stage.addShake(C.shake);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.flash.update(dt);
    if (this.flash.done && this.t > K.combust.ringLife) {
      this.done = true;
      disposeFxGroup(this.group);
    }
  }
}

/** Efeitos sem autor de classe (combustão). Retorna true quando assume o evento. */
export function handleShared(e: SimEvent, c: CombatVisualCtx): boolean {
  if (e.type !== 'combust') return false;
  c.add(new CombustFX(c.kit, c.tile(e.x, e.y)));
  return true;
}

export const SHARED_DEMOS: DemoEntry[] = [
  {
    cls: 'mage',
    id: 'combust',
    label: 'Combustão (passivo do Mago): fogo estoura e deixa brasas',
    span: 1.2,
    steps: () => [{ at: 0, e: { type: 'combust', x: 3, y: 0 } }],
  },
];
