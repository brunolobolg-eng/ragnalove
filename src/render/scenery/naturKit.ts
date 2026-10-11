import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Peças naturais do cenário (árvores, rochas, arbustos, troncos, ruínas e um marco), feitas por código com as
 * texturas do dono (public/textures/arvores, pedras e deserto). Cada peça tem uma ou mais malhas, cada uma com o
 * seu material; o cenário desenha as cópias com InstancedMesh (uma chamada de desenho por malha).
 * Só apresentação: nada aqui altera a grade do mapa nem a simulação.
 */

const TEX_DIR = 'textures/';

/** Peças por grupo. O cenário sorteia uma peça do grupo a cada cópia (ver BiomeScenery.ts e BridgeScenery.ts). */
export const KIT: Record<'arvore' | 'pedra' | 'arenito' | 'arbusto' | 'tronco' | 'ruina' | 'marco', string[]> = {
  arvore: ['arvore_a', 'arvore_b', 'arvore_c', 'arvore_d', 'arvore_e'],
  pedra: ['pedra_a', 'pedra_b', 'pedra_c', 'pedra_d'],
  arenito: ['arenito_a', 'arenito_b', 'arenito_c'],
  arbusto: ['arbusto_a', 'arbusto_b'],
  tronco: ['tronco_a', 'tronco_b'],
  ruina: ['ruina_a', 'ruina_b'],
  marco: ['marco'],
};

/** Uma malha da peça e o seu material. */
interface KitPart {
  geo: THREE.BufferGeometry;
  mat: THREE.MeshLambertMaterial;
}

/** Peça pronta: base em y = 0, centrada em x/z = 0; 1 unidade = 1 tile. */
interface KitPiece {
  parts: KitPart[];
}

const images = new Map<string, Promise<HTMLImageElement>>();

function imageOf(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`textura ausente: ${url}`));
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

/**
 * Textura que repete. Aparece na hora e recebe a imagem quando ela chega (cada uso tem o seu `repeat`).
 * Cor é sRGB; mapa de normais (`linear`) não.
 */
export function loadTexture(url: string, linear = false): THREE.Texture {
  const t = new THREE.Texture();
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  imageOf(url)
    .then((img) => {
      t.image = img;
      t.needsUpdate = true;
    })
    .catch(() => {
      /* sem textura o material fica liso: o cenário segue */
    });
  return t;
}

/** Material de uma peça: textura do dono com a cor por vértice (sombra embaixo e variação entre as faces). */
function matOf(file: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: loadTexture(`${TEX_DIR}${file}.webp`), vertexColors: true });
}

/** Gerador determinístico (mulberry32): a mesma semente sempre sai a mesma peça. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relevo suave em 3D. Depende só da posição, então vértices coincidentes recebem o mesmo deslocamento. Vai de -1 a 1. */
function bump(x: number, y: number, z: number, s: number): number {
  return 0.6 * Math.sin(3.1 * x + s) * Math.cos(2.7 * y - 0.7 * s) + 0.4 * Math.sin(4.3 * z + 1.9 * y + 1.3 * s);
}

/** Multiplica o UV da malha (quantas vezes a textura repete em cada direção). */
function scaleUV(geo: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}

/**
 * UV por triângulo: cada face é projetada no eixo para o qual ela mais aponta, então a textura cobre a peça sem
 * esticar. `s` = unidades de mundo por repetição. A malha precisa ser não indexada (cada triângulo tem o seu UV).
 */
function boxUV(geo: THREE.BufferGeometry, s: number): void {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    const dom = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      uv[(i + k) * 2] = (dom === 0 ? p.z : p.x) / s;
      uv[(i + k) * 2 + 1] = (dom === 2 ? p.y : dom === 1 ? p.z : p.y) / s;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Cor por vértice: mais escura embaixo (a peça não flutua) e uma variação leve de face para face.
 * A malha precisa ser não indexada.
 */
function shade(geo: THREE.BufferGeometry, r: () => number, bottom: number, top: number): void {
  const pos = geo.getAttribute('position');
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox!;
  const span = Math.max(1e-6, max.y - min.y);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const jitter = 0.92 + r() * 0.16;
    for (let k = 0; k < 3; k++) {
      const t = (pos.getY(i + k) - min.y) / span;
      const f = (bottom + (top - bottom) * t) * jitter;
      col.set([f, f, f], (i + k) * 3);
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Bolha: icosaedro com relevo de ruído (sem simetria perfeita), no ponto (x, y, z). Não indexada. */
function blob(seed: number, x: number, y: number, z: number, radius: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const k = 1 + 0.2 * bump(px / radius, py / radius, pz / radius, seed);
    pos.setXYZ(i, px * k + x, py * k + y, pz * k + z);
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** Copa: uma bolha central e outras ao redor, em alturas diferentes, fundidas numa malha só. */
function canopy(seed: number, o: { lobes: number; spread: number; top: number; radius: number }): THREE.BufferGeometry {
  const r = rng(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < o.lobes; i++) {
    const main = i === 0;
    const a = (i / o.lobes) * Math.PI * 2 + r() * 0.9;
    const d = main ? 0 : o.spread * (0.6 + r() * 0.45);
    const y = main ? o.top : o.top - 0.25 + r() * 0.45;
    const rad = main ? o.radius : o.radius * (0.6 + r() * 0.3);
    parts.push(blob(seed * 31 + i, Math.cos(a) * d, y, Math.sin(a) * d, rad));
  }
  return mergeGeometries(parts)!;
}

/** Árvore: tronco com casca e copa de folhas. Cerca de 2,5 tiles de altura antes da escala da cena. */
function tree(seed: number, bark: string, leaf: string, lobes: number, spread: number): KitPiece {
  const r = rng(seed);
  const trunk = new THREE.CylinderGeometry(0.07, 0.13, 1.5, 7, 1, true).toNonIndexed().translate(0, 0.75, 0);
  scaleUV(trunk, 1, 2.4); // a casca corre na vertical
  shade(trunk, r, 0.55, 1);
  const crown = canopy(seed + 1, { lobes, spread, top: 2, radius: 0.92 });
  boxUV(crown, 1.1);
  shade(crown, r, 0.6, 1);
  return { parts: [{ geo: trunk, mat: matOf(bark) }, { geo: crown, mat: matOf(leaf) }] };
}

/** Rocha: esfera achatada com relevo, base no chão e a textura de pedra projetada nas faces. */
function rock(seed: number, tex: string): KitPiece {
  const r = rng(seed);
  const geo = new THREE.IcosahedronGeometry(0.6, 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + 0.3 * bump(x / 0.6, y / 0.6, z / 0.6, seed);
    pos.setXYZ(i, x * k, y * k * 0.72, z * k);
  }
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  geo.computeVertexNormals();
  boxUV(geo, 0.9);
  shade(geo, r, 0.55, 1);
  return { parts: [{ geo, mat: matOf(tex) }] };
}

/** Arbusto: moita baixa de bolhas com folhas. */
function bush(seed: number, leaf: string): KitPiece {
  const r = rng(seed);
  const crown = canopy(seed, { lobes: 4, spread: 0.32, top: 0.42, radius: 0.4 });
  boxUV(crown, 0.9);
  shade(crown, r, 0.55, 1);
  return { parts: [{ geo: crown, mat: matOf(leaf) }] };
}

/** Tronco caído: cilindro com casca e as pontas com o corte do tronco (anéis). Encostado no chão. */
function log(seed: number, bark: string): KitPiece {
  const r = rng(seed);
  const barrel = new THREE.CylinderGeometry(0.17, 0.2, 1.7, 7, 1, true).rotateZ(Math.PI / 2).translate(0, 0.2, 0).toNonIndexed();
  scaleUV(barrel, 1, 2.5);
  shade(barrel, r, 0.6, 1);
  const capA = new THREE.CircleGeometry(0.2, 7).toNonIndexed().rotateY(Math.PI / 2).translate(0.85, 0.2, 0);
  const capB = new THREE.CircleGeometry(0.2, 7).toNonIndexed().rotateY(-Math.PI / 2).translate(-0.85, 0.2, 0);
  const caps = mergeGeometries([capA, capB])!;
  shade(caps, r, 1, 1);
  return { parts: [{ geo: barrel, mat: matOf(bark) }, { geo: caps, mat: matOf('arvores/corte_tronco') }] };
}

/** Ruína: blocos de pedra empilhados e quebrados no topo. */
function ruin(seed: number, tex: string): KitPiece {
  const r = rng(seed);
  const blocks: THREE.BufferGeometry[] = [];
  let y = 0;
  for (let i = 0; i < 3; i++) {
    const w = 0.8 - i * 0.14 + r() * 0.12;
    const h = 0.5 + r() * 0.25;
    const d = 0.7 - i * 0.1 + r() * 0.12;
    blocks.push(new THREE.BoxGeometry(w, h, d).toNonIndexed().translate((r() - 0.5) * 0.14, y + h / 2, (r() - 0.5) * 0.14));
    y += h * 0.9;
  }
  const geo = mergeGeometries(blocks)!;
  boxUV(geo, 1);
  shade(geo, r, 0.5, 1);
  return { parts: [{ geo, mat: matOf(tex) }] };
}

/** Marco de estrada: pilar de pedra alto e fino. */
function waystone(): KitPiece {
  const r = rng(131);
  const geo = new THREE.CylinderGeometry(0.2, 0.26, 2.1, 6).toNonIndexed().translate(0, 1.05, 0);
  boxUV(geo, 1);
  shade(geo, r, 0.6, 1);
  return { parts: [{ geo, mat: matOf('pedras/pedra_colunas') }] };
}

/** Construtores das peças (cada uma é feita na primeira vez que aparece). */
const BUILD: Record<string, () => KitPiece> = {
  arvore_a: () => tree(11, 'arvores/tronco_casca', 'arvores/copa_verde', 5, 0.5),
  arvore_b: () => tree(23, 'arvores/tronco_musgo', 'arvores/copa_verde_clara', 5, 0.55),
  arvore_c: () => tree(37, 'arvores/tronco_retorcido', 'arvores/copa_verde_escura', 4, 0.45),
  arvore_d: () => tree(41, 'arvores/tronco_betula', 'arvores/copa_verde_amarela', 5, 0.5),
  arvore_e: () => tree(53, 'arvores/tronco_hera', 'arvores/copa_outono', 5, 0.5),
  pedra_a: () => rock(61, 'pedras/pedra_cinza'),
  pedra_b: () => rock(67, 'pedras/pedra_musgo'),
  pedra_c: () => rock(71, 'pedras/pedra_fissurada'),
  pedra_d: () => rock(79, 'pedras/pedra_azulada'),
  arenito_a: () => rock(83, 'pedras/pedra_colunas_vermelhas'),
  arenito_b: () => rock(89, 'pedras/pedra_seixos_b'),
  arenito_c: () => rock(97, 'pedras/pedra_seixos_claros'),
  arbusto_a: () => bush(101, 'arvores/copa_verde_escura'),
  arbusto_b: () => bush(103, 'arvores/copa_verde'),
  tronco_a: () => log(107, 'arvores/tronco_casca_b'),
  tronco_b: () => log(109, 'arvores/tronco_musgo_b'),
  ruina_a: () => ruin(113, 'pedras/pedra_colunas'),
  ruina_b: () => ruin(127, 'pedras/pedra_blocos'),
  marco: () => waystone(),
};

const cache = new Map<string, KitPiece>();

function piece(key: string): KitPiece | undefined {
  let p = cache.get(key);
  if (!p && BUILD[key]) {
    p = BUILD[key]();
    cache.set(key, p);
  }
  return p;
}

/** Matriz de uma cópia da peça em (x, z) do mundo (base em `y`), com escala e giro em torno de Y. */
export function kitMatrix(x: number, z: number, s: number, rot = 0, sy = s, y = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(s, sy, s),
  );
}

/**
 * Desenha as cópias de uma peça com UMA chamada de desenho por malha (InstancedMesh).
 * `tint` multiplica a cor do material (ex.: areia avermelhada nas rochas do deserto).
 */
export function instanceKit(parent: THREE.Object3D, key: string, mats: THREE.Matrix4[], tint?: number): void {
  if (!mats.length) return;
  const p = piece(key);
  if (!p) return;
  for (const part of p.parts) {
    const mat = tint === undefined ? part.mat : new THREE.MeshLambertMaterial({ map: part.mat.map, vertexColors: true, color: tint });
    const im = new THREE.InstancedMesh(part.geo, mat, mats.length);
    mats.forEach((mx, k) => im.setMatrixAt(k, mx));
    im.castShadow = true;
    im.receiveShadow = true;
    parent.add(im);
  }
}
