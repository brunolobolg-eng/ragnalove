import * as THREE from 'three';
import type { ActionSpec, AnimProfile, ClipPart, ClipRef } from '../../../../config/animConfig';
import { instantiateSkeleton, type BoneDef } from '../ModelBuilder';
import { canRetarget, createRetargeter, legLength, strideOf, type UalLibrary } from './retarget';

/** Golpe/magia/reação pronto para tocar: clipe montado + marcadores das fases. */
export interface ActionClip {
  clip: THREE.AnimationClip;
  /** AttackImpact / CastRelease (s no clipe) */
  impact: number;
  /** fim do golpe útil (combo / interrupção) */
  recover: number;
  maxImpactDelay: number;
  fadeIn: number;
  fadeOut: number;
}

/** Laço de locomoção com a passada medida (para casar a cadência dos pés com o deslocamento). */
export interface LocoClip {
  clip: THREE.AnimationClip;
  /** distância por ciclo, em comprimentos de perna */
  stride: number;
  /** fase (0..1) em que o pé esquerdo está mais à frente: alinha caminhada/corrida na mistura */
  phase: number;
}

/** Passada medida da mistura de dois laços (a → b): tabela por peso de b (0..1). */
export interface StrideCurve {
  a: LocoClip;
  b: LocoClip;
  /** passada (pernas por ciclo) em pesos 0, 1/(n-1), ..., 1 */
  table: number[];
}

export interface AnimSet {
  idle: THREE.AnimationClip;
  walk: LocoClip;
  run?: LocoClip;
  sprint?: LocoClip;
  attacks: ActionClip[];
  heavy: ActionClip;
  cast: ActionClip;
  hitFront: ActionClip;
  hitHead: ActionClip;
  stagger: ActionClip;
  death: ActionClip;
  /** passada medida das misturas andar→correr e correr→disparar */
  curves: StrideCurve[];
  /** comprimento da perna em unidades do modelo (converte velocidade do mundo em pernas/s) */
  legLength: number;
  /** usa a biblioteca (retargeting) ou só os clipes próprios */
  library: boolean;
}

/** Ossos do tronco e braços (camada de cima); o resto (quadril, pernas, raiz, cauda) é a camada de baixo. */
export const UPPER_BONE = /spine|chest|neck|head|shoulder|arm|hand|cape/i;

const trackBone = (t: THREE.KeyframeTrack) => t.name.slice(0, t.name.lastIndexOf('.'));

/** Só as trilhas do tronco/braços (ou só as de baixo): golpe andando, pernas seguem a caminhada. */
export function splitClip(clip: THREE.AnimationClip, part: 'upper' | 'lower'): THREE.AnimationClip {
  const keep = clip.tracks.filter((t) => UPPER_BONE.test(trackBone(t)) === (part === 'upper'));
  return new THREE.AnimationClip(`${clip.name}:${part}`, clip.duration, keep);
}

/**
 * Monta o conjunto de animações de um modelo a partir do perfil: retargeting da biblioteca
 * (quando o esqueleto é compatível) ou os clipes próprios do personagem.
 */
export function buildAnimSet(bones: BoneDef[], own: Record<string, THREE.AnimationClip>, profile: AnimProfile, lib: UalLibrary | undefined): AnimSet {
  const library = !!lib && canRetarget(bones);
  const retarget = library ? createRetargeter(lib!, bones) : undefined;
  const leg = Math.max(0.05, legLength(bones));

  const source = (p: ClipPart): THREE.AnimationClip | undefined => {
    const [kind, name] = p.clip.split(':') as ['ual' | 'own', string];
    if (kind === 'own') return own[name];
    return retarget?.(name, { range: p.from !== undefined || p.to !== undefined ? [p.from ?? 0, p.to ?? 1e9] : undefined, name });
  };
  const ownFallback = (ref: ClipRef, fallback: string): ClipPart => (ref.startsWith('ual:') && !library ? { clip: `own:${fallback}` } : { clip: ref });

  const assemble = (spec: ActionSpec, fallback: string): ActionClip => {
    let parts = spec.parts;
    // sem biblioteca: o clipe próprio equivalente
    if (!library && parts.some((p) => p.clip.startsWith('ual:'))) parts = [{ clip: `own:${fallback}` }];
    const clips = parts.map((p) => ({ c: source(p) ?? own[fallback] ?? own.idle, speed: p.speed ?? 1 }));
    const clip = concat(clips, `${fallback}`);
    const impact = Math.min(clip.duration, spec.impact ?? handPeak(clip, bones) ?? clip.duration * 0.45);
    return {
      clip,
      impact,
      recover: Math.min(clip.duration, Math.max(impact, spec.recover ?? impact + (clip.duration - impact) * 0.4)),
      maxImpactDelay: spec.maxImpactDelay ?? 0.4,
      fadeIn: spec.fadeIn ?? 0.08,
      fadeOut: spec.fadeOut ?? 0.2,
    };
  };

  const loco = (ref: ClipRef | undefined, fallback: string, ualName?: string): LocoClip | undefined => {
    if (!ref) return undefined;
    const part = ownFallback(ref, fallback);
    if (!library && ref.startsWith('ual:') && fallback !== 'walk') return undefined;
    const clip = source(part) ?? own[fallback];
    if (!clip) return undefined;
    const m = measureGait(clip, bones);
    let stride = m.stride / leg;
    // biblioteca: distância real do root motion (mais confiável que a estimativa pelos pés)
    if (part.clip.startsWith('ual:') && lib && ualName) {
      const s = strideOf(lib, ualName);
      if (s > 0) stride = s;
    }
    return { clip, stride: Math.max(0.2, stride), phase: m.phase };
  };

  const P = profile;
  const ualName = (r?: ClipRef) => (r?.startsWith('ual:') ? r.slice(4) : undefined);
  const idlePart = ownFallback(P.loco.idle, 'idle');
  const walk = loco(P.loco.walk, 'walk', ualName(P.loco.walk))!;
  const run = loco(P.loco.run, 'walk', ualName(P.loco.run));
  const sprint = loco(P.loco.sprint, 'walk', ualName(P.loco.sprint));
  const idle = source(idlePart) ?? own.idle;
  // parado → andar → correr → disparar: cada par vizinho ganha a tabela de passada medida
  const still: LocoClip = { clip: idle, stride: 0, phase: 0 };
  const chain = [still, walk, run, sprint].filter(Boolean) as LocoClip[];
  const curves: StrideCurve[] = [];
  for (let i = 0; i < chain.length - 1; i++) curves.push(strideCurve(chain[i], chain[i + 1], bones, leg));
  // a passada de cada laço puro passa a ser a medida no próprio esqueleto (coerente com as misturas)
  curves.forEach((c, i) => (chain[i + 1].stride = c.table[c.table.length - 1]));
  return {
    idle,
    walk,
    run,
    sprint,
    curves,
    attacks: P.attacks.map((a) => assemble(a, 'attack')),
    heavy: assemble(P.heavy, 'heavy'),
    cast: assemble(P.cast, 'cast'),
    hitFront: assemble(P.hitFront, 'hit'),
    hitHead: assemble(P.hitHead, 'hit'),
    stagger: assemble(P.stagger, 'hit'),
    death: assemble(P.death, 'death'),
    legLength: leg,
    library,
  };
}

/** Encadeia clipes (preparar → conjurar → lançar → recuperar) num só, aplicando a velocidade de cada parte. */
function concat(parts: { c: THREE.AnimationClip; speed: number }[], name: string): THREE.AnimationClip {
  if (parts.length === 1 && parts[0].speed === 1) return parts[0].c;
  const names = [...new Set(parts.flatMap((p) => p.c.tracks.map((t) => t.name)))];
  const tracks: THREE.KeyframeTrack[] = [];
  let total = 0;
  const offsets = parts.map((p) => {
    const o = total;
    total += p.c.duration / p.speed;
    return o;
  });
  for (const tn of names) {
    const times: number[] = [];
    const values: number[] = [];
    let Ctor: typeof THREE.KeyframeTrack | undefined;
    parts.forEach((p, i) => {
      const t = p.c.tracks.find((x) => x.name === tn);
      if (!t) return;
      Ctor ??= t.constructor as typeof THREE.KeyframeTrack;
      const size = t.getValueSize();
      for (let k = 0; k < t.times.length; k++) {
        let time = offsets[i] + t.times[k] / p.speed;
        if (times.length && time <= times[times.length - 1]) time = times[times.length - 1] + 1e-4; // emenda
        times.push(time);
        for (let j = 0; j < size; j++) values.push(t.values[k * size + j]);
      }
    });
    if (Ctor && times.length) tracks.push(new Ctor(tn, times, values));
  }
  return new THREE.AnimationClip(name, total, tracks);
}

/** Avalia um clipe num esqueleto temporário do modelo e devolve as posições (espaço do modelo) dos ossos pedidos. */
function sampler(clip: THREE.AnimationClip, bones: BoneDef[]) {
  const sk = instantiateSkeleton(bones);
  const holder = new THREE.Object3D();
  holder.add(sk.root);
  const mixer = new THREE.AnimationMixer(holder);
  const action = mixer.clipAction(clip);
  action.play();
  const v = new THREE.Vector3();
  return {
    at(t: number, name: string): THREE.Vector3 | undefined {
      const b = sk.byName.get(name);
      if (!b) return undefined;
      mixer.setTime(t);
      holder.updateMatrixWorld(true);
      return b.getWorldPosition(v).clone();
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(holder);
    },
  };
}

const findBone = (bones: BoneDef[], ...names: string[]) => names.find((n) => bones.some((b) => b.name === n));

/**
 * Passada estimada pelo pé: no apoio o pé varre para trás a mesma distância que o corpo anda,
 * então a distância por ciclo (2 passos) ≈ 2 × amplitude do pé no eixo da frente.
 */
function measureGait(clip: THREE.AnimationClip, bones: BoneDef[]): { stride: number; phase: number } {
  const foot = findBone(bones, 'foot.L', 'Foot_L');
  if (!foot) return { stride: 1, phase: 0 };
  const s = sampler(clip, bones);
  const N = 32;
  let zMin = Infinity;
  let zMax = -Infinity;
  let best = 0;
  for (let i = 0; i < N; i++) {
    const z = s.at((i / N) * clip.duration, foot)!.z;
    if (z > zMax) {
      zMax = z;
      best = i / N;
    }
    zMin = Math.min(zMin, z);
  }
  s.dispose();
  return { stride: 2 * (zMax - zMin), phase: best };
}

/**
 * Passada "no apoio" da mistura de dois laços em fase: o pé apoiado anda para trás exatamente na
 * velocidade do corpo, então essa velocidade (por ciclo) é a distância que a mistura cobre.
 * Medida no esqueleto do próprio modelo, para cada peso — misturar caminhada e corrida não dá a média
 * das passadas (a corrida tem fase de voo), por isso a tabela.
 */
function strideCurve(a: LocoClip, b: LocoClip, bones: BoneDef[], leg: number, steps = 6): StrideCurve {
  const sk = instantiateSkeleton(bones);
  const holder = new THREE.Object3D();
  holder.add(sk.root);
  const mixer = new THREE.AnimationMixer(holder);
  const A = mixer.clipAction(a.clip);
  const B = mixer.clipAction(b.clip);
  for (const x of [A, B]) {
    x.play();
    x.timeScale = 1e-6; // congelado: o tempo é posto à mão
  }
  const feet = [findBone(bones, 'foot.L', 'Foot_L'), findBone(bones, 'foot.R', 'Foot_R')].map((n) => (n ? sk.byName.get(n) : undefined)).filter(Boolean) as THREE.Bone[];
  const N = 64;
  const v = new THREE.Vector3();
  const table: number[] = [];
  for (let s = 0; s < steps; s++) {
    const w = s / (steps - 1);
    A.setEffectiveWeight(1 - w);
    B.setEffectiveWeight(w);
    const ys = feet.map(() => [] as number[]);
    const zs = feet.map(() => [] as number[]);
    for (let i = 0; i <= N; i++) {
      const ph = i / N;
      A.time = ((ph + a.phase) % 1) * a.clip.duration;
      B.time = ((ph + b.phase) % 1) * b.clip.duration;
      mixer.update(0);
      holder.updateMatrixWorld(true);
      feet.forEach((f, k) => {
        f.getWorldPosition(v);
        ys[k].push(v.y);
        zs[k].push(v.z);
      });
    }
    // apoio = quadros com o pé mais baixo; velocidade para trás nesses quadros (por ciclo)
    let sum = 0;
    let cnt = 0;
    feet.forEach((_, k) => {
      const lo = Math.min(...ys[k]);
      const hi = Math.max(...ys[k]);
      for (let i = 0; i < N; i++)
        if (ys[k][i] < lo + (hi - lo) * 0.12) {
          sum += -(zs[k][i + 1] - zs[k][i]) * N;
          cnt++;
        }
    });
    // laço feito à mão sem apoio claro (pé não "planta"): usa a estimativa pela varredura do pé
    const guess = a.stride + (b.stride - a.stride) * w;
    const measured = cnt ? sum / cnt / leg : 0;
    table.push(Math.max(0.05, measured > guess * 0.5 ? measured : guess));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(holder);
  return { a, b, table };
}

/** Passada (pernas por ciclo) da mistura a→b com peso w de b. */
export function curveStride(c: StrideCurve, w: number): number {
  const x = THREE.MathUtils.clamp(w, 0, 1) * (c.table.length - 1);
  const i = Math.min(c.table.length - 2, Math.floor(x));
  return c.table[i] + (c.table[i + 1] - c.table[i]) * (x - i);
}

/** Instante de maior velocidade das mãos (o golpe "solta" ali) — marcador automático de impacto. */
function handPeak(clip: THREE.AnimationClip, bones: BoneDef[]): number | undefined {
  const hands = [findBone(bones, 'hand.R', 'Hand_R'), findBone(bones, 'hand.L', 'Hand_L')].filter(Boolean) as string[];
  if (!hands.length || clip.duration <= 0) return undefined;
  const s = sampler(clip, bones);
  const N = Math.max(8, Math.round(clip.duration * 30));
  const prev = hands.map((h) => s.at(0, h)!);
  let best = 0;
  let at: number | undefined;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) * clip.duration;
    hands.forEach((h, k) => {
      const p = s.at(t, h)!;
      const sp = p.distanceTo(prev[k]);
      if (sp > best) {
        best = sp;
        at = t;
      }
      prev[k] = p;
    });
  }
  s.dispose();
  return at;
}
