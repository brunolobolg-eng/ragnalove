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
    [0.45, [0.45, -0.05, 0.9]],
    [0.62, [0.55, -0.35, 0.75]],
    [1, [-0.55, -0.45, 0.6]],
  ],
  RightForeArm: [
    [0, [-0.3, -0.2, 0.95]],
    [0.22, [-0.55, 0.75, -0.35]],
    [0.45, [0.6, -0.05, 0.8]],
    [0.62, [0.7, -0.3, 0.65]],
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
