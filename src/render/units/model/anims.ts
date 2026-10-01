import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';

/**
 * Animações dos personagens 3D como AnimationClips de verdade (tocadas pelo AnimationMixer).
 * Cada pose é um mapa osso → rotação em graus (XYZ). Convenções do esqueleto (ver ModelBuilder):
 *  - membros pendurados (braço/perna): X negativo leva para FRENTE; joelho/cotovelo dobram com X +/−.
 *  - coluna/cabeça (apontam para cima): X positivo inclina para frente.
 *  - braço para fora do corpo: Z + no esquerdo, Z − no direito.
 */
export type ClipName = 'idle' | 'walk' | 'attack' | 'heavy' | 'cast' | 'hit' | 'death';
type Euler3 = [number, number, number];
export type Pose = Record<string, Euler3>;
export interface Key {
  t: number;
  pose: Pose;
  /** deslocamento do quadril (x, y, z) em relação ao descanso */
  hips?: Euler3;
  root?: Euler3;
}

const D2R = Math.PI / 180;

function mirror(p: Pose): Pose {
  const out: Pose = {};
  for (const [k, [x, y, z]] of Object.entries(p)) {
    const m = k.endsWith('.L') ? k.replace('.L', '.R') : k.endsWith('.R') ? k.replace('.R', '.L') : k;
    out[m] = [x, -y, -z];
  }
  return out;
}

export function makeClip(name: string, duration: number, keys: Key[], bones: BoneDef[], base: Pose): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  const times = keys.map((k) => k.t);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const b of bones) {
    if (b.name.startsWith('cape') || b.name === 'root') continue; // capa é física; root tem trilha própria
    const values: number[] = [];
    for (const k of keys) {
      const r = k.pose[b.name] ?? base[b.name] ?? [0, 0, 0];
      q.setFromEuler(e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R));
      values.push(q.x, q.y, q.z, q.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values));
  }
  const hips = bones.find((b) => b.name === 'hips')!;
  tracks.push(
    new THREE.VectorKeyframeTrack(
      'hips.position',
      times,
      keys.flatMap((k) => [hips.pos[0] + (k.hips?.[0] ?? 0), hips.pos[1] + (k.hips?.[1] ?? 0), hips.pos[2] + (k.hips?.[2] ?? 0)]),
    ),
  );
  tracks.push(
    new THREE.QuaternionKeyframeTrack(
      'root.quaternion',
      times,
      keys.flatMap((k) => {
        const r = k.root ?? [0, 0, 0];
        q.setFromEuler(e.set(r[0] * D2R, r[1] * D2R, r[2] * D2R));
        return [q.x, q.y, q.z, q.w];
      }),
    ),
  );
  return new THREE.AnimationClip(name, duration, tracks);
}

/** Aplica a pose base por baixo de cada chave (chaves só descrevem o que muda). */
export function withBase(base: Pose, keys: Key[]): Key[] {
  return keys.map((k) => ({ ...k, pose: { ...base, ...k.pose } }));
}

// ---------------------------------------------------------------------
const RELAX: Pose = {
  'upperArm.L': [0, 0, 9],
  'upperArm.R': [0, 0, -9],
  'foreArm.L': [-12, 0, 0],
  'foreArm.R': [-12, 0, 0],
};

function walkKeys(dur: number, stride: number, armSwing: number, bob: number, extra: (half: 0 | 1) => Pose = () => ({})): Key[] {
  const step = (s: 1 | -1, t: number, lift: number): Key => ({
    t,
    hips: [0, lift, 0],
    pose: {
      'thigh.L': [-stride * s, 0, 0],
      'shin.L': [s > 0 ? 8 : 28, 0, 0],
      'foot.L': [s > 0 ? 12 : -8, 0, 0],
      'thigh.R': [stride * s, 0, 0],
      'shin.R': [s > 0 ? 28 : 8, 0, 0],
      'foot.R': [s > 0 ? -8 : 12, 0, 0],
      ...(armSwing ? { 'upperArm.L': [armSwing * s, 0, 9], 'upperArm.R': [-armSwing * s, 0, -9] } : {}),
      spine: [4, -6 * s, 0],
      ...extra(s > 0 ? 0 : 1),
    },
  });
  const pass = (t: number): Key => ({ t, hips: [0, bob, 0], pose: { 'thigh.L': [0, 0, 0], 'thigh.R': [0, 0, 0], 'shin.L': [30, 0, 0], 'shin.R': [30, 0, 0], spine: [4, 0, 0] } });
  return [step(1, 0, 0), pass(dur * 0.25), step(-1, dur * 0.5, 0), pass(dur * 0.75), step(1, dur, 0)];
}

export function warriorClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  // Guarda: espada à frente, escudo erguido.
  const BASE: Pose = {
    ...RELAX,
    head: [-16, 0, 0], // queixo erguido: rosto aparece na câmera alta
    'upperArm.R': [-22, 0, -14],
    'foreArm.R': [-48, 0, 0],
    'hand.R': [18, 0, 0],
    'upperArm.L': [-18, 0, 22],
    'foreArm.L': [-62, 0, 0],
    'thigh.L': [-6, 0, 4],
    'thigh.R': [6, 0, -4],
    'shin.L': [8, 0, 0],
    'shin.R': [6, 0, 0],
  };
  const idle = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 1.1, hips: [0, -0.012, 0], pose: { chest: [3, 0, 0], head: [-2, 0, 0], 'foreArm.R': [-52, 0, 0] } },
    { t: 2.2, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(1.0, 26, 0, 0.03));
  // Golpe em Área: varredura horizontal da direita para a esquerda
  const attack = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.14, pose: { spine: [0, 38, 0], chest: [0, 18, 0], 'upperArm.R': [-40, 0, -95], 'foreArm.R': [-35, 0, 0], 'hand.R': [0, 0, 0] } },
    { t: 0.26, hips: [0, -0.02, 0.03], pose: { spine: [8, -42, 0], chest: [4, -20, 0], 'upperArm.R': [-88, 0, -4], 'foreArm.R': [-6, 0, 0], 'hand.R': [0, -30, 0], 'thigh.L': [-22, 0, 4], 'shin.L': [18, 0, 0] } },
    { t: 0.36, hips: [0, -0.02, 0.03], pose: { spine: [8, -48, 0], chest: [4, -24, 0], 'upperArm.R': [-78, 0, 18], 'foreArm.R': [-10, 0, 0], 'hand.R': [0, -40, 0], 'thigh.L': [-22, 0, 4], 'shin.L': [18, 0, 0] } },
    { t: 0.55, pose: {} },
  ]);
  // Investida: ergue a espada sobre a cabeça, avança e desce com peso
  const heavy = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.18, hips: [0, 0.01, -0.05], pose: { spine: [-12, 10, 0], chest: [-8, 0, 0], head: [-6, 0, 0], 'upperArm.R': [-172, 0, -12], 'foreArm.R': [-38, 0, 0], 'hand.R': [-10, 0, 0] } },
    { t: 0.29, hips: [0, -0.07, 0.14], pose: { spine: [26, -8, 0], chest: [10, 0, 0], head: [-8, 0, 0], 'upperArm.R': [-58, 0, -6], 'foreArm.R': [0, 0, 0], 'hand.R': [30, 0, 0], 'thigh.L': [-38, 0, 4], 'shin.L': [40, 0, 0], 'thigh.R': [22, 0, -4], 'shin.R': [20, 0, 0] } },
    { t: 0.4, hips: [0, -0.07, 0.14], pose: { spine: [28, -8, 0], chest: [10, 0, 0], 'upperArm.R': [-50, 0, -6], 'foreArm.R': [0, 0, 0], 'hand.R': [36, 0, 0], 'thigh.L': [-38, 0, 4], 'shin.L': [40, 0, 0], 'thigh.R': [22, 0, -4], 'shin.R': [20, 0, 0] } },
    { t: 0.6, pose: {} },
  ]);
  return {
    idle: makeClip('idle', 2.2, idle, bones, BASE),
    walk: makeClip('walk', 1.0, walk, bones, BASE),
    attack: makeClip('attack', 0.55, attack, bones, BASE),
    heavy: makeClip('heavy', 0.6, heavy, bones, BASE),
    cast: makeClip('cast', 0.55, attack, bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE), bones, BASE),
    death: makeClip('death', 1.0, deathKeys(BASE, -1), bones, BASE),
  };
}

export function mageClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  // Cajado em pé ao lado do corpo (o pulso compensa o antebraço erguido).
  const BASE: Pose = {
    ...RELAX,
    head: [-16, 0, 0],
    'upperArm.R': [-8, 0, -16],
    'foreArm.R': [-58, 0, 0],
    'hand.R': [58, 0, 0],
    'upperArm.L': [-10, 0, 12],
    'foreArm.L': [-40, 0, 10],
  };
  const idle = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 1.3, hips: [0, -0.01, 0], pose: { chest: [3, 0, 0], head: [-3, 4, 0], 'foreArm.L': [-46, 0, 10] } },
    { t: 2.6, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(1.1, 20, 0, 0.02));
  // Raio Gélido: puxa e aponta o cajado para frente
  const attack = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.12, pose: { spine: [-4, 18, 0], 'upperArm.R': [-35, 0, -24], 'foreArm.R': [-70, 0, 0], 'hand.R': [40, 0, 0] } },
    { t: 0.22, pose: { spine: [6, -14, 0], chest: [4, -8, 0], 'upperArm.R': [-96, 0, -6], 'foreArm.R': [-4, 0, 0], 'hand.R': [-10, 0, 0], 'upperArm.L': [10, 0, 20] } },
    { t: 0.32, pose: { spine: [6, -14, 0], chest: [4, -8, 0], 'upperArm.R': [-92, 0, -6], 'foreArm.R': [-6, 0, 0], 'hand.R': [-10, 0, 0], 'upperArm.L': [10, 0, 20] } },
    { t: 0.5, pose: {} },
  ]);
  // Barreira de Fogo: ergue o cajado com as duas mãos e crava à frente
  const cast = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.28, hips: [0, 0.02, 0], pose: { spine: [-12, 0, 0], chest: [-8, 0, 0], head: [-14, 0, 0], 'upperArm.R': [-165, 0, -8], 'foreArm.R': [-12, 0, 0], 'hand.R': [0, 0, 0], 'upperArm.L': [-150, 0, 22], 'foreArm.L': [-30, 0, 0] } },
    { t: 0.5, hips: [0, -0.05, 0.05], pose: { spine: [18, 0, 0], chest: [8, 0, 0], head: [4, 0, 0], 'upperArm.R': [-78, 0, -8], 'foreArm.R': [-20, 0, 0], 'hand.R': [40, 0, 0], 'upperArm.L': [-70, 0, 18], 'foreArm.L': [-30, 0, 0], 'thigh.L': [-24, 0, 0], 'shin.L': [26, 0, 0] } },
    { t: 0.62, hips: [0, -0.05, 0.05], pose: { spine: [18, 0, 0], chest: [8, 0, 0], 'upperArm.R': [-78, 0, -8], 'foreArm.R': [-20, 0, 0], 'hand.R': [40, 0, 0], 'upperArm.L': [-70, 0, 18], 'foreArm.L': [-30, 0, 0], 'thigh.L': [-24, 0, 0], 'shin.L': [26, 0, 0] } },
    { t: 0.85, pose: {} },
  ]);
  return {
    idle: makeClip('idle', 2.6, idle, bones, BASE),
    walk: makeClip('walk', 1.1, walk, bones, BASE),
    attack: makeClip('attack', 0.5, attack, bones, BASE),
    heavy: makeClip('heavy', 0.5, attack, bones, BASE),
    cast: makeClip('cast', 0.85, cast, bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE), bones, BASE),
    death: makeClip('death', 1.0, deathKeys(BASE, -1), bones, BASE),
  };
}

export function gruntClips(bones: BoneDef[], variant: 'grunt' | 'runner' | 'brute' = 'grunt'): Record<ClipName, THREE.AnimationClip> {
  // Corcunda, cabeça pendendo, braços para frente; o braço da bola pesa mais.
  const V = variant === 'runner' ? { hunch: 14, arms: -30 } : variant === 'brute' ? { hunch: -6, arms: 10 } : { hunch: 0, arms: 0 };
  const BASE0: Pose = {
    spine: [16, 0, 0],
    chest: [10, 0, 0],
    neck: [-8, 0, 0],
    head: [-6, 0, 10],
    'upperArm.L': [-40, 0, 14],
    'foreArm.L': [-24, 0, 0],
    'upperArm.R': [-12, 0, -16],
    'foreArm.R': [-8, 0, 0],
    'thigh.L': [-8, 0, 3],
    'thigh.R': [4, 0, -3],
    'shin.L': [14, 0, 0],
    'shin.R': [10, 0, 0],
  };
  // variantes: o rápido anda mais curvado com as garras à frente; o pesado fica ereto e largo
  const BASE: Pose = {
    ...BASE0,
    spine: [16 + V.hunch, 0, 0],
    head: [-6 - V.hunch * 0.8, 0, 10],
    'upperArm.L': [-40 + V.arms, 0, 14 + (variant === 'brute' ? 12 : 0)],
    'upperArm.R': [-12 + V.arms * 0.5, 0, -16 - (variant === 'brute' ? 12 : 0)],
    'foreArm.R': [variant === 'brute' ? -40 : -8, 0, 0],
  };
  const idle = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.9, hips: [0.01, -0.01, 0], pose: { spine: [19, 0, 4], head: [-2, 6, 16], 'upperArm.L': [-34, 0, 14] } },
    { t: 1.8, pose: {} },
  ]);
  // Arrastar-se: passo irregular, tronco balançando de lado, cabeça solta
  const shamble = walkKeys(1.2, 22, 0, 0.025, (h) =>
    h === 0
      ? { spine: [18, -8, 8], head: [-4, 6, 18], 'upperArm.L': [-52, 0, 14], 'upperArm.R': [-4, 0, -18] }
      : { spine: [18, 8, -6], head: [-8, -6, 2], 'upperArm.L': [-30, 0, 14], 'upperArm.R': [-18, 0, -14] },
  );
  const walk = withBase(BASE, shamble);
  // Pancada com a bola: puxa para trás e desce por cima
  const attack = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.16, pose: { spine: [2, 20, 0], 'upperArm.R': [42, 0, -30], 'foreArm.R': [-10, 0, 0] } },
    { t: 0.28, hips: [0, -0.03, 0.06], pose: { spine: [30, -12, 0], head: [-18, 0, 0], 'upperArm.R': [-158, 0, -12], 'foreArm.R': [-8, 0, 0] } },
    { t: 0.36, hips: [0, -0.03, 0.06], pose: { spine: [36, -12, 0], 'upperArm.R': [-70, 0, -12], 'foreArm.R': [-4, 0, 0] } },
    { t: 0.55, pose: {} },
  ]);
  return {
    idle: makeClip('idle', 1.8, idle, bones, BASE),
    walk: makeClip('walk', 1.2, walk, bones, BASE),
    attack: makeClip('attack', 0.55, attack, bones, BASE),
    heavy: makeClip('heavy', 0.55, attack, bones, BASE),
    cast: makeClip('cast', 0.55, attack, bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE), bones, BASE),
    death: makeClip('death', 1.1, deathKeys(BASE, 1), bones, BASE),
  };
}

/** Tranco para trás (dano). */
function hitKeys(base: Pose): Key[] {
  const p = (k: Pose) => ({ ...base, ...k });
  return [
    { t: 0, pose: p({}) },
    { t: 0.07, hips: [0, -0.01, -0.05], pose: p({ spine: [(base.spine?.[0] ?? 0) - 14, 0, 4], chest: [-8, 0, 0], head: [-16, 0, -6] }) },
    { t: 0.32, pose: p({}) },
  ];
}

/** Queda: dir −1 cai de costas (heróis), +1 cai de cara (zumbis). */
function deathKeys(base: Pose, dir: 1 | -1): Key[] {
  const p = (k: Pose) => ({ ...base, ...k });
  const limp: Pose = {
    spine: [dir * 10, 0, 0],
    head: [dir * 20, 0, 18],
    'upperArm.L': [dir > 0 ? -150 : -20, 0, 50],
    'upperArm.R': [dir > 0 ? -140 : -30, 0, -60],
    'foreArm.L': [-10, 0, 0],
    'foreArm.R': [-20, 0, 0],
    'thigh.L': [-10, 0, 6],
    'thigh.R': [8, 0, -6],
    'shin.L': [20, 0, 0],
    'shin.R': [10, 0, 0],
  };
  return [
    { t: 0, pose: p({}) },
    { t: 0.22, hips: [0, -0.06, 0], pose: p({ spine: [dir * 14, 0, 6], head: [dir * 18, 0, 12], 'thigh.L': [-30, 0, 0], 'shin.L': [55, 0, 0], 'thigh.R': [-24, 0, 0], 'shin.R': [50, 0, 0] }) },
    { t: 0.62, hips: [0, -0.04, -dir * 0.11], root: [dir * 86, 0, 0], pose: p(limp) },
    { t: 0.72, hips: [0, -0.02, -dir * 0.13], root: [dir * 80, 0, 0], pose: p(limp) },
    { t: 0.85, hips: [0, -0.04, -dir * 0.11], root: [dir * 86, 0, 0], pose: p(limp) },
    { t: 1.0, hips: [0, -0.04, -dir * 0.11], root: [dir * 86, 0, 0], pose: p(limp) },
  ];
}

export { mirror };

export function archerClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  // Arco baixo à frente (mão esquerda), mão direita perto da aljava.
  const BASE: Pose = {
    ...RELAX,
    head: [-16, 0, 0],
    'upperArm.L': [-30, 0, 16],
    'foreArm.L': [-30, 0, 0],
    'hand.L': [0, 0, 0],
    'upperArm.R': [-6, 0, -14],
    'foreArm.R': [-30, 0, 0],
  };
  const idle = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 1.2, hips: [0, -0.01, 0], pose: { chest: [3, 0, 0], head: [-3, -4, 0], 'upperArm.L': [-34, 0, 16] } },
    { t: 2.4, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(0.95, 24, 0, 0.025));
  // Flecha: ergue o arco na horizontal, puxa a corda e solta
  const shot = (up: number) =>
    withBase(BASE, [
      { t: 0, pose: {} },
      { t: 0.14, pose: { spine: [0, 30, 0], chest: [0, 10, 0], head: [-14 - up * 0.3, -24, 0], 'upperArm.L': [-88 - up, 0, 10], 'foreArm.L': [-4, 0, 0], 'upperArm.R': [-84 - up, 0, -30], 'foreArm.R': [-120, 0, 0] } },
      { t: 0.3, pose: { spine: [0, 34, 0], chest: [0, 12, 0], head: [-14 - up * 0.3, -26, 0], 'upperArm.L': [-90 - up, 0, 10], 'foreArm.L': [-2, 0, 0], 'upperArm.R': [-80 - up, 0, -62], 'foreArm.R': [-140, 0, 0] } },
      { t: 0.36, pose: { spine: [0, 34, 0], chest: [0, 12, 0], head: [-14 - up * 0.3, -26, 0], 'upperArm.L': [-90 - up, 0, 10], 'foreArm.L': [-2, 0, 0], 'upperArm.R': [-60 - up, 0, -80], 'foreArm.R': [-40, 0, 0] } },
      { t: 0.55, pose: {} },
    ]);
  return {
    idle: makeClip('idle', 2.4, idle, bones, BASE),
    walk: makeClip('walk', 0.95, walk, bones, BASE),
    attack: makeClip('attack', 0.55, shot(0), bones, BASE),
    heavy: makeClip('heavy', 0.55, shot(0), bones, BASE),
    cast: makeClip('cast', 0.55, shot(55), bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE), bones, BASE),
    death: makeClip('death', 1.0, deathKeys(BASE, -1), bones, BASE),
  };
}
