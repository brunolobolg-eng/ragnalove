import * as THREE from 'three';
import { G, ModelBuilder, type BuiltModel } from './ModelBuilder';

/**
 * Personagens 3D do Vanguarda — desenhos originais em proporção "chibi"
 * (cabeça grande), baseados nos nossos próprios sprites:
 *  - Guerreiro: cabelo loiro espetado, armadura de aço, túnica vermelha, escudo de madeira e espada.
 *  - Mago: cabelo castanho, túnica creme, manto vinho com capuz, bolsa e cajado com orbe âmbar.
 *  - Zumbi (grunt): cabeçorra cinza-esverdeada, olhos vermelhos, tanga rasgada, bola de ferro na corrente.
 */

// Paleta (sRGB; o THREE.Color converte para linear)
const C = {
  skin: 0xf4cfae,
  skinShade: 0xe2b08c,
  eye: 0x2b1a16,
  white: 0xffffff,
  mouth: 0x9a4a3a,
  // guerreiro
  blond: 0xf3c436,
  blondDark: 0xd99a1c,
  steel: 0xa7b0bb,
  steelDark: 0x6c7682,
  red: 0xa3302b,
  redDark: 0x6e1c1b,
  leather: 0x6d4527,
  leatherDark: 0x4a2d18,
  gold: 0xd8a735,
  wood: 0x94602f,
  woodDark: 0x6a4020,
  // mago
  brownHair: 0x5c3822,
  brownHairDark: 0x40261a,
  robe: 0xf1e6c8,
  robeShade: 0xd9c9a2,
  cloak: 0x7a1f2a,
  cloakIn: 0x4d1219,
  staff: 0x7b4a22,
  // zumbi
  zSkin: 0x8fa596,
  zSkinDark: 0x6f8577,
  zCloth: 0x6d4a33,
  zClothDark: 0x4c3222,
  iron: 0x3c3f46,
  ironLight: 0x5f636c,
};

/** Proporções do esqueleto humanoide. */
interface Body {
  hipsY: number;
  spine: number;
  chest: number;
  neck: number;
  shoulderW: number;
  upperArm: number;
  foreArm: number;
  hipW: number;
  thigh: number;
  shin: number;
  cape?: boolean;
}

function skeleton(b: ModelBuilder, p: Body): void {
  b.bone('root', undefined, [0, 0, 0])
    .bone('hips', 'root', [0, p.hipsY, 0])
    .bone('spine', 'hips', [0, p.spine, 0])
    .bone('chest', 'spine', [0, p.chest, 0])
    .bone('neck', 'chest', [0, p.neck, 0])
    .bone('head', 'neck', [0, 0.05, 0]);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.bone(`shoulder.${L}`, 'chest', [s * p.shoulderW, p.neck * 0.55, 0])
      .bone(`upperArm.${L}`, `shoulder.${L}`, [s * 0.04, 0, 0])
      .bone(`foreArm.${L}`, `upperArm.${L}`, [0, -p.upperArm, 0])
      .bone(`hand.${L}`, `foreArm.${L}`, [0, -p.foreArm, 0])
      .bone(`thigh.${L}`, 'hips', [s * p.hipW, -0.03, 0])
      .bone(`shin.${L}`, `thigh.${L}`, [0, -p.thigh, 0])
      .bone(`foot.${L}`, `shin.${L}`, [0, -p.shin, 0]);
  }
  if (p.cape) {
    b.bone('cape0', 'chest', [0, p.neck * 0.45, -0.15])
      .bone('cape1', 'cape0', [0, -0.24, -0.03])
      .bone('cape2', 'cape1', [0, -0.24, -0.02]);
  }
}

/** Duplica a superfície com normais invertidas (tecido fino visto por dentro). */
function twoSided(geo: THREE.BufferGeometry): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const outer = geo.index ? geo.toNonIndexed() : geo.clone();
  const inner = outer.clone();
  const p = inner.attributes.position.array as Float32Array;
  const n = inner.attributes.normal.array as Float32Array;
  for (let i = 0; i < p.length; i += 9) {
    // troca o 2º e 3º vértice do triângulo (inverte a face)
    for (let k = 0; k < 3; k++) {
      const a = p[i + 3 + k];
      p[i + 3 + k] = p[i + 6 + k];
      p[i + 6 + k] = a;
      const b = n[i + 3 + k];
      n[i + 3 + k] = n[i + 6 + k];
      n[i + 6 + k] = b;
    }
  }
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  // encolhe um tiquinho para não brigar no z-buffer com a face externa
  inner.scale(0.985, 1, 0.985);
  return { outer, inner };
}

/** Cabeça chibi: rosto, olhos grandes com brilho, orelhas, boca. `fierce` = sobrancelhas franzidas. */
function face(b: ModelBuilder, o: { r: number; skin: number; brow?: number; fierce?: boolean; eyeColor?: number; zombie?: boolean }): void {
  const r = o.r;
  const cy = r * 0.92; // centro da cabeça acima do osso "head"
  b.add('head', G.sphere(r, 20, 16), o.skin, { pos: [0, cy, 0], scale: [1, 0.94, 0.96] });
  // bochechas/mandíbula levemente mais larga embaixo (look chibi)
  b.add('head', G.sphere(r * 0.8, 14, 10), o.skin, { pos: [0, cy - r * 0.32, r * 0.1], scale: [1.08, 0.8, 1] });
  for (const s of [1, -1]) {
    b.add('head', G.sphere(r * 0.18, 8, 6), o.skin, { pos: [s * r * 0.95, cy - r * 0.05, 0], scale: [0.6, 1, 0.8] });
    if (!o.zombie) {
      // olho: íris escura grande + dois brilhos
      b.add('head', G.sphere(1, 12, 10), o.eyeColor ?? C.eye, { pos: [s * r * 0.36, cy - r * 0.08, r * 0.86], scale: [r * 0.17, r * 0.24, r * 0.1], rot: [0, s * 18, 0] });
      b.add('head', G.sphere(r * 0.06, 6, 5), C.white, { pos: [s * r * 0.31, cy + r * 0.0, r * 0.95] });
      b.add('head', G.sphere(r * 0.03, 5, 4), C.white, { pos: [s * r * 0.4, cy - r * 0.16, r * 0.95] });
      // sobrancelha
      b.add('head', G.box(r * 0.3, r * 0.06, r * 0.05), o.brow ?? C.eye, {
        pos: [s * r * 0.36, cy + r * 0.22, r * 0.9],
        rot: [0, s * 16, o.fierce ? -s * 16 : s * 4],
      });
    }
  }
  // boca pequena
  b.add('head', G.box(r * 0.16, r * 0.035, r * 0.04), C.mouth, { pos: [0, cy - r * 0.46, r * 0.9], rot: [0, 0, o.fierce ? 0 : 0] });
}

// =====================================================================
export function buildWarrior(): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.5, spine: 0.1, chest: 0.13, neck: 0.12, shoulderW: 0.15, upperArm: 0.17, foreArm: 0.16, hipW: 0.085, thigh: 0.2, shin: 0.21 };
  skeleton(b, P);
  const r = 0.27;
  face(b, { r, skin: C.skin, fierce: true, brow: C.blondDark });
  const cy = r * 0.92;
  // --- cabelo loiro espetado ---
  b.add('head', G.cap(r * 1.07, 88, 18, 8), C.blond, { pos: [0, cy + r * 0.04, -r * 0.05], rot: [-12, 0, 0] });
  const spikes: [number, number, number, number][] = [
    // [ângulo em volta (graus, 0 = frente), inclinação para cima (graus), tamanho, altura na cabeça]
    [0, 70, 0.2, 0.7],
    [35, 55, 0.22, 0.6],
    [-35, 55, 0.22, 0.6],
    [75, 40, 0.24, 0.35],
    [-75, 40, 0.24, 0.35],
    [120, 35, 0.26, 0.4],
    [-120, 35, 0.26, 0.4],
    [180, 30, 0.26, 0.45],
    [150, 55, 0.24, 0.75],
    [-150, 55, 0.24, 0.75],
    [90, 75, 0.2, 0.85],
    [-90, 75, 0.2, 0.85],
    [0, 88, 0.2, 1.0],
    [180, 70, 0.22, 0.85],
  ];
  for (const [yaw, up, len, h] of spikes) {
    const a = (yaw * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos((up * Math.PI) / 180), Math.sin((up * Math.PI) / 180), Math.cos(a) * Math.cos((up * Math.PI) / 180));
    const base = new THREE.Vector3(Math.sin(a) * r * 0.85 * Math.sqrt(1 - h * h * 0.6), cy + r * h * 0.9, Math.cos(a) * r * 0.85 * Math.sqrt(1 - h * h * 0.6));
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    const tipPos = base.clone().addScaledVector(dir, len * 0.45);
    b.add('head', G.cone(0.075, len, 5), yaw % 90 === 0 ? C.blond : C.blondDark, {
      pos: [tipPos.x, tipPos.y, tipPos.z],
      rot: [(e.x * 180) / Math.PI, (e.y * 180) / Math.PI, (e.z * 180) / Math.PI],
    });
  }
  // franja: mechas caindo na testa
  for (const [x, rz] of [
    [-0.12, -25],
    [0.0, 5],
    [0.11, 28],
    [-0.2, -45],
    [0.2, 45],
  ] as const) {
    b.add('head', G.cone(0.06, 0.2, 4), C.blond, { pos: [x, cy + r * 0.52, r * 0.78], rot: [200, 0, rz] });
  }

  // --- tronco ---
  b.add('neck', G.cyl(0.07, 0.08, 0.1), C.skinShade, { pos: [0, 0.0, 0] });
  b.add('spine', G.cyl(0.15, 0.16, 0.16, 12), C.red, { pos: [0, 0.02, 0] });
  // peitoral de aço + gola
  b.add('chest', G.sphere(0.19, 14, 10), C.steel, { pos: [0, 0.0, 0.01], scale: [1, 0.85, 0.82] });
  b.add('chest', G.box(0.2, 0.14, 0.04), C.steelDark, { pos: [0, -0.02, 0.15], rot: [8, 0, 0] });
  b.add('chest', G.torus(0.1, 0.03, 12), C.leather, { pos: [0, 0.1, 0], rot: [90, 0, 0] });
  // tiracolo de couro (bainha nas costas)
  b.add('chest', G.box(0.05, 0.36, 0.03), C.leather, { pos: [0.02, -0.02, 0.165], rot: [0, 0, 38] });
  // cinto + fivela
  b.add('hips', G.torus(0.16, 0.035, 14), C.leatherDark, { pos: [0, 0.07, 0], rot: [90, 0, 0] });
  b.add('hips', G.box(0.08, 0.06, 0.03), C.gold, { pos: [0, 0.07, 0.17] });
  // saia da túnica (vermelha) com faixa frontal
  b.add('hips', G.lathe([[0.165, 0.06], [0.2, -0.06], [0.235, -0.17]], 14), C.red);
  b.add('hips', G.box(0.13, 0.2, 0.02), C.redDark, { pos: [0, -0.06, 0.2], rot: [-10, 0, 0] });

  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    // ombreira de aço (duas placas)
    b.add(`upperArm.${L}`, G.cap(0.11, 95, 12, 6), C.steel, { pos: [s * 0.02, 0.0, 0], rot: [0, 0, -s * 30] });
    b.add(`upperArm.${L}`, G.cap(0.1, 70, 12, 5), C.steelDark, { pos: [s * 0.04, -0.06, 0], rot: [0, 0, -s * 40] });
    // braço: manga vermelha, braçadeira de couro, luva
    b.add(`upperArm.${L}`, G.capsule(0.055, 0.1), C.red, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.capsule(0.058, 0.09), C.leather, { pos: [0, -0.07, 0] });
    b.add(`foreArm.${L}`, G.torus(0.06, 0.015, 10), C.steelDark, { pos: [0, -0.02, 0], rot: [90, 0, 0] });
    b.add(`hand.${L}`, G.sphere(0.058, 10, 8), C.leatherDark, { pos: [0, -0.02, 0.01] });
    // pernas: calça vermelha, joelheira e caneleira de aço, bota
    b.add(`thigh.${L}`, G.capsule(0.07, 0.1), C.redDark, { pos: [0, -0.1, 0] });
    b.add(`shin.${L}`, G.sphere(0.07, 10, 8), C.steel, { pos: [0, 0.0, 0.03] });
    b.add(`shin.${L}`, G.capsule(0.068, 0.1), C.steel, { pos: [0, -0.1, 0.005] });
    b.add(`foot.${L}`, G.capsule(0.06, 0.08), C.steelDark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.1, 1, 0.8] });
  }

  // --- espada (mão direita), apontando para frente ---
  b.add('hand.R', G.cyl(0.022, 0.022, 0.14, 6), C.leatherDark, { pos: [0, -0.02, 0.02], rot: [90, 0, 0] });
  b.add('hand.R', G.box(0.2, 0.035, 0.04), C.gold, { pos: [0, -0.02, 0.1] });
  b.add('hand.R', G.box(0.1, 0.022, 0.62), C.steel, { pos: [0, -0.02, 0.42] });
  b.add('hand.R', G.box(0.02, 0.022, 0.6), 0xdfe6ee, { pos: [0, -0.02, 0.42] }); // fio claro
  b.add('hand.R', G.cone(0.07, 0.13, 4), C.steel, { pos: [0, -0.02, 0.79], rot: [90, 45, 0], scale: [1, 1, 0.35] });
  b.add('hand.R', G.sphere(0.03, 6, 5), C.gold, { pos: [0, -0.02, -0.06] });

  // --- escudo redondo de madeira (antebraço esquerdo) ---
  // Montado de frente (+Z) e depois orientado para, na pose de guarda (braço erguido ~80°),
  // ficar virado para frente e um pouco para fora.
  const axisGuard = new THREE.Vector3(Math.sin(0.6), 0, Math.cos(0.6));
  const axisLocal = axisGuard.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), (80 * Math.PI) / 180).normalize();
  const shieldM = new THREE.Matrix4().compose(
    new THREE.Vector3(0.1, -0.09, 0.02),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisLocal),
    new THREE.Vector3(1, 1, 1),
  );
  const sp = (geo: THREE.BufferGeometry, color: number, o: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] } = {}) =>
    b.add('foreArm.L', geo, color, { ...o, post: shieldM });
  sp(G.cyl(0.21, 0.21, 0.045, 20), C.wood, { rot: [90, 0, 0] });
  sp(G.torus(0.205, 0.024, 20), C.steelDark, { pos: [0, 0, 0.005] });
  sp(G.sphere(0.07, 12, 8), C.steel, { pos: [0, 0, 0.025], scale: [1, 1, 0.55] });
  for (const off of [-0.1, 0.1]) sp(G.box(0.014, 0.37, 0.05), C.woodDark, { pos: [off, 0, 0.004] });
  sp(G.box(0.3, 0.035, 0.05), C.steelDark, { pos: [0, 0.0, 0.006] });
  return b.build();
}

// =====================================================================
export function buildMage(): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.47, spine: 0.1, chest: 0.13, neck: 0.12, shoulderW: 0.13, upperArm: 0.16, foreArm: 0.15, hipW: 0.075, thigh: 0.19, shin: 0.2, cape: true };
  skeleton(b, P);
  const r = 0.27;
  face(b, { r, skin: C.skin, brow: C.brownHairDark });
  const cy = r * 0.92;
  // --- cabelo castanho em "cuia" com franja e mechas laterais ---
  b.add('head', G.cap(r * 1.08, 96, 20, 9), C.brownHair, { pos: [0, cy + r * 0.02, -r * 0.03], rot: [-8, 0, 0] });
  b.add('head', G.sphere(r * 1.02, 16, 10), C.brownHairDark, { pos: [0, cy - r * 0.1, -r * 0.2], scale: [1, 0.95, 0.8] });
  // franja lisa cobrindo a testa, com duas pontas
  b.add('head', G.sphere(r * 0.8, 16, 10), C.brownHair, { pos: [0, cy + r * 0.44, r * 0.5], scale: [1.18, 0.5, 0.62] });
  for (const x of [-0.07, 0.08]) b.add('head', G.sphere(r * 0.3, 8, 6), C.brownHair, { pos: [x, cy + r * 0.26, r * 0.86], scale: [1.1, 0.7, 0.4] });
  for (const s of [1, -1]) b.add('head', G.capsule(0.07, 0.16, 6), C.brownHair, { pos: [s * r * 0.9, cy - r * 0.2, r * 0.1], rot: [0, 0, s * 8], scale: [0.8, 1, 1] });

  // --- túnica creme (do pescoço aos tornozelos): parte de cima no peito, saia no quadril ---
  b.add('neck', G.cyl(0.065, 0.075, 0.1), C.skinShade);
  b.add('chest', G.lathe([[0.07, 0.12], [0.15, 0.06], [0.175, -0.06], [0.165, -0.14]], 14), C.robe);
  b.add('spine', G.cyl(0.155, 0.16, 0.14, 14), C.robe, { pos: [0, 0.0, 0] });
  b.addWeighted(
    G.lathe([[0.16, 0.06], [0.2, -0.1], [0.25, -0.26], [0.27, -0.36]], 16),
    C.robe,
    (p) => (p.y > 0.4 ? [['hips', 1]] : [['hips', 0.7], [p.x > 0 ? 'thigh.L' : 'thigh.R', 0.3]]),
    {},
    'hips',
  );
  // barra mais escura e faixa diagonal cruzada (estilo quimono simples)
  b.add('hips', G.torus(0.265, 0.018, 16), C.robeShade, { pos: [0, -0.34, 0], rot: [90, 0, 0] });
  b.add('chest', G.box(0.06, 0.3, 0.025), C.robeShade, { pos: [0.02, -0.02, 0.165], rot: [4, 0, -28] });
  // cinto de couro + fivela
  b.add('hips', G.torus(0.165, 0.028, 14), C.leather, { pos: [0, 0.08, 0], rot: [90, 0, 0] });
  b.add('hips', G.box(0.07, 0.055, 0.03), 0xb9bdc4, { pos: [0, 0.08, 0.18] });
  // bolsa na lateral direita + alça
  b.add('hips', G.box(0.12, 0.11, 0.07), C.leather, { pos: [-0.2, -0.01, 0.07], rot: [0, 25, 0] });
  b.add('hips', G.box(0.125, 0.04, 0.075), C.leatherDark, { pos: [-0.2, 0.04, 0.071], rot: [0, 25, 0] });
  b.add('chest', G.box(0.035, 0.42, 0.02), C.leatherDark, { pos: [-0.02, -0.06, 0.16], rot: [0, 0, 32] });

  // --- manto vinho com gola/capuz caído + capa com 3 ossos ---
  b.add('chest', G.torus(0.13, 0.045, 14, 300), C.cloak, { pos: [0, 0.1, -0.02], rot: [80, 0, 120] });
  b.add('chest', G.sphere(0.13, 12, 8), C.cloak, { pos: [0, 0.12, -0.14], scale: [1.1, 0.7, 0.6] }); // capuz caído
  const cape = G.lathe([[0.2, 0.88], [0.24, 0.72], [0.27, 0.5], [0.31, 0.3], [0.33, 0.14]], 14, 70, 220);
  const { outer, inner } = twoSided(cape);
  const w0 = b.boneWorld('cape0').y;
  const w1 = b.boneWorld('cape1').y;
  const w2 = b.boneWorld('cape2').y;
  const capeWeights = (p: THREE.Vector3): [string, number][] => {
    if (p.y >= w0) return [['chest', 1]];
    if (p.y >= w1) {
      const t = (w0 - p.y) / (w0 - w1);
      return [['cape0', 1 - t], ['cape1', t]];
    }
    if (p.y >= w2) {
      const t = (w1 - p.y) / (w1 - w2);
      return [['cape1', 1 - t], ['cape2', t]];
    }
    return [['cape2', 1]];
  };
  b.addWeighted(outer, C.cloak, capeWeights);
  b.addWeighted(inner, C.cloakIn, capeWeights);

  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.add(`upperArm.${L}`, G.sphere(0.075, 10, 8), C.cloak, { pos: [s * 0.01, 0.0, 0] }); // ombro do manto
    b.add(`upperArm.${L}`, G.capsule(0.052, 0.1), C.robe, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.cyl(0.055, 0.085, 0.15, 10, true), C.robe, { pos: [0, -0.07, 0] }); // manga larga
    b.add(`foreArm.${L}`, G.cyl(0.05, 0.05, 0.12, 8), C.robeShade, { pos: [0, -0.08, 0] });
    b.add(`hand.${L}`, G.sphere(0.052, 10, 8), C.skin, { pos: [0, -0.015, 0.005] });
    b.add(`thigh.${L}`, G.capsule(0.06, 0.1), C.robeShade, { pos: [0, -0.1, 0] });
    b.add(`shin.${L}`, G.capsule(0.058, 0.1), C.leatherDark, { pos: [0, -0.1, 0] });
    b.add(`foot.${L}`, G.capsule(0.058, 0.08), C.leatherDark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.1, 1, 0.8] });
  }

  // --- cajado torto com orbe âmbar (mão direita) ---
  b.add('hand.R', G.cyl(0.024, 0.03, 1.12, 7), C.staff, { pos: [0, 0.08, 0.02] });
  b.add('hand.R', G.torus(0.05, 0.018, 8), C.staff, { pos: [0, 0.66, 0.02], rot: [0, 0, 0] });
  b.add('hand.R', G.torus(0.045, 0.012, 8), C.gold, { pos: [0, 0.6, 0.02], rot: [90, 0, 0] });
  for (const a of [0, 120, 240]) {
    const rad = (a * Math.PI) / 180;
    b.add('hand.R', G.cone(0.02, 0.12, 4), C.staff, { pos: [Math.sin(rad) * 0.05, 0.7, 0.02 + Math.cos(rad) * 0.05], rot: [Math.cos(rad) * 25, 0, -Math.sin(rad) * 25] });
  }
  b.glow('hand.R', G.sphere(0.07, 14, 10), new THREE.Color(3.2, 1.7, 0.45), [0, 0.72, 0.02]);
  b.glow('hand.R', G.sphere(0.035, 8, 6), new THREE.Color(4, 3.2, 1.8), [0, 0.72, 0.02]);
  return b.build();
}

// =====================================================================
export function buildGrunt(): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.42, spine: 0.09, chest: 0.11, neck: 0.1, shoulderW: 0.12, upperArm: 0.17, foreArm: 0.16, hipW: 0.07, thigh: 0.18, shin: 0.18 };
  skeleton(b, P);
  const r = 0.3;
  face(b, { r, skin: C.zSkin, zombie: true });
  const cy = r * 0.92;
  // olhos fundos (órbitas escuras) — o brilho vermelho vem dos "glows"
  for (const s of [1, -1]) {
    b.add('head', G.sphere(1, 10, 8), 0x2a1618, { pos: [s * r * 0.34, cy - r * 0.02, r * 0.84], scale: [r * 0.22, r * 0.22, r * 0.12] });
    b.glow('head', G.sphere(r * 0.13, 10, 8), new THREE.Color(3.2, 0.25, 0.15), [s * r * 0.34, cy - r * 0.02, r * 0.9]);
    b.glow('head', G.sphere(r * 0.05, 6, 5), new THREE.Color(4, 2.5, 2.2), [s * r * 0.31, cy + r * 0.02, r * 0.99]);
  }
  // pontos de costura / manchas e boca torta
  b.add('head', G.box(r * 0.3, r * 0.04, r * 0.05), 0x3d2a2a, { pos: [0, cy - r * 0.5, r * 0.86], rot: [0, 0, -8] });
  b.add('head', G.sphere(r * 0.12, 6, 5), C.zSkinDark, { pos: [-r * 0.5, cy + r * 0.5, r * 0.55] });
  b.add('head', G.sphere(r * 0.08, 6, 5), C.zSkinDark, { pos: [r * 0.3, cy + r * 0.75, r * 0.2] });

  b.add('neck', G.cyl(0.06, 0.07, 0.1), C.zSkinDark);
  // tronco magro, barriga e costelas marcadas
  b.add('chest', G.sphere(0.14, 12, 9), C.zSkin, { pos: [0, 0.0, 0.0], scale: [1, 0.95, 0.8] });
  b.add('spine', G.cyl(0.12, 0.13, 0.14, 10), C.zSkin);
  b.add('spine', G.sphere(0.12, 10, 8), C.zSkin, { pos: [0, -0.03, 0.03], scale: [1, 0.8, 0.9] });
  for (const y of [0.03, -0.02]) b.add('chest', G.box(0.14, 0.012, 0.02), C.zSkinDark, { pos: [0, y, 0.11] });
  // tanga rasgada: saia curta + tiras pontudas
  b.add('hips', G.lathe([[0.14, 0.06], [0.16, -0.02], [0.18, -0.08]], 12), C.zCloth);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const len = 0.08 + ((i * 37) % 5) * 0.02;
    b.add('hips', G.cone(0.05, len, 3), i % 2 ? C.zCloth : C.zClothDark, {
      pos: [Math.sin(a) * 0.17, -0.08 - len * 0.45, Math.cos(a) * 0.17],
      rot: [180 + Math.cos(a) * 12, (a * 180) / Math.PI, -Math.sin(a) * 12],
    });
  }
  b.add('hips', G.torus(0.14, 0.018, 12), C.zClothDark, { pos: [0, 0.05, 0], rot: [90, 0, 0] });

  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.add(`upperArm.${L}`, G.capsule(0.045, 0.12), C.zSkin, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.capsule(0.042, 0.11), C.zSkin, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.cyl(0.058, 0.058, 0.05, 10), C.iron, { pos: [0, -0.13, 0] }); // grilhão
    b.add(`hand.${L}`, G.sphere(0.052, 8, 6), C.zSkin, { pos: [0, -0.02, 0], scale: [1, 1.2, 1] });
    for (const f of [-0.02, 0.02]) b.add(`hand.${L}`, G.capsule(0.013, 0.04, 4), C.zSkinDark, { pos: [f, -0.07, 0.02] });
    b.add(`thigh.${L}`, G.capsule(0.055, 0.1), C.zSkin, { pos: [0, -0.09, 0] });
    b.add(`shin.${L}`, G.capsule(0.05, 0.1), C.zSkin, { pos: [0, -0.09, 0] });
    b.add(`foot.${L}`, G.capsule(0.05, 0.07), C.zSkinDark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.2, 1, 0.7] });
  }
  // corrente + bola de ferro presa ao grilhão direito
  for (let i = 0; i < 4; i++)
    b.add('hand.R', G.torus(0.025, 0.008, 8), C.ironLight, { pos: [0, -0.08 - i * 0.04, 0.02 + i * 0.02], rot: [0, i % 2 ? 90 : 0, 0] });
  b.add('hand.R', G.sphere(0.11, 14, 10), C.iron, { pos: [0, -0.3, 0.12] });
  b.add('hand.R', G.sphere(0.03, 6, 5), C.ironLight, { pos: [-0.04, -0.26, 0.2] });
  return b.build();
}

// =====================================================================
// Variantes da horda (zona da ponte). Mesma "família" visual do zumbi comum,
// mas com silhueta própria para leitura instantânea no meio da multidão.

function zombieHead(b: ModelBuilder, r: number, skin: number, skinDark: number, eye: THREE.Color): void {
  face(b, { r, skin, zombie: true });
  const cy = r * 0.92;
  for (const s of [1, -1]) {
    b.add('head', G.sphere(1, 10, 8), 0x2a1618, { pos: [s * r * 0.34, cy - r * 0.02, r * 0.84], scale: [r * 0.22, r * 0.22, r * 0.12] });
    b.glow('head', G.sphere(r * 0.13, 10, 8), eye, [s * r * 0.34, cy - r * 0.02, r * 0.9]);
    b.glow('head', G.sphere(r * 0.05, 6, 5), new THREE.Color(4, 3, 2.6), [s * r * 0.31, cy + r * 0.02, r * 0.99]);
  }
  b.add('head', G.box(r * 0.34, r * 0.05, r * 0.05), 0x3d2a2a, { pos: [0, cy - r * 0.5, r * 0.86], rot: [0, 0, 7] });
  b.add('head', G.sphere(r * 0.12, 6, 5), skinDark, { pos: [r * 0.45, cy + r * 0.55, r * 0.5] });
}

/** Rápido: magro, pálido, garras, camisa rasgada. */
export function buildRunner(): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.46, spine: 0.1, chest: 0.11, neck: 0.1, shoulderW: 0.11, upperArm: 0.19, foreArm: 0.18, hipW: 0.06, thigh: 0.2, shin: 0.21 };
  skeleton(b, P);
  const skin = 0xa3b2b6;
  const dark = 0x7d8d93;
  zombieHead(b, 0.26, skin, dark, new THREE.Color(3.4, 1.4, 0.2));
  const cy = 0.26 * 0.92;
  for (const [x, rz] of [
    [-0.1, -30],
    [0.02, 8],
    [0.12, 35],
  ] as const)
    b.add('head', G.cone(0.035, 0.14, 4), 0x2a2622, { pos: [x, cy + 0.24, -0.04], rot: [-20, 0, rz] }); // tufos de cabelo
  b.add('neck', G.cyl(0.05, 0.06, 0.1), dark);
  // camisa rasgada (farrapo cinza) sobre tronco fino
  b.add('chest', G.sphere(0.12, 10, 8), 0x55575a, { scale: [1, 1, 0.8] });
  b.add('spine', G.cyl(0.1, 0.11, 0.13, 10), 0x55575a);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('spine', G.cone(0.04, 0.1, 3), 0x4a4c4f, { pos: [Math.sin(a) * 0.1, -0.1, Math.cos(a) * 0.1], rot: [180, 0, 0] });
  }
  b.add('hips', G.lathe([[0.1, 0.05], [0.12, -0.04], [0.13, -0.1]], 10), 0x3b3530);
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.add(`upperArm.${L}`, G.capsule(0.036, 0.14), skin, { pos: [0, -0.09, 0] });
    b.add(`foreArm.${L}`, G.capsule(0.034, 0.13), skin, { pos: [0, -0.09, 0] });
    b.add(`hand.${L}`, G.sphere(0.045, 8, 6), skin, { pos: [0, -0.02, 0] });
    for (const f of [-0.025, 0, 0.025]) b.add(`hand.${L}`, G.cone(0.012, 0.09, 4), 0xe8e0c8, { pos: [f, -0.09, 0.02], rot: [180, 0, 0] }); // garras
    b.add(`thigh.${L}`, G.capsule(0.045, 0.12), 0x3b3530, { pos: [0, -0.1, 0] });
    b.add(`shin.${L}`, G.capsule(0.04, 0.13), skin, { pos: [0, -0.1, 0] });
    b.add(`foot.${L}`, G.capsule(0.045, 0.07), dark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.1, 1, 0.7] });
  }
  return b.build();
}

/** Pesado (e base do chefe): barrigudo, ombros largos, clava com pregos, coleira de ferro. */
export function buildBrute(boss = false): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.42, spine: 0.12, chest: 0.13, neck: 0.08, shoulderW: 0.19, upperArm: 0.17, foreArm: 0.16, hipW: 0.1, thigh: 0.17, shin: 0.17 };
  skeleton(b, P);
  const skin = boss ? 0x6f7f86 : 0x7b9180;
  const dark = boss ? 0x4f5c63 : 0x5e7363;
  zombieHead(b, 0.25, skin, dark, boss ? new THREE.Color(2.4, 0.4, 3.6) : new THREE.Color(3.2, 0.25, 0.15));
  const cy = 0.25 * 0.92;
  b.add('neck', G.cyl(0.1, 0.12, 0.1), dark);
  b.add('neck', G.torus(0.12, 0.03, 12), 0x3c3f46, { pos: [0, -0.02, 0], rot: [90, 0, 0] }); // coleira
  // tronco largo e barriga
  b.add('chest', G.sphere(0.24, 14, 10), skin, { pos: [0, 0.02, 0], scale: [1.15, 0.9, 0.85] });
  b.add('spine', G.sphere(0.24, 14, 10), skin, { pos: [0, -0.03, 0.05], scale: [1.05, 0.95, 1] });
  b.add('spine', G.sphere(0.05, 6, 5), dark, { pos: [0, -0.03, 0.28] }); // umbigo/ferida
  for (const y of [0.06, -0.02]) b.add('chest', G.box(0.2, 0.014, 0.02), dark, { pos: [0.02, y, 0.2], rot: [0, 0, y * 60] }); // pontos de costura
  b.add('hips', G.lathe([[0.22, 0.06], [0.24, -0.04], [0.26, -0.12]], 14), boss ? 0x3a2a3e : C.zCloth);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.add('hips', G.cone(0.06, 0.1 + (i % 3) * 0.03, 3), i % 2 ? (boss ? 0x2c2030 : C.zClothDark) : boss ? 0x3a2a3e : C.zCloth, {
      pos: [Math.sin(a) * 0.25, -0.16, Math.cos(a) * 0.25],
      rot: [180, (a * 180) / Math.PI, 0],
    });
  }
  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.add(`upperArm.${L}`, G.capsule(0.075, 0.12), skin, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.capsule(0.07, 0.11), skin, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.cyl(0.085, 0.085, 0.05, 10), 0x3c3f46, { pos: [0, -0.13, 0] });
    b.add(`hand.${L}`, G.sphere(0.075, 10, 8), skin, { pos: [0, -0.03, 0] });
    b.add(`thigh.${L}`, G.capsule(0.08, 0.08), skin, { pos: [0, -0.09, 0] });
    b.add(`shin.${L}`, G.capsule(0.07, 0.09), skin, { pos: [0, -0.09, 0] });
    b.add(`foot.${L}`, G.capsule(0.07, 0.08), dark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.2, 1, 0.75] });
    if (boss) {
      // ombreiras de ferro enferrujado com espinhos
      b.add(`upperArm.${L}`, G.cap(0.12, 90, 12, 6), 0x5a3c2c, { pos: [s * 0.02, 0.01, 0], rot: [0, 0, -s * 30] });
      for (const k of [-1, 0, 1]) b.add(`upperArm.${L}`, G.cone(0.03, 0.12, 5), 0x9aa0a8, { pos: [s * 0.07, 0.07, k * 0.05], rot: [0, 0, -s * 45] });
    }
  }
  // clava de madeira com pregos na mão direita
  b.add('hand.R', G.cyl(0.03, 0.09, 0.62, 8), 0x6a4526, { pos: [0, -0.02, 0.28], rot: [90, 0, 0] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('hand.R', G.cone(0.014, 0.08, 4), 0xb8bec6, { pos: [Math.cos(a) * 0.075, -0.02 + Math.sin(a) * 0.075, 0.46 + (i % 2) * 0.08], rot: [0, 0, (a * 180) / Math.PI - 90] });
  }
  if (boss) {
    // coroa de chifres de ferro
    for (let i = 0; i < 7; i++) {
      const a = ((i - 3) / 3) * 1.1;
      b.add('head', G.cone(0.035, 0.16 + (i === 3 ? 0.08 : 0), 5), 0x2a2a30, { pos: [Math.sin(a) * 0.17, cy + 0.21, Math.cos(a) * 0.05 - 0.02], rot: [-10, 0, -(a * 180) / Math.PI * 0.6] });
    }
    b.add('head', G.torus(0.19, 0.025, 14), 0x6a5a3a, { pos: [0, cy + 0.14, -0.01], rot: [95, 0, 0] });
  }
  return b.build();
}

// =====================================================================
/**
 * Arqueira (original): cabelo ruivo em rabo de cavalo, capuz e capa verde-musgo,
 * colete de couro, braçadeira, aljava nas costas e arco longo na mão esquerda.
 */
export function buildArcher(): BuiltModel {
  const b = new ModelBuilder();
  const P: Body = { hipsY: 0.48, spine: 0.1, chest: 0.12, neck: 0.12, shoulderW: 0.125, upperArm: 0.16, foreArm: 0.15, hipW: 0.075, thigh: 0.2, shin: 0.2, cape: true };
  skeleton(b, P);
  const A = {
    hair: 0xb8452a,
    hairDark: 0x8a2e1c,
    green: 0x4f6b35,
    greenDark: 0x33461f,
    greenIn: 0x26351a,
    vest: 0x8a5a32,
    vestDark: 0x5e3b1f,
    shirt: 0xe9dcc0,
    bow: 0x7a4a24,
    bowTip: 0xd8b060,
  };
  const r = 0.265;
  face(b, { r, skin: C.skin, brow: A.hairDark, eyeColor: 0x2f5a2a });
  const cy = r * 0.92;
  // --- cabelo ruivo: topo liso, franja de lado e rabo de cavalo alto ---
  b.add('head', G.cap(r * 1.07, 92, 20, 9), A.hair, { pos: [0, cy + r * 0.03, -r * 0.04], rot: [-10, 0, 0] });
  b.add('head', G.sphere(r * 0.75, 14, 10), A.hair, { pos: [r * 0.18, cy + r * 0.45, r * 0.52], scale: [1.2, 0.5, 0.6], rot: [0, 0, -14] });
  for (const s of [1, -1]) b.add('head', G.capsule(0.055, 0.15, 6), A.hair, { pos: [s * r * 0.88, cy - r * 0.18, r * 0.12], rot: [0, 0, s * 6] });
  b.add('head', G.torus(0.045, 0.016, 8), 0xd8b060, { pos: [0, cy + r * 0.5, -r * 0.82], rot: [30, 0, 0] });
  b.add('head', G.capsule(0.07, 0.22, 6), A.hair, { pos: [0, cy + r * 0.1, -r * 1.12], rot: [-28, 0, 0] });
  b.add('head', G.cone(0.07, 0.2, 6), A.hairDark, { pos: [0, cy - r * 0.55, -r * 1.35], rot: [160, 0, 0] });
  // capuz caído nos ombros
  b.add('chest', G.torus(0.13, 0.05, 14, 300), A.green, { pos: [0, 0.1, -0.02], rot: [80, 0, 120] });
  b.add('chest', G.sphere(0.14, 12, 8), A.green, { pos: [0, 0.13, -0.15], scale: [1.1, 0.75, 0.6] });

  // --- tronco: camisa clara, colete de couro, cinto com adaga ---
  b.add('neck', G.cyl(0.062, 0.072, 0.1), C.skinShade);
  b.add('chest', G.lathe([[0.07, 0.12], [0.145, 0.06], [0.165, -0.06], [0.155, -0.14]], 14), A.shirt);
  b.add('chest', G.lathe([[0.1, 0.1], [0.155, 0.04], [0.172, -0.06], [0.162, -0.14]], 14, -60, 120), A.vest);
  b.add('chest', G.lathe([[0.1, 0.1], [0.155, 0.04], [0.172, -0.06], [0.162, -0.14]], 14, 120, 120), A.vest);
  b.add('spine', G.cyl(0.15, 0.155, 0.14, 14), A.vest, { pos: [0, 0.0, 0] });
  b.add('hips', G.torus(0.16, 0.026, 14), A.vestDark, { pos: [0, 0.08, 0], rot: [90, 0, 0] });
  b.add('hips', G.box(0.06, 0.05, 0.03), 0xb9bdc4, { pos: [0, 0.08, 0.17] });
  b.add('hips', G.box(0.03, 0.16, 0.03), 0x9aa2ac, { pos: [0.19, -0.02, 0.06], rot: [0, 0, 12] });
  b.add('hips', G.box(0.04, 0.05, 0.035), A.vestDark, { pos: [0.19, 0.06, 0.06] });
  // saia curta em camadas
  b.add('hips', G.lathe([[0.16, 0.06], [0.2, -0.06], [0.225, -0.15]], 14), A.green);
  b.add('hips', G.torus(0.222, 0.014, 16), A.greenDark, { pos: [0, -0.15, 0], rot: [90, 0, 0] });
  // tiracolo da aljava
  b.add('chest', G.box(0.035, 0.42, 0.02), A.vestDark, { pos: [0.01, -0.04, 0.16], rot: [0, 0, -34] });

  // --- capa verde curta (3 ossos) ---
  const cape = G.lathe([[0.19, 0.86], [0.23, 0.72], [0.26, 0.54], [0.29, 0.38]], 14, 75, 210);
  const { outer, inner } = twoSided(cape);
  const w0 = b.boneWorld('cape0').y;
  const w1 = b.boneWorld('cape1').y;
  const w2 = b.boneWorld('cape2').y;
  const capeWeights = (p: THREE.Vector3): [string, number][] => {
    if (p.y >= w0) return [['chest', 1]];
    if (p.y >= w1) {
      const t = (w0 - p.y) / (w0 - w1);
      return [['cape0', 1 - t], ['cape1', t]];
    }
    if (p.y >= w2) {
      const t = (w1 - p.y) / (w1 - w2);
      return [['cape1', 1 - t], ['cape2', t]];
    }
    return [['cape2', 1]];
  };
  b.addWeighted(outer, A.green, capeWeights);
  b.addWeighted(inner, A.greenIn, capeWeights);

  // --- aljava nas costas com flechas ---
  b.add('chest', G.cyl(0.06, 0.05, 0.36, 10), A.vestDark, { pos: [-0.08, 0.02, -0.19], rot: [0, 0, -24] });
  b.add('chest', G.torus(0.06, 0.012, 10), 0xd8b060, { pos: [-0.155, 0.18, -0.19], rot: [90, 0, -24] });
  for (const [dx, dz] of [[0, 0], [0.025, 0.02], [-0.02, 0.025], [0.01, -0.025]]) {
    b.add('chest', G.cyl(0.006, 0.006, 0.18, 4), 0xc8b090, { pos: [-0.16 + dx, 0.3, -0.19 + dz], rot: [0, 0, -24] });
    b.add('chest', G.cone(0.02, 0.06, 3), 0xe8e8e8, { pos: [-0.2 + dx, 0.39, -0.19 + dz], rot: [0, 0, -24] });
  }

  for (const s of [1, -1]) {
    const L = s > 0 ? 'L' : 'R';
    b.add(`upperArm.${L}`, G.sphere(0.068, 10, 8), A.green, { pos: [s * 0.01, 0.0, 0] });
    b.add(`upperArm.${L}`, G.capsule(0.048, 0.1), A.shirt, { pos: [0, -0.08, 0] });
    b.add(`foreArm.${L}`, G.capsule(0.05, 0.09), L === 'L' ? A.vest : C.skin, { pos: [0, -0.07, 0] });
    b.add(`hand.${L}`, G.sphere(0.05, 10, 8), L === 'R' ? A.vestDark : C.skin, { pos: [0, -0.015, 0.005] });
    b.add(`thigh.${L}`, G.capsule(0.06, 0.1), A.greenDark, { pos: [0, -0.1, 0] });
    b.add(`shin.${L}`, G.capsule(0.06, 0.1), A.vestDark, { pos: [0, -0.1, 0] });
    b.add(`shin.${L}`, G.torus(0.064, 0.012, 10), A.vest, { pos: [0, -0.02, 0], rot: [90, 0, 0] });
    b.add(`foot.${L}`, G.capsule(0.056, 0.08), A.vestDark, { pos: [0, 0.02, 0.04], rot: [90, 0, 0], scale: [1.1, 1, 0.8] });
  }

  // --- arco longo (mão esquerda): arco em "C" vertical + corda ---
  const bowM = new THREE.Matrix4().compose(new THREE.Vector3(0, -0.02, 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2)), new THREE.Vector3(1, 1, 1));
  const bp = (geo: THREE.BufferGeometry, color: number, o: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] } = {}) =>
    b.add('hand.L', geo, color, { ...o, post: bowM });
  bp(G.torus(0.42, 0.018, 20, 140), A.bow, { rot: [0, 0, 20] });
  bp(G.cyl(0.028, 0.028, 0.12, 8), A.vestDark, { pos: [0.4, 0.0, 0], rot: [0, 0, 90] });
  for (const a of [20, 160]) {
    const rad = (a * Math.PI) / 180;
    bp(G.sphere(0.022, 6, 5), A.bowTip, { pos: [Math.cos(rad) * 0.42, Math.sin(rad) * 0.42, 0] });
  }
  bp(G.cyl(0.004, 0.004, 0.79, 4), 0xf2ead8, { pos: [Math.cos(0.35) * 0.42 * 0.94 - 0.02, 0.0, 0] });
  return b.build();
}
