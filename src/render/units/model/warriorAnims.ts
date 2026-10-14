import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { ualMixamoClips } from './ualMixamo';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type JointPose, type PoseKey, type V3 } from './rigPose';

/**
 * Animações do Guerreiro. Base: captura de movimento (UAL), copiada por direção de membro para o rig do
 * modelo. Por cima da captura, o braço da espada (e a investida) segue uma linha de tempo desenhada à mão:
 * a captura não tem golpe de espada, então só a mão da arma é trocada; tronco, pernas e escudo continuam
 * vindo da captura.
 *
 * Direções no espaço do corpo: X = lado esquerdo do herói, Y = cima, Z = frente.
 */

/** Duração de cada clipe no combate (s). Golpes e habilidades são de uma vez só (ver ModelUnitView). */
const DURATION = { attack: 0.6, heavy: 0.9, cast: 0.85, hit: 0.4 } as const;

/** Linha de tempo de uma direção: pares [fase 0..1, direção]; interpola linear e normaliza. */
type Timeline = [number, V3][];

function sample(tl: Timeline, p: number): V3 {
  let i = 0;
  while (i < tl.length - 2 && p > tl[i + 1][0]) i++;
  const [p0, a] = tl[i];
  const [p1, b] = tl[i + 1];
  const k = p1 > p0 ? Math.min(1, Math.max(0, (p - p0) / (p1 - p0))) : 0;
  const v = new THREE.Vector3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k).normalize();
  return [v.x, v.y, v.z];
}

/** Sobrescreve a direção de alguns ossos ao longo do clipe (fase = tempo / duração). */
function override(keys: PoseKey[], duration: number, lines: Record<string, Timeline>): PoseKey[] {
  return keys.map((k) => {
    const p = k.t / duration;
    const joints: Record<string, JointPose> = { ...k.joints };
    for (const [bone, tl] of Object.entries(lines)) joints[bone] = { aim: sample(tl, p) };
    return { ...k, joints };
  });
}

/** Troca o tempo da captura para a duração de combate (acelera golpes curtos, alonga habilidades). */
function retime(keys: PoseKey[], from: number, to: number): PoseKey[] {
  const f = to / from;
  return keys.map((k) => ({ ...k, t: k.t * f }));
}

/** Golpe de espada (corte horizontal, direita → esquerda): preparação, corte e recuperação. */
const SLASH: Record<string, Timeline> = {
  RightArm: [
    [0, [-0.55, -0.45, 0.6]],
    [0.22, [-0.85, 0.25, -0.4]],
    // a lâmina termina do lado esquerdo do herói, não cruzando o peito (antes [0.45,-0.05,0.9])
    [0.45, [0.75, -0.1, 0.6]],
    [0.62, [0.8, -0.3, 0.45]],
    [1, [-0.55, -0.45, 0.6]],
  ],
  RightForeArm: [
    [0, [-0.3, -0.2, 0.95]],
    [0.22, [-0.55, 0.75, -0.35]],
    [0.45, [0.8, -0.05, 0.55]],
    [0.62, [0.85, -0.3, 0.4]],
    [1, [-0.3, -0.2, 0.95]],
  ],
};

/** Investida: a espada sobe por cima da cabeça e desce no chão à frente. */
const SMASH: Record<string, Timeline> = {
  RightArm: [
    [0, [-0.55, -0.45, 0.6]],
    [0.35, [-0.25, 1, -0.05]],
    [0.6, [-0.05, -0.55, 1]],
    [0.8, [-0.05, -0.45, 0.9]],
    [1, [-0.55, -0.45, 0.6]],
  ],
  RightForeArm: [
    [0, [-0.3, -0.2, 0.95]],
    [0.35, [-0.05, 1, -0.2]],
    [0.6, [-0.05, -0.9, 0.45]],
    [0.8, [-0.05, -0.7, 0.7]],
    [1, [-0.3, -0.2, 0.95]],
  ],
};

export function warriorRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const plain = (name: string, clip: THREE.AnimationClip, duration: number, ground: 'feet' | 'body' = 'feet'): THREE.AnimationClip =>
    poseClip(name, duration, retime(mocapKeys(clip), clip.duration, duration), rig, {}, { ground });
  const swing = (name: string, lines: Record<string, Timeline>, duration: number): THREE.AnimationClip =>
    poseClip(name, duration, override(retime(mocapKeys(raw.attack), raw.attack.duration, duration), duration, lines), rig);
  return {
    idle: plain('idle', raw.idle, raw.idle.duration),
    walk: plain('walk', raw.walk, raw.walk.duration),
    attack: swing('attack', SLASH, DURATION.attack),
    heavy: swing('heavy', SMASH, DURATION.heavy),
    cast: plain('cast', raw.cast, DURATION.cast),
    hit: plain('hit', raw.hit, DURATION.hit),
    death: plain('death', raw.death, raw.death.duration, 'body'),
  };
}

/**
 * Golpe do guerreiro (GLB do dono): corte e investida re-cronometrados para o pico da lâmina cair no impacto do jogo
 * (CLEAVE_IMPACT 0,26 s; BASH_IMPACT 0,29 s). Com as linhas de `warriorRigClips`, o corte caía em 0,20 s e a
 * investida em 0,43 s: o dano saía antes (ou depois) da lâmina chegar.
 */
const HERO_SLASH: Record<string, Timeline> = {
  RightArm: [
    [0, [-0.55, -0.45, 0.6]],
    [0.27, [-0.85, 0.25, -0.4]],
    [0.52, [0.75, -0.1, 0.6]],
    [0.68, [0.8, -0.3, 0.45]],
    [1, [-0.55, -0.45, 0.6]],
  ],
  RightForeArm: [
    [0, [-0.3, -0.2, 0.95]],
    [0.27, [-0.55, 0.75, -0.35]],
    [0.52, [0.8, -0.05, 0.55]],
    [0.68, [0.85, -0.3, 0.4]],
    [1, [-0.3, -0.2, 0.95]],
  ],
};
const HERO_SMASH: Record<string, Timeline> = {
  RightArm: [
    [0, [-0.55, -0.45, 0.6]],
    [0.32, [-0.25, 1, -0.05]],
    [0.53, [-0.05, -0.55, 1]],
    [0.7, [-0.05, -0.45, 0.9]],
    [1, [-0.55, -0.45, 0.6]],
  ],
  RightForeArm: [
    [0, [-0.3, -0.2, 0.95]],
    [0.32, [-0.05, 1, -0.2]],
    [0.53, [-0.05, -0.9, 0.45]],
    [0.7, [-0.05, -0.7, 0.7]],
    [1, [-0.3, -0.2, 0.95]],
  ],
};

/** Direção média de um osso no andar (média das chaves, normalizada); `undefined` se o osso não tem direção no andar. */
function pousoDoAndar(keys: PoseKey[], bone: string): V3 | undefined {
  const soma = new THREE.Vector3();
  for (const k of keys) {
    const a = k.joints?.[bone]?.aim;
    if (a) soma.add(new THREE.Vector3(...a));
  }
  if (soma.lengthSq() === 0) return undefined;
  const v = soma.normalize();
  return [v.x, v.y, v.z];
}

/** Tempo (s) da rampa entre a pose do andar e o golpe, no começo e no fim do clipe (ver `rampaDoAndar`). */
const RAMPA_GOLPE_S = 0.15;

/**
 * Entrada e saída do golpe: nas pontas do clipe, cada osso sai da pose média do andar e volta a ela (rampa suave de
 * `RAMPA_GOLPE_S`). A troca andar → golpe (mistura de 0,1 s) então parte de uma pose que o corpo já tem, e a volta
 * ao andar também. No meio do clipe vale a captura do golpe, sem mudança.
 */
function rampaDoAndar(keys: PoseKey[], andar: PoseKey[], duration: number): PoseKey[] {
  const media = new Map<string, V3>();
  for (const k of keys) {
    for (const bone of Object.keys(k.joints ?? {})) {
      if (media.has(bone)) continue;
      const m = pousoDoAndar(andar, bone);
      if (m) media.set(bone, m);
    }
  }
  return keys.map((k) => {
    const x = THREE.MathUtils.clamp(Math.min(k.t, duration - k.t) / RAMPA_GOLPE_S, 0, 1);
    const g = x * x * (3 - 2 * x); // suavização (smoothstep): a rampa começa e termina sem degrau de velocidade
    const joints: Record<string, JointPose> = { ...k.joints };
    for (const [bone, jp] of Object.entries(joints)) {
      const m = media.get(bone);
      if (!m || !jp.aim) continue;
      const v = new THREE.Vector3(...m).lerp(new THREE.Vector3(...jp.aim), g).normalize();
      joints[bone] = { ...jp, aim: [v.x, v.y, v.z] };
    }
    return { ...k, joints };
  });
}

/**
 * Braço do escudo parado na pose média do andar. A captura do golpe tinha um chicote de 3 000 graus/s no antebraço do
 * escudo em 0,12 s, e o antebraço do escudo começava 95° longe da pose do andar.
 */
function comEscudoParado(lines: Record<string, Timeline>, andar: PoseKey[]): Record<string, Timeline> {
  const out = { ...lines };
  for (const escudo of ['LeftArm', 'LeftForeArm']) {
    const m = pousoDoAndar(andar, escudo);
    if (m) out[escudo] = [[0, m], [1, m]];
  }
  return out;
}

/**
 * Guerreiro (GLB do dono, esqueleto Mixamo de 61 ossos): o mesmo conjunto de `warriorRigClips`, com o golpe básico e
 * a investida re-cronometrados para o impacto do jogo. Os demais conjuntos (monstros, feiticeira, bruxa) não mudam.
 */
export function warriorRigHeroClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const andar = mocapKeys(raw.walk);
  const swing = (name: string, lines: Record<string, Timeline>, duration: number): THREE.AnimationClip =>
    poseClip(
      name,
      duration,
      rampaDoAndar(override(retime(mocapKeys(raw.attack), raw.attack.duration, duration), duration, comEscudoParado(lines, andar)), andar, duration),
      rig,
    );
  return {
    ...warriorRigClips(bones),
    attack: swing('attack', HERO_SLASH, DURATION.attack),
    heavy: swing('heavy', HERO_SMASH, 0.6),
  };
}
