import * as THREE from 'three';
import { soulTexture } from './kit/vfxTextures';
import { Flash, type FxKit } from './kit/FxKit';
import type { Ribbon } from './kit/Ribbons';

const C_SOUL = new THREE.Color(0.8, 2.2, 1.9);
const C_CORE = new THREE.Color(2.2, 3.0, 2.8);
const C_TRAIL = new THREE.Color(0.25, 1.1, 0.95);
const C_MOTE = new THREE.Color(0.7, 2.0, 1.7);
const C_MOTE_END = new THREE.Color(0.05, 0.25, 0.3);

const RISE = 0.28;

/**
 * Roubo de alma (5 fases, curto para não travar o ritmo da horda):
 *  antecipação: a essência se desprende do corpo girando com fagulhas
 *  lançamento/trajetória: curva até o herói com fita ciano e cabeça brilhante
 *  impacto: absorção no peito (anel de fagulhas + flash + brilho do herói)
 *  rescaldo: fagulhas que se apagam
 */
export class SoulFX {
  readonly group = new THREE.Group();
  private readonly orb: THREE.Sprite;
  private readonly core: THREE.Sprite;
  private readonly flashes: Flash[] = [];
  private ribbon?: Ribbon;
  private t = 0;
  private readonly dur: number;
  private readonly p0: THREE.Vector3;
  private readonly lift: THREE.Vector3;
  private readonly side: number;
  private arrived = false;
  done = false;

  constructor(
    from: THREE.Vector3,
    private readonly target: () => THREE.Vector3 | undefined,
    private readonly kit: FxKit,
    private readonly onArrive: () => void,
  ) {
    this.p0 = from.clone().setY(0.45);
    this.lift = this.p0.clone().setY(1.25);
    this.dur = 0.45 + Math.random() * 0.15;
    this.side = Math.random() < 0.5 ? -1 : 1;
    const mk = (c: THREE.Color, s: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: soulTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.setScalar(s);
      sp.renderOrder = 8;
      this.group.add(sp);
      return sp;
    };
    this.orb = mk(C_SOUL, 0.42);
    this.core = mk(C_CORE, 0.16);
    this.group.position.copy(this.p0);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    for (const f of this.flashes) f.update(dt);
    const P = this.kit.particles;
    if (this.arrived) {
      if (this.flashes.every((f) => f.done)) this.dispose();
      return;
    }
    let p: THREE.Vector3;
    if (this.t < RISE) {
      // desprende e sobe em espiral
      const k = this.t / RISE;
      const e = 1 - (1 - k) * (1 - k);
      p = this.p0.clone().lerp(this.lift, e);
      const a = this.t * 18;
      P.glow.emit({ pos: p.clone().add(new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22)), vel: new THREE.Vector3(0, 0.6, 0), life: 0.35, size: 0.07, sizeEnd: 0.02, color: C_MOTE, colorEnd: C_MOTE_END });
      this.orb.scale.setScalar(0.2 + e * 0.25);
    } else {
      const dest = this.target();
      if (!dest) return this.dispose();
      if (!this.ribbon) this.ribbon = this.kit.ribbons.acquire(C_TRAIL, 0.16, 0.2);
      const k = Math.min(1, (this.t - RISE) / this.dur);
      const e = k * k * (3 - 2 * k);
      // Bézier com arco lateral (cada alma faz uma curva diferente)
      const ctrl = this.lift.clone().lerp(dest, 0.5);
      ctrl.y += 0.9;
      const toDest = dest.clone().sub(this.lift);
      ctrl.add(new THREE.Vector3(-toDest.z, 0, toDest.x).normalize().multiplyScalar(0.8 * this.side));
      p = new THREE.Vector3().copy(this.lift).multiplyScalar((1 - e) * (1 - e)).addScaledVector(ctrl, 2 * (1 - e) * e).addScaledVector(dest, e * e);
      this.ribbon?.push(p);
      P.glow.emit({ pos: p, posJitter: 0.05, life: 0.3, size: 0.09, sizeEnd: 0.02, color: C_MOTE, colorEnd: C_MOTE_END });
      if (k >= 1) this.arrive(dest);
    }
    this.group.position.copy(p);
    const pulse = 1 + Math.sin(this.t * 22) * 0.12;
    this.core.scale.setScalar(0.16 * pulse);
  }

  private arrive(at: THREE.Vector3): void {
    this.arrived = true;
    this.ribbon?.stop();
    this.orb.visible = this.core.visible = false;
    this.onArrive();
    const P = this.kit.particles;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      P.glow.emit({ pos: at, vel: new THREE.Vector3(Math.cos(a) * 1.6, 0.4, Math.sin(a) * 1.6), life: 0.35, size: 0.08, sizeEnd: 0.02, color: C_MOTE, colorEnd: C_MOTE_END, drag: 3 });
    }
    this.flashes.push(new Flash(this.group.parent ?? this.group, at, C_SOUL, 0.8, 0.16));
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    this.orb.material.dispose();
    this.core.material.dispose();
    this.group.removeFromParent();
  }
}
