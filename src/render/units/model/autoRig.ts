import * as THREE from 'three';
import { makeClip, withBase, type Key, type Pose } from './anims';
import type { BoneDef } from './ModelBuilder';

/**
 * Auto-rig humanoide para modelos 3D estáticos (ex.: GLB gerado por IA sem esqueleto).
 *
 * 1. Recebe as juntas (posições no espaço do modelo, olhando para +Z, lado esquerdo em +X).
 * 2. Classifica cada vértice por região (perna, braço, tronco, cabeça) e distribui os pesos
 *    ao longo da cadeia de ossos com transições suaves nas articulações.
 * 3. Devolve a geometria pronta para SkinnedMesh + os ossos no mesmo formato dos nossos
 *    personagens (instantiateSkeleton / makeClip funcionam igual).
 */
export interface HumanoidJoints {
  root: THREE.Vector3;
  hips: THREE.Vector3;
  spine: THREE.Vector3;
  chest: THREE.Vector3;
  neck: THREE.Vector3;
  head: THREE.Vector3;
  /** Lado esquerdo (+X); o direito é espelhado. */
  shoulder: THREE.Vector3;
  upperArm: THREE.Vector3;
  foreArm: THREE.Vector3;
  hand: THREE.Vector3;
  thigh: THREE.Vector3;
  shin: THREE.Vector3;
  foot: THREE.Vector3;
  /** |x| a partir do qual um vértice (abaixo do ombro) já é braço, e não tronco. */
  armX: number;
  /** y abaixo do qual o corpo vira pernas separadas. */
  crotchY: number;
}

const mirror = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);

export function humanoidBones(J: HumanoidJoints): BoneDef[] {
  const abs: [string, string | undefined, THREE.Vector3][] = [
    ['root', undefined, J.root],
    ['hips', 'root', J.hips],
    ['spine', 'hips', J.spine],
    ['chest', 'spine', J.chest],
    ['neck', 'chest', J.neck],
    ['head', 'neck', J.head],
  ];
  for (const s of ['L', 'R'] as const) {
    const f = s === 'L' ? (v: THREE.Vector3) => v : mirror;
    abs.push(
      [`shoulder.${s}`, 'chest', f(J.shoulder)],
      [`upperArm.${s}`, `shoulder.${s}`, f(J.upperArm)],
      [`foreArm.${s}`, `upperArm.${s}`, f(J.foreArm)],
      [`hand.${s}`, `foreArm.${s}`, f(J.hand)],
      [`thigh.${s}`, 'hips', f(J.thigh)],
      [`shin.${s}`, `thigh.${s}`, f(J.shin)],
      [`foot.${s}`, `shin.${s}`, f(J.foot)],
    );
  }
  const world = new Map(abs.map(([n, , p]) => [n, p]));
  return abs.map(([name, parent, p]) => {
    const rel = parent ? p.clone().sub(world.get(parent)!) : p.clone();
    return { name, parent, pos: [rel.x, rel.y, rel.z] as [number, number, number] };
  });
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Pesos de pele por região + blend suave ao longo de cada cadeia. */
export function skinHumanoid(geo: THREE.BufferGeometry, J: HumanoidJoints, bones: BoneDef[]): void {
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const pos = geo.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const B = 0.05; // meia-largura da transição nas juntas
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const ax = Math.abs(x);
    const s = x >= 0 ? 'L' : 'R';
    const w: [string, number][] = [];
    const chain = (names: string[], ys: number[]) => {
      // ys: y das juntas que separam os ossos (decrescente); names.length = ys.length + 1
      let prev = 1;
      for (let k = 0; k < ys.length; k++) {
        const below = 1 - smooth(ys[k] - B, ys[k] + B, y); // 1 abaixo da junta
        w.push([names[k], prev * (1 - below)]);
        prev *= below;
      }
      w.push([names[names.length - 1], prev]);
    };
    const shoulderY = J.upperArm.y;
    const isArm = y < shoulderY && ax > J.armX + Math.max(0, y - (shoulderY - 0.2)) * 0.4;
    if (y < J.crotchY + B && ax > 0.04) {
      // pernas (com a parte de cima misturando no quadril)
      const legW = 1 - smooth(J.crotchY - B, J.crotchY + B, y);
      const before = w.length;
      chain([`thigh.${s}`, `shin.${s}`, `foot.${s}`], [J.shin.y, J.foot.y + 0.06]);
      for (let k = before; k < w.length; k++) w[k][1] *= legW;
      w.push(['hips', 1 - legW]);
    } else if (y < J.crotchY + B) {
      w.push(['hips', 1]); // tanga/pano no meio: acompanha o quadril
    } else if (isArm) {
      chain([`upperArm.${s}`, `foreArm.${s}`, `hand.${s}`], [J.foreArm.y, J.hand.y]);
    } else if (y > shoulderY - 0.12 && ax > J.shoulder.x + 0.05) {
      // ombreiras: metade ombro, metade braço
      w.push([`shoulder.${s}`, 0.55], [`upperArm.${s}`, 0.45]);
    } else {
      chain(['head', 'neck', 'chest', 'spine', 'hips'], [J.head.y - 0.02, J.neck.y - 0.04, J.chest.y - 0.12, J.spine.y - 0.1]);
    }
    // normaliza e guarda os 4 maiores
    const top = w.filter(([, v]) => v > 1e-3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((a, [, v]) => a + v, 0) || 1;
    top.forEach(([name, v], k) => {
      si[i * 4 + k] = index.get(name)!;
      sw[i * 4 + k] = v / tot;
    });
    if (!top.length) {
      si[i * 4] = index.get('hips')!;
      sw[i * 4] = 1;
    }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
}

/** Caminhada pesada (1,3 s) para um chefe grande: passos largos, balanço e peso no pouso. */
export function heavyWalkClip(bones: BoneDef[]): THREE.AnimationClip {
  const BASE: Pose = {
    spine: [6, 0, 0],
    head: [-6, 0, 0],
    'upperArm.L': [0, 0, 6],
    'upperArm.R': [0, 0, -6],
    'foreArm.L': [-18, 0, 0],
    'foreArm.R': [-18, 0, 0],
  };
  const step = (s: 1 | -1, t: number): Key => ({
    t,
    hips: [0, -0.035, 0],
    pose: {
      hips: [0, 5 * s, -3 * s],
      spine: [8, -7 * s, 2 * s],
      chest: [2, -5 * s, 0],
      head: [-6, 6 * s, 0],
      'thigh.L': [-26 * s, 0, 0],
      'shin.L': [s > 0 ? 6 : 34, 0, 0],
      'foot.L': [s > 0 ? 14 : -10, 0, 0],
      'thigh.R': [26 * s, 0, 0],
      'shin.R': [s > 0 ? 34 : 6, 0, 0],
      'foot.R': [s > 0 ? -10 : 14, 0, 0],
      'upperArm.L': [24 * s, 0, 8],
      'upperArm.R': [-24 * s, 0, -8],
      'foreArm.L': [s > 0 ? -12 : -38, 0, 0],
      'foreArm.R': [s > 0 ? -38 : -12, 0, 0],
      'shoulder.L': [0, 0, 3 * s],
      'shoulder.R': [0, 0, 3 * s],
    },
  });
  const pass = (t: number, s: 1 | -1): Key => ({
    t,
    hips: [0, 0.03, 0],
    pose: {
      hips: [0, 0, 4 * s],
      spine: [7, 0, -2 * s],
      'thigh.L': [s > 0 ? 8 : -8, 0, 0],
      'thigh.R': [s > 0 ? -8 : 8, 0, 0],
      'shin.L': [s > 0 ? 10 : 45, 0, 0],
      'shin.R': [s > 0 ? 45 : 10, 0, 0],
      'upperArm.L': [0, 0, 7],
      'upperArm.R': [0, 0, -7],
    },
  });
  const D = 1.3;
  const keys = withBase(BASE, [step(1, 0), pass(D * 0.25, 1), step(-1, D * 0.5), pass(D * 0.75, -1), step(1, D)]);
  return makeClip('walk', D, keys, bones, BASE);
}

/**
 * Detecta as juntas de um humanoide em pé (frente +Z, esquerda +X) fatiando a malha na altura:
 * pernas = dois blocos separados embaixo; braços = blocos que se descolam do tronco dos lados;
 * cabeça/pescoço/peito pelas proporções a partir do topo. Funciona com modelos gerados por IA
 * em pose neutra ou "A". Retorna as mesmas juntas que o auto-rig usa.
 */
export function detectHumanoidJoints(geo: THREE.BufferGeometry): HumanoidJoints {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.attributes.position;
  const H = bb.max.y - bb.min.y;
  const minY = bb.min.y;
  const SL = 64;
  const BINS = 96;
  const x0 = bb.min.x;
  const bw = (bb.max.x - bb.min.x) / BINS;
  const occ: Uint8Array[] = [];
  const zSum: Float32Array[] = [];
  const zCnt: Uint32Array[] = [];
  for (let s = 0; s < SL; s++) {
    occ.push(new Uint8Array(BINS));
    zSum.push(new Float32Array(BINS));
    zCnt.push(new Uint32Array(BINS));
  }
  for (let i = 0; i < pos.count; i++) {
    const s = Math.min(SL - 1, Math.floor(((pos.getY(i) - minY) / H) * SL));
    const b = Math.min(BINS - 1, Math.floor((pos.getX(i) - x0) / bw));
    occ[s][b] = 1;
    zSum[s][b] += pos.getZ(i);
    zCnt[s][b]++;
  }
  type Cl = { a: number; b: number; lo: number; hi: number; c: number; z: number };
  const clusters = (s: number): Cl[] => {
    const out: Cl[] = [];
    let st = -1;
    for (let b = 0; b <= BINS; b++) {
      const on = b < BINS && occ[s][b];
      if (on && st < 0) st = b;
      if (!on && st >= 0) {
        let zs = 0;
        let zc = 0;
        for (let k = st; k < b; k++) {
          zs += zSum[s][k];
          zc += zCnt[s][k];
        }
        const lo = x0 + st * bw;
        const hi = x0 + b * bw;
        out.push({ a: st, b, lo, hi, c: (lo + hi) / 2, z: zc ? zs / zc : 0 });
        st = -1;
      }
    }
    return out;
  };
  const yOf = (s: number) => minY + ((s + 0.5) / SL) * H;
  const sliceAt = (y: number) => Math.max(0, Math.min(SL - 1, Math.floor(((y - minY) / H) * SL)));

  // --- entreperna: topo da sequência mais baixa de fatias com 2+ blocos estreitos ---
  // (pernas separadas; funciona com pés grudados de chibi, onde o "meio vazio" nunca aparece)
  const narrow2 = (s: number): Cl[] => clusters(s).filter((c) => c.hi - c.lo < 0.3 * H);
  let crotch = sliceAt(minY + 0.45 * H);
  let runTop = -1;
  let runBottom = -1;
  for (let s = 1; s < SL * 0.6; s++) {
    if (narrow2(s).length >= 2) {
      if (runBottom < 0) runBottom = s;
      runTop = s;
    } else if (runTop >= 0 && s - runTop > 2) break; // sequência terminou (tolerância de 2 fatias)
  }
  if (runTop >= 0 && runBottom >= 0 && yOf(runBottom) < minY + 0.25 * H && yOf(runTop) < minY + 0.5 * H) {
    crotch = runTop;
  } else {
    // fallback: sobe do chão enquanto o meio (x≈0) estiver vazio (humanoides altos, pés separados)
    for (let s = 1; s < SL * 0.6; s++) {
      const mid = Math.floor(-x0 / bw);
      if (occ[s][mid] || occ[s][mid - 1] || occ[s][mid + 1]) {
        crotch = s;
        break;
      }
    }
  }
  const crotchY = yOf(crotch) + 0.02 * H;
  const legLen = Math.max(0.1 * H, crotchY - minY); // pernas curtas de chibi x longas de humanoide
  const legAt = (y: number) => {
    const cl = clusters(sliceAt(y)).filter((c) => c.c > 0.02 * H);
    // perna esquerda = bloco com centro positivo mais próximo do meio (mãos ficam mais para fora)
    cl.sort((p, q) => p.c - q.c);
    return cl[0] ?? { c: 0.1 * H, z: 0 };
  };
  const thighY = crotchY + 0.03 * H; // encaixe do quadril fica um pouco acima da entreperna
  const shinY = minY + 0.5 * legLen; // joelho
  const footY = minY + 0.12 * legLen; // tornozelo
  const lThigh = legAt(crotchY - 0.25 * legLen);
  const lShin = legAt(shinY);
  const lFoot = legAt(footY + 0.02 * H);

  // --- braços: acima da entreperna, blocos laterais separados do tronco ---
  let sepTop = -1;
  let handBottom = Infinity;
  const gaps: number[] = [];
  const armCenters: { y: number; c: number; z: number }[] = [];
  for (let s = SL - 1; s >= 2; s--) {
    const y = yOf(s);
    if (y > minY + 0.85 * H) continue;
    const cl = clusters(s);
    const center = cl.find((c) => c.lo <= 0 && c.hi >= 0);
    const right = cl.filter((c) => c.lo > (center ? center.hi : lThigh.c + 0.08 * H));
    if (!right.length) continue;
    const arm = right[right.length - 1];
    if (y < crotchY && arm.lo < lThigh.c + 0.06 * H) continue; // embaixo, não confundir com a perna
    if (sepTop < 0) sepTop = y;
    handBottom = Math.min(handBottom, y - (0.5 / SL) * H);
    if (center && y > crotchY) gaps.push((center.hi + arm.lo) / 2);
    armCenters.push({ y, c: arm.c, z: arm.z });
  }
  if (sepTop < 0) {
    sepTop = minY + 0.6 * H;
    handBottom = minY + 0.4 * H;
  }
  gaps.sort((a, b) => a - b);
  const armX = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0.18 * H;
  const shoulderY = sepTop + 0.06 * H;
  const wristY = handBottom + 0.11 * H;
  const elbowY = (shoulderY + wristY) / 2;
  const armAt = (y: number) => {
    let best = armCenters[0] ?? { y, c: armX + 0.05 * H, z: 0 };
    for (const a of armCenters) if (Math.abs(a.y - y) < Math.abs(best.y - y)) best = a;
    return best;
  };
  const sh = armAt(Math.min(sepTop, shoulderY));
  const el = armAt(elbowY);
  const wr = armAt(wristY);

  const maxY = bb.max.y;
  const neckY = maxY - 0.17 * H;
  const hipsY = crotchY + 0.1 * legLen;
  const chestY = neckY - 0.17 * H;
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  return {
    root: V(0, minY),
    hips: V(0, hipsY),
    spine: V(0, (hipsY + chestY) / 2),
    chest: V(0, chestY),
    neck: V(0, neckY),
    head: V(0, neckY + 0.05 * H),
    shoulder: V(sh.c * 0.5, shoulderY + 0.03 * H),
    upperArm: V(sh.c, shoulderY),
    foreArm: V(el.c, elbowY, el.z),
    hand: V(wr.c, wristY, wr.z),
    thigh: V(lThigh.c * 0.85, thighY),
    shin: V(lShin.c, shinY, lShin.z),
    foot: V(lFoot.c, footY, lFoot.z),
    armX,
    crotchY: crotchY - 0.02 * H,
  };
}

/** Animações genéricas de um chefe humanoide grande (mesmos nomes de clipe dos outros personagens). */
export function bossClips(bones: BoneDef[]): Record<'idle' | 'walk' | 'attack' | 'heavy' | 'cast' | 'hit' | 'death', THREE.AnimationClip> {
  const BASE: Pose = {
    spine: [6, 0, 0],
    head: [-6, 0, 0],
    'upperArm.L': [0, 0, 6],
    'upperArm.R': [0, 0, -6],
    'foreArm.L': [-18, 0, 0],
    'foreArm.R': [-18, 0, 0],
    'thigh.L': [-4, 0, 2],
    'thigh.R': [4, 0, -2],
    'shin.L': [8, 0, 0],
    'shin.R': [6, 0, 0],
  };
  const idle = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 1.2, hips: [0, -0.015, 0], pose: { chest: [4, 0, 0], 'shoulder.L': [0, 0, 4], 'shoulder.R': [0, 0, -4], head: [-9, 5, 0], 'foreArm.L': [-24, 0, 0], 'foreArm.R': [-24, 0, 0] } },
    { t: 2.4, pose: {} },
  ]);
  // Esmagada: ergue o braço direito por cima da cabeça e desce com o corpo inteiro
  const smash = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.22, hips: [0, 0.02, -0.04], pose: { spine: [-10, 14, 0], chest: [-8, 6, 0], head: [-14, 0, 0], 'upperArm.R': [-165, 0, -18], 'foreArm.R': [-45, 0, 0], 'upperArm.L': [-30, 0, 30], 'foreArm.L': [-50, 0, 0], 'thigh.L': [-14, 0, 2], 'shin.L': [12, 0, 0] } },
    { t: 0.36, hips: [0, -0.08, 0.1], pose: { spine: [28, -10, 0], chest: [12, -6, 0], head: [4, 0, 0], 'upperArm.R': [-55, 0, -8], 'foreArm.R': [-8, 0, 0], 'upperArm.L': [10, 0, 20], 'thigh.L': [-34, 0, 2], 'shin.L': [38, 0, 0], 'thigh.R': [18, 0, -2], 'shin.R': [22, 0, 0] } },
    { t: 0.46, hips: [0, -0.08, 0.1], pose: { spine: [30, -10, 0], chest: [12, -6, 0], 'upperArm.R': [-48, 0, -8], 'foreArm.R': [-6, 0, 0], 'thigh.L': [-34, 0, 2], 'shin.L': [38, 0, 0], 'thigh.R': [18, 0, -2], 'shin.R': [22, 0, 0] } },
    { t: 0.7, pose: {} },
  ]);
  // Rugido (entrada do chefe): peito aberto, braços para fora, cabeça para trás
  const roar = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.3, hips: [0, -0.03, 0], pose: { spine: [-14, 0, 0], chest: [-10, 0, 0], head: [-26, 0, 0], 'upperArm.L': [-40, 0, 55], 'upperArm.R': [-40, 0, -55], 'foreArm.L': [-70, 0, 0], 'foreArm.R': [-70, 0, 0] } },
    { t: 0.9, hips: [0, -0.03, 0], pose: { spine: [-14, 0, 0], chest: [-10, 0, 0], head: [-26, 0, 0], 'upperArm.L': [-40, 0, 58], 'upperArm.R': [-40, 0, -58], 'foreArm.L': [-72, 0, 0], 'foreArm.R': [-72, 0, 0] } },
    { t: 1.2, pose: {} },
  ]);
  const hit = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.08, hips: [0, -0.01, -0.05], pose: { spine: [-6, 0, 5], chest: [-8, 0, 0], head: [-20, 0, -6] } },
    { t: 0.35, pose: {} },
  ]);
  // Morte: joelhos cedem e cai de cara no chão
  const limp: Pose = { spine: [16, 0, 4], head: [20, 0, 16], 'upperArm.L': [-150, 0, 40], 'upperArm.R': [-140, 0, -45], 'foreArm.L': [-10, 0, 0], 'foreArm.R': [-20, 0, 0], 'thigh.L': [-8, 0, 6], 'thigh.R': [6, 0, -6], 'shin.L': [18, 0, 0], 'shin.R': [10, 0, 0] };
  const death = withBase(BASE, [
    { t: 0, pose: {} },
    { t: 0.3, hips: [0, -0.12, 0], pose: { spine: [18, 0, 6], head: [16, 0, 10], 'thigh.L': [-45, 0, 0], 'shin.L': [80, 0, 0], 'thigh.R': [-40, 0, 0], 'shin.R': [75, 0, 0], 'upperArm.L': [-30, 0, 30], 'upperArm.R': [-30, 0, -30] } },
    { t: 0.8, hips: [0, -0.05, -0.15], root: [86, 0, 0], pose: limp },
    { t: 0.9, hips: [0, -0.03, -0.17], root: [82, 0, 0], pose: limp },
    { t: 1.05, hips: [0, -0.05, -0.15], root: [86, 0, 0], pose: limp },
    { t: 1.4, hips: [0, -0.05, -0.15], root: [86, 0, 0], pose: limp },
  ]);
  const walk = heavyWalkClip(bones);
  return {
    idle: makeClip('idle', 2.4, idle, bones, BASE),
    walk,
    attack: makeClip('attack', 0.7, smash, bones, BASE),
    heavy: makeClip('heavy', 0.7, smash, bones, BASE),
    cast: makeClip('cast', 1.2, roar, bones, BASE),
    hit: makeClip('hit', 0.35, hit, bones, BASE),
    death: makeClip('death', 1.4, death, bones, BASE),
  };
}

export interface RiggedModel {
  geometry: THREE.BufferGeometry;
  bones: BoneDef[];
  height: number;
  map?: THREE.Texture;
  joints: HumanoidJoints;
}

/**
 * Prepara um GLB estático para virar personagem: junta as malhas, põe os pés em y = 0,
 * detecta as juntas, calcula os pesos e escolhe cor (textura do próprio GLB ou pintura por região).
 */
export function prepareRiggedModel(scene: THREE.Object3D, paint?: (x: number, y: number, z: number, h: number) => THREE.Color): RiggedModel {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | undefined;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = (m.geometry as THREE.BufferGeometry).clone().applyMatrix4(m.matrixWorld);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!map && mat?.map) map = mat.map;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    parts.push(g.index ? g : g);
  });
  const geo = parts.length === 1 ? parts[0] : mergeParts(parts);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  // pés no chão e centrado em X/Z
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  geo.computeVertexNormals();
  const H = bb.max.y - bb.min.y;
  const joints = detectHumanoidJoints(geo);
  const bones = humanoidBones(joints);
  skinHumanoid(geo, joints, bones);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < pos.count; i++) {
    const c = map || !paint ? white : paint(pos.getX(i), pos.getY(i), pos.getZ(i), H);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSmoothNormal', geo.attributes.normal.clone());
  if (!map) geo.deleteAttribute('uv');
  geo.computeBoundingSphere();
  return { geometry: geo, bones, height: H, map, joints };
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const hasUv = flat.every((p) => p.attributes.uv);
  const n = flat.reduce((s, p) => s + p.attributes.position.count, 0);
  const pos = new Float32Array(n * 3);
  const uv = hasUv ? new Float32Array(n * 2) : undefined;
  let o = 0;
  for (const p of flat) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    if (uv) uv.set(p.attributes.uv.array as Float32Array, o * 2);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Pintura por região do orc (o GLB veio sem textura). y e h no espaço com os pés em 0. */
export function paintOrc(x: number, y: number, z: number, h: number): THREE.Color {
  const ay = y - h / 2; // volta para o espaço original (centro em 0) em que a pintura foi medida
  const ax = Math.abs(x);
  let c = ORC_PAL.skin;
  if (ay > 0.5 && ax > 0.2) c = ORC_PAL.iron;
  if (ay > 0.62 && ax > 0.28) c = ORC_PAL.bone;
  else if (ay < -0.3) c = ay < -0.82 ? ORC_PAL.leather : ORC_PAL.iron;
  else if (ay > -0.35 && ay < 0.08 && ax < 0.33) c = ay > 0.0 ? ORC_PAL.leather : ORC_PAL.cloth;
  else if (ax > 0.42 && ay > -0.05 && ay < 0.18) c = ORC_PAL.leather;
  if (ay > 0.65 && ax < 0.2 && z > 0.1 && ay < 0.8) c = ORC_PAL.skinDark;
  return c;
}
const ORC_PAL = {
  skin: new THREE.Color(0x6f9a4a),
  skinDark: new THREE.Color(0x557a38),
  iron: new THREE.Color(0x4a4d55),
  leather: new THREE.Color(0x6b4526),
  cloth: new THREE.Color(0x5a3a2a),
  bone: new THREE.Color(0xd8cfb0),
};

/** Juntas medidas no orc.glb (altura 1,9, pés em y = −0,95, frente em +Z). */
export const ORC_JOINTS: HumanoidJoints = {
  root: new THREE.Vector3(0, -0.95, 0),
  hips: new THREE.Vector3(0, -0.26, 0),
  spine: new THREE.Vector3(0, 0.02, 0),
  chest: new THREE.Vector3(0, 0.3, 0),
  neck: new THREE.Vector3(0, 0.62, 0.02),
  head: new THREE.Vector3(0, 0.7, 0.04),
  shoulder: new THREE.Vector3(0.2, 0.5, 0),
  upperArm: new THREE.Vector3(0.38, 0.44, 0),
  foreArm: new THREE.Vector3(0.48, 0.1, 0.02),
  hand: new THREE.Vector3(0.47, -0.12, 0.04),
  thigh: new THREE.Vector3(0.2, -0.33, 0),
  shin: new THREE.Vector3(0.24, -0.62, 0.02),
  foot: new THREE.Vector3(0.29, -0.86, 0.03),
  armX: 0.34,
  crotchY: -0.36,
};
