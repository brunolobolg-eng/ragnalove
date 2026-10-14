import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type JointPose, type PoseKey, type V3 } from './rigPose';
import { ualMixamoClips } from './ualMixamo';
import { warriorRigClips } from './warriorAnims';

/**
 * Variante do conjunto `warriorRig` para os monstros de rig Mixamo (goblin, dino, raydric). A base é o
 * `warriorRigClips` (andar, ataque, dano e descanso ficam como estão, sem mexer no Guerreiro). Só a MORTE é própria:
 * a captura Death01 deixa as pernas dobradas no ar depois da queda (os pés ficam ~0,45 acima do chão por quase 1 s,
 * com o corpo já deitado). Na segunda metade da queda, as pernas viram para a direção do próprio corpo (esticadas,
 * como num corpo deitado) e os pés assentam no chão.
 */

/**
 * Direção das pernas na queda (no modelo: X = esquerda, Y = cima, Z = frente): esticadas, pés para baixo do quadril.
 * A cabeça não usa direção fixa: segue a coluna (Spine2), porque no chão a coluna está deitada e a cabeça vai junto.
 */
const STRAIGHT: Record<string, V3> = {
  LeftUpLeg: [0.12, -1, 0],
  LeftLeg: [0.06, -1, 0],
  RightUpLeg: [-0.12, -1, 0],
  RightLeg: [-0.06, -1, 0],
};

/** Fase da queda (0..1 da duração) em que a virada começa e em que termina. */
const BLEND = { from: 0.3, to: 0.55 };

const vec = (a: V3): THREE.Vector3 => new THREE.Vector3(...a);

/** Rampa suave (0 → 1) entre `from` e `to`. */
function smooth(x: number): number {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
}

/**
 * Chaves da captura com pernas e cabeça viradas para a direção da queda (interpolada na fase da queda).
 * Depois da virada o quadril ainda sobe/desce 0,1 até o descanso dos pés: a folga do chão do corpo deitado
 * (rigPose, BODY_CLEARANCE) não deve valer de pé, então `lowerStanding` a tira enquanto o corpo está de pé.
 */
function straightenLegs(keys: PoseKey[], duration: number): PoseKey[] {
  return keys.map((k) => {
    const p = k.t / duration;
    const w = smooth((p - BLEND.from) / (BLEND.to - BLEND.from));
    if (w <= 0) return k;
    const joints: Record<string, JointPose> = { ...k.joints };
    const turn = (bone: string, target: V3 | undefined) => {
      const now = joints[bone]?.aim;
      if (!now || !target) return;
      const dir = vec(now).normalize().lerp(vec(target).normalize(), w).normalize();
      joints[bone] = { ...joints[bone], aim: [dir.x, dir.y, dir.z] };
    };
    for (const [bone, target] of Object.entries(STRAIGHT)) turn(bone, target);
    turn('Head', joints.Spine2?.aim);
    return { ...k, joints };
  });
}

/** Folga do chão do corpo deitado (mesmo valor de rigPose.ts): só vale quando o corpo está no chão. */
const LYING_CLEARANCE = 0.1;

/** Tira a folga do quadril enquanto o corpo está de pé (pés no chão no início da morte, sem flutuar). */
function lowerStanding(clip: THREE.AnimationClip, duration: number): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    if (t.name !== 'Hips.position') return t;
    const v = Array.from(t.values);
    for (let i = 0; i < t.times.length; i++) {
      const w = smooth((t.times[i] / duration - BLEND.from) / (BLEND.to - BLEND.from));
      v[i * 3 + 1] -= LYING_CLEARANCE * (1 - w);
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), v);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/** Conjunto de clipes dos monstros de rig Mixamo: o do guerreiro, com a morte com as pernas esticadas. */
export function monsterRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const raw = ualMixamoClips();
  const rig = buildRig(bones);
  const fall = poseClip('death', raw.death.duration, straightenLegs(mocapKeys(raw.death), raw.death.duration), rig, {}, { ground: 'body' });
  return { ...warriorRigClips(bones), death: lowerStanding(fall, raw.death.duration) };
}
