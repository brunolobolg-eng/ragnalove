import * as THREE from 'three';
import { ANIM_CONFIG } from '../../../../config/animConfig';
import { curveStride, splitClip, type ActionClip, type AnimSet, type LocoClip } from './AnimSet';

/**
 * Controlador de animação de um personagem 3D (só visual: lê o que a simulação já decidiu).
 *
 * Camadas, de baixo para cima:
 *  1. Locomoção: parado/andar/correr/disparar misturados pela velocidade REAL do boneco na tela;
 *     a cadência é ajustada para a passada bater com o deslocamento (pés não patinam) e os laços
 *     ficam em fase (o mesmo pé à frente) para a mistura não cruzar as pernas.
 *  2. Ação: golpe, magia, reação, cambaleio, knockback ou morte, com prioridade. Andando, golpes e
 *     magias tocam só no tronco e braços (as pernas seguem a caminhada).
 *  3. Física por cima do clipe: tranco direcional no dano, quadril empurrado, braços soltos,
 *     inclinação ao acelerar/frear/virar. Molas dão peso e recuperação natural.
 *
 * Eventos (para sincronizar dano, partículas, som e câmera):
 *   attackStart → attackImpact → attackEnd · castStart → castRelease → castEnd
 */
export type ActionKind = 'attack' | 'heavy' | 'cast' | 'hitLight' | 'hitMedium' | 'stagger' | 'knockback' | 'death';
export type AnimEventType = 'attackStart' | 'attackImpact' | 'attackEnd' | 'castStart' | 'castRelease' | 'castEnd' | 'reactStart' | 'reactEnd' | 'death';
export interface AnimEvent {
  type: AnimEventType;
  kind: ActionKind;
  /** a ação foi cortada por outra de prioridade maior */
  interrupted?: boolean;
}

export type HitSeverity = 'light' | 'medium' | 'heavy';

export interface PlayOptions {
  /** impacto exatamente neste tempo (s): a ação acelera/desacelera para casar com um efeito visual */
  impactAt?: number;
  /** combo: força um golpe específico (índice em AnimSet.attacks) */
  variant?: number;
}

/** Mola amortecida (rigidez k, amortecimento c): tranco com peso e volta natural. */
class Spring {
  x = 0;
  v = 0;
  constructor(
    public k: number,
    public c: number,
  ) {}
  /** Empurrão cujo pico de deslocamento é `peak` (compensa rigidez e amortecimento). */
  kick(peak: number): void {
    const wn = Math.sqrt(this.k);
    const z = Math.min(0.95, this.c / (2 * wn));
    const wd = Math.sqrt(1 - z * z);
    const tPeak = Math.atan2(wd, z) / (wn * wd);
    this.v += (peak * wn * wd) / (Math.exp(-z * wn * tPeak) * Math.sin(wd * wn * tPeak));
  }
  step(dt: number, target = 0): number {
    // passos curtos: estável mesmo com quadros longos
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (-this.k * (this.x - target) - this.c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

interface Playing {
  kind: ActionKind;
  spec: ActionClip;
  full: THREE.AnimationAction;
  upper: THREE.AnimationAction;
  /** 0 = corpo inteiro, 1 = só tronco/braços (andando) */
  upperMix: number;
  allowUpper: boolean;
  time: number;
  rate: number;
  weight: number;
  fade: number; // velocidade da mistura (peso/s); negativa = saindo
  impactFired: boolean;
  ended: boolean;
  priority: number;
  maxWeight: number;
}

/** Velocidade "parada" do mixer: o tempo é posto à mão, mas a ação continua ativa (timeScale 0 a desativa). */
const FROZEN = 1e-6;
const D2R = Math.PI / 180;
const PRIORITY = ANIM_CONFIG.priority;
const START: Partial<Record<ActionKind, AnimEventType>> = { attack: 'attackStart', heavy: 'attackStart', cast: 'castStart', hitLight: 'reactStart', hitMedium: 'reactStart', stagger: 'reactStart', knockback: 'reactStart', death: 'death' };
const IMPACT: Partial<Record<ActionKind, AnimEventType>> = { attack: 'attackImpact', heavy: 'attackImpact', cast: 'castRelease' };
const END: Partial<Record<ActionKind, AnimEventType>> = { attack: 'attackEnd', heavy: 'attackEnd', cast: 'castEnd', hitLight: 'reactEnd', hitMedium: 'reactEnd', stagger: 'reactEnd', knockback: 'reactEnd' };
const prio = (k: ActionKind) => (k === 'heavy' ? PRIORITY.attack : k === 'hitLight' ? PRIORITY.hitLight : k === 'hitMedium' ? PRIORITY.hitMedium : PRIORITY[k]);

/** Ossos com nomes do esqueleto padrão ou do esqueleto "Hips/Spine" (modelos importados). */
const ALIASES: Record<string, string[]> = {
  hips: ['hips', 'Hips'],
  spine: ['spine', 'Spine'],
  chest: ['chest', 'Chest'],
  neck: ['neck', 'Neck'],
  head: ['head', 'Head'],
  armL: ['upperArm.L', 'UpperArm_L'],
  armR: ['upperArm.R', 'UpperArm_R'],
};

const splitCache = new WeakMap<THREE.AnimationClip, { upper: THREE.AnimationClip; lower: THREE.AnimationClip }>();
function parts(clip: THREE.AnimationClip) {
  let s = splitCache.get(clip);
  if (!s) splitCache.set(clip, (s = { upper: splitClip(clip, 'upper'), lower: splitClip(clip, 'lower') }));
  return s;
}

interface LocoLayer {
  loco?: LocoClip;
  upper: THREE.AnimationAction;
  lower: THREE.AnimationAction;
  weight: number;
}

export class AnimController {
  readonly mixer: THREE.AnimationMixer;
  onEvent?: (e: AnimEvent) => void;
  private readonly layers: { idle: LocoLayer; walk: LocoLayer; run?: LocoLayer; sprint?: LocoLayer };
  private readonly moving: LocoLayer[];
  private active: Playing[] = [];
  private pending?: { kind: ActionKind; opts: PlayOptions; wait: number };
  private phase = 0;
  private idleTime = 0;
  private speed = 0; // pernas/s, suavizado
  private accel = 0;
  private moveMix = 0; // 0 parado .. 1 andando (para a camada de cima)
  private comboIndex = 0;
  private sinceAttack = 99;
  private readonly bones: Partial<Record<keyof typeof ALIASES, THREE.Bone>> = {};
  /** pose de descanso dos ossos que a física mexe (restaurada antes do mixer: nada acumula) */
  private readonly rest: { b: THREE.Bone; q: THREE.Quaternion }[] = [];
  // física por cima do clipe
  private readonly flinchP = new Spring(ANIM_CONFIG.hit.stiffness, ANIM_CONFIG.hit.damping);
  private readonly flinchR = new Spring(ANIM_CONFIG.hit.stiffness, ANIM_CONFIG.hit.damping);
  private readonly headP = new Spring(90, 9);
  private readonly headR = new Spring(90, 9);
  private readonly hipX = new Spring(ANIM_CONFIG.hit.stiffness, ANIM_CONFIG.hit.damping);
  private readonly hipZ = new Spring(ANIM_CONFIG.hit.stiffness, ANIM_CONFIG.hit.damping);
  private readonly flail = new Spring(70, 7);
  private readonly leanP = new Spring(60, 14);
  private readonly leanR = new Spring(60, 14);
  /** empurrão visual (mundo, x/z) de golpes fortes sem deslocamento na grade */
  private readonly pushX = new Spring(ANIM_CONFIG.knockback.returnStiffness, ANIM_CONFIG.knockback.returnDamping);
  private readonly pushZ = new Spring(ANIM_CONFIG.knockback.returnStiffness, ANIM_CONFIG.knockback.returnDamping);
  readonly bodyOffset = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private dead = false;

  constructor(
    root: THREE.Object3D,
    private readonly set: AnimSet,
    bonesByName: Map<string, THREE.Bone>,
    randomStart = true,
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [k, names] of Object.entries(ALIASES) as [keyof typeof ALIASES, string[]][]) {
      const b = names.map((n) => bonesByName.get(n)).find(Boolean);
      if (b) {
        this.bones[k] = b;
        this.rest.push({ b, q: b.quaternion.clone() });
      }
    }
    const layer = (clip: THREE.AnimationClip | undefined, loco?: LocoClip): LocoLayer | undefined => {
      if (!clip) return undefined;
      const p = parts(clip);
      const upper = this.mixer.clipAction(p.upper);
      const lower = this.mixer.clipAction(p.lower);
      for (const a of [upper, lower]) {
        a.play();
        a.setEffectiveWeight(0);
        a.timeScale = FROZEN; // o tempo dos laços é posto à mão (fase sincronizada)
      }
      return { loco, upper, lower, weight: 0 };
    };
    this.layers = {
      idle: layer(set.idle)!,
      walk: layer(set.walk.clip, set.walk)!,
      run: layer(set.run?.clip, set.run),
      sprint: layer(set.sprint?.clip, set.sprint),
    };
    this.layers.idle.weight = 1;
    this.moving = [this.layers.walk, this.layers.run, this.layers.sprint].filter(Boolean) as LocoLayer[];
    if (randomStart) {
      this.idleTime = Math.random() * set.idle.duration; // horda fora de sincronia
      this.phase = Math.random();
    }
  }

  /** Há golpe/magia em andamento (antes do fim da recuperação)? */
  get busy(): boolean {
    return this.active.some((p) => !p.ended && p.time < p.spec.recover && (p.kind === 'attack' || p.kind === 'heavy' || p.kind === 'cast'));
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Andar no lugar (retratos/marcadores): velocidade em pernas/s; undefined = a velocidade real. */
  inPlaceSpeed?: number;

  /** Duração (s) de um ciclo de passos andando no lugar na velocidade da caminhada (laço perfeito). */
  get walkLoopSeconds(): number {
    const L = ANIM_CONFIG.locomotion;
    const w = this.set.walk;
    const rate = THREE.MathUtils.clamp((L.walkAt / w.stride) * w.clip.duration, L.minRate, L.maxRate);
    return w.clip.duration / rate;
  }

  /** Estado interno (Laboratório de animações). */
  debugInfo(): Record<string, number | string> {
    const w = (l?: LocoLayer) => Math.round((l?.weight ?? 0) * 100) / 100;
    return { curves: this.set.curves.map((c) => c.table.map((x) => Math.round(x * 100) / 100).join('/')).join(' | ') as string, speed: Math.round(this.speed * 100) / 100, idle: w(this.layers.idle), walk: w(this.layers.walk), run: w(this.layers.run), sprint: w(this.layers.sprint), walkStride: this.set.walk.stride, runStride: this.set.run?.stride ?? 0, leg: this.set.legLength, phaseRate: this.lastRate };
  }
  private lastRate = 0;

  /** Duração (s) do clipe de morte — o corpo fica caído depois disso. */
  get deathDuration(): number {
    return this.set.death.clip.duration;
  }

  /** Quanto falta (s) até o impacto do golpe que `play` tocaria agora (sincroniza o dano visual antes de tocar). */
  previewImpact(kind: ActionKind, opts: PlayOptions = {}): number {
    const spec = this.specFor(kind, opts, false);
    return spec.impact / this.rateFor(kind, spec, opts);
  }

  /** Toca uma ação. Devolve o tempo (s) até o impacto/lançamento (0 se não houver). */
  play(kind: ActionKind, opts: PlayOptions = {}): number {
    if (this.dead) return 0;
    const top = this.top();
    if (top && !this.canInterrupt(top, kind)) {
      // golpe/magia durante um cambaleio: espera o tempo mínimo de cambaleio e entra em seguida
      if ((kind === 'attack' || kind === 'heavy' || kind === 'cast') && (top.kind === 'stagger' || top.kind === 'knockback')) {
        const wait = Math.max(0, ANIM_CONFIG.hit.minStagger - top.time / top.rate);
        this.pending = { kind, opts, wait };
        return wait + this.previewImpact(kind, opts);
      }
      return 0;
    }
    return this.start(kind, opts);
  }

  /** Reação ao dano: `dir` = direção do empurrão no espaço do personagem (x = esquerda, z = frente). */
  hit(severity: HitSeverity, dir: THREE.Vector2, head = false): void {
    if (this.dead) return;
    const H = ANIM_CONFIG.hit;
    const ang = H.flinchDeg[severity] * D2R;
    const len = dir.length() || 1;
    const dx = dir.x / len;
    const dz = dir.y / len;
    // tronco vai junto com o golpe (frente → para trás; lado → tomba para o lado)
    this.flinchP.kick(dz * ang);
    this.flinchR.kick(-dx * ang);
    this.hipX.kick(dx * H.push[severity]);
    this.hipZ.kick(dz * H.push[severity]);
    this.flail.kick(H.armFlailDeg[severity] * D2R);
    if (severity === 'heavy') this.play('stagger');
    else if (severity === 'medium') this.play('hitMedium', { variant: head ? 1 : 0 });
    else this.play('hitLight', { variant: head ? 1 : 0 });
  }

  /** Empurrão: `world` = direção (mundo, x/z); `displaced` = a simulação moveu o personagem de tile. */
  knockback(local: THREE.Vector2, world: THREE.Vector2, displaced: boolean): void {
    if (this.dead) return;
    const K = ANIM_CONFIG.knockback;
    const len = local.length() || 1;
    this.flinchP.kick((local.y / len) * K.leanDeg * D2R);
    this.flinchR.kick((-local.x / len) * K.leanDeg * D2R);
    this.flail.kick(K.armFlailDeg * D2R);
    if (!displaced) {
      const wl = world.length() || 1;
      this.pushX.kick((world.x / wl) * K.visualPush);
      this.pushZ.kick((world.y / wl) * K.visualPush);
    }
    this.play('knockback');
  }

  update(dt: number, worldSpeed: number, yawRate: number, scale: number): void {
    const L = ANIM_CONFIG.locomotion;
    // velocidade em pernas/s (personagem de perna longa anda "mais devagar" para o mesmo deslocamento)
    const leg = Math.max(0.02, this.set.legLength * scale);
    const raw = this.dead ? 0 : (this.inPlaceSpeed ?? worldSpeed / leg);
    const prev = this.speed;
    this.speed += (raw - this.speed) * Math.min(1, dt * L.speedResponse);
    this.accel += ((dt > 0 ? (this.speed - prev) / dt : 0) - this.accel) * Math.min(1, dt * 6);
    const movingNow = this.speed > L.stopBelow;
    this.moveMix = THREE.MathUtils.clamp(this.moveMix + (movingNow ? dt : -dt) / L.fade, 0, 1);
    this.sinceAttack += dt;

    if (this.pending) {
      this.pending.wait -= dt;
      const top = this.top();
      if (this.pending.wait <= 0 || !top || this.canInterrupt(top, this.pending.kind)) {
        const p = this.pending;
        this.pending = undefined;
        this.start(p.kind, p.opts);
      }
    }

    this.updateLocomotion(dt);
    this.updateActions(dt);
    for (const r of this.rest) r.b.quaternion.copy(r.q); // (a posição não é restaurada: o clipe a controla)
    this.mixer.update(dt);
    this.applyPhysics(dt, yawRate);
  }

  // ---------------------------------------------------------------------------

  private top(): Playing | undefined {
    let best: Playing | undefined;
    for (const p of this.active) if (!p.ended && p.fade >= 0 && (!best || p.priority > best.priority)) best = p;
    return best;
  }

  private canInterrupt(cur: Playing, kind: ActionKind): boolean {
    if (cur.kind === 'death') return false;
    const pNew = prio(kind);
    if (pNew >= cur.priority) return true;
    // terminou o golpe útil: a recuperação pode ser cortada por qualquer ação
    if (cur.time >= cur.spec.recover) return true;
    // reação leve/média não segura golpe nem magia
    return (cur.kind === 'hitLight' || cur.kind === 'hitMedium') && pNew > PRIORITY.hitLight;
  }

  private specFor(kind: ActionKind, opts: PlayOptions, advance: boolean): ActionClip {
    const S = this.set;
    switch (kind) {
      case 'attack': {
        if (this.sinceAttack > ANIM_CONFIG.combo.resetAfter) this.comboIndex = 0;
        const i = (opts.variant ?? this.comboIndex) % S.attacks.length;
        if (advance) this.comboIndex = i + 1;
        return S.attacks[i];
      }
      case 'heavy':
        return S.heavy;
      case 'cast':
        return S.cast;
      case 'hitLight':
      case 'hitMedium':
        return opts.variant === 1 ? S.hitHead : S.hitFront;
      case 'stagger':
      case 'knockback':
        return S.stagger;
      case 'death':
        return S.death;
    }
  }

  /** Velocidade da ação: só golpes e magias são ajustados para o impacto; reações e morte tocam no tempo natural. */
  private rateFor(kind: ActionKind, spec: ActionClip, opts: PlayOptions): number {
    if (!IMPACT[kind]) return 1;
    if (opts.impactAt !== undefined && opts.impactAt > 0 && spec.impact > 0) return THREE.MathUtils.clamp(spec.impact / opts.impactAt, 0.5, 3);
    return spec.impact > spec.maxImpactDelay ? spec.impact / spec.maxImpactDelay : 1;
  }

  private start(kind: ActionKind, opts: PlayOptions): number {
    const spec = this.specFor(kind, opts, kind === 'attack');
    if (kind === 'attack' || kind === 'heavy') this.sinceAttack = 0;
    const rate = this.rateFor(kind, spec, opts);
    const fadeIn = Math.max(0.02, spec.fadeIn);
    // o que estava tocando sai cruzando com a nova ação (impacto forte corta quase na hora)
    for (const p of this.active) {
      if (p.fade >= 0) p.fade = -1 / fadeIn;
      if (!p.ended) this.finish(p, true);
    }
    const sp = parts(spec.clip);
    const full = this.mixer.clipAction(spec.clip);
    const upper = this.mixer.clipAction(sp.upper);
    // a mesma ação ainda saindo (combo repetido): reaproveita
    this.active = this.active.filter((p) => p.full !== full);
    for (const a of [full, upper]) {
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = FROZEN; // tempo controlado aqui (eventos exatos)
      a.setEffectiveWeight(0);
      a.play();
    }
    const allowUpper = kind === 'attack' || kind === 'heavy' || kind === 'cast' || kind === 'hitLight' || kind === 'hitMedium';
    const p: Playing = {
      kind,
      spec,
      full,
      upper,
      upperMix: allowUpper ? this.moveMix : 0,
      allowUpper,
      time: 0,
      rate,
      weight: 0,
      fade: 1 / fadeIn,
      impactFired: false,
      ended: false,
      priority: prio(kind),
      // reação leve não toma o corpo todo: soma ao que já está tocando
      maxWeight: kind === 'hitLight' ? 0.65 : 1,
    };
    this.active.push(p);
    if (kind === 'death') this.dead = true;
    const ev = START[kind];
    if (ev) this.onEvent?.({ type: ev, kind });
    return IMPACT[kind] ? spec.impact / rate : 0;
  }

  private finish(p: Playing, interrupted: boolean): void {
    if (p.ended) return;
    p.ended = true;
    if (!p.impactFired && IMPACT[p.kind]) {
      p.impactFired = true;
      this.onEvent?.({ type: IMPACT[p.kind]!, kind: p.kind, interrupted: true });
    }
    const ev = END[p.kind];
    if (ev) this.onEvent?.({ type: ev, kind: p.kind, interrupted });
  }

  private updateActions(dt: number): void {
    for (const p of this.active) {
      const prevT = p.time;
      p.time = Math.min(p.spec.clip.duration, p.time + dt * p.rate);
      if (!p.impactFired && IMPACT[p.kind] && p.time >= p.spec.impact && prevT < p.spec.impact + 1e-6) {
        p.impactFired = true;
        this.onEvent?.({ type: IMPACT[p.kind]!, kind: p.kind });
      }
      // fim: sai misturando no final do clipe (morte fica no último quadro)
      if (p.kind !== 'death' && p.fade > 0 && p.time >= p.spec.clip.duration - p.spec.fadeOut * p.rate) p.fade = -1 / Math.max(0.05, p.spec.fadeOut);
      // depois do golpe útil, começar a andar encerra a recuperação (transição natural para a caminhada)
      if (p.kind !== 'death' && p.fade > 0 && p.time >= p.spec.recover && this.moveMix > 0.5 && !p.allowUpper) p.fade = -1 / 0.2;
      p.weight = THREE.MathUtils.clamp(p.weight + p.fade * dt, 0, p.maxWeight);
      if (p.allowUpper) p.upperMix += ((this.moveMix > 0.5 ? 1 : 0) - p.upperMix) * Math.min(1, dt * 8);
      if (p.fade < 0 && !p.ended && p.time >= p.spec.clip.duration - 1e-4) this.finish(p, false);
      p.full.time = p.time;
      p.upper.time = p.time;
    }
    // removidas: as que já sumiram
    for (const p of this.active)
      if (p.fade < 0 && p.weight <= 0) {
        this.finish(p, p.time < p.spec.clip.duration - 1e-3);
        p.full.stop();
        p.upper.stop();
      }
    this.active = this.active.filter((p) => !(p.fade < 0 && p.weight <= 0));
    for (const p of this.active) {
      p.full.setEffectiveWeight(p.weight * (1 - p.upperMix));
      p.upper.setEffectiveWeight(p.weight * p.upperMix);
    }
  }

  private updateLocomotion(dt: number): void {
    const L = ANIM_CONFIG.locomotion;
    const s = this.speed;
    // pesos pela velocidade: parado → andar → correr → disparar (interpolação linear entre as âncoras)
    const anchors: [LocoLayer, number][] = [[this.layers.idle, 0], [this.layers.walk, L.walkAt]];
    if (this.layers.run) anchors.push([this.layers.run, L.runAt]);
    if (this.layers.sprint) anchors.push([this.layers.sprint, L.sprintAt]);
    const target = new Map<LocoLayer, number>(anchors.map(([l]) => [l, 0]));
    const eff = s < L.stopBelow ? 0 : s;
    if (eff <= 0) target.set(this.layers.idle, 1);
    else if (eff >= anchors[anchors.length - 1][1]) target.set(anchors[anchors.length - 1][0], 1);
    else
      for (let i = 0; i < anchors.length - 1; i++) {
        const [a, sa] = anchors[i];
        const [b, sb] = anchors[i + 1];
        if (eff >= sa && eff <= sb) {
          const w = (eff - sa) / (sb - sa);
          target.set(a, 1 - w);
          target.set(b, w);
          break;
        }
      }
    // a saída do parado é suavizada (evita "piscar" entre passos)
    const k = Math.min(1, dt / L.fade);
    let sum = 0;
    for (const [l, w] of target) sum += l.weight += (w - l.weight) * k;
    // soma 1: abaixo disso o mixer misturaria com a pose de descanso (braços caídos)
    for (const l of target.keys()) l.weight /= sum || 1;

    // cadência: a passada da mistura (medida no esqueleto) deve cobrir exatamente o deslocamento
    let wm = 0;
    let dom: LocoLayer | undefined;
    for (const l of this.moving) {
      wm += l.weight;
      if (!dom || l.weight > dom.weight) dom = l;
    }
    if (wm > 1e-3 && dom) {
      const stride = this.blendStride();
      let freq = s / stride; // ciclos por segundo
      const dur = dom.loco!.clip.duration;
      freq = THREE.MathUtils.clamp(freq * dur, L.minRate, L.maxRate) / dur;
      // parando: os pés terminam o passo devagar em vez de congelar no ar
      if (s < L.stopBelow) freq = Math.min(freq, 0.6 / dur);
      this.phase = (this.phase + freq * dt) % 1;
      this.lastRate = Math.round(freq * dom.loco!.clip.duration * 100) / 100;
    }
    this.idleTime = (this.idleTime + dt) % this.set.idle.duration;

    // cobertura das ações: corpo inteiro tira as pernas da locomoção; só-tronco tira só a parte de cima
    let coverFull = 0;
    let coverUpper = 0;
    for (const p of this.active) {
      coverFull += p.weight * (1 - p.upperMix);
      coverUpper += p.weight;
    }
    coverFull = Math.min(1, coverFull);
    coverUpper = Math.min(1, coverUpper);
    for (const l of [this.layers.idle, ...this.moving]) {
      if (l === this.layers.idle) {
        l.upper.time = l.lower.time = this.idleTime;
      } else {
        const d = l.loco!.clip.duration;
        l.upper.time = l.lower.time = (((this.phase + l.loco!.phase) % 1) + 1) % 1 * d;
      }
      l.lower.setEffectiveWeight(l.weight * (1 - coverFull));
      l.upper.setEffectiveWeight(l.weight * (1 - coverUpper));
    }
  }

  /** Passada da mistura atual: o par de laços vizinhos com mais peso, pela tabela medida. */
  private blendStride(): number {
    let best = this.set.walk.stride;
    let bestW = -1;
    const layerOf = (lc: LocoClip) => this.moving.find((l) => l.loco === lc) ?? (lc.clip === this.set.idle ? this.layers.idle : undefined);
    for (const c of this.set.curves) {
      const la = layerOf(c.a);
      const lb = layerOf(c.b);
      const wa = la?.weight ?? 0;
      const wb = lb?.weight ?? 0;
      if (wa + wb > bestW) {
        bestW = wa + wb;
        best = curveStride(c, wa + wb > 1e-4 ? wb / (wa + wb) : 0);
      }
    }
    return best;
  }

  private applyPhysics(dt: number, yawRate: number): void {
    const L = ANIM_CONFIG.locomotion;
    const fp = this.flinchP.step(dt);
    const fr = this.flinchR.step(dt);
    // cabeça segue o tronco com atraso (chicote)
    const hp = this.headP.step(dt, fp * 1.4);
    const hr = this.headR.step(dt, fr * 1.4);
    const fl = this.flail.step(dt);
    const moving = Math.min(1, this.moveMix);
    const accLean = THREE.MathUtils.clamp(this.accel * L.accelLean, -L.maxAccelLean, L.maxAccelLean) * D2R * moving;
    const turnLean = THREE.MathUtils.clamp(-yawRate * L.turnLean, -L.maxTurnLean, L.maxTurnLean) * D2R * moving;
    const lp = this.leanP.step(dt, this.dead ? 0 : accLean);
    const lr = this.leanR.step(dt, this.dead ? 0 : turnLean);
    const rot = (b: THREE.Bone | undefined, x: number, z: number) => {
      if (!b || (Math.abs(x) < 1e-4 && Math.abs(z) < 1e-4)) return;
      b.quaternion.multiply(this.q.setFromEuler(this.e.set(x, 0, z)));
    };
    const B = this.bones;
    rot(B.spine, fp * 0.45 + lp * 0.6, fr * 0.45 + lr * 0.6);
    rot(B.chest, fp * 0.35 + lp * 0.4, fr * 0.35 + lr * 0.4);
    rot(B.neck, hp * 0.3, hr * 0.3);
    rot(B.head, hp * 0.35 - lp * 0.5, hr * 0.35);
    rot(B.armL, -fl * 0.4, fl);
    rot(B.armR, -fl * 0.4, -fl);
    // quadril: o tranco empurra o corpo inteiro (grupo do boneco), não o osso — a posição do osso é do clipe
    const hx = this.hipX.step(dt);
    const hz = this.hipZ.step(dt);
    this.bodyOffset.set(this.pushX.step(dt) + hx, -Math.abs(fp) * 0.06, this.pushZ.step(dt) + hz);
  }

  dispose(): void {
    this.mixer.stopAllAction();
  }
}
