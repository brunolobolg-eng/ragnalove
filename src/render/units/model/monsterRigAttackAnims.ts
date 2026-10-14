import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type JointPose, type PoseKey, type V3 } from './rigPose';
import { ualMixamoClips } from './ualMixamo';

/**
 * Golpe dos monstros de rig Mixamo (goblin, dino, raydric). Mesma linha de tempo do golpe do guerreiro (SLASH e
 * SMASH, em warriorAnims.ts), mas com dois cuidados que o guerreiro não tem:
 *  - a direção do braço vai de um ponto da linha ao outro por slerp (arco na esfera), e não por lerp + normalização:
 *    o corte vai de um lado ao outro do corpo (quase opostos), e no meio o lerp passava perto da origem, a normalização
 *    jogava o braço de um lado ao outro num quadro (4000 graus/s no impacto);
 *  - a captura do tronco e do braço esquerdo (retimed para o golpe) passa por um filtro gaussiano no tempo: o
 *    soco da captura tinha um pico de 1 ou 2 quadros (3000 graus/s no antebraço esquerdo).
 * O instante do impacto não muda: o pico do corte cai no meio do trecho 0,22→0,45 do golpe básico (0,20 s) e no
 * do golpe pesado, 0,43 s (SET_IMPACT). Os números vêm de monsterRigAnims.ts; o guerreiro segue igual.
 *
 * Direções no espaço do corpo: X = lado esquerdo do herói, Y = cima, Z = frente.
 */

/** Duração de cada golpe no combate (s), igual à do warriorRig. */
const DURATION = { attack: 0.6, heavy: 0.9 } as const;

/** Largura (desvio-padrão, s) do filtro de tempo aplicado à captura do golpe. */
const SMOOTH_SIGMA = 0.035;

/** Linha de tempo de uma direção: pares [fase 0..1, direção]. */
type Timeline = [number, V3][];

/** Suavização do trecho (0..1): começa e termina sem velocidade, a mesma forma em todos os trechos. */
const ease = (k: number): number => k * k * (3 - 2 * k);

/** Direção no instante `p` da linha: arco (slerp) entre os pontos do trecho, com a velocidade suavizada. */
function sample(tl: Timeline, p: number): V3 {
  let i = 0;
  while (i < tl.length - 2 && p > tl[i + 1][0]) i++;
  const [p0, a] = tl[i];
  const [p1, b] = tl[i + 1];
  const k = p1 > p0 ? Math.min(1, Math.max(0, (p - p0) / (p1 - p0))) : 0;
  const from = new THREE.Vector3(...a).normalize();
  const to = new THREE.Vector3(...b).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from, to);
  const q = new THREE.Quaternion().slerp(turn, ease(k));
  const v = from.applyQuaternion(q);
  return [v.x, v.y, v.z];
}

/** Sobrescreve a direção de alguns ossos ao longo do clipe (fase = tempo / duração). */
function override(keys: PoseKey[], duration: number, lines: Record<string, Timeline>): PoseKey[] {
  return keys.map((k) => {
    const p = k.t / duration;
    const joints: Record<string, JointPose> = { ...k.joints };
    for (const [bone, tl] of Object.entries(lines)) joints[bone] = { ...joints[bone], aim: sample(tl, p) };
    return { ...k, joints };
  });
}

/** Troca o tempo da captura para a duração de combate (acelera golpes curtos, alonga habilidades). */
function retime(keys: PoseKey[], from: number, to: number): PoseKey[] {
  const f = to / from;
  return keys.map((k) => ({ ...k, t: k.t * f }));
}

/**
 * Filtro gaussiano no tempo sobre a direção de cada osso da captura (aim). Só suaviza: a média de direções
 * próximas é normalizada e não muda a fase do golpe. Os ossos sem `aim` (dedos) ficam como estão. Com `period`,
 * o clipe é tratado como um laço (o andar fecha sem emenda).
 */
export function smoothAims(keys: PoseKey[], sigma: number, period?: number): PoseKey[] {
  return keys.map((k) => {
    const joints: Record<string, JointPose> = { ...k.joints };
    for (const [bone, j] of Object.entries(k.joints ?? {})) {
      if (!j.aim) continue;
      const acc = new THREE.Vector3();
      let wsum = 0;
      for (const o of keys) {
        let dt = o.t - k.t;
        // clipe em laço (andar): a distância pega o outro lado do fim, sem costura no instante 0 = D
        if (period) dt -= period * Math.round(dt / period);
        const w = Math.exp(-(dt * dt) / (2 * sigma * sigma));
        if (w < 1e-3) continue;
        const a = o.joints?.[bone]?.aim;
        if (!a) continue;
        acc.addScaledVector(new THREE.Vector3(...a).normalize(), w);
        wsum += w;
      }
      if (wsum > 0) {
        const v = acc.normalize();
        joints[bone] = { ...j, aim: [v.x, v.y, v.z] };
      }
    }
    return { ...k, joints };
  });
}

/** Corte horizontal (direita → esquerda): preparação, corte no impacto (0,20 s) e recuperação. Mesmo traçado do SLASH. */
const CUT: Record<string, Timeline> = {
  RightArm: [
    [0, [-0.55, -0.45, 0.6]],
    [0.22, [-0.85, 0.25, -0.4]],
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

/** Investida de cima para baixo (0,43 s no impacto). Mesmo traçado do SMASH. */
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

/** Largura (s) do filtro das capturas de andar e de morte dos monstros de rig Mixamo (ver monsterRigAnims.ts). */
export const SMOOTH_SIGMA_BODY = 0.04;

/** Golpe básico e pesado dos monstros de rig Mixamo: captura suavizada no tempo + braço da arma em arco. */
export function monsterRigAttackClips(bones: BoneDef[]): { attack: THREE.AnimationClip; heavy: THREE.AnimationClip } {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const swing = (name: string, lines: Record<string, Timeline>, duration: number): THREE.AnimationClip =>
    poseClip(name, duration, override(smoothAims(retime(mocapKeys(raw.attack), raw.attack.duration, duration), SMOOTH_SIGMA), duration, lines), rig);
  return {
    attack: swing('attack', CUT, DURATION.attack),
    heavy: swing('heavy', SMASH, DURATION.heavy),
  };
}
