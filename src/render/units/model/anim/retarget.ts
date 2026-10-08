import * as THREE from 'three';
import type { BoneDef } from '../ModelBuilder';

/**
 * Retargeting da Universal Animation Library (Quaternius, CC0) para o esqueleto padrão do jogo.
 *
 * A biblioteca vem pré-processada em public/anims/ual_humanoid.json (scripts/build_anim_library.py):
 * esqueleto do corpo + rotações por quadro. Aqui cada clipe é convertido para os ossos de UM modelo:
 *
 *  1. Pose de descanso alinhada: cada osso do alvo é girado para apontar como o osso equivalente da
 *     biblioteca em T-pose (o esqueleto do jogo descansa com os braços caídos).
 *  2. Por quadro: rotação de mundo do alvo = (rotação de mundo da origem × inverso do descanso da origem)
 *     × descanso alinhado do alvo. Assim a "torção" e o balanço de cada osso passam iguais.
 *  3. Volta para rotação local (pai já convertido) e o quadril é escalado pela altura do quadril.
 *
 * Funciona para qualquer modelo com os nomes de osso do esqueleto padrão (ver BONE_MAP): personagens
 * novos ganham as mesmas animações sem ferramenta externa.
 */

interface SrcBone {
  n: string;
  p: string | null;
  t: number[];
  r: number[];
}
interface SrcClip {
  d: number;
  n: number;
  rot: Record<string, number[]>;
  pelvis: number[] | null;
  stride: number[];
}
export interface UalLibrary {
  bones: SrcBone[];
  clips: Record<string, SrcClip>;
}

/** Osso do jogo → osso da biblioteca. Ossos sem par (root, capa, cauda) não recebem trilha. */
const BONE_MAP: Record<string, string> = {
  hips: 'pelvis',
  spine: 'spine_01',
  chest: 'spine_03',
  neck: 'neck_01',
  head: 'Head',
  'shoulder.L': 'clavicle_l',
  'upperArm.L': 'upperarm_l',
  'foreArm.L': 'lowerarm_l',
  'hand.L': 'hand_l',
  'shoulder.R': 'clavicle_r',
  'upperArm.R': 'upperarm_r',
  'foreArm.R': 'lowerarm_r',
  'hand.R': 'hand_r',
  'thigh.L': 'thigh_l',
  'shin.L': 'calf_l',
  'foot.L': 'foot_l',
  'thigh.R': 'thigh_r',
  'shin.R': 'calf_r',
  'foot.R': 'foot_r',
};
/** Direção de cada osso = do osso até este filho (alinhamento da pose de descanso). */
const TARGET_DIR: Record<string, string> = {
  spine: 'chest',
  chest: 'neck',
  neck: 'head',
  'shoulder.L': 'upperArm.L',
  'upperArm.L': 'foreArm.L',
  'foreArm.L': 'hand.L',
  'shoulder.R': 'upperArm.R',
  'upperArm.R': 'foreArm.R',
  'foreArm.R': 'hand.R',
  'thigh.L': 'shin.L',
  'shin.L': 'foot.L',
  'thigh.R': 'shin.R',
  'shin.R': 'foot.R',
};
const SOURCE_DIR: Record<string, string> = {
  spine_01: 'spine_03',
  spine_03: 'neck_01',
  neck_01: 'Head',
  clavicle_l: 'upperarm_l',
  upperarm_l: 'lowerarm_l',
  lowerarm_l: 'hand_l',
  hand_l: 'middle_01_l',
  clavicle_r: 'upperarm_r',
  upperarm_r: 'lowerarm_r',
  lowerarm_r: 'hand_r',
  hand_r: 'middle_01_r',
  thigh_l: 'calf_l',
  calf_l: 'foot_l',
  thigh_r: 'calf_r',
  calf_r: 'foot_r',
};
/** A mão do alvo não tem filho: usa a direção do antebraço (a mão fica alinhada ao antebraço no descanso). */
const TARGET_DIR_FALLBACK: Record<string, string> = { 'hand.L': 'foreArm.L', 'hand.R': 'foreArm.R' };

/** O esqueleto tem os ossos necessários para receber as animações da biblioteca? */
export function canRetarget(bones: BoneDef[]): boolean {
  const names = new Set(bones.map((b) => b.name));
  return Object.keys(BONE_MAP).every((n) => names.has(n));
}

interface Pose {
  q: THREE.Quaternion[];
  p: THREE.Vector3[];
}

/** Cinemática direta da origem (rotação/posição de mundo de cada osso) num quadro (ou no descanso). */
function sourcePose(lib: UalLibrary, clip: SrcClip | undefined, f: number, out?: Pose): Pose {
  const B = lib.bones;
  const pose = out ?? { q: B.map(() => new THREE.Quaternion()), p: B.map(() => new THREE.Vector3()) };
  const index = srcIndex(lib);
  const lq = new THREE.Quaternion();
  const lt = new THREE.Vector3();
  B.forEach((b, i) => {
    const r = clip?.rot[b.n];
    if (r) lq.set(r[f * 4], r[f * 4 + 1], r[f * 4 + 2], r[f * 4 + 3]);
    else lq.set(b.r[0], b.r[1], b.r[2], b.r[3]);
    const pv = b.n === 'pelvis' && clip?.pelvis ? clip.pelvis : undefined;
    if (pv) lt.set(pv[f * 3], pv[f * 3 + 1], pv[f * 3 + 2]);
    else lt.set(b.t[0], b.t[1], b.t[2]);
    if (b.p === null) {
      pose.q[i].copy(lq);
      pose.p[i].copy(lt);
    } else {
      const pi = index.get(b.p)!;
      pose.q[i].copy(pose.q[pi]).multiply(lq);
      pose.p[i].copy(lt).applyQuaternion(pose.q[pi]).add(pose.p[pi]);
    }
  });
  return pose;
}

const indexCache = new WeakMap<UalLibrary, Map<string, number>>();
function srcIndex(lib: UalLibrary): Map<string, number> {
  let m = indexCache.get(lib);
  if (!m) indexCache.set(lib, (m = new Map(lib.bones.map((b, i) => [b.n, i]))));
  return m;
}

/** Posições de mundo do alvo no descanso (rotações de descanso do jogo são sempre identidade). */
function targetRest(bones: BoneDef[]): Map<string, THREE.Vector3> {
  const w = new Map<string, THREE.Vector3>();
  for (const b of bones) {
    const v = new THREE.Vector3(...b.pos);
    if (b.parent) v.add(w.get(b.parent)!);
    w.set(b.name, v);
  }
  return w;
}

export interface RetargetOptions {
  /** trecho do clipe de origem em segundos (recorte de combos e sobras) */
  range?: [number, number];
  /** nome do clipe gerado */
  name?: string;
  /** fecha o laço (último quadro = primeiro) para clipes em loop */
  loop?: boolean;
}

/**
 * Prepara o retargeting de um esqueleto: guarda o alinhamento de descanso e devolve uma função
 * que converte clipes da biblioteca para esse esqueleto.
 */
export function createRetargeter(lib: UalLibrary, bones: BoneDef[]) {
  const idx = srcIndex(lib);
  const rest = sourcePose(lib, undefined, 0);
  const tRest = targetRest(bones);
  const mapped = bones.filter((b) => BONE_MAP[b.name]);
  // alinhamento: rotação (de mundo) que leva cada osso do alvo à direção do osso da origem em T-pose
  const aligned = new Map<string, THREE.Quaternion>();
  const srcRestInv = new Map<string, THREE.Quaternion>();
  for (const b of mapped) {
    const s = BONE_MAP[b.name];
    const si = idx.get(s)!;
    srcRestInv.set(b.name, rest.q[si].clone().invert());
    const tc = TARGET_DIR[b.name] ?? TARGET_DIR_FALLBACK[b.name];
    const sc = SOURCE_DIR[s];
    const q = new THREE.Quaternion();
    if (tc && sc) {
      const from = b.name in TARGET_DIR ? tRest.get(tc)!.clone().sub(tRest.get(b.name)!) : tRest.get(b.name)!.clone().sub(tRest.get(tc)!);
      const to = rest.p[idx.get(sc)!].clone().sub(rest.p[si]);
      if (from.lengthSq() > 1e-10 && to.lengthSq() > 1e-10) q.setFromUnitVectors(from.normalize(), to.normalize());
    }
    aligned.set(b.name, q);
  }
  // escala do quadril pelo COMPRIMENTO DA PERNA (não pela altura): personagens chibi têm pernas curtas,
  // e o sobe-desce do quadril precisa acompanhar o que as pernas deles alcançam (pés no chão)
  const pelvisRest = rest.p[idx.get('pelvis')!];
  const hipsRest = tRest.get('hips')!;
  const hipsBone = bones.find((b) => b.name === 'hips')!;
  const scale = legLength(bones) / sourceLegLength(lib);
  const heightScale = hipsRest.y / pelvisRest.y;

  return function retarget(clipName: string, o: RetargetOptions = {}): THREE.AnimationClip | undefined {
    const clip = lib.clips[clipName];
    if (!clip) return undefined;
    const dt = clip.d / Math.max(1, clip.n - 1);
    const f0 = o.range ? Math.max(0, Math.round(o.range[0] / dt)) : 0;
    const f1 = o.range ? Math.min(clip.n - 1, Math.round(o.range[1] / dt)) : clip.n - 1;
    const frames = f1 - f0 + 1;
    const times = new Float32Array(frames);
    const values = new Map<string, Float32Array>(mapped.map((b) => [b.name, new Float32Array(frames * 4)]));
    const hips = new Float32Array(frames * 3);
    const world = new Map<string, THREE.Quaternion>();
    const pose = sourcePose(lib, clip, f0);
    const tmp = new THREE.Quaternion();
    const prev = new Map<string, THREE.Quaternion>();
    for (let k = 0; k < frames; k++) {
      const f = o.loop && k === frames - 1 ? f0 : f0 + k;
      sourcePose(lib, clip, f, pose);
      times[k] = k * dt;
      world.clear();
      for (const b of bones) {
        const s = BONE_MAP[b.name];
        const parentW = b.parent ? world.get(b.parent) : undefined;
        if (!s) {
          // osso sem par: segue o pai sem rotação própria
          world.set(b.name, parentW ? parentW.clone() : new THREE.Quaternion());
          continue;
        }
        const w = pose.q[idx.get(s)!].clone().multiply(srcRestInv.get(b.name)!).multiply(aligned.get(b.name)!);
        world.set(b.name, w);
        // local = inverso(mundo do pai) × mundo
        const local = parentW ? tmp.copy(parentW).invert().multiply(w) : tmp.copy(w);
        // continuidade (q e −q são a mesma rotação; a interpolação precisa do mesmo hemisfério)
        const pq = prev.get(b.name);
        if (pq && pq.dot(local) < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        prev.set(b.name, (pq ?? new THREE.Quaternion()).copy(local));
        values.get(b.name)!.set([local.x, local.y, local.z, local.w], k * 4);
      }
      const pp = pose.p[idx.get('pelvis')!];
      // altura: proporção da pelve (a queda até o chão precisa acertar o chão); deslocamento horizontal: pelas pernas
      hips.set([hipsBone.pos[0] + (pp.x - pelvisRest.x) * scale, pp.y * heightScale, hipsBone.pos[2] + (pp.z - pelvisRest.z) * scale], k * 3);
    }
    const tracks: THREE.KeyframeTrack[] = mapped.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values.get(b.name)!));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hips));
    return new THREE.AnimationClip(o.name ?? clipName, times[frames - 1], tracks);
  };
}

/** Comprimento da perna (coxa + canela) do esqueleto do jogo, em unidades do modelo. */
export function legLength(bones: BoneDef[]): number {
  const len = (n: string) => {
    const b = bones.find((x) => x.name === n);
    return b ? Math.hypot(...b.pos) : 0;
  };
  // padrão: shin.L (coxa) + foot.L (canela); esqueleto Hips: LowerLeg_L + Foot_L
  return len('shin.L') + len('foot.L') || len('LowerLeg_L') + len('Foot_L') || 0.3;
}

/** Comprimento da perna da biblioteca (coxa + canela, em T-pose). */
export function sourceLegLength(lib: UalLibrary): number {
  const rest = sourcePose(lib, undefined, 0);
  const i = srcIndex(lib);
  const p = (n: string) => rest.p[i.get(n)!];
  return p('thigh_l').distanceTo(p('calf_l')) + p('calf_l').distanceTo(p('foot_l'));
}

/** Distância que o clipe de origem percorre por ciclo (root motion), em comprimentos de perna. */
export function strideOf(lib: UalLibrary, clipName: string): number {
  const c = lib.clips[clipName];
  return c ? Math.hypot(c.stride[0], c.stride[2]) / sourceLegLength(lib) : 0;
}

let libPromise: Promise<UalLibrary | undefined> | undefined;
let loaded: UalLibrary | undefined;
const listeners: (() => void)[] = [];
/** Biblioteca já carregada (ou undefined: os personagens usam as animações próprias até ela chegar). */
export function loadedUalLibrary(): UalLibrary | undefined {
  return loaded;
}
/** Avisa quando a biblioteca terminar de carregar. */
export function onUalLibrary(fn: () => void): void {
  if (loaded) fn();
  else listeners.push(fn);
}
/** Carrega a biblioteca uma vez (lida inteira para a memória: o app:// do executável não faz streaming). */
export function loadUalLibrary(url = 'anims/ual_humanoid.json'): Promise<UalLibrary | undefined> {
  libPromise ??= fetch(new URL(url, document.baseURI).href)
    .then((r) => (r.ok ? (r.json() as Promise<UalLibrary>) : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((lib) => {
      loaded = lib;
      for (const fn of listeners.splice(0)) fn();
      return lib;
    })
    .catch((err) => {
      console.warn('Biblioteca de animações indisponível; usando as animações próprias dos personagens.', err);
      return undefined;
    });
  return libPromise;
}
