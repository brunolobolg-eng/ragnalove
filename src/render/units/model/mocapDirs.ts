import * as THREE from 'three';
import { MOCAP_REF_DIR } from './mocapRefDirs';
import type { JointPose, PoseKey } from './rigPose';

/**
 * Captura de movimento (UAL, já no rig Mixamo do cultista) → direções de membro para o solver de pose.
 *
 * Para cada quadro, a rotação mundial de cada osso é o produto das rotações locais da cadeia. A direção
 * em que o osso aponta é essa rotação aplicada à direção de referência do próprio osso (mocapRefDirs).
 * Copiar essa direção (e não a rotação) faz o movimento sobreviver a outro rig: braço e perna saem com a
 * mesma inclinação do ator, sem herdar a diferença de descanso entre os dois modelos.
 */

/** Pai de cada osso na hierarquia da captura (mesma do rig Mixamo). */
const PARENT: Record<string, string> = {
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
};

/** Ossos cuja direção é copiada para o alvo (os que têm filho ou eixo de pé no rig de referência). */
const AIMED = Object.keys(MOCAP_REF_DIR);

/** Dedos da mão direita dobrados em volta do cabo (graus por falange). */
const FIST_RIGHT: Record<string, JointPose> = (() => {
  const out: Record<string, JointPose> = {};
  const curl: Record<string, number[]> = {
    Index: [70, 85, 55], Middle: [75, 90, 60], Ring: [75, 90, 60], Pinky: [70, 85, 55],
  };
  for (const [finger, angles] of Object.entries(curl)) {
    angles.forEach((a, i) => {
      out[`RightHand${finger}${i + 1}`] = { rot: [0, 0, a] };
    });
  }
  return out;
})();

/** Chaves de pose (uma por quadro da captura) com a direção de cada membro, em coordenadas do corpo. */
export function mocapKeys(clip: THREE.AnimationClip): PoseKey[] {
  const tracks = new Map<string, THREE.QuaternionKeyframeTrack>();
  for (const t of clip.tracks) {
    if (t instanceof THREE.QuaternionKeyframeTrack) tracks.set(t.name.slice(0, -'.quaternion'.length), t);
  }
  const times = Array.from(tracks.get('Hips')!.times);
  return times.map((t, i) => {
    const world = new Map<string, THREE.Quaternion>();
    const worldOf = (n: string): THREE.Quaternion => {
      const got = world.get(n);
      if (got) return got;
      const tr = tracks.get(n);
      const v = tr?.values;
      const local = v ? new THREE.Quaternion(v[i * 4], v[i * 4 + 1], v[i * 4 + 2], v[i * 4 + 3]) : new THREE.Quaternion();
      const p = PARENT[n];
      const w = p ? worldOf(p).clone().multiply(local) : local;
      world.set(n, w);
      return w;
    };
    const joints: Record<string, JointPose> = { ...FIST_RIGHT };
    for (const n of AIMED) {
      const dir = new THREE.Vector3(...MOCAP_REF_DIR[n]).applyQuaternion(worldOf(n));
      joints[n] = { aim: [dir.x, dir.y, dir.z] };
    }
    return { t, joints };
  });
}
