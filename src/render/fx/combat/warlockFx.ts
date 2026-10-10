import * as THREE from 'three';
import { WARLOCK_FX as K } from '../../../config/fx/warlock';
import { Flash, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, fxSprite } from '../kit/Shapes';
import type { CombatVisualCtx } from './CombatVisualCtx';

/**
 * Efeitos de combate da Bruxa. Identidade: sombra violeta-preta (fumaça, runas escuras e estouros, com mistura
 * normal), ichor verde-doentio em núcleos pequenos e almas pálidas. Cada habilidade segue antecipação → trajeto →
 * impacto → dissipação, e tudo vive no mundo: sprites de frente para a câmera, runas e anéis no chão e fitas de
 * ligação. Só apresentação: os números estão em config/fx/warlock.ts.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const smooth = (k: number): number => k * k * (3 - 2 * k);
/** Cor do config, multiplicada por `k` (valores acima de 1 são brilho HDR). */
const rgb = (c: readonly number[], k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
/** Mesmo ponto, na altura das marcas do chão. */
const onGround = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x, K.groundLift, p.z);

const SHADE = rgb(K.color.shade);
const SHADE_DEEP = rgb(K.color.shadeDeep);
const SMOKE_MID = rgb(K.color.smokeMid);
const BURST = rgb(K.color.burst);
const SIGIL = rgb(K.color.sigil);
const SIGIL_GLOW = rgb(K.color.sigilGlow);
const ICHOR = rgb(K.color.ichor);
const ICHOR_DEEP = rgb(K.color.ichorDeep);
const RIM = rgb(K.color.rim);
const SOUL = rgb(K.color.soul);

// vetores de trabalho: só para uso imediato (nada guarda referência a eles)
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpVel = new THREE.Vector3();
const segDir = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();

/** Eixos da câmera (direita e cima do mundo), para medir segmentos no plano da tela. */
function readCamera(cam: THREE.Camera): void {
  cam.updateMatrixWorld();
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  camUp.setFromMatrixColumn(cam.matrixWorld, 1);
}

/** Sprite alongado de A até B, medido no plano da tela (o sprite é sempre de frente para a câmera). Chame readCamera antes. */
function placeSegment(s: THREE.Sprite, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  segDir.subVectors(b, a);
  const sx = segDir.dot(camRight);
  const sy = segDir.dot(camUp);
  s.position.addVectors(a, b).multiplyScalar(0.5);
  s.scale.set(width, Math.max(K.minLength, Math.hypot(sx, sy)), 1);
  // a textura "trace" é vertical: gira o eixo longo para a direção do segmento na tela
  s.material.rotation = Math.atan2(sy, sx) - Math.PI / 2;
}

/**
 * Dreno de Vida: a mão junta a sombra (antecipação); a bola de fumaça escura, com um halo e um núcleo de ichor,
 * voa em arco deixando rastro; no acerto estoura e solta respingos; depois uma alma pálida volta ao peito do
 * conjurador e some ali.
 */
export class LifeDrainFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly flight: number;
  private readonly halo: THREE.Sprite;
  private readonly head: THREE.Sprite;
  private readonly core: THREE.Sprite;
  private readonly soul: THREE.Sprite;
  private readonly p = new THREE.Vector3();
  private landed = false;
  private landT = 0;
  private absorbed = false;
  private burst?: THREE.Sprite;

  /**
   * `delay`: tempo até o acerto (o mesmo que o GameView usa para adiar a reação do alvo).
   * `back`: peito do conjurador, para onde a alma volta.
   */
  constructor(
    private readonly kit: FxKit,
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly back: THREE.Vector3,
    delay: number,
  ) {
    const B = K.drain;
    this.flight = Math.max(B.minFlight, delay - B.windUp);
    // halo ichor atrás da sombra (fica abaixo dela), a própria sombra e o núcleo aditivo por cima
    this.halo = fxSprite(this.group, 'glow', ICHOR_DEEP, B.haloSize * B.headStart, { opacity: B.haloAlpha, renderOrder: 7 });
    this.head = fxSprite(this.group, 'noise', SHADE, B.headSize * B.headStart, { dark: true });
    this.core = fxSprite(this.group, 'soul', ICHOR, B.coreSize * B.headStart);
    this.soul = fxSprite(this.group, 'soul', SOUL, B.soulSize, { opacity: 0 });
    this.halo.position.copy(from);
    this.head.position.copy(from);
    this.core.position.copy(from);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const B = K.drain;
    const t = this.t;
    if (t < B.windUp) {
      // antecipação: a sombra cresce na mão e a fumaça se fecha sobre ela
      const k = t / B.windUp;
      this.setGrow(B.headStart + (1 - B.headStart) * easeOut(k));
      this.head.material.rotation += dt * B.headSpin;
      this.kit.particles.smoke.emit({ pos: this.from, posJitter: B.gatherJitter, life: B.gatherLife, size: B.gatherSize, sizeEnd: B.gatherSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: B.gatherAlpha, count: B.gatherRate * dt });
      return;
    }
    if (!this.landed) {
      // voo: arco da mão até o alvo, com rastro de fumaça escura e fiapos de ichor
      const k = clamp01((t - B.windUp) / this.flight);
      this.p.lerpVectors(this.from, this.to, k);
      this.p.y += Math.sin(k * Math.PI) * B.arc;
      this.halo.position.copy(this.p);
      this.head.position.copy(this.p);
      this.core.position.copy(this.p);
      this.setGrow(1);
      this.head.material.rotation += dt * B.headSpin;
      this.core.material.rotation -= dt * B.coreSpin;
      this.kit.particles.smoke.emit({ pos: this.p, posJitter: B.trailJitter, life: B.trailLife, size: B.trailSize, sizeEnd: B.trailSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: B.trailAlpha, drag: B.trailDrag, count: B.trailRate * dt });
      this.kit.particles.glow.emit({ pos: this.p, posJitter: B.fleckJitter, velJitter: B.fleckVel, life: B.fleckLife, size: B.fleckSize, sizeEnd: B.fleckSizeEnd, color: ICHOR, colorEnd: ICHOR_DEEP, drag: B.fleckDrag, count: B.fleckRate * dt });
      if (k >= 1) this.land();
      return;
    }
    // depois do acerto: a cabeça apaga, o estouro cresce e some, e a alma sobe do alvo até o peito do conjurador
    const since = t - this.landT;
    const hk = clamp01(since / B.headFade);
    this.head.material.opacity = 1 - hk;
    this.core.material.opacity = 1 - hk;
    this.halo.material.opacity = B.haloAlpha * (1 - hk);
    if (this.burst) {
      const bk = clamp01(since / B.burstLife);
      this.burst.scale.setScalar(B.burstSize + (B.burstSizeEnd - B.burstSize) * easeOut(bk));
      this.burst.material.opacity = 1 - bk;
    }
    const sk = clamp01(since / B.soulTime);
    this.soul.position.lerpVectors(this.to, this.back, smooth(sk));
    this.soul.position.y += Math.sin(sk * Math.PI) * B.soulArc;
    this.soul.material.opacity = Math.min(1, sk * B.soulFadeInSpeed) * (1 - clamp01((sk - B.soulFadeOutFrom) / (1 - B.soulFadeOutFrom)));
    this.soul.material.rotation += dt * B.soulSpin;
    if (sk < 1) this.kit.particles.glow.emit({ pos: this.soul.position, posJitter: B.soulTrailJitter, life: B.soulTrailLife, size: B.soulTrailSize, sizeEnd: B.soulTrailSizeEnd, color: SOUL, colorEnd: ICHOR_DEEP, count: B.soulTrailRate * dt });
    if (sk >= 1 && !this.absorbed) {
      // a alma chega ao peito e some numa fumaça escura discreta (sem brilho: o traje da Bruxa fica como está)
      this.absorbed = true;
      tmpVel.set(0, B.absorbVel, 0);
      this.kit.particles.smoke.emit({ pos: this.back, posJitter: B.absorbJitter, vel: tmpVel, life: B.absorbLife, size: B.absorbSize, sizeEnd: B.absorbSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: B.absorbAlpha, count: B.absorbCount });
    }
    if (since >= B.soulTime + B.doneAfter) this.finish();
  }

  /** Tamanho da cabeça, do halo e do núcleo, na mesma proporção (`g` = 1 é o tamanho cheio). */
  private setGrow(g: number): void {
    const B = K.drain;
    this.head.scale.setScalar(B.headSize * g);
    this.halo.scale.setScalar(B.haloSize * g);
    this.core.scale.setScalar(B.coreSize * g);
  }

  /** Acerto: estouro escuro, fumaça e respingos de ichor, anel escuro no chão. */
  private land(): void {
    const B = K.drain;
    this.landed = true;
    this.landT = this.t;
    this.burst = fxSprite(this.group, 'impact', BURST, B.burstSize, { dark: true });
    this.burst.position.copy(this.to);
    this.kit.particles.smoke.emit({ pos: this.to, posJitter: B.puffJitter, velJitter: B.puffVel, life: B.puffLife, size: B.puffSize, sizeEnd: B.puffSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: B.puffAlpha, drag: B.puffDrag, count: B.puffCount, spin: B.puffSpin });
    this.kit.particles.spark.emit({ pos: this.to, posJitter: B.splashJitter, velJitter: B.splashVel, life: B.splashLife, size: B.splashSize, sizeEnd: B.splashSizeEnd, color: ICHOR, colorEnd: ICHOR_DEEP, gravity: B.splashGravity, drag: B.splashDrag, count: B.splashCount });
    this.kit.decals.spawn({ kind: 'ring', pos: onGround(this.to), size: B.ringSize, sizeEnd: B.ringSizeEnd, color: SHADE_DEEP, life: B.ringLife, fadeIn: K.decalFadeIn, fadeOut: B.ringFadeOut });
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/**
 * Maldição: o fio de sombra liga a mão ao chão; as runas começam maiores e fecham sobre a área em `closeTime`
 * (o trancamento: clarão de ichor, anel escuro, estouro e faíscas); depois ficam acesas, com fumaça subindo e
 * colunas de sombra na borda, e apagam.
 */
export class CurseFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private locked = false;
  private lockT = 0;
  private burst?: THREE.Sprite;
  private readonly flashes: Flash[] = [];
  private readonly area: number;
  private readonly rot: number;
  private readonly ground: THREE.Vector3;
  private readonly groundPt: THREE.Vector3;
  private readonly tendril: THREE.Sprite;
  private readonly strands: { s: THREE.Sprite; a: number; ph: number }[] = [];
  private readonly life = K.curse.closeTime + K.curse.holdTime;

  /** `hand`: mão do conjurador; `center`: centro da área (mundo); `radius`: raio da área em tiles. */
  constructor(
    private readonly kit: FxKit,
    private readonly hand: THREE.Vector3,
    center: THREE.Vector3,
    radius: number,
  ) {
    const C = K.curse;
    this.area = radius * 2 + 1;
    this.rot = Math.random() * Math.PI * 2;
    this.ground = onGround(center);
    this.groundPt = new THREE.Vector3(this.ground.x, C.tendrilY, this.ground.z);
    this.tendril = fxSprite(this.group, 'trace', SHADE, 1, { dark: true, opacity: 0 });
    // runas que fecham: a parte escura e a luminosa começam juntas, com a mesma rotação (sem salto na fase seguinte)
    kit.decals.spawn({ kind: 'runesFire', pos: this.ground, size: this.area * C.openScale, sizeEnd: this.area, color: SIGIL, life: C.closeTime, additive: false, fadeIn: C.openFadeIn, fadeOut: 0, rotation: this.rot });
    kit.decals.spawn({ kind: 'runesFire', pos: this.ground, size: this.area * C.openScale, sizeEnd: this.area, color: SIGIL_GLOW, life: C.closeTime, additive: true, fadeIn: C.openFadeIn, fadeOut: 0, rotation: this.rot });
    for (let i = 0; i < C.strands; i++) {
      const a = (i / C.strands) * Math.PI * 2 + C.strandAngle;
      this.strands.push({ s: fxSprite(this.group, 'trace', SHADE, 1, { dark: true, opacity: 0 }), a, ph: i * C.strandPhase });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const C = K.curse;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    for (const f of this.flashes) f.update(dt);
    // 1. fio de sombra da mão até o chão (antecipação)
    if (t < C.handTime) {
      placeSegment(this.tendril, this.hand, this.groundPt, C.handWidth);
      this.tendril.material.opacity = 1 - t / C.handTime;
    } else this.tendril.material.opacity = 0;
    // 2. trancamento: runas acesas, anel escuro, estouro e faíscas de ichor
    if (!this.locked && t >= C.closeTime) this.lock();
    if (this.burst) {
      const k = clamp01((t - this.lockT) / C.burstLife);
      this.burst.scale.setScalar(this.area * (C.burstSize + (C.burstSizeEnd - C.burstSize) * easeOut(k)));
      this.burst.material.opacity = 1 - k;
    }
    // 3. colunas de sombra na borda: crescem, oscilam e somem
    const gk = easeOut(clamp01(t / C.strandGrow));
    const fade = clamp01((C.strandLife - t) / C.strandFade);
    const R = this.area * C.rimFraction;
    for (const st of this.strands) {
      const h = C.strandHeight * gk * (1 + C.strandWobble * Math.sin(t * C.strandWobbleSpeed + st.ph));
      st.s.position.set(this.ground.x + Math.cos(st.a) * R, h / 2, this.ground.z + Math.sin(st.a) * R);
      st.s.scale.set(C.strandWidth, Math.max(K.minLength, h), 1);
      st.s.material.opacity = C.strandAlpha * fade;
    }
    // 4. fumaça que sobe da área enquanto as runas estão acesas
    if (t < this.life - C.smokeStop) {
      tmpVel.set(0, C.smokeRise, 0);
      this.kit.particles.smoke.emit({ pos: this.ground.clone().setY(C.smokeHeight), posJitter: this.area * C.smokeJitterFrac, vel: tmpVel, velJitter: C.smokeVelJitter, life: C.smokeLife, size: C.smokeSize, sizeEnd: C.smokeSizeEnd, color: SMOKE_MID, colorEnd: SHADE_DEEP, alpha: C.smokeAlpha, drag: C.smokeDrag, count: C.smokeRate * dt });
    }
    if (t >= this.life) this.finish();
  }

  private lock(): void {
    const C = K.curse;
    this.locked = true;
    this.lockT = this.t;
    // runas acesas (escura e luminosa): ficam no chão e apagam no fim
    this.kit.decals.spawn({ kind: 'runesFire', pos: this.ground, size: this.area, color: SIGIL, life: C.holdTime, fadeIn: C.runeFadeIn, fadeOut: C.holdFade, spin: C.spinRate, rotation: this.rot });
    this.kit.decals.spawn({ kind: 'runesFire', pos: this.ground, size: this.area * C.glowSize, color: SIGIL_GLOW, life: C.holdTime, additive: true, fadeIn: C.runeFadeIn, fadeOut: C.holdFade, spin: C.spinRate, rotation: this.rot });
    // borda de luz fraca (aditiva) na mesma área
    this.kit.decals.spawn({ kind: 'ring', pos: this.ground, size: this.area * C.rimSize, color: RIM, life: C.holdTime, additive: true, fadeIn: C.runeFadeIn, fadeOut: C.holdFade });
    // anel escuro que se expande a partir da área
    this.kit.decals.spawn({ kind: 'ring', pos: this.ground, size: this.area * C.shockSize, sizeEnd: this.area * C.shockSizeEnd, color: SHADE_DEEP, life: C.shockLife, fadeIn: C.runeFadeIn, fadeOut: C.shockFadeOut });
    // estouro escuro no centro (sprite que cresce e some) e um pulso fraco de ichor
    this.burst = fxSprite(this.group, 'impact', BURST, this.area * C.burstSize, { dark: true });
    this.burst.position.set(this.ground.x, C.burstHeight, this.ground.z);
    this.flashes.push(new Flash(this.group, this.ground.clone().setY(C.burstHeight), rgb(K.color.ichorDeep, C.flashGain), this.area * C.flashFrac, C.flashLife));
    // faíscas de ichor radiais (aditivas, poucas)
    this.kit.particles.spark.emit({ pos: this.ground.clone().setY(C.sparkHeight), posJitter: C.sparkJitter, velJitter: C.sparkSpeed, life: C.sparkLife, size: C.sparkSize, sizeEnd: C.sparkSizeEnd, color: ICHOR, colorEnd: ICHOR_DEEP, drag: C.sparkDrag, count: C.sparkCount });
    this.kit.stage.addShake(C.lockShake);
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/**
 * Mergulho de um pulso do enxame: uma bola de sombra mais pesada e mais lenta que o dreno sai de uma das sombras
 * em órbita e acerta o alvo; no acerto, estouro escuro e um anel no chão.
 */
class DiveWisp {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private landed = false;
  private landT = 0;
  private readonly head: THREE.Sprite;
  private readonly core: THREE.Sprite;
  private burst?: THREE.Sprite;

  constructor(
    private readonly kit: FxKit,
    parent: THREE.Group,
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
  ) {
    const S = K.swarm;
    parent.add(this.group);
    this.head = fxSprite(this.group, 'noise', SHADE, S.diveSize, { dark: true });
    this.core = fxSprite(this.group, 'soul', ICHOR, S.diveCoreSize);
    this.head.position.copy(from);
    this.core.position.copy(from);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const S = K.swarm;
    if (!this.landed) {
      const k = clamp01(this.t / S.diveFlight);
      const p = tmpA.lerpVectors(this.from, this.to, k);
      p.y += Math.sin(k * Math.PI) * S.diveArc;
      this.head.position.copy(p);
      this.core.position.copy(p);
      this.head.material.rotation += dt * S.diveSpin;
      this.kit.particles.smoke.emit({ pos: p, posJitter: S.diveTrailJitter, life: S.diveTrailLife, size: S.diveTrailSize, sizeEnd: S.diveTrailSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: S.diveTrailAlpha, drag: S.diveTrailDrag, count: S.diveTrailRate * dt });
      if (k >= 1) this.land();
      return;
    }
    const since = this.t - this.landT;
    const k = since / S.diveFadeTime;
    if (k >= 1) {
      this.done = true;
      disposeFxGroup(this.group);
      return;
    }
    this.head.material.opacity = 1 - k;
    this.core.material.opacity = 1 - k;
    if (this.burst) {
      const bk = clamp01(since / S.diveBurstLife);
      this.burst.scale.setScalar(S.diveBurstSize + (S.diveBurstSizeEnd - S.diveBurstSize) * easeOut(bk));
      this.burst.material.opacity = 1 - bk;
    }
  }

  private land(): void {
    const S = K.swarm;
    this.landed = true;
    this.landT = this.t;
    this.burst = fxSprite(this.group, 'impact', BURST, S.diveBurstSize, { dark: true });
    this.burst.position.copy(this.to);
    this.kit.particles.smoke.emit({ pos: this.to, posJitter: S.diveLandJitter, velJitter: S.diveLandVel, life: S.diveLandLife, size: S.diveLandSize, sizeEnd: S.diveLandSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: S.diveLandAlpha, drag: S.diveLandDrag, count: S.divePuffCount, spin: S.diveLandSpin });
    this.kit.decals.spawn({ kind: 'ring', pos: onGround(this.to), size: S.diveRingSize, sizeEnd: S.diveRingSizeEnd, color: SHADE_DEEP, life: S.diveRingLife, fadeIn: K.decalFadeIn, fadeOut: S.diveRingFadeOut });
  }
}

/**
 * Enxame de Sombras: sombras pequenas surgem do chão, sobem e giram em volta do conjurador (muitas partículas em
 * movimento). Cada pulso de dano de um alvo (um por segundo) faz uma bola pesada mergulhar nele e renova a fita de
 * ligação até ele. Sem pulsos por `linger` segundos, a órbita se dissolve (as sombras encolhem para o conjurador).
 */
export class SwarmFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private lastPulse = -1;
  /** instante em que a dissipação começa (-1 = ainda ativo) */
  private endAt = -1;
  private readonly center = new THREE.Vector3();
  private readonly motes: { s: THREE.Sprite; ang: number; ph: number; sp: number }[] = [];
  private readonly wisps: DiveWisp[] = [];
  private readonly tethers: { s: THREE.Sprite; owner: number; until: number }[] = [];

  constructor(
    private readonly ctx: CombatVisualCtx,
    private readonly casterId: number,
    private readonly kit: FxKit,
  ) {
    const S = K.swarm;
    const base = ctx.pos(casterId);
    if (base) this.center.set(base.x, 0, base.z);
    for (let i = 0; i < S.motes; i++) {
      this.motes.push({
        s: fxSprite(this.group, 'noise', SHADE, S.moteSize, { dark: true, opacity: 0 }),
        ang: (i / S.motes) * Math.PI * 2 + Math.random() * S.moteAngleJitter,
        ph: Math.random() * Math.PI * 2,
        sp: S.moteSpeedMin + Math.random() * S.moteSpeedRange,
      });
    }
  }

  /** Pedido para dissipar já (outro enxame da mesma bruxa começou). */
  dissolve(): void {
    if (this.endAt < 0) this.endAt = this.t;
  }

  /** Pulso de dano do enxame num alvo: uma bola pesada mergulha nele e a fita de ligação se renova. */
  pulse(targetId: number): void {
    if (this.done || this.endAt >= 0) return;
    const S = K.swarm;
    const tp = this.ctx.pos(targetId);
    if (!tp) return;
    this.lastPulse = this.t;
    const to = tp.setY(K.body.chest);
    // a sombra mais próxima do alvo é a que mergulha
    let best: (typeof this.motes)[number] | undefined;
    let bestD = Infinity;
    for (const m of this.motes) {
      const d = m.s.position.distanceToSquared(to);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) this.wisps.push(new DiveWisp(this.kit, this.group, best.s.position.clone(), to));
    // fita de ligação até o alvo: reaproveita a dele, ou pega uma livre, ou a mais antiga
    let slot = this.tethers.find((x) => x.owner === targetId);
    if (!slot) {
      if (this.tethers.length < S.tetherSlots) {
        slot = { s: fxSprite(this.group, 'trace', SHADE, 1, { dark: true, opacity: 0 }), owner: targetId, until: 0 };
        this.tethers.push(slot);
      } else {
        slot = this.tethers.reduce((a, b) => (a.until <= b.until ? a : b));
      }
      slot.owner = targetId;
    }
    slot.until = this.t + S.tetherLife;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const S = K.swarm;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    const base = this.ctx.pos(this.casterId);
    if (base) this.center.set(base.x, 0, base.z);
    // fim: sem pulso por `linger` segundos (ou sem primeiro pulso até `firstWait`, ou vida máxima)
    if (this.endAt < 0 && (t >= S.maxLife || (this.lastPulse < 0 ? t >= S.firstWait : t - this.lastPulse >= S.linger))) this.endAt = t;
    const dis = this.endAt >= 0 ? clamp01((t - this.endAt) / S.dissolveTime) : 0;
    const alive = 1 - dis;
    // antecipação: as sombras sobem do chão até a órbita; a dissipação encolhe a órbita até o conjurador
    const k = easeOut(clamp01(t / S.gatherTime));
    const r = (S.gatherRadius + (S.orbitRadius - S.gatherRadius) * k) * (1 - dis);
    const h = S.groundY + (S.orbitHeight - S.groundY) * k;
    for (const m of this.motes) {
      const ang = m.ang + t * S.spin * m.sp;
      const y = h + Math.sin(t * S.bobSpeed + m.ph) * S.orbitBob * k;
      m.s.position.set(this.center.x + Math.cos(ang) * r, y, this.center.z + Math.sin(ang) * r);
      m.s.material.opacity = S.moteAlpha * clamp01(t / S.moteFadeIn) * alive;
      m.s.material.rotation += dt * S.moteSpin;
      // rastro de cada sombra: fagulhas de ichor e fumaça escura
      this.kit.particles.glow.emit({ pos: m.s.position, posJitter: S.flakeJitter, life: S.flakeLife, size: S.flakeSize, sizeEnd: S.flakeSizeEnd, color: ICHOR, colorEnd: ICHOR_DEEP, drag: S.flakeDrag, count: S.flakeRate * dt * alive });
      this.kit.particles.smoke.emit({ pos: m.s.position, posJitter: S.trailJitter, life: S.trailLife, size: S.trailSize, sizeEnd: S.trailSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: S.trailAlpha, drag: S.trailDrag, count: S.trailRate * dt * alive });
    }
    // fitas de ligação: do peito do conjurador ao alvo, enquanto o último pulso ainda vale
    tmpB.set(this.center.x, K.body.chest, this.center.z);
    for (const tt of this.tethers) {
      const left = tt.until - t;
      const tp = left > 0 ? this.ctx.pos(tt.owner) : undefined;
      if (!tp) {
        tt.s.material.opacity = 0;
        continue;
      }
      placeSegment(tt.s, tmpB, tp.setY(K.body.chest), S.tetherWidth);
      tt.s.material.opacity = S.tetherAlpha * clamp01(left / S.tetherLife) * alive;
    }
    // mergulhos em curso
    for (let i = this.wisps.length - 1; i >= 0; i--) {
      this.wisps[i].update(dt);
      if (this.wisps[i].done) this.wisps.splice(i, 1);
    }
    if (dis >= 1 && this.wisps.length === 0) {
      this.done = true;
      disposeFxGroup(this.group);
    }
  }
}

/** Marca de um pulso da maldição no inimigo: o anel escuro se fecha nos pés dele, a fumaça sobe e uma alma pálida escapa. */
export function curseMark(kit: FxKit, feet: THREE.Vector3): void {
  const M = K.curseMark;
  kit.decals.spawn({ kind: 'ring', pos: onGround(feet), size: M.ringSize, sizeEnd: M.ringSizeEnd, color: SHADE_DEEP, life: M.ringLife, fadeIn: K.decalFadeIn, fadeOut: M.ringFadeOut });
  kit.decals.spawn({ kind: 'ring', pos: onGround(feet), size: M.glowRingSize, sizeEnd: M.glowRingSizeEnd, color: SIGIL_GLOW, life: M.glowRingLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: M.glowRingFadeOut });
  tmpVel.set(0, M.smokeRise, 0);
  kit.particles.smoke.emit({ pos: feet.clone().setY(M.smokeHeight), posJitter: M.smokeJitter, vel: tmpVel, velJitter: M.smokeVelJitter, life: M.smokeLife, size: M.smokeSize, sizeEnd: M.smokeSizeEnd, color: SHADE, colorEnd: SHADE_DEEP, alpha: M.smokeAlpha, drag: M.smokeDrag, count: M.smokeCount });
  tmpVel.set(0, M.soulRise, 0);
  kit.particles.glow.emit({ pos: feet.clone().setY(M.soulHeight), posJitter: M.soulJitter, vel: tmpVel, velJitter: M.soulVelJitter, life: M.soulLife, size: M.soulSize, sizeEnd: M.soulSizeEnd, color: SOUL, colorEnd: ICHOR_DEEP, drag: M.soulDrag, count: M.soulCount });
}
