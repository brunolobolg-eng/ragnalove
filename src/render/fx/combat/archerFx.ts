import * as THREE from 'three';
import { ARCHER_FX as F } from '../../../config/fx/archer';
import type { TrapKind } from '../../../core/sim/types';
import { ArrowFX, RainFX } from '../SkillFX';
import { FlickerLight, Flash, Timeline, type FxKit, type OneShotFx } from '../kit/FxKit';
import { disposeFxGroup, fxSprite, groundCircle } from '../kit/Shapes';
import { fxTexture } from '../kit/vfxTextures';
import type { Ribbon } from '../kit/Ribbons';

/**
 * Efeitos de combate da Arqueira. Cada habilidade tem forma e movimento próprios:
 *  - Flecha: risco de luz que sai do arco e voa até o alvo; o crítico é dourado, com estrela no impacto.
 *  - Chuva de Flechas: marca rúnica no chão e flechas caindo do céu sobre ela; a Incendiária vira chamas e brasas.
 *  - Flecha Perfurante: risco que varre a linha inteira, cópias atrás; no impacto a linha toda acende.
 *  - Foco do Caçador: círculo rúnico verde que gira sob a arqueira, marcas de mira em órbita, anéis e brilhos.
 *  - Armadilhas: pontas que saltam (comum), bola de fogo e anel de choque (mina), gelo em anel (congelante),
 *    leque de fogo na direção da trilha e explosão grande (claymore).
 * Só apresentação: nada aqui entra na simulação. Sprites e materiais são criados por efeito e liberados ao fim;
 * geometrias são compartilhadas (nunca liberadas).
 */

/** Cor HDR a partir da lista de config (k escala o brilho). */
const rgb = (a: readonly number[], k = 1): THREE.Color => new THREE.Color(a[0] * k, a[1] * k, a[2] * k);

const UP = new THREE.Vector3(0, 1, 0);
/** Velocidades fixas (só são lidas pelo sistema de partículas, nunca alteradas). */
const RISE = new THREE.Vector3(0, 0.4, 0);
const RISE_SLOW = new THREE.Vector3(0, 0.6, 0);
const RISE_FIRE = new THREE.Vector3(0, 2.4, 0);
const FOCUS_UP = new THREE.Vector3(0, 2, 0);
const SHARED_PLANE = new THREE.PlaneGeometry(1, 1);

// temporários reaproveitados (sem alocar vetores a cada quadro)
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _t = new THREE.Vector3();
const _fan = new THREE.Vector3();

/** Ângulo na tela do segmento a→b, com a proporção da janela corrigida (a tela não é quadrada). */
function screenAngle(cam: THREE.PerspectiveCamera, a: THREE.Vector3, b: THREE.Vector3): number {
  _pa.copy(a).project(cam);
  _pb.copy(b).project(cam);
  return Math.atan2(_pb.y - _pa.y, (_pb.x - _pa.x) * cam.aspect);
}

/**
 * Risco de luz (sprite alongado) da cauda `a` até a cabeça `b`, alinhado à tela. O sprite de fita 'trace' é
 * vertical: girar por (ângulo − 90°) põe o eixo longo sobre o segmento.
 */
function placeBeam(s: THREE.Sprite, cam: THREE.PerspectiveCamera, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  s.position.addVectors(a, b).multiplyScalar(0.5);
  s.material.rotation = screenAngle(cam, a, b) - Math.PI / 2;
  s.scale.set(width, Math.max(0.001, a.distanceTo(b)), 1);
}

/** Risco que segue uma direção 3D (cabeça em `head`, movimento em `dir`, cauda para trás): flechas que caem. */
function placeStreak(s: THREE.Sprite, cam: THREE.PerspectiveCamera, head: THREE.Vector3, dir: THREE.Vector3, len: number, width: number): void {
  _t.copy(head).addScaledVector(dir, 0.2);
  s.position.copy(head).addScaledVector(dir, -len / 2);
  s.material.rotation = screenAngle(cam, head, _t) - Math.PI / 2;
  s.scale.set(width, len, 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Flecha básica e crítica
// ---------------------------------------------------------------------------------------------------------------

/**
 * Flecha de arco: a corda acende (puxada), o risco de luz voa do arco até o alvo (com cabeça e fita fina),
 * e no impacto sai uma faísca. O crítico é dourado, com flash curto e estrela no alvo.
 * O impacto cai em ArrowFX.impactDelay: o alvo reage no mesmo instante (o GameView adia o dano até lá).
 */
export class ArcherArrowFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly tl = new Timeline();
  private readonly impactAt: number;
  private readonly dir = new THREE.Vector3();
  private readonly p = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  private readonly glint: THREE.Sprite;
  private readonly streak: THREE.Sprite;
  private readonly head: THREE.Sprite;
  private readonly star?: THREE.Sprite;
  private readonly ribbon?: Ribbon;
  private readonly flashes: Flash[] = [];
  private released = false;
  private struck = false;
  private t = 0;

  constructor(
    private readonly kit: FxKit,
    private readonly cam: THREE.PerspectiveCamera,
    private readonly from: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly crit: boolean,
    private readonly onImpact?: () => void,
  ) {
    const K = crit ? F.crit : F.arrow;
    this.impactAt = ArrowFX.impactDelay(from, to);
    this.dir.subVectors(to, from).normalize();
    this.glint = fxSprite(this.group, 'spark', rgb(K.core), 0.2, { opacity: 0 });
    this.glint.position.copy(from);
    this.streak = fxSprite(this.group, 'trace', rgb(K.core), 1, { opacity: 0 });
    this.head = fxSprite(this.group, 'orb', rgb(K.head), K.headSize, { opacity: 0 });
    if (crit) this.star = fxSprite(this.group, 'impact', rgb(F.crit.starColor), F.crit.starSize, { opacity: 0 });
    this.ribbon = kit.ribbons.acquire(rgb(K.trail), K.trailWidth, K.trailLife);
    this.tl.at(F.arrow.drawSec, () => this.release());
    this.tl.at(this.impactAt, () => this.strike());
  }

  /** Soltura: um pequeno estouro de luz na ponta do arco. */
  private release(): void {
    this.released = true;
    this.kit.particles.glow.emit({ pos: this.from, posJitter: 0.04, life: 0.12, size: 0.1, sizeEnd: 0.02, color: rgb(F.arrow.core), count: 2 });
  }

  /** Impacto: faíscas, e no crítico o flash, a estrela e o aviso do efeito (o chamador decide o texto). */
  private strike(): void {
    this.struck = true;
    this.ribbon?.stop();
    this.glint.material.opacity = 0;
    const K = this.crit ? F.crit : F.arrow;
    const to = this.to;
    this.p.copy(to);
    placeBeam(this.streak, this.cam, _v.copy(to).addScaledVector(this.dir, -K.length), to, K.width);
    this.head.position.copy(to);
    const P = this.kit.particles;
    P.spark.emit({ pos: to, posJitter: 0.04, vel: RISE, velJitter: 1.8, life: 0.24, size: 0.07, sizeEnd: 0.01, color: rgb(K.core), colorEnd: rgb(K.trail), gravity: 5, count: K.sparks });
    P.glow.emit({ pos: to, life: 0.2, size: 0.16, sizeEnd: 0.03, color: rgb(K.core, 0.5), count: 1 });
    if (this.crit && this.star) {
      this.flashes.push(new Flash(this.group, to, rgb(F.crit.flashColor), F.crit.flashSize, F.crit.flashLife));
      this.star.position.copy(to);
      this.star.material.rotation = Math.random() * Math.PI;
      this.star.material.opacity = 1;
    }
    this.onImpact?.();
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    this.t += dt;
    const t = this.t;
    const A = F.arrow;
    const K = this.crit ? F.crit : F.arrow;
    if (!this.released) {
      // puxada: a faísca na ponta do arco cresce até a soltura
      const k = Math.min(1, t / A.drawSec);
      this.glint.scale.setScalar(0.05 + 0.15 * k);
      this.glint.material.opacity = k;
    } else if (!this.struck) {
      // voo: o risco segue o arco até o alvo
      const k = Math.min(1, (t - A.drawSec) / (this.impactAt - A.drawSec));
      this.p.lerpVectors(this.from, this.to, k);
      this.p.y += A.arc * 4 * k * (1 - k);
      this.tail.copy(this.p).addScaledVector(this.dir, -K.length);
      placeBeam(this.streak, this.cam, this.tail, this.p, K.width);
      this.streak.material.opacity = 1;
      this.head.position.copy(this.p);
      this.head.material.opacity = 1;
      this.glint.material.opacity = 0;
      this.ribbon?.push(this.p);
      this.kit.particles.glow.emit({ pos: this.p, life: 0.12, size: 0.05, sizeEnd: 0.01, color: rgb(K.trail), count: 1 });
    }
    if (this.struck) {
      // depois do impacto: o risco se apaga e a estrela cresce e some
      const f = Math.max(0, 1 - (t - this.impactAt) / A.fadeSec);
      this.streak.material.opacity = f;
      this.head.material.opacity = f;
      if (this.star) {
        const s = Math.min(1, (t - this.impactAt) / F.crit.starLife);
        this.star.scale.setScalar(F.crit.starSize + (F.crit.starSizeEnd - F.crit.starSize) * s);
        this.star.material.opacity = (1 - s) * (1 - s);
      }
    }
    for (const f of this.flashes) f.update(dt);
    if (this.struck && t >= this.impactAt + A.tailSec && this.flashes.every((f) => f.done)) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Chuva de Flechas (e Incendiária)
// ---------------------------------------------------------------------------------------------------------------

interface Shaft {
  /** flecha em queda (risco reaproveitado) */
  s: THREE.Sprite;
  /** estrela no ponto de queda */
  hit: THREE.Sprite;
  land: THREE.Vector3;
  wx: number;
  wz: number;
  /** instante em que a flecha toca o chão */
  t1: number;
  struck: boolean;
  fireAcc: number;
}

/**
 * Chuva de Flechas: uma marca de área no chão, flechas caindo do céu (um conjunto fixo, reaproveitado) e, na queda,
 * faíscas e uma estrela em cada ponto e poeira no centro. A Incendiária colore as flechas de chama, solta brasas e
 * deixa uma poça de brasas no chão. A queda termina em RainFX.IMPACT, o instante do dano.
 */
export class ArcherRainFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly tl = new Timeline();
  private readonly shafts: Shaft[] = [];
  private readonly center: THREE.Vector3;
  private readonly radius: number;
  private readonly endAt: number;
  private emberAcc = 0;
  private t = 0;

  constructor(
    private readonly kit: FxKit,
    private readonly cam: THREE.PerspectiveCamera,
    center: THREE.Vector3,
    radius: number,
    private readonly fire: boolean,
    private readonly onStrike?: () => void,
  ) {
    const K = F.rain;
    // a área é a mesma do RainFX: o raio em tiles mais meio tile de cada lado
    this.radius = radius + 0.5;
    this.center = center.clone().setY(0);
    const strikeAt = RainFX.IMPACT;
    this.endAt = strikeAt + (fire ? K.emberSec + 0.1 : K.tailSec);
    kit.decals.spawn({ kind: 'aoe', pos: this.center.clone().setY(0.03), size: this.radius * 2 * 0.9, sizeEnd: this.radius * 2, color: rgb(K.marker), life: K.markerLife, additive: true, fadeIn: 0.12, fadeOut: 0.55, spin: 0.6, opacity: K.markerOpacity });
    const streakColor = fire ? rgb(K.fireCore) : rgb(K.core);
    for (let i = 0; i < K.arrows; i++) {
      const r = this.radius * 0.95 * Math.sqrt(Math.random());
      const a = Math.random() * Math.PI * 2;
      const land = new THREE.Vector3(this.center.x + Math.cos(a) * r, 0.03, this.center.z + Math.sin(a) * r);
      const s = fxSprite(this.group, 'trace', streakColor, 1, { opacity: 0.9 });
      s.visible = false;
      const hit = fxSprite(this.group, 'impact', rgb(K.core, 0.7), K.starSize, { opacity: 0 });
      hit.position.copy(land).setY(0.05);
      hit.visible = false;
      this.shafts.push({
        s,
        hit,
        land,
        wx: K.windX * (0.8 + Math.random() * 0.4),
        wz: K.windZ * (0.8 + Math.random() * 0.4),
        t1: strikeAt + (Math.random() * 2 - 1) * 0.04,
        struck: false,
        fireAcc: Math.random() * 0.05,
      });
    }
    this.tl.at(strikeAt, () => this.strike());
  }

  /** Instante do dano: anel de choque, poeira, tremor e (na Incendiária) a poça de brasas. */
  private strike(): void {
    const K = F.rain;
    const P = this.kit.particles;
    this.kit.decals.spawn({ kind: 'ring', pos: this.center.clone().setY(0.05), size: 0.3, sizeEnd: this.radius * 2.2, color: rgb(K.ringColor, 0.5), life: K.ringLife, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    P.smoke.emit({ pos: this.center.clone().setY(0.1), posJitter: this.radius * 0.8, vel: RISE_SLOW, velJitter: 0.5, life: 0.8, size: 0.3, sizeEnd: 0.8, color: rgb(K.dustColor), alpha: 0.3, count: K.dust, spin: 0.8 });
    if (this.fire) groundCircle(this.kit, this.center, { radius: this.radius * 2, color: rgb(K.emberColor, 0.8), life: K.patchLife, kind: 'runesFire', grow: 0.75, spin: 0.4 });
    this.onStrike?.();
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    this.t += dt;
    const t = this.t;
    const K = F.rain;
    const P = this.kit.particles;
    const strikeAt = RainFX.IMPACT;
    for (const a of this.shafts) {
      const k = (t - (a.t1 - K.dropSec)) / K.dropSec;
      if (k < 0) continue;
      if (k < 1) {
        // queda: o topo fica deslocado pelo vento e a flecha acelera (altura ~ e²)
        const e = 1 - k;
        _v.set(a.land.x + a.wx * e, K.height * e * e + 0.03, a.land.z + a.wz * e);
        _w.set(-a.wx, -2 * K.height * e, -a.wz).normalize();
        a.s.visible = true;
        a.s.material.opacity = Math.min(1, k * 4) * 0.9;
        placeStreak(a.s, this.cam, _v, _w, K.length, K.width);
        if (this.fire) {
          a.fireAcc += dt;
          const step = 1 / K.fireSpawnPerSec;
          while (a.fireAcc >= step) {
            a.fireAcc -= step;
            P.fire.emit({ pos: _v, posJitter: 0.05, vel: RISE, life: 0.3, size: 0.26, sizeEnd: 0.06, color: rgb(K.fireCore), colorEnd: rgb(K.emberColor, 0.4), count: 1 });
          }
        }
      } else {
        // chão: a flecha some e a estrela de impacto cresce e apaga
        if (!a.struck) {
          a.struck = true;
          a.s.visible = false;
          a.hit.visible = true;
          P.spark.emit({ pos: a.land, posJitter: 0.06, vel: RISE, velJitter: 1.4, life: 0.24, size: 0.07, sizeEnd: 0.01, color: rgb(K.core), colorEnd: rgb(K.sparkEnd), gravity: 5, count: 2 });
        }
        const s = (t - a.t1) / K.starLife;
        if (s < 1) {
          a.hit.scale.setScalar(K.starSize + (K.starSizeEnd - K.starSize) * s);
          a.hit.material.opacity = (1 - s) * (1 - s);
        } else a.hit.visible = false;
      }
    }
    if (this.fire && t >= strikeAt && t < strikeAt + K.emberSec) {
      // brasas que sobem da poça enquanto ela arde
      this.emberAcc += dt;
      const step = 1 / K.emberRate;
      while (this.emberAcc >= step) {
        this.emberAcc -= step;
        const a = Math.random() * Math.PI * 2;
        const r = this.radius * 0.9 * Math.sqrt(Math.random());
        _v.set(this.center.x + Math.cos(a) * r, 0.1, this.center.z + Math.sin(a) * r);
        P.glow.emit({ pos: _v, vel: RISE_SLOW, velJitter: 0.3, life: 0.9, size: 0.07, sizeEnd: 0.02, color: rgb(K.emberColor), colorEnd: rgb(K.emberColor, 0.3), count: 1 });
      }
    }
    if (t >= this.endAt) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Flecha Perfurante
// ---------------------------------------------------------------------------------------------------------------

/**
 * Flecha Perfurante: a ponta acende, um risco de luz varre a linha inteira (com uma borda escura e cópias que ficam
 * para trás) e solta faíscas ao longo do caminho. No instante do acerto a linha toda acende de uma vez (todos os
 * inimigos dela são atingidos) e apaga aos poucos, com faíscas caindo.
 */
export class ArcherPierceFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly tl = new Timeline();
  private readonly dir = new THREE.Vector3();
  private readonly len: number;
  private readonly from: THREE.Vector3;
  private readonly head = new THREE.Vector3();
  private readonly tail = new THREE.Vector3();
  private readonly ghostHead = new THREE.Vector3();
  private readonly ghostTail = new THREE.Vector3();
  private readonly beam: THREE.Sprite;
  private readonly beamDark: THREE.Sprite;
  private readonly ghosts: THREE.Sprite[] = [];
  private readonly line: THREE.Sprite;
  private readonly flare: THREE.Sprite;
  private readonly ribbon?: Ribbon;
  private readonly flashes: Flash[] = [];
  private struck = false;
  private t = 0;

  constructor(
    private readonly kit: FxKit,
    private readonly cam: THREE.PerspectiveCamera,
    bow: THREE.Vector3,
    private readonly to: THREE.Vector3,
    private readonly onImpact?: () => void,
  ) {
    const P = F.pierce;
    this.dir.subVectors(to, bow).normalize();
    // o risco começa à frente do corpo da arqueira: começar sobre ele faz o brilho estourar nela
    this.from = bow.clone().addScaledVector(this.dir, P.startOffset);
    this.len = Math.max(0.01, this.from.distanceTo(to));
    this.beamDark = fxSprite(this.group, 'trace', rgb(P.dark), 1, { dark: true, renderOrder: 8, opacity: 0 });
    this.beam = fxSprite(this.group, 'trace', rgb(P.core), 1, { opacity: 0 });
    for (let i = 0; i < P.ghostOpacity.length; i++) this.ghosts.push(fxSprite(this.group, 'trace', rgb(P.ghostColor, 1 - i * 0.25), 1, { opacity: 0 }));
    this.line = fxSprite(this.group, 'trace', rgb(P.lineColor), 1, { opacity: 0 });
    this.flare = fxSprite(this.group, 'orb', rgb(P.core), 0.3, { opacity: 0 });
    this.flare.position.copy(bow);
    this.ribbon = kit.ribbons.acquire(rgb(P.trail), P.trailWidth, P.trailLife);
    this.tl.at(P.impactSec, () => this.strike());
    for (const f of P.sweepBursts) this.tl.at(P.drawSec + (P.impactSec - P.drawSec) * f, () => this.burst(f));
  }

  /** Faíscas soltas ao longo do caminho, no instante em que a cabeça passa por uma fração dele. */
  private burst(f: number): void {
    _v.lerpVectors(this.from, this.to, f);
    this.kit.particles.spark.emit({ pos: _v, posJitter: 0.08, vel: UP, velJitter: 2.2, life: 0.3, size: 0.08, sizeEnd: 0.01, color: rgb(F.pierce.core), colorEnd: rgb(F.pierce.trail), gravity: 2, count: 4 });
  }

  /** Acerto: a linha toda acende, faíscas em vários pontos dela e o flash da ponta. */
  private strike(): void {
    const P = F.pierce;
    this.struck = true;
    this.ribbon?.stop();
    // a cabeça chegou: o risco móvel e as cópias somem; a linha inteira (line) acende no lugar
    this.beam.material.opacity = 0;
    this.beamDark.material.opacity = 0;
    for (const g of this.ghosts) g.material.opacity = 0;
    this.flashes.push(new Flash(this.group, this.to, rgb(P.lineColor, 0.5), P.endFlashSize, P.endFlashLife));
    for (let j = 0; j < P.lineSparkPoints; j++) {
      _v.lerpVectors(this.from, this.to, (j + 0.5) / P.lineSparkPoints);
      this.kit.particles.spark.emit({ pos: _v, posJitter: 0.1, vel: UP, velJitter: 2.2, life: 0.4, size: 0.09, sizeEnd: 0.01, color: rgb(P.lineColor), colorEnd: rgb(P.trail), gravity: 3, count: P.lineSparks });
    }
    this.onImpact?.();
  }

  update(dt: number): void {
    if (this.done) return;
    this.tl.update(dt);
    this.t += dt;
    const t = this.t;
    const P = F.pierce;
    if (!this.struck) {
      if (t < P.drawSec) {
        // puxada: a ponta do arco acende
        const k = t / P.drawSec;
        this.flare.material.opacity = k;
        this.flare.scale.setScalar(0.1 + 0.2 * k);
      } else {
        this.flare.material.opacity = 0;
        // varredura: a cabeça percorre a linha; o risco tem uma cauda curta
        const k = Math.min(1, (t - P.drawSec) / (P.impactSec - P.drawSec));
        this.pointAt(k, this.head);
        const back = Math.min(P.beamLen, this.len * k);
        this.tail.copy(this.head).addScaledVector(this.dir, -back);
        placeBeam(this.beam, this.cam, this.tail, this.head, P.width);
        this.beam.material.opacity = 1;
        placeBeam(this.beamDark, this.cam, this.tail, this.head, P.width * 2.2);
        this.beamDark.material.opacity = 0.6;
        for (let i = 0; i < this.ghosts.length; i++) {
          const kg = Math.max(0, k - P.ghostLag[i]);
          this.pointAt(kg, this.ghostHead);
          const backG = Math.min(P.beamLen * 0.6, this.len * kg);
          this.ghostTail.copy(this.ghostHead).addScaledVector(this.dir, -backG);
          placeBeam(this.ghosts[i], this.cam, this.ghostTail, this.ghostHead, P.width * (0.9 - i * 0.15));
          this.ghosts[i].material.opacity = P.ghostOpacity[i] * (k > 0 ? 1 : 0);
        }
        this.ribbon?.push(this.head);
      }
    } else {
      // depois do impacto: a linha inteira apaga aos poucos
      const f = Math.max(0, 1 - (t - P.impactSec) / P.lineFadeSec);
      placeBeam(this.line, this.cam, this.from, this.to, P.lineWidth);
      this.line.material.opacity = f * f;
    }
    for (const f of this.flashes) f.update(dt);
    if (this.struck && t >= P.impactSec + P.tailSec && this.flashes.every((f) => f.done)) this.dispose();
  }

  private pointAt(k: number, out: THREE.Vector3): void {
    out.lerpVectors(this.from, this.to, Math.min(1, Math.max(0, k)));
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.ribbon?.stop();
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Foco do Caçador
// ---------------------------------------------------------------------------------------------------------------

/**
 * Foco do Caçador: um círculo rúnico verde gira sob a arqueira, marcas de mira orbitam em altura de peito, anéis
 * pulsam no chão e brilhos sobem. Acompanha a arqueira e dura o tempo do buff (esmaecendo no fim).
 * A posição é lida da malha da unidade (o efeito segue o personagem).
 */
export class ArcherFocusFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly orbit = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly glyph: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly ticks: THREE.Sprite[] = [];
  private readonly flashes: Flash[] = [];
  private readonly col: THREE.Color;
  private pulseAcc = 0;
  private moteAcc = 0;
  private t = 0;

  constructor(
    private readonly kit: FxKit,
    private readonly anchor: THREE.Object3D,
    private readonly life: number,
  ) {
    const C = F.focus;
    this.col = rgb(C.color);
    this.group.add(this.pivot);
    this.group.add(this.orbit);
    this.glyph = new THREE.Mesh(
      SHARED_PLANE,
      new THREE.MeshBasicMaterial({
        map: fxTexture('decal_runesFrost'),
        color: this.col.clone().multiplyScalar(0.9),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -4,
      }),
    );
    this.glyph.rotation.x = -Math.PI / 2;
    this.glyph.position.y = 0.035;
    this.glyph.scale.setScalar(C.glyphSize);
    this.glyph.renderOrder = 6;
    this.pivot.add(this.glyph);
    for (let i = 0; i < C.ticks; i++) {
      const a = (i / C.ticks) * Math.PI * 2;
      const s = fxSprite(this.orbit, 'soul', rgb(C.tickColor), C.tickSize, { opacity: 0 });
      s.position.set(Math.cos(a) * C.tickRadius, C.tickHeight, Math.sin(a) * C.tickRadius);
      this.ticks.push(s);
    }
    this.group.position.copy(anchor.position);
    // o início: anel verde no chão, flash pequeno no peito e uma rajada de brilhos
    groundCircle(kit, this.group.position, { radius: C.startRing, color: this.col.clone().multiplyScalar(0.6), life: 0.35, kind: 'ring', grow: 0.2 });
    this.flashes.push(new Flash(this.group, new THREE.Vector3(0, 1.1, 0), this.col, C.startFlashSize, C.startFlashLife));
    kit.particles.glow.emit({ pos: _v.copy(this.group.position).setY(0.3), posJitter: 0.4, vel: FOCUS_UP, velJitter: 0.6, life: 0.7, size: 0.1, sizeEnd: 0.02, color: this.col, count: 12 });
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const C = F.focus;
    this.group.position.copy(this.anchor.position);
    this.pivot.rotation.y += C.glyphSpin * dt;
    this.orbit.rotation.y += C.tickSpin * dt;
    // entra em 0,3 s e esmaece nos últimos C.fadeSec
    const left = this.life - t;
    const fade = Math.min(1, Math.max(0, left / C.fadeSec));
    this.glyph.material.opacity = 0.9 * Math.min(1, t / 0.3) * fade;
    for (const s of this.ticks) s.material.opacity = 0.95 * fade;
    for (const f of this.flashes) f.update(dt);
    // anel de mira que pulsa no chão
    this.pulseAcc += dt;
    if (this.pulseAcc >= C.pulseSec && left > C.fadeSec) {
      this.pulseAcc = 0;
      groundCircle(this.kit, this.group.position, { radius: 1.6, color: rgb(C.pulseColor), life: C.pulseLife, kind: 'ring', grow: 0.3 });
    }
    // brilhos que sobem da base
    this.moteAcc += dt;
    while (this.moteAcc >= C.moteSec) {
      this.moteAcc -= C.moteSec;
      _v.copy(this.group.position).setY(0.3);
      this.kit.particles.glow.emit({ pos: _v, posJitter: 0.35, vel: RISE_SLOW, velJitter: 0.3, life: 0.5, size: 0.07, sizeEnd: 0.02, color: this.col, count: 1 });
    }
    if (t >= this.life) this.dispose();
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    disposeFxGroup(this.group);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Armadilhas
// ---------------------------------------------------------------------------------------------------------------

/** Disparo de uma armadilha: forma e movimento próprios por tipo (valores em ARCHER_FX.trap). */
export interface TrapBurstOpts {
  kind: TrapKind | undefined;
  center: THREE.Vector3;
  radius: number;
  /** direção do leque da claymore (da arqueira para a armadilha) */
  dir: THREE.Vector3;
  /** distância da arqueira até a armadilha (a luz de apoio só acende longe dela) */
  ownerDist?: number;
  cam: THREE.PerspectiveCamera;
  shake: (amount: number) => void;
}

interface Spike {
  bright: THREE.Sprite;
  dark: THREE.Sprite;
  x: number;
  z: number;
  h: number;
}

export class ArcherTrapFX implements OneShotFx {
  readonly group = new THREE.Group();
  done = false;
  private readonly tl = new Timeline();
  private readonly kind: 'snare' | 'mine' | 'freeze' | 'claymore';
  private readonly spikes: Spike[] = [];
  private crescent?: THREE.Sprite;
  private crescentW = 0;
  private readonly flashes: Flash[] = [];
  private light?: FlickerLight;
  private readonly lifeSec: number;
  private readonly cam: THREE.PerspectiveCamera;
  private t = 0;

  constructor(
    private readonly kit: FxKit,
    private readonly o: TrapBurstOpts,
  ) {
    this.kind = o.kind ?? 'snare';
    this.cam = o.cam;
    this.lifeSec = { snare: F.trap.snare.lifeSec, mine: F.trap.mine.lifeSec, freeze: F.trap.freeze.lifeSec, claymore: F.trap.claymore.lifeSec }[this.kind];
    switch (this.kind) {
      case 'snare':
        this.buildSnare();
        break;
      case 'mine':
        this.buildMine();
        break;
      case 'freeze':
        this.buildFreeze();
        break;
      case 'claymore':
        this.buildClaymore();
        break;
    }
  }

  /** Armadilha comum: pontas de aço saltam em anel e somem; faíscas metálicas e um pouco de poeira. */
  private buildSnare(): void {
    const S = F.trap.snare;
    const c = this.o.center;
    const P = this.kit.particles;
    for (let i = 0; i < S.spikes; i++) {
      const a = (i / S.spikes) * Math.PI * 2 + 0.2;
      const x = c.x + Math.cos(a) * S.spikeRadius;
      const z = c.z + Math.sin(a) * S.spikeRadius;
      const dark = fxSprite(this.group, 'trace', rgb([0.12, 0.1, 0.08]), S.spikeWidth * 2.4, { dark: true, renderOrder: 8 });
      const bright = fxSprite(this.group, 'trace', rgb(S.sparkColor), S.spikeWidth, { renderOrder: 9 });
      this.spikes.push({ bright, dark, x, z, h: S.spikeHeight * (0.85 + Math.random() * 0.3) });
    }
    P.spark.emit({ pos: c.clone().setY(0.15), posJitter: 0.1, vel: UP, velJitter: 2.2, life: 0.35, size: 0.07, sizeEnd: 0.01, color: rgb(S.sparkColor), colorEnd: rgb(S.ringColor, 0.5), gravity: 9, count: S.sparks });
    groundCircle(this.kit, c, { radius: S.ringSize, color: rgb(S.ringColor, 0.6), life: 0.22, kind: 'ring', grow: 0.3 });
    P.smoke.emit({ pos: c.clone().setY(0.1), posJitter: 0.15, vel: RISE, velJitter: 0.3, life: 0.45, size: 0.22, sizeEnd: 0.5, color: rgb([0.5, 0.45, 0.38]), alpha: 0.35, count: S.dust, drag: 1.5 });
  }

  /** Mina Terrestre: flash, bola de fogo, anel de choque, estilhaços e uma fumaça que sobe; marca de queimado. */
  private buildMine(): void {
    const M = F.trap.mine;
    const c = this.o.center;
    const R = this.o.radius;
    const P = this.kit.particles;
    this.flashes.push(new Flash(this.group, c.clone().setY(0.4), rgb(M.flashColor), M.flashSize + M.flashSizePerRadius * R, M.flashLife));
    P.fire.emit({ pos: c.clone().setY(0.2), posJitter: R * 0.35, vel: RISE_FIRE, velJitter: M.fireUp * 0.7, life: 0.55, size: 0.5, sizeEnd: 0.1, color: rgb(M.fireColor), colorEnd: rgb(M.fireEnd), count: M.fire });
    this.kit.decals.spawn({ kind: 'ring', pos: c.clone().setY(0.05), size: 0.4, sizeEnd: R * M.ringGrow, color: rgb(M.ringColor, 0.6), life: 0.45, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    P.spark.emit({ pos: c.clone().setY(0.2), posJitter: 0.2, vel: UP, velJitter: 3.2, life: 0.7, size: 0.09, sizeEnd: 0.02, color: rgb(M.debrisColor), colorEnd: rgb(M.debrisEnd), gravity: 9, drag: 0.6, count: M.debris });
    this.kit.decals.spawn({ kind: 'scorch', pos: c.clone().setY(0.03), size: (R * 2 + 1) * 1.05, color: new THREE.Color(1, 1, 1), life: M.scorchLife, fadeIn: 0.02, fadeOut: 0.3, dissolve: true, opacity: 0.85 });
    this.o.shake(M.shake);
    this.tl.at(M.ring2Sec, () => {
      this.kit.decals.spawn({ kind: 'ring', pos: c.clone().setY(0.05), size: R * 1.2, sizeEnd: R * M.ring2Grow, color: rgb(M.ringColor, 0.35), life: 0.35, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
      P.smoke.emit({ pos: c.clone().setY(0.4), posJitter: R * 0.5, vel: UP, velJitter: 0.9, life: 1.3, size: 0.5, sizeEnd: 1.3, color: rgb(M.smokeColor), alpha: 0.5, count: M.smoke, drag: 0.8, spin: 0.8 });
    });
  }

  /** Congelante: marca de geada, anel de cristais que sobe, névoa fria e brilhos que caem. */
  private buildFreeze(): void {
    const Z = F.trap.freeze;
    const c = this.o.center;
    const R = this.o.radius;
    const P = this.kit.particles;
    this.kit.decals.spawn({ kind: 'frost', pos: c.clone().setY(0.03), size: (R * 2 + 1) * 1.1, color: new THREE.Color(1, 1, 1), life: Z.frostLife, fadeIn: 0.05, fadeOut: 0.4, dissolve: true, opacity: Z.frostOpacity });
    this.kit.decals.spawn({ kind: 'ring', pos: c.clone().setY(0.05), size: 0.3, sizeEnd: R * Z.ringGrow, color: rgb(Z.ringColor, 0.6), life: 0.5, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    for (let i = 0; i < Z.shards; i++) {
      const a = (i / Z.shards) * Math.PI * 2 + Math.random() * 0.2;
      const r = Z.shardRadius * R * (0.9 + Math.random() * 0.2);
      const dark = fxSprite(this.group, 'trace', rgb(Z.shardDark), Z.shardWidth * 2.6, { dark: true, renderOrder: 8 });
      const bright = fxSprite(this.group, 'trace', rgb(Z.shardColor), Z.shardWidth, { renderOrder: 9 });
      this.spikes.push({ bright, dark, x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, h: Z.shardMinH + Math.random() * (Z.shardMaxH - Z.shardMinH) });
    }
    P.smoke.emit({ pos: c.clone().setY(0.2), posJitter: R * 0.6, vel: RISE, velJitter: 0.6, life: 1.2, size: 0.4, sizeEnd: 1.1, color: rgb(Z.mistColor), alpha: 0.45, count: Z.mist, drag: 1.2, spin: 0.6 });
    this.tl.at(0.15, () => P.spark.emit({ pos: c.clone().setY(0.4), posJitter: R * 0.6, vel: RISE, velJitter: 1.8, life: 0.8, size: 0.1, sizeEnd: 0.02, color: rgb(Z.sparkColor), colorEnd: rgb(Z.sparkEnd), gravity: 2, count: Z.sparks }));
    this.o.shake(Z.shake);
  }

  /** Claymore: leque de fogo na direção da trilha, crescente de chama, explosão grande e marca de queimado. */
  private buildClaymore(): void {
    const K = F.trap.claymore;
    const c = this.o.center;
    const R = this.o.radius;
    const P = this.kit.particles;
    const dir = this.o.dir;
    // leque: jatos de fogo e de faíscas espalhados em torno da direção
    for (let i = 0; i < K.fanRays; i++) {
      const a = (K.fanRays <= 1 ? 0 : (i - (K.fanRays - 1) / 2) * ((K.fanSpread * 2) / (K.fanRays - 1)));
      _fan.copy(dir).applyAxisAngle(UP, a);
      P.fire.emit({ pos: c.clone().setY(0.25), posJitter: 0.2, vel: _fan.clone().multiplyScalar(K.fanSpeed), velJitter: 0.6, life: 0.5, size: 0.55, sizeEnd: 0.1, color: rgb(K.fanColor), colorEnd: rgb(K.fanEnd), count: K.fanPerRay });
      P.spark.emit({ pos: c.clone().setY(0.3), vel: _fan.clone().multiplyScalar(K.fanSparkSpeed), velJitter: 1.0, life: 0.45, size: 0.1, sizeEnd: 0.01, color: rgb(K.fanSparkColor), colorEnd: rgb(K.fanColor, 0.5), gravity: 4, count: K.fanSparksPerRay });
    }
    // crescente de chama na frente do leque (o arco aponta para onde o leque vai)
    const size = R * K.crescentSize;
    const crescent = fxSprite(this.group, 'slash', rgb(K.crescentColor), size, { opacity: 1 });
    this.crescent = crescent;
    this.crescentW = size;
    crescent.position.copy(c).addScaledVector(dir, R * 0.6).setY(0.45);
    _t.copy(c).addScaledVector(dir, 1);
    crescent.material.rotation = screenAngle(this.cam, c, _t) - Math.PI / 2;
    crescent.scale.set(size, size * 0.5, 1);
    // explosão: flash pequeno, anel grande, coluna de fogo e fumaça
    this.flashes.push(new Flash(this.group, c.clone().setY(0.5), rgb(K.flashColor), K.flashSize + K.flashSizePerRadius * R, K.flashLife));
    this.kit.decals.spawn({ kind: 'ring', pos: c.clone().setY(0.05), size: 0.5, sizeEnd: R * K.ringGrow, color: rgb(K.ringColor, 0.6), life: 0.5, additive: true, fadeIn: 0.01, fadeOut: 0.7 });
    P.fire.emit({ pos: c.clone().setY(0.2), posJitter: R * 0.4, vel: RISE_FIRE, velJitter: 2.2, life: 0.65, size: 0.6, sizeEnd: 0.12, color: rgb(K.fireColor), colorEnd: rgb(K.fireEnd), count: K.fire });
    this.kit.decals.spawn({ kind: 'scorch', pos: c.clone().setY(0.03), size: (R * 2 + 1.2) * 1.05, color: new THREE.Color(1, 1, 1), life: K.scorchLife, fadeIn: 0.02, fadeOut: 0.3, dissolve: true, opacity: 0.85 });
    this.tl.at(0.1, () => P.smoke.emit({ pos: c.clone().setY(0.4), posJitter: R * 0.5, vel: UP, velJitter: 0.9, life: 1.4, size: 0.6, sizeEnd: 1.5, color: rgb(K.smokeColor), alpha: 0.55, count: K.smoke, spin: 0.8 }));
    this.o.shake(K.shake);
    this.kit.hitStop(K.hitStop);
    // luz de apoio só se a explosão estiver longe da arqueira (perto dela, a luz estoura o traje escuro)
    if (this.o.ownerDist === undefined || this.o.ownerDist >= K.lightMinDist) {
      this.light = new FlickerLight(this.kit.stage, K.lightColor, K.lightIntensity, K.lightDistance, 0.3);
      this.light.set(c.clone().setY(0.8));
    }
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.tl.update(dt);
    const t = this.t;
    this.animateSpikes(t);
    if (this.crescent) {
      // a crescente abre um pouco e some
      const K = F.trap.claymore;
      const k = Math.min(1, t / K.crescentFadeSec);
      this.crescent.material.opacity = (1 - k) * (1 - k);
      const g = 0.8 + 0.2 * Math.min(1, t / 0.3);
      this.crescent.scale.set(this.crescentW * g, this.crescentW * 0.5 * g, 1);
    }
    for (const f of this.flashes) f.update(dt);
    this.light?.update(dt, Math.max(0, 1 - t / 0.8));
    if (t >= this.lifeSec && this.flashes.every((f) => f.done)) this.dispose();
  }

  /** Pontas (armadilha) e cristais (congelante): saltam, ficam um instante e afundam ao sumir. */
  private animateSpikes(t: number): void {
    if (!this.spikes.length) return;
    const isSnare = this.kind === 'snare';
    const pop = isSnare ? F.trap.snare.popSec : 0.16;
    const hold = isSnare ? F.trap.snare.holdSec : 0.7;
    const life = isSnare ? F.trap.snare.lifeSec : 1.1;
    for (const s of this.spikes) {
      const up = Math.min(1, t / pop);
      const grow = Math.sin((up * Math.PI) / 2);
      const sink = Math.min(1, Math.max(0, (t - hold) / (life - hold)));
      const h = s.h * grow * (1 - 0.5 * sink);
      const alpha = t < life ? 1 - sink * sink : 0;
      s.bright.position.set(s.x, h / 2, s.z);
      s.bright.scale.y = Math.max(0.001, h);
      s.bright.material.opacity = alpha;
      s.dark.position.set(s.x, h / 2, s.z);
      s.dark.scale.y = Math.max(0.001, h * 1.02);
      s.dark.material.opacity = alpha * 0.8;
    }
  }

  private dispose(): void {
    if (this.done) return;
    this.done = true;
    this.light?.release();
    disposeFxGroup(this.group);
  }
}
