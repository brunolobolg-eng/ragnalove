import * as THREE from 'three';
import { WARRIOR_FX } from '../../../config/fx/warrior';
import type { Vec2 } from '../../../core/grid/types';
import { BladeArc, BladePool } from '../kit/BladeArc';
import { Flash, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, flatPlane, fxSprite } from '../kit/Shapes';
import { crackTexture, energyRingTexture, shardGeometry } from '../kit/procedural';
import { VFX } from '../kit/vfxSettings';
import { fxTexture } from '../kit/vfxTextures';
import type { VisualUnit } from './CombatVisualCtx';

/**
 * Efeitos do Guerreiro (espada e escudo), um por habilidade. Cada um tem fases legíveis:
 * antecipação → movimento (lâmina, onda, espiral) → impacto → dissipação.
 *  - Investida e Golpe em Área: lâmina de energia em meia-lua que segue a ponta real da espada (WarriorSlashFX). O
 *    impacto (WarriorContactFX) só existe quando o dano sai: no erro, ou com o alvo preso, a lâmina passa e nada toca.
 *  - Onda de Choque: anel de choque claro, anel de poeira escuro atrás, rachadura de pedra e lascas.
 *  - Fúria: espiral de chamas subindo em volta do corpo e círculo de runas que acompanha o guerreiro.
 *  - Provocar: pulso no chão e eco, clarões de grito na cabeça, brilhos puxados para o peito e marca em cada alvo.
 *  - Muralha: pedras saindo do chão pela borda de cada bloco. O bloco em si é desenhado pelo ObjectView.
 * Só apresentação: usa o kit (partículas, decalques, flashes, tremor) e libera tudo ao fim (`done`).
 * Números vêm de `src/config/fx/warrior.ts`.
 */

type Rgb = readonly [number, number, number];
const C = WARRIOR_FX;
const UP = new THREE.Vector3(0, 1, 0);

/** Cor HDR a partir da tupla de configuração; `k` multiplica (ex.: VFX.flash para flashes e anéis). */
export const rgb = (c: Rgb, k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);

/** Sorteio dentro de uma faixa [min, max]. */
const pick = (r: readonly [number, number]): number => r[0] + (r[1] - r[0]) * Math.random();

/** Suavização de Hermite: 0 abaixo de 0, 1 acima de 1. */
const smooth01 = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** Ponto do punho (osso da mão direita), usado quando o modelo não tem lâmina. */
const FIST = new THREE.Vector3(...C.slash.fist);
const _side = new THREE.Vector3();
let bladePool: BladePool | undefined;
/** Pool dos arcos: criado no primeiro golpe e reaproveitado (é só geometria e um material compartilhado). */
const bladeArcs = (): BladePool => (bladePool ??= new BladePool(C.slash.poolSize, C.slash));

/** Sprite de vida curta: cresce de `from` a `to` e some (estrela de impacto, clarões de grito). */
export interface Pop {
  s: THREE.Sprite;
  t0: number;
  life: number;
  from: number;
  to: number;
}
export function updatePops(pops: Pop[], t: number): void {
  for (const p of pops) {
    if (!p.s.visible) continue;
    const k = (t - p.t0) / p.life;
    if (k < 0) continue;
    if (k >= 1) {
      p.s.visible = false;
      continue;
    }
    const e = 1 - (1 - k) * (1 - k);
    p.s.scale.setScalar(p.from + (p.to - p.from) * e);
    p.s.material.opacity = (1 - k) * (1 - k);
  }
}

/** Tempos e tamanhos de um golpe (Investida ou Golpe em Área). A forma e as fases comuns são de `WARRIOR_FX.slash`. */
export interface SlashStyle {
  readonly sweepFrom: number;
  readonly halfWidth: number;
  readonly shake: number;
  readonly kick: number;
  readonly hitStop: number;
  readonly starSize: number;
}

// ---------------------------------------------------------------- Lâmina de energia (Investida e Golpe em Área)

/**
 * Arco de corte: a ponta real da espada é amostrada a cada quadro (no osso da mão, no mesmo clipe do golpe) e vira uma
 * lâmina de energia em meia-lua. Só desenha: não decide dano nem acerto. `contact` é o instante em que o dano sai (s):
 * o brilho chega ao máximo ali e depois o arco afina e some.
 */
export class WarriorSlashFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private arc?: BladeArc;
  private noArc = false;
  private readonly tip = new THREE.Vector3();
  private readonly dir: THREE.Vector3;
  private readonly sampleEnd: number;
  private readonly life: number;
  private gain = 0;
  private width = 0;

  /**
   * @param view unidade visual que golpeia (sem ela, o arco de reserva sai de `origin` no plano do golpe)
   * @param origin base da unidade no mundo
   * @param facing direção do golpe na grade (x, y); no mundo vira (x, 0, y)
   * @param kit kit de efeitos do GameView
   * @param style tempos e tamanhos deste golpe
   * @param contact instante do dano (s), o mesmo que o GameView usa para adiar a reação do alvo
   */
  constructor(
    private readonly view: VisualUnit | undefined,
    private readonly origin: THREE.Vector3,
    facing: Vec2,
    private readonly kit: FxKit,
    private readonly style: SlashStyle,
    private readonly contact: number,
  ) {
    this.dir = new THREE.Vector3(facing.x, 0, facing.y);
    if (this.dir.lengthSq() < 1e-6) this.dir.set(1, 0, 0);
    this.dir.normalize();
    this.sampleEnd = contact + C.slash.sampleAfter;
    this.life = contact + C.slash.dissolveDelay + C.slash.dissolveLife + C.slash.tail;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    if (t >= this.style.sweepFrom && t <= this.sampleEnd && VFX.ribbons && !this.noArc) {
      if (!this.arc) {
        this.arc = bladeArcs().acquire(this);
        if (!this.arc) this.noArc = true; // pool cheio: o golpe segue sem lâmina, sem alterar dano nem impacto
      }
      if (this.arc && this.sampleTip(t)) this.arc.push(this.tip, t);
    }
    if (this.arc) {
      this.envelope(t);
      this.arc.rebuild(t, this.kit.stage.camera.position, this.style.halfWidth * this.width, this.gain, C.slash.trailLife);
    }
    if (t >= this.life) this.dispose();
  }

  /** Ponta da lâmina neste instante; sem osso da mão, um arco de reserva que varre o plano do golpe. */
  private sampleTip(t: number): boolean {
    if (this.view?.strikeTip?.(this.tip, FIST)) return true;
    const k = Math.min(1, Math.max(0, (t - this.style.sweepFrom) / (this.contact - this.style.sweepFrom)));
    const a = -1 + 2 * k;
    _side.crossVectors(UP, this.dir);
    this.tip
      .copy(this.origin)
      .addScaledVector(UP, 1.1)
      .addScaledVector(this.dir, 0.9 * Math.cos(a))
      .addScaledVector(_side, 0.9 * Math.sin(a));
    return true;
  }

  /** Fases do brilho e da largura (ver WARRIOR_FX.slash): surge, pico no contato e dissipação. */
  private envelope(t: number): void {
    const s = C.slash;
    const from = this.style.sweepFrom;
    const surge = smooth01((t - from) / s.surge);
    const prog = Math.min(1, Math.max(0, (t - from) / (this.contact - from)));
    const peak = s.restGain + (1 - s.restGain) * prog * prog;
    const boost = 1 + s.peakBoost * Math.exp(-(((t - this.contact) / s.peakWidth) ** 2));
    const diss = 1 - smooth01((t - (this.contact + s.dissolveDelay)) / s.dissolveLife);
    this.gain = surge * peak * boost * diss;
    this.width = surge * (0.35 + 0.65 * diss);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.arc?.release();
    this.arc = undefined;
    this.group.removeFromParent();
  }
}

// ---------------------------------------------------------------- Contato (acerto do golpe)

/**
 * Impacto de um golpe que ACERTOU: faíscas quentes, fragmentos azuis, estrela e anel no chão, com tremor e um
 * congelamento curto. Existe só quando o evento de dano chega (o dano é adiado até o contato). No erro, ou com o
 * alvo preso, não é criado.
 */
export class WarriorContactFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly pops: Pop[] = [];

  /**
   * @param at contato no corpo do alvo (peito)
   * @param from base de quem golpeou (dá a direção dos fragmentos); sem ela, saem para +x
   * @param crit golpe crítico (o dano chega com `crit`): faíscas e estrela maiores
   */
  constructor(at: THREE.Vector3, from: THREE.Vector3 | undefined, kit: FxKit, style: SlashStyle, crit: boolean) {
    const c = C.slash;
    const k = crit ? c.critScale : 1;
    const P = kit.particles;
    const away = new THREE.Vector3(1, 0, 0);
    if (from) away.set(at.x - from.x, 0, at.z - from.z);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    away.normalize();
    // faíscas quentes que caem do contato
    P.spark.emit({
      pos: at,
      posJitter: 0.08,
      vel: new THREE.Vector3(0, 1.4, 0),
      velJitter: 2.0,
      life: 0.3,
      size: 0.08,
      sizeEnd: 0.02,
      color: rgb(c.sparkColor),
      colorEnd: rgb(c.sparkColorEnd),
      gravity: 9,
      drag: 0.8,
      count: Math.round(c.sparks * k),
    });
    // fragmentos azuis curtos, lançados no sentido do golpe
    P.spark.emit({
      pos: at,
      posJitter: 0.1,
      vel: away.clone().multiplyScalar(2).setY(1.2),
      velJitter: 0.9,
      life: c.fragLife,
      size: c.fragSize * k,
      sizeEnd: 0.02,
      color: rgb(c.fragColor),
      colorEnd: rgb(c.fragColorEnd),
      gravity: 9,
      drag: 0.6,
      count: c.fragments,
    });
    // estrela pequena sobre o contato
    const starSize = style.starSize * k;
    const star = fxSprite(this.group, 'impact', rgb(c.starColor), starSize * 0.8);
    star.position.copy(at);
    star.material.rotation = Math.random() * Math.PI;
    this.pops.push({ s: star, t0: 0, life: c.starLife, from: starSize * 0.8, to: starSize * 1.15 });
    // anel mínimo no chão do alvo
    kit.decals.spawn({
      kind: 'ring',
      pos: new THREE.Vector3(at.x, C.groundY, at.z),
      size: c.ringSize,
      sizeEnd: c.ringEnd * k,
      color: rgb(c.ringColor, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    kit.stage.addShake(style.shake * k);
    kit.stage.kick(style.kick);
    kit.hitStop(style.hitStop);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    updatePops(this.pops, this.t);
    if (this.t >= C.slash.contactLife) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Onda de Choque

/**
 * Onda de Choque: antes do impacto, poeira e brilhos convergem para os pés. No impacto: anel de choque claro,
 * anel de poeira escuro atrás dele, rachadura de pedra no chão, poeira saindo em anel e lascas que caem.
 */
export class WarriorShockFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly kit: FxKit;
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly tl = new Timeline();

  constructor(center: THREE.Vector3, radius: number, kit: FxKit) {
    const c = C.shockwave;
    this.kit = kit;
    this.center = center.clone();
    this.radius = Math.max(1, radius);
    for (const at of c.gatherAt) this.tl.at(at, () => this.gather());
    this.tl.at(c.impactAt, () => this.impact());
    for (const at of c.settleAt) this.tl.at(c.impactAt + at, () => this.settle());
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    if (this.tl.time >= C.shockwave.life) this.dispose();
  }

  private gather(): void {
    const c = C.shockwave;
    const P = this.kit.particles;
    P.smoke.emit({
      pos: this.center.clone().setY(0.15),
      posJitter: 0.4,
      vel: new THREE.Vector3(0, 0.5, 0),
      velJitter: 0.4,
      life: 0.6,
      size: 0.25,
      sizeEnd: 0.6,
      color: rgb(c.gatherDustColor),
      alpha: 0.4,
      count: c.gatherDust,
      spin: 1.5,
    });
    for (let i = 0; i < c.gatherSparks; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = c.gatherRadius * (0.8 + 0.4 * Math.random());
      const p = new THREE.Vector3(this.center.x + Math.cos(a) * r, 0.5 + Math.random() * 0.6, this.center.z + Math.sin(a) * r);
      // brilhos que convergem para os pés e somem antes de chegar ao corpo
      const v = new THREE.Vector3(this.center.x, 0.25, this.center.z).sub(p).multiplyScalar(1 / 0.2);
      P.glow.emit({ pos: p, vel: v, life: 0.2, size: 0.1, sizeEnd: 0.02, color: rgb(c.gatherColor), count: 1 });
    }
  }

  private impact(): void {
    const c = C.shockwave;
    const R = this.radius;
    const P = this.kit.particles;
    const g = this.center.clone().setY(C.groundY);
    this.kit.decals.spawn({
      kind: 'ring',
      pos: g,
      size: c.frontSize,
      sizeEnd: R * c.frontEnd,
      color: rgb(c.frontColor, VFX.flash),
      life: c.frontLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    this.kit.decals.spawn({
      kind: 'ring',
      pos: g.clone().setY(C.groundY + 0.005),
      size: c.dustRingSize,
      sizeEnd: R * c.dustRingEnd,
      color: rgb(c.dustRingColor),
      life: c.dustRingLife,
      additive: false,
      fadeIn: 0.02,
      fadeOut: 0.7,
    });
    this.kit.decals.spawn({
      kind: 'crack',
      pos: g.clone().setY(C.groundY - 0.01),
      size: R * c.crackScale,
      color: new THREE.Color(1, 1, 1),
      life: c.crackLife,
      fadeIn: 0.02,
      fadeOut: 0.4,
      dissolve: true,
      opacity: c.crackOpacity,
    });
    for (let i = 0; i < c.dustBurst; i++) {
      const a = (i / c.dustBurst) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      P.smoke.emit({
        pos: this.center.clone().setY(0.15),
        vel: new THREE.Vector3(Math.cos(a), 0.12, Math.sin(a)).multiplyScalar(R * c.dustSpeed),
        velJitter: 0.4,
        life: c.dustLife,
        size: 0.45,
        sizeEnd: 1.2,
        color: rgb(c.dustColor),
        alpha: 0.5,
        drag: 2.2,
        count: 1,
        spin: 1,
      });
    }
    for (let i = 0; i < c.rubble; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(R * c.rubbleSpeed).setY(c.rubbleLift);
      P.spark.emit({
        pos: this.center.clone().setY(0.25),
        vel: v,
        velJitter: 0.8,
        life: 0.55,
        size: 0.1,
        sizeEnd: 0.02,
        color: rgb(c.rubbleColor),
        colorEnd: rgb(c.rubbleColorEnd),
        gravity: 9,
        drag: 0.8,
        count: 1,
      });
    }
    this.kit.stage.addShake(c.shake);
    this.kit.stage.kick(c.kick);
    this.kit.stage.aberrate(c.aberrate);
    this.kit.hitStop(c.hitStop);
  }

  private settle(): void {
    const c = C.shockwave;
    const R = this.radius;
    for (let i = 0; i < c.settleDust; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R * (0.5 + 0.4 * Math.random());
      this.kit.particles.smoke.emit({
        pos: new THREE.Vector3(this.center.x + Math.cos(a) * r, 0.2, this.center.z + Math.sin(a) * r),
        vel: new THREE.Vector3(Math.cos(a) * 0.3, 0.25, Math.sin(a) * 0.3),
        life: 1.0,
        size: 0.4,
        sizeEnd: 1.0,
        color: rgb(c.dustColor),
        alpha: 0.3,
        drag: 1.2,
        count: 1,
        spin: 0.5,
      });
    }
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Fúria

/** Plano horizontal compartilhado (círculo de runas). Geometria única: nunca é disposta. */
const GROUND_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Fúria: rajada no início (chamas, anel vermelho e clarão no peito). Enquanto dura, chamas em espiral subindo em
 * volta do corpo e um círculo de runas no chão que gira e segue o guerreiro. Termina junto com a Fúria.
 */
export class WarriorFuryFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private carry = 0;
  private readonly kit: FxKit;
  private readonly view: VisualUnit;
  private readonly duration: number;
  private readonly flashes: Flash[] = [];
  private readonly rune: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly flameCol: THREE.Color;
  private readonly flameEnd: THREE.Color;
  private readonly tmp = new THREE.Vector3();

  constructor(view: VisualUnit, duration: number, kit: FxKit) {
    const c = C.fury;
    this.kit = kit;
    this.view = view;
    this.duration = duration;
    this.flameCol = rgb(c.flameColor);
    this.flameEnd = rgb(c.flameColorEnd);
    const base = view.root.position.clone();
    // rajada: chamas nos pés, anel vermelho no chão e clarão no peito
    kit.particles.fire.emit({
      pos: base.clone().setY(0.3),
      posJitter: 0.35,
      vel: new THREE.Vector3(0, c.burstLift, 0),
      velJitter: 0.8,
      life: 0.7,
      size: 0.35,
      sizeEnd: 0.1,
      color: this.flameCol,
      colorEnd: this.flameEnd,
      count: c.burstFire,
    });
    kit.decals.spawn({
      kind: 'ring',
      pos: base.clone().setY(C.groundY),
      size: c.ringSize,
      sizeEnd: c.ringEnd,
      color: rgb(c.ringColor, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    this.flashes.push(new Flash(this.group, base.clone().setY(1.1), rgb(c.flashColor), c.flashSize, c.flashLife));
    // círculo de runas de fogo: mesmo decalque do jogo, mas em malha própria para acompanhar o guerreiro
    const mat = new THREE.MeshBasicMaterial({
      map: fxTexture('decal_runesFire'),
      color: rgb(c.runeColor),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.rune = new THREE.Mesh(GROUND_PLANE, mat);
    this.rune.position.set(base.x, C.groundY, base.z);
    this.rune.scale.setScalar(c.runeSize);
    this.rune.renderOrder = 2;
    this.group.add(this.rune);
    kit.stage.addShake(c.shake);
    kit.stage.kick(c.kick);
  }

  update(dt: number): void {
    if (this.done) return;
    // a unidade saiu da cena (morreu ou foi removida): o efeito encerra
    if (!this.view.root.parent) {
      this.dispose();
      return;
    }
    this.t += dt;
    const c = C.fury;
    const t = this.t;
    for (const f of this.flashes) f.update(dt);
    const base = this.view.root.position;
    const mat = this.rune.material;
    if (t < this.duration) {
      mat.opacity = Math.min(1, t / c.runeFadeIn) * c.runeOpacity;
      this.carry += c.flamesPerSec * dt;
      while (this.carry >= 1) {
        this.carry -= 1;
        this.flame(base, t);
      }
    } else {
      mat.opacity = Math.max(0, c.runeOpacity * (1 - (t - this.duration) / c.runeFadeOut));
    }
    this.rune.position.set(base.x, C.groundY, base.z);
    this.rune.rotation.y += c.runeSpin * dt;
    if (t >= this.duration + c.tail) this.dispose();
  }

  /** Uma labareda em espiral: nasce num ponto do círculo em volta dos pés e sobe girando. */
  private flame(base: THREE.Vector3, t: number): void {
    const c = C.fury;
    const a = t * c.spiralSpeed + (Math.random() - 0.5) * 0.6;
    const r = c.flameRadius * (0.8 + Math.random() * 0.4);
    const pos = this.tmp.set(base.x + Math.cos(a) * r, 0.1 + Math.random() * 0.15, base.z + Math.sin(a) * r);
    this.kit.particles.fire.emit({
      pos,
      vel: new THREE.Vector3(-Math.sin(a) * 0.6, c.flameRise, Math.cos(a) * 0.6),
      velJitter: 0.25,
      life: c.flameLife,
      size: c.flameSize,
      sizeEnd: c.flameSizeEnd,
      color: this.flameCol,
      colorEnd: this.flameEnd,
      count: 1,
    });
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group); // também libera o material do círculo de runas
  }
}

// ---------------------------------------------------------------- Provocar

/**
 * Provocar: pulso no chão e um eco; dois clarões de grito na altura da cabeça; brilhos que convergem para o peito;
 * uma marca vermelha em cada alvo puxado (o halo acompanha o alvo enquanto ele é puxado).
 */
export class WarriorTauntFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly kit: FxKit;
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly tl = new Timeline();
  private readonly flashes: Flash[] = [];
  private readonly pops: Pop[] = [];
  private readonly marks: { view: VisualUnit; s: THREE.Sprite }[] = [];

  constructor(center: THREE.Vector3, radius: number, targets: VisualUnit[], kit: FxKit) {
    const c = C.taunt;
    this.kit = kit;
    this.center = center.clone();
    this.radius = Math.max(1, radius);
    const R = this.radius;
    const g = this.center.clone().setY(C.groundY);
    // 1. pulso do desafio (anel no chão) e clarão no peito
    this.tl.at(0, () => {
      kit.decals.spawn({
        kind: 'ring',
        pos: g,
        size: c.ring1Size,
        sizeEnd: R * c.ring1EndScale,
        color: rgb(c.ring1Color, VFX.flash),
        life: c.ring1Life,
        additive: true,
        fadeIn: 0.05,
        fadeOut: 0.4,
      });
      this.flashes.push(new Flash(this.group, this.center.clone().setY(1.5), rgb(c.flashColor), c.flashSize, c.flashLife));
      kit.stage.addShake(c.shake);
    });
    // 2. eco do pulso, mais tarde e mais fraco
    this.tl.at(c.ring2Delay, () =>
      kit.decals.spawn({
        kind: 'ring',
        pos: g.clone(),
        size: c.ring2Size,
        sizeEnd: R * c.ring2EndScale,
        color: rgb(c.ring2Color, VFX.flash),
        life: c.ring2Life,
        additive: true,
        fadeIn: 0.02,
        fadeOut: 0.5,
      }),
    );
    // 3. grito: dois clarões na cabeça
    this.tl.at(0, () => this.roar(0));
    this.tl.at(c.roarDelay, () => this.roar(c.roarDelay));
    // 4. puxão: brilhos saindo do círculo e convergindo para o peito
    this.tl.at(0.02, () => this.pull());
    // 5. marca em cada alvo puxado
    for (const v of targets) this.mark(v);
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    const c = C.taunt;
    const t = this.tl.time;
    for (const f of this.flashes) f.update(dt);
    updatePops(this.pops, t);
    for (const m of this.marks) {
      const k = Math.min(1, t / c.markLife);
      if (m.view.root.parent) m.s.position.copy(m.view.root.position).setY(c.markHeight);
      m.s.material.opacity = (1 - k) * (1 - k);
      m.s.scale.setScalar(c.markSize * (1 + 0.4 * k));
    }
    if (t >= c.life) this.dispose();
  }

  private roar(t0: number): void {
    const c = C.taunt;
    const s = fxSprite(this.group, 'flash', rgb(c.roarColor), c.roarSize0);
    s.position.copy(this.center).setY(c.roarHeight);
    this.pops.push({ s, t0, life: c.roarLife, from: c.roarSize0, to: c.roarSize1 });
  }

  private pull(): void {
    const c = C.taunt;
    const P = this.kit.particles;
    const chest = new THREE.Vector3(this.center.x, 1.0, this.center.z);
    for (let i = 0; i < c.pullCount; i++) {
      const a = (i / c.pullCount) * Math.PI * 2;
      const p = new THREE.Vector3(this.center.x + Math.cos(a) * this.radius, 0.4, this.center.z + Math.sin(a) * this.radius);
      P.glow.emit({
        pos: p,
        vel: chest.clone().sub(p).multiplyScalar(1 / c.pullLife),
        life: c.pullLife,
        size: c.pullSize,
        sizeEnd: c.pullSizeEnd,
        color: rgb(c.pullColor),
        colorEnd: rgb(c.pullColorEnd),
        count: 1,
      });
    }
  }

  private mark(v: VisualUnit): void {
    const c = C.taunt;
    const p = v.root.position;
    const s = fxSprite(this.group, 'halo', rgb(c.markColor), c.markSize);
    s.position.copy(p).setY(c.markHeight);
    this.marks.push({ view: v, s });
    this.flashes.push(new Flash(this.group, p.clone().setY(c.markHeight), rgb(c.markColor), c.markFlashSize, c.markFlashLife));
    this.kit.decals.spawn({
      kind: 'ring',
      pos: p.clone().setY(C.groundY),
      size: c.markRingSize,
      sizeEnd: c.markRingEnd,
      color: rgb(c.markColor, VFX.flash),
      life: c.markRingLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Muralha

/**
 * Muralha: a base de cada bloco racha (luz azul no chão), dois anéis de energia se expandem e pedras de cantaria e
 * cristais azuis brotam pela borda. Tudo é geometria e textura de código; o bloco em si fica no ObjectView/wallBlock.ts.
 */
export class WallRiseFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly pieces: { m: THREE.Mesh; t0: number; top: number; size: number }[] = [];
  private readonly rings: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t0: number }[] = [];
  private readonly crack: THREE.Mesh;
  private readonly crackMat: THREE.MeshBasicMaterial;

  constructor(base: THREE.Vector3, kit: FxKit) {
    const c = C.wall;
    kit.particles.smoke.emit({
      pos: base.clone().setY(0.15),
      posJitter: 0.35,
      vel: new THREE.Vector3(0, 0.9, 0),
      velJitter: 0.6,
      life: 0.9,
      size: 0.35,
      sizeEnd: 1.0,
      color: rgb(c.dustColor),
      alpha: 0.55,
      drag: 1.8,
      count: c.dust,
      spin: 1,
    });
    this.crack = flatPlane(this.group, crackTexture(), c.crackSize, 1, { y: c.groundLift, opacity: 0, color: rgb(c.crackColor), renderOrder: 7 });
    this.crack.position.x = base.x;
    this.crack.position.z = base.z;
    this.crackMat = this.crack.material as THREE.MeshBasicMaterial;
    for (let i = 0; i < c.rings; i++) {
      const m = flatPlane(this.group, energyRingTexture(), 1, 1, { y: c.groundLift, opacity: 0, color: rgb(c.ringColor), renderOrder: 8 });
      m.position.x = base.x;
      m.position.z = base.z;
      m.visible = false;
      this.rings.push({ m, mat: m.material as THREE.MeshBasicMaterial, t0: i * c.ringDelay });
    }
    const stoneMat = new THREE.MeshLambertMaterial({ color: rgb(c.stoneColor), flatShading: true });
    const crystalMat = new THREE.MeshLambertMaterial({ color: 0x1d3a6e, emissive: rgb(c.ringColor, c.crystalGlow), flatShading: true });
    let n = 0;
    const launch = (count: number, mat: THREE.Material, seed: number, width: readonly [number, number], lift: readonly [number, number], stretch: number): void => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const m = new THREE.Mesh(shardGeometry(seed + i, stretch), mat);
        m.position.set(base.x + Math.cos(a) * c.edge, c.groundLift, base.z + Math.sin(a) * c.edge);
        m.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
        m.visible = false;
        this.group.add(m);
        this.pieces.push({ m, t0: n * c.stagger, top: pick(lift), size: pick(width) });
        n++;
      }
    };
    launch(c.stones, stoneMat, 101, c.stoneSize, c.stoneHeight, c.stoneStretch);
    launch(c.crystals, crystalMat, 201, c.crystalSize, c.crystalHeight, c.crystalStretch);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = C.wall;
    const t = this.t;
    for (const s of this.pieces) {
      const k = (t - s.t0) / c.rise;
      if (k < 0) continue;
      s.m.visible = true;
      const up = 1 - Math.pow(1 - Math.min(1, k), 3); // sobe depressa e desacelera no topo
      const out = Math.max(0, (t - s.t0 - c.rise - c.hold) / c.shrink); // 0 → 1: encolhe e afunda
      const f = Math.max(0, 1 - out);
      s.m.position.y = c.groundLift + s.top * up * f;
      s.m.scale.setScalar(s.size * f);
    }
    for (const r of this.rings) {
      const u = (t - r.t0) / c.ringLife;
      if (u < 0) continue;
      if (u >= 1) {
        r.m.visible = false;
        continue;
      }
      r.m.visible = true;
      const sc = c.ringStart + (c.ringEnd - c.ringStart) * (1 - Math.pow(1 - u, 3));
      r.m.scale.set(sc, sc, 1);
      r.mat.opacity = c.ringAlpha * (1 - u);
    }
    const cu = Math.min(1, t / c.crackLife);
    const cs = c.crackSize * (0.6 + 0.4 * (1 - Math.pow(1 - cu, 3)));
    this.crack.scale.set(cs, cs, 1);
    this.crackMat.opacity = c.crackAlpha * Math.min(1, t / 0.08) * (1 - cu);
    if (t >= c.life) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group); // libera os materiais; as formas e texturas ficam no cache
  }
}
