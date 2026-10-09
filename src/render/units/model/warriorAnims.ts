import type * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { buildRig, dir, legDir, poseClip, type JointPose, type PoseKey, type V3 } from './rigPose';

/**
 * Animações do Guerreiro (modelo 3D, rig Mixamo). Direções no espaço do corpo: X = lado esquerdo do
 * herói (escudo), Y = cima, Z = frente. Ângulos de perna em graus a partir da vertical (+ = para frente).
 * Duração = tempo do clipe em segundos; golpes e habilidades são de uma vez só (ver ModelUnitView).
 */

/** Postura de guarda: escudo à frente (mão esquerda), espada erguida diagonal (mão direita). */
const GUARD: Record<string, JointPose> = {
  LeftArm: { aim: dir(0.45, -0.4, 0.8) },
  LeftForeArm: { aim: dir(0.15, 0.1, 1) },
  RightArm: { aim: dir(-0.5, -0.4, 0.8) },
  RightForeArm: { aim: dir(-0.15, 0.35, 0.92) },
};

/** Coluna e cabeça em pé, com a leve respiração do repouso. */
const UPRIGHT: Record<string, JointPose> = {
  Spine: { aim: dir(0, 1, 0.02) },
  Spine1: { aim: dir(0, 1, 0.02) },
  Head: { aim: dir(0, 1, 0.05) },
};

/** Perna de apoio: o pé fica reto para a frente; com a perna atrás, a ponta empurra o chão. */
const footAim = (push: number): V3 => dir(0, -0.35 * push, 1);

function pose(extra: Record<string, JointPose>, base: Record<string, JointPose> = GUARD): Record<string, JointPose> {
  return { ...base, ...extra };
}

/** Parado: respiração lenta (peito enche, cabeça olha de um lado ao outro). Fecha no próprio início. */
function idleKeys(): PoseKey[] {
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    { t: 0.6, joints: pose({ Spine: { aim: dir(0, 1, 0.05) }, Spine1: { aim: dir(0, 1, 0.04) }, Head: { aim: dir(0, 1, 0.05), twist: 2 } }) },
    { t: 1.2, joints: pose({ Spine: { aim: dir(0, 1, 0.03) }, Spine1: { aim: dir(0, 1, 0.02) }, Head: { aim: dir(0, 1, 0.05), twist: -5 } }) },
    { t: 1.8, joints: pose({ Spine: { aim: dir(0, 1, 0.05) }, Spine1: { aim: dir(0, 1, 0.04) }, Head: { aim: dir(0, 1, 0.05), twist: 4 } }) },
    { t: 2.4, joints: pose({ ...UPRIGHT }) },
  ];
}

/**
 * Andar: passo com peso. Cada perna descreve o balanço (coxa) e a dobra do joelho (mais forte no meio
 * do balanço, para a ponta não arrastar). O tronco gira contra as pernas e os braços acompanham.
 */
function walkKeys(): PoseKey[] {
  const N = 8;
  return Array.from({ length: N + 1 }, (_, i) => {
    const p = i / N;
    const ph = 2 * Math.PI * p;
    const aL = 24 * Math.cos(ph);
    const aR = -aL;
    const kL = (50 * (1 + Math.cos(2 * Math.PI * (p - 0.75)))) / 2;
    const kR = (50 * (1 + Math.cos(2 * Math.PI * (p - 0.25)))) / 2;
    const pushL = Math.max(0, -aL / 24);
    const pushR = Math.max(0, -aR / 24);
    return {
      t: p,
      joints: pose({
        Spine: { aim: dir(0, 1, 0.03), twist: -3 * Math.cos(ph) },
        Spine1: { aim: dir(0, 1, 0.02) },
        Head: { aim: dir(0, 1, 0.05), twist: 2 * Math.cos(ph) },
        LeftUpLeg: { aim: legDir(aL) },
        LeftLeg: { aim: legDir(aL - kL) },
        LeftFoot: { aim: footAim(pushL) },
        RightUpLeg: { aim: legDir(aR) },
        RightLeg: { aim: legDir(aR - kR) },
        RightFoot: { aim: footAim(pushR) },
      }),
    };
  });
}

/**
 * Golpe de espada (corte horizontal, da direita para a esquerda): a mão direita puxa para trás, o tronco
 * gira e a lâmina corta a frente; o escudo acompanha o corte e a perna da frente dá o passo.
 */
function attackKeys(): PoseKey[] {
  const shield = { LeftArm: { aim: dir(0.5, -0.3, 0.85) }, LeftForeArm: { aim: dir(0.2, 0.1, 1) } };
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    {
      t: 0.14,
      joints: pose({
        ...UPRIGHT,
        Spine: { aim: dir(0, 1, 0), twist: -28 },
        RightArm: { aim: dir(-0.75, 0.25, -0.55) },
        RightForeArm: { aim: dir(-0.45, 0.8, -0.35) },
        LeftArm: { aim: dir(0.4, -0.2, 0.9) },
        LeftUpLeg: { aim: legDir(-6) },
        RightUpLeg: { aim: legDir(10) },
      }),
    },
    {
      t: 0.28,
      joints: pose({
        ...UPRIGHT,
        Spine: { aim: dir(0, 1, 0), twist: 34 },
        RightArm: { aim: dir(0.55, -0.15, 0.85) },
        RightForeArm: { aim: dir(0.65, -0.05, 0.75) },
        ...shield,
        LeftUpLeg: { aim: legDir(16) },
        LeftLeg: { aim: legDir(4) },
        RightUpLeg: { aim: legDir(-8) },
        RightLeg: { aim: legDir(-14) },
      }),
    },
    {
      t: 0.4,
      joints: pose({
        ...UPRIGHT,
        Spine: { aim: dir(0, 1, 0), twist: 40 },
        RightArm: { aim: dir(0.3, -0.45, 0.9) },
        RightForeArm: { aim: dir(0.5, -0.3, 0.8) },
        ...shield,
        LeftUpLeg: { aim: legDir(16) },
        LeftLeg: { aim: legDir(4) },
        RightUpLeg: { aim: legDir(-8) },
        RightLeg: { aim: legDir(-14) },
      }),
    },
    { t: 0.6, joints: pose({ ...UPRIGHT }) },
  ];
}

/**
 * Investida (golpe pesado): a espada sobe por cima da cabeça, o corpo inclina para trás e desaba para a
 * frente com o passo longo; o impacto é travado no chão.
 */
function heavyKeys(): PoseKey[] {
  const raise = {
    Spine: { aim: dir(0, 1, -0.12) },
    Spine1: { aim: dir(0, 1, -0.06) },
    RightArm: { aim: dir(-0.25, 1, -0.05) },
    RightForeArm: { aim: dir(-0.05, 1, -0.2) },
    LeftArm: { aim: dir(0.4, 0.3, 0.9) },
    LeftUpLeg: { aim: legDir(-8) },
    LeftLeg: { aim: legDir(10) },
  };
  const smash = {
    Spine: { aim: dir(0, 1, 0.22) },
    Spine1: { aim: dir(0, 1, 0.12) },
    RightArm: { aim: dir(-0.05, -0.55, 1) },
    RightForeArm: { aim: dir(-0.05, -0.9, 0.45) },
    LeftArm: { aim: dir(0.5, -0.4, 0.8) },
    LeftUpLeg: { aim: legDir(34) },
    LeftLeg: { aim: legDir(10) },
    RightUpLeg: { aim: legDir(-22) },
    RightLeg: { aim: legDir(-6) },
  };
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    { t: 0.28, joints: pose({ ...UPRIGHT, ...raise }), hips: [0, 0, -0.02] },
    { t: 0.5, joints: pose({ ...UPRIGHT, ...smash }), hips: [0, -0.02, 0.1] },
    { t: 0.66, joints: pose({ ...UPRIGHT, ...smash }), hips: [0, -0.02, 0.1] },
    { t: 0.9, joints: pose({ ...UPRIGHT }) },
  ];
}

/** Grito de guerra / escudo erguido (habilidades de apoio): espada para o alto e escudo à frente. */
function castKeys(): PoseKey[] {
  const up = {
    Spine: { aim: dir(0, 1, -0.05) },
    Head: { aim: dir(0, 1, -0.25) },
    LeftArm: { aim: dir(0.35, 0.6, 0.7) },
    LeftForeArm: { aim: dir(0.1, 0.85, 0.5) },
    RightArm: { aim: dir(-0.9, 0.45, 0.15) },
    RightForeArm: { aim: dir(-0.6, 0.75, 0.25) },
  };
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    { t: 0.3, joints: pose({ ...UPRIGHT, ...up }) },
    { t: 0.6, joints: pose({ ...UPRIGHT, ...up }) },
    { t: 0.9, joints: pose({ ...UPRIGHT }) },
  ];
}

/** Dano: o tronco é jogado para trás, a cabeça estala e os braços abrem; volta à guarda. */
function hitKeys(): PoseKey[] {
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    {
      t: 0.07,
      joints: pose({
        Spine: { aim: dir(0, 1, -0.35) },
        Spine1: { aim: dir(0, 1, -0.2) },
        Head: { aim: dir(0, 1, -0.55) },
        LeftArm: { aim: dir(0.8, -0.1, 0.3) },
        RightArm: { aim: dir(-0.8, -0.1, 0.0) },
      }),
      hips: [0, 0, -0.08],
    },
    {
      t: 0.2,
      joints: pose({
        Spine: { aim: dir(0, 1, -0.2) },
        Head: { aim: dir(0, 1, -0.3) },
      }),
      hips: [0, 0, -0.04],
    },
    { t: 0.45, joints: pose({ ...UPRIGHT }) },
  ];
}

/**
 * Morte: tropeço para trás, os joelhos cedem e o corpo tomba de costas, com os braços abertos. O apoio é
 * pelo corpo (costas e cabeça no chão), não pelos pés, então a queda acontece sem o corpo afundar.
 */
function deathKeys(): PoseKey[] {
  const flat = {
    Spine: { aim: dir(0, 0.02, -1) },
    Spine1: { aim: dir(0, 0.02, -1) },
    Spine2: { aim: dir(0, 0.02, -1) },
    Head: { aim: dir(0, 0.05, -1) },
    LeftArm: { aim: dir(0.9, 0.05, -0.25) },
    RightArm: { aim: dir(-0.9, 0.05, -0.25) },
    LeftUpLeg: { aim: legDir(90) },
    LeftLeg: { aim: legDir(90) },
    RightUpLeg: { aim: legDir(90) },
    RightLeg: { aim: legDir(90) },
  };
  return [
    { t: 0, joints: pose({ ...UPRIGHT }) },
    {
      t: 0.2,
      joints: pose({
        Spine: { aim: dir(0, 1, -0.25) },
        Head: { aim: dir(0, 1, -0.45) },
        LeftArm: { aim: dir(0.85, 0.1, -0.4) },
        RightArm: { aim: dir(-0.85, 0.1, -0.5) },
      }),
      hips: [0, 0, -0.06],
    },
    {
      t: 0.55,
      joints: pose({
        Spine: { aim: dir(0, 0.7, -0.7) },
        Head: { aim: dir(0, 0.5, -0.9) },
        LeftUpLeg: { aim: legDir(20) },
        LeftLeg: { aim: legDir(-60) },
        RightUpLeg: { aim: legDir(15) },
        RightLeg: { aim: legDir(-55) },
      }),
      hips: [0, -0.2, -0.1],
    },
    { t: 1.1, joints: pose({ ...flat }), hips: [0, 0, -0.15] },
  ];
}

export function warriorRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const clip = (name: string, duration: number, keys: PoseKey[], ground: 'feet' | 'body' = 'feet'): THREE.AnimationClip =>
    poseClip(name, duration, keys, rig, {}, { ground });
  return {
    idle: clip('idle', 2.4, idleKeys()),
    walk: clip('walk', 1.0, walkKeys()),
    attack: clip('attack', 0.6, attackKeys()),
    heavy: clip('heavy', 0.9, heavyKeys()),
    cast: clip('cast', 0.9, castKeys()),
    hit: clip('hit', 0.45, hitKeys()),
    death: clip('death', 1.1, deathKeys(), 'body'),
  };
}
