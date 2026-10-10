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
  // Passo com peso: contato (calcanhar) → absorção (quadril desce) → impulso (ponta) → balanço.
  // Braços oscilam com leve atraso em relação às pernas (a arma "pesa" na mão).
  const contact = (s: 1 | -1, t: number): Key => ({
    t,
    hips: [0, 0, 0],
    pose: {
      'thigh.L': [-stride * s, 0, 0],
      'shin.L': [s > 0 ? 6 : 42, 0, 0],
      'foot.L': [s > 0 ? 14 : -22, 0, 0],
      'thigh.R': [stride * s, 0, 0],
      'shin.R': [s > 0 ? 42 : 6, 0, 0],
      'foot.R': [s > 0 ? -22 : 14, 0, 0],
      ...(armSwing ? { 'upperArm.L': [armSwing * s * 0.9, 0, 9], 'upperArm.R': [-armSwing * s * 0.9, 0, -9] } : {}),
      spine: [3, -7 * s, 0],
      chest: [0, -4 * s, 0],
      head: [0, 5 * s, 0],
      ...extra(s > 0 ? 0 : 1),
    },
  });
  const absorb = (s: 1 | -1, t: number): Key => ({
    t,
    hips: [0, -bob, 0],
    pose: {
      'thigh.L': [-stride * s * 0.55, 0, 0],
      'shin.L': [20, 0, 0],
      'foot.L': [2, 0, 0],
      'thigh.R': [stride * s * 0.55, 0, 0],
      'shin.R': [20, 0, 0],
      'foot.R': [2, 0, 0],
      ...(armSwing ? { 'upperArm.L': [armSwing * s * 0.4, 0, 9], 'upperArm.R': [-armSwing * s * 0.4, 0, -9] } : {}),
      spine: [5, -3 * s, 0],
      ...extra(s > 0 ? 0 : 1),
    },
  });
  const push = (s: 1 | -1, t: number): Key => ({
    t,
    hips: [0, bob * 0.6, 0.01],
    pose: {
      'thigh.L': [-stride * s * 0.15, 0, 0],
      'shin.L': [s > 0 ? 48 : 10, 0, 0],
      'foot.L': [s > 0 ? -6 : -26, 0, 0],
      'thigh.R': [stride * s * 0.15, 0, 0],
      'shin.R': [s > 0 ? 10 : 48, 0, 0],
      'foot.R': [s > 0 ? -26 : -6, 0, 0],
      ...(armSwing ? { 'upperArm.L': [-armSwing * s, 0, 9], 'upperArm.R': [armSwing * s, 0, -9] } : {}),
      spine: [2, 5 * s, 0],
      chest: [0, 3 * s, 0],
      head: [0, -4 * s, 0],
      ...extra(s > 0 ? 0 : 1),
    },
  });
  return [contact(1, 0), absorb(1, dur * 0.15), push(1, dur * 0.32), contact(-1, dur * 0.5), absorb(-1, dur * 0.65), push(-1, dur * 0.82), contact(1, dur)];
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
    // respiração: peito enche, ombros sobem, espada balança na mão
    { t: 0.55, hips: [0, 0.008, 0], pose: { chest: [-2, 0, 0], head: [-17, 0, 0], 'shoulder.R': [-3, 0, 0], 'shoulder.L': [-3, 0, 0], 'foreArm.R': [-46, 0, 0], 'hand.R': [20, 0, 0] } },
    // troca o peso para a direita, olhar varre para a direita
    { t: 1.1, hips: [0.012, -0.006, 0], pose: { chest: [2, -6, 2], head: [-15, -10, 0], spine: [0, -4, 2], 'upperArm.R': [-20, 0, -14], 'foreArm.L': [-60, 0, 0] } },
    // respiração completa, volta ao centro
    { t: 1.65, hips: [0, 0.004, 0], pose: { chest: [-1, 3, 0], head: [-17, 5, 0], 'foreArm.R': [-50, 0, 0], 'hand.R': [16, 0, 0] } },
    { t: 2.2, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(1.0, 26, 10, 0.03, (h) =>
    // espada firme à frente, escudo colado no corpo durante a marcha
    h === 0 ? { 'foreArm.R': [-52, 0, 0], 'upperArm.L': [-22, 0, 24] } : { 'foreArm.R': [-44, 0, 0], 'upperArm.L': [-14, 0, 20] },
  ));
  // Golpe em Área: agacha enrolando → varredura com overshoot → chicote do quadril → recolhe
  const attack = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.08, hips: [0, -0.015, -0.02], pose: { spine: [6, 22, 0], chest: [2, 12, 0], 'upperArm.R': [-30, 0, -60], 'foreArm.R': [-42, 0, 0], 'thigh.L': [-12, 0, 4], 'shin.L': [16, 0, 0] } },
    { t: 0.15, pose: { spine: [0, 40, 0], chest: [0, 20, 0], head: [-14, 12, 0], 'upperArm.R': [-42, 0, -98], 'foreArm.R': [-36, 0, 0], 'hand.R': [0, 0, 0] } },
    { t: 0.25, hips: [0, -0.02, 0.035], pose: { spine: [9, -46, 0], chest: [5, -22, 0], head: [-18, -8, 0], 'upperArm.R': [-90, 0, -2], 'foreArm.R': [-5, 0, 0], 'hand.R': [0, -32, 0], 'thigh.L': [-24, 0, 4], 'shin.L': [20, 0, 0] } },
    { t: 0.33, hips: [0, -0.015, 0.02], pose: { spine: [7, -34, 0], chest: [3, -16, 0], 'upperArm.R': [-76, 0, 20], 'foreArm.R': [-12, 0, 0], 'hand.R': [0, -42, 0], 'thigh.L': [-18, 0, 4], 'shin.L': [14, 0, 0] } },
    { t: 0.45, hips: [0, -0.005, 0], pose: { spine: [2, -10, 0], 'upperArm.R': [-40, 0, -20], 'foreArm.R': [-40, 0, 0] } },
    { t: 0.55, pose: {} },
  ]);
  // Investida: agacha reunindo força → espada ao céu esticando o corpo → queda com o peso → crava e recupera
  const heavy = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.1, hips: [0, -0.03, -0.03], pose: { spine: [10, 6, 0], chest: [4, 0, 0], 'thigh.L': [-20, 0, 4], 'shin.L': [30, 0, 0], 'thigh.R': [-6, 0, -4], 'shin.R': [22, 0, 0], 'upperArm.R': [-60, 0, -20], 'foreArm.R': [-50, 0, 0] } },
    { t: 0.2, hips: [0, 0.015, -0.06], pose: { spine: [-14, 12, 0], chest: [-10, 0, 0], head: [-4, 0, 0], 'upperArm.R': [-174, 0, -12], 'foreArm.R': [-36, 0, 0], 'hand.R': [-12, 0, 0], 'upperArm.L': [-30, 0, 30] } },
    { t: 0.3, hips: [0, -0.075, 0.15], pose: { spine: [28, -10, 0], chest: [12, 0, 0], head: [-6, 0, 0], 'upperArm.R': [-56, 0, -6], 'foreArm.R': [2, 0, 0], 'hand.R': [32, 0, 0], 'thigh.L': [-40, 0, 4], 'shin.L': [44, 0, 0], 'thigh.R': [24, 0, -4], 'shin.R': [22, 0, 0] } },
    { t: 0.42, hips: [0, -0.06, 0.12], pose: { spine: [24, -6, 0], chest: [10, 0, 0], 'upperArm.R': [-48, 0, -6], 'foreArm.R': [0, 0, 0], 'hand.R': [38, 0, 0], 'thigh.L': [-34, 0, 4], 'shin.L': [36, 0, 0] } },
    { t: 0.52, hips: [0, -0.02, 0.03], pose: { spine: [6, 0, 0], 'upperArm.R': [-34, 0, -10], 'foreArm.R': [-30, 0, 0] } },
    { t: 0.6, pose: {} },
  ]);
  return {
    idle: makeClip('idle', 2.2, idle, bones, BASE),
    walk: makeClip('walk', 1.0, walk, bones, BASE),
    attack: makeClip('attack', 0.55, attack, bones, BASE),
    heavy: makeClip('heavy', 0.6, heavy, bones, BASE),
    cast: makeClip('cast', 0.55, attack, bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE, { 'upperArm.L': [-34, 0, 26], 'foreArm.L': [-72, 0, 0], 'upperArm.R': [-28, 0, -16] }), bones, BASE),
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
    // respiração funda: cajado acompanha a mão, orbe "respira" junto
    { t: 0.65, hips: [0, 0.008, 0], pose: { chest: [-2, 0, 0], head: [-17, 0, 0], 'shoulder.R': [-3, 0, 0], 'foreArm.R': [-56, 0, 0], 'hand.R': [60, 0, 0], 'foreArm.L': [-38, 0, 10] } },
    // mão esquerda flutua desenhando runa no ar, olhar acompanha
    { t: 1.3, hips: [-0.01, -0.006, 0], pose: { chest: [2, 6, 0], head: [-14, 10, 0], 'upperArm.L': [-22, 0, 18], 'foreArm.L': [-52, 0, 14], spine: [0, 4, -2] } },
    { t: 1.95, hips: [0, 0.004, 0], pose: { chest: [-1, -3, 0], head: [-17, -5, 0], 'foreArm.R': [-60, 0, 0], 'hand.R': [56, 0, 0], 'upperArm.L': [-8, 0, 12] } },
    { t: 2.6, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(1.1, 20, 7, 0.022, (h) =>
    // cajado firme na vertical ao lado do corpo; túnica balança com o passo
    h === 0 ? { 'foreArm.R': [-60, 0, 0], 'hand.R': [58, 0, 0] } : { 'foreArm.R': [-56, 0, 0], 'hand.R': [56, 0, 0] },
  ));
  // Raio Gélido: recolhe o cajado enrolando o corpo → estocada com overshoot → segura a mira → recolhe
  const attack = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.07, pose: { spine: [-2, 20, 0], chest: [0, 10, 0], 'upperArm.R': [-28, 0, -26], 'foreArm.R': [-72, 0, 0], 'hand.R': [44, 0, 0] } },
    { t: 0.13, pose: { spine: [-4, 20, 0], 'upperArm.R': [-38, 0, -26], 'foreArm.R': [-72, 0, 0], 'hand.R': [38, 0, 0], head: [-14, 8, 0] } },
    { t: 0.22, hips: [0, -0.01, 0.02], pose: { spine: [7, -16, 0], chest: [5, -9, 0], head: [-18, -6, 0], 'upperArm.R': [-98, 0, -5], 'foreArm.R': [-3, 0, 0], 'hand.R': [-12, 0, 0], 'upperArm.L': [12, 0, 22] } },
    { t: 0.3, pose: { spine: [6, -13, 0], chest: [4, -7, 0], 'upperArm.R': [-93, 0, -6], 'foreArm.R': [-7, 0, 0], 'hand.R': [-9, 0, 0], 'upperArm.L': [9, 0, 20] } },
    { t: 0.5, pose: {} },
  ]);
  // Barreira de Fogo: inspira erguendo o cajado ao céu → crava no chão com o peso do corpo → segura → solta
  const cast = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.15, hips: [0, 0.012, -0.01], pose: { spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-16, 0, 0], 'upperArm.R': [-120, 0, -8], 'foreArm.R': [-18, 0, 0], 'upperArm.L': [-110, 0, 20], 'foreArm.L': [-32, 0, 0] } },
    { t: 0.3, hips: [0, 0.025, 0], pose: { spine: [-13, 0, 0], chest: [-9, 0, 0], head: [-13, 0, 0], 'upperArm.R': [-167, 0, -8], 'foreArm.R': [-11, 0, 0], 'hand.R': [0, 0, 0], 'upperArm.L': [-152, 0, 22], 'foreArm.L': [-28, 0, 0] } },
    { t: 0.5, hips: [0, -0.055, 0.055], pose: { spine: [19, 0, 0], chest: [9, 0, 0], head: [5, 0, 0], 'upperArm.R': [-76, 0, -8], 'foreArm.R': [-22, 0, 0], 'hand.R': [42, 0, 0], 'upperArm.L': [-68, 0, 18], 'foreArm.L': [-32, 0, 0], 'thigh.L': [-26, 0, 0], 'shin.L': [28, 0, 0] } },
    { t: 0.62, hips: [0, -0.05, 0.05], pose: { spine: [17, 0, 0], chest: [8, 0, 0], 'upperArm.R': [-74, 0, -8], 'foreArm.R': [-20, 0, 0], 'hand.R': [40, 0, 0], 'upperArm.L': [-66, 0, 18], 'foreArm.L': [-30, 0, 0], 'thigh.L': [-22, 0, 0], 'shin.L': [24, 0, 0] } },
    { t: 0.74, hips: [0, -0.02, 0.01], pose: { spine: [6, 0, 0], 'upperArm.R': [-40, 0, -10], 'foreArm.R': [-40, 0, 0], 'upperArm.L': [-30, 0, 14] } },
    { t: 0.85, pose: {} },
  ]);
  return {
    idle: makeClip('idle', 2.6, idle, bones, BASE),
    walk: makeClip('walk', 1.1, walk, bones, BASE),
    attack: makeClip('attack', 0.5, attack, bones, BASE),
    heavy: makeClip('heavy', 0.5, attack, bones, BASE),
    cast: makeClip('cast', 0.85, cast, bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE, { 'upperArm.R': [-24, 0, -15], 'foreArm.R': [-62, 0, 0], 'upperArm.L': [-16, 0, 18] }), bones, BASE),
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

/** Tranco para trás (dano): susto → recuo com overshoot → balanço de retorno → base. */
function hitKeys(base: Pose, brace: Pose = {}): Key[] {
  const p = (k: Pose) => ({ ...base, ...k });
  const b = (k: Pose) => ({ ...base, ...brace, ...k });
  return [
    { t: 0, pose: p({}) },
    { t: 0.04, hips: [0, 0.005, -0.015], pose: b({ spine: [(base.spine?.[0] ?? 0) - 4, 0, 0], chest: [-3, 0, 0], head: [-14, 0, -3] }) },
    { t: 0.09, hips: [0, -0.012, -0.055], pose: b({ spine: [(base.spine?.[0] ?? 0) - 15, 0, 5], chest: [-9, 0, 0], head: [-18, 0, -7], 'thigh.L': [-10, 0, 3], 'shin.L': [14, 0, 0] }) },
    { t: 0.17, hips: [0, -0.004, -0.02], pose: b({ spine: [(base.spine?.[0] ?? 0) + 3, 0, -2], chest: [2, 0, 0], head: [-13, 0, 2] }) },
    { t: 0.32, pose: p({}) },
  ];
}

/** Queda: amortece os joelhos → desaba o tronco → cai (dir −1 costas, +1 cara) → quica e assenta. */
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
    { t: 0.14, hips: [0, -0.09, 0], pose: p({ spine: [dir * 6, 0, 0], head: [dir * 8, 0, 6], 'thigh.L': [-34, 0, 2], 'shin.L': [62, 0, 0], 'thigh.R': [-28, 0, -2], 'shin.R': [56, 0, 0], 'upperArm.L': [-30, 0, 30], 'upperArm.R': [-30, 0, -30] }) },
    { t: 0.3, hips: [0, -0.1, -dir * 0.03], pose: p({ spine: [dir * 16, 0, 8], head: [dir * 22, 0, 14], 'thigh.L': [-44, 0, 0], 'shin.L': [70, 0, 0], 'upperArm.L': [-70, 0, 40], 'upperArm.R': [-60, 0, -45] }) },
    { t: 0.55, hips: [0, -0.05, -dir * 0.1], root: [dir * 68, 0, 0], pose: p(limp) },
    { t: 0.68, hips: [0, -0.02, -dir * 0.13], root: [dir * 90, 0, 0], pose: p(limp) },
    { t: 0.8, hips: [0, -0.035, -dir * 0.11], root: [dir * 82, 0, 0], pose: p(limp) },
    { t: 1.0, hips: [0, -0.04, -dir * 0.11], root: [dir * 86, 0, 0], pose: p(limp) },
  ];
}

export { mirror };

/**
 * Híbrido UAL + procedural (Fase 1): `idle`, `walk`, `hit` e `death` vêm da
 * Universal Animation Library (retargeting em `ualClips.ts`); `attack`,
 * `heavy` e `cast` continuam procedurais porque o momento do impacto visual
 * (CLEAVE_IMPACT/BASH_IMPACT) foi coreografado para eles.
 */
import { UAL_PELVIS_REST, ualRawClips } from './ualClips';

/**
 * Altura ABSOLUTA de descanso de um osso (sobe a cadeia aplicando rests).
 * Igual a pos[1] para esqueletos com descanso identidade; correto para
 * rigs Mixamo (onde pos é relativo pequeno e a pose vem das rotações).
 */
export function absRestY(bones: BoneDef[], name: string): number {
  const byName = new Map(bones.map((b) => [b.name, b]));
  const chain: BoneDef[] = [];
  let cur = byName.get(name);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent ? byName.get(cur.parent) : undefined;
  }
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Vector3();
  for (const b of chain) {
    e.set(...b.pos).applyQuaternion(q);
    p.add(e);
    if (b.rest) q.multiply(new THREE.Quaternion(...b.rest));
  }
  return p.y;
}
/**
 * Ajusta `hips.position` do espaço UAL (offset em metros, eixo Z = cima)
 * para o descanso do boneco: escala pela altura ABSOLUTA do quadril e remapeia
 * os eixos (mundo UAL = mundo do jogo: frente +Z, esquerda +X, cima +Y).
 */
/**
 * Movimento flutuando: todos os ossos na pose de descanso do próprio modelo (sem clipe do rig de outro
 * personagem), o corpo elevado e um balanço bem leve. Substitui o ciclo de caminhada (quem anda só desliza).
 */
/**
 * Vida do modelo flutuante: respiração no peito, olhar que varre e braços que balançam de leve.
 * Cada função devolve o desvio (graus) no instante w (fase de 0 a 2π); todas são periódicas,
 * então o clipe fecha o loop sem emenda.
 */
const HOVER_SWAY: Record<string, (w: number) => Euler3> = {
  Spine1: (w) => [0.6 * Math.sin(w), 0, 0.5 * Math.sin(w + 1)],
  Spine2: (w) => [2.4 * Math.sin(w), 0, 0],
  Neck: (w) => [0, 3 * Math.sin(w + 0.7), 0],
  Head: (w) => [-1.5 * Math.sin(w), 6 * Math.sin(w + 0.7), 0.8 * Math.sin(w + 2)],
  LeftArm: (w) => [4 * Math.sin(w + 0.4), 0, 0],
  RightArm: (w) => [4 * Math.sin(w + 0.4 + Math.PI), 0, 0],
};

/** Flutuação em repouso e no andar: o corpo fica erguido em `lift` e tem um balanço suave (sem pés no chão). */
export function hoverWalk(bones: BoneDef[], lift: number, duration = 2.4): THREE.AnimationClip {
  const hips = bones.find((b) => /^hips$/i.test(b.name))!;
  // 32 quadros por ciclo: o balanço das juntas fica liso (sem facetas de interpolação linear)
  const N = 32;
  const times = Array.from({ length: N + 1 }, (_, i) => (i / N) * duration);
  const tracks: THREE.KeyframeTrack[] = [];
  const e = new THREE.Euler();
  const d = new THREE.Quaternion();
  const q = new THREE.Quaternion();
  for (const b of bones) {
    if (!b.rest) continue;
    const sway = HOVER_SWAY[b.name];
    const values: number[] = [];
    for (const t of times) {
      if (sway) {
        const [x, y, z] = sway((2 * Math.PI * t) / duration).map((a) => a * D2R) as Euler3;
        q.fromArray(b.rest).multiply(d.setFromEuler(e.set(x, y, z)));
        values.push(q.x, q.y, q.z, q.w);
      } else values.push(...b.rest);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values));
  }
  // a altura da flutuação (subir e descer) vem da unidade (`ModelDef.float`), não do clipe
  const values: number[] = [];
  for (let i = 0; i < times.length; i++) values.push(hips.pos[0], hips.pos[1] + lift, hips.pos[2]);
  tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, values));
  return new THREE.AnimationClip('hover', duration, tracks);
}

/**
 * Golpe, conjuração, dano e morte de um modelo flutuante: só o tronco de cima, a cabeça e os braços se mexem.
 * Quadril, coluna base e pernas ficam na pose de descanso, erguidos em `lift`. No bongun as coxas são filhas
 * da coluna (não do quadril): dobrar a coluna levanta o corpo inteiro no ar. Sem pés no chão, não há passada.
 */
export function hoverOneShot(clip: THREE.AnimationClip, bones: BoneDef[], lift: number): THREE.AnimationClip {
  const hips = bones.find((b) => /^hips$/i.test(b.name))!;
  const still = new Set(bones.filter((b) => b.rest && (b === hips || /^spine$/i.test(b.name) || /(UpLeg|Leg|Foot|Toe)/i.test(b.name))).map((b) => b.name));
  const tracks: THREE.KeyframeTrack[] = [];
  for (const t of clip.tracks) {
    const bone = t.name.slice(0, t.name.lastIndexOf('.'));
    if (!still.has(bone)) tracks.push(t);
  }
  for (const b of bones) {
    if (!still.has(b.name)) continue;
    // rotação e posição: o misturador precisa de trilha nos dois para não misturar com a pose anterior
    const r = b.rest!;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, [0, clip.duration], [...r, ...r]));
    if (b === hips) {
      const p = [hips.pos[0], hips.pos[1] + lift, hips.pos[2]];
      tracks.push(new THREE.VectorKeyframeTrack(`${b.name}.position`, [0, clip.duration], [...p, ...p]));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Conjunto de clipes de um modelo flutuante (andar/repouso com vida própria; ações travadas no ar). */
export function hoverClips(base: Record<ClipName, THREE.AnimationClip>, bones: BoneDef[], lift: number): Record<ClipName, THREE.AnimationClip> {
  const air = (c: THREE.AnimationClip) => hoverOneShot(c, bones, lift);
  return {
    idle: hoverWalk(bones, lift),
    walk: hoverWalk(bones, lift),
    attack: air(base.attack),
    heavy: air(base.heavy),
    cast: air(base.cast),
    hit: air(base.hit),
    death: air(base.death),
  };
}

export function fitHips(clip: THREE.AnimationClip, bones: BoneDef[], hipsName = 'hips', scaleOverride?: number): THREE.AnimationClip {
  const hips = bones.find((b) => b.name === hipsName)!;
  // escala sempre positiva (descanso agachado/estranho nunca inverte o balanço)
  const s = scaleOverride ?? Math.abs(absRestY(bones, hipsName)) / UAL_PELVIS_REST[2];
  const c = clip.clone();
  const t = c.tracks.find((x) => x.name === `${hipsName}.position`) as THREE.VectorKeyframeTrack | undefined;
  if (t) {
    const v = t.values as unknown as number[];
    for (let i = 0; i < v.length; i += 3) {
      const ox = v[i];
      const oy = v[i + 1];
      const oz = v[i + 2];
      v[i] = hips.pos[0] + ox * s;
      v[i + 1] = hips.pos[1] + oz * s;
      v[i + 2] = hips.pos[2] - oy * s;
    }
  }
  return c;
}

function withUAL(bones: BoneDef[], proc: (b: BoneDef[]) => Record<ClipName, THREE.AnimationClip>): Record<ClipName, THREE.AnimationClip> {
  const raw = ualRawClips();
  const p = proc(bones);
  return {
    idle: fitHips(raw.idle, bones),
    walk: fitHips(raw.walk, bones),
    attack: p.attack,
    heavy: p.heavy,
    cast: p.cast,
    hit: fitHips(raw.hit, bones),
    death: fitHips(raw.death, bones),
  };
}

/** Heróis com animações UAL (idle/walk/hit/death) + ataque/magia procedurais. */
export const warriorClipsUAL = (b: BoneDef[]): Record<ClipName, THREE.AnimationClip> => withUAL(b, warriorClips);
export const mageClipsUAL = (b: BoneDef[]): Record<ClipName, THREE.AnimationClip> => withUAL(b, mageClips);
export const archerClipsUAL = (b: BoneDef[]): Record<ClipName, THREE.AnimationClip> => withUAL(b, archerClips);

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
    // respiração curta de patrulha: arco balança na mão estendida
    { t: 0.6, hips: [0, 0.007, 0], pose: { chest: [-2, 0, 0], head: [-17, 0, 0], 'shoulder.L': [-3, 0, 0], 'upperArm.L': [-32, 0, 16], 'foreArm.R': [-28, 0, 0] } },
    // olhar varre o horizonte para a esquerda, orelha acompanha
    { t: 1.2, hips: [-0.01, -0.005, 0], pose: { chest: [2, 8, 0], head: [-15, 14, 0], spine: [0, 5, -2], 'upperArm.R': [-10, 0, -16] } },
    { t: 1.8, hips: [0, 0.004, 0], pose: { chest: [-1, -4, 0], head: [-17, -6, 0], 'upperArm.L': [-28, 0, 16], 'foreArm.L': [-32, 0, 0] } },
    { t: 2.4, pose: {} },
  ]);
  const walk = withBase(BASE, walkKeys(0.95, 24, 9, 0.028, (h) =>
    // arco baixo à frente como lanterna; mão direita solta balança livre
    h === 0 ? { 'upperArm.L': [-36, 0, 14], 'foreArm.L': [-24, 0, 0] } : { 'upperArm.L': [-26, 0, 16], 'foreArm.L': [-30, 0, 0] },
  ));
  // Flecha: ergue e engatilha → puxada total com o peito torcido → solta com coice → acompanha → desce
  const shot = (up: number) =>
    withBase(BASE, [
      { t: 0, pose: {} },
      { t: 0.08, pose: { spine: [0, 12, 0], chest: [0, 6, 0], 'upperArm.L': [-58 - up * 0.5, 0, 12], 'foreArm.L': [-14, 0, 0], 'upperArm.R': [-50 - up * 0.5, 0, -22], 'foreArm.R': [-70, 0, 0], head: [-14 - up * 0.2, -10, 0] } },
      { t: 0.16, pose: { spine: [0, 32, 0], chest: [0, 12, 0], head: [-14 - up * 0.3, -26, 0], 'upperArm.L': [-89 - up, 0, 10], 'foreArm.L': [-4, 0, 0], 'upperArm.R': [-86 - up, 0, -28], 'foreArm.R': [-122, 0, 0] } },
      { t: 0.28, hips: [0, -0.008, 0.01], pose: { spine: [0, 36, 0], chest: [0, 13, 0], head: [-14 - up * 0.3, -27, 0], 'upperArm.L': [-91 - up, 0, 10], 'foreArm.L': [-2, 0, 0], 'upperArm.R': [-81 - up, 0, -60], 'foreArm.R': [-142, 0, 0] } },
      { t: 0.35, pose: { spine: [0, 30, 0], chest: [0, 10, 0], head: [-14 - up * 0.3, -24, 0], 'upperArm.L': [-86 - up, 0, 12], 'foreArm.L': [-6, 0, 0], 'upperArm.R': [-58 - up, 0, -82], 'foreArm.R': [-38, 0, 0] } },
      { t: 0.44, pose: { spine: [0, 16, 0], chest: [0, 6, 0], 'upperArm.L': [-60 - up * 0.5, 0, 14], 'upperArm.R': [-34 - up * 0.3, 0, -40], 'foreArm.R': [-50, 0, 0] } },
      { t: 0.55, pose: {} },
    ]);
  return {
    idle: makeClip('idle', 2.4, idle, bones, BASE),
    walk: makeClip('walk', 0.95, walk, bones, BASE),
    attack: makeClip('attack', 0.55, shot(0), bones, BASE),
    heavy: makeClip('heavy', 0.55, shot(0), bones, BASE),
    cast: makeClip('cast', 0.55, shot(55), bones, BASE),
    hit: makeClip('hit', 0.32, hitKeys(BASE, { 'upperArm.L': [-52, 0, 12], 'foreArm.L': [-20, 0, 0], 'upperArm.R': [-20, 0, -20] }), bones, BASE),
    death: makeClip('death', 1.0, deathKeys(BASE, -1), bones, BASE),
  };
}
