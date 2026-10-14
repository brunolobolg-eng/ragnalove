import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { ualMixamoClips } from './ualMixamo';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type PoseKey, type V3 } from './rigPose';
import { warriorRigClips } from './warriorAnims';

/**
 * Animações dos mini-chefes goblin (Krexx retorcido e Líder goblin). Variante própria, derivada do conjunto
 * warriorRig (que segue igual para o Guerreiro, a Feiticeira, a Bruxa e os goblins/dinos comuns).
 *
 * Ataque e magia vêm da captura UAL retargetada para o rig Mixamo (Punch_Jab e Spell_Simple_Shoot, ver
 * ualMixamo.ts). Só a captura crua abria o braço: a espada do Guerreiro (SLASH) puxava o braço direito
 * para fora, e a magia subia as mãos acima da cabeça. Por isso, por cima da captura, os braços ficam numa
 * caixa estreita: a abertura lateral e a altura do braço/antebraço são limitadas. O machado segue a mão
 * (KREXX_AXE, osso RightHand). Idle, andar, dano e morte continuam os do warriorRig.
 *
 * Direções no espaço do corpo: X = lado esquerdo do herói, Y = cima, Z = frente.
 */

/** Duração de cada golpe no combate (s), igual à do warriorRig. */
const DURATION = { attack: 0.6, cast: 0.85 } as const;

/** Limites da caixa dos braços (componente da direção, sem unidades). */
export const BOSS_ARM_BOX = {
  /** abertura lateral máxima do braço e do antebraço (|X|) */
  side: 0.3,
  /** altura máxima da direção do braço (Y): acima disso o cotovelo sobe para fora do tronco */
  upperTop: 0.35,
  /** altura máxima da direção do antebraço (Y): a mão fica na altura do peito, não acima da cabeça */
  foreTop: 0.45,
};

const ARMS = ['RightArm', 'LeftArm', 'RightForeArm', 'LeftForeArm'] as const;

/** Aperta a direção dos braços dentro da caixa (`BOSS_ARM_BOX`). Mexe só em `aim` dos braços. */
function boxArms(keys: PoseKey[], box: typeof BOSS_ARM_BOX): PoseKey[] {
  return keys.map((k) => {
    if (!k.joints) return k;
    const joints = { ...k.joints };
    for (const bone of ARMS) {
      const j = joints[bone];
      if (!j?.aim) continue;
      const [x, y, z] = j.aim;
      const top = bone.endsWith('ForeArm') ? box.foreTop : box.upperTop;
      const v = new THREE.Vector3(Math.max(-box.side, Math.min(box.side, x)), Math.min(y, top), z).normalize();
      joints[bone] = { ...j, aim: [v.x, v.y, v.z] as V3 };
    }
    return { ...k, joints };
  });
}

/** Troca o tempo da captura para a duração de combate (mesma regra do warriorRig). */
function retime(keys: PoseKey[], from: number, to: number): PoseKey[] {
  const f = to / from;
  return keys.map((k) => ({ ...k, t: k.t * f }));
}

export function goblinBossRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const rig = buildRig(bones);
  const raw = ualMixamoClips();
  const boxed = (name: string, clip: THREE.AnimationClip, duration: number): THREE.AnimationClip =>
    poseClip(name, duration, boxArms(retime(mocapKeys(clip), clip.duration, duration), BOSS_ARM_BOX), rig);
  return {
    ...warriorRigClips(bones),
    attack: boxed('attack', raw.attack, DURATION.attack),
    cast: boxed('cast', raw.cast, DURATION.cast),
  };
}
