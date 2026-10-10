import * as THREE from 'three';
import { WARRIOR_FX } from '../../../config/fx/warrior';
import type { Vec2 } from '../../../core/grid/types';
import { tileToWorld } from '../../coords';
import { Flash, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import type { Ribbon } from '../kit/Ribbons';
import { disposeFxGroup, flatPlane, fxSprite } from '../kit/Shapes';
import { crackTexture, energyRingTexture, shardGeometry } from '../kit/procedural';
import { VFX } from '../kit/vfxSettings';
import { fxTexture } from '../kit/vfxTextures';
import { BASH_IMPACT } from '../BashFX';
import { CLEAVE_IMPACT } from '../CleaveFX';
import type { VisualUnit } from './CombatVisualCtx';

/**
 * Efeitos do Guerreiro (espada e escudo), um por habilidade. Cada um tem fases legíveis:
 * antecipação → movimento (lâmina, onda, espiral) → impacto → dissipação.
 *  - Investida: UMA camada leve (fita e crescente da lâmina) e um impacto pequeno.
 *  - Golpe em Área: arco largo que varre o cone inteiro; onda de poeira pelos tiles; faíscas nos atingidos.
 *  - Onda de Choque: anel de choque claro, anel de poeira escuro atrás, rachadura de pedra e lascas.
 *  - Fúria: espiral de chamas subindo em volta do corpo e círculo de runas que acompanha o guerreiro.
 *  - Provocar: pulso no chão e eco, clarões de grito na cabeça, brilhos puxados para o peito e marca em cada alvo.
 *  - Muralha: pedras saindo do chão pela borda de cada bloco. O bloco em si é desenhado pelo ObjectView.
 * Só apresentação: usa o kit (partículas, fitas, decalques, flashes, tremor) e libera tudo ao fim (`done`).
 * Números vêm de `src/config/fx/warrior.ts`.
 */

type Rgb = readonly [number, number, number];
const C = WARRIOR_FX;
const UP = new THREE.Vector3(0, 1, 0);

/** Cor HDR a partir da tupla de configuração; `k` multiplica (ex.: VFX.flash para flashes e anéis). */
export const rgb = (c: Rgb, k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);

/** Sorteio dentro de uma faixa [min, max]. */
const pick = (r: readonly [number, number]): number => r[0] + (r[1] - r[0]) * Math.random();

/** Ângulo normalizado para (-π, π]. */
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
/** Ângulo, em tela, do segmento a→b: alinha o sprite ao movimento. */
function screenAngle(cam: THREE.Camera, a: THREE.Vector3, b: THREE.Vector3): number {
  _pa.copy(a).project(cam);
  _pb.copy(b).project(cam);
  return Math.atan2(_pb.y - _pa.y, _pb.x - _pa.x);
}

/** Ponto na curva quadrática a–c–b (s de 0 a 1), escrito em `out`. */
function quad(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, s: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - s;
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(c, 2 * u * s).addScaledVector(b, s * s);
}

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

// ---------------------------------------------------------------- Investida (ataque básico)

/**
 * Investida: a lâmina cai em arco do alto da cabeça até o alvo (fita curta + crescente na ponta).
 * No impacto (BASH_IMPACT, o instante em que o alvo reage): estrela pequena, faíscas, poeira e um anel mínimo.
 */
export class WarriorBashFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private impacted = false;
  private readonly kit: FxKit;
  private readonly k: number;
  private readonly top = new THREE.Vector3();
  private readonly ctrl = new THREE.Vector3();
  private readonly hit = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private ribbon?: Ribbon;
  private readonly crescent: THREE.Sprite;
  private readonly pops: Pop[] = [];

  constructor(caster: THREE.Vector3, target: THREE.Vector3, kit: FxKit, crit = false) {
    const c = C.bash;
    this.kit = kit;
    this.k = crit ? c.critScale : 1;
    // direção do golpe no chão: do guerreiro para o alvo
    const dir = new THREE.Vector3().subVectors(target, caster).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    // a lâmina sai da frente do peito (onde a espada aparece no modelo) e corta em arco curto até o alvo
    this.top.copy(caster).addScaledVector(UP, c.startHeight).addScaledVector(dir, c.startForward);
    this.ctrl.copy(caster).addScaledVector(UP, c.ctrlHeight).addScaledVector(dir, c.ctrlForward);
    this.hit.copy(target).addScaledVector(UP, c.hitHeight).addScaledVector(dir, -c.hitBack);
    this.crescent = fxSprite(this.group, 'slash', rgb(c.crescentColor), c.crescentSize * this.k);
    this.crescent.visible = false;
    this.crescent.position.copy(this.top);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const c = C.bash;
    const cam = this.kit.stage.camera;
    if (t >= c.sweepFrom && t < BASH_IMPACT) {
      const s = (t - c.sweepFrom) / (BASH_IMPACT - c.sweepFrom);
      if (!this.ribbon) this.ribbon = this.kit.ribbons.acquire(rgb(c.trailColor), c.trailWidth, c.trailLife);
      quad(this.top, this.ctrl, this.hit, s * s, this.tip);
      quad(this.top, this.ctrl, this.hit, Math.min(1, s + c.tangentStep) ** 2, this.ahead);
      // a fita cobre só os últimos `ribbonLen` até o impacto: o rastro tem o mesmo tamanho para qualquer distância
      if (this.tip.distanceTo(this.hit) <= c.ribbonLen) this.ribbon?.push(this.tip);
      this.crescent.visible = true;
      this.crescent.position.copy(this.tip);
      this.crescent.material.rotation = screenAngle(cam, this.tip, this.ahead) + Math.PI / 2 + c.crescentRot;
      this.crescent.material.opacity = Math.min(1, s * 4);
      this.crescent.scale.setScalar(c.crescentSize * this.k * (0.7 + 0.3 * s));
    }
    if (!this.impacted && t >= BASH_IMPACT) this.impact();
    if (this.impacted) {
      const f = (t - BASH_IMPACT) / c.crescentFade;
      this.crescent.material.opacity = Math.max(0, 1 - f);
      if (f >= 1) this.crescent.visible = false;
    }
    updatePops(this.pops, t);
    if (t >= c.life) this.dispose();
  }

  private impact(): void {
    const c = C.bash;
    this.impacted = true;
    this.ribbon?.stop();
    const P = this.kit.particles;
    const ground = new THREE.Vector3(this.hit.x, C.groundY, this.hit.z);
    // estrela pequena sobre o golpe
    const starSize = c.starSize * this.k;
    const star = fxSprite(this.group, 'impact', rgb(c.starColor), starSize * 0.8);
    star.position.copy(this.hit);
    star.material.rotation = Math.random() * Math.PI;
    this.pops.push({ s: star, t0: BASH_IMPACT, life: c.starLife, from: starSize * 0.8, to: starSize * 1.15 });
    P.spark.emit({
      pos: this.hit,
      posJitter: 0.08,
      vel: new THREE.Vector3(0, 1.6, 0),
      velJitter: 2.2,
      life: 0.32,
      size: 0.08,
      sizeEnd: 0.02,
      color: rgb(c.sparkColor),
      colorEnd: rgb(c.sparkColorEnd),
      gravity: 9,
      drag: 0.8,
      count: Math.round(c.sparks * this.k),
    });
    P.smoke.emit({
      pos: ground.clone().setY(0.12),
      posJitter: 0.2,
      vel: new THREE.Vector3(0, 0.4, 0),
      velJitter: 0.8,
      life: 0.7,
      size: 0.28,
      sizeEnd: 0.7,
      color: rgb(c.dustColor),
      alpha: 0.45,
      drag: 2.2,
      count: c.dust,
      spin: 1,
    });
    this.kit.decals.spawn({
      kind: 'ring',
      pos: ground,
      size: c.ringSize,
      sizeEnd: c.ringEnd * this.k,
      color: rgb(c.ringColor, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    this.kit.stage.addShake(c.shake);
    this.kit.stage.kick(c.kick);
    this.kit.hitStop(c.hitStop);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Golpe em Área

/**
 * Golpe em Área: a lâmina varre o cone de um lado ao outro (fita e crescente na ponta). Uma onda de poeira sai de
 * cada tile do cone quando a lâmina chega nele. No impacto, faíscas e estrelas em cada tile atingido e um anel
 * sob o guerreiro, do tamanho do arco.
 */
export class WarriorCleaveFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly kit: FxKit;
  private readonly origin: THREE.Vector3;
  private readonly reach: number;
  private readonly a0: number;
  private readonly a1: number;
  private readonly tl = new Timeline();
  private readonly tip: THREE.Sprite;
  private readonly pops: Pop[] = [];
  private blade?: Ribbon;
  private wake?: Ribbon;
  private readonly tmp = new THREE.Vector3();

  constructor(origin: THREE.Vector3, facing: Vec2, tiles: Vec2[], hitTiles: Vec2[], kit: FxKit) {
    const c = C.cleave;
    this.kit = kit;
    this.origin = origin.clone();
    const fa = Math.atan2(facing.y, facing.x); // grade (x, y) → mundo (x, z)
    // abertura e alcance saem dos próprios tiles do cone que a simulação usou
    let lo = Infinity;
    let hi = -Infinity;
    let reach = 0;
    for (const t of tiles) {
      const w = tileToWorld(t.x, t.y);
      const dx = w.x - origin.x;
      const dz = w.z - origin.z;
      const rel = wrap(Math.atan2(dz, dx) - fa);
      lo = Math.min(lo, rel);
      hi = Math.max(hi, rel);
      reach = Math.max(reach, Math.hypot(dx, dz));
    }
    if (!tiles.length) {
      lo = 0;
      hi = 0;
    }
    // um cone estreito ainda varre um arco legível
    lo = Math.min(lo, -c.minHalfSpan);
    hi = Math.max(hi, c.minHalfSpan);
    this.a0 = fa + lo;
    this.a1 = fa + hi;
    this.reach = Math.max(1, reach) + 0.25;
    const span = hi - lo;
    const sweepLen = CLEAVE_IMPACT - c.sweepFrom;

    this.tip = fxSprite(this.group, 'slash', rgb(c.tipColor), c.tipSize);
    this.tip.visible = false;

    // a lâmina começa a varrer: pega as fitas do pool só agora (sem fita livre, segue só com o crescente)
    this.tl.at(c.sweepFrom, () => {
      this.blade = kit.ribbons.acquire(rgb(c.bladeColor), c.bladeWidth, c.bladeLife);
      this.wake = kit.ribbons.acquire(rgb(c.wakeColor), c.wakeWidth, c.wakeLife);
    });

    // onda de poeira: cada tile do cone solta a sua quando a lâmina passa por ele
    for (const t of tiles) {
      const w = tileToWorld(t.x, t.y);
      const dx = w.x - origin.x;
      const dz = w.z - origin.z;
      const rel = wrap(Math.atan2(dz, dx) - fa);
      const s = Math.min(1, Math.max(0, (rel - lo) / span));
      const dist = Math.hypot(dx, dz) || 1;
      const out = new THREE.Vector3(dx / dist, 0, dz / dist).multiplyScalar(c.waveSpeed);
      const p = tileToWorld(t.x, t.y, undefined, 0.25);
      this.tl.at(c.sweepFrom + sweepLen * s, () =>
        kit.particles.smoke.emit({
          pos: p,
          posJitter: 0.15,
          vel: out,
          velJitter: 0.3,
          life: c.waveLife,
          size: 0.22,
          sizeEnd: 0.6,
          color: rgb(c.waveColor),
          alpha: 0.5,
          drag: 1.5,
          count: c.waveDust,
          spin: 1,
        }),
      );
    }

    // impacto: no mesmo instante em que os inimigos reagem (CLEAVE_IMPACT)
    this.tl.at(CLEAVE_IMPACT, () => this.impact(hitTiles));
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.tl.update(dt);
    const t = this.t;
    const c = C.cleave;
    const cam = this.kit.stage.camera;
    if (t >= c.sweepFrom && t < CLEAVE_IMPACT) {
      const s = (t - c.sweepFrom) / (CLEAVE_IMPACT - c.sweepFrom);
      const ang = this.a0 + (this.a1 - this.a0) * s;
      // a lâmina começa perto do corpo e abre até o alcance do cone
      const r = c.innerRadius + (this.reach - c.innerRadius) * Math.sqrt(s);
      this.tip.position.set(this.origin.x + Math.cos(ang) * r, c.bladeHeight, this.origin.z + Math.sin(ang) * r);
      const ang2 = ang + 0.12 * Math.sign(this.a1 - this.a0);
      this.tmp.set(this.origin.x + Math.cos(ang2) * r, c.bladeHeight, this.origin.z + Math.sin(ang2) * r);
      this.tip.material.rotation = screenAngle(cam, this.tip.position, this.tmp) + Math.PI / 2 + c.tipRot;
      this.tip.material.opacity = Math.min(1, s * 4);
      this.tip.scale.setScalar(c.tipSize * (0.7 + 0.3 * s));
      this.tip.visible = true;
      this.blade?.push(this.tip.position);
      this.wake?.push(this.tmp.copy(this.tip.position).setY(c.bladeHeight - c.wakeDrop));
    } else if (t >= CLEAVE_IMPACT) {
      this.blade?.stop();
      this.wake?.stop();
      this.tip.material.opacity = Math.max(0, 1 - (t - CLEAVE_IMPACT) / 0.2);
      if (this.tip.material.opacity <= 0) this.tip.visible = false;
    }
    updatePops(this.pops, t);
    if (t >= c.life) this.dispose();
  }

  private impact(hitTiles: Vec2[]): void {
    const c = C.cleave;
    const P = this.kit.particles;
    const hits = hitTiles.length;
    for (const h of hitTiles) {
      const p = tileToWorld(h.x, h.y, undefined, 0.7);
      const away = new THREE.Vector3(p.x - this.origin.x, 0, p.z - this.origin.z).normalize();
      P.spark.emit({
        pos: p,
        posJitter: 0.1,
        vel: away.multiplyScalar(1.5).setY(1.4),
        velJitter: 2.2,
        life: 0.32,
        size: 0.09,
        sizeEnd: 0.02,
        color: rgb(c.sparkColor),
        colorEnd: rgb(c.sparkColorEnd),
        gravity: 9,
        drag: 0.9,
        count: c.sparksPerHit,
      });
      P.smoke.emit({
        pos: tileToWorld(h.x, h.y, undefined, 0.2),
        posJitter: 0.2,
        vel: new THREE.Vector3(0, 0.5, 0),
        velJitter: 0.6,
        life: 0.6,
        size: 0.25,
        sizeEnd: 0.6,
        color: rgb(c.waveColor),
        alpha: 0.5,
        count: c.dustPerHit,
        spin: 1,
      });
      const star = fxSprite(this.group, 'impact', rgb(c.starColor), c.starSize * 0.8);
      star.position.copy(p);
      star.material.rotation = Math.random() * Math.PI;
      this.pops.push({ s: star, t0: CLEAVE_IMPACT, life: c.starLife, from: c.starSize * 0.8, to: c.starSize * 1.1 });
    }
    this.kit.decals.spawn({
      kind: 'ring',
      pos: this.origin.clone().setY(C.groundY),
      size: c.ringSize,
      sizeEnd: this.reach * c.ringEndScale,
      color: rgb(c.ringColor, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    this.kit.stage.addShake(Math.min(c.shakeMax, c.shakePerHit * hits));
    this.kit.hitStop(Math.min(c.hitStopMax, c.hitStopBase + c.hitStopPerHit * hits));
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.blade?.stop();
    this.wake?.stop();
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
