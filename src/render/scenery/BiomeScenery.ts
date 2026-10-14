import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParsedZone, PropKind, ZoneTheme } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import type { SceneryHandle } from './BridgeScenery';
import { buildCityGate } from './CityGate';
import { softCircle } from '../textures';
import { instanceProps } from './props';
import { KIT, instanceKit, kitMatrix } from './naturKit';
import { ICE_ART } from '../../config/biomeArt';
import { iceGround } from './iceGround';
import { lavaGround } from './lavaGround';
import { forestGround } from './forestGround';
import { desertGround } from './desertGround';
import { KITS, tintHex, type BiomeKit } from './biomeKits';

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

/** Kit da floresta com as peças naturais (naturKit.ts) no lugar das antigas: os tokens `nat:*` viram grupos do KIT. */
const NAT_KIT: BiomeKit = {
  ...KITS.forest,
  rock: ['nat:pedra'],
  ridge: ['nat:arvore'],
  peak: ['nat:arvore'],
  trees: ['nat:arvore'],
  ringTree: [],
  stump: 'nat:tronco',
};
/** Token de peça do kit → grupo de peças do naturKit.ts (cada cópia sorteia uma peça do grupo). */
const NAT_TOKEN: Record<string, string[]> = Object.fromEntries(Object.entries(KIT).map(([grupo, pecas]) => [`nat:${grupo}`, pecas]));
/** Escala das peças naturais por token (as árvores do kit são maiores que as antigas). */
const NAT_SCALE: Record<string, number> = { 'nat:arvore': 0.85, 'nat:neveArvore': ICE_ART.treeScale };
/** Gelo (Passo da Geada, Garganta de Ferrugem): pedras e colunas de gelo, pinheiros com neve e cristais. */
const ICE_KIT: BiomeKit = {
  ...KITS.mountain,
  rock: ['nat:neveRocha', 'nat:geloRocha'],
  ridge: ['nat:geloColuna'],
  peak: ['nat:geloColuna', 'nat:geloCristal'],
  towers: [],
  trees: ['nat:neveArvore'],
  ringTree: ['nat:neveArvore', 'nat:neveMonte', 'nat:geloCristal', 'nat:geloEstalagmite'],
  stump: 'nat:arvoreMortaGelo',
};
/** Lava (Cume das Cinzas): basalto com colunas, árvores queimadas com veias e cristais que brilham. */
const LAVA_KIT: BiomeKit = {
  ...KITS.ash,
  rock: ['nat:basaltoRocha'],
  ridge: ['nat:basaltoColuna'],
  peak: ['nat:basaltoColuna', 'nat:lavaPilar'],
  towers: [],
  trees: null,
  ringTree: ['nat:lavaArvore', 'nat:lavaCristal'],
  stump: 'nat:lavaArvore',
};

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
  /** Floresta: chão, árvores, rochas, troncos e arbustos vêm do naturKit.ts (texturas do dono). */
  const floresta = theme === 'forest';
  /** Gelo e lava: chão em camadas e peças naturais com as texturas da folha 24 (iceGround.ts e lavaGround.ts). */
  const iceMap = biome === 'mountain';
  const lavaMap = biome === 'ash';
  /** Peças naturais e chão em camadas (sem canvas): floresta, gelo e lava. */
  const natural = floresta || iceMap || lavaMap;
  /** Kit de peças da ambientação (pacotes, cores, sombra de contato, luz quente, névoa). */
  const kit: BiomeKit = floresta ? NAT_KIT : iceMap ? ICE_KIT : lavaMap ? LAVA_KIT : KITS[biome];
  const tintOfPath = (path: string) =>
    kit.rock.includes(path) ? kit.rockTint
      : kit.ridge.includes(path) || kit.peak.includes(path) || kit.towers.includes(path) || (kit.trees ?? []).includes(path) ? kit.ridgeTint
      : Object.values(kit.camp).includes(path) ? kit.campTint
      : { color: 0xffffff, amount: 0 };

  // ---------------- Chão ----------------
  // floresta, deserto, gelo e lava: chão em camadas com as texturas do dono (forestGround, desertGround, iceGround, lavaGround)
  const forest = floresta ? forestGround(zone, 22) : undefined;
  const desert = theme === 'desert' ? desertGround(zone, 22) : undefined;
  const ice = iceMap ? iceGround(zone, 22) : undefined;
  const lavaChao = lavaMap ? lavaGround(zone, 22) : undefined;
  for (const h of [forest, desert, ice, lavaChao]) if (h) root.add(h.group);
  if (!natural && !desert) {
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
  // na floresta e no deserto o lago é desenhado pelo chão; nos outros biomas, a água de sempre
  const liquid = zone.voids.length && !natural && !desert ? liquidMesh(zone, P, X, Z) : undefined;
  if (liquid) root.add(liquid.mesh);

  // ---------------- Props (dentro do tabuleiro + decoração em volta) ----------------
  // Tudo sai de arte do dono: GLB do kit (public/models/props) ou peças naturais texturizadas (naturKit.ts).
  // Nada de árvore, cacto ou moita procedural de cor lisa.
  // Peças em GLB do kit (cada uma com a cor da ambientação) + sombra de contato sob cada uma
  const glb: Record<string, THREE.Matrix4[]> = {};
  /** Peças naturais (chave = nome da peça no naturKit.ts), desenhadas instanciadas no fim. */
  const natMats: Record<string, THREE.Matrix4[]> = {};
  const warm: THREE.Vector3[] = [];
  const contact: THREE.Matrix4[] = [];
  const glbPut = (path: string, x: number, z: number, s0: number, rot = rnd() * Math.PI * 2, sy0 = s0) => {
    // um token `nat:*` escolhe ao acaso uma peça do grupo; o resto é GLB da ambientação
    const k = NAT_SCALE[path] ?? 1;
    const s = s0 * k;
    const mx = kitMatrix(x, z, s, rot, sy0 * k);
    const group = NAT_TOKEN[path];
    if (group) (natMats[group[Math.floor(rnd() * group.length)]] ??= []).push(mx);
    else (glb[path] ??= []).push(mx);
    contact.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.015, z), new THREE.Quaternion(), new THREE.Vector3(s * 1.15, 1, s * 1.15)));
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(rnd() * list.length)];
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
        if (floresta) glbPut('nat:arvore', x, z, 0.85 + rnd() * 0.3);
        else glbPut(pick(kit.trees ?? (kit.ringTree.length ? kit.ringTree : kit.ridge)), x, z, 0.85 + rnd() * 0.3);
        break;
      case 'rock':
        // pedras e paredes do mapa: tamanhos variados para não virarem um bloco repetido
        glbPut(pick(kit.rock), x, z, 0.9 + rnd() * 0.6);
        break;
      case 'cactus':
        // sem cacto em GLB do dono: o bloqueio do deserto é uma pedra de arenito (naturKit.ts, com a textura do dono)
        glbPut('nat:arenito', x, z, 0.85 + rnd() * 0.25);
        break;
      case 'ruin':
        // ruínas de pedra do naturKit (texturas do dono); nos biomas com kit de rochas, a crista do kit
        if (natural && !floresta) glbPut(pick(kit.ridge), x, z, 0.95 + rnd() * 0.15);
        else glbPut('nat:ruina', x, z, 0.95 + rnd() * 0.15);
        break;
      case 'stump':
        glbPut(kit.stump ?? 'nat:tronco', x, z, 0.8 + rnd() * 0.25);
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
        // sem palmeira em GLB do dono: moita do naturKit no oásis
        glbPut('nat:arbusto', x, z, 1.1 + rnd() * 0.3);
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
      if (kit.ringTree.length) glbPut(pick(kit.ringTree), x, z, big);
      else if (kit.trees) glbPut(pick(kit.trees), x, z, big);
      else glbPut(pick(kit.ridge), x, z, big);
    } else if (biome === 'forest' || biome === 'plains') {
      glbPut('nat:arbusto', x, z, 1.2 + rnd() * 0.9);
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
      glbPut('nat:arbusto', x, z, 0.9 + rnd() * 0.8);
    }
    for (let i = 0; i < 18 * edgeK; i++) {
      const x = -W / 2 + rnd() * W;
      const z = -H / 2 - 0.3 - rnd() * 1.2;
      glbPut('nat:arbusto', x, z, 0.9 + rnd() * 0.7);
    }
  }
  // Peças em GLB: uma chamada de desenho por tipo (instanciadas), com geada na neve
  for (const [path, mats] of Object.entries(glb)) instanceProps(root, path, mats, { tint: tintOfPath(path) });
  // Peças naturais: uma chamada de desenho por malha (InstancedMesh); as rochas do deserto levam a cor da ambientação
  for (const [key, mats] of Object.entries(natMats)) instanceKit(root, key, mats, KIT.arenito.includes(key) ? tintHex(kit.rockTint) : undefined);
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


  // ---------------- Muralha e portão da cidade ----------------
  const cityGate = buildCityGate(zone, theme);
  root.add(cityGate.group);

  // ---------------- Poças d'água com reflexo (tiles 'w') ----------------
  const puddles = zone.floor.filter((f) => f.ground === 'puddle');
  // na floresta as poças são do chão (forestGround.ts: lama e água pequena, no mesmo nível do terreno)
  if (puddles.length && !floresta) {
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
    // escaravelhos e urubus saíram: eram esferas e triângulos de cor lisa (sem arte do dono para eles)
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
    desert?.update(dt);
    ice?.update(dt);
    lavaChao?.update(dt);
    cityGate.update(dt, particles);
    for (const sh of shafts) (sh.m.material as THREE.MeshBasicMaterial).opacity = sh.base * (0.7 + 0.3 * Math.sin(t * 0.35 + sh.ph));
    for (const g of glints) g.s.scale.setScalar(0.18 + Math.max(0, Math.sin(t * 2.2 + g.ph)) * 0.35);
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

// (props procedurais de cor lisa saíram do cenário: só GLB do dono e naturKit.ts)

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
