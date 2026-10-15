import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';
import type { ClipName } from './anims';
import { mocapKeys } from './mocapDirs';
import { buildRig, poseClip, type JointPose, type PoseKey, type V3 } from './rigPose';
import { ualMixamoClips } from './ualMixamo';
import { warriorRigClips } from './warriorAnims';
import { monsterRigAttackClips, smoothAims, SMOOTH_SIGMA_BODY } from './monsterRigAttackAnims';

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

/**
 * Fase da queda em que a malha já está no chão (0..1 da duração): o quadril sobe `liftLying` entre `from` e `to`.
 * Depois do impacto e do quique (~1,0 s a 1,4 s no clipe de 2,4 s) o corpo deitado fica no nível de pé.
 */
const LIFT_PHASE = { from: 0.4, to: 0.6 };

/**
 * Malha deitada no chão (monstros de rig Mixamo): a pose só alinha as juntas ao chão (`ground: 'body'`), e a malha
 * skinada desce abaixo delas (cabeça, costas, pernas) 0,16 a 0,50 unidades do modelo. `lift` (unidades do modelo,
 * `deathLift` em visualConfig.ts) sobe o quadril no clipe, em rampa entre `LIFT_PHASE`: antes da queda não muda nada
 * (a pose de pé segue igual), e no fim o ponto mais baixo da malha fica no nível do corpo de pé.
 */
export function liftLying(clip: THREE.AnimationClip, lift: number): THREE.AnimationClip {
  if (!lift) return clip;
  const tracks = clip.tracks.map((t) => {
    if (t.name !== 'Hips.position') return t;
    const v = Array.from(t.values);
    for (let i = 0; i < t.times.length; i++) {
      const w = smooth((t.times[i] / clip.duration - LIFT_PHASE.from) / (LIFT_PHASE.to - LIFT_PHASE.from));
      v[i * 3 + 1] += lift * w;
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), v);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Elevação do quadril por tempo (curva medida na pose, `deathLiftCurve` em visualConfig.ts): `curve` = [[segundos, elevação],
 * ...] em unidades do modelo, interpolada linear entre os pontos. Só sobe onde a malha afundaria no chão; o resto do clipe
 * segue a pose. Para o monstro de rig Mixamo com morte de elevação constante, usar `liftLying`.
 */
export function liftCurve(clip: THREE.AnimationClip, curve: ReadonlyArray<readonly [number, number]>): THREE.AnimationClip {
  const at = (s: number): number => {
    if (s <= curve[0][0]) return curve[0][1];
    for (let k = 1; k < curve.length; k++) {
      const [t0, v0] = curve[k - 1];
      const [t1, v1] = curve[k];
      if (s <= t1) return v0 + ((s - t0) / (t1 - t0)) * (v1 - v0);
    }
    return curve[curve.length - 1][1];
  };
  const tracks = clip.tracks.map((t) => {
    if (t.name !== 'Hips.position') return t;
    const v = Array.from(t.values);
    for (let i = 0; i < t.times.length; i++) v[i * 3 + 1] += at(t.times[i]);
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), v);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * Cauda (dino, raydric): a cauda é skinada no quadril e fica atrás dele (z de `from` a `to`, em unidades do modelo).
 * Na pose de repouso, a inclinação do quadril (idle, andar) puxa a ponta para baixo do chão. Sobe os vértices do
 * quadril nessa faixa `amount` (degrau suave): o corpo (z > `from`) não muda. Mexe nas posições da malha (bind).
 */
export function raiseTail(pos: Float32Array, joint: Uint16Array | Uint8Array | Float32Array, weight: Float32Array, hipsJoint: number, cfg: { from: number; to: number; amount: number }): number {
  let n = 0;
  const count = pos.length / 3;
  for (let k = 0; k < count; k++) {
    let best = -1;
    let bw = -1;
    for (let c = 0; c < 4; c++) {
      const w = weight[k * 4 + c];
      if (w > bw) {
        bw = w;
        best = joint[k * 4 + c];
      }
    }
    if (best !== hipsJoint) continue;
    const z = pos[k * 3 + 2];
    const f = smooth((cfg.from - z) / (cfg.from - cfg.to));
    if (f <= 0) continue;
    pos[k * 3 + 1] += cfg.amount * f;
    n++;
  }
  return n;
}

/**
 * Morte do monstro de rig Mixamo (goblin, cultista): pernas esticadas na queda e pés assentados no chão (`ground: 'body'`).
 * Quem usa: `monsterRigClips` (goblins) e o cultista do bongun (`cultistClips` em glbMonsters.ts).
 */
export function monsterRigDeath(bones: BoneDef[]): THREE.AnimationClip {
  const raw = ualMixamoClips();
  const rig = buildRig(bones);
  const fall = poseClip('death', raw.death.duration, smoothAims(straightenLegs(mocapKeys(raw.death), raw.death.duration), SMOOTH_SIGMA_BODY), rig, {}, { ground: 'body' });
  return lowerStanding(fall, raw.death.duration);
}

/** Conjunto de clipes dos monstros de rig Mixamo: o do guerreiro (golpe próprio, sem o estalo) e a morte com as pernas esticadas. */
export function monsterRigClips(bones: BoneDef[]): Record<ClipName, THREE.AnimationClip> {
  const raw = ualMixamoClips();
  const rig = buildRig(bones);
  // andar: a captura do passo com o mesmo filtro (sem pico de 1 ou 2 quadros no joelho)
  const walk = poseClip('walk', raw.walk.duration, smoothAims(mocapKeys(raw.walk), SMOOTH_SIGMA_BODY, raw.walk.duration), rig);
  return { ...warriorRigClips(bones), ...monsterRigAttackClips(bones), walk, death: monsterRigDeath(bones) };
}
