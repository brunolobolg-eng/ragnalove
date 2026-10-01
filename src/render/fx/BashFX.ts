import * as THREE from 'three';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import { Flash, FlickerLight, Timeline, type FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';
import { VFX } from './kit/vfxSettings';

/** Momento em que a espada desce (o GameView adia a reação do alvo até aqui). */
export const BASH_IMPACT = 0.29;
const WIND = 0.18;

const C_GATHER = new THREE.Color(3, 1.8, 0.6);
const C_FLASH = new THREE.Color(3.2, 2.6, 1.8);
const C_SPARK = new THREE.Color(3.2, 2.2, 1.0);
const C_SPARK_END = new THREE.Color(1.0, 0.25, 0.04);
const C_DUST = new THREE.Color(0.45, 0.4, 0.34);

/**
 * Investida: energia se acumula na lâmina erguida → descida com fita vertical →
 * impacto pesado (flash, onda de choque, faíscas radiais, poeira, rachadura no chão,
 * hit-stop, tremor, empurrão de câmera e aberração breve) → poeira assentando.
 */
export class BashFX {
  readonly group = new THREE.Group();
  private readonly tl = new Timeline();
  private readonly flashes: Flash[] = [];
  private readonly light: FlickerLight;
  private ribbon?: Ribbon;
  private readonly top: THREE.Vector3;
  private readonly ctrl: THREE.Vector3;
  private readonly hit: THREE.Vector3;
  done = false;

  constructor(attacker: THREE.Vector3, target: THREE.Vector3, kit: FxKit, onImpact?: () => void) {
    const dir = target.clone().sub(attacker).setY(0).normalize();
    this.top = attacker.clone().add(new THREE.Vector3(0, 2.1, 0)).addScaledVector(dir, -0.2);
    this.ctrl = attacker.clone().add(new THREE.Vector3(0, 2.5, 0)).addScaledVector(dir, 0.9);
    this.hit = target.clone().setY(0.35).addScaledVector(dir, -0.15);
    this.light = new FlickerLight(kit.stage, 0xffb060, 0, 4.5, 0.2);
    const P = kit.particles;

    // 1. antecipação: faíscas convergindo para a lâmina erguida
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = this.top.clone().add(new THREE.Vector3(Math.cos(a) * 0.7, (Math.random() - 0.5) * 0.6, Math.sin(a) * 0.7));
      P.glow.emit({ pos: p, vel: this.top.clone().sub(p).multiplyScalar(1 / WIND), life: WIND, size: 0.09, sizeEnd: 0.05, color: C_GATHER });
    }
    // 2. lançamento: a espada desce
    this.tl.at(WIND, () => {
      this.flashes.push(new Flash(this.group, this.top, C_GATHER, 0.9, 0.12));
      this.ribbon = kit.ribbons.acquire(new THREE.Color(1.6, 1.1, 0.5), 0.38, 0.14);
    });
    // 4. impacto
    this.tl.at(BASH_IMPACT, () => {
      onImpact?.();
      const ground = this.hit.clone().setY(0);
      this.flashes.push(new Flash(this.group, this.hit, C_FLASH, 2.2, 0.2));
      P.spark.emit({ pos: this.hit, posJitter: 0.05, vel: new THREE.Vector3(0, 1.8, 0), velJitter: 3.6, life: 0.45, size: 0.12, sizeEnd: 0.02, color: C_SPARK, colorEnd: C_SPARK_END, gravity: 9, drag: 0.8, count: 22 });
      P.smoke.emit({ pos: ground.clone().setY(0.1), posJitter: 0.25, vel: new THREE.Vector3(0, 0.45, 0), velJitter: 1.3, life: 0.9, size: 0.45, sizeEnd: 1.2, color: C_DUST, alpha: 0.55, drag: 2.5, count: 7, spin: 1.5 });
      kit.decals.spawn({ kind: 'ring', pos: ground, size: 0.4, sizeEnd: 2.6, color: new THREE.Color(1.9, 1.4, 0.8).multiplyScalar(VFX.flash), life: 0.35, additive: true, fadeIn: 0.01, fadeOut: 0.75 });
      kit.decals.spawn({ kind: 'crack', pos: ground, size: 1.0 + Math.random() * 0.3, color: new THREE.Color(1, 1, 1), life: 4.5, fadeIn: 0.02, fadeOut: 0.45, dissolve: true, opacity: 0.8 });
      kit.stage.addShake(VISUAL_CONFIG.bash.shake);
      kit.stage.kick(0.12);
      kit.stage.aberrate(0.006);
      kit.hitStop(0.075);
    });
    // 5. rescaldo: poeira baixando devagar
    this.tl.at(BASH_IMPACT + 0.12, () =>
      P.smoke.emit({ pos: this.hit.clone().setY(0.2), posJitter: 0.4, vel: new THREE.Vector3(0, 0.15, 0), velJitter: 0.3, life: 1.3, size: 0.6, sizeEnd: 1.4, color: C_DUST, alpha: 0.3, count: 3, spin: 0.6 }),
    );
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    const t = this.tl.time;
    for (const f of this.flashes) f.update(dt);
    // brilho crescendo na lâmina durante o preparo, pico no impacto
    const gather = Math.min(1, t / WIND);
    const lk = t < BASH_IMPACT ? gather * 1.2 : Math.max(0, 3.4 * (1 - (t - BASH_IMPACT) / 0.25));
    this.light.set(t < BASH_IMPACT ? this.top : this.hit);
    this.light.update(dt, lk);
    if (t >= WIND && t <= BASH_IMPACT) {
      const s = (t - WIND) / (BASH_IMPACT - WIND);
      const e = s * s; // acelera na descida
      const p = new THREE.Vector3()
        .copy(this.top)
        .multiplyScalar((1 - e) * (1 - e))
        .addScaledVector(this.ctrl, 2 * (1 - e) * e)
        .addScaledVector(this.hit, e * e);
      this.ribbon?.push(p);
    } else if (t > BASH_IMPACT) this.ribbon?.stop();
    if (t > BASH_IMPACT + 0.4 && this.flashes.every((f) => f.done)) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.light.release();
    this.group.removeFromParent();
  }
}
