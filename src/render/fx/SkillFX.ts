import * as THREE from 'three';
import { Flash, FlickerLight, Timeline, type FxKit } from './kit/FxKit';
import { VFX } from './kit/vfxSettings';

/**
 * Efeitos das habilidades da árvore (Nova Congelante, Tempestade, Provocar, Onda de Choque,
 * Fúria, Combustão). Mesmo kit dos efeitos principais: partículas, decalques, flashes e luz do pool.
 */
abstract class TimedFX {
  readonly group = new THREE.Group();
  protected readonly tl = new Timeline();
  protected readonly flashes: Flash[] = [];
  protected light?: FlickerLight;
  protected lightK = 0;
  protected dur = 1;
  done = false;
  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    for (const f of this.flashes) f.update(dt);
    const t = this.tl.time;
    this.light?.update(dt, this.lightK * Math.max(0, 1 - t / this.dur));
    if (t > this.dur && this.flashes.every((f) => f.done)) {
      this.done = true;
      this.light?.release();
      this.group.removeFromParent();
    }
  }
}

const ICE = new THREE.Color(1.2, 2.2, 3.2);
const ICE_END = new THREE.Color(0.15, 0.35, 0.8);

/** Nova Congelante: anel de gelo que se expande, estilhaços e geada no chão. */
export class NovaFX extends TimedFX {
  constructor(center: THREE.Vector3, radius: number, kit: FxKit) {
    super();
    this.dur = 0.9;
    const P = kit.particles;
    const g = center.clone().setY(0.02);
    this.light = new FlickerLight(kit.stage, 0x8fd0ff, 0, 7, 0.15);
    this.light.set(center.clone().setY(1));
    this.lightK = 3.2;
    this.flashes.push(new Flash(this.group, center.clone().setY(0.8), ICE, 2.4, 0.22));
    kit.decals.spawn({ kind: 'ring', pos: g, size: 0.5, sizeEnd: radius * 2.6, color: ICE.clone().multiplyScalar(VFX.flash), life: 0.4, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    kit.decals.spawn({ kind: 'frost', pos: g, size: radius * 2.2, color: new THREE.Color(1, 1, 1), life: 5, fadeIn: 0.05, fadeOut: 0.4, dissolve: true, opacity: 0.85 });
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.15, Math.sin(a)).multiplyScalar(radius * 3.4);
      P.spark.emit({ pos: center.clone().setY(0.4), vel: v, velJitter: 0.8, life: 0.4, size: 0.1, sizeEnd: 0.02, color: ICE, colorEnd: ICE_END, drag: 2, count: 1 });
    }
    P.glow.emit({ pos: center.clone().setY(0.3), posJitter: radius * 0.8, vel: new THREE.Vector3(0, 0.9, 0), velJitter: 0.4, life: 1.1, size: 0.12, sizeEnd: 0.03, color: ICE, colorEnd: ICE_END, count: 30 });
    P.smoke.emit({ pos: g.clone().setY(0.15), posJitter: radius * 0.7, vel: new THREE.Vector3(0, 0.25, 0), velJitter: 0.4, life: 1.4, size: 0.6, sizeEnd: 1.4, color: new THREE.Color(0.7, 0.85, 1), alpha: 0.35, count: 10, spin: 0.5 });
    kit.stage.addShake(0.08);
    kit.stage.kick(0.08);
  }
}

/** Cristais de gelo em volta de um inimigo congelado (partículas lentas). */
export function frostTick(kit: FxKit, pos: THREE.Vector3): void {
  kit.particles.glow.emit({ pos: pos.clone().setY(0.5 + Math.random() * 0.8), posJitter: 0.25, vel: new THREE.Vector3(0, 0.15, 0), velJitter: 0.1, life: 0.6, size: 0.07, sizeEnd: 0.02, color: ICE, colorEnd: ICE_END, count: 1 });
}

const BOLT = new THREE.Color(2.4, 2.2, 3.4);
const BOLT_END = new THREE.Color(0.5, 0.3, 1.2);

/** Tempestade Elétrica: raios em zigue-zague caindo do céu nos alvos. */
export class StormFX extends TimedFX {
  constructor(targets: THREE.Vector3[], kit: FxKit) {
    super();
    this.dur = 0.35 + targets.length * 0.07 + 0.3;
    const P = kit.particles;
    this.light = new FlickerLight(kit.stage, 0xc8b8ff, 0, 9, 0.6);
    this.lightK = 4;
    targets.forEach((t, i) => {
      this.tl.at(0.05 + i * 0.07, () => {
        const top = t.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 7, (Math.random() - 0.5) * 1.5));
        const ground = t.clone().setY(0.1);
        // raio: caminho quebrado desenhado com pontos brilhantes densos
        let prev = top.clone();
        const segs = 9;
        for (let s = 1; s <= segs; s++) {
          const k = s / segs;
          const p = top.clone().lerp(ground, k);
          if (s < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7));
          const d = p.distanceTo(prev);
          const n = Math.ceil(d / 0.07);
          for (let j = 0; j < n; j++) P.glow.emit({ pos: prev.clone().lerp(p, j / n), life: 0.16, size: 0.13, sizeEnd: 0.05, color: BOLT, colorEnd: BOLT_END, count: 1 });
          prev = p;
        }
        this.light?.set(ground.clone().setY(1.5));
        this.flashes.push(new Flash(this.group, ground.clone().setY(0.5), BOLT, 2.6, 0.2));
        P.spark.emit({ pos: ground.clone().setY(0.2), vel: new THREE.Vector3(0, 2.4, 0), velJitter: 3.2, life: 0.4, size: 0.1, sizeEnd: 0.02, color: BOLT, colorEnd: BOLT_END, gravity: 8, count: 14 });
        kit.decals.spawn({ kind: 'scorch', pos: ground, size: 1.1, color: new THREE.Color(0.6, 0.55, 0.8), life: 3.5, fadeIn: 0.02, fadeOut: 0.5, dissolve: true, opacity: 0.7 });
        kit.decals.spawn({ kind: 'ring', pos: ground, size: 0.3, sizeEnd: 2.2, color: BOLT.clone().multiplyScalar(VFX.flash * 0.7), life: 0.3, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
        kit.stage.addShake(0.06);
        kit.stage.aberrate(0.004);
      });
    });
  }
}

const RAGE = new THREE.Color(3, 0.8, 0.3);
const RAGE_END = new THREE.Color(0.6, 0.05, 0.02);

/** Provocar: grito de guerra — anel vermelho que "puxa" para dentro. */
export class TauntFX extends TimedFX {
  constructor(center: THREE.Vector3, radius: number, kit: FxKit) {
    super();
    this.dur = 0.8;
    const g = center.clone().setY(0.03);
    this.flashes.push(new Flash(this.group, center.clone().setY(1.6), RAGE, 1.6, 0.25));
    kit.decals.spawn({ kind: 'ring', pos: g, size: radius * 2.6, sizeEnd: 0.6, color: RAGE.clone().multiplyScalar(VFX.flash * 0.8), life: 0.5, additive: true, fadeIn: 0.05, fadeOut: 0.4 });
    kit.decals.spawn({ kind: 'ring', pos: g, size: radius * 2.2, sizeEnd: 0.4, color: RAGE.clone().multiplyScalar(VFX.flash * 0.5), life: 0.65, additive: true, fadeIn: 0.1, fadeOut: 0.4 });
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const p = center.clone().add(new THREE.Vector3(Math.cos(a) * radius, 0.4, Math.sin(a) * radius));
      kit.particles.glow.emit({ pos: p, vel: center.clone().setY(0.8).sub(p).multiplyScalar(1.6), life: 0.55, size: 0.1, sizeEnd: 0.03, color: RAGE, colorEnd: RAGE_END, count: 1 });
    }
    kit.stage.addShake(0.07);
  }
}

/** Onda de Choque: golpe no chão com anéis, rachaduras e poeira. */
export class ShockwaveFX extends TimedFX {
  constructor(center: THREE.Vector3, radius: number, kit: FxKit) {
    super();
    this.dur = 1.0;
    const P = kit.particles;
    const g = center.clone().setY(0.03);
    this.light = new FlickerLight(kit.stage, 0xffa060, 0, 7, 0.3);
    this.light.set(center.clone().setY(1));
    this.tl.at(0.22, () => {
      this.lightK = 3.4;
      this.flashes.push(new Flash(this.group, center.clone().setY(0.4), new THREE.Color(3, 2.2, 1.2), 3, 0.22));
      kit.decals.spawn({ kind: 'ring', pos: g, size: 0.6, sizeEnd: radius * 3, color: new THREE.Color(2, 1.4, 0.8).multiplyScalar(VFX.flash), life: 0.45, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
      kit.decals.spawn({ kind: 'ring', pos: g, size: 0.4, sizeEnd: radius * 2, color: new THREE.Color(1.6, 1.0, 0.6).multiplyScalar(VFX.flash), life: 0.6, additive: true, fadeIn: 0.05, fadeOut: 0.6 });
      kit.decals.spawn({ kind: 'crack', pos: g, size: radius * 1.6, color: new THREE.Color(1, 1, 1), life: 5, fadeIn: 0.02, fadeOut: 0.4, dissolve: true, opacity: 0.9 });
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        P.smoke.emit({ pos: g.clone().setY(0.15), vel: new THREE.Vector3(Math.cos(a), 0.1, Math.sin(a)).multiplyScalar(radius * 2.2), velJitter: 0.5, life: 0.9, size: 0.5, sizeEnd: 1.3, color: new THREE.Color(0.45, 0.4, 0.34), alpha: 0.5, drag: 2.2, count: 1, spin: 1 });
      }
      P.spark.emit({ pos: g.clone().setY(0.2), vel: new THREE.Vector3(0, 3, 0), velJitter: 4, life: 0.5, size: 0.1, sizeEnd: 0.02, color: new THREE.Color(3, 2, 0.8), colorEnd: new THREE.Color(0.8, 0.2, 0.02), gravity: 9, count: 26 });
      kit.stage.addShake(0.22);
      kit.stage.kick(0.2);
      kit.stage.aberrate(0.006);
      kit.hitStop(0.08);
    });
  }
}

/** Fúria: estouro de chamas vermelhas no Guerreiro (a aura contínua é emitida pelo GameView). */
export class FuryFX extends TimedFX {
  constructor(center: THREE.Vector3, kit: FxKit) {
    super();
    this.dur = 0.6;
    this.flashes.push(new Flash(this.group, center.clone().setY(1.1), RAGE, 2.2, 0.25));
    kit.particles.fire.emit({ pos: center.clone().setY(0.3), posJitter: 0.35, vel: new THREE.Vector3(0, 2.4, 0), velJitter: 0.8, life: 0.7, size: 0.35, sizeEnd: 0.1, color: RAGE, colorEnd: RAGE_END, count: 24 });
    kit.decals.spawn({ kind: 'ring', pos: center.clone().setY(0.03), size: 0.4, sizeEnd: 2.4, color: RAGE.clone().multiplyScalar(VFX.flash * 0.8), life: 0.35, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    kit.stage.kick(0.1);
  }
}

export function furyTick(kit: FxKit, pos: THREE.Vector3): void {
  kit.particles.fire.emit({ pos: pos.clone().setY(0.2), posJitter: 0.3, vel: new THREE.Vector3(0, 1.6, 0), velJitter: 0.4, life: 0.45, size: 0.2, sizeEnd: 0.05, color: RAGE, colorEnd: RAGE_END, count: 1 });
}

export function healTick(kit: FxKit, pos: THREE.Vector3): void {
  kit.particles.glow.emit({ pos: pos.clone().setY(0.6), posJitter: 0.3, vel: new THREE.Vector3(0, 1.1, 0), velJitter: 0.2, life: 0.6, size: 0.08, sizeEnd: 0.02, color: new THREE.Color(0.8, 2.6, 0.9), colorEnd: new THREE.Color(0.1, 0.5, 0.1), count: 2 });
}

export function combustBurst(kit: FxKit, pos: THREE.Vector3): void {
  kit.particles.fire.emit({ pos: pos.clone().setY(0.3), posJitter: 0.4, vel: new THREE.Vector3(0, 1.2, 0), velJitter: 1.8, life: 0.45, size: 0.25, sizeEnd: 0.06, color: new THREE.Color(3, 1.3, 0.3), colorEnd: new THREE.Color(0.5, 0.08, 0), count: 6 });
}

/**
 * Aura cosmética do refino (+5 em diante). Só visual.
 * +5/+6: brilho prateado pulsante · +7/+8: faíscas douradas em espiral · +9/+10: aura na cor do herói.
 */
export function refineAuraTick(kit: FxKit, pos: THREE.Vector3, refine: number, heroColor: THREE.Color, t: number): void {
  const P = kit.particles;
  if (refine >= 5) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.6);
    P.glow.emit({ pos: pos.clone().setY(0.08), posJitter: 0.32, vel: new THREE.Vector3(0, 0.35, 0), velJitter: 0.08, life: 0.9, size: 0.09 * pulse, sizeEnd: 0.02, color: new THREE.Color(1.6, 1.7, 1.9).multiplyScalar(pulse), colorEnd: new THREE.Color(0.3, 0.35, 0.45), count: 1 });
  }
  if (refine >= 7) {
    const a = t * 4.2;
    const r = 0.42;
    P.spark.emit({ pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.15, Math.sin(a) * r)), vel: new THREE.Vector3(-Math.sin(a) * 0.6, 1.3, Math.cos(a) * 0.6), life: 0.8, size: 0.06, sizeEnd: 0.015, color: new THREE.Color(3, 2.2, 0.7), colorEnd: new THREE.Color(0.8, 0.4, 0.05), count: 1 });
  }
  if (refine >= 9) {
    const a = -t * 3;
    for (let i = 0; i < 2; i++) {
      const b = a + i * Math.PI;
      P.glow.emit({ pos: pos.clone().add(new THREE.Vector3(Math.cos(b) * 0.55, 0.9 + Math.sin(t * 2 + i) * 0.4, Math.sin(b) * 0.55)), life: 0.5, size: 0.12, sizeEnd: 0.03, color: heroColor.clone().multiplyScalar(2.2), colorEnd: heroColor.clone().multiplyScalar(0.3), count: 1 });
    }
  }
}

/** Anel no chão das auras +9 (decalque renovado periodicamente). */
export function refineRing(kit: FxKit, pos: THREE.Vector3, heroColor: THREE.Color): void {
  kit.decals.spawn({ kind: 'runesFrost', pos: pos.clone().setY(0.02), size: 1.5, color: heroColor.clone().multiplyScalar(1.4), life: 1.3, additive: true, fadeIn: 0.3, fadeOut: 0.4, spin: 0.6 });
}

// ---------------- Arqueira ----------------
const ARROW_SPEED = 16;
let arrowGeo: THREE.BufferGeometry | undefined;
function arrowMesh(): THREE.Mesh {
  if (!arrowGeo) {
    const shaft = new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4).rotateX(Math.PI / 2);
    const head = new THREE.ConeGeometry(0.035, 0.1, 4).rotateX(Math.PI / 2).translate(0, 0, 0.32);
    const fl = new THREE.BoxGeometry(0.06, 0.005, 0.1).translate(0, 0, -0.24);
    arrowGeo = mergeGeo([shaft, head, fl]);
  }
  return new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xf2e2c0 }));
}
function mergeGeo(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.attributes.position.array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return out;
}

/** Flecha em arco leve até o alvo, com rastro brilhante e faíscas no impacto. */
export class ArrowFX extends TimedFX {
  static impactDelay(from: THREE.Vector3, to: THREE.Vector3): number {
    return 0.18 + from.distanceTo(to) / ARROW_SPEED;
  }
  private readonly arrow = arrowMesh();
  private readonly flight: number;
  constructor(
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly kit: FxKit,
    private readonly crit: boolean,
    private readonly color = new THREE.Color(1.6, 2.2, 1.2),
  ) {
    super();
    this.flight = from.distanceTo(to) / ARROW_SPEED;
    this.dur = 0.18 + this.flight + 0.2;
    this.arrow.visible = false;
    this.group.add(this.arrow);
    this.tl.at(0.18 + this.flight, () => {
      this.arrow.visible = false;
      this.flashes.push(new Flash(this.group, to, crit ? new THREE.Color(3.2, 2.4, 0.8) : this.color, crit ? 1.6 : 0.8, 0.14));
      kit.particles.spark.emit({ pos: to, vel: new THREE.Vector3(0, 1.2, 0), velJitter: 2.4, life: 0.3, size: 0.07, sizeEnd: 0.02, color: crit ? new THREE.Color(3, 2.2, 0.6) : this.color, count: crit ? 14 : 6, gravity: 6 });
      if (crit) kit.stage.addShake(0.04);
    });
  }
  override update(dt: number): void {
    super.update(dt);
    const t = this.tl.time - 0.18;
    if (t < 0 || t > this.flight) return;
    const k = t / this.flight;
    const p = this.from.clone().lerp(this.to, k);
    p.y += Math.sin(k * Math.PI) * Math.min(0.8, this.flight * 2.2);
    const ahead = this.from.clone().lerp(this.to, Math.min(1, k + 0.02));
    ahead.y += Math.sin(Math.min(1, k + 0.02) * Math.PI) * Math.min(0.8, this.flight * 2.2);
    this.arrow.visible = true;
    this.arrow.position.copy(p);
    this.arrow.lookAt(ahead);
    this.kit.particles.glow.emit({ pos: p, life: 0.18, size: this.crit ? 0.09 : 0.05, sizeEnd: 0.01, color: this.crit ? new THREE.Color(2.6, 2, 0.6) : this.color, count: 1 });
  }
}

/** Chuva de Flechas: dezenas de flechas caindo sobre a área, poeira e marcas no chão. */
export class RainFX extends TimedFX {
  static readonly IMPACT = 0.55;
  private readonly arrows: { m: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t0: number }[] = [];
  constructor(center: THREE.Vector3, radius: number, kit: FxKit, fire: boolean) {
    super();
    this.dur = 1.1;
    const half = radius + 0.5;
    const n = 10 + radius * 10;
    for (let i = 0; i < n; i++) {
      const to = center.clone().add(new THREE.Vector3((Math.random() * 2 - 1) * half, 0.05, (Math.random() * 2 - 1) * half));
      const from = to.clone().add(new THREE.Vector3(-1.2, 7, 1.5));
      const m = arrowMesh();
      m.visible = false;
      this.group.add(m);
      this.arrows.push({ m, from, to, t0: 0.3 + Math.random() * 0.3 });
    }
    // disparo para o alto
    kit.particles.glow.emit({ pos: center.clone().setY(6), posJitter: half, vel: new THREE.Vector3(0.3, -8, -0.3), life: 0.3, size: 0.05, sizeEnd: 0.02, color: new THREE.Color(1.8, 2, 1.4), count: 12 });
    this.tl.at(RainFX.IMPACT, () => {
      const g = center.clone().setY(0.03);
      kit.decals.spawn({ kind: fire ? 'scorch' : 'crack', pos: g, size: half * 2, color: new THREE.Color(1, 1, 1), life: 3, fadeIn: 0.05, fadeOut: 0.5, dissolve: true, opacity: 0.6 });
      kit.particles.smoke.emit({ pos: g.clone().setY(0.1), posJitter: half, vel: new THREE.Vector3(0, 0.4, 0), velJitter: 0.6, life: 0.9, size: 0.4, sizeEnd: 1, color: new THREE.Color(0.45, 0.4, 0.34), alpha: 0.4, count: 8, spin: 1 });
      kit.stage.addShake(0.05);
    });
  }
  override update(dt: number): void {
    super.update(dt);
    const t = this.tl.time;
    for (const a of this.arrows) {
      const k = (t - a.t0) / 0.25;
      if (k < 0) continue;
      if (k > 1) {
        a.m.visible = k < 3; // fica cravada um instante
        a.m.position.copy(a.to).add(new THREE.Vector3(0.1, 0.18, -0.12));
        continue;
      }
      a.m.visible = true;
      a.m.position.copy(a.from).lerp(a.to, k);
      a.m.lookAt(a.to.clone().add(new THREE.Vector3(1.2, -7, -1.5)));
    }
  }
}

/** Flecha Perfurante: rastro reto e brilhante até o fim do alcance. */
export class PierceFX extends TimedFX {
  constructor(from: THREE.Vector3, to: THREE.Vector3, kit: FxKit) {
    super();
    this.dur = 0.5;
    const n = Math.ceil(from.distanceTo(to) / 0.08);
    for (let i = 0; i <= n; i++)
      kit.particles.glow.emit({ pos: from.clone().lerp(to, i / n), vel: new THREE.Vector3(0, 0.2, 0), life: 0.3, size: 0.1, sizeEnd: 0.02, color: new THREE.Color(1.4, 2.2, 3.2), count: 1 });
    this.flashes.push(new Flash(this.group, from, new THREE.Color(1.6, 2.4, 3.2), 1.2, 0.15));
    kit.decals.spawn({ kind: 'ring', pos: from.clone().setY(0.03), size: 0.3, sizeEnd: 1.8, color: new THREE.Color(1, 1.6, 2.2).multiplyScalar(VFX.flash), life: 0.3, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    kit.stage.kick(0.06);
  }
}

const FOCUS = new THREE.Color(0.8, 2.6, 1.0);
/** Foco do Caçador: estouro verde e anéis. */
export class FocusFX extends TimedFX {
  constructor(center: THREE.Vector3, kit: FxKit) {
    super();
    this.dur = 0.6;
    this.flashes.push(new Flash(this.group, center.clone().setY(1.1), FOCUS, 2, 0.25));
    kit.decals.spawn({ kind: 'ring', pos: center.clone().setY(0.03), size: 0.4, sizeEnd: 2.2, color: FOCUS.clone().multiplyScalar(VFX.flash * 0.8), life: 0.35, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    kit.particles.glow.emit({ pos: center.clone().setY(0.3), posJitter: 0.4, vel: new THREE.Vector3(0, 2, 0), velJitter: 0.6, life: 0.7, size: 0.1, sizeEnd: 0.02, color: FOCUS, count: 20 });
  }
}
export function focusTick(kit: FxKit, pos: THREE.Vector3): void {
  kit.particles.glow.emit({ pos: pos.clone().setY(0.3), posJitter: 0.3, vel: new THREE.Vector3(0, 1.4, 0), velJitter: 0.3, life: 0.5, size: 0.07, sizeEnd: 0.02, color: FOCUS, count: 1 });
}

// ---------------- Magias dos monstros ----------------
const SHADOW = new THREE.Color(1.4, 0.35, 2.4);
const SHADOW_END = new THREE.Color(0.25, 0.02, 0.4);

/** Seta Sombria do Necromante: orbe violeta com rastro. */
export class ShadowBoltFX extends TimedFX {
  static impactDelay(from: THREE.Vector3, to: THREE.Vector3): number {
    return 0.25 + from.distanceTo(to) / 9;
  }
  private readonly flight: number;
  constructor(
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly kit: FxKit,
  ) {
    super();
    this.flight = from.distanceTo(to) / 9;
    this.dur = 0.25 + this.flight + 0.2;
    kit.particles.glow.emit({ pos: from, posJitter: 0.2, vel: new THREE.Vector3(0, 0.6, 0), velJitter: 0.4, life: 0.3, size: 0.1, sizeEnd: 0.02, color: SHADOW, colorEnd: SHADOW_END, count: 8 });
    this.tl.at(0.25 + this.flight, () => {
      this.flashes.push(new Flash(this.group, to, SHADOW, 1.1, 0.16));
      kit.particles.glow.emit({ pos: to, velJitter: 2, life: 0.35, size: 0.1, sizeEnd: 0.02, color: SHADOW, colorEnd: SHADOW_END, count: 12 });
    });
  }
  override update(dt: number): void {
    super.update(dt);
    const t = this.tl.time - 0.25;
    if (t < 0 || t > this.flight) return;
    const p = this.from.clone().lerp(this.to, t / this.flight);
    p.y += Math.sin((t / this.flight) * Math.PI) * 0.4;
    this.kit.particles.glow.emit({ pos: p, posJitter: 0.04, life: 0.25, size: 0.16, sizeEnd: 0.03, color: SHADOW, colorEnd: SHADOW_END, count: 2 });
  }
}

/** Pisão do chefe/elite: anel de choque escuro no chão. */
export class StompFX extends TimedFX {
  constructor(center: THREE.Vector3, radius: number, kit: FxKit) {
    super();
    this.dur = 0.7;
    const g = center.clone().setY(0.03);
    kit.decals.spawn({ kind: 'ring', pos: g, size: 0.5, sizeEnd: (radius * 2 + 1) * 1.3, color: new THREE.Color(1.8, 0.5, 0.4).multiplyScalar(VFX.flash), life: 0.4, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    kit.decals.spawn({ kind: 'crack', pos: g, size: radius * 2 + 1, color: new THREE.Color(1, 1, 1), life: 3.5, fadeIn: 0.02, fadeOut: 0.4, dissolve: true, opacity: 0.7 });
    kit.particles.smoke.emit({ pos: g.clone().setY(0.15), posJitter: radius * 0.6, vel: new THREE.Vector3(0, 0.5, 0), velJitter: 1.4, life: 0.8, size: 0.5, sizeEnd: 1.2, color: new THREE.Color(0.4, 0.34, 0.3), alpha: 0.5, drag: 2, count: 10, spin: 1 });
    kit.stage.addShake(0.14);
  }
}

/** Aviso do meteoro: círculo vermelho que se fecha até o impacto. */
export function telegraph(kit: FxKit, pos: THREE.Vector3, radius: number, seconds: number): void {
  const g = pos.clone().setY(0.04);
  const s = radius * 2 + 1;
  // área fixa (borda brilhante) + disco que "enche" do centro até a borda = tempo até o impacto
  kit.decals.spawn({ kind: 'aoe', pos: g, size: s, color: new THREE.Color(2.4, 0.3, 0.12), life: seconds, additive: true, fadeIn: 0.12, fadeOut: 0.04, spin: 0.4 });
  kit.decals.spawn({ kind: 'disc', pos: g.clone().setY(0.045), size: 0.05, sizeEnd: s * 0.97, linear: true, color: new THREE.Color(1.6, 0.18, 0.06), life: seconds, additive: true, fadeIn: 0.05, fadeOut: 0.04 });
}

/** Meteoro: bola de fogo caindo do céu, impacto com clarão, fogo e cratera. */
export class MeteorFX extends TimedFX {
  private readonly top: THREE.Vector3;
  constructor(
    private readonly at: THREE.Vector3,
    radius: number,
    private readonly kit: FxKit,
  ) {
    super();
    this.dur = 1.0;
    this.top = at.clone().add(new THREE.Vector3(2.5, 9, -3));
    this.light = new FlickerLight(kit.stage, 0xff7a2a, 0, 8, 0.4);
    this.tl.at(0.28, () => {
      this.lightK = 4;
      this.light?.set(at.clone().setY(1));
      this.flashes.push(new Flash(this.group, at.clone().setY(0.4), new THREE.Color(3.4, 1.8, 0.6), 3.2, 0.25));
      kit.particles.fire.emit({ pos: at.clone().setY(0.2), posJitter: radius * 0.5, vel: new THREE.Vector3(0, 2.4, 0), velJitter: 2.6, life: 0.6, size: 0.4, sizeEnd: 0.1, color: new THREE.Color(3, 1.4, 0.3), colorEnd: new THREE.Color(0.5, 0.08, 0), count: 26 });
      kit.particles.spark.emit({ pos: at.clone().setY(0.3), vel: new THREE.Vector3(0, 3, 0), velJitter: 5, life: 0.6, size: 0.1, sizeEnd: 0.02, color: new THREE.Color(3, 2, 0.6), colorEnd: new THREE.Color(0.8, 0.2, 0), gravity: 9, count: 24 });
      kit.particles.smoke.emit({ pos: at.clone().setY(0.4), posJitter: radius * 0.6, vel: new THREE.Vector3(0, 1.2, 0), velJitter: 1, life: 1.6, size: 0.7, sizeEnd: 1.8, color: new THREE.Color(0.2, 0.17, 0.15), alpha: 0.6, count: 10, spin: 0.8 });
      kit.decals.spawn({ kind: 'scorch', pos: at.clone().setY(0.03), size: (radius * 2 + 1) * 1.1, color: new THREE.Color(1, 1, 1), life: 6, fadeIn: 0.02, fadeOut: 0.3, dissolve: true, opacity: 0.9 });
      kit.stage.addShake(0.22);
      kit.stage.kick(0.12);
      kit.hitStop(0.05);
    });
  }
  override update(dt: number): void {
    super.update(dt);
    const t = this.tl.time;
    if (t > 0.28) return;
    const p = this.top.clone().lerp(this.at, t / 0.28);
    this.kit.particles.fire.emit({ pos: p, posJitter: 0.1, life: 0.3, size: 0.45, sizeEnd: 0.1, color: new THREE.Color(3, 1.5, 0.4), colorEnd: new THREE.Color(0.4, 0.05, 0), count: 3 });
    this.kit.particles.smoke.emit({ pos: p, life: 0.6, size: 0.3, sizeEnd: 0.7, color: new THREE.Color(0.25, 0.2, 0.18), alpha: 0.5, count: 1 });
  }
}

// ---------------- Cléria divina (cura) ----------------
const HOLY = new THREE.Color(3, 2.5, 1.2);
const HOLY_END = new THREE.Color(0.6, 0.4, 0.1);

/** Luz sagrada subindo no aliado (Cura, Bênção). */
export function holyBurst(kit: FxKit, pos: THREE.Vector3, count = 14): void {
  kit.particles.glow.emit({ pos: pos.clone().setY(0.3), posJitter: 0.35, vel: new THREE.Vector3(0, 1.8, 0), velJitter: 0.4, life: 0.8, size: 0.12, sizeEnd: 0.03, color: HOLY, colorEnd: HOLY_END, count });
  kit.particles.spark.emit({ pos: pos.clone().setY(1.6), posJitter: 0.2, vel: new THREE.Vector3(0, -1.2, 0), velJitter: 0.6, life: 0.5, size: 0.08, sizeEnd: 0.02, color: HOLY, colorEnd: HOLY_END, count: 6 });
}

/** Santuário: círculo de runas douradas no chão enquanto dura. */
export function sanctuaryDecal(kit: FxKit, pos: THREE.Vector3, radius: number, seconds: number): void {
  const s = radius * 2 + 1;
  kit.decals.spawn({ kind: 'runesFrost', pos: pos.clone().setY(0.035), size: s * 1.05, color: new THREE.Color(2.2, 1.7, 0.6), life: seconds, additive: true, fadeIn: 0.3, fadeOut: 0.5, spin: 0.15 });
  kit.decals.spawn({ kind: 'glow', pos: pos.clone().setY(0.03), size: s * 1.3, color: new THREE.Color(1.2, 0.95, 0.4), life: seconds, additive: true, fadeIn: 0.3, fadeOut: 0.5 });
  holyBurst(kit, pos, 20);
}

/** Escudo Sagrado: anel de luz azul-dourada em volta do aliado. */
export function shieldBurst(kit: FxKit, pos: THREE.Vector3): void {
  kit.decals.spawn({ kind: 'ring', pos: pos.clone().setY(0.04), size: 0.4, sizeEnd: 1.8, color: new THREE.Color(1.6, 1.9, 3), life: 0.5, additive: true, fadeIn: 0.02, fadeOut: 0.6 });
  kit.particles.glow.emit({ pos: pos.clone().setY(0.8), posJitter: 0.45, vel: new THREE.Vector3(0, 0.4, 0), velJitter: 0.5, life: 0.7, size: 0.1, sizeEnd: 0.03, color: new THREE.Color(1.6, 2, 3.2), colorEnd: new THREE.Color(0.2, 0.3, 0.8), count: 16 });
}

/** Armadilhas da Arqueira: explosão (mina/claymore) ou estouro de gelo (congelante). */
export function trapBlast(kit: FxKit, pos: THREE.Vector3, kind: 'mine' | 'freeze' | 'claymore', radius: number): void {
  if (kind === 'freeze') {
    kit.decals.spawn({ kind: 'frost', pos: pos.clone().setY(0.03), size: (radius * 2 + 1) * 1.1, color: new THREE.Color(1, 1, 1), life: 3, fadeIn: 0.05, fadeOut: 0.4, dissolve: true, opacity: 0.85 });
    kit.particles.spark.emit({ pos: pos.clone().setY(0.4), vel: new THREE.Vector3(0, 2, 0), velJitter: 3, life: 0.5, size: 0.1, sizeEnd: 0.02, color: ICE, colorEnd: ICE_END, drag: 2, count: 24 });
    kit.stage.addShake(0.06);
    return;
  }
  const big = kind === 'claymore';
  kit.particles.fire.emit({ pos: pos.clone().setY(0.2), posJitter: radius * 0.45, vel: new THREE.Vector3(0, 2.2, 0), velJitter: big ? 2.8 : 1.8, life: 0.55, size: big ? 0.4 : 0.28, sizeEnd: 0.08, color: new THREE.Color(3, 1.4, 0.3), colorEnd: new THREE.Color(0.5, 0.08, 0), count: big ? 30 : 14 });
  kit.particles.smoke.emit({ pos: pos.clone().setY(0.4), posJitter: radius * 0.5, vel: new THREE.Vector3(0, 1.1, 0), velJitter: 0.9, life: 1.4, size: 0.6, sizeEnd: 1.5, color: new THREE.Color(0.2, 0.17, 0.15), alpha: 0.55, count: big ? 10 : 5, spin: 0.8 });
  kit.decals.spawn({ kind: 'scorch', pos: pos.clone().setY(0.03), size: (radius * 2 + 1) * 1.05, color: new THREE.Color(1, 1, 1), life: 5, fadeIn: 0.02, fadeOut: 0.3, dissolve: true, opacity: 0.85 });
  kit.stage.addShake(big ? 0.2 : 0.1);
  if (big) kit.hitStop(0.04);
}
