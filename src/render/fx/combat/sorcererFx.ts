import * as THREE from 'three';
import { SORCERER_FX as K } from '../../../config/fx/sorcerer';
import { FlickerLight, Flash, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import type { Ribbon } from '../kit/Ribbons';
import { disposeFxGroup, fxSprite } from '../kit/Shapes';
import { VFX } from '../kit/vfxSettings';
import type { CombatVisualCtx } from './CombatVisualCtx';

/**
 * Efeitos de combate da Feiticeira (arcana): Orbe Arcano, Meteoro, Corrente Elétrica e acerto crítico.
 * Cada habilidade tem forma e movimento próprios e segue antecipação → trajeto → impacto → dissipação.
 * Tudo vive no mundo: sprites de frente para a câmera, círculos e anéis no chão, fitas e partículas.
 * Só apresentação: os números estão em config/fx/sorcerer.ts.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** meio tile: a área de dano do Meteoro é um quadrado de tiles, e o círculo rúnico cobre o seu interior */
const HALF_TILE = 0.5;
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const rgb = (c: readonly number[], k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
/** ponto do chão sob uma posição (as marcas ficam um pouco acima do piso, para não afundar) */
const onGround = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x, K.groundLift, p.z);

const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();
const lineDir = new THREE.Vector3();

/** Lê a base da câmera (eixos da tela no mundo) para alinhar linhas e órbitas à tela. */
function readCamera(cam: THREE.Camera): void {
  cam.updateMatrixWorld();
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  camUp.setFromMatrixColumn(cam.matrixWorld, 1);
}

/** Sprite alongado de A até B, medido no plano da tela (o sprite é sempre de frente para a câmera). */
function placeLine(s: THREE.Sprite, a: THREE.Vector3, b: THREE.Vector3, width: number, stretch = 1): void {
  lineDir.subVectors(b, a);
  const sx = lineDir.dot(camRight);
  const sy = lineDir.dot(camUp);
  s.position.addVectors(a, b).multiplyScalar(0.5);
  s.scale.set(width, Math.max(K.minLength, Math.hypot(sx, sy)) * stretch, 1);
  // a textura "trace" é vertical: gira o eixo longo para a direção do segmento na tela
  s.material.rotation = Math.atan2(sy, sx) - Math.PI / 2;
}

/** Ponto da curva quadrática (a → controle m → b) no instante k (0 a 1). */
function arcPoint(a: THREE.Vector3, m: THREE.Vector3, b: THREE.Vector3, k: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - k;
  return out.set(0, 0, 0).addScaledVector(a, u * u).addScaledVector(m, 2 * u * k).addScaledVector(b, k * k);
}

/** Vetor aleatório de comprimento até r (partículas que convergem ou se espalham). */
function jitterVec(r: number): THREE.Vector3 {
  return new THREE.Vector3((Math.random() * 2 - 1) * r, (Math.random() * 2 - 1) * r, (Math.random() * 2 - 1) * r);
}

/**
 * Base dos efeitos da Feiticeira: linha do tempo própria (cortes em segundos), flashes, luzes e fitas do pool.
 * Ao terminar, devolve luzes e fitas e libera os materiais do grupo. Decalques e partículas têm vida própria.
 */
abstract class SorcererFx implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  protected readonly tl = new Timeline();
  protected readonly kit: FxKit;
  private readonly flashes: Flash[] = [];
  private readonly lamps: FlickerLight[] = [];
  private readonly ribbons: Ribbon[] = [];

  constructor(
    protected readonly ctx: CombatVisualCtx,
    protected readonly life: number,
  ) {
    this.kit = ctx.kit;
  }

  /** Tempo decorrido do efeito (s). */
  protected get t(): number {
    return this.tl.time;
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    this.frame(dt);
    for (const f of this.flashes) f.update(dt);
    if (this.t >= this.life && this.flashes.every((f) => f.done)) this.finish();
  }

  /** Quadro a quadro, depois dos cortes da linha do tempo. */
  protected frame(_dt: number): void {
    // cada efeito redefine
  }

  /** Flash curto e discreto (o próprio Flash respeita "reduzir flashes"). */
  protected flash(pos: THREE.Vector3, color: THREE.Color, size: number, life: number): void {
    this.flashes.push(new Flash(this.group, pos, color, size, life));
  }

  /** Luz do pool do Stage (pode faltar no orçamento: o efeito segue só com brilho). */
  protected makeLight(color: THREE.ColorRepresentation, intensity: number, distance: number, flicker: number): FlickerLight {
    const l = new FlickerLight(this.kit.stage, color, intensity, distance, flicker);
    this.lamps.push(l);
    return l;
  }

  /** Fita do pool (pode faltar: o efeito segue só com sprites e partículas). */
  protected makeRibbon(color: THREE.Color, width: number, life: number): Ribbon | undefined {
    const r = this.kit.ribbons.acquire(color, width, life);
    if (r) this.ribbons.push(r);
    return r;
  }

  private finish(): void {
    this.done = true;
    for (const l of this.lamps) l.release();
    for (const r of this.ribbons) r.stop();
    disposeFxGroup(this.group);
  }
}

// ---------------- Orbe Arcano (ataque básico) ----------------

/**
 * Orbe magenta com dois satélites esmeralda que orbitam a cabeça: carga com crescente girando na ponta do
 * cajado, rastro de motes até o alvo e estrela rosa-branca com anel no chão no acerto.
 * O voo termina em `arrive` (o mesmo instante que o GameView usa para adiar a reação do alvo).
 */
export class ArcaneOrbFx extends SorcererFx {
  private readonly charge: THREE.Sprite;
  private readonly orb: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly sats: THREE.Sprite[] = [];
  private readonly rib: Ribbon | undefined;
  private readonly p = new THREE.Vector3();
  private readonly base: THREE.Vector3;
  private arrived = false;
  private star?: THREE.Sprite;
  private starT0 = 0;

  constructor(
    ctx: CombatVisualCtx,
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly arrive: number,
  ) {
    super(ctx, arrive + K.orb.linger + K.orb.starLife);
    const O = K.orb;
    this.base = from.clone();
    this.charge = fxSprite(this.group, 'twirl', rgb(K.color.arcaneCore), O.chargeStart);
    this.charge.position.copy(from);
    this.halo = fxSprite(this.group, 'glow', rgb(K.color.arcaneBody), O.halo, { opacity: 0 });
    this.orb = fxSprite(this.group, 'orb', rgb(K.color.arcaneCore), O.orb, { opacity: 0 });
    for (let i = 0; i < O.satellites; i++) this.sats.push(fxSprite(this.group, 'soul', rgb(K.color.tealCore), O.satSize, { opacity: 0 }));
    this.rib = this.makeRibbon(rgb(K.color.arcaneBody), O.trailWidth, O.trailLife);
  }

  protected frame(dt: number): void {
    const O = K.orb;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    if (!this.arrived) {
      if (t < O.chargeTime) {
        // carga: o crescente gira e cresce na ponta do cajado; motes se juntam ali
        const k = clamp01(t / O.chargeTime);
        this.charge.scale.setScalar(O.chargeStart + (O.chargeSize - O.chargeStart) * k);
        this.charge.material.rotation += dt * O.chargeSpin;
        this.charge.material.opacity = 1;
        const d = jitterVec(O.chargeSpread);
        this.kit.particles.glow.emit({
          pos: this.base.clone().add(d), vel: d.multiplyScalar(-O.chargeInflow), life: O.chargeTime, size: O.moteSize, sizeEnd: O.moteSizeEnd,
          color: rgb(K.color.mote), colorEnd: rgb(K.color.moteEnd), count: 1,
        });
        return;
      }
      this.charge.material.opacity = 0;
      // nascimento: o orbe cresce na ponta do cajado e sai
      const birthK = clamp01((t - O.chargeTime) / O.birth);
      this.orb.material.opacity = 1;
      this.halo.material.opacity = O.haloAlpha;
      for (const s of this.sats) s.material.opacity = 1;
      const k = clamp01((t - O.chargeTime) / (this.arrive - O.chargeTime));
      this.p.lerpVectors(this.from, this.to, k);
      this.orb.position.copy(this.p);
      this.halo.position.copy(this.p);
      this.orb.scale.setScalar(O.orb * (O.birthFrom + (1 - O.birthFrom) * birthK));
      this.orb.material.rotation += dt * O.orbSpin;
      this.halo.material.rotation -= dt * O.orbSpin * O.haloSpinRatio;
      this.placeSats(this.p, t);
      this.rib?.push(this.p);
      // motes que sobem do rastro
      this.kit.particles.glow.emit({
        pos: this.p, posJitter: O.moteJitter, vel: new THREE.Vector3(0, O.moteRise, 0), life: O.moteLife,
        size: O.moteSize, sizeEnd: O.moteSizeEnd, color: rgb(K.color.mote), colorEnd: rgb(K.color.moteEnd), count: O.moteRate,
      });
      if (k >= 1) this.impact();
      return;
    }
    // depois do acerto: o orbe e os satélites apagam e a estrela cresce e some
    const f = clamp01((t - this.arrive) / O.linger);
    this.orb.material.opacity = 1 - f;
    this.halo.material.opacity = O.haloAlpha * (1 - f);
    for (const s of this.sats) s.material.opacity = 1 - f;
    this.placeSats(this.p, t);
    if (this.star) {
      const k = clamp01((t - this.starT0) / O.starLife);
      this.star.scale.setScalar(O.starSize * (O.starGrow0 + O.starGrow1 * easeOut(k)));
      this.star.material.opacity = (1 - k) * (1 - k);
    }
  }

  /** Satélites esmeralda girando em volta da cabeça, no plano da tela. */
  private placeSats(center: THREE.Vector3, t: number): void {
    const O = K.orb;
    this.sats.forEach((s, i) => {
      const a = t * O.satSpeed + (i * Math.PI * 2) / Math.max(1, O.satellites);
      s.position.copy(center).addScaledVector(camRight, Math.cos(a) * O.satRadius).addScaledVector(camUp, Math.sin(a) * O.satRadius);
    });
  }

  /** Acerto: é o instante em que o GameView reage o alvo (impactDelay). */
  private impact(): void {
    const O = K.orb;
    this.arrived = true;
    this.rib?.stop();
    this.star = fxSprite(this.group, 'soul', rgb(K.color.arcaneCore), O.starSize * O.starGrow0);
    this.star.position.copy(this.to);
    this.starT0 = this.t;
    // estilhaços magenta que freiam e sobem um pouco
    this.kit.particles.spark.emit({
      pos: this.to.clone(), posJitter: O.moteJitter, vel: new THREE.Vector3(0, O.shardRise, 0), velJitter: O.shardSpeed,
      life: O.shardLife, size: O.shardSize, sizeEnd: O.shardSizeEnd, color: rgb(K.color.arcaneCore), colorEnd: rgb(K.color.arcaneDeep),
      drag: O.shardDrag, count: O.shards,
    });
    // anel magenta no chão e flash discreto
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(this.to), size: O.ringStart, sizeEnd: O.ringSize, color: rgb(K.color.arcaneBody, O.ringGain * VFX.flash),
      life: O.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: O.ringFadeOut,
    });
    this.flash(this.to, rgb(K.color.arcaneBody, O.flashGain), O.flashSize, O.flashLife);
    this.kit.stage.addShake(O.shake);
  }
}

// ---------------- Meteoro ----------------

/**
 * Meteoro arcano: a runa magenta aparece no chão (antecipação); um cristal magenta cai do céu acelerando,
 * com rastro em traço, fita e motes; no impacto há flash, onda magenta, anel esmeralda fino, cratera escura
 * e faíscas; depois os motes sobem e a runa apaga devagar.
 * `at` é o centro da área (tile do alvo, em mundo); `radius` é o raio do evento em tiles.
 */
export class ArcaneMeteorFx extends SorcererFx {
  private readonly head: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly streak: THREE.Sprite;
  private readonly rib: Ribbon | undefined;
  private readonly top: THREE.Vector3;
  private readonly ground: THREE.Vector3;
  private readonly center: THREE.Vector3;
  private readonly dir: THREE.Vector3;
  private readonly side: number;
  private readonly lamp: FlickerLight;
  private impacted = false;

  constructor(ctx: CombatVisualCtx, at: THREE.Vector3, radius: number) {
    super(ctx, K.meteor.life);
    const M = K.meteor;
    // o círculo cobre o quadrado do dano (todos os tiles a até `radius` do centro)
    const reach = radius + HALF_TILE;
    this.side = reach * K.decalPerRadius;
    this.center = onGround(at);
    this.ground = new THREE.Vector3(at.x, M.headGround, at.z);
    this.top = new THREE.Vector3(at.x + M.skyOffsetX, M.skyHeight, at.z + M.skyOffsetZ);
    this.dir = this.ground.clone().sub(this.top).normalize();
    // antecipação: círculo rúnico magenta que cresce e brilho esmeralda no centro
    this.kit.decals.spawn({
      kind: 'runesFire', pos: this.center, size: this.side * M.runeStart, sizeEnd: this.side, color: rgb(K.color.arcaneBody, M.runeGain * VFX.flash),
      life: M.runeLife, additive: true, fadeIn: M.runeFadeIn, fadeOut: M.runeFadeOut, spin: M.runeSpin,
    });
    this.kit.decals.spawn({
      kind: 'glow', pos: this.center, size: this.side * M.centerGlowSize, color: rgb(K.color.tealBody, M.centerGlowGain * VFX.flash),
      life: M.centerGlowLife, additive: true, fadeIn: M.centerGlowFadeIn, fadeOut: M.centerGlowFadeOut, opacity: M.centerGlowAlpha,
    });
    // corpo do meteoro: halo, rastro em traço, cabeça e fita (o brilho aparece quando ele entra na tela)
    this.halo = fxSprite(this.group, 'glow', rgb(K.color.arcaneBody), M.haloSize, { opacity: 0 });
    this.streak = fxSprite(this.group, 'trace', rgb(K.color.arcaneBody), 1, { opacity: 0 });
    this.head = fxSprite(this.group, 'orb', rgb(K.color.arcaneCore), M.headSize, { opacity: 0 });
    this.rib = this.makeRibbon(rgb(K.color.arcaneBody), M.ribbonWidth, M.ribbonLife);
    // luz magenta: só depois do impacto (o lampejo do cristal não ilumina a conjuradora)
    this.lamp = this.makeLight(K.color.lightArcane, M.light.intensity, M.light.distance, M.light.flicker);
    this.lamp.set(new THREE.Vector3(at.x, M.light.height, at.z));
  }

  protected frame(dt: number): void {
    const M = K.meteor;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    // a luz só acende no impacto (atualizada todo quadro: a lâmpada do pool pode vir com brilho antigo)
    this.lamp.update(dt, t < M.impactAt ? 0 : clamp01(1 - (t - M.impactAt) / M.light.time));
    if (!this.impacted) {
      if (t < M.skyAt) return;
      // cai acelerando: a altura cai com o quadrado do tempo decorrido
      const k = clamp01((t - M.skyAt) / (M.impactAt - M.skyAt));
      const head = new THREE.Vector3().lerpVectors(this.top, this.ground, k * k);
      const fadeIn = clamp01((t - M.skyAt) / M.headFadeIn);
      this.head.position.copy(head);
      this.head.material.opacity = fadeIn;
      this.head.material.rotation += dt * M.headSpin;
      this.halo.position.copy(head);
      this.halo.material.opacity = M.haloAlpha * fadeIn;
      const tail = head.clone().addScaledVector(this.dir, -M.streakLength);
      placeLine(this.streak, tail, head, M.streakWidth);
      this.streak.material.opacity = M.streakAlpha * fadeIn;
      this.rib?.push(head);
      // motes que o meteoro solta pelo caminho
      this.kit.particles.glow.emit({
        pos: head, posJitter: M.moteJitter, life: M.moteLife, size: M.moteSize, sizeEnd: M.moteSizeEnd,
        color: rgb(K.color.mote), colorEnd: rgb(K.color.moteEnd), count: M.moteRate,
      });
      if (k >= 1) this.impact();
      return;
    }
    // depois do impacto: o corpo some em instantes e os motes sobem por um tempo
    const f = clamp01((t - M.impactAt) / M.headFadeOut);
    this.head.material.opacity = 1 - f;
    this.halo.material.opacity = M.haloAlpha * (1 - f);
    this.streak.material.opacity = M.streakAlpha * (1 - f);
    if (t < M.impactAt + M.riseTime) {
      this.kit.particles.glow.emit({
        pos: this.center.clone().setY(M.riseHeight), posJitter: M.riseSpread, vel: new THREE.Vector3(0, M.riseSpeed, 0), velJitter: M.riseJitter,
        life: M.riseLife, size: M.riseSize, sizeEnd: M.riseSizeEnd, color: rgb(K.color.mote), colorEnd: rgb(K.color.moteEnd),
        count: (M.riseCount * dt) / M.riseTime,
      });
    }
  }

  /** Impacto: flash, onda, anel esmeralda, cratera e faíscas; tremor e pausa curta. */
  private impact(): void {
    const M = K.meteor;
    this.impacted = true;
    this.rib?.stop();
    this.flash(this.ground, rgb(K.color.arcaneCore, M.flashGain), M.flashSize, M.flashLife);
    this.kit.decals.spawn({
      kind: 'ring', pos: this.center, size: this.side * M.waveStart, sizeEnd: this.side * M.waveEnd, color: rgb(K.color.arcaneBody, M.waveGain * VFX.flash),
      life: M.waveLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: M.waveFade,
    });
    this.kit.decals.spawn({
      kind: 'disc', pos: this.center, size: this.side * M.accentStart, sizeEnd: this.side * M.accentEnd, color: rgb(K.color.tealBody, M.accentGain * VFX.flash),
      life: M.accentLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: M.accentFade,
    });
    // cratera escura (mistura normal): a marca do impacto fica no chão
    this.kit.decals.spawn({
      kind: 'scorch', pos: this.center, size: this.side * M.craterScale, color: rgb(K.color.crater), life: M.craterLife,
      fadeIn: M.craterFadeIn, fadeOut: M.craterFadeOut, dissolve: true, opacity: M.craterOpacity,
    });
    this.kit.particles.spark.emit({
      pos: new THREE.Vector3(this.ground.x, M.sparkLift, this.ground.z), vel: new THREE.Vector3(0, M.sparkSpeed, 0), velJitter: M.sparkJitter,
      life: M.sparkLife, size: M.sparkSize, sizeEnd: M.sparkSizeEnd, color: rgb(K.color.arcaneCore), colorEnd: rgb(K.color.arcaneBody),
      gravity: M.sparkGravity, count: M.sparks,
    });
    this.kit.stage.addShake(M.shake);
    this.kit.stage.kick(M.kick);
    this.kit.hitStop(M.hitStop);
  }
}

// ---------------- Corrente Elétrica ----------------

interface Hop {
  a: THREE.Vector3;
  b: THREE.Vector3;
  m: THREE.Vector3;
  start: number;
  end: number;
  pts: THREE.Vector3[];
  lines: THREE.Sprite[];
  beads: { s: THREE.Sprite; i: number; ph: number; base: THREE.Color }[];
}

/**
 * Corrente arcana: a corrente se prende a cada alvo em sequência (arcos suaves magenta com contas
 * rosa e esmeralda, a cabeça viaja por cada arco); na descarga (impactAt, o instante em que os inimigos
 * reagem) todos os alvos estouram juntos com anel, runa esmeralda e faíscas; depois os arcos brilham
 * mais um instante e apagam. Nada de zigue-zague: o contraste com o raio do Mago é a forma e o movimento.
 */
export class ArcaneChainFx extends SorcererFx {
  private readonly hops: Hop[] = [];
  private readonly charge: THREE.Sprite;
  private readonly head: THREE.Sprite;
  private readonly lamp: FlickerLight;
  private readonly headPos = new THREE.Vector3();
  private readonly lineBase = rgb(K.color.arcaneBody);
  private discharged = false;

  constructor(
    ctx: CombatVisualCtx,
    private readonly origin: THREE.Vector3,
    private readonly targets: THREE.Vector3[],
  ) {
    super(ctx, K.chain.life);
    const C = K.chain;
    // janela da ligação: o último salto cai antes da descarga, com saltos de duração igual (limitada)
    const span = Math.max(0, C.impactAt - C.linkStart - C.linkMargin);
    const hopTime = Math.min(C.hopMax, Math.max(C.hopMin, span / Math.max(1, targets.length)));
    let a = origin;
    targets.forEach((b, j) => {
      const start = C.linkStart + j * hopTime;
      this.hops.push(this.buildHop(a, b, start, start + hopTime));
      a = b;
    });
    this.charge = fxSprite(this.group, 'twirl', rgb(K.color.arcaneCore), C.chargeSize, { opacity: 0 });
    this.charge.position.copy(origin);
    this.head = fxSprite(this.group, 'orb', rgb(K.color.arcaneCore), C.headSize, { opacity: 0 });
    // luz esmeralda no centro dos alvos, só na descarga
    const c = new THREE.Vector3();
    for (const p of targets) c.add(p);
    c.multiplyScalar(1 / Math.max(1, targets.length));
    this.lamp = this.makeLight(K.color.lightTeal, C.light.intensity, C.light.distance, C.light.flicker);
    this.lamp.set(new THREE.Vector3(c.x, C.light.height, c.z));
  }

  /** Um salto: curva de Bézier com o meio mais alto, segmentos finos e contas nos pontos. */
  private buildHop(a: THREE.Vector3, b: THREE.Vector3, start: number, end: number): Hop {
    const C = K.chain;
    const m = a.clone().lerp(b, 0.5);
    m.y += C.arcHeight;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= C.segments; i++) pts.push(arcPoint(a, m, b, i / C.segments, new THREE.Vector3()));
    const lines: THREE.Sprite[] = [];
    for (let i = 0; i < C.segments; i++) lines.push(fxSprite(this.group, 'trace', rgb(K.color.arcaneBody), 1, { opacity: 0 }));
    const beads: Hop['beads'] = [];
    for (let i = 0; i <= C.segments; i += C.beadEvery) {
      const teal = beads.length % 2 === 1;
      const base = rgb(teal ? K.color.tealCore : K.color.arcaneCore);
      const s = fxSprite(this.group, 'soul', base, C.beadSize, { opacity: 0 });
      s.position.copy(pts[i]);
      beads.push({ s, i, ph: beads.length * C.beadPhase, base });
    }
    return { a, b, m, start, end, pts, lines, beads };
  }

  protected frame(dt: number): void {
    const C = K.chain;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    // carga: o crescente gira na origem e motes convergem para a ponta do cajado
    if (t < C.linkStart) {
      const k = clamp01(t / C.linkStart);
      this.charge.material.opacity = 1;
      this.charge.scale.setScalar(C.chargeSize * (C.chargeStart + (1 - C.chargeStart) * k));
      this.charge.material.rotation += dt * C.chargeSpin;
      const d = jitterVec(C.chargeSpread);
      this.kit.particles.glow.emit({
        pos: this.origin.clone().add(d), vel: d.multiplyScalar(-C.chargeInflow), life: C.linkStart, size: C.chargeMoteSize, sizeEnd: C.chargeMoteSizeEnd,
        color: rgb(K.color.mote), colorEnd: rgb(K.color.moteEnd), count: 1,
      });
    } else {
      this.charge.material.opacity = clamp01(1 - (t - C.linkStart) / C.chargeFade);
    }
    const flare = t < C.impactAt ? 1 : 1 + (C.flareGain - 1) * clamp01(1 - (t - C.impactAt) / C.flareTime);
    const fade = 1 - clamp01((t - C.fadeAt) / C.fadeTime);
    let headShown = false;
    for (const h of this.hops) {
      const k = clamp01((t - h.start) / (h.end - h.start));
      const n = h.lines.length;
      for (let i = 0; i < n; i++) {
        const s = h.lines[i];
        const shown = t >= h.start && k > i / n;
        s.material.opacity = shown ? C.lineAlpha * fade : 0;
        if (shown) placeLine(s, h.pts[i], h.pts[i + 1], C.lineWidth, C.lineStretch);
        s.material.color.copy(this.lineBase).multiplyScalar(flare);
      }
      for (const b of h.beads) {
        const reached = t >= h.start && k >= b.i / n;
        b.s.material.opacity = reached ? fade : 0;
        const pulse = 1 + C.beadPulse * Math.sin(t * C.beadSpeed + b.ph);
        b.s.scale.setScalar(C.beadSize * pulse);
        b.s.material.color.copy(b.base).multiplyScalar(flare);
      }
      if (t >= h.start && t < h.end) {
        arcPoint(h.a, h.m, h.b, k, this.headPos);
        this.head.position.copy(this.headPos);
        this.head.material.opacity = 1;
        headShown = true;
      }
    }
    this.head.material.opacity = headShown ? 1 : 0;
    if (!this.discharged && t >= C.impactAt) this.discharge();
    this.lamp.update(dt, t < C.impactAt ? 0 : clamp01(1 - (t - C.impactAt) / C.light.time));
  }

  /** Descarga: todos os alvos estouram juntos (é o instante em que o GameView reage). */
  private discharge(): void {
    const C = K.chain;
    this.discharged = true;
    for (const p of this.targets) {
      const g = onGround(p);
      this.flash(p, rgb(K.color.arcaneBody, C.flashGain), C.flashSize, C.flashLife);
      this.kit.decals.spawn({
        kind: 'ring', pos: g, size: C.ringStart, sizeEnd: C.ringSize, color: rgb(K.color.arcaneBody, C.ringGain),
        life: C.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: C.ringFade,
      });
      this.kit.decals.spawn({
        kind: 'runesFire', pos: g, size: C.runeSize * C.runeStart, sizeEnd: C.runeSize, color: rgb(K.color.tealBody, C.runeGain),
        life: C.runeLife, additive: true, fadeIn: C.runeFadeIn, fadeOut: C.runeFadeOut, spin: C.runeSpin,
      });
      this.kit.particles.spark.emit({
        pos: p.clone(), posJitter: C.dischargeSpread, vel: new THREE.Vector3(0, C.sparkSpeed, 0), velJitter: C.sparkJitter,
        life: C.sparkLife, size: C.sparkSize, sizeEnd: C.sparkSizeEnd, color: rgb(K.color.arcaneCore), colorEnd: rgb(K.color.tealBody),
        gravity: C.sparkGravity, count: C.sparks,
      });
    }
    this.kit.stage.addShake(C.shake);
    this.kit.stage.aberrate(C.aberrate);
  }
}

// ---------------- Acerto crítico ----------------

/** Acerto crítico de um arcano: anel magenta maior, flash e faíscas no alvo (só apresentação). */
export class ArcaneCritFx extends SorcererFx {
  constructor(ctx: CombatVisualCtx, at: THREE.Vector3) {
    const X = K.crit;
    super(ctx, X.life);
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(at), size: X.ringStart, sizeEnd: X.ringSize, color: rgb(K.color.arcaneCore, X.ringGain * VFX.flash),
      life: X.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: X.ringFade,
    });
    const hit = at.clone().setY(X.hitLift);
    this.flash(hit, rgb(K.color.arcaneCore), X.flashSize, X.flashLife);
    this.kit.particles.spark.emit({
      pos: hit, posJitter: X.sparkSpread, vel: new THREE.Vector3(0, X.sparkSpeed, 0), velJitter: X.sparkJitter, life: X.sparkLife,
      size: X.sparkSize, sizeEnd: X.sparkSizeEnd, color: rgb(K.color.arcaneCore), colorEnd: rgb(K.color.arcaneBody), gravity: X.sparkGravity, count: X.sparks,
    });
    this.kit.stage.addShake(X.shake);
  }
}
