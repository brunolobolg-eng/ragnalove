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
import { loadTexture } from './naturKit';
import { groundLayers } from './groundLayers';
import { CENARIO_DIR } from './sceneryTextures';

/**
 * Cenário genérico por bioma (floresta, planície, deserto, montanha, cinzas).
 * Só visual: a grade vem do mapa da zona. Low-poly pintado (cores por vértice + texturas
 * de chão geradas em imagem), com decoração em volta do tabuleiro e partículas de ambiente.
 */
type Biome = Exclude<ZoneTheme, 'bridge' | 'town'>;

interface Palette {
  rock: number[];
  trunk: number;
  leaf: number[];
  water: number;
  waterEmissive: number;
  lava?: boolean;
  snow?: boolean;
}

const PAL: Record<Biome, Palette> = {
  forest: {
    rock: [0x8a8c84, 0x7a7c74, 0x9a988c],
    trunk: 0x5a3d26,
    leaf: [0x3e8a36, 0x4f9e40, 0x357a30, 0x68b44a],
    water: 0x1e3a3a,
    waterEmissive: 0x061212,
  },
  plains: {
    rock: [0x9a988e, 0x8a887e, 0xaaa69a],
    trunk: 0x5e4630,
    leaf: [0x4e9a3c, 0x62ac46, 0x44883a, 0x7cbc52],
    water: 0x2a3a40,
    waterEmissive: 0x080e10,
  },
  desert: {
    rock: [0xa8704a, 0x9a6242, 0xb87e56],
    trunk: 0x6a4a2e,
    leaf: [0x5e7a3a, 0x6c8a44, 0x4e6a30],
    water: 0x2e6a70,
    waterEmissive: 0x0a1c1e,
  },
  mountain: {
    rock: [0x6a6e78, 0x5a5e68, 0x7a7e88],
    trunk: 0x3e3024,
    leaf: [0x2a4a3a, 0x325444, 0x243e32],
    water: 0x223244,
    waterEmissive: 0x060a10,
    snow: true,
  },
  ash: {
    rock: [0x3a302c, 0x2e2622, 0x4a3c34],
    trunk: 0x221a16,
    leaf: [0x3a2a22, 0x2e221c],
    water: 0xff5a1a,
    waterEmissive: 0xff4a10,
    lava: true,
  },
};


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

/** Opções do cenário de bioma. `ceuIlhas` (Ato IV, ceuIlhas.ts): sem chão nem decoração externa; os obstáculos da grade ficam. */
export interface BiomeOpts {
  ceuIlhas?: boolean;
}

export function buildBiomeScenery(zone: ParsedZone, theme: ZoneTheme, opts: BiomeOpts = {}): SceneryHandle {
  const biome: Biome = theme === 'bridge' || theme === 'town' ? 'plains' : theme;
  const ceuIlhas = opts.ceuIlhas === true;
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
  // (Ato IV: o chão é o do ceuIlhas.ts, então este bloco não entra)
  const forest = floresta && !ceuIlhas ? forestGround(zone, 22) : undefined;
  const desert = theme === 'desert' && !ceuIlhas ? desertGround(zone, 22) : undefined;
  const ice = iceMap && !ceuIlhas ? iceGround(zone, 22) : undefined;
  const lavaChao = lavaMap && !ceuIlhas ? lavaGround(zone, 22) : undefined;
  for (const h of [forest, desert, ice, lavaChao]) if (h) root.add(h.group);
  if (!natural && !desert && !ceuIlhas) root.add(chaoPlanicie(zone, W, H));

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
  if (kit.ridge.length && !ceuIlhas) {
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
  const decoN = ceuIlhas ? 0 : Math.round(({ forest: 200, plains: 200, desert: 60, ash: 50, mountain: 26 } as Record<string, number>)[biome] * edgeK);
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
  if ((biome === 'forest' || biome === 'plains') && !ceuIlhas) {
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

// ---------------- Chão da planície (camadas, sem canvas) ----------------

/**
 * Planície (Campos Cinzentos, Vale Seco): chão em camadas. A base é a textura gerada (chao_planicie.webp), com os
 * buracos recortados (a água aparece por baixo). Por cima, em máscaras suaves: um xadrez leve que ajuda a ler a
 * grade, a trilha gasta pela horda, a sombra das paredes e as lajes do portão. Em volta, a textura de fora.
 */
function chaoPlanicie(zone: ParsedZone, W: number, H: number): THREE.Group {
  const root = new THREE.Group();
  // em volta do tabuleiro: 22 casas de cada lado (como antes)
  const fora = loadTexture(`${CENARIO_DIR}chao_fora.webp`);
  fora.repeat.set((W + 44) / 4, (H + 44) / 4);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + 44, H + 44).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: fora }));
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  root.add(outer);

  const g = groundLayers(zone, 0);
  const { voidPix, raster, blurred, layer, rect, disc } = g;
  root.add(g.group);
  const cinza = (m: Float32Array) => Uint8ClampedArray.from(m, (v) => Math.round(v * 255));
  // base: a textura da planície, com os buracos recortados (alfa 0 onde há vazio)
  const semVazio = Uint8ClampedArray.from(voidPix, (v) => (v ? 0 : 255));
  layer({ map: loadTexture(`${CENARIO_DIR}chao_planicie.webp`), tiles: 8, alpha: semVazio, opaque: true, y: 0, order: 0 });
  // xadrez leve: as casas ímpares da grade, bem sutis (lê a grade sem pesar)
  const xadrez = raster((c) => {
    for (const f of zone.floor) if ((f.x + f.y) % 2) rect(c, f.x, f.y);
  });
  layer({ color: 0x000000, opacity: 0.045, alpha: cinza(xadrez), y: 0.001, order: 1 });
  // trilha gasta: a rota de cada entrada até o portão, em manchas suaves
  const rotas = zone.spawnPoints.map((sp) => routeToGate(zone, sp));
  const gasta = blurred((c) => {
    for (const r of rotas) for (const p of r) disc(c, p.x, p.y, 0.5);
  }, 0.35);
  layer({ color: 0x9a8450, opacity: 0.3, alpha: cinza(gasta), y: 0.002, order: 2 });
  // sombra das paredes: uma mancha escura em volta de cada obstáculo
  const sombra = blurred((c) => {
    for (const w of zone.walls) disc(c, w.x, w.y, 0.45);
  }, 0.25);
  layer({ color: 0x000000, opacity: 0.35, alpha: cinza(sombra), y: 0.003, order: 3 });
  // portão: lajes de pedra (textura gerada, uma casa por repetição)
  const portao = raster((c) => {
    for (const f of zone.floor) if (f.ground === 'gate') rect(c, f.x, f.y);
  });
  layer({ map: loadTexture(`${CENARIO_DIR}laje_portao.webp`), tiles: 1, alpha: cinza(portao), y: 0.004, order: 4 });
  return root;
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

/** Faixa vertical de luz (degradê) para os raios de sol da floresta: imagem gerada (raio_floresta.webp). */
let shaftTex: THREE.Texture | undefined;
function shaftTexture(): THREE.Texture {
  return (shaftTex ??= loadTexture(`${CENARIO_DIR}raio_floresta.webp`));
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
