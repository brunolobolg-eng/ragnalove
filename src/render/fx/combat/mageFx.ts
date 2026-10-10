import * as THREE from 'three';
import { MAGE_FX as K } from '../../../config/fx/mage';
import { FlickerLight, Flash, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import type { Ribbon } from '../kit/Ribbons';
import { disposeFxGroup, fxSprite, jaggedPath, Pillar } from '../kit/Shapes';
import { VFX } from '../kit/vfxSettings';
import { fxTexture } from '../kit/vfxTextures';
import type { CombatVisualCtx } from './CombatVisualCtx';

/**
 * Efeitos de combate do Mago (Cléria). Cada habilidade tem forma e movimento próprios e segue
 * antecipação → lançamento/trajeto → impacto → dissipação. Tudo vive no mundo: sprites de frente para a
 * câmera, anéis e runas no chão, fitas, colunas e malhas simples. Só apresentação: os números estão em
 * config/fx/mage.ts.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
/** Cor do config (valores acima de 1 são brilho HDR), multiplicada por `k`. */
const rgb = (c: readonly number[], k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
/** Mesmo ponto, na altura da decalque do chão. */
const onGround = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x, K.groundLift, p.z);

// vetores de trabalho: só para uso imediato (nada guarda referência a eles)
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const lineDir = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camUp = new THREE.Vector3();

/** Eixos da câmera (direita e cima do mundo), para medir segmentos no plano da tela. */
function readCamera(cam: THREE.Camera): void {
  cam.updateMatrixWorld();
  camRight.setFromMatrixColumn(cam.matrixWorld, 0);
  camUp.setFromMatrixColumn(cam.matrixWorld, 1);
}

/** Sprite alongado de A até B, medido no plano da tela (o sprite é sempre de frente para a câmera). `stretch` alonga o trecho. */
function placeLine(s: THREE.Sprite, a: THREE.Vector3, b: THREE.Vector3, width: number, stretch = 1): void {
  lineDir.subVectors(b, a);
  const sx = lineDir.dot(camRight);
  const sy = lineDir.dot(camUp);
  s.position.addVectors(a, b).multiplyScalar(0.5);
  s.scale.set(width, Math.max(K.minLength, Math.hypot(sx, sy)) * stretch, 1);
  // a textura "trace" é vertical: gira o eixo longo para a direção do segmento na tela
  s.material.rotation = Math.atan2(sy, sx) - Math.PI / 2;
}

/** Direção aleatória uniforme sobre a esfera. */
function randomDir(out: THREE.Vector3): THREE.Vector3 {
  const a = Math.random() * Math.PI * 2;
  const y = Math.random() * 2 - 1;
  const r = Math.sqrt(1 - y * y);
  return out.set(Math.cos(a) * r, y, Math.sin(a) * r);
}

/** Material aditivo de feixe (textura trace), um por grupo de segmentos. */
function beamMaterial(color: THREE.Color): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map: fxTexture('trace'), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 });
}

// geometrias compartilhadas por todos os efeitos (nunca dispor)
let domeGeo: THREE.SphereGeometry | undefined;
const sharedDome = (): THREE.SphereGeometry => (domeGeo ??= new THREE.SphereGeometry(1, K.dome.segments, K.dome.rings));
let spikeGeo: THREE.ConeGeometry | undefined;
/** Ponta de gelo: cone com a base em y = 0 (a escala no eixo y faz ela brotar do chão). */
const sharedSpike = (): THREE.ConeGeometry => (spikeGeo ??= new THREE.ConeGeometry(K.frostNova.spikeWidth, 1, K.frostNova.spikeSides, 1).translate(0, 0.5, 0));

// sombreador da cúpula do Escudo: borda (fresnel) brilhante, miolo quase transparente, faixas de energia
const DOME_VERT = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main() {
    vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const DOME_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha; uniform float uFlash; uniform float uTime;
  uniform float uRimPow; uniform float uRimGain; uniform float uBandFreq; uniform float uBandSpeed;
  uniform float uBaseAlpha; uniform float uRimAlpha; uniform float uBandAlpha; uniform float uCoreGain; uniform float uFlashGain;
  varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uRimPow);
    float band = 0.5 + 0.5 * sin(vP.y * uBandFreq - uTime * uBandSpeed);
    float a = (uBaseAlpha + f * (uRimAlpha + uBandAlpha * band)) * uAlpha;
    vec3 col = uColor * (uCoreGain + f * uRimGain) + vec3(uFlash * uFlashGain);
    gl_FragColor = vec4(col, a);
  }
`;

/**
 * Base dos efeitos do Mago: linha do tempo própria (cortes em segundos), flashes, luzes e fitas do pool.
 * Ao terminar, devolve luzes e fitas e libera os materiais do grupo; a geometria compartilhada fica.
 */
abstract class MageFx implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  protected readonly tl = new Timeline();
  protected readonly kit: FxKit;
  private readonly flashes: Flash[] = [];
  private readonly lamps: FlickerLight[] = [];
  private readonly ribbons: Ribbon[] = [];

  constructor(protected readonly ctx: CombatVisualCtx, protected readonly life: number) {
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

  /** Luz do pool do Stage: no máximo uma por efeito, só nas habilidades grandes. */
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

// ---------------- Raio Gélido (ataque básico) ----------------

/** Orbe de gelo que sai da ponta do cajado; fita e cristais no rastro; estrela e estilhaços no acerto. */
export class FrostOrbFx extends MageFx {
  private readonly orb: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly rib: Ribbon | undefined;
  private readonly p = new THREE.Vector3();
  private readonly cCore = rgb(K.color.iceCore);
  private readonly cMid = rgb(K.color.iceMid);
  private readonly cDeep = rgb(K.color.iceDeep);
  private arrived = false;
  private star?: THREE.Sprite;
  private starT0 = 0;

  constructor(ctx: CombatVisualCtx, private readonly from: THREE.Vector3, private readonly to: THREE.Vector3, private readonly flight: number) {
    super(ctx, flight + K.bolt.linger + K.bolt.starLife);
    const B = K.bolt;
    this.halo = fxSprite(this.group, 'halo', this.cMid, B.halo, { opacity: B.haloAlpha });
    this.orb = fxSprite(this.group, 'orb', this.cCore, B.orb);
    this.orb.position.copy(from);
    this.halo.position.copy(from);
    this.orb.scale.setScalar(B.orb * B.birthFrom);
    this.rib = this.makeRibbon(this.cMid, B.trailWidth, B.trailLife);
  }

  protected frame(dt: number): void {
    const B = K.bolt;
    const t = this.t;
    if (!this.arrived) {
      if (t < B.birth) {
        // nascimento: o orbe cresce na ponta do cajado
        this.orb.scale.setScalar(B.orb * (B.birthFrom + (1 - B.birthFrom) * (t / B.birth)));
        return;
      }
      const k = clamp01((t - B.birth) / (this.flight - B.birth));
      this.p.lerpVectors(this.from, this.to, k);
      this.orb.position.copy(this.p);
      this.halo.position.copy(this.p);
      this.orb.material.rotation += dt * B.spin;
      this.halo.material.rotation -= dt * B.spin * B.haloSpinRatio;
      this.rib?.push(this.p);
      // cristais que se soltam e ficam para trás
      this.kit.particles.spark.emit({
        pos: this.p, posJitter: B.flakePosJitter, vel: tmpA.set(0, B.flakeVelY, 0), velJitter: B.flakeVelJitter,
        life: B.flakeLife, size: B.flakeSize, sizeEnd: B.flakeSizeEnd, color: this.cCore, colorEnd: this.cDeep,
        gravity: B.flakeGravity, drag: B.flakeDrag, count: B.flakes,
      });
      if (k >= 1) this.impact();
      return;
    }
    // depois do acerto: o orbe apaga e a estrela de gelo cresce e some
    const f = clamp01((t - this.flight) / B.linger);
    this.orb.material.opacity = 1 - f;
    this.halo.material.opacity = B.haloAlpha * (1 - f);
    if (this.star) {
      const k = clamp01((t - this.starT0) / B.starLife);
      this.star.scale.setScalar(B.starSize * (B.starGrow0 + B.starGrow1 * easeOut(k)));
      this.star.material.opacity = (1 - k) * (1 - k);
    }
  }

  /** Acerto: é o instante em que o GameView reage o alvo (impactDelay). */
  private impact(): void {
    const B = K.bolt;
    this.arrived = true;
    this.rib?.stop();
    const at = this.to;
    this.star = fxSprite(this.group, 'halo', this.cCore, B.starSize * B.starGrow0, { rot: Math.random() * Math.PI });
    this.star.position.copy(at);
    this.starT0 = this.t;
    // estilhaços radiais
    this.kit.particles.spark.emit({
      pos: at, posJitter: B.flakePosJitter, vel: tmpA.set(0, B.shardVelY, 0), velJitter: B.shardSpeed,
      life: B.shardLife, size: B.shardSize, sizeEnd: B.shardSizeEnd, color: this.cCore, colorEnd: this.cDeep,
      drag: B.shardDrag, count: B.shards,
    });
    // anel pequeno no chão e flash discreto
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(at), size: B.ringStart, sizeEnd: B.ringSize, color: rgb(K.color.iceMid, B.ringGain * VFX.flash),
      life: B.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.ringFadeOut,
    });
    this.flash(at, this.cCore, B.flashSize, B.flashLife);
    this.kit.stage.addShake(B.shake);
  }
}

// ---------------- Cura Divina ----------------

/** Fita de luz do cajado ao aliado, coluna de luz nascendo dos pés dele e partículas que sobem do corpo. */
export class DivineHealFx extends MageFx {
  private readonly cHoly = rgb(K.color.holyCore);
  private readonly cEnd = rgb(K.color.holyEnd);
  private readonly chest: THREE.Vector3;
  private readonly rib: Ribbon | undefined;

  constructor(ctx: CombatVisualCtx, private readonly from: THREE.Vector3, private readonly feet: THREE.Vector3) {
    super(ctx, K.heal.life);
    const B = K.heal;
    this.chest = feet.clone().setY(K.body.chest);
    this.rib = this.makeRibbon(rgb(K.color.holyCore, B.tetherGain), B.tetherWidth, B.tetherLife);
    this.tl.at(B.tetherTime, () => this.rib?.stop());
    this.tl.at(B.columnAt, () => this.column());
  }

  protected frame(_dt: number): void {
    const B = K.heal;
    const t = this.t;
    // fita: do cajado ao peito do aliado, estendendo-se
    if (this.rib && t < B.tetherTime) {
      tmpA.lerpVectors(this.from, this.chest, easeOut(clamp01(t / B.tetherTime)));
      this.rib.push(tmpA);
    }
    // partículas que sobem do corpo do aliado enquanto a coluna dura
    if (t >= B.columnAt && t < B.columnAt + B.moteTime) {
      this.kit.particles.glow.emit({
        pos: this.chest, posJitter: B.moteSpread, vel: tmpB.set(0, B.moteRise, 0), velJitter: B.moteRiseJitter,
        life: B.moteLife, size: B.moteSize, sizeEnd: B.moteSizeEnd, color: this.cHoly, colorEnd: this.cEnd, count: B.moteRate,
      });
    }
  }

  private column(): void {
    const B = K.heal;
    // colunas dourada (externa) e branca (núcleo), nascendo dos pés do aliado: efeitos próprios do contexto
    this.ctx.add(new Pillar(this.feet, rgb(K.color.holyGold, B.outerGain), B.outerHeight, B.outerWidth, B.outerLife));
    this.ctx.add(new Pillar(this.feet, rgb(K.color.holyCore, B.coreGain), B.coreHeight, B.coreWidth, B.coreLife));
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(this.feet), size: B.ringStart, sizeEnd: B.ringSize,
      color: rgb(K.color.holyGold, VFX.flash), life: B.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
    this.flash(this.chest, this.cHoly, B.flashSize, B.flashLife);
  }
}

// ---------------- Escudo Sagrado ----------------

/** Partículas convergem ao peito, anel no chão, cúpula de luz que cresce, estoura e apaga. */
export class HolyShieldFx extends MageFx {
  private readonly chest: THREE.Vector3;
  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly uni: THREE.ShaderMaterial['uniforms'];
  private readonly cShield = rgb(K.color.shield);
  private readonly cShieldDeep = rgb(K.color.shieldDeep);
  private readonly cCore = rgb(K.color.holyCore);

  constructor(ctx: CombatVisualCtx, feet: THREE.Vector3) {
    super(ctx, K.holyShield.life);
    const B = K.holyShield;
    this.chest = feet.clone().setY(K.body.chest);
    const D = K.dome;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: rgb(K.color.domeTint) },
        uAlpha: { value: 0 },
        uFlash: { value: 0 },
        uTime: { value: 0 },
        uRimPow: { value: D.rimPow },
        uRimGain: { value: D.rimGain },
        uBandFreq: { value: D.bandFreq },
        uBandSpeed: { value: D.bandSpeed },
        uBaseAlpha: { value: D.baseAlpha },
        uRimAlpha: { value: D.rimAlpha },
        uBandAlpha: { value: D.bandAlpha },
        uCoreGain: { value: D.coreGain },
        uFlashGain: { value: D.flashGain },
      },
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.uni = mat.uniforms;
    this.dome = new THREE.Mesh(sharedDome(), mat);
    this.dome.position.copy(this.chest);
    this.dome.scale.setScalar(B.domeRadius * B.domeMin);
    this.dome.renderOrder = K.renderOrder.additive;
    this.group.add(this.dome);
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(feet), size: B.ringStart, sizeEnd: B.ringSize,
      color: rgb(K.color.shield, VFX.flash), life: B.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
    this.tl.at(B.popAt, () => this.pop());
  }

  protected frame(_dt: number): void {
    const B = K.holyShield;
    const t = this.t;
    // convergência: partículas de todos os lados vêm para o peito
    if (t < B.gatherTime) {
      for (let i = 0; i < B.gatherRate; i++) {
        randomDir(tmpA).multiplyScalar(B.gatherRadius).add(this.chest);
        tmpB.subVectors(this.chest, tmpA).multiplyScalar(1 / B.gatherTime);
        this.kit.particles.glow.emit({ pos: tmpA, vel: tmpB, life: B.gatherTime, size: B.gatherSize, sizeEnd: B.gatherSizeEnd, color: this.cShield, colorEnd: this.cCore, count: 1 });
      }
    }
    // cúpula: cresce a partir do peito; o brilho aparece aos poucos e apaga no fim
    const grow = easeOut(clamp01((t - B.domeAt) / B.domeGrow));
    this.dome.scale.setScalar(B.domeRadius * (B.domeMin + (1 - B.domeMin) * grow));
    const appear = clamp01((t - B.domeAt) / B.domeFadeIn);
    const vanish = 1 - clamp01((t - B.fadeAt) / B.fadeTime);
    this.uni.uAlpha.value = B.domeAlpha * appear * vanish;
    this.uni.uFlash.value = t >= B.popAt ? clamp01(1 - (t - B.popAt) / B.flashTime) : 0;
    this.uni.uTime.value = t;
  }

  /** Estouro: o escudo "pega" e solta faíscas e um anel pequeno. */
  private pop(): void {
    const B = K.holyShield;
    this.flash(this.chest, this.cShield, B.popFlashSize, B.popFlashLife);
    this.kit.particles.spark.emit({
      pos: this.chest, posJitter: B.popJitter, vel: tmpA.set(0, B.popRiseY, 0), velJitter: B.popSpeed,
      life: B.popSparkLife, size: B.popSparkSize, sizeEnd: B.popSparkSizeEnd, color: this.cCore, colorEnd: this.cShieldDeep,
      drag: B.popDrag, count: B.popSparks,
    });
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(this.chest), size: B.popRingStart, sizeEnd: B.popRingSize,
      color: rgb(K.color.shield, B.popRingGain * VFX.flash), life: B.popRingLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
  }
}

// ---------------- Santuário ----------------

/** Coluna que marca o centro, anel que desenha a área, runas no chão pelo tempo do santuário e pulsos. */
export class SanctuaryFx extends MageFx {
  private readonly center: THREE.Vector3;
  private readonly side: number;
  private readonly cHoly = rgb(K.color.holyCore);
  private readonly cEnd = rgb(K.color.holyEnd);
  private moteAcc = 0;
  private pulseAcc = 0;

  constructor(ctx: CombatVisualCtx, center: THREE.Vector3, radius: number, private readonly seconds: number) {
    super(ctx, seconds + K.sanctuary.tail);
    const B = K.sanctuary;
    this.center = onGround(center);
    // área quadrada de (2R+1) tiles, como o Santuário da simulação
    this.side = 2 * radius + 1;
    ctx.add(new Pillar(center, rgb(K.color.holyCore, B.columnGain), B.columnHeight, B.columnWidth, B.columnLife));
    this.kit.decals.spawn({
      kind: 'ring', pos: this.center.clone(), size: B.drawStart, sizeEnd: this.side * B.drawScale,
      color: rgb(K.color.holyGold, B.drawGain * VFX.flash), life: B.drawLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
    this.tl.at(B.runeAt, () => this.runes());
  }

  /** Runas e halo de chão: ficam pelo tempo do santuário (ticks / 10). */
  private runes(): void {
    const B = K.sanctuary;
    const fo = B.runeFadeOut / this.seconds;
    this.kit.decals.spawn({
      kind: 'runesFrost', pos: this.center.clone(), size: this.side * B.runeScale, color: rgb(K.color.holyGold, VFX.flash),
      life: this.seconds, additive: true, fadeIn: B.runeFadeIn, fadeOut: fo, spin: B.runeSpin,
    });
    this.kit.decals.spawn({
      kind: 'glow', pos: this.center.clone(), size: this.side * B.glowScale, color: rgb(K.color.holyEnd, B.glowGain * VFX.flash),
      life: this.seconds, additive: true, fadeIn: B.runeFadeIn, fadeOut: fo,
    });
  }

  protected frame(dt: number): void {
    const B = K.sanctuary;
    const t = this.t;
    if (t < B.runeAt || t >= this.seconds) return;
    // partículas que sobem de dentro da área
    this.moteAcc += dt;
    while (this.moteAcc >= B.moteEvery) {
      this.moteAcc -= B.moteEvery;
      tmpA.set(this.center.x + (Math.random() - 0.5) * this.side * B.moteSpread, K.groundLift, this.center.z + (Math.random() - 0.5) * this.side * B.moteSpread);
      this.kit.particles.glow.emit({
        pos: tmpA, vel: tmpB.set(0, B.moteRise, 0), velJitter: B.moteJitter, life: B.moteLife,
        size: B.moteSize, sizeEnd: B.moteSizeEnd, color: this.cHoly, colorEnd: this.cEnd, count: B.moteCount,
      });
    }
    // pulso: anel que se abre a intervalos
    this.pulseAcc += dt;
    if (this.pulseAcc >= B.pulseEvery) {
      this.pulseAcc -= B.pulseEvery;
      this.kit.decals.spawn({
        kind: 'ring', pos: this.center.clone(), size: this.side * B.pulseStart, sizeEnd: this.side * B.pulseEnd,
        color: rgb(K.color.holyGold, B.pulseGain * VFX.flash), life: B.pulseLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
      });
    }
  }
}

// ---------------- Bênção ----------------

interface Burst {
  s: THREE.Sprite;
  t0: number;
  life: number;
  a0: number;
  a1: number;
  spin: number;
  alpha: number;
}

/** Anel dourado no conjurador que alcança o aliado mais longe; em cada aliado, estrela, giro e graça caindo; depois aura. */
export class BlessingFx extends MageFx {
  private readonly bursts: Burst[] = [];
  private readonly feet: THREE.Vector3[];
  private readonly cHoly = rgb(K.color.holyCore);
  private readonly cEnd = rgb(K.color.holyEnd);
  private auraAcc = 0;

  constructor(ctx: CombatVisualCtx, caster: THREE.Vector3, targets: THREE.Vector3[]) {
    super(ctx, K.blessing.life);
    const B = K.blessing;
    this.feet = targets.map((f) => f.clone());
    let reach = 0;
    for (const f of this.feet) reach = Math.max(reach, Math.hypot(f.x - caster.x, f.z - caster.z));
    const size = 2 * Math.max(B.minReach, reach + B.reachPad);
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(caster), size: B.casterRingStart, sizeEnd: size,
      color: rgb(K.color.holyGold, B.ringGain * VFX.flash), life: B.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
    for (const f of this.feet) this.tl.at(B.burstAt, () => this.burst(f));
  }

  /** Um aliado: estrela e giro no peito, anel no chão, flash pequeno e graça caindo do alto. */
  private burst(f: THREE.Vector3): void {
    const B = K.blessing;
    const chest = new THREE.Vector3(f.x, K.body.chest, f.z);
    const star = fxSprite(this.group, 'impact', rgb(K.color.holyCore, B.starGain), B.starSize0, { opacity: B.starAlpha, rot: Math.random() * Math.PI });
    star.position.copy(chest);
    this.bursts.push({ s: star, t0: this.t, life: B.starLife, a0: B.starSize0, a1: B.starSize1, spin: B.starSpin, alpha: B.starAlpha });
    const swirl = fxSprite(this.group, 'twirl', rgb(K.color.holyGold, B.swirlGain), B.swirlSize0, { opacity: B.swirlAlpha, rot: Math.random() * Math.PI });
    swirl.position.copy(chest);
    this.bursts.push({ s: swirl, t0: this.t, life: B.swirlLife, a0: B.swirlSize0, a1: B.swirlSize1, spin: B.swirlSpin, alpha: B.swirlAlpha });
    this.kit.decals.spawn({
      kind: 'ring', pos: onGround(f), size: B.ringStart, sizeEnd: B.ringSize,
      color: rgb(K.color.holyGold, VFX.flash), life: B.groundRingLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
    });
    this.flash(chest, this.cHoly, B.flashSize, B.flashLife);
    this.kit.particles.glow.emit({
      pos: new THREE.Vector3(f.x, K.body.head + B.graceHeight, f.z), posJitter: B.gracePosJitter, vel: tmpA.set(0, B.graceVelY, 0),
      velJitter: B.graceVelJitter, life: B.graceLife, size: B.graceSize, sizeEnd: B.graceSizeEnd, color: this.cHoly, colorEnd: this.cEnd,
      gravity: B.graceFall, count: B.graceCount,
    });
  }

  protected frame(dt: number): void {
    const B = K.blessing;
    const t = this.t;
    for (const b of this.bursts) {
      const k = clamp01((t - b.t0) / b.life);
      b.s.scale.setScalar(b.a0 + (b.a1 - b.a0) * easeOut(k));
      b.s.material.opacity = b.alpha * (1 - k) * (1 - k);
      b.s.material.rotation += dt * b.spin;
    }
    // aura: partículas que sobem dos aliados enquanto a bênção está no começo
    if (t >= B.auraAt && t < B.auraAt + B.auraTime) {
      this.auraAcc += dt;
      while (this.auraAcc >= B.auraEvery) {
        this.auraAcc -= B.auraEvery;
        for (const f of this.feet) {
          tmpA.set(f.x + (Math.random() - 0.5) * B.auraSpread, K.groundLift, f.z + (Math.random() - 0.5) * B.auraSpread);
          this.kit.particles.glow.emit({
            pos: tmpA, vel: tmpB.set(0, B.auraRise, 0), life: B.auraLife, size: B.auraSize, sizeEnd: B.auraSizeEnd,
            color: this.cHoly, colorEnd: this.cEnd, count: 1,
          });
        }
      }
    }
  }
}

// ---------------- Julgamento Divino ----------------

interface Column {
  outer: THREE.Sprite;
  core: THREE.Sprite;
  g: THREE.Vector3;
}

/**
 * Colunas de luz que caem do céu sobre cada tile da cruz (aviso no chão antes), acertam juntas no
 * instante do golpe e ficam de pé por um instante. Pesado: queda acelerada, anéis, poeira e pausa.
 */
export class JudgmentFx extends MageFx {
  private readonly strikes: THREE.Vector3[];
  private readonly center: THREE.Vector3;
  private readonly columns: Column[] = [];
  private readonly pops: { s: THREE.Sprite; t0: number }[] = [];
  private readonly lamp: FlickerLight;
  private moteAcc = 0;

  constructor(ctx: CombatVisualCtx, grounds: THREE.Vector3[]) {
    super(ctx, K.judgment.life);
    const B = K.judgment;
    this.strikes = grounds.map((g) => onGround(g));
    this.center = new THREE.Vector3();
    for (const g of this.strikes) this.center.add(g);
    this.center.multiplyScalar(1 / Math.max(1, this.strikes.length));
    this.center.y = K.groundLift;
    for (const g of this.strikes) {
      // aviso: anel escuro (contraste) e anel dourado que se fecham até o ponto do acerto
      this.kit.decals.spawn({
        kind: 'ring', pos: g.clone(), size: B.sigilDarkStart, sizeEnd: B.sigilSize1, color: rgb(K.color.darkRing),
        life: B.sigilLife, additive: false, fadeIn: K.decal.ringFadeIn, fadeOut: B.sigilDarkFade,
      });
      this.kit.decals.spawn({
        kind: 'ring', pos: g.clone(), size: B.sigilStart, sizeEnd: B.sigilSize1, color: rgb(K.color.judgeGold, VFX.flash),
        life: B.sigilLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.sigilFade,
      });
      // colunas: dourada por fora, branca no núcleo (sprites esticados entre dois pontos a cada quadro)
      this.columns.push({
        outer: fxSprite(this.group, 'trace', rgb(K.color.judgeGold, B.outerGain), 1, { opacity: 0 }),
        core: fxSprite(this.group, 'trace', rgb(K.color.judgeCore, B.coreGain), 1, { opacity: 0 }),
        g,
      });
    }
    this.kit.decals.spawn({
      kind: 'runesFrost', pos: this.center.clone(), size: B.runeSize, color: rgb(K.color.judgeGold, VFX.flash),
      life: B.runeLife, additive: true, fadeIn: B.runeFadeIn, fadeOut: B.runeFadeOut, spin: B.runeSpin,
    });
    this.lamp = this.makeLight(K.color.lightHoly, B.light.intensity, B.light.distance, B.light.flicker);
    this.lamp.set(new THREE.Vector3(this.center.x, B.light.height, this.center.z));
    this.tl.at(B.impactAt, () => this.impact());
  }

  protected frame(dt: number): void {
    const B = K.judgment;
    const t = this.t;
    // queda: a coluna desce acelerando até o chão (sensação de peso)
    const k = clamp01((t - B.fallStart) / (B.impactAt - B.fallStart));
    const drop = t < B.impactAt ? B.fallHeight * (1 - k * k) : 0;
    const a = t < B.impactAt ? clamp01(t / B.beamFadeIn) : clamp01(1 - (t - B.impactAt) / B.beamAfter);
    readCamera(this.kit.stage.camera);
    for (const col of this.columns) {
      tmpA.set(col.g.x, drop, col.g.z);
      tmpB.set(col.g.x, drop + B.beamLength, col.g.z);
      placeLine(col.outer, tmpA, tmpB, B.outerWidth);
      placeLine(col.core, tmpA, tmpB, B.coreWidth);
      col.outer.material.opacity = B.outerAlpha * a;
      col.core.material.opacity = a;
    }
    // estrelas que crescem e somem no impacto
    for (const p of this.pops) {
      const kp = clamp01((t - p.t0) / B.starLife);
      p.s.scale.setScalar(B.starSize * (B.starGrow0 + B.starGrow1 * easeOut(kp)));
      p.s.material.opacity = (1 - kp) * (1 - kp);
      p.s.material.rotation += dt * B.starSpin;
    }
    // partículas que sobem depois do acerto
    if (t >= B.impactAt && t < B.impactAt + B.moteTime) {
      this.moteAcc += dt;
      while (this.moteAcc >= B.moteEvery) {
        this.moteAcc -= B.moteEvery;
        this.mote();
      }
    }
    this.lamp.update(dt, t < B.impactAt ? 0 : clamp01(1 - (t - B.impactAt) / B.light.time));
  }

  private mote(): void {
    const B = K.judgment;
    const g = this.strikes.length > 0 ? this.strikes[Math.floor(Math.random() * this.strikes.length)] : this.center;
    tmpA.set(g.x + (Math.random() - 0.5) * B.moteSpread, K.groundLift, g.z + (Math.random() - 0.5) * B.moteSpread);
    this.kit.particles.glow.emit({
      pos: tmpA, vel: tmpB.set(0, B.moteRise, 0), velJitter: B.moteJitter, life: B.moteLife,
      size: B.moteSize, sizeEnd: B.moteSizeEnd, color: rgb(K.color.judgeCore), colorEnd: rgb(K.color.judgeGold), count: 1,
    });
  }

  /** Acerto (o mesmo instante em que os inimigos da cruz reagem): flashes, anéis, faíscas, poeira e pausa. */
  private impact(): void {
    const B = K.judgment;
    for (const g of this.strikes) {
      this.flash(new THREE.Vector3(g.x, B.strikeLift, g.z), rgb(K.color.judgeCore), B.flashSize, B.flashLife);
      this.kit.decals.spawn({
        kind: 'ring', pos: g.clone(), size: B.ringStart, sizeEnd: B.ringSize, color: rgb(K.color.judgeGold, VFX.flash),
        life: B.ringLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.ringFadeOut,
      });
      this.kit.particles.spark.emit({
        pos: new THREE.Vector3(g.x, B.sparkLift, g.z), vel: tmpA.set(0, B.sparkSpeed, 0), velJitter: B.sparkJitter,
        life: B.sparkLife, size: B.sparkSize, sizeEnd: B.sparkSizeEnd, color: rgb(K.color.judgeCore), colorEnd: rgb(K.color.judgeGold),
        gravity: B.sparkGravity, drag: B.sparkDrag, count: B.sparks,
      });
      this.kit.particles.smoke.emit({
        pos: new THREE.Vector3(g.x, B.dustLift, g.z), posJitter: B.dustPosJitter, vel: tmpB.set(0, B.dustRise, 0), velJitter: B.dustJitter,
        life: B.dustLife, size: B.dustSize, sizeEnd: B.dustSizeEnd, color: rgb(K.color.dust), alpha: B.dustAlpha, count: B.dust, spin: B.dustSpin,
      });
    }
    // centro da cruz: flash maior, anel de choque e estrela
    const c0 = this.center;
    this.flash(new THREE.Vector3(c0.x, B.strikeLift, c0.z), rgb(K.color.judgeCore), B.centerFlashSize, B.centerFlashLife);
    this.kit.decals.spawn({
      kind: 'ring', pos: c0.clone(), size: B.centerRingStart, sizeEnd: B.centerRingSize, color: rgb(K.color.judgeGold, B.centerRingGain * VFX.flash),
      life: B.centerRingLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.centerRingFade,
    });
    const star = fxSprite(this.group, 'impact', rgb(K.color.judgeCore, B.starGain), B.starSize, { rot: Math.random() * Math.PI });
    star.position.set(c0.x, B.starHeight, c0.z);
    this.pops.push({ s: star, t0: this.t });
    this.kit.stage.addShake(B.shake);
    this.kit.stage.kick(B.kick);
    this.kit.stage.aberrate(B.aberrate);
    this.kit.hitStop(B.hitStop);
  }
}

// ---------------- Tempestade Elétrica ----------------

interface Bolt {
  top: THREE.Vector3;
  ground: THREE.Vector3;
  core: THREE.Sprite[];
  glow: THREE.Sprite[];
}

/**
 * Raios em zigue-zague do céu até cada tile: o caminho é sorteado de novo algumas vezes (cintilação),
 * depois o impacto com flash, faíscas e marca no chão. Mais leve que o Julgamento: fino, rápido e violeta.
 */
export class ThunderstormFx extends MageFx {
  private readonly bolts: Bolt[] = [];
  /** Todos os segmentos e se são halo (true) ou núcleo: o brilho de cada um é escrito a cada quadro. */
  private readonly segs: { s: THREE.Sprite; glow: boolean }[] = [];
  private readonly clouds: THREE.Sprite[] = [];
  private readonly grounds: THREE.Vector3[];
  private readonly lamp: FlickerLight;
  private rollT = 0;
  private rollBright = 0;

  constructor(ctx: CombatVisualCtx, grounds: THREE.Vector3[]) {
    super(ctx, K.thunderstorm.life);
    const B = K.thunderstorm;
    this.grounds = grounds.map((g) => onGround(g));
    for (const g of this.grounds) {
      const top = new THREE.Vector3(g.x + (Math.random() * 2 - 1) * B.skyJitter, B.skyHeight, g.z + (Math.random() * 2 - 1) * B.skyJitter);
      const core: THREE.Sprite[] = [];
      const glow: THREE.Sprite[] = [];
      for (let j = 0; j < B.segments; j++) {
        const gs = this.beamSprite(rgb(K.color.boltGlow));
        const cs = this.beamSprite(rgb(K.color.boltCore));
        glow.push(gs);
        core.push(cs);
        this.segs.push({ s: gs, glow: true }, { s: cs, glow: false });
      }
      this.bolts.push({ top, ground: g.clone(), core, glow });
      // aviso: brilho na nuvem e anel no chão
      const cloud = fxSprite(this.group, 'glow', rgb(K.color.boltGlow, B.chargeGain), B.chargeSize, { opacity: 0 });
      cloud.position.copy(top);
      this.clouds.push(cloud);
      this.kit.decals.spawn({
        kind: 'ring', pos: g.clone(), size: B.warnRingStart, sizeEnd: B.warnRingSize, color: rgb(K.color.boltGlow, VFX.flash),
        life: B.warnRingLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: K.decal.ringFadeOut,
      });
    }
    for (const f of B.flickers) this.tl.at(f, () => this.roll(1));
    this.tl.at(B.afterFlicker, () => this.roll(B.afterAlpha));
    this.tl.at(B.impactAt, () => this.impact());
    let mx = 0;
    let mz = 0;
    for (const g of this.grounds) {
      mx += g.x;
      mz += g.z;
    }
    const n = Math.max(1, this.grounds.length);
    this.lamp = this.makeLight(K.color.lightBolt, B.light.intensity, B.light.distance, B.light.flicker);
    this.lamp.set(new THREE.Vector3(mx / n, B.light.height, mz / n));
  }

  /** Um segmento do raio. Tem material próprio: a rotação do sprite é do material, então não pode ser compartilhada. */
  private beamSprite(color: THREE.Color): THREE.Sprite {
    const s = new THREE.Sprite(beamMaterial(color));
    s.renderOrder = K.renderOrder.additive;
    this.group.add(s);
    return s;
  }

  /** Sorteia de novo o caminho de cada raio (cintilação). `bright` é o brilho do quadro. */
  private roll(bright: number): void {
    const B = K.thunderstorm;
    readCamera(this.kit.stage.camera);
    this.rollT = this.t;
    this.rollBright = bright;
    for (const b of this.bolts) {
      const pts = jaggedPath(b.top, b.ground, B.segments, B.jitter);
      for (let j = 0; j < B.segments; j++) {
        placeLine(b.glow[j], pts[j], pts[j + 1], B.glowWidth, B.segmentStretch);
        placeLine(b.core[j], pts[j], pts[j + 1], B.coreWidth, B.segmentStretch);
      }
    }
  }

  protected frame(dt: number): void {
    const B = K.thunderstorm;
    const t = this.t;
    const fade = 1 - clamp01((t - B.fadeAt) / B.fadeTime);
    const dec = clamp01((t - this.rollT) / B.flickerDecay);
    const bright = this.rollBright * (1 - B.flickerDrop * dec) * fade;
    for (const seg of this.segs) seg.s.material.opacity = seg.glow ? bright * B.glowAlpha : bright;
    const charge = clamp01(t / B.chargeTime) * fade * B.chargeAlpha;
    for (const s of this.clouds) s.material.opacity = charge;
    this.lamp.update(dt, t < B.impactAt ? 0 : clamp01(1 - (t - B.impactAt) / B.light.time));
  }

  /** Impacto: flash, anel, faíscas e marca de queimado em cada tile. */
  private impact(): void {
    const B = K.thunderstorm;
    for (const g of this.grounds) {
      this.flash(new THREE.Vector3(g.x, B.flashLift, g.z), rgb(K.color.boltGlow, B.flashGain), B.flashSize, B.flashLife);
      this.kit.decals.spawn({
        kind: 'ring', pos: g.clone(), size: B.impactRingStart, sizeEnd: B.impactRingSize, color: rgb(K.color.boltGlow, VFX.flash),
        life: B.impactRingLife, additive: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.impactRingFade,
      });
      this.kit.particles.spark.emit({
        pos: new THREE.Vector3(g.x, B.sparkLift, g.z), vel: tmpA.set(0, B.sparkSpeed, 0), velJitter: B.sparkJitter,
        life: B.sparkLife, size: B.sparkSize, sizeEnd: B.sparkSizeEnd, color: rgb(K.color.boltCore), colorEnd: rgb(K.color.boltDeep),
        gravity: B.sparkGravity, count: B.sparks,
      });
      this.kit.decals.spawn({
        kind: 'scorch', pos: g.clone(), size: B.scorchSize, color: rgb(K.color.scorch), life: B.scorchLife,
        fadeIn: B.scorchFadeIn, fadeOut: B.scorchFadeOut, dissolve: true, opacity: B.scorchOpacity,
      });
    }
    this.kit.stage.addShake(B.shake);
    this.kit.stage.aberrate(B.aberrate);
  }
}

// ---------------- Nova Congelante ----------------

/** Cristais que se juntam ao peito, runa de gelo, onda que varre o raio, pontas de gelo que brotam e névoa rente ao chão. */
export class FrostNovaFx extends MageFx {
  private readonly ground: THREE.Vector3;
  private readonly chest: THREE.Vector3;
  private readonly crystals: THREE.Sprite[] = [];
  private readonly spikes: { m: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; h: number }[] = [];
  private readonly spikeMat: THREE.MeshBasicMaterial;
  private readonly lamp: FlickerLight;
  private readonly cIce = rgb(K.color.iceCore);
  private readonly cMid = rgb(K.color.iceMid);
  private readonly cMist = rgb(K.color.mist);

  constructor(ctx: CombatVisualCtx, center: THREE.Vector3, private readonly radius: number) {
    super(ctx, K.frostNova.life);
    const B = K.frostNova;
    this.ground = onGround(center);
    this.chest = center.clone().setY(K.body.chest);
    for (let i = 0; i < B.crystals; i++) {
      this.crystals.push(fxSprite(this.group, 'halo', rgb(K.color.iceCore), B.crystalSize, { opacity: B.crystalAlpha }));
    }
    this.kit.decals.spawn({
      kind: 'runesFrost', pos: this.ground.clone(), size: radius * B.runeScale, color: rgb(K.color.iceMid, B.runeGain * VFX.flash),
      life: B.runeLife, additive: true, fadeIn: B.runeFadeIn, fadeOut: B.runeFadeOut, spin: B.runeSpin,
    });
    this.spikeMat = new THREE.MeshBasicMaterial({
      color: rgb(K.color.iceMid, B.spikeGain), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const geo = sharedSpike();
    for (let i = 0; i < B.spikes; i++) {
      const a = (i / B.spikes) * Math.PI * 2 + (Math.random() - 0.5) * B.spikeJitter;
      const m = new THREE.Mesh(geo, this.spikeMat);
      m.position.set(center.x + Math.cos(a) * radius * B.spikeRadius, K.groundLift, center.z + Math.sin(a) * radius * B.spikeRadius);
      m.scale.set(1, K.minLength, 1);
      this.group.add(m);
      this.spikes.push({ m, h: B.spikeMin + Math.random() * (B.spikeMax - B.spikeMin) });
    }
    this.tl.at(B.waveAt, () => this.wave());
    this.tl.at(B.impactAt, () => this.hit());
    this.lamp = this.makeLight(K.color.lightIce, B.light.intensity, B.light.distance, B.light.flicker);
    this.lamp.set(new THREE.Vector3(center.x, B.light.height, center.z));
  }

  protected frame(dt: number): void {
    const B = K.frostNova;
    const t = this.t;
    // antecipação: cristais giram em volta do peito e se juntam antes da onda
    if (t < B.gatherTime) {
      const k = clamp01(t / B.gatherTime);
      const n = this.crystals.length;
      for (let i = 0; i < n; i++) {
        const s = this.crystals[i];
        const a = (i / n) * Math.PI * 2 + t * B.crystalSpin;
        const r = B.crystalOrbit * (1 - k);
        s.position.set(this.chest.x + Math.cos(a) * r, this.chest.y, this.chest.z + Math.sin(a) * r);
        s.material.rotation += dt * B.crystalSpin;
        s.scale.setScalar(B.crystalSize * (1 - B.crystalShrink * k));
      }
    } else {
      for (const s of this.crystals) s.visible = false;
    }
    // pontas de gelo: brotam no anel interno e afundam no fim
    for (const sp of this.spikes) {
      const rise = easeOut(clamp01((t - B.spikeAt) / B.spikeRise));
      const sink = clamp01((t - B.sinkAt) / B.sinkTime);
      sp.m.scale.y = Math.max(K.minLength, sp.h * rise * (1 - B.spikeSink * sink));
    }
    this.spikeMat.opacity = B.spikeOpacity * (1 - clamp01((t - B.sinkAt) / B.sinkTime));
    // névoa rente ao chão, saindo do centro para a borda
    if (t >= B.mistFrom && t < B.mistTo) {
      for (let i = 0; i < B.mistRate; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = this.radius * (B.mistInner + (1 - B.mistInner) * Math.random());
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        tmpA.set(this.ground.x + ca * r, K.groundLift, this.ground.z + sa * r);
        tmpB.set(ca * B.mistSpeed, 0, sa * B.mistSpeed);
        this.kit.particles.smoke.emit({
          pos: tmpA, vel: tmpB, life: B.mistLife, size: B.mistSize0, sizeEnd: B.mistSize1,
          color: this.cMist, alpha: B.mistAlpha, spin: B.mistSpin, count: 1,
        });
      }
    }
    this.lamp.update(dt, t < B.impactAt ? 0 : clamp01(1 - (t - B.impactAt) / B.light.time));
  }

  /** Onda: anel escuro por baixo (contraste) e anel de gelo que chega à borda no tempo do acerto; estilhaços. */
  private wave(): void {
    const B = K.frostNova;
    const size = this.radius * B.waveScale;
    const travel = B.impactAt - B.waveAt;
    this.kit.decals.spawn({
      kind: 'ring', pos: this.ground.clone(), size: B.waveStart, sizeEnd: size, color: rgb(K.color.darkRing),
      life: B.waveLife, additive: false, linear: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.waveDarkFade,
    });
    this.kit.decals.spawn({
      kind: 'ring', pos: this.ground.clone(), size: B.waveStart, sizeEnd: size, color: rgb(K.color.iceMid, B.waveGain * VFX.flash),
      life: B.waveLife, additive: true, linear: true, fadeIn: K.decal.ringFadeIn, fadeOut: B.waveFade,
    });
    // estilhaços que voam até a borda e chegam no tempo do acerto
    const speed = this.radius / travel;
    for (let i = 0; i < B.shards; i++) {
      const a = Math.random() * Math.PI * 2;
      this.kit.particles.spark.emit({
        pos: this.chest, vel: tmpB.set(Math.cos(a) * speed, 0, Math.sin(a) * speed), life: travel,
        size: B.shardSize, sizeEnd: B.shardSizeEnd, color: this.cIce, colorEnd: this.cMid, count: 1,
      });
    }
  }

  /** Acerto: flash no peito e gelo no chão (cosmético, respeita a opção de decalques). */
  private hit(): void {
    const B = K.frostNova;
    this.flash(this.chest, this.cMid, B.flashSize, B.flashLife);
    this.kit.decals.spawn({
      kind: 'frost', pos: this.ground.clone(), size: this.radius * B.frostScale, color: rgb(K.color.iceMid, B.frostGain),
      life: B.frostLife, fadeIn: B.frostFadeIn, fadeOut: B.frostFadeOut, dissolve: true, opacity: B.frostOpacity,
    });
    this.kit.stage.addShake(B.shake);
    this.kit.stage.kick(B.kick);
  }
}
