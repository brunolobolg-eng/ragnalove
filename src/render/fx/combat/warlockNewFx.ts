import * as THREE from 'three';
import { WARLOCK_NEW_FX as K } from '../../../config/fx/warlockNew';
import { Flash, FlickerLight, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, flatPlane, fxSprite, jaggedPath } from '../kit/Shapes';
import { poolTexture, runeRingTexture, shardGeometry, softDiscTexture } from '../kit/procedural';
import type { FxTextureName } from '../kit/vfxTextures';

/**
 * Efeitos das seis magias novas da Bruxa (Cárcere Etéreo, Eco da Alma, Névoa Gélida, Geada Negra, Lodaçal Abissal,
 * Ápice Sombrio) e do contorno de gelo (Frio). Identidade: sombra violeta-preta em mistura normal, gelo e ichor só
 * como acento aditivo pequeno. Cada magia tem antecipação → efeito → fim, e tudo vive no mundo (sprites de frente
 * para a câmera, decalques no chão). Só apresentação: os números estão em config/fx/warlockNew.ts.
 */

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
/** Cor do config, multiplicada por `k` (valores acima de 1 são brilho HDR). */
const rgb = (c: readonly number[], k = 1): THREE.Color => new THREE.Color(c[0] * k, c[1] * k, c[2] * k);
/** Mesmo ponto, na altura das marcas do chão. */
const onGround = (p: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(p.x, K.groundLift, p.z);

const CRYSTAL = rgb(K.color.crystal);
const CRYSTAL_EDGE = rgb(K.color.crystalEdge);
const BEAD = rgb(K.color.bead);
const FROST = rgb(K.color.frost);
const FROST_DARK = rgb(K.color.frostDark);
const MIST = rgb(K.color.mist);
const MIST_EDGE = rgb(K.color.mistEdge, 0.5);
const ICE_LIGHT = rgb(K.color.iceLight);
const BLACK_CORE = rgb(K.color.blackCore);
const BLACK_GLOW = rgb(K.color.blackCoreGlow, K.blackFrost.coreGlowAlpha);
const SPIKE = rgb(K.color.spike);
const ROOT = rgb(K.color.root);
const ICHOR = rgb(K.color.ichor);
const VAPOR = rgb(K.color.vapor);
const BOG = rgb(K.color.bog);
const GHOST = rgb(K.color.ghost);
const ECHO_BURST = rgb(K.color.echoBurst);
const ECHO_RING = rgb(K.color.echoRing);
const ECHO_FLARE = rgb(K.color.echoFlare);
const APEX = rgb(K.color.apex);
const APEX_CORE = rgb(K.color.apexCore);
const CHILL_GLOW = rgb(K.color.chillGlow, 0.5);

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
 * Pulso de vida curta: um sprite que cresce, gira e some (estouros, anéis, flares). Sai do grupo quando termina.
 */
export class Pop {
  readonly sprite: THREE.Sprite;
  done = false;
  private age = 0;

  constructor(
    parent: THREE.Object3D,
    tex: FxTextureName,
    color: THREE.Color,
    pos: THREE.Vector3,
    private readonly s0: number,
    private readonly s1: number,
    private readonly life: number,
    private readonly alpha = 1,
    dark = false,
  ) {
    this.sprite = fxSprite(parent, tex, color, s0, { dark, opacity: alpha });
    this.sprite.position.copy(pos);
  }

  update(dt: number): void {
    if (this.done) return;
    this.age += dt;
    const k = clamp01(this.age / this.life);
    this.sprite.scale.setScalar(this.s0 + (this.s1 - this.s0) * easeOut(k));
    this.sprite.material.opacity = this.alpha * (1 - k) * (1 - k);
    if (k >= 1) {
      this.done = true;
      this.sprite.removeFromParent();
      this.sprite.material.dispose();
    }
  }
}

/** Cárcere Etéreo: pilares de cristal que crescem, cintilam e, no fim, quebram em cacos (ou somem, se falhou). */
interface CagePillar {
  off: THREE.Vector3;
  dark: THREE.Sprite;
  edge: THREE.Sprite;
  beads: THREE.Sprite[];
}

export class CageFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private cracked = false;
  private broken = false;
  private breakT = 0;
  private missing = 0;
  private readonly last = new THREE.Vector3();
  private readonly life: number;
  private readonly pillars: CagePillar[] = [];

  /**
   * `at`: posição atual do alvo (pode sumir: morreu ou saiu). `start`: última posição conhecida.
   * `ticks`: duração do Cárcere (evento). `ok`: se a chance deu certo.
   */
  constructor(
    private readonly kit: FxKit,
    private readonly at: () => THREE.Vector3 | undefined,
    start: THREE.Vector3,
    ticks: number,
    private readonly ok: boolean,
  ) {
    const C = K.cage;
    this.last.copy(start);
    this.life = ok ? ticks / K.ticksPerSecond : C.failLife;
    for (let i = 0; i < C.pillars; i++) {
      const a = C.pillarAngle + (i / C.pillars) * Math.PI * 2;
      const off = new THREE.Vector3(Math.cos(a) * C.pillarRadius, 0, Math.sin(a) * C.pillarRadius);
      const dark = fxSprite(this.group, 'trace', CRYSTAL, 1, { dark: true, opacity: 0 });
      const edge = fxSprite(this.group, 'trace', CRYSTAL_EDGE, 1, { opacity: 0 });
      const beads: THREE.Sprite[] = [];
      for (let j = 0; j < C.beadsPerPillar; j++) beads.push(fxSprite(this.group, 'glow', BEAD, C.beadSize, { opacity: 0 }));
      this.pillars.push({ off, dark, edge, beads });
    }
    // gelo no chão, sob o alvo, pela duração toda
    kit.decals.spawn({ kind: 'frost', pos: onGround(start), size: C.frostDecalSize, color: FROST, life: this.life, fadeIn: K.decalFadeIn, fadeOut: 0.3 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const C = K.cage;
    const t = this.t;
    const p = this.at();
    if (p) {
      this.last.copy(p);
      this.missing = 0;
    } else this.missing += dt;
    if (this.ok && !this.broken) {
      if (!this.cracked && t >= this.life * C.crackAt) this.crack();
      // quebra no fim do tempo, ou antes se o alvo sumiu (morreu)
      if (t >= this.life || this.missing > C.missingBreakAfter) this.shatter();
    }
    // presença: aparece no início; na falha, some no fim sem quebrar
    const appear = clamp01(t / C.fadeIn) * (this.ok ? 1 : 1 - clamp01((t - (this.life - C.failFade)) / C.failFade));
    const grow = easeOut(clamp01(t / C.growTime));
    const gone = this.broken ? 1 - clamp01((t - this.breakT) / C.breakTime) : 1;
    const h = C.pillarHeight * grow * gone;
    const flash = this.cracked && !this.broken ? C.crackFlash : 1;
    for (let i = 0; i < this.pillars.length; i++) {
      const P = this.pillars[i];
      const x = this.last.x + P.off.x;
      const z = this.last.z + P.off.z;
      P.dark.position.set(x, h / 2, z);
      P.dark.scale.set(C.pillarWidth, Math.max(K.minLength, h), 1);
      P.dark.material.opacity = 0.8 * appear * gone;
      P.edge.position.copy(P.dark.position);
      P.edge.scale.set(C.edgeWidth, Math.max(K.minLength, h), 1);
      P.edge.material.opacity = Math.min(1, C.edgeAlpha * (1 + C.shimmer * Math.sin(t * C.shimmerSpeed + i)) * flash) * appear * gone;
      for (let j = 0; j < P.beads.length; j++) {
        const bd = P.beads[j];
        bd.position.set(x, h * (j === 0 ? 0.92 : 0.5), z);
        bd.material.opacity = C.beadAlpha * appear * gone;
      }
    }
    if (this.broken && t - this.breakT >= C.breakTime) this.finish();
    else if (!this.ok && t >= this.life) this.finish();
  }

  /** Racha: decalque de trinca no chão e faíscas nas arestas. */
  private crack(): void {
    const C = K.cage;
    this.cracked = true;
    this.kit.decals.spawn({ kind: 'crack', pos: onGround(this.last), size: C.crackDecalSize, color: CRYSTAL, life: C.crackDecalLife, fadeIn: K.decalFadeIn, fadeOut: 0.5 });
    this.kit.particles.spark.emit({ pos: this.last.clone().setY(C.pillarHeight * 0.6), posJitter: C.pillarRadius, velJitter: 0.8, life: 0.3, size: 0.06, sizeEnd: 0.01, color: BEAD, count: C.crackSparks });
  }

  /** Quebra: cacos de cristal, anel lilás no chão e um tremor curto. Os pilares encolhem. */
  private shatter(): void {
    const C = K.cage;
    this.broken = true;
    this.breakT = this.t;
    const c = this.last.clone().setY(K.body.chest);
    this.kit.particles.glow.emit({ pos: c, posJitter: C.pillarRadius, velJitter: C.shardSpeed, life: C.shardLife, size: C.shardSize, sizeEnd: C.shardSizeEnd, color: CRYSTAL_EDGE, colorEnd: CRYSTAL, gravity: C.shardGravity, drag: C.shardDrag, count: C.shardCount });
    this.kit.particles.spark.emit({ pos: c, posJitter: 0.2, velJitter: C.shardSpeed * 0.6, life: C.shardLife * 0.8, size: 0.07, sizeEnd: 0.01, color: BEAD, count: 4 });
    this.kit.decals.spawn({ kind: 'ring', pos: onGround(this.last), size: C.crackRingSize, sizeEnd: C.crackRingSize * 1.8, color: CRYSTAL_EDGE, life: C.crackRingLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: 0.6 });
    this.kit.stage.addShake(C.breakShake);
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/** Uma silhueta fantasma do eco: uma coluna escura com cabeça, que sai do alvo e se desfaz. */
interface Ghost {
  body: THREE.Sprite;
  head: THREE.Sprite;
  /** desvio lateral em relação ao alvo (a segunda batida sai do outro lado) */
  off: THREE.Vector3;
  base: THREE.Vector3;
  /** deriva: para longe do conjurador */
  drift: THREE.Vector3;
  /** instante da batida (-1 = ainda não saiu) */
  born: number;
}

/**
 * Eco da Alma: duas batidas de sombra, uma após a outra. Cada batida solta uma silhueta fantasma (afterimage) que
 * se desfaz, um anel de luz sobre o alvo e um estouro em cada alvo da área. Se `doubled` (algum alvo preso), os
 * ecos saem maiores e com flare.
 */
export class EchoFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly scale: number;
  private readonly ghosts: Ghost[] = [];
  private pops: Pop[] = [];
  private readonly tl = new Timeline();
  private readonly end: number;

  /**
   * `at`: posição do alvo principal (segue, se ele andar). `center`: posição do alvo quando o evento chegou.
   * `from`: conjurador (para a deriva). `area`: posições dos alvos da área (estouros).
   */
  constructor(
    kit: FxKit,
    private readonly at: () => THREE.Vector3 | undefined,
    private readonly center: THREE.Vector3,
    from: THREE.Vector3,
    radius: number,
    private readonly doubled: boolean,
    private readonly area: THREE.Vector3[],
  ) {
    const E = K.echo;
    this.scale = doubled ? E.doubledScale : 1;
    const drift = new THREE.Vector3(center.x - from.x, 0, center.z - from.z);
    if (drift.lengthSq() < 1e-6) drift.set(0, 0, 1);
    drift.normalize();
    const side = new THREE.Vector3(-drift.z, 0, drift.x);
    for (let i = 0; i < 2; i++) {
      const sign = i === 0 ? -1 : 1;
      this.ghosts.push({
        body: fxSprite(this.group, 'trace', GHOST, E.ghostWidth * this.scale, { dark: true, opacity: 0 }),
        head: fxSprite(this.group, 'noise', GHOST, E.headSize * this.scale, { dark: true, opacity: 0 }),
        off: side.clone().multiplyScalar(sign * E.ghostOffset * this.scale),
        base: new THREE.Vector3(),
        drift: drift.clone().multiplyScalar(E.ghostDrift),
        born: -1,
      });
    }
    // área da magia: decalque escuro que some logo depois da segunda batida
    kit.decals.spawn({ kind: 'aoe', pos: onGround(center), size: radius * 2 + 1, color: GHOST, life: E.areaLife, fadeIn: 0.05, fadeOut: E.areaFade / E.areaLife });
    this.end = Math.max(E.blowAt + E.blowGap + E.ghostLife, E.areaLife) + 0.1;
    this.tl.at(E.blowAt, () => this.blow(0)).at(E.blowAt + E.blowGap, () => this.blow(1));
  }

  /** Uma batida: silhueta fantasma, anel de luz sobre o alvo e estouro em cada alvo da área. */
  private blow(i: number): void {
    const E = K.echo;
    const feet = this.at() ?? this.center;
    const g = this.ghosts[i];
    g.born = this.t;
    g.base.copy(feet).add(g.off);
    const chest = feet.clone().setY(K.body.chest);
    this.pops.push(new Pop(this.group, 'lu_ring', ECHO_RING, chest, E.ringSize * this.scale, E.ringSizeEnd * this.scale, E.ringLife, 0.9));
    for (const q of this.area.slice(0, E.maxAreaImpacts)) {
      this.pops.push(new Pop(this.group, 'impact', ECHO_BURST, q.clone().setY(K.body.chest), E.impactSize * this.scale, E.impactSizeEnd * this.scale, E.impactLife, 0.85, true));
    }
    if (i === 1 && this.doubled) this.pops.push(new Pop(this.group, 'lu_flare', ECHO_FLARE, chest, E.flareSize, E.flareSize * 1.4, E.flareLife, 0.9));
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const E = K.echo;
    const t = this.t;
    this.tl.update(dt);
    for (const g of this.ghosts) {
      if (g.born < 0) continue;
      const k = clamp01((t - g.born) / E.ghostLife);
      const alpha = E.ghostAlpha * (1 - k) * (1 - k);
      const h = E.ghostHeight * this.scale;
      const x = g.base.x + g.drift.x * k;
      const z = g.base.z + g.drift.z * k;
      g.body.position.set(x, h / 2, z);
      g.body.scale.set(E.ghostWidth * this.scale, Math.max(K.minLength, h), 1);
      g.body.material.opacity = alpha;
      g.head.position.set(x, h * 0.92, z);
      g.head.material.opacity = alpha;
    }
    for (const p of this.pops) p.update(dt);
    this.pops = this.pops.filter((p) => !p.done);
    if (t >= this.end && this.pops.length === 0) this.finish();
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/** Névoa Gélida: nuvem roxo-gelo que gira, cristais orbitando, flocos e luz azul-gelo. Anel a cada pulso de gelo. */
export class FrostMistFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private nextPulse: number;
  private readonly life: number;
  private readonly area: number;
  private readonly halos: { s: THREE.Sprite; a: number; ph: number }[] = [];
  private readonly light: FlickerLight;

  /** `center`: centro da área (mundo); `radius`: raio em tiles; `ticks`: duração do evento. */
  constructor(
    private readonly kit: FxKit,
    private readonly center: THREE.Vector3,
    private readonly radius: number,
    ticks: number,
  ) {
    const M = K.mist;
    this.life = ticks / K.ticksPerSecond;
    this.area = radius * 2 + 1;
    this.nextPulse = M.pulseEvery;
    const fo = Math.min(0.9, M.fadeOut / this.life);
    // chão: a área escura e a borda gelada, pela duração toda
    kit.decals.spawn({ kind: 'aoe', pos: onGround(center), size: this.area, color: MIST, life: this.life, fadeIn: 0.3, fadeOut: fo });
    kit.decals.spawn({ kind: 'ring', pos: onGround(center), size: this.area * M.edgeRingSize, color: MIST_EDGE, life: this.life, additive: true, fadeIn: 0.3, fadeOut: fo, spin: 0.15 });
    for (let i = 0; i < M.haloCount; i++) {
      this.halos.push({ s: fxSprite(this.group, 'halo', MIST_EDGE, M.haloSize, { opacity: 0 }), a: (i / M.haloCount) * Math.PI * 2, ph: i * 1.3 });
    }
    // luz azul-gelo fraca (teto 0,3): só se o pool de luzes tiver vaga
    this.light = new FlickerLight(kit.stage, ICE_LIGHT, M.lightIntensity, M.lightDistance, 0.2);
    this.light.set(center.clone().setY(M.lightHeight));
  }

  /** Pulso de gelo: anel que se expande no chão (o dano em si sai no evento de cada alvo). */
  private pulseRing(): void {
    const M = K.mist;
    this.kit.decals.spawn({ kind: 'ring', pos: onGround(this.center), size: this.area * 0.5, sizeEnd: this.area * M.pulseRingSize, color: FROST, life: M.pulseRingLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: 0.6 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const M = K.mist;
    const t = this.t;
    const alive = 1 - clamp01((t - (this.life - M.fadeOut)) / M.fadeOut);
    while (t >= this.nextPulse && this.nextPulse < this.life) {
      this.pulseRing();
      this.nextPulse += M.pulseEvery;
    }
    const r = this.radius * M.haloOrbit;
    for (const h of this.halos) {
      const ang = h.a + t * M.haloSpin;
      h.s.position.set(this.center.x + Math.cos(ang) * r, M.haloHeight + Math.sin(t * 2 + h.ph) * M.haloBob, this.center.z + Math.sin(ang) * r);
      h.s.material.rotation += dt * M.haloSpin;
      h.s.material.opacity = M.haloAlpha * clamp01(t / 0.5) * alive;
    }
    if (alive > 0) {
      // nuvem girando (sprites da fumaça), e flocos de gelo caindo
      this.kit.particles.smoke.emit({ pos: this.center.clone().setY(0.4), posJitter: this.radius * 0.8, vel: tmpVel.set(0, 0.1, 0), velJitter: 0.3, life: M.cloudLife, size: M.cloudSize, sizeEnd: M.cloudSizeEnd, color: MIST, colorEnd: FROST_DARK, alpha: M.cloudAlpha * alive, drag: M.cloudDrag, spin: M.cloudSpin, count: M.cloudRate * dt });
      this.kit.particles.glow.emit({ pos: this.center.clone().setY(1.2), posJitter: this.radius * 0.9, vel: tmpVel.set(0, -0.4, 0), velJitter: 0.2, life: M.flakeLife, size: M.flakeSize, sizeEnd: 0.01, color: FROST, colorEnd: FROST_DARK, gravity: M.flakeGravity, count: M.flakeRate * dt * alive });
    }
    this.light.update(dt, alive);
    if (t >= this.life) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.light.release();
    disposeFxGroup(this.group);
  }
}

/** Pulso de gelo num alvo da névoa ou da geada: ondulação no chão e um pouco de gelo que sobe. */
export function frostRipple(kit: FxKit, feet: THREE.Vector3): void {
  const M = K.mist;
  kit.decals.spawn({ kind: 'ring', pos: onGround(feet), size: M.rippleSize, sizeEnd: M.rippleSize * 1.6, color: FROST, life: M.rippleLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: 0.6 });
  kit.particles.glow.emit({ pos: feet.clone().setY(0.8), posJitter: 0.25, velJitter: 0.6, life: 0.4, size: 0.07, sizeEnd: 0.01, color: FROST, colorEnd: FROST_DARK, gravity: 1, count: M.rippleFlakes });
}

/**
 * Geada Negra: núcleo azul-negro que cresce, espinhos de gelo negro que saem do centro até a borda da área (a
 * batida, em `spikeAt`), estouro na ponta de cada espinho e no alvo. Se havia alvo gelado, flash azul-gelo.
 */
export class BlackFrostFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private landed = false;
  private pops: Pop[] = [];
  private flashes: Flash[] = [];
  private readonly core: THREE.Sprite;
  private readonly glow: THREE.Sprite;
  private readonly spikes: { s: THREE.Sprite; tip: THREE.Vector3 }[] = [];
  private readonly area: number;

  /** `center`: centro da área (mundo); `radius`: raio em tiles; `targets`: alvos atingidos; `chilled`: havia gelado. */
  constructor(
    private readonly kit: FxKit,
    private readonly center: THREE.Vector3,
    private readonly radius: number,
    private readonly targets: THREE.Vector3[],
    private readonly chilled: boolean,
  ) {
    const B = K.blackFrost;
    this.area = radius * 2 + 1;
    this.core = fxSprite(this.group, 'glow', BLACK_CORE, radius * B.coreSize, { dark: true, opacity: 0 });
    this.core.position.set(center.x, 0.6, center.z);
    this.glow = fxSprite(this.group, 'glow', BLACK_GLOW, radius * B.coreGlowSize, { opacity: 0 });
    this.glow.position.copy(this.core.position);
    const n = B.spikes + (chilled ? B.chilledSpikes : 0);
    for (let i = 0; i < n; i++) {
      const a = i < B.spikes ? (i / B.spikes) * Math.PI * 2 : ((i - B.spikes + 0.5) / B.chilledSpikes) * Math.PI * 2;
      const tip = new THREE.Vector3(center.x + Math.cos(a) * radius, 0.2, center.z + Math.sin(a) * radius);
      this.spikes.push({ s: fxSprite(this.group, 'trace', SPIKE, 1, { dark: true, opacity: 0 }), tip });
    }
    // área escura no chão, que aparece aos poucos durante a preparação
    kit.decals.spawn({ kind: 'aoe', pos: onGround(center), size: this.area, color: BLACK_CORE, life: B.areaLife, fadeIn: B.windUp, fadeOut: B.areaFade / B.areaLife });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const B = K.blackFrost;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    // núcleo: cresce na preparação e some depois da batida
    const grow = easeOut(clamp01(t / B.windUp));
    const fade = clamp01((t - B.spikeAt) / (B.doneAfter - B.spikeAt));
    this.core.material.opacity = grow * (1 - fade);
    this.core.scale.setScalar(this.radius * B.coreSize * (0.3 + 0.7 * grow));
    this.glow.material.opacity = (1 - fade) * grow;
    this.glow.scale.setScalar(this.radius * B.coreGlowSize * (0.3 + 0.7 * grow));
    // espinhos: saem do centro até a borda na batida, depois somem
    const sk = easeOut(clamp01((t - B.windUp) / B.spikeGrow));
    const spikeFade = (1 - clamp01((t - B.spikeAt) / B.spikeLife)) * clamp01((t - B.windUp) / 0.05);
    const base = tmpA.copy(this.center).setY(0.2);
    for (const sp of this.spikes) {
      placeSegment(sp.s, base, tmpB.lerpVectors(base, sp.tip, sk), B.spikeWidth);
      sp.s.material.opacity = 0.9 * spikeFade;
    }
    if (!this.landed && t >= B.spikeAt) this.land();
    for (const p of this.pops) p.update(dt);
    this.pops = this.pops.filter((p) => !p.done);
    for (const f of this.flashes) f.update(dt);
    this.flashes = this.flashes.filter((f) => !f.done);
    if (t >= B.doneAfter && this.pops.length === 0 && this.flashes.length === 0) this.finish();
  }

  /** A batida: estouro nas pontas e nos alvos, anel de gelo na área, cacos e, se havia gelado, flash azul. */
  private land(): void {
    const B = K.blackFrost;
    this.landed = true;
    for (const sp of this.spikes) this.pops.push(new Pop(this.group, 'impact', SPIKE, sp.tip.clone(), B.tipBurstSize * 0.6, B.tipBurstSize, B.tipBurstLife, 0.85, true));
    for (const q of this.targets) {
      const chest = q.clone().setY(0.6);
      this.pops.push(new Pop(this.group, 'impact', SPIKE, chest, B.targetImpactSize, B.targetImpactSize * 1.4, B.targetImpactLife, 0.85, true));
      this.pops.push(new Pop(this.group, 'halo', FROST, chest, B.targetImpactSize * 0.7, B.targetImpactSize * 1.2, B.targetImpactLife, 0.9));
    }
    this.kit.decals.spawn({ kind: 'ring', pos: onGround(this.center), size: this.area * B.ringSize, sizeEnd: this.area * B.ringSizeEnd, color: FROST, life: B.ringLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: 0.5 });
    this.kit.particles.spark.emit({ pos: this.center.clone().setY(0.4), posJitter: this.radius * 0.4, velJitter: B.shardSpeed, life: B.shardLife, size: B.shardSize, sizeEnd: B.shardSizeEnd, color: FROST, colorEnd: FROST_DARK, count: B.shardCount });
    if (this.chilled) this.flashes.push(new Flash(this.group, this.center.clone().setY(0.6), ICE_LIGHT, B.flashSize, B.flashLife));
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/** Raiz do lodaçal: segmentos em zigue-zague, com as posições guardadas como deslocamento do alvo. */
interface Root {
  segs: THREE.Sprite[];
  pts: THREE.Vector3[];
}

/**
 * Lodaçal Abissal: de 3 a 4 raízes sobem dos pés do alvo, com vapor roxo e fiapos de ichor. Um disco de lodo é
 * pintado no chão a cada instante, seguindo o alvo. Dura o tempo do evento; no fim as raízes afundam.
 */
export class MarshFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private readonly life: number;
  private readonly roots: Root[] = [];
  private readonly last = new THREE.Vector3();
  private missing = 0;
  private discT = 0;
  private endAt: number;

  /** `at`: posição do alvo (segue); `start`: posição quando o evento chegou; `ticks`: duração do evento. */
  constructor(
    private readonly kit: FxKit,
    private readonly at: () => THREE.Vector3 | undefined,
    start: THREE.Vector3,
    ticks: number,
  ) {
    const M = K.marsh;
    this.life = ticks / K.ticksPerSecond;
    this.endAt = this.life;
    this.last.copy(start);
    for (let i = 0; i < M.roots; i++) {
      const a = (i / M.roots) * Math.PI * 2 + Math.random() * 0.6;
      const g0 = new THREE.Vector3(Math.cos(a) * M.rootRadius, 0, Math.sin(a) * M.rootRadius);
      const top = g0.clone().add(new THREE.Vector3(Math.cos(a) * 0.2, M.rootHeight * (0.7 + 0.3 * Math.random()), Math.sin(a) * 0.2));
      const pts = jaggedPath(g0, top, M.rootSegments, M.rootJitter);
      const segs: THREE.Sprite[] = [];
      for (let k = 0; k < pts.length - 1; k++) segs.push(fxSprite(this.group, 'trace', ROOT, 1, { dark: true, opacity: 0 }));
      this.roots.push({ segs, pts });
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const M = K.marsh;
    const t = this.t;
    readCamera(this.kit.stage.camera);
    const p = this.at();
    if (p) {
      this.last.copy(p);
      this.missing = 0;
    } else {
      // alvo sumiu (morreu): as raízes afundam já
      this.missing += dt;
      if (this.missing > 0.5 && this.endAt > t) this.endAt = t;
    }
    const remain = this.endAt - t;
    const alive = clamp01(remain / M.rootSink);
    const grow = easeOut(clamp01(t / M.rootGrow));
    const sink = (1 - alive) * 0.8;
    const base = this.last;
    for (const r of this.roots) {
      const n = r.segs.length;
      for (let k = 0; k < n; k++) {
        const a = tmpA.set(base.x + r.pts[k].x, r.pts[k].y - sink, base.z + r.pts[k].z);
        const b = tmpB.set(base.x + r.pts[k + 1].x, r.pts[k + 1].y - sink, base.z + r.pts[k + 1].z);
        placeSegment(r.segs[k], a, b, M.rootWidth);
        // cada segmento surge quando a raiz passa por ele
        r.segs[k].material.opacity = 0.9 * alive * clamp01(grow * n - k);
      }
    }
    // disco de lodo que segue o alvo (decalques curtos, um a cada instante)
    this.discT -= dt;
    if (this.discT <= 0 && alive > 0) {
      this.discT = M.discEvery;
      this.kit.decals.spawn({ kind: 'disc', pos: onGround(base), size: M.discSize, color: BOG, life: M.discLife, fadeIn: K.decalFadeIn, fadeOut: M.discFade });
    }
    if (alive > 0) {
      this.kit.particles.smoke.emit({ pos: base.clone().setY(0.3), posJitter: 0.35, vel: tmpVel.set(0, 0.25, 0), velJitter: 0.2, life: M.vaporLife, size: M.vaporSize, sizeEnd: M.vaporSizeEnd, color: VAPOR, colorEnd: FROST_DARK, alpha: M.vaporAlpha * alive, count: M.vaporRate * dt * alive });
      this.kit.particles.glow.emit({ pos: base.clone().setY(0.4), posJitter: M.rootRadius, vel: tmpVel.set(0, M.ichorRise, 0), velJitter: 0.3, life: M.ichorLife, size: M.ichorSize, sizeEnd: 0.01, color: ICHOR, colorEnd: ROOT, count: M.ichorRate * dt * alive });
    }
    if (t >= this.endAt) this.finish();
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/** Plano no chão (aditivo, ou mistura normal no núcleo escuro): a malha e o material (para o alfa). */
interface Flat {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

/** Plano no chão com a textura dada (quadrada). */
function flatArt(parent: THREE.Object3D, map: THREE.Texture, width: number, renderOrder: number, o: { dark?: boolean; color?: THREE.Color } = {}): Flat {
  const mesh = flatPlane(parent, map, width, 1, { y: K.groundLift, opacity: 0, renderOrder, color: o.color ?? APEX, dark: o.dark });
  return { mesh, mat: mesh.material as THREE.MeshBasicMaterial };
}

/** Põe o plano no chão, no ponto (x, z), com a largura, o alfa e o giro dados (alfa 0 = escondido). */
function showFlat(f: Flat, x: number, z: number, width: number, opacity: number, angle = 0): void {
  f.mesh.visible = opacity > 0.001;
  f.mesh.position.set(x, K.groundLift, z);
  f.mesh.rotation.set(-Math.PI / 2, 0, angle);
  f.mesh.scale.set(width, width, 1);
  f.mat.opacity = opacity;
}

let spikeGeo: THREE.BufferGeometry | undefined;
/** Espinho: cone com a base no chão (a altura é a escala Y). */
function spikeGeometry(): THREE.BufferGeometry {
  spikeGeo ??= new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
  return spikeGeo;
}

/**
 * Ápice Sombrio (buff da própria Bruxa), tudo desenhado por código: poça de veneno com núcleo escuro, anel de runas
 * girando, espinhos de energia que sobem em volta e cristais violeta orbitando a cintura. Ao acabar (`ticks`),
 * tudo converge para o peito e some.
 */
export class ApexFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private missing = 0;
  private endAt: number;
  private readonly life: number;
  private readonly last = new THREE.Vector3();
  private readonly core: Flat;
  private readonly floor: Flat;
  private readonly rune: Flat;
  private readonly spikeMat: THREE.MeshLambertMaterial;
  private readonly spikes: THREE.Mesh[] = [];
  private readonly crystalMat: THREE.MeshLambertMaterial;
  private readonly crystals: THREE.Mesh[] = [];

  /** `at`: posição da Bruxa (segue); `start`: posição quando o buff chegou; `ticks`: duração do buff. */
  constructor(
    private readonly kit: FxKit,
    private readonly at: () => THREE.Vector3 | undefined,
    start: THREE.Vector3,
    ticks: number,
  ) {
    const A = K.apex;
    this.life = ticks / K.ticksPerSecond;
    this.endAt = this.life;
    this.last.copy(start);
    this.core = flatArt(this.group, softDiscTexture(), A.coreWidth, 5, { dark: true, color: APEX_CORE });
    this.floor = flatArt(this.group, poolTexture(), A.floorWidth, 6);
    this.rune = flatArt(this.group, runeRingTexture(), A.runeWidth, 8);
    this.spikeMat = new THREE.MeshLambertMaterial({ color: 0x1e0c33, emissive: APEX, flatShading: true, transparent: true, opacity: 0 });
    for (let i = 0; i < A.spikes; i++) {
      const m = new THREE.Mesh(spikeGeometry(), this.spikeMat);
      this.group.add(m);
      this.spikes.push(m);
    }
    this.crystalMat = new THREE.MeshLambertMaterial({ color: 0x2a1446, emissive: APEX, emissiveIntensity: A.crystalGlow, flatShading: true, transparent: true, opacity: 0 });
    for (let i = 0; i < A.crystals; i++) {
      const m = new THREE.Mesh(shardGeometry(i + 11, 1.5), this.crystalMat);
      this.group.add(m);
      this.crystals.push(m);
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const A = K.apex;
    const t = this.t;
    const p = this.at();
    if (p) {
      this.last.copy(p);
      this.missing = 0;
    } else {
      this.missing += dt;
      if (this.missing > 0.5 && this.endAt > t) this.endAt = t;
    }
    const ending = clamp01((t - (this.endAt - A.converge)) / A.converge);
    const live = 1 - ending;
    const base = this.last;

    // a poça e o núcleo escuro crescem do centro; o anel de runas gira no sentido contrário
    const settle = clamp01(t / A.grow);
    const pulse = 1 + A.floorPulse * Math.sin(t * A.floorPulseSpeed);
    showFlat(this.core, base.x, base.z, A.coreWidth * easeOut(settle), A.coreAlpha * settle * live);
    showFlat(this.floor, base.x, base.z, A.floorWidth * (0.55 + 0.45 * easeOut(settle)) * pulse, A.floorAlpha * settle * live, t * A.floorSpin);
    showFlat(this.rune, base.x, base.z, A.runeWidth * easeOut(settle), A.runeAlpha * settle * live, -t * A.runeSpin);

    // espinhos sobem depois da poça, pulsando em alturas diferentes
    this.spikeMat.opacity = live;
    this.spikes.forEach((m, i) => {
      const rise = clamp01((t - A.spikeDelay - i * A.spikeStagger) / A.grow);
      const ang = (i / this.spikes.length) * Math.PI * 2;
      const beat = 0.8 + 0.2 * Math.sin((t * Math.PI * 2) / A.spikePeriod + i);
      const r = A.spikeRadius * live;
      const h = A.spikeHeight * rise * beat * live;
      m.position.set(base.x + Math.cos(ang) * r, K.groundLift, base.z + Math.sin(ang) * r);
      m.scale.set(A.spikeWidth, Math.max(K.minLength, h), A.spikeWidth);
      m.visible = h > K.minLength;
    });

    // cristais orbitam a cintura, balançando de leve; no fim voltam ao peito
    const crystalRise = clamp01((t - A.crystalDelay) / A.grow);
    this.crystalMat.opacity = crystalRise * live;
    this.crystals.forEach((m, i) => {
      const ang = (i / this.crystals.length) * Math.PI * 2 + t * A.crystalOrbit;
      const yFree = A.crystalHeight + Math.sin(t * A.crystalBobSpeed + i) * A.crystalBob;
      const y = yFree + (K.body.chest - yFree) * ending;
      const r = A.crystalRadius * live;
      const s = A.crystalSize * crystalRise * live;
      m.position.set(base.x + Math.cos(ang) * r, y, base.z + Math.sin(ang) * r);
      m.rotation.y = t * 0.8 + i;
      m.scale.set(s, s, s);
    });

    if (ending < 1) {
      this.kit.particles.smoke.emit({ pos: base.clone().setY(0.2), posJitter: 0.35, vel: tmpVel.set(0, 0.3, 0), velJitter: 0.2, life: A.vaporLife, size: A.vaporSize, sizeEnd: A.vaporSizeEnd, color: VAPOR, colorEnd: FROST_DARK, alpha: A.vaporAlpha * (1 - ending), count: A.vaporRate * dt * (1 - ending) });
    }
    if (t >= this.endAt) this.finish();
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}

/**
 * Contorno de gelo de um inimigo gelado (Frio): cristais que giram na cintura e um anel no chão. Some sozinho quando
 * o Frio acaba; cada pulso de gelo renova a duração (`refresh`). `end` apaga já (limite de contornos).
 */
export class ChillFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private t = 0;
  private until: number;
  private missing = 0;
  private readonly last = new THREE.Vector3();
  private readonly halos: { s: THREE.Sprite; a: number }[] = [];

  constructor(
    kit: FxKit,
    private readonly at: () => THREE.Vector3 | undefined,
    start: THREE.Vector3,
    ticks: number,
  ) {
    const C = K.chill;
    this.until = ticks / K.ticksPerSecond;
    this.last.copy(start);
    for (let i = 0; i < C.haloCount; i++) {
      this.halos.push({ s: fxSprite(this.group, 'halo', CHILL_GLOW, C.haloSize, { opacity: 0 }), a: (i / C.haloCount) * Math.PI * 2 });
    }
    kit.decals.spawn({ kind: 'ring', pos: onGround(start), size: C.feetRingSize, sizeEnd: C.feetRingSize * 1.2, color: FROST, life: C.feetRingLife, additive: true, fadeIn: K.decalFadeIn, fadeOut: 0.5 });
  }

  /** Novo pulso de gelo: o Frio volta a contar do zero (o contorno continua). */
  refresh(ticks: number): void {
    this.until = Math.max(this.until, this.t + ticks / K.ticksPerSecond);
  }

  /** Some já (por causa do limite de contornos). */
  end(): void {
    this.until = this.t;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const C = K.chill;
    const t = this.t;
    const p = this.at();
    if (p) {
      this.last.copy(p);
      this.missing = 0;
    } else this.missing += dt;
    if (this.missing > 0.2) this.until = Math.min(this.until, t);
    if (t >= this.until) {
      this.finish();
      return;
    }
    const alive = clamp01((this.until - t) / C.fadeOut);
    for (const h of this.halos) {
      const ang = h.a + t * C.haloSpin;
      h.s.position.set(this.last.x + Math.cos(ang) * C.haloRadius, C.haloHeight, this.last.z + Math.sin(ang) * C.haloRadius);
      h.s.material.rotation += dt * C.haloSpin;
      h.s.material.opacity = C.haloAlpha * alive;
    }
  }

  private finish(): void {
    this.done = true;
    disposeFxGroup(this.group);
  }
}
