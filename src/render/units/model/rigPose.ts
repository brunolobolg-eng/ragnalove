import * as THREE from 'three';
import type { BoneDef } from './ModelBuilder';

/**
 * Animação por direção de membro para rigs Mixamo (cabeça, coluna, braços, pernas, pés).
 *
 * Em vez de girar cada osso no eixo local (que depende da convenção de cada modelo), a pose diz para
 * onde cada osso APONTA no espaço do corpo: X = lado esquerdo do herói, Y = para cima, Z = para frente.
 * O solver converte isso em rotações locais, na ordem da hierarquia. Uma direção é relativa ao movimento
 * do pai: se a coluna inclina, os braços inclinam junto (e um giro de tronco leva as mãos).
 *
 * Por padrão os pés ficam no chão em cada chave: o quadril sobe e desce sozinho para a perna de apoio tocar o
 * solo, então o passo não precisa de altura escrita à mão. Numa queda, o apoio passa a ser o corpo (`ground`).
 */

export type V3 = [number, number, number];

/**
 * Pose de um osso. `aim`: direção (corpo) do osso até o filho principal, em coordenadas do corpo.
 * `twist`: giro em torno dessa direção, em graus. Osso sem `aim` fica no descanso, seguindo o pai.
 */
export interface JointPose {
  aim?: V3;
  twist?: number;
  /** rotação local extra (graus, XYZ) em cima do descanso: dedos fechados, punho */
  rot?: V3;
}

export interface PoseKey {
  /** instante em segundos (crescente; a última chave deve coincidir com a duração do clipe). */
  t: number;
  joints?: Record<string, JointPose>;
  /** deslocamento do quadril no espaço do corpo, em unidades do modelo. */
  hips?: V3;
}

export interface PoseClipOptions {
  /**
   * Como o corpo se apoia no chão em cada chave:
   * 'feet' (padrão) = tornozelos no chão; 'body' = o ponto mais baixo do tronco/cabeça/pés no chão (queda
   * de costas); 'none' = sem ajuste (o quadril vai onde a chave mandar).
   */
  ground?: 'feet' | 'body' | 'none';
}

/** Pontos que tocam o chão numa queda: quadril, coluna, cabeça e pés. */
const BODY_CONTACT = ['Hips', 'Spine1', 'Spine2', 'Head', 'LeftFoot', 'RightFoot'];
/** Folga entre a linha do esqueleto e a superfície do corpo (metade da espessura do tronco deitado). */
const BODY_CLEARANCE = 0.1;

/** Osso "filho principal": é a direção que o osso aponta (o antebraço aponta para a mão, a coxa para a canela). */
const PRIMARY_CHILD: Record<string, string> = {
  Hips: 'Spine',
  Spine: 'Spine1',
  Spine1: 'Spine2',
  Spine2: 'Neck',
  Neck: 'Head',
  Head: 'Head_top',
  LeftShoulder: 'LeftArm',
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
};

const FEET = ['LeftFoot', 'RightFoot'];
const D = Math.PI / 180;

interface RigNode {
  name: string;
  parent?: string;
  /** posição de descanso (no espaço do pai) */
  pos: THREE.Vector3;
  /** rotação de descanso (local) */
  rest: THREE.Quaternion;
  /** rotação de descanso (mundo) */
  restW: THREE.Quaternion;
  /** direção do osso no seu próprio espaço local (até o filho principal) */
  dirL?: THREE.Vector3;
}

export interface Rig {
  /** ossos em ordem hierárquica (pais antes dos filhos) */
  order: RigNode[];
  nodes: Map<string, RigNode>;
  /** altura do tornozelo no descanso: referência para manter o pé no chão */
  restFootY: number;
}

export function buildRig(bones: BoneDef[]): Rig {
  const defs = new Map(bones.map((b) => [b.name, b]));
  const depth = (b: BoneDef): number => (b.parent && defs.has(b.parent) ? depth(defs.get(b.parent)!) + 1 : 0);
  const sorted = [...bones].sort((a, b) => depth(a) - depth(b));
  const nodes = new Map<string, RigNode>();
  for (const d of sorted) {
    const parent = d.parent && defs.has(d.parent) ? d.parent : undefined;
    const rest = d.rest ? new THREE.Quaternion(...d.rest) : new THREE.Quaternion();
    const restW = parent ? nodes.get(parent)!.restW.clone().multiply(rest) : rest.clone();
    nodes.set(d.name, { name: d.name, parent, pos: new THREE.Vector3(...d.pos), rest, restW });
  }
  for (const n of nodes.values()) {
    const child = PRIMARY_CHILD[n.name];
    if (child && nodes.has(child)) n.dirL = nodes.get(child)!.pos.clone().normalize();
    else if (/Foot$/.test(n.name)) n.dirL = new THREE.Vector3(0, 0, 1).applyQuaternion(n.restW.clone().invert());
  }
  const rig: Rig = { order: sorted.map((d) => nodes.get(d.name)!), nodes, restFootY: 0 };
  rig.restFootY = lowestY(solve(rig, {}, [0, 0, 0]).origin, FEET);
  return rig;
}

function lowestY(origin: Map<string, THREE.Vector3>, names: string[]): number {
  let y = Infinity;
  for (const f of names) if (origin.has(f)) y = Math.min(y, origin.get(f)!.y);
  return y;
}

/** Resolve a pose: rotação local de cada osso e posição (origem) de cada osso no espaço do modelo. */
function solve(rig: Rig, joints: Record<string, JointPose>, hips: V3): { local: Map<string, THREE.Quaternion>; origin: Map<string, THREE.Vector3> } {
  const local = new Map<string, THREE.Quaternion>();
  const worldQ = new Map<string, THREE.Quaternion>();
  const origin = new Map<string, THREE.Vector3>();
  for (const n of rig.order) {
    const parentNode = n.parent ? rig.nodes.get(n.parent)! : undefined;
    const pq = parentNode ? worldQ.get(parentNode.name)! : new THREE.Quaternion();
    const po = parentNode
      ? origin.get(parentNode.name)!.clone().add(n.pos.clone().applyQuaternion(pq))
      : n.pos.clone().add(new THREE.Vector3(...hips));
    origin.set(n.name, po);

    // rotação do osso no mundo: descanso sobre o pai já animado
    const w = pq.clone().multiply(n.rest);
    const jp = joints[n.name];
    if (jp?.rot) w.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(jp.rot[0] * D, jp.rot[1] * D, jp.rot[2] * D)));
    if (jp?.aim && n.dirL) {
      // direção absoluta no corpo (a captura já traz o movimento do tronco em cada membro)
      const target = new THREE.Vector3(...jp.aim).normalize();
      const now = n.dirL.clone().applyQuaternion(w);
      w.premultiply(new THREE.Quaternion().setFromUnitVectors(now, target));
      if (jp.twist) w.premultiply(new THREE.Quaternion().setFromAxisAngle(target, jp.twist * D));
    }
    worldQ.set(n.name, w);
    local.set(n.name, pq.clone().invert().multiply(w));
  }
  return { local, origin };
}

/** Clipe de pose: chaves com direções de membro, interpoladas por slerp (linear) entre chaves. */
export function poseClip(name: string, duration: number, keys: PoseKey[], rig: Rig, base: Record<string, JointPose> = {}, opts: PoseClipOptions = {}): THREE.AnimationClip {
  const root = rig.order[0];
  const ground = opts.ground ?? 'feet';
  const times = keys.map((k) => k.t);
  const tracks = new Map(rig.order.map((n) => [n.name, [] as number[]]));
  const hipsValues: number[] = [];
  for (const k of keys) {
    const hips = k.hips ?? [0, 0, 0];
    const solved = solve(rig, { ...base, ...(k.joints ?? {}) }, hips);
    for (const n of rig.order) {
      const q = solved.local.get(n.name)!;
      tracks.get(n.name)!.push(q.x, q.y, q.z, q.w);
    }
    const dy =
      ground === 'feet' ? rig.restFootY - lowestY(solved.origin, FEET)
      : ground === 'body' ? rig.restFootY + BODY_CLEARANCE - lowestY(solved.origin, BODY_CONTACT)
      : 0;
    hipsValues.push(root.pos.x + hips[0], root.pos.y + hips[1] + dy, root.pos.z + hips[2]);
  }
  const out: THREE.KeyframeTrack[] = rig.order.map((n) => new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, times, tracks.get(n.name)!));
  out.push(new THREE.VectorKeyframeTrack(`${root.name}.position`, times, hipsValues));
  return new THREE.AnimationClip(name, duration, out);
}
