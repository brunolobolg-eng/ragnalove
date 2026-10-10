import * as THREE from 'three';
import { WARRIOR_FX } from '../../../config/fx/warrior';
import { RUNIC_PALETTE as P, WARRIOR_RUNIC_FX as C } from '../../../config/fx/warriorRunic';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import type { Ribbon } from '../kit/Ribbons';
import { disposeFxGroup, fxSprite, Projectile, screenAngle } from '../kit/Shapes';
import { VFX } from '../kit/vfxSettings';
import { fxTexture } from '../kit/vfxTextures';
import type { VisualUnit } from './CombatVisualCtx';
import { rgb, updatePops, type Pop } from './warriorFx';

/**
 * Efeitos do Cavaleiro Rúnico (Guerreiro), um por habilidade, na paleta azul / carmesim / dourado / verde-água:
 *  - Lâmina Encantada: brilho azul na arma e no corpo, runas leves no chão; ignição ao ligar.
 *  - Onda Sônica: crescente azul do herói até o alvo; estilhaço em leque no impacto.
 *  - Limite da Morte: runas carmesim sob o alvo marcado (acompanham o alvo) e pulsos; faísca de volta ao herói.
 *  - Cem Lanças: lanças douradas caindo em sequência sobre o alvo e os vizinhos, com círculo dourado no chão.
 *  - Cortador de Vento: anel verde-água que gira em volta do herói; rajadas em cada inimigo atingido.
 * Só apresentação: usa o kit (partículas, fitas, decalques, flashes, tremor) e libera tudo ao fim (`done`).
 * Números e cores vêm de `src/config/fx/warriorRunic.ts`.
 */

const TWO_PI = Math.PI * 2;
/** Plano horizontal compartilhado pelas runas. Geometria única: nunca é disposta. */
const GROUND_PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

type RuneMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;

/** Círculo de runas no chão (mesma técnica da Fúria: malha própria que pode girar e seguir a unidade). */
function runeMesh(color: THREE.Color, size: number): RuneMesh {
  const mat = new THREE.MeshBasicMaterial({
    map: fxTexture('decal_runesFrost'),
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  });
  const m = new THREE.Mesh(GROUND_PLANE, mat);
  m.scale.setScalar(size);
  m.renderOrder = 2;
  return m;
}

/** Ângulo no plano (x, z) do centro até `p`, em [0, 2π). */
function angleOf(center: THREE.Vector3, p: THREE.Vector3): number {
  const a = Math.atan2(p.z - center.z, p.x - center.x);
  return a < 0 ? a + TWO_PI : a;
}

// ---------------------------------------------------------------- Lâmina Encantada

/**
 * Lâmina Encantada: enquanto dura, a arma solta faíscas azuis, há um halo pulsando no peito e runas no chão que
 * seguem o herói. Ligar (e religar, se já estiver ligada) toca uma ignição: clarão, anel e faíscas na ponta.
 * O efeito esmaece no fim da duração e some sozinho se o herói sair de cena.
 */
export class EnchantBladeFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private end: number;
  private carry = 0;
  private readonly kit: FxKit;
  private readonly view: VisualUnit;
  /** ponta da lâmina neste instante (osso da mão direita, via `staffTip`); pode faltar */
  private readonly tip: () => THREE.Vector3 | undefined;
  private readonly rune: RuneMesh;
  private readonly halo: THREE.Sprite;
  private readonly flashes: Flash[] = [];

  constructor(kit: FxKit, view: VisualUnit, tip: () => THREE.Vector3 | undefined, ticks: number) {
    const c = C.enchant;
    this.kit = kit;
    this.view = view;
    this.tip = tip;
    this.end = ticks / WARRIOR_FX.ticksPerSec;
    this.rune = runeMesh(rgb(P.blue), c.runeSize);
    this.group.add(this.rune);
    this.halo = fxSprite(this.group, 'glow', rgb(P.blue), c.haloSize);
    this.ignite();
  }

  /** A Lâmina foi religada enquanto brilhava: a duração recomeça e a ignição toca de novo. */
  refresh(ticks: number): void {
    this.end = this.t + ticks / WARRIOR_FX.ticksPerSec;
    this.ignite();
  }

  update(dt: number): void {
    if (this.done) return;
    // a unidade saiu da cena (morreu ou foi removida): o efeito encerra
    if (!this.view.root.parent) {
      this.dispose();
      return;
    }
    this.t += dt;
    const c = C.enchant;
    const t = this.t;
    for (const f of this.flashes) f.update(dt);
    // depois do fim da duração, esmaece e encerra
    const fade = t < this.end ? 1 : 1 - (t - this.end) / c.fadeOut;
    if (fade <= 0) {
      this.dispose();
      return;
    }
    const base = this.view.root.position;
    const fin = Math.min(1, t / c.runeFadeIn) * fade;
    const pulse = 1 + c.haloPulse * Math.sin(t * c.haloSpeed);
    this.rune.position.set(base.x, WARRIOR_FX.groundY, base.z);
    this.rune.rotation.y += c.runeSpin * dt;
    this.rune.material.opacity = c.runeOpacity * fin;
    this.halo.position.set(base.x, c.haloHeight, base.z);
    this.halo.scale.setScalar(c.haloSize * pulse);
    this.halo.material.opacity = c.haloOpacity * fin * pulse;
    if (t < this.end) {
      const tip = this.tip();
      if (tip) {
        this.carry += c.sparksPerSec * dt;
        while (this.carry >= 1) {
          this.carry -= 1;
          this.spark(tip);
        }
      } else {
        this.carry = 0;
      }
    }
  }

  /** Faísca azul que sobe da ponta da lâmina e esfria para branco. */
  private spark(tip: THREE.Vector3): void {
    const c = C.enchant;
    this.kit.particles.glow.emit({
      pos: tip,
      posJitter: 0.1,
      vel: new THREE.Vector3(0, c.sparkRise, 0),
      velJitter: 0.4,
      life: c.sparkLife,
      size: c.sparkSize,
      sizeEnd: c.sparkSizeEnd,
      color: rgb(P.blue),
      colorEnd: rgb(P.white),
      count: 1,
    });
  }

  /** Ignição: clarão na lâmina, anel azul no chão e faíscas que saltam da ponta. */
  private ignite(): void {
    const c = C.enchant;
    const base = this.view.root.position;
    const at = this.tip() ?? base.clone().setY(1.0);
    this.flashes.push(new Flash(this.group, at.clone(), rgb(P.blue), c.flashSize, c.flashLife));
    this.kit.decals.spawn({
      kind: 'ring',
      pos: base.clone().setY(WARRIOR_FX.groundY),
      size: c.ringSize,
      sizeEnd: c.ringEnd,
      color: rgb(P.blue, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    this.kit.particles.spark.emit({
      pos: at,
      posJitter: 0.1,
      vel: new THREE.Vector3(0, 0.6, 0),
      velJitter: c.igniteSpeed,
      life: 0.4,
      size: 0.1,
      sizeEnd: 0.02,
      color: rgb(P.white),
      colorEnd: rgb(P.blue),
      drag: 1.5,
      count: c.igniteSparks,
    });
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group); // também libera o material das runas e do halo
  }
}

// ---------------------------------------------------------------- Onda Sônica

/**
 * Onda Sônica: um crescente azul-claro sai do herói e voa até o alvo (com fita de rastro). No impacto, uma estrela
 * e um estilhaço em leque: lâminas curtas que se afastam e somem. O crescente é orientado pelo movimento na tela.
 */
export class SonicWaveFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  /** instante do impacto (s); -1 enquanto a onda ainda voa */
  private impactT = -1;
  private readonly kit: FxKit;
  private readonly from: THREE.Vector3;
  private readonly to: THREE.Vector3;
  private readonly crescent: THREE.Sprite;
  private readonly pos = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly pops: Pop[] = [];
  private readonly shards: { s: THREE.Sprite; dx: number; dy: number; size: number }[] = [];
  private readonly ribbon?: Ribbon;

  constructor(from: THREE.Vector3, to: THREE.Vector3, kit: FxKit) {
    const c = C.sonic;
    this.kit = kit;
    this.from = from.clone();
    this.to = to.clone();
    this.crescent = fxSprite(this.group, 'slash', rgb(P.blue), c.crescentSize);
    this.crescent.visible = false;
    this.ribbon = kit.ribbons.acquire(rgb(P.blue), c.trailWidth, c.trailLife);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = C.sonic;
    const t = this.t;
    if (this.impactT < 0) {
      const s = Math.min(1, t / c.flight);
      const k = 1 - (1 - s) * (1 - s); // sai depressa e desacelera perto do alvo
      this.pos.lerpVectors(this.from, this.to, k);
      this.ahead.lerpVectors(this.from, this.to, Math.min(1, k + 0.1));
      this.crescent.visible = true;
      this.crescent.position.copy(this.pos);
      this.crescent.material.rotation = screenAngle(this.kit.stage.camera, this.pos, this.ahead) + Math.PI / 2 + c.crescentRot;
      this.crescent.material.opacity = Math.min(1, s * 4);
      this.crescent.scale.setScalar(c.crescentSize * (0.7 + 0.3 * s));
      this.ribbon?.push(this.pos);
      if (s >= 1) this.impact();
    } else {
      const f = (t - this.impactT) / c.fadeOut;
      this.crescent.material.opacity = Math.max(0, 1 - f);
      if (f >= 1) this.crescent.visible = false;
      const k = Math.min(1, (t - this.impactT) / c.shardLife);
      const e = 1 - (1 - k) * (1 - k);
      for (const sh of this.shards) {
        sh.s.position.set(this.to.x + sh.dx * c.shardDist * e, this.to.y + sh.dy * c.shardDist * e, this.to.z);
        sh.s.material.opacity = (1 - k) * (1 - k);
        sh.s.scale.setScalar(sh.size * (1 - 0.4 * k));
      }
    }
    updatePops(this.pops, t);
    if (t >= c.life) this.dispose();
  }

  private impact(): void {
    const c = C.sonic;
    this.impactT = this.t;
    this.ribbon?.stop();
    const at = this.to;
    const star = fxSprite(this.group, 'impact', rgb(P.blue), c.starSize * 0.8);
    star.position.copy(at);
    star.material.rotation = Math.random() * Math.PI;
    this.pops.push({ s: star, t0: this.t, life: c.starLife, from: c.starSize * 0.8, to: c.starSize * 1.15 });
    // estilhaço em leque, no plano da tela (x e altura)
    for (let i = 0; i < c.shards; i++) {
      const a = (i / c.shards) * TWO_PI + (Math.random() - 0.5) * 0.4;
      const size = c.shardSize * (0.8 + 0.4 * Math.random());
      const s = fxSprite(this.group, 'slash', rgb(P.white), size);
      s.position.copy(at);
      s.material.rotation = a;
      this.shards.push({ s, dx: Math.cos(a), dy: Math.sin(a), size });
    }
    this.kit.particles.spark.emit({
      pos: at,
      posJitter: 0.05,
      velJitter: 2.5,
      life: 0.3,
      size: 0.09,
      sizeEnd: 0.02,
      color: rgb(P.white),
      colorEnd: rgb(P.blue),
      drag: 1.2,
      count: c.sparks,
    });
    this.kit.stage.addShake(c.shake);
    this.kit.hitStop(c.hitStop);
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Limite da Morte

/** Marcas vivas do Limite da Morte: a faísca devolvida usa a mais próxima para saber de onde partir. */
const liveMarks = new Set<DeathBoundFX>();

/** Posição do alvo marcado mais perto de `near` (cópia), ou undefined se não há marca viva. */
export function nearestMark(near: THREE.Vector3): THREE.Vector3 | undefined {
  let best: THREE.Vector3 | undefined;
  let bestD = Infinity;
  for (const m of liveMarks) {
    const p = m.anchor();
    if (!p) continue;
    const d = p.distanceToSquared(near);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Limite da Morte: círculo de runas carmesim sob o inimigo marcado, que acompanha o alvo enquanto ele anda.
 * Um halo pulsa sobre a cabeça e um anel sai do círculo a cada pulso. Dura o tempo da marca (`ticks`).
 */
export class DeathBoundFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private pulseT = 0;
  private readonly end: number;
  private readonly kit: FxKit;
  private readonly view: VisualUnit | undefined;
  /** onde o alvo estava quando foi marcado (usado só se a unidade ainda não tiver visual) */
  private readonly fallback: THREE.Vector3;
  private readonly rune: RuneMesh;
  private readonly halo: THREE.Sprite;
  private readonly flashes: Flash[] = [];

  constructor(kit: FxKit, view: VisualUnit | undefined, fallback: THREE.Vector3, ticks: number) {
    const c = C.death;
    this.kit = kit;
    this.view = view;
    this.fallback = fallback.clone();
    this.end = ticks / WARRIOR_FX.ticksPerSec;
    this.rune = runeMesh(rgb(P.crimson), c.runeSize);
    this.group.add(this.rune);
    this.halo = fxSprite(this.group, 'halo', rgb(P.crimson), c.haloSize);
    const base = this.basePos();
    this.flashes.push(new Flash(this.group, base.clone().setY(c.haloHeight), rgb(P.crimson), c.flashSize, c.flashLife));
    kit.decals.spawn({
      kind: 'ring',
      pos: base.clone().setY(WARRIOR_FX.groundY),
      size: c.ringSize,
      sizeEnd: c.ringEnd,
      color: rgb(P.crimson, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.7,
    });
    liveMarks.add(this);
  }

  /** Posição da base do alvo agora (cópia), ou undefined se a unidade já saiu de cena. */
  anchor(): THREE.Vector3 | undefined {
    if (this.done || (this.view && !this.view.root.parent)) return undefined;
    return this.basePos().clone();
  }

  private basePos(): THREE.Vector3 {
    return this.view ? this.view.root.position : this.fallback;
  }

  update(dt: number): void {
    if (this.done) return;
    if (this.view && !this.view.root.parent) {
      this.dispose();
      return;
    }
    this.t += dt;
    const c = C.death;
    const t = this.t;
    for (const f of this.flashes) f.update(dt);
    const fade = t < this.end ? 1 : 1 - (t - this.end) / c.fadeOut;
    if (fade <= 0) {
      this.dispose();
      return;
    }
    const base = this.basePos();
    const fin = Math.min(1, t / c.runeFadeIn) * fade;
    this.rune.position.set(base.x, WARRIOR_FX.groundY, base.z);
    this.rune.rotation.y += c.runeSpin * dt;
    this.rune.material.opacity = c.runeOpacity * fin;
    const pulse = 1 + c.haloPulse * Math.sin(t * c.haloSpeed);
    this.halo.position.set(base.x, c.haloHeight, base.z);
    this.halo.scale.setScalar(c.haloSize * pulse);
    this.halo.material.opacity = c.haloOpacity * fin * pulse;
    this.pulseT += dt;
    if (t < this.end && this.pulseT >= c.pulseEvery) {
      this.pulseT = 0;
      this.kit.decals.spawn({
        kind: 'ring',
        pos: base.clone().setY(WARRIOR_FX.groundY),
        size: c.pulseSize,
        sizeEnd: c.pulseEnd,
        color: rgb(P.crimson, VFX.flash),
        life: c.pulseLife,
        additive: true,
        fadeIn: 0.01,
        fadeOut: 0.7,
      });
    }
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    liveMarks.delete(this);
    disposeFxGroup(this.group);
  }
}

/**
 * Dano devolvido pelo Limite da Morte: uma faísca carmesim sai do alvo marcado (`from`) e volta ao herói (`to`).
 * Ao chegar, espoca um brilho e um anel carmesim no herói.
 */
export function reflectSpark(kit: FxKit, from: THREE.Vector3, to: THREE.Vector3): OneShotFx {
  const c = C.reflect;
  return new Projectile(kit, from, to, {
    color: rgb(P.crimson),
    tex: 'orb',
    size: c.size,
    duration: c.flight,
    arc: c.arc,
    trailWidth: c.trailWidth,
    trailLife: c.trailLife,
    sparks: rgb(P.crimson),
    linger: c.linger,
    onArrive: () => {
      kit.particles.glow.emit({
        pos: to,
        posJitter: 0.15,
        vel: new THREE.Vector3(0, 1.0, 0),
        velJitter: c.arriveSpeed,
        life: 0.3,
        size: 0.2,
        sizeEnd: 0.02,
        color: rgb(P.crimson),
        colorEnd: rgb(P.white),
        count: c.arriveSparks,
      });
      kit.decals.spawn({
        kind: 'ring',
        pos: to.clone().setY(WARRIOR_FX.groundY),
        size: c.ringSize,
        sizeEnd: c.ringEnd,
        color: rgb(P.crimson, VFX.flash),
        life: c.ringLife,
        additive: true,
        fadeIn: 0.01,
        fadeOut: 0.7,
      });
      kit.stage.addShake(c.shake);
    },
  });
}

// ---------------------------------------------------------------- Cem Lanças

/**
 * Cem Lanças: `hits` golpes em sequência. Em cada golpe, uma lança dourada cai sobre cada alvo (o principal e os
 * vizinhos). Um círculo dourado fica no chão durante toda a sequência. Ao cair, a lança espoca faíscas e uma estrela.
 * Os feixes são sprites com um material compartilhado (nenhum material novo por lança).
 */
export class SpearRainFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly end: number;
  private readonly kit: FxKit;
  private readonly spears: { s: THREE.Sprite; x: number; z: number; t0: number; main: boolean; landed: boolean }[] = [];
  private readonly pops: Pop[] = [];

  /** `targets`: onde cai cada golpe (o alvo principal vem primeiro). */
  constructor(center: THREE.Vector3, targets: THREE.Vector3[], hits: number, radius: number, kit: FxKit) {
    const c = C.spear;
    this.kit = kit;
    this.end = Math.max(0, hits - 1) * c.interval + c.fall + c.tail;
    const R = radius + 0.5;
    kit.decals.spawn({
      kind: 'ring',
      pos: center.clone().setY(WARRIOR_FX.groundY),
      size: R * c.ringStart,
      sizeEnd: R * c.ringEnd,
      color: rgb(P.gold, VFX.flash),
      life: this.end,
      additive: true,
      fadeIn: 0.05,
      fadeOut: 0.3,
    });
    const beamMat = new THREE.SpriteMaterial({
      map: fxTexture('trace'),
      color: rgb(P.gold),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    for (let k = 0; k < hits; k++) {
      targets.forEach((p, j) => {
        const s = new THREE.Sprite(beamMat);
        s.scale.set(c.beamW, c.beamH, 1);
        s.renderOrder = 9;
        s.visible = false;
        this.group.add(s);
        this.spears.push({
          s,
          x: p.x + (Math.random() - 0.5) * 0.25,
          z: p.z + (Math.random() - 0.5) * 0.25,
          t0: k * c.interval + Math.random() * 0.02,
          main: j === 0,
          landed: false,
        });
      });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = C.spear;
    const t = this.t;
    for (const sp of this.spears) {
      if (sp.landed) continue;
      const k = (t - sp.t0) / c.fall;
      if (k < 0) continue;
      if (k >= 1) {
        sp.landed = true;
        sp.s.visible = false;
        this.land(sp.x, sp.z, sp.main);
        continue;
      }
      // cai acelerando: a ponta chega ao chão no fim da queda
      sp.s.visible = true;
      sp.s.position.set(sp.x, c.height * (1 - k * k) + c.beamH / 2, sp.z);
    }
    updatePops(this.pops, t);
    if (t >= this.end) this.dispose();
  }

  private land(x: number, z: number, main: boolean): void {
    const c = C.spear;
    const at = new THREE.Vector3(x, 0.4, z);
    this.kit.particles.spark.emit({
      pos: at,
      posJitter: 0.1,
      vel: new THREE.Vector3(0, 1.6, 0),
      velJitter: 2.0,
      life: 0.3,
      size: 0.09,
      sizeEnd: 0.02,
      color: rgb(P.gold),
      colorEnd: rgb(P.gold, 0.4),
      gravity: 9,
      drag: 0.8,
      count: c.landSparks,
    });
    const star = fxSprite(this.group, 'impact', rgb(P.gold), c.starSize * 0.8);
    star.position.set(x, 0.6, z);
    star.material.rotation = Math.random() * Math.PI;
    this.pops.push({ s: star, t0: this.t, life: c.starLife, from: c.starSize * 0.8, to: c.starSize * 1.15 });
    if (main) {
      this.kit.decals.spawn({
        kind: 'ring',
        pos: new THREE.Vector3(x, WARRIOR_FX.groundY, z),
        size: c.landRing,
        sizeEnd: c.landRingEnd,
        color: rgb(P.gold, VFX.flash),
        life: c.landRingLife,
        additive: true,
        fadeIn: 0.01,
        fadeOut: 0.7,
      });
      this.kit.stage.addShake(c.shake);
    }
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------- Cortador de Vento

/**
 * Cortador de Vento: um anel verde-água gira em volta do herói (uma volta em `spin` segundos), com fita de rastro e
 * poeira leve na ponta. Quando o giro passa por cada inimigo atingido, sai uma rajada (crescente tangente e faíscas).
 */
export class WindCutterFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly end: number;
  private readonly kit: FxKit;
  private readonly center: THREE.Vector3;
  /** raio visual do anel (unidades do mundo) */
  private readonly R: number;
  private readonly gusts: { at: number; pos: THREE.Vector3; done: boolean }[];
  private readonly pops: Pop[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly ribbon?: Ribbon;

  /** `tiles`: posições (no mundo) dos inimigos atingidos. */
  constructor(center: THREE.Vector3, radius: number, tiles: THREE.Vector3[], kit: FxKit) {
    const c = C.wind;
    this.kit = kit;
    this.center = center.clone().setY(0);
    this.R = Math.max(1, radius) * c.ringScale;
    this.end = c.spin + c.tail;
    kit.decals.spawn({
      kind: 'ring',
      pos: this.center.clone().setY(WARRIOR_FX.groundY),
      size: this.R * c.ringStart,
      sizeEnd: this.R * c.ringEnd,
      color: rgb(P.aqua, VFX.flash),
      life: c.ringLife,
      additive: true,
      fadeIn: 0.01,
      fadeOut: 0.6,
    });
    // a rajada de cada alvo sai quando o giro (que começa no ângulo 0) passa por ele
    this.gusts = tiles.map((p) => ({ at: (angleOf(this.center, p) / TWO_PI) * c.spin, pos: p.clone().setY(c.height), done: false }));
    this.ribbon = kit.ribbons.acquire(rgb(P.aqua), c.ribbonWidth, c.ribbonLife);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const c = C.wind;
    const t = this.t;
    if (t <= c.spin) {
      const a = (t / c.spin) * TWO_PI;
      const R = this.R;
      this.tmp.set(this.center.x + Math.cos(a) * R, c.height, this.center.z + Math.sin(a) * R);
      this.ribbon?.push(this.tmp);
      this.kit.particles.glow.emit({
        pos: this.tmp,
        posJitter: 0.06,
        vel: new THREE.Vector3(-Math.sin(a), 0.2, Math.cos(a)).multiplyScalar(c.swirlSpeed),
        velJitter: 0.3,
        life: 0.3,
        size: 0.14,
        sizeEnd: 0.02,
        color: rgb(P.aqua),
        colorEnd: rgb(P.white),
        count: 1,
      });
    } else {
      this.ribbon?.stop();
    }
    for (const g of this.gusts) {
      if (!g.done && t >= g.at) {
        g.done = true;
        this.gust(g.pos);
      }
    }
    updatePops(this.pops, t);
    if (t >= this.end) this.dispose();
  }

  /** Rajada num inimigo atingido: crescente tangente ao giro e faíscas que escapam do centro. */
  private gust(p: THREE.Vector3): void {
    const c = C.wind;
    const s = fxSprite(this.group, 'slash', rgb(P.aqua), c.gustSize);
    s.position.copy(p);
    s.material.rotation = screenAngle(this.kit.stage.camera, this.center.clone().setY(c.height), p) + Math.PI / 2;
    this.pops.push({ s, t0: this.t, life: c.gustLife, from: c.gustSize * 0.5, to: c.gustSize * 1.1 });
    const out = new THREE.Vector3(p.x - this.center.x, 0, p.z - this.center.z).normalize().multiplyScalar(c.gustSpeed);
    this.kit.particles.glow.emit({
      pos: p,
      posJitter: 0.15,
      vel: out,
      velJitter: 0.5,
      life: 0.35,
      size: 0.16,
      sizeEnd: 0.02,
      color: rgb(P.aqua),
      colorEnd: rgb(P.white),
      count: c.gustSparks,
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
