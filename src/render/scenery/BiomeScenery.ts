import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParsedZone, PropKind, ZoneTheme } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import type { SceneryHandle } from './BridgeScenery';
import { buildCityGate } from './CityGate';
import { softCircle } from '../textures';
import { instanceProps } from './props';
import { PACK, packInstances, packMatrix } from './packKit';
import { packForestGround } from './forestGround';
import { KITS, type BiomeKit } from './biomeKits';

/**
 * Cenário genérico por bioma (floresta, planície, deserto, montanha, cinzas).
 * Só visual: a grade vem do mapa da zona. Low-poly pintado (cores por vértice + texturas
 * de chão em canvas), com decoração em volta do tabuleiro e partículas de ambiente.
 */
type Biome = Exclude<ZoneTheme, 'bridge' | 'town'>;

interface Palette {
  ground: string[];
  groundDetail: string[];
  outer: string[];
  rock: number[];
  trunk: number;
  leaf: number[];
  water: number;
  waterEmissive: number;
  lava?: boolean;
  snow?: boolean;
  /** Manchas de vento no chão: [clara, escura]. */
  drift?: [string, string];
  /** Rajadas finas no chão: [clara, escura]. */
  streak?: [string, string];
}

const PAL: Record<Biome, Palette> = {
  forest: {
    ground: ['#5e8a36', '#679640', '#557e32', '#72a246'],
    groundDetail: ['#8cbf52', '#46692a', '#9c8a58', '#7cb04a'],
    outer: ['#4f7a30', '#5a8836', '#47702c'],
    rock: [0x8a8c84, 0x7a7c74, 0x9a988c],
    trunk: 0x5a3d26,
    leaf: [0x3e8a36, 0x4f9e40, 0x357a30, 0x68b44a],
    water: 0x1e3a3a,
    waterEmissive: 0x061212,
    drift: ['#7fa35a', '#2b4a22'],
  },
  plains: {
    ground: ['#6e9444', '#789c4a', '#66883e', '#84a452'],
    groundDetail: ['#a8c860', '#5a7a34', '#b89a62', '#98bc58'],
    outer: ['#5e843c', '#688e42', '#587c38'],
    rock: [0x9a988e, 0x8a887e, 0xaaa69a],
    trunk: 0x5e4630,
    leaf: [0x4e9a3c, 0x62ac46, 0x44883a, 0x7cbc52],
    water: 0x2a3a40,
    waterEmissive: 0x080e10,
    drift: ['#f6f4d6', '#6a7a3a'],
  },
  desert: {
    ground: ['#c4a274', '#ceac7c', '#b8986c', '#d6b686'],
    groundDetail: ['#e0bb82', '#a87c48', '#d8b078', '#b28654'],
    outer: ['#b88c56', '#c4985e', '#ae824e'],
    rock: [0xa8704a, 0x9a6242, 0xb87e56],
    trunk: 0x6a4a2e,
    leaf: [0x5e7a3a, 0x6c8a44, 0x4e6a30],
    water: 0x2e6a70,
    waterEmissive: 0x0a1c1e,
    drift: ['#f6e2b4', '#a57a44'],
    streak: ['#fbe9bc', '#d6ae70'],
  },
  mountain: {
    // base um tom mais fria e escura: as luzes da neve e as sombras longas passam a aparecer
    ground: ['#8e9ab0', '#9aa6ba', '#8592a8', '#a6b2c6'],
    groundDetail: ['#eef4fb', '#c4d2e4', '#dde8f4', '#b3c2d8'],
    outer: ['#9ca4b0', '#a8b0bc', '#929aa6'],
    rock: [0x6a6e78, 0x5a5e68, 0x7a7e88],
    trunk: 0x3e3024,
    leaf: [0x2a4a3a, 0x325444, 0x243e32],
    water: 0x223244,
    waterEmissive: 0x060a10,
    drift: ['#f4f9ff', '#606e98'],
    streak: ['#f7fbff', '#c9d8ea'],
    snow: true,
  },
  ash: {
    ground: ['#5a4640', '#644e46', '#503e38', '#6a524a'],
    groundDetail: ['#5a4a40', '#261c18', '#6a5446', '#2e2420'],
    outer: ['#2e2420', '#382a24', '#261e1a'],
    rock: [0x3a302c, 0x2e2622, 0x4a3c34],
    trunk: 0x221a16,
    leaf: [0x3a2a22, 0x2e221c],
    water: 0xff5a1a,
    waterEmissive: 0xff4a10,
    drift: ['#6a5c56', '#1c1412'],
    streak: ['#4a3a34', '#2a201c'],
    lava: true,
  },
};

const TILE_PX = 64;

/** Kit da floresta com as peças do packtextura no lugar das antigas (os tokens `pack:*` viram peças do PACK). */
const PACK_KIT: BiomeKit = {
  ...KITS.forest,
  rock: ['pack:rock'],
  ridge: ['pack:tree'],
  peak: ['pack:tree'],
  trees: ['pack:tree'],
  ringTree: [],
  stump: 'pack:log',
};
/** Token de peça do kit → grupo de peças do packtextura (packKit.ts). */
const PACK_TOKEN: Record<string, string[]> = {
  'pack:tree': PACK.trees,
  'pack:rock': PACK.rocks,
  'pack:log': PACK.logs,
  'pack:bush': PACK.bushes,
  'pack:ruin': PACK.ruins,
};
/** Escala das peças do packtextura por token (as árvores do kit são maiores que as antigas). */
const PACK_SCALE: Record<string, number> = { 'pack:tree': 0.85 };

export function buildBiomeScenery(zone: ParsedZone, theme: ZoneTheme): SceneryHandle {
  const biome: Biome = theme === 'bridge' || theme === 'town' ? 'plains' : theme;
  const P = PAL[biome];
  const root = new THREE.Group();
  const W = zone.width;
  const H = zone.height;
  const X = (x: number) => x - W / 2 + 0.5;
  const Z = (y: number) => y - H / 2 + 0.5;
  const rnd = mulberry(hashStr(theme + W * 31 + zone.walls.length * 7 + zone.voids.length));
  /** Escala das quantidades de decoração com o tamanho do mapa (os antigos tinham 15 × 13). */
  const areaK = (W * H) / (15 * 13);
  const edgeK = (W + H) / 28;
  /** Floresta: chão, árvores, rochas, troncos e arbustos vêm do kit packtextura. */
  const pack = theme === 'forest';
  /** Kit de peças da ambientação (pacotes, cores, sombra de contato, luz quente, névoa). */
  const kit: BiomeKit = pack ? PACK_KIT : KITS[biome];
  const tintOfPath = (path: string) =>
    kit.rock.includes(path) ? kit.rockTint
      : kit.ridge.includes(path) || kit.peak.includes(path) || kit.towers.includes(path) || (kit.trees ?? []).includes(path) ? kit.ridgeTint
      : Object.values(kit.camp).includes(path) ? kit.campTint
      : { color: 0xffffff, amount: 0 };

  // ---------------- Chão ----------------
  // floresta: chão em camadas, com lago e poças (texturas do dono; ver forestGround.ts)
  const forest = pack ? packForestGround(zone, 22) : undefined;
  if (forest) root.add(forest.group);
  if (!pack) {
    const outerTex = groundTexture(P, 256, 256, 4, rnd, true);
    outerTex.repeat.set((W + 44) / 4, (H + 44) / 4);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + 44, H + 44).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: outerTex }));
    outer.position.y = -0.03;
    outer.receiveShadow = true;
    root.add(outer);

    const boardTex = boardTexture(P, zone, rnd, areaK);
    // Tiles de vazio ficam vazados no chão (a água/lava aparece por baixo).
    const board = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: boardTex, alphaTest: 0.5 }));
    board.receiveShadow = true;
    root.add(board);
  }

  // ---------------- Água / lava nos tiles de vazio ----------------
  // na floresta o lago é desenhado pelo chão (forestGround.ts); nos outros biomas, a água de sempre
  const liquid = zone.voids.length && !pack ? liquidMesh(zone, P, X, Z) : undefined;
  if (liquid) root.add(liquid.mesh);

  // ---------------- Props (dentro do tabuleiro + decoração em volta) ----------------
  const place: Record<string, THREE.Matrix4[]> = {};
  const put = (kind: string, x: number, z: number, s: number, rot = rnd() * Math.PI * 2, sy = s) => {
    (place[kind] ??= []).push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, sy, s)));
  };
  // Peças em GLB do kit (cada uma com a cor da ambientação) + sombra de contato sob cada uma
  const glb: Record<string, THREE.Matrix4[]> = {};
  /** Peças do packtextura (chave = nome da peça no GLB), desenhadas instanciadas no fim. */
  const packMats: Record<string, THREE.Matrix4[]> = {};
  const warm: THREE.Vector3[] = [];
  const contact: THREE.Matrix4[] = [];
  const glbPut = (path: string, x: number, z: number, s0: number, rot = rnd() * Math.PI * 2, sy0 = s0) => {
    // um token `pack:*` escolhe ao acaso uma peça do grupo; o resto é GLB da ambientação
    const k = PACK_SCALE[path] ?? 1;
    const s = s0 * k;
    const mx = packMatrix(x, z, s, rot, sy0 * k);
    const group = PACK_TOKEN[path];
    if (group) (packMats[group[Math.floor(rnd() * group.length)]] ??= []).push(mx);
    else (glb[path] ??= []).push(mx);
    contact.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.015, z), new THREE.Quaternion(), new THREE.Vector3(s * 1.15, 1, s * 1.15)));
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
  /** Árvore procedural da decoração (pinheiro, carvalho, cacto, morta...); sem kit, usa a de reserva. */
  const procTree = (fallback: string) => (kit.ringTree.length ? pick(kit.ringTree) : fallback);
  /** Grupo de peças espalhadas num raio (uma crista, um morro, um paredão). */
  const cluster = (cx: number, cz: number, n: number, radius: number, s0: number, s1: number, list: string[]) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * radius;
      glbPut(pick(list), cx + Math.cos(a) * d, cz + Math.sin(a) * d, s0 + rnd() * (s1 - s0));
    }
  };
  /** Acampamento abandonado com as peças do kit: barraca, fogueira acesa, barril, caixa, carroça, bandeira e cama. */
  const camp = (cx: number, cz: number) => {
    const c = kit.camp;
    glbPut(c.tent, cx, cz, 1.05, rnd() * Math.PI * 2);
    glbPut(c.fire, cx + 1.2, cz + 0.7, 0.95);
    warm.push(new THREE.Vector3(cx + 1.2, 0, cz + 0.7));
    glbPut(c.barrel, cx - 1.0, cz - 0.8, 1.0);
    glbPut(c.crate, cx - 1.3, cz + 1.0, 0.95);
    glbPut(c.bed, cx + 0.2, cz - 1.2, 0.95, rnd() * Math.PI * 2);
    glbPut(c.cart, cx - 2.1, cz - 2.0, 1.0);
    glbPut(c.flag, cx + 0.9, cz - 1.7, 1.0);
    glbPut(c.sign, cx - 0.3, cz + 1.8, 1.0);
  };
  for (const pr of zone.props) {
    const x = X(pr.x) + (rnd() - 0.5) * 0.12;
    const z = Z(pr.y) + (rnd() - 0.5) * 0.12;
    putProp(pr.kind, x, z);
  }
  function putProp(kind: PropKind, x: number, z: number): void {
    switch (kind) {
      case 'tree':
        if (pack) glbPut('pack:tree', x, z, 0.85 + rnd() * 0.3);
        else if (kit.trees && rnd() < 0.5) glbPut(pick(kit.trees), x, z, 0.85 + rnd() * 0.3);
        else put(procTree(biome === 'mountain' ? 'pineSnow' : 'oak'), x, z, 0.85 + rnd() * 0.3);
        break;
      case 'rock':
        // pedras e paredes do mapa: tamanhos variados para não virarem um bloco repetido
        glbPut(pick(kit.rock), x, z, 0.9 + rnd() * 0.6);
        break;
      case 'cactus':
        put('cactus', x, z, 0.85 + rnd() * 0.25);
        break;
      case 'ruin':
        if (pack) glbPut('pack:ruin', x, z, 0.95 + rnd() * 0.15);
        else put('ruin', x, z, 0.95 + rnd() * 0.15);
        break;
      case 'stump':
        if (kit.stump) glbPut(kit.stump, x, z, 0.8 + rnd() * 0.25);
        else put('deadTree', x, z, 0.75 + rnd() * 0.3);
        break;
      case 'tent':
        glbPut(kit.camp.tent, x, z, 1, Math.floor(rnd() * 4) * (Math.PI / 2));
        break;
      case 'rubble':
        glbPut(pick(kit.rock), x, z, 0.6 + rnd() * 0.3);
        break;
      case 'barrels':
        glbPut(kit.camp.barrel, x, z, 0.95 + rnd() * 0.15);
        break;
      case 'wall':
        // paredes '#': afloramento de duas peças do kit (o tile continua bloqueado no jogo)
        glbPut(pick(kit.rock), x - 0.12, z + 0.08, 0.8 + rnd() * 0.15);
        glbPut(pick(kit.rock), x + 0.14, z - 0.1, 0.6 + rnd() * 0.2);
        break;
      case 'cityWall':
        break; // muralha da cidade: construída inteira em CityGate
      case 'palm':
        put('palm', x, z, 0.95 + rnd() * 0.3);
        break;
      case 'lantern':
        glbPut('town/lantern', x, z, 1);
        warm.push(new THREE.Vector3(x, 0, z));
        break;
      case 'cart':
        glbPut(kit.camp.cart, x, z, 1);
        break;
      case 'brazier':
        glbPut(kit.camp.fire, x, z, 0.9);
        warm.push(new THREE.Vector3(x, 0, z));
        break;
      case 'parapet':
        glbPut(pick(kit.rock), x, z, 0.7);
        break;
      default:
        glbPut(pick(kit.rock), x, z, 0.8);
    }
  }
  // Cordilheira do fundo, picos, torres/ruínas, encostas laterais e acampamentos: tudo do kit do bioma
  if (kit.ridge.length) {
    for (let x = -W / 2 - 10; x <= W / 2 + 10; x += 4.2) cluster(x + (rnd() - 0.5) * 2, -H / 2 - 8 - rnd() * 3, 3 + Math.floor(rnd() * 2), 1.4, 2.2, 3.4, kit.ridge);
    for (let x = -W / 2 - 6; x <= W / 2 + 6; x += 7) cluster(x + rnd() * 2, -H / 2 - 15 - rnd() * 2, 3, 2, 3.6, 5.2, kit.peak);
    kit.towers.forEach((t, i) => glbPut(t, (i === 0 ? -1 : 1) * (W / 4), -H / 2 - 16, 1.6));
    for (let z = -H / 2 - 6; z <= H / 2 + 2; z += 4.6) {
      cluster(-W / 2 - 7 - rnd() * 2, z, 3, 1.5, 1.6, 2.6, kit.ridge);
      cluster(W / 2 + 7 + rnd() * 2, z, 3, 1.5, 1.6, 2.6, kit.ridge);
    }
    // acampamentos nos flancos, na altura do meio do mapa (aparecem ao afastar a câmera)
    camp(-W / 2 - 2.4, 4);
    camp(W / 2 + 2.4, -6);
  }
  // Decoração solta em volta do tabuleiro (fora da frente, que fica livre para a câmera)
  const decoN = Math.round(({ forest: 200, plains: 200, desert: 60, ash: 50, mountain: 26 } as Record<string, number>)[biome] * edgeK);
  for (let i = 0; i < decoN; i++) {
    const side = rnd();
    let x: number;
    let z: number;
    if (side < 0.36) {
      x = -W / 2 - 0.8 - rnd() * 13;
      z = -H / 2 - 12 + rnd() * (H + 16);
    } else if (side < 0.72) {
      x = W / 2 + 0.8 + rnd() * 13;
      z = -H / 2 - 12 + rnd() * (H + 16);
    } else {
      x = -W / 2 - 6 + rnd() * (W + 12);
      z = -H / 2 - 1.2 - rnd() * 14;
    }
    const r = rnd();
    const big = 0.9 + rnd() * 0.7;
    if (r < 0.2) glbPut(pick(kit.rock), x, z, big * (0.9 + rnd() * 0.4));
    else if (r < 0.5) {
      if (kit.ringTree.length) put(pick(kit.ringTree), x, z, big);
      else if (kit.trees) glbPut(pick(kit.trees), x, z, big);
      else glbPut(pick(kit.ridge), x, z, big);
    } else if (biome === 'forest' || biome === 'plains') {
      const plant = pick(['bush', 'bush', 'flowers'] as const);
      if (plant === 'bush' && pack) glbPut('pack:bush', x, z, 1.2 + rnd() * 0.9);
      else put(plant, x, z, 1.2 + rnd() * 0.9);
    } else {
      const path = pick([kit.camp.barrel, kit.camp.crate, kit.camp.bed, kit.camp.cart, kit.camp.sign]);
      glbPut(path, x, z, big * 0.9);
    }
  }
  // Moitas e flores coladas na borda do tabuleiro (moldura viva, como nos mapas de MMO)
  if (biome === 'forest' || biome === 'plains') {
    for (let i = 0; i < 46 * edgeK; i++) {
      const left = rnd() < 0.5;
      const x = (left ? -1 : 1) * (W / 2 + 0.25 + rnd() * 1.4);
      const z = -H / 2 + rnd() * H;
      const plant = rnd() < 0.55 ? 'bush' : 'flowers';
      if (plant === 'bush' && pack) glbPut('pack:bush', x, z, 0.9 + rnd() * 0.8);
      else put(plant, x, z, 0.9 + rnd() * 0.8);
    }
    for (let i = 0; i < 18 * edgeK; i++) {
      const plant = rnd() < 0.6 ? 'bush' : 'flowers';
      const x = -W / 2 + rnd() * W;
      const z = -H / 2 - 0.3 - rnd() * 1.2;
      if (plant === 'bush' && pack) glbPut('pack:bush', x, z, 0.9 + rnd() * 0.7);
      else put(plant, x, z, 0.9 + rnd() * 0.7);
    }
  }
  // Peças em GLB: uma chamada de desenho por tipo (instanciadas), com geada na neve
  for (const [path, mats] of Object.entries(glb)) instanceProps(root, path, mats, { tint: tintOfPath(path) });
  // Peças do packtextura: uma chamada de desenho por malha (InstancedMesh)
  // (copas e rochas do kit saem mais escuras e frias que o verde cru do pacote, para casar com a grama)
  for (const [key, mats] of Object.entries(packMats)) packInstances(root, key, mats, key.startsWith('Tree_') ? 0xa8c890 : key.startsWith('Rock_') ? 0x8f958c : undefined);
  // Sombras de contato: uma mancha escura e suave sob cada peça (uma chamada de desenho para todas)
  if (contact.length) {
    const blobs = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softCircle(), color: kit.contact, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      contact.length,
    );
    contact.forEach((m, i) => blobs.setMatrixAt(i, m));
    blobs.renderOrder = 1;
    root.add(blobs);
  }
  // Luz quente pontual (lanternas, fogueiras): poça de luz alaranjada no chão + brilho no ar
  const flames: { m: THREE.MeshBasicMaterial; ph: number }[] = [];
  for (const p of warm) {
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: softCircle(), color: kit.warm, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.position.set(p.x, 0.03, p.z);
    pool.renderOrder = 2;
    root.add(pool);
    flames.push({ m: pool.material as THREE.MeshBasicMaterial, ph: rnd() * Math.PI * 2 });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softCircle(), color: kit.warm, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    sp.position.set(p.x, 1.1, p.z);
    sp.scale.setScalar(1.8);
    root.add(sp);
  }

  const geoKit = propKit(P, biome);
  for (const [kind, mats] of Object.entries(place)) {
    const geo = geoKit.geos[kind];
    if (!geo) continue;
    const im = new THREE.InstancedMesh(geo, geoKit.material, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    root.add(im);
  }

  // Tufos/pedrinhas espalhados no tabuleiro (só visual, sem colisão)
  const tufts = tuftMesh(zone, P, biome, X, Z, rnd, areaK);
  if (tufts) root.add(tufts);

  // ---------------- Muralha e portão da cidade ----------------
  const cityGate = buildCityGate(zone, theme);
  root.add(cityGate.group);

  // ---------------- Poças d'água com reflexo (tiles 'w') ----------------
  const puddles = zone.floor.filter((f) => f.ground === 'puddle');
  // na floresta as poças são do chão (forestGround.ts: lama e água pequena, no mesmo nível do terreno)
  if (puddles.length && !pack) {
    const geos = puddles.map((f) => new THREE.CircleGeometry(0.34 + rnd() * 0.16, 12).rotateX(-Math.PI / 2).scale(1.3, 1, 0.9).translate(X(f.x) + (rnd() - 0.5) * 0.3, 0.012, Z(f.y) + (rnd() - 0.5) * 0.3));
    // água parada: céu claro refletido (emissivo) + brilho especular do sol
    const ice = biome === 'mountain';
    const pm = new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshPhongMaterial(ice
      ? { color: 0xa9c8e6, emissive: 0x2c4a6a, specular: 0xffffff, shininess: 220, transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }
      : { color: 0x3e5c5e, emissive: biome === 'forest' ? 0x2a4448 : 0x3a4c58, specular: 0xfff4d8, shininess: 140, transparent: true, opacity: 0.82, polygonOffset: true, polygonOffsetFactor: -1 }));
    pm.receiveShadow = true;
    pm.renderOrder = 1;
    root.add(pm);
  }

  // ---------------- Floresta: luz filtrada entre as árvores (raios de sol) ----------------
  const shafts: { m: THREE.Mesh; ph: number; base: number }[] = [];
  if (biome === 'forest') {
    const shaftMat = () =>
      new THREE.MeshBasicMaterial({ map: shaftTexture(), color: new THREE.Color(1.0, 0.92, 0.62), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
    const open = zone.floor.filter((f) => f.ground !== 'gate');
    const n = Math.min(36, Math.round(10 * Math.sqrt(areaK)));
    for (let i = 0; i < n; i++) {
      const f = open[Math.floor(rnd() * open.length)];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9 + rnd() * 0.9, 7), shaftMat());
      // inclinado na direção do sol, "caindo" das copas
      m.position.set(X(f.x) + 1.4, 3.2, Z(f.y) - 0.9);
      m.rotation.set(-0.35, 0.6 + rnd() * 0.3, 0.42);
      m.renderOrder = 7;
      root.add(m);
      shafts.push({ m, ph: rnd() * 6.28, base: 0.1 + rnd() * 0.1 });
      // mancha de luz no chão sob o raio
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softCircle(), color: new THREE.Color(0.5, 0.45, 0.25), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      spot.position.set(X(f.x), 0.02, Z(f.y));
      spot.renderOrder = 2;
      root.add(spot);
    }
  }

  // ---------------- Deserto: oásis (reflexo), escaravelhos e abutres ----------------
  const glints: { s: THREE.Sprite; ph: number }[] = [];
  const scarabs: { m: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; t: number; spd: number }[] = [];
  const vultures: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; c: THREE.Vector3; rad: number; h: number; spd: number; ph: number }[] = [];
  if (biome === 'desert') {
    const glintMat = new THREE.SpriteMaterial({ map: softCircle(), color: new THREE.Color(1.8, 1.6, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const v of zone.voids) {
      if (rnd() > 0.35) continue;
      const s2 = new THREE.Sprite(glintMat);
      s2.position.set(X(v.x) + (rnd() - 0.5) * 0.8, 0.05, Z(v.y) + (rnd() - 0.5) * 0.8);
      s2.scale.setScalar(0.3);
      s2.renderOrder = 6;
      root.add(s2);
      glints.push({ s: s2, ph: rnd() * 6.28 });
    }
    const sand = zone.floor.filter((f) => f.ground === 'plain');
    const bug = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.55, 1.35), new THREE.MeshLambertMaterial({ color: 0x1a2a30, emissive: 0x06101a }));
    for (let i = 0; i < Math.min(18, Math.round(4 * Math.sqrt(areaK))); i++) {
      const a = sand[Math.floor(rnd() * sand.length)];
      const b2 = sand[Math.floor(rnd() * sand.length)];
      const m = bug.clone();
      root.add(m);
      scarabs.push({ m, a: new THREE.Vector3(X(a.x), 0.03, Z(a.y)), b: new THREE.Vector3(X(a.x) + (rnd() - 0.5) * 6, 0.03, Z(a.y) + (rnd() - 0.5) * 6), t: rnd(), spd: 0.06 + rnd() * 0.05 });
      void b2;
    }
    const vMat = new THREE.MeshLambertMaterial({ color: 0x2a1e18, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const g2 = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), vMat);
      body.scale.set(0.8, 0.6, 1.8);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshLambertMaterial({ color: 0x8a5a4a }));
      head.position.set(0, 0.05, 0.3);
      const wing = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.15), new THREE.Vector3(0, 0, -0.15), new THREE.Vector3(0.9, 0, -0.1)]);
      wing.computeVertexNormals();
      const wl = new THREE.Mesh(wing, vMat);
      const wr = new THREE.Mesh(wing, vMat);
      wr.scale.x = -1;
      g2.add(body, head, wl, wr);
      root.add(g2);
      vultures.push({ g: g2, wl, wr, c: new THREE.Vector3((rnd() - 0.5) * W * 0.6, 0, (rnd() - 0.5) * H * 0.6), rad: 4 + rnd() * 6, h: 7 + rnd() * 3, spd: (0.12 + rnd() * 0.08) * (i % 2 ? 1 : -1), ph: rnd() * 6.28 });
    }
  }

  // ---------------- Ambiente animado ----------------
  let t = 0;
  let acc = 0;
  const amb = new THREE.Vector3();
  // Névoa baixa do bioma (geada, poeira, neblina de campo, fumaça): manchas largas na altura da cintura,
  // deslizando devagar. Transparente e sem escrever profundidade: velam o fundo sem esconder heróis nem inimigos.
  const mist: { m: THREE.Mesh; x: number; ph: number }[] = [];
  if (kit.mist) {
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(9 + rnd() * 6, 4 + rnd() * 3).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: softCircle(), color: kit.mist.color, transparent: true, opacity: kit.mist.opacity + rnd() * 0.04, depthWrite: false }),
      );
      const x = -W / 2 + rnd() * W;
      m.position.set(x, 0.55 + rnd() * 0.5, -H / 2 + rnd() * H);
      m.renderOrder = 3;
      root.add(m);
      mist.push({ m, x, ph: rnd() * Math.PI * 2 });
    }
  }

  const update = (dt: number, particles: ParticleLayer) => {
    t += dt;
    for (const f of mist) f.m.position.x = f.x + Math.sin(t * 0.12 + f.ph) * 1.2;
    // chama da lanterna/fogueira: a poça de luz treme de leve, em fases diferentes
    for (const f of flames) f.m.opacity = 0.32 + 0.07 * Math.sin(t * 5.1 + f.ph) + 0.03 * Math.sin(t * 11.3 + f.ph * 2);
    if (liquid) liquid.uniforms.uTime.value = t;
    forest?.update(dt);
    cityGate.update(dt, particles);
    for (const sh of shafts) (sh.m.material as THREE.MeshBasicMaterial).opacity = sh.base * (0.7 + 0.3 * Math.sin(t * 0.35 + sh.ph));
    for (const g of glints) g.s.scale.setScalar(0.18 + Math.max(0, Math.sin(t * 2.2 + g.ph)) * 0.35);
    for (const sc of scarabs) {
      sc.t += dt * sc.spd;
      const k = (Math.sin(sc.t * Math.PI * 2) + 1) / 2;
      const prev = sc.m.position.clone();
      sc.m.position.lerpVectors(sc.a, sc.b, k);
      const d = sc.m.position.clone().sub(prev);
      if (d.lengthSq() > 1e-8) sc.m.rotation.y = Math.atan2(d.x, d.z);
    }
    for (const v of vultures) {
      const a = t * v.spd + v.ph;
      v.g.position.set(v.c.x + Math.cos(a) * v.rad, v.h + Math.sin(t * 0.3 + v.ph) * 0.5, v.c.z + Math.sin(a) * v.rad);
      v.g.rotation.y = -a + (v.spd > 0 ? Math.PI : 0);
      v.g.rotation.z = v.spd > 0 ? 0.25 : -0.25;
      const f = Math.sin(t * 1.5 + v.ph) * 0.15; // plana, quase sem bater asa
      v.wl.rotation.z = f;
      v.wr.rotation.z = -f;
    }
    acc += dt;
    const step = 1 / (12 * Math.min(3, Math.sqrt(areaK)));
    while (acc > step) {
      acc -= step;
      amb.set((rnd() - 0.5) * (W + 6), 0, (rnd() - 0.5) * (H + 6));
      if (biome === 'forest') {
        // vagalumes
        if (rnd() < 0.5)
          particles.glow.emit({ pos: amb.clone().setY(0.4 + rnd() * 1.4), velJitter: 0.25, life: 2.6, size: 0.06, sizeEnd: 0.02, color: new THREE.Color(1.6, 2.2, 0.6), colorEnd: new THREE.Color(0.2, 0.4, 0.05), drag: 0.4, count: 1 });
        // esporos: pontinhos claros descendo devagar nos raios de sol
        if (rnd() < 0.6)
          particles.glow.emit({ pos: amb.clone().setY(2.5 + rnd() * 2), vel: new THREE.Vector3(0.12, -0.18, 0.05), velJitter: 0.06, life: 7, size: 0.035, sizeEnd: 0.025, color: new THREE.Color(1.0, 0.95, 0.75), colorEnd: new THREE.Color(0.4, 0.38, 0.3), drag: 0.1, count: 1 });
      } else if (biome === 'desert' || biome === 'plains') {
        particles.smoke.emit({ pos: amb.clone().setY(0.15), posJitter: 0.4, vel: new THREE.Vector3(1.4, 0.05, 0.3), velJitter: 0.3, life: 2.4, size: 0.4, sizeEnd: 1.2, color: biome === 'desert' ? new THREE.Color(0.75, 0.55, 0.35) : new THREE.Color(0.5, 0.48, 0.42), alpha: 0.18, count: 1 });
      } else if (biome === 'mountain') {
        for (let i = 0; i < 3; i++)
          particles.glow.emit({ pos: new THREE.Vector3((rnd() - 0.5) * (W + 8), 5 + rnd() * 2, (rnd() - 0.5) * (H + 8)), vel: new THREE.Vector3(0.4, -1.1, 0.1), velJitter: 0.2, life: 4.5, size: 0.05, sizeEnd: 0.04, color: new THREE.Color(0.9, 0.95, 1.1), count: 1 });
      } else if (biome === 'ash') {
        particles.fire.emit({ pos: amb.clone().setY(0.1), posJitter: 0.3, vel: new THREE.Vector3(0.1, 1.2, 0), velJitter: 0.4, life: 1.8, size: 0.06, sizeEnd: 0.02, color: new THREE.Color(3, 1.1, 0.3), colorEnd: new THREE.Color(0.4, 0.05, 0), count: 1 });
        particles.smoke.emit({ pos: new THREE.Vector3((rnd() - 0.5) * (W + 8), 4 + rnd() * 2, (rnd() - 0.5) * (H + 8)), vel: new THREE.Vector3(0.3, -0.5, 0), velJitter: 0.2, life: 5, size: 0.05, sizeEnd: 0.05, color: new THREE.Color(0.35, 0.33, 0.32), alpha: 0.6, count: 1 });
      }
    }
  };
  return { group: root, update, setLights: (on: boolean) => cityGate.setLights(on) };
}

// ---------------- Texturas de chão ----------------

function groundTexture(P: Palette, w: number, h: number, detailPer: number, rnd: () => number, outer = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = (outer ? P.outer : P.ground)[0];
  g.fillRect(0, 0, w, h);
  paintNoise(g, w, h, outer ? P.outer : P.ground, rnd, 90);
  if (P.drift) paintDrifts(g, w, h, rnd, 60, P.drift);
  if (P === PAL.forest || P === PAL.plains) paintSunDapple(g, w, h, rnd, 10);
  paintDetail(g, w, h, P, rnd, detailPer * 40);
  if (P === PAL.forest || P === PAL.plains) paintFlowers(g, w, h, rnd, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function boardTexture(P: Palette, zone: ParsedZone, rnd: () => number, areaK = 1): THREE.CanvasTexture {
  const w = zone.width * TILE_PX;
  const h = zone.height * TILE_PX;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = P.ground[0];
  g.fillRect(0, 0, w, h);
  paintNoise(g, w, h, P.ground, rnd, Math.round(420 * areaK));
  if (P.drift) paintDrifts(g, w, h, rnd, Math.round(90 * areaK), P.drift);
  // leve xadrez para ler a grade (bem sutil, como um chão gasto)
  for (const f of zone.floor) {
    if ((f.x + f.y) % 2) continue;
    g.fillStyle = 'rgba(0,0,0,0.045)';
    g.fillRect(f.x * TILE_PX, f.y * TILE_PX, TILE_PX, TILE_PX);
  }
  const green = P === PAL.forest || P === PAL.plains;
  if (green) paintSunDapple(g, w, h, rnd, Math.round(12 * areaK));
  // deserto: menos pedrinhas (a areia já tem as rajadas); o resto segue a paleta
  paintDetail(g, w, h, P, rnd, Math.round((P === PAL.desert ? 140 : 900) * areaK));
  // Trilhas de verdade: dos 2 spawns até o portão (caminho mais curto na grade), gastas pela horda
  const routes = zone.spawnPoints.map((sp) => routeToGate(zone, sp));
  if (P === PAL.mountain) {
    // na neve, a trilha é neve pisoteada (pedras claras e azuladas, quase da cor do chão)
    const stone = ['#d4deea', '#c2cfdf', '#e2e9f2', '#b8c6d8'];
    g.globalAlpha = 0.45;
    for (const r of routes) paintCobbleRoute(g, rnd, stone, r);
    g.globalAlpha = 1;
  } else {
    // terra gasta pelos passos da horda: faixa suave da cor da ambientação, sem pontinhos
    const worn = P === PAL.forest ? '#7d6a3c' : P === PAL.plains ? '#9a8450' : P === PAL.desert ? '#c09460' : '#2e211c';
    for (const r of routes) paintWornRoute(g, worn, r);
  }
  if (green) paintFlowers(g, w, h, rnd, Math.round(70 * areaK));
  // tipos de chão
  for (const f of zone.floor) {
    const px = f.x * TILE_PX;
    const py = f.y * TILE_PX;
    if (f.ground === 'fog') {
      // chão úmido e sombrio sob a neblina
      g.fillStyle = 'rgba(10,26,22,0.28)';
      g.fillRect(px, py, TILE_PX, TILE_PX);
    } else if (f.ground === 'roots') {
      // raízes expostas: linhas grossas e tortas, marrom-escuro com luz no dorso
      for (let k = 0; k < 3; k++) {
        const y0 = py + rnd() * TILE_PX;
        g.strokeStyle = '#3a2616';
        g.lineWidth = 5 + rnd() * 3;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(px - 6, y0);
        g.bezierCurveTo(px + TILE_PX * 0.3, y0 - 14 + rnd() * 28, px + TILE_PX * 0.7, y0 - 14 + rnd() * 28, px + TILE_PX + 6, y0 + (rnd() - 0.5) * 20);
        g.stroke();
        g.strokeStyle = 'rgba(160,120,80,0.45)';
        g.lineWidth = 1.5;
        g.stroke();
      }
    } else if (f.ground === 'puddle') {
      // na neve, a poça vira gelo (claro e liso); no resto, água parada escura
      g.fillStyle = P.snow ? 'rgba(170,200,232,0.55)' : 'rgba(30,40,30,0.4)';
      g.beginPath();
      g.ellipse(px + TILE_PX / 2, py + TILE_PX / 2, TILE_PX * 0.5, TILE_PX * 0.36, 0, 0, Math.PI * 2);
      g.fill();
    } else if (f.ground === 'gate') {
      // lajes de pedra do portão
      g.fillStyle = '#8a8478';
      g.fillRect(px, py, TILE_PX, TILE_PX);
      g.strokeStyle = 'rgba(40,36,30,0.7)';
      g.lineWidth = 2;
      for (let k = 0; k < 2; k++) g.strokeRect(px + 3 + k * 30, py + 4, 28, TILE_PX - 8);
    }
  }
  // vazios: recorta o chão e escurece a borda (margem de terra molhada / queimada)
  for (const v of zone.voids) {
    g.fillStyle = P.lava ? 'rgba(40,10,0,0.9)' : 'rgba(20,30,20,0.6)';
    g.fillRect(v.x * TILE_PX - 6, v.y * TILE_PX - 6, TILE_PX + 12, TILE_PX + 12);
  }
  for (const v of zone.voids) g.clearRect(v.x * TILE_PX, v.y * TILE_PX, TILE_PX, TILE_PX);
  // borda escura em volta dos obstáculos (contato)
  for (const wl of zone.walls) {
    const gx = wl.x * TILE_PX + TILE_PX / 2;
    const gy = wl.y * TILE_PX + TILE_PX / 2;
    const gr = g.createRadialGradient(gx, gy, 6, gx, gy, TILE_PX * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(gx - TILE_PX, gy - TILE_PX, TILE_PX * 2, TILE_PX * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Terra gasta: degradês suaves ao longo da rota (sem pedrinhas), para ler o caminho da horda. */
function paintWornRoute(g: CanvasRenderingContext2D, color: string, route: { x: number; y: number }[]): void {
  for (const p of route) {
    const cx = (p.x + 0.5) * TILE_PX;
    const cy = (p.y + 0.5) * TILE_PX;
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, TILE_PX * 0.75);
    gr.addColorStop(0, hexA(color, 0.3));
    gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr;
    g.fillRect(cx - TILE_PX, cy - TILE_PX, TILE_PX * 2, TILE_PX * 2);
  }
}

/** Cor hex (#rrggbb) com alfa, para os degradês do canvas. */
function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * Manchas de vento no chão: acúmulos claros e vales escuros, em degradê suave (neve, areia, musgo, cinza).
 * Quebram a cor lisa do chão e dão relevo sem geometria extra.
 */
function paintDrifts(g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number, drift: [string, string]): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 40 + rnd() * 110;
    const lit = rnd() < 0.6;
    const col = lit ? drift[0] : drift[1];
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, hexA(col, lit ? 0.22 : 0.2));
    grd.addColorStop(0.55, hexA(col, lit ? 0.1 : 0.09));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate(x, y);
    g.scale(1, 0.5 + rnd() * 0.4);
    g.translate(-x, -y);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}

function paintNoise(g: CanvasRenderingContext2D, w: number, h: number, cols: string[], rnd: () => number, n: number): void {
  // manchas suaves (degradê radial) — chão "pintado à mão", sem bordas duras
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 14 + rnd() * 52;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = cols[Math.floor(rnd() * cols.length)];
    gr.addColorStop(0, col);
    gr.addColorStop(1, col + '00');
    g.globalAlpha = 0.35 + rnd() * 0.45;
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
}

/** Luz de sol filtrada: manchas claras e quentes + sombras frescas (floresta/campos). */
function paintSunDapple(g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 30 + rnd() * 90;
    const warm = rnd() < 0.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, warm ? 'rgba(255,240,150,0.12)' : 'rgba(20,50,30,0.12)');
    gr.addColorStop(1, warm ? 'rgba(255,240,150,0)' : 'rgba(20,50,30,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Florzinhas miúdas no gramado. */
function paintFlowers(g: CanvasRenderingContext2D, w: number, h: number, rnd: () => number, n: number): void {
  const cols = ['#fff6e0', '#ffe070', '#ff9ab8', '#b8a8ff', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const col = cols[Math.floor(rnd() * cols.length)];
    const k = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < k; j++) {
      const x = cx + (rnd() - 0.5) * 18;
      const y = cy + (rnd() - 0.5) * 12;
      g.fillStyle = 'rgba(30,60,20,0.35)';
      g.beginPath();
      g.arc(x + 0.8, y + 1, 2.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 1.8 + rnd() * 0.8, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function paintDetail(g: CanvasRenderingContext2D, w: number, h: number, P: Palette, rnd: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const col = P.groundDetail[Math.floor(rnd() * P.groundDetail.length)];
    g.fillStyle = col;
    g.strokeStyle = col;
    g.globalAlpha = 0.35 + rnd() * 0.4;
    const k = rnd();
    if (P.lava && k < 0.06) {
      // rachaduras incandescentes
      g.strokeStyle = '#ff7a2a';
      g.globalAlpha = 0.55;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      for (let s = 0; s < 4; s++) g.lineTo(x + (rnd() - 0.5) * 40, y + (rnd() - 0.5) * 40);
      g.stroke();
    } else if (P.streak && k < 0.3) {
      // rajadas de vento (neve, areia): fios finos e claros, todos na mesma direção
      g.strokeStyle = P.streak[rnd() < 0.5 ? 0 : 1];
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.globalAlpha = 0.25 + rnd() * 0.3;
      const len = 14 + rnd() * 34;
      const ang = -0.35 + (rnd() - 0.5) * 0.15;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 - 2, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    } else if (k < 0.55 && (P === PAL.forest || P === PAL.plains)) {
      // tufos de grama (com ponta iluminada)
      g.lineWidth = 1.4;
      if (rnd() < 0.35) g.strokeStyle = '#b8dc6a';
      g.beginPath();
      for (let s = 0; s < 4; s++) {
        g.moveTo(x + s * 2, y);
        g.lineTo(x + s * 2 + (rnd() - 0.5) * 5, y - 4 - rnd() * 6);
      }
      g.stroke();
    } else if (k < 0.55 && P === PAL.desert) {
      // ondulações de areia
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, 10 + rnd() * 14, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    } else {
      // pedrinhas
      g.beginPath();
      g.arc(x, y, 1 + rnd() * 2.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  g.lineWidth = 1;
}

// ---------------- Água / lava ----------------

function liquidMesh(zone: ParsedZone, P: Palette, X: (x: number) => number, Z: (y: number) => number) {
  const geos: THREE.BufferGeometry[] = [];
  for (const v of zone.voids) geos.push(new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2).translate(X(v.x), 0, Z(v.y)));
  const geo = mergeGeometries(geos)!;
  const uniforms = { uTime: { value: 0 }, uCol: { value: new THREE.Color(P.water) }, uEm: { value: new THREE.Color(P.waterEmissive) }, uLava: { value: P.lava ? 1 : 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uLava; uniform vec3 uCol, uEm; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float a = n(p*2.2 + vec2(uTime*0.25, uTime*0.18)) * 0.6 + n(p*5.0 - uTime*0.4) * 0.4;
        vec3 col;
        if (uLava > 0.5) {
          col = mix(vec3(0.35,0.04,0.0), uCol*1.6, smoothstep(0.35, 0.85, a));
          col += vec3(1.5,0.7,0.2) * pow(a, 6.0);
        } else {
          col = mix(uCol*0.6, uCol*1.4, a) + uEm;
          col += vec3(0.5,0.6,0.7) * smoothstep(0.78, 0.95, a) * 0.35;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  // logo abaixo do chão recortado e acima do terreno externo (y = -0,03)
  mesh.position.y = -0.012;
  const g = new THREE.Group();
  g.add(mesh);
  return { mesh: g, uniforms };
}

// ---------------- Props low-poly (cores por vértice) ----------------

function tint(geo: THREE.BufferGeometry, color: number, jitter = 0.06, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color(color);
  const r = mulberry(seed);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * jitter * 2;
    for (let j = 0; j < 3 && i + j < n; j++) {
      col[(i + j) * 3] = c.r * k;
      col[(i + j) * 3 + 1] = c.g * k;
      col[(i + j) * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Cor por altura (base escura → topo iluminado) + variação por face: copas "pintadas". */
function tintGrad(geo: THREE.BufferGeometry, bottom: number, top: number, jitter = 0.08, seed = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const pos = g.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const c = new THREE.Color();
  const r = mulberry(seed);
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (r() - 0.5) * jitter * 2;
    for (let j = 0; j < 3 && i + j < n; j++) {
      const y = (pos.getY(i + j) - bb.min.y) / Math.max(0.001, bb.max.y - bb.min.y);
      c.copy(a).lerp(b, Math.min(1, Math.max(0, y * 1.15 - 0.05)));
      col[(i + j) * 3] = c.r * k;
      col[(i + j) * 3 + 1] = c.g * k;
      col[(i + j) * 3 + 2] = c.b * k;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function lighten(hex: number, k: number): number {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color(0xfff4b0), k);
  return c.getHex();
}
function darken(hex: number, k: number): number {
  return new THREE.Color(hex).multiplyScalar(1 - k).getHex();
}

function propKit(P: Palette, biome: Biome): { geos: Record<string, THREE.BufferGeometry>; material: THREE.Material } {
  const leaf = (i: number) => P.leaf[i % P.leaf.length];
  const pine = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 6).translate(0, 0.27, 0), P.trunk, 0.08, 2),
    tintGrad(new THREE.ConeGeometry(0.52, 0.78, 9).translate(0, 0.72, 0), darken(leaf(2), 0.3), lighten(leaf(0), 0.1), 0.08, 3),
    tintGrad(new THREE.ConeGeometry(0.42, 0.66, 9).translate(0, 1.06, 0), darken(leaf(0), 0.25), lighten(leaf(1), 0.18), 0.08, 4),
    tintGrad(new THREE.ConeGeometry(0.28, 0.54, 9).translate(0, 1.4, 0), darken(leaf(1), 0.2), lighten(leaf(3), 0.3), 0.08, 5),
  ])!;
  const pineSnow = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 6).translate(0, 0.27, 0), P.trunk, 0.08, 2),
    tint(new THREE.ConeGeometry(0.5, 0.75, 7).translate(0, 0.72, 0), leaf(0), 0.1, 3),
    tint(new THREE.ConeGeometry(0.4, 0.62, 7).translate(0, 1.06, 0), leaf(1), 0.1, 4),
    tint(new THREE.ConeGeometry(0.3, 0.3, 7).translate(0, 1.2, 0), 0xe8eef6, 0.04, 8),
    tint(new THREE.ConeGeometry(0.27, 0.5, 7).translate(0, 1.38, 0), 0xf2f6fb, 0.04, 9),
  ])!;
  // copa cheia: vários "tufos" arredondados, base sombreada e topo ensolarado
  const clump = (r: number, x: number, y: number, z: number, i: number, seed: number) =>
    tintGrad(new THREE.IcosahedronGeometry(r, 1).scale(1, 0.86, 1).translate(x, y, z), darken(leaf(i), 0.35), lighten(leaf(i), 0.28), 0.08, seed);
  const oak = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.08, 0.14, 0.75, 7).translate(0, 0.37, 0), P.trunk, 0.08, 6),
    clump(0.5, 0, 1.02, 0, 1, 7),
    clump(0.36, 0.34, 1.12, 0.1, 3, 8),
    clump(0.34, -0.32, 1.06, -0.12, 0, 9),
    clump(0.32, 0.05, 1.08, 0.36, 2, 33),
    clump(0.3, -0.06, 1.1, -0.36, 3, 34),
    clump(0.3, 0.06, 1.42, 0.02, 1, 35),
  ])!;
  const bush = mergeGeometries([
    clump(0.26, 0, 0.18, 0, 1, 36),
    clump(0.2, 0.22, 0.14, 0.06, 3, 37),
    clump(0.19, -0.2, 0.13, -0.05, 0, 38),
    clump(0.16, 0.02, 0.3, 0.1, 2, 39),
  ])!;
  const blossom = (x: number, z: number, h: number, col: number, seed: number) =>
    mergeGeometries([
      tint(new THREE.CylinderGeometry(0.012, 0.012, h, 3).translate(x, h / 2, z), 0x3a7a2a, 0.05, seed),
      tint(new THREE.IcosahedronGeometry(0.05, 0).translate(x, h, z), col, 0.06, seed + 1),
    ])!;
  const flowers = mergeGeometries([
    blossom(0, 0, 0.16, 0xfff2f6, 41),
    blossom(0.08, 0.05, 0.13, 0xffd84a, 43),
    blossom(-0.07, 0.04, 0.14, 0xff8ab0, 45),
    blossom(0.02, -0.08, 0.12, 0xb8a0ff, 47),
    blossom(-0.05, -0.06, 0.15, 0xffffff, 49),
  ])!;
  const branch = (len: number, ang: number, yaw: number, y: number) =>
    tint(new THREE.CylinderGeometry(0.025, 0.045, len, 5).translate(0, len / 2, 0).rotateZ(ang).rotateY(yaw).translate(0, y, 0), P.trunk, 0.1, 10);
  const deadTree = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.06, 0.14, 1.05, 6).translate(0, 0.52, 0), biome === 'ash' ? 0x1e1612 : 0x5a4a3a, 0.1, 11),
    branch(0.5, 0.8, 0, 0.7),
    branch(0.42, -0.9, 1.3, 0.82),
    branch(0.35, 0.7, 2.6, 0.95),
    branch(0.3, -0.6, 4.1, 0.55),
  ])!;
  const rock = mergeGeometries([
    tint(new THREE.DodecahedronGeometry(0.42, 0).scale(1.1, 0.8, 0.95).translate(0, 0.28, 0), P.rock[0], 0.12, 12),
    tint(new THREE.DodecahedronGeometry(0.22, 0).translate(0.3, 0.12, 0.18), P.rock[1], 0.12, 13),
    ...(P.snow ? [tint(new THREE.DodecahedronGeometry(0.3, 0).scale(1.1, 0.35, 0.95).translate(0, 0.55, 0), 0xeef3fa, 0.04, 14)] : []),
  ])!;
  const cactusArm = (x: number, y: number, h: number) =>
    mergeGeometries([
      tint(new THREE.CylinderGeometry(0.07, 0.07, 0.24, 7).rotateZ(Math.PI / 2).translate(x / 2, y, 0), 0x4e7a3a, 0.08, 15),
      tint(new THREE.CylinderGeometry(0.07, 0.07, h, 7).translate(x, y + h / 2, 0), 0x5a8a42, 0.08, 16),
    ])!;
  const cactus = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8).translate(0, 0.55, 0), 0x5a8a42, 0.08, 17),
    tint(new THREE.SphereGeometry(0.12, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.1, 0), 0x5a8a42, 0.08, 18),
    cactusArm(0.24, 0.5, 0.34),
    cactusArm(-0.22, 0.66, 0.26),
  ])!;
  const stone = biome === 'desert' ? 0xd2b080 : 0x9a968a;
  const ruin = biome === 'desert' ? carvedRuin(stone) : mergeGeometries([
    tint(new THREE.BoxGeometry(0.72, 0.18, 0.72).translate(0, 0.09, 0), stone, 0.08, 19),
    tint(new THREE.CylinderGeometry(0.24, 0.27, 1.25, 10).translate(0, 0.8, 0), stone, 0.1, 20),
    tint(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 10).rotateZ(0.5).translate(0.34, 0.12, 0.2), stone, 0.1, 21),
    tint(new THREE.BoxGeometry(0.5, 0.12, 0.5).translate(0, 1.48, 0), stone, 0.08, 22),
  ])!;
  // palmeira: tronco em gomos curvado + leque de folhas
  const palmParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) palmParts.push(tint(new THREE.CylinderGeometry(0.075 - i * 0.004, 0.09 - i * 0.004, 0.3, 7).translate(i * 0.035, 0.15 + i * 0.28, 0), i % 2 ? 0x7a5a3a : 0x8a6a44, 0.06, 60 + i));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    // folha = caixa fina envergada (fechada: aparece de qualquer ângulo)
    const leaf = new THREE.BoxGeometry(0.22, 0.95, 0.025, 1, 4, 1);
    const pos = leaf.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const t = (pos.getY(k) + 0.475) / 0.95;
      pos.setZ(k, pos.getZ(k) - t * t * 0.45);
      pos.setX(k, pos.getX(k) * (1 - t * 0.6));
    }
    leaf.rotateX(-Math.PI / 2 + 0.25).translate(0, 0, 0.45).rotateY(a).translate(0.2, 1.72, 0);
    palmParts.push(tint(leaf, i % 2 ? 0x5e8a36 : 0x4e7a2e, 0.1, 70 + i));
  }
  const palm = mergeGeometries(palmParts)!;
  const block = mergeGeometries([
    tint(new THREE.BoxGeometry(1, 0.95, 1).translate(0, 0.47, 0), stone, 0.1, 23),
    tint(new THREE.BoxGeometry(1.04, 0.1, 1.04).translate(0, 1.0, 0), 0xe0c898, 0.06, 24),
  ])!;
  const tent = mergeGeometries([
    tint(new THREE.ConeGeometry(0.62, 1.0, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), biome === 'desert' ? 0xd8c8a0 : 0x8a6a48, 0.1, 25),
    tint(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 5).translate(0, 0.62, 0), 0x3a2a1c, 0.05, 26),
  ])!;
  const rubble = mergeGeometries([
    tint(new THREE.DodecahedronGeometry(0.2, 0).translate(-0.15, 0.12, 0.05), P.rock[0], 0.12, 27),
    tint(new THREE.DodecahedronGeometry(0.16, 0).translate(0.2, 0.1, -0.1), P.rock[1], 0.12, 28),
    tint(new THREE.BoxGeometry(0.34, 0.14, 0.18).rotateY(0.6).translate(0.05, 0.08, 0.22), P.rock[2] ?? P.rock[0], 0.1, 29),
    tint(new THREE.BoxGeometry(0.28, 0.12, 0.2).rotateY(-0.4).translate(-0.1, 0.25, -0.05), P.rock[1], 0.1, 30),
  ])!;
  const barrel = (x: number, z: number) => tint(new THREE.CylinderGeometry(0.17, 0.17, 0.46, 9).translate(x, 0.23, z), 0x6a4a2e, 0.1, 31);
  const barrels = mergeGeometries([barrel(-0.15, 0), barrel(0.18, 0.1), barrel(0, -0.2), tint(new THREE.BoxGeometry(0.34, 0.3, 0.34).translate(0.15, 0.15, -0.28), 0x7a5a38, 0.1, 32)])!;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  return { geos: { pine, pineSnow, oak, bush, flowers, deadTree, rock, cactus, ruin, block, tent, rubble, barrels, palm }, material };
}

/**
 * Coluna solar entalhada (deserto): base em degraus, fuste com anéis de relevo, uma serpente
 * enrolada subindo e o disco do sol no capitel — nada de "pedra genérica".
 */
function carvedRuin(stone: number): THREE.BufferGeometry {
  const dark = darken(stone, 0.22);
  const gold = 0xe0a848;
  const parts: THREE.BufferGeometry[] = [
    tint(new THREE.BoxGeometry(0.86, 0.14, 0.86).translate(0, 0.07, 0), darken(stone, 0.1), 0.08, 80),
    tint(new THREE.BoxGeometry(0.7, 0.12, 0.7).translate(0, 0.2, 0), stone, 0.08, 81),
    tint(new THREE.CylinderGeometry(0.23, 0.27, 1.35, 12).translate(0, 0.92, 0), stone, 0.08, 82),
  ];
  // anéis de relevo (faixas entalhadas)
  for (const y of [0.45, 0.95, 1.45]) parts.push(tint(new THREE.TorusGeometry(0.255, 0.035, 5, 14).rotateX(Math.PI / 2).translate(0, y, 0), dark, 0.06, 83));
  // serpente em espiral em volta do fuste
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = i * 0.42;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.27, 0.3 + i * 0.043, Math.sin(a) * 0.27));
  }
  parts.push(tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.035, 5), darken(stone, 0.35), 0.06, 84));
  parts.push(tint(new THREE.SphereGeometry(0.06, 6, 5).scale(1.3, 0.8, 1).translate(pts[28].x, pts[28].y + 0.03, pts[28].z), darken(stone, 0.35), 0.05, 85));
  // capitel + disco solar com raios
  parts.push(tint(new THREE.BoxGeometry(0.62, 0.14, 0.62).translate(0, 1.66, 0), stone, 0.08, 86));
  parts.push(tint(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2).translate(0, 1.95, 0.02), gold, 0.05, 87));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(tint(new THREE.BoxGeometry(0.04, 0.12, 0.03).rotateZ(a).translate(Math.sin(a) * -0.27, 1.95 + Math.cos(a) * 0.27, 0.02), gold, 0.05, 88 + i));
  }
  return mergeGeometries(parts)!;
}

/** Caminho mais curto (BFS) do spawn até o portão na grade da zona — só para pintar trilhas. */
function routeToGate(zone: ParsedZone, from: { x: number; y: number }): { x: number; y: number }[] {
  const W = zone.width;
  const H = zone.height;
  const open = new Uint8Array(W * H);
  for (const f of zone.floor) open[f.y * W + f.x] = 1;
  const goal = new Uint8Array(W * H);
  for (const c of zone.city) goal[c.y * W + c.x] = 1;
  const prev = new Int32Array(W * H).fill(-1);
  const start = from.y * W + from.x;
  const q = [start];
  prev[start] = start;
  let end = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (goal[i]) {
      end = i;
      break;
    }
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (!open[j] || prev[j] >= 0) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  const out: { x: number; y: number }[] = [];
  for (let i = end; i >= 0 && i !== start; i = prev[i]) out.push({ x: i % W, y: (i / W) | 0 });
  out.push(from);
  return out.reverse();
}

/** Calçamento de pedras ao longo de uma rota (tiles), com bordas irregulares. */
function paintCobbleRoute(g: CanvasRenderingContext2D, rnd: () => number, stone: string[], route: { x: number; y: number }[]): void {
  for (let i = 0; i < route.length; i++) {
    const p = route[i];
    const cx = (p.x + 0.5) * TILE_PX;
    const cy = (p.y + 0.5) * TILE_PX;
    for (let k = 0; k < 11; k++) {
      const px = cx + (rnd() - 0.5) * TILE_PX * 1.5;
      const py = cy + (rnd() - 0.5) * TILE_PX * 1.5;
      const rx = 6 + rnd() * 5;
      const ry = 4.5 + rnd() * 3.5;
      const rot = rnd() * Math.PI;
      g.fillStyle = 'rgba(30,26,20,0.5)';
      g.beginPath();
      g.ellipse(px + 1, py + 1.5, rx + 1.4, ry + 1.4, rot, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = stone[Math.floor(rnd() * stone.length)];
      g.beginPath();
      g.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Faixa vertical de luz (degradê) para os raios de sol da floresta. */
let shaftTex: THREE.Texture | undefined;
function shaftTexture(): THREE.Texture {
  if (shaftTex) return shaftTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gx = g.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)');
  gx.addColorStop(0.5, 'rgba(255,255,255,1)');
  gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx;
  g.fillRect(0, 0, 64, 256);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, 'rgba(0,0,0,0)');
  gy.addColorStop(0.25, 'rgba(0,0,0,0.9)');
  gy.addColorStop(1, 'rgba(0,0,0,0.05)');
  g.fillStyle = gy;
  g.fillRect(0, 0, 64, 256);
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}

function tuftMesh(zone: ParsedZone, P: Palette, biome: Biome, X: (x: number) => number, Z: (y: number) => number, rnd: () => number, areaK = 1): THREE.InstancedMesh | undefined {
  const floor = zone.floor;
  if (!floor.length) return undefined;
  const geo =
    biome === 'forest' || biome === 'plains'
      ? tint(new THREE.ConeGeometry(0.05, 0.22, 3).translate(0, 0.11, 0), P.leaf[0], 0.15, 40)
      : biome === 'mountain'
        ? tint(new THREE.DodecahedronGeometry(0.07, 0).translate(0, 0.03, 0), 0xe2eaf5, 0.05, 41) // pedrinhas de gelo, claras
        : tint(new THREE.DodecahedronGeometry(0.06, 0).translate(0, 0.03, 0), P.rock[0], 0.15, 41);
  // neve: poucas pedrinhas (o mapa grande multiplica a quantidade; muitas viram "moedinhas" no chão)
  const n = Math.min(Math.round((biome === 'mountain' ? 10 : 260) * areaK), floor.length * 2);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const f = floor[Math.floor(rnd() * floor.length)];
    const s = 0.7 + rnd() * 0.8;
    m.compose(
      new THREE.Vector3(X(f.x) + (rnd() - 0.5) * 0.9, 0, Z(f.y) + (rnd() - 0.5) * 0.9),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28),
      new THREE.Vector3(s, s, s),
    );
    im.setMatrixAt(i, m);
  }
  im.receiveShadow = true;
  return im;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let q = s;
    q = Math.imul(q ^ (q >>> 15), q | 1);
    q ^= q + Math.imul(q ^ (q >>> 7), q | 61);
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
