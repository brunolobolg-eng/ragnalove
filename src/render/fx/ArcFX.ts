import * as THREE from 'three';
import type { FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';

/** Arco de ataque: a fita varre a frente do herói e deixa um rastro curto que some sozinho. */
export interface ArcOpts {
  /** meia abertura do arco (rad) */
  half: number;
  /** raio final do arco (unidades de mundo) */
  radius: number;
  /** tempo de varredura (s) */
  sweep: number;
  /** atraso até a varredura começar (s): alinha com o golpe da animação */
  delay: number;
  /** altura da varredura (m) */
  height: number;
  /** largura da fita */
  width: number;
  /** cor HDR da fita */
  color: number[];
  /** redemoinho de partículas acompanhando o arco (tufão) */
  swirl: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const TAIL = 0.3;

/**
 * Tufão/rastro de ataque corpo a corpo: uma fita em arco na altura do golpe, do lado de um canto ao outro
 * da frente do herói. Com `swirl`, solta poeira girando em volta do arco (efeito de vento).
 * Discreto: some em menos de meio segundo.
 */
export class ArcFX {
  readonly group = new THREE.Group();
  done = false;
  private t: number;
  private stopped = false;
  private readonly ribbon?: Ribbon;
  private readonly fwd: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private readonly o: ArcOpts;
  private readonly kit: FxKit;

  constructor(center: THREE.Vector3, forward: THREE.Vector3, o: ArcOpts, kit: FxKit) {
    this.center = center.clone();
    this.fwd = forward.clone().setY(0).normalize();
    this.o = o;
    this.kit = kit;
    this.t = -o.delay;
    this.ribbon = kit.ribbons.acquire(new THREE.Color(o.color[0], o.color[1], o.color[2]), o.width, o.sweep + TAIL);
  }

  /** Ponto do arco em s ∈ [0,1], do canto direito para o esquerdo; cresce do herói até o raio final. */
  private at(s: number): THREE.Vector3 {
    const v = this.fwd.clone().applyAxisAngle(UP, this.o.half * (1 - 2 * s));
    const r = this.o.radius * (0.35 + 0.65 * Math.sin((s * Math.PI) / 2));
    return this.center.clone().addScaledVector(v, r).setY(this.o.height);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.t >= 0 && this.t <= this.o.sweep) {
      const s = this.t / this.o.sweep;
      const p = this.at(s);
      this.ribbon?.push(p);
      if (this.o.swirl) {
        const P = this.kit.particles;
        const v = this.at(s).sub(this.center).setY(0).normalize();
        const tangent = new THREE.Vector3().crossVectors(UP, v).multiplyScalar(2.2);
        P.glow.emit({
          pos: p,
          posJitter: 0.15,
          vel: tangent.add(new THREE.Vector3(0, 0.5, 0)),
          velJitter: 0.6,
          life: 0.35,
          size: 0.12,
          sizeEnd: 0.02,
          color: new THREE.Color(this.o.color[0], this.o.color[1], this.o.color[2]).multiplyScalar(0.7),
          count: 2,
        });
      }
    } else if (this.t > this.o.sweep && !this.stopped) {
      this.stopped = true;
      this.ribbon?.stop();
    }
    if (this.t > this.o.sweep + TAIL) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.group.removeFromParent();
  }
}
