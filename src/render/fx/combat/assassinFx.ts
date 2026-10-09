import * as THREE from 'three';
import { ASSASSIN_FX } from '../../../config/fx/assassin';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import type { Ribbon } from '../kit/Ribbons';
import { disposeFxGroup, fxSprite, groundCircle, screenAngle } from '../kit/Shapes';
import { VFX } from '../kit/vfxSettings';

// cores HDR: acima de 1 o bloom transforma em brilho; DARK é o contorno escuro (mistura normal)
const VIOLET = new THREE.Color(1.8, 0.5, 2.6);
const WHITE_VIOLET = new THREE.Color(2.8, 2.2, 3.4);
const DEEP = new THREE.Color(0.9, 0.2, 1.6);
const DARK = new THREE.Color(0.12, 0.03, 0.22);
const UP = new THREE.Vector3(0, 1, 0);
/** altura do peito/mão do assassino, em unidades do mundo */
const LIFT = 1.0;

/** Sprite de vida curta: cresce de s0 a s1 e some. */
interface Timed {
  s: THREE.Sprite;
  t0: number;
  life: number;
  s0: number;
  s1: number;
  fade: boolean;
}

function updateTimed(it: Timed, t: number): void {
  const k = (t - it.t0) / it.life;
  if (k < 0) return;
  if (k >= 1) {
    it.s.visible = false;
    return;
  }
  it.s.scale.setScalar(it.s0 + (it.s1 - it.s0) * Math.sin((k * Math.PI) / 2));
  it.s.material.opacity = it.fade ? (1 - k) * (1 - k) : 1;
}

/**
 * Golpe Furtivo básico (sem crítico): um risco rápido de adaga até o alvo, um arco pequeno e faíscas.
 * Leve de propósito: uma camada só, sem luz, sem hit-stop, sem leque de lâminas.
 */
export class AssassinFlickFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private impacted = false;
  private readonly cfg = ASSASSIN_FX.flick;
  private readonly kit: FxKit;
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly fwd: THREE.Vector3;
  private readonly streak: THREE.Sprite;
  private readonly shadow: THREE.Sprite;
  private readonly ribbon?: Ribbon;
  private readonly timed: Timed[] = [];
  private readonly flashes: Flash[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(attacker: THREE.Vector3, target: THREE.Vector3, facing: THREE.Vector3, kit: FxKit) {
    this.kit = kit;
    this.fwd = facing.clone().setY(0).normalize();
    this.from = attacker.clone().add(UP.clone().multiplyScalar(LIFT)).addScaledVector(this.fwd, 0.3);
    this.to = target.clone().add(UP.clone().multiplyScalar(LIFT));
    this.shadow = fxSprite(this.group, 'trace', DARK, 0.5, { dark: true, opacity: 0 });
    this.streak = fxSprite(this.group, 'trace', WHITE_VIOLET, 0.14, { opacity: 0 });
    this.ribbon = VFX.ribbons ? kit.ribbons.acquire(VIOLET.clone(), 0.06, 0.16) : undefined;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const c = this.cfg;
    const cam = this.kit.stage.camera;
    if (!this.impacted) {
      const s = Math.max(0, (t - 0.04) / (c.impactAt - 0.04));
      if (s > 0 && s < 1) {
        const e = s * s;
        const p = this.tmp.lerpVectors(this.from, this.to, e);
        const q = this.tmp2.lerpVectors(this.from, this.to, Math.min(1, e + 0.12));
        const rot = screenAngle(cam, p, q) + Math.PI / 2;
        this.streak.position.copy(p);
        this.streak.material.rotation = rot;
        this.streak.scale.set(0.16, 0.9, 1);
        this.streak.material.opacity = 1;
        // o rastro escuro vem logo atrás da lâmina (o contraste claro/escuro dá a forma)
        this.shadow.position.copy(p).addScaledVector(this.fwd, -0.35);
        this.shadow.material.rotation = rot;
        this.shadow.scale.set(0.3, 0.9, 1);
        this.shadow.material.opacity = 0.7;
        if (e > 0.35) this.ribbon?.push(p);
      }
      if (t >= c.impactAt) this.strike();
    } else {
      // o risco some logo depois do golpe
      this.streak.material.opacity = Math.max(0, this.streak.material.opacity - dt * 14);
      this.shadow.material.opacity = Math.max(0, this.shadow.material.opacity - dt * 14);
    }
    for (const it of this.timed) updateTimed(it, t);
    for (const f of this.flashes) f.update(dt);
    if (t >= c.life && this.flashes.every((f) => f.done)) this.dispose();
  }

  private strike(): void {
    this.impacted = true;
    const c = this.cfg;
    const to = this.to;
    const cam = this.kit.stage.camera;
    this.ribbon?.stop();
    // arco de corte pequeno, claro sobre um arco escuro, alinhado ao golpe
    const ang = screenAngle(cam, to.clone().addScaledVector(this.fwd, -0.5), to.clone().addScaledVector(this.fwd, 0.5)) + Math.PI / 2;
    const dark = fxSprite(this.group, 'slash', DARK, c.slashSize * 1.06, { dark: true, rot: ang });
    dark.position.copy(to).addScaledVector(this.fwd, -0.12);
    const arc = fxSprite(this.group, 'slash', WHITE_VIOLET, c.slashSize, { rot: ang });
    arc.position.copy(to).addScaledVector(this.fwd, -0.1);
    this.timed.push({ s: arc, t0: c.impactAt, life: 0.16, s0: c.slashSize * 0.8, s1: c.slashSize, fade: true });
    this.timed.push({ s: dark, t0: c.impactAt, life: 0.18, s0: c.slashSize * 0.84, s1: c.slashSize * 1.04, fade: true });
    // sem flash: o básico não pode lavar a arena em branco (o brilho espalha no pós-processamento)
    this.kit.particles.spark.emit({
      pos: to.clone(),
      posJitter: 0.08,
      vel: new THREE.Vector3(),
      velJitter: 3.2,
      life: 0.3,
      size: 0.12,
      sizeEnd: 0.02,
      color: WHITE_VIOLET,
      colorEnd: DEEP,
      drag: 3,
      count: c.sparks,
    });
    this.kit.stage.addShake(c.shake);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    disposeFxGroup(this.group);
  }
}

/**
 * Leque de Lâminas: lâminas saem em leque pela frente do assassino e somem no alcance;
 * cada alvo atingido recebe faíscas e fumaça escura.
 */
export class BladeFanFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly cfg = ASSASSIN_FX.fan;
  private readonly kit: FxKit;
  private readonly origin: THREE.Vector3;
  private readonly blades: { s: THREE.Sprite; dark: THREE.Sprite; dir: THREE.Vector3; t0: number }[] = [];
  private readonly hits: { at: number; pos: THREE.Vector3; done: boolean }[] = [];
  private readonly flashes: Flash[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(origin: THREE.Vector3, facing: THREE.Vector3, hitPoints: THREE.Vector3[], kit: FxKit) {
    this.kit = kit;
    const c = this.cfg;
    this.origin = origin.clone().setY(LIFT);
    const f = facing.clone().setY(0).normalize();
    const base = Math.atan2(f.z, f.x);
    for (let i = 0; i < c.blades; i++) {
      const k = c.blades > 1 ? (i / (c.blades - 1)) * 2 - 1 : 0;
      const a = base + k * c.spread;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const dark = fxSprite(this.group, 'trace', DARK, 1, { dark: true, opacity: 0 });
      const s = fxSprite(this.group, 'trace', i % 2 ? WHITE_VIOLET : VIOLET, 1, { opacity: 0 });
      this.blades.push({ s, dark, dir, t0: i * 0.015 });
    }
    hitPoints.forEach((p) => this.hits.push({ at: c.travel * 0.85, pos: p.clone(), done: false }));
    this.kit.stage.addShake(c.shake);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = this.cfg;
    const t = this.t;
    const cam = this.kit.stage.camera;
    for (const b of this.blades) {
      const k = (t - b.t0) / c.travel;
      if (k < 0) continue;
      if (k >= 1) {
        b.s.material.opacity = Math.max(0, b.s.material.opacity - dt * 8);
        b.dark.material.opacity = Math.max(0, b.dark.material.opacity - dt * 8);
        continue;
      }
      // a lâmina sai rápido e desacelera no fim do alcance
      const e = 1 - (1 - k) * (1 - k);
      const p = this.tmp.copy(b.dir).multiplyScalar(c.reach * e).add(this.origin);
      const q = this.tmp2.copy(b.dir).multiplyScalar(c.reach * Math.max(0, e - 0.15)).add(this.origin);
      const rot = screenAngle(cam, q, p) + Math.PI / 2;
      b.s.position.copy(p);
      b.s.material.rotation = rot;
      b.s.scale.set(0.14, 0.9 + 0.5 * (1 - k), 1);
      b.s.material.opacity = 1 - k * 0.6;
      b.dark.position.copy(p).addScaledVector(b.dir, -0.12);
      b.dark.material.rotation = rot;
      b.dark.scale.set(0.24, 1 + 0.5 * (1 - k), 1);
      b.dark.material.opacity = 0.6 * (1 - k);
    }
    for (const h of this.hits) {
      if (h.done || t < h.at) continue;
      h.done = true;
      const P = this.kit.particles;
      P.spark.emit({ pos: h.pos.clone(), posJitter: 0.08, vel: new THREE.Vector3(), velJitter: 2.6, life: 0.3, size: 0.1, sizeEnd: 0.02, color: WHITE_VIOLET, colorEnd: DEEP, drag: 3, count: c.sparksPerHit });
      P.smoke.emit({ pos: h.pos.clone(), posJitter: 0.2, vel: new THREE.Vector3(0, 0.5, 0), velJitter: 0.4, life: 0.6, size: 0.25, sizeEnd: 0.6, color: DARK, alpha: 0.5, drag: 2, count: c.smokePerHit });
    }
    for (const f of this.flashes) f.update(dt);
    if (t >= c.life && this.flashes.every((f) => f.done)) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/**
 * Execução: uma sombra corre até o alvo, uma lâmina escura cai de cima, um selo se abre no chão
 * e o impacto solta faíscas e fumaça escura. Peso e altura, diferente do golpe básico.
 */
export class ExecutionFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private impacted = false;
  private readonly cfg = ASSASSIN_FX.execute;
  private readonly kit: FxKit;
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly dir: THREE.Vector3;
  private readonly dashDark: THREE.Sprite;
  private readonly dashLight: THREE.Sprite;
  private readonly bladeDark: THREE.Sprite;
  private readonly blade: THREE.Sprite;
  private readonly flashes: Flash[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();

  constructor(caster: THREE.Vector3, target: THREE.Vector3, kit: FxKit) {
    this.kit = kit;
    this.from = caster.clone().setY(LIFT);
    this.to = target.clone().setY(LIFT);
    this.dir = this.to.clone().sub(this.from).setY(0).normalize();
    this.dashDark = fxSprite(this.group, 'trace', DARK, 0.5, { dark: true, opacity: 0 });
    this.dashLight = fxSprite(this.group, 'trace', VIOLET, 0.16, { opacity: 0 });
    this.bladeDark = fxSprite(this.group, 'trace', DARK, 0.42, { dark: true, opacity: 0 });
    this.blade = fxSprite(this.group, 'trace', WHITE_VIOLET, 0.2, { opacity: 0 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = this.cfg;
    const t = this.t;
    const cam = this.kit.stage.camera;
    // 1. a sombra corre até o alvo
    if (t < c.dashTime) {
      const s = t / c.dashTime;
      const e = s * s;
      const p = this.tmp.lerpVectors(this.from, this.to, e);
      const q = this.tmp2.lerpVectors(this.from, this.to, Math.min(1, e + 0.15));
      const rot = screenAngle(cam, p, q) + Math.PI / 2;
      this.dashLight.position.copy(p);
      this.dashLight.material.rotation = rot;
      this.dashLight.scale.set(0.16, 1.1, 1);
      this.dashLight.material.opacity = 1;
      this.dashDark.position.copy(p).addScaledVector(this.dir, -0.35);
      this.dashDark.material.rotation = rot;
      this.dashDark.scale.set(0.34, 1.2, 1);
      this.dashDark.material.opacity = 0.7;
    } else {
      this.dashLight.material.opacity = Math.max(0, this.dashLight.material.opacity - dt * 10);
      this.dashDark.material.opacity = Math.max(0, this.dashDark.material.opacity - dt * 10);
    }
    // 2. a lâmina escura cai de cima sobre o alvo
    if (!this.impacted && t >= c.dropAt) {
      const k = Math.min(1, (t - c.dropAt) / c.dropTime);
      const y = this.to.y + 0.3 + (1 - k) * c.bladeHeight * 0.6;
      this.blade.position.set(this.to.x, y, this.to.z);
      this.blade.scale.set(c.bladeWidth, c.bladeHeight, 1);
      this.blade.material.opacity = 0.2 + 0.8 * k;
      this.bladeDark.position.copy(this.blade.position);
      this.bladeDark.scale.set(c.bladeDarkWidth, c.bladeHeight * 1.05, 1);
      this.bladeDark.material.opacity = 0.7 * k;
    }
    // 3. impacto
    if (!this.impacted && t >= c.impactAt) this.impact();
    if (this.impacted) {
      this.blade.material.opacity = Math.max(0, this.blade.material.opacity - dt * 12);
      this.bladeDark.material.opacity = Math.max(0, this.bladeDark.material.opacity - dt * 12);
    }
    for (const f of this.flashes) f.update(dt);
    if (t >= c.life && this.flashes.every((f) => f.done)) this.dispose();
  }

  private impact(): void {
    this.impacted = true;
    const c = this.cfg;
    const P = this.kit.particles;
    const to = this.to;
    // selo no chão (runas que giram e somem)
    groundCircle(this.kit, to, { radius: c.sigilRadius, color: DEEP.clone().multiplyScalar(0.9), life: 0.6, kind: 'runesFrost', grow: 0.5, spin: 2.2 });
    this.flashes.push(new Flash(this.group, to, WHITE_VIOLET.clone().multiplyScalar(0.35), 1.0, 0.14));
    P.spark.emit({
      pos: to.clone(),
      posJitter: 0.15,
      vel: new THREE.Vector3(0, 2.2, 0),
      velJitter: 2.0,
      life: 0.45,
      size: 0.12,
      sizeEnd: 0.02,
      color: WHITE_VIOLET,
      colorEnd: DEEP,
      drag: 1.5,
      count: c.sparks,
    });
    P.smoke.emit({
      pos: to.clone().setY(0.2),
      posJitter: 0.35,
      vel: new THREE.Vector3(0, 1.0, 0),
      velJitter: 0.6,
      life: 1.0,
      size: 0.45,
      sizeEnd: 1.1,
      color: DARK,
      alpha: 0.6,
      drag: 1.4,
      count: c.smoke,
      spin: 1.2,
    });
    this.kit.stage.addShake(c.shake);
    this.kit.stage.kick(c.kick);
    this.kit.hitStop(c.hitStop);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}
