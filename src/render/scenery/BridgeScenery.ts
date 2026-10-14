import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VISUAL_CONFIG } from '../../config/visualConfig';
import type { ParsedZone } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import { softCircle } from '../textures';
import { bridgeSideTexture, wallBlockTexture } from './bridgeTextures';
import { muralhaRetas, type TrechoMuralha } from './muralhaGlb';
import { KIT, instanceKit, kitMatrix, loadTexture } from './naturKit';
import { placeProp } from './props';

/**
 * Zona 1 — o fim da ponte de pedra, diante das muralhas da cidade, à noite.
 * Só visual: a grade (o que bloqueia, onde a horda anda) vem do mapa da zona.
 *
 * Mundo: tile (x, y) → X = x − W/2 + 0.5, Z = y − H/2 + 0.5. A horda vem de Z negativo.
 */
export interface SceneryHandle {
  group: THREE.Group;
  update(dt: number, particles: ParticleLayer): void;
  setLights(on: boolean): void;
}

const WATER_Y = -2.8;

export function buildBridgeScenery(zone: ParsedZone): SceneryHandle {
  const root = new THREE.Group();
  const W = zone.width;
  const H = zone.height;
  const X = (x: number) => x - W / 2 + 0.5;
  const Z = (y: number) => y - H / 2 + 0.5;
  // a ponte continua além da borda norte do mapa, sumindo na névoa
  const FAR_Z = Z(0) - 16;
  const gateTiles = zone.city;
  const gateL = X(Math.min(...gateTiles.map((g) => g.x))) - 0.5;
  const gateR = X(Math.max(...gateTiles.map((g) => g.x))) + 0.5;
  const gateC = (gateL + gateR) / 2;
  // cais do rio (escada por onde sobe o spawn próximo): tiles da praça na coluna 0
  const dockRows = zone.floor.filter((f) => f.plaza && f.x === 0).map((f) => f.y);

  // Limites a partir do próprio mapa
  const bridgeCols = zone.floor.filter((f) => !f.plaza && f.ground !== 'gate').map((f) => f.x);
  const bx0 = Math.min(...bridgeCols) - 1; // parapeito incluso
  const bx1 = Math.max(...bridgeCols) + 1;
  const plaza = zone.floor.filter((f) => f.plaza && !(f.x === 0 && dockRows.includes(f.y)));
  const plazaY0 = Math.min(...plaza.map((f) => f.y));
  const px0 = Math.min(...plaza.map((f) => f.x)) - 1;
  const px1 = Math.max(...plaza.map((f) => f.x)) + 1;
  const deckL = X(bx0) - 0.5;
  const deckR = X(bx1) + 0.5;
  const plazaL = X(px0) - 0.5;
  const plazaR = X(px1) + 0.5;
  const plazaN = Z(plazaY0 - 1) - 0.5; // borda norte da praça (fileira dos parapeitos de canto)
  const wallZ = Z(H - 1) - 0.1; // muralha na última fileira (tiles 'W'), com o portão aberto nos tiles 'g'

  const lambert = (p: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(p);

  // ---------------- Tabuleiro da ponte e praça ----------------
  const deckTex = loadTexture('textures/pedras/pedra_lousa.webp');
  const deckLen = plazaN - FAR_Z;
  deckTex.repeat.set((deckR - deckL) / 4, deckLen / 4);
  // tabuleiro: piso de pedra do dono, em plano (a beira do rio é a lateral de arcos, logo abaixo)
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(deckR - deckL, deckLen).rotateX(-Math.PI / 2), lambert({ map: deckTex }));
  deck.position.set((deckL + deckR) / 2, 0.005, (FAR_Z + plazaN) / 2);
  deck.receiveShadow = true;
  root.add(deck);

  const plazaTex = loadTexture('textures/pedras/pedra_cinza.webp');
  const plazaDepth = wallZ + 1.5 - plazaN;
  plazaTex.repeat.set((plazaR - plazaL) / 4, plazaDepth / 4);
  const plazaMesh = new THREE.Mesh(new THREE.PlaneGeometry(plazaR - plazaL, plazaDepth).rotateX(-Math.PI / 2), lambert({ map: plazaTex, color: 0xc4c8d0 }));
  plazaMesh.position.set((plazaL + plazaR) / 2, 0.005, plazaN + plazaDepth / 2);
  plazaMesh.receiveShadow = true;
  root.add(plazaMesh);

  // Laterais com arcos descendo até a água
  const sideTex = bridgeSideTexture();
  sideTex.repeat.set(deckLen / 5, 1);
  const sideMat = lambert({ map: sideTex });
  const sideH = -WATER_Y + 0.3;
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(deckLen, sideH), sideMat);
    side.rotation.y = s * (Math.PI / 2);
    side.position.set(s < 0 ? deckL : deckR, WATER_Y + sideH / 2 - 0.3, (FAR_Z + plazaN) / 2);
    root.add(side);
  }
  const quayMat = lambert({ map: wallBlockTexture(21) });
  for (const [x0, x1, z0, z1] of [
    [plazaL, deckL, plazaN, plazaN],
    [deckR, plazaR, plazaN, plazaN],
  ]) {
    const w = x1 - x0;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, sideH), quayMat);
    q.position.set((x0 + x1) / 2, WATER_Y + sideH / 2 - 0.3, z0 - 0.001);
    q.rotation.y = Math.PI;
    root.add(q);
    void z1;
  }

  // ---------------- Parapeitos (com trechos quebrados) ----------------
  // parapeito = muros.glb do dono (módulo de pedra com ameias), esticado até 0,55 (inteiro) ou 0,24 (quebrado)
  const parapeitos: TrechoMuralha[] = [];
  const parapeitosQuebrados: TrechoMuralha[] = [];
  const rubbleSpots: THREE.Vector3[] = [];
  const r = mulberry(7);
  /** Segmento reto de parapeito de a até b (sempre alinhado a X ou a Z); `broken` = sem topo e mais baixo. */
  const segment = (a: THREE.Vector2, b: THREE.Vector2, broken = false) => {
    const lista = broken ? parapeitosQuebrados : parapeitos;
    if (Math.abs(a.x - b.x) < 1e-6) lista.push({ a: Math.min(a.y, b.y), b: Math.max(a.y, b.y), linha: a.x, eixo: 'z' });
    else lista.push({ a: Math.min(a.x, b.x), b: Math.max(a.x, b.x), linha: a.y, eixo: 'x' });
    if (broken) rubbleSpots.push(new THREE.Vector3((a.x + b.x) / 2, 0, (a.y + b.y) / 2));
  };
  const brokenZ = new Set([Z(3), -9.5, -15.5].map((v) => Math.round(v * 2) / 2));
  for (const s of [-1, 1]) {
    const x = s < 0 ? deckL + 0.25 : deckR - 0.25;
    for (let z = FAR_Z; z < plazaN + 0.26; z += 1) {
      const z1 = Math.min(z + 1, plazaN + 0.25);
      const broken = brokenZ.has(Math.round((z + 0.5) * 2) / 2) && s < 0;
      segment(new THREE.Vector2(x, z), new THREE.Vector2(x, z1), broken);
    }
    // canto: vira para fora ao longo da borda norte da praça
    const xa = s < 0 ? deckL + 0.25 : deckR - 0.25;
    const xb = s < 0 ? plazaL + 0.25 : plazaR - 0.25;
    segment(new THREE.Vector2(xa, plazaN + 0.25), new THREE.Vector2(xb, plazaN + 0.25));
    // lateral da praça até a muralha (do lado do cais, com a abertura da escada)
    if (s < 0 && dockRows.length) {
      const d0 = Z(Math.min(...dockRows)) - 0.5;
      const d1 = Z(Math.max(...dockRows)) + 0.5;
      segment(new THREE.Vector2(xb, plazaN + 0.25), new THREE.Vector2(xb, d0));
      segment(new THREE.Vector2(xb, d1), new THREE.Vector2(xb, wallZ - 0.5));
    } else segment(new THREE.Vector2(xb, plazaN + 0.25), new THREE.Vector2(xb, wallZ - 0.5));
  }
  muralhaRetas(root, parapeitos, 0.55);
  muralhaRetas(root, parapeitosQuebrados, 0.24);
  if (dockRows.length) {
    // escadaria do cais: por aqui sobem os mortos que vêm pelo rio
    const d0 = Z(Math.min(...dockRows)) - 0.5;
    const d1 = Z(Math.max(...dockRows)) + 0.5;
    // degraus: cada um é só o piso (plano com a pedra do dono), empilhados até a água
    const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) steps.push(new THREE.PlaneGeometry(0.7, d1 - d0).rotateX(-Math.PI / 2).translate(X(0) - 0.15 - i * 0.55, -i * 0.4 + 0.005, (d0 + d1) / 2));
    const stairs = new THREE.Mesh(mergeGeometries(steps)!, lambert({ map: wallBlockTexture(12) }));
    stairs.receiveShadow = true;
    root.add(stairs);
    const dockTex = loadTexture('textures/pedras/pedra_blocos.webp');
    dockTex.repeat.set(0.3, (d1 - d0) / 4);
    const dock = new THREE.Mesh(new THREE.PlaneGeometry(1, d1 - d0).rotateX(-Math.PI / 2), lambert({ map: dockTex }));
    dock.position.set(X(0), 0.005, (d0 + d1) / 2);
    dock.receiveShadow = true;
    root.add(dock);
  }

  // ---------------- Escombros, carroça, barris (tiles bloqueados do mapa) ----------------
  // pedras dos parapeitos quebrados: peças Kenney de pedra (com a cor da ponte), nada de poliedro liso
  for (const s of rubbleSpots)
    for (let i = 0; i < 3; i++)
      placeProp(root, r() < 0.5 ? 'castle/rocks-small' : 'castle/rocks-large', s.x + (r() - 0.5) * 0.7, s.z + (r() - 0.5) * 0.7, { rot: r() * 6.28, scale: 0.45 + r() * 0.2, tint: ROCK_TINT });

  const props = new THREE.Group();
  const cartTiles = zone.props.filter((p) => p.kind === 'cart');
  if (cartTiles.length) {
    // carroça virada de lado, ocupando os tiles 'c'
    const cx = cartTiles.reduce((s, p) => s + X(p.x), 0) / cartTiles.length;
    const cz = cartTiles.reduce((s, p) => s + Z(p.y), 0) / cartTiles.length;
    // carroça tombada de lado (peça Kenney) com a carga espalhada
    placeProp(props, 'town/cart-high', cx, cz, { y: 0.45, rot: 0.18, scale: 1.25, tiltZ: Math.PI / 2 - 0.15 });
    placeProp(props, 'town/wheel', cx - 0.9, cz + 0.6, { y: 0.05, rot: 0.6, scale: 1.4, tiltZ: Math.PI / 2 });
    placeProp(props, 'survival/box-large', cx - 0.6, cz - 0.8, { rot: 0.5, scale: 2 });
    placeProp(props, 'survival/box', cx - 0.9, cz + 0.05, { rot: 1.2, scale: 2 });
    placeProp(props, 'survival/barrel', cx + 0.7, cz + 0.85, { y: 0.27, rot: 0.3, scale: 2, tiltX: Math.PI / 2 });
  }
  // escombros: pedras soltas, tábuas e caixotes quebrados (peças Kenney)
  for (const p of zone.props.filter((q) => q.kind === 'rubble')) {
    const x = X(p.x);
    const z = Z(p.y);
    placeProp(props, r() < 0.5 ? 'castle/rocks-small' : 'castle/rocks-large', x, z, { rot: r() * 6.28, scale: 0.75 + r() * 0.2, tint: ROCK_TINT });
    if (r() < 0.6) placeProp(props, 'survival/resource-planks', x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, { y: 0.05, rot: r() * 6.28, scale: 2, tiltZ: 0.15 });
    if (r() < 0.35) placeProp(props, 'survival/box-open', x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, { rot: r() * 6.28, scale: 2.2, tiltX: 0.3 });
  }
  // barris e caixotes (peças Kenney)
  for (const p of zone.props.filter((q) => q.kind === 'barrels')) {
    const x = X(p.x);
    const z = Z(p.y);
    placeProp(props, 'survival/barrel', x - 0.2, z - 0.15, { rot: r() * 6.28, scale: 2.2 });
    placeProp(props, 'survival/barrel', x + 0.22, z + 0.05, { rot: r() * 6.28, scale: 2.2 });
    placeProp(props, 'survival/barrel-open', x - 0.05, z + 0.35, { y: 0.27, rot: r() * 6.28, scale: 2.2, tiltX: Math.PI / 2 });
    placeProp(props, 'survival/box', x + 0.35, z - 0.35, { rot: r() * 6.28, scale: 2.2 });
  }
  root.add(props);

  // ---------------- Muralha, torres e casa do portão (última fileira; portão aberto nos tiles 'g') ----------------
  // muralha com a peça muros.glb do dono (torres e ameias já vêm no módulo)
  const trechos = [
    [plazaL - 2, gateL - 0.6],
    [gateR + 0.6, plazaR + 2],
  ];
  muralhaRetas(root, trechos.map(([xa, xb]) => ({ a: xa, b: xb, linha: wallZ + 0.3, eixo: 'x' as const })), VISUAL_CONFIG.muralha.alturaCidade);
  // casa do portão: duas torres do castelo do dono com bandeira azul (sem arco/telhado sobre o vão: ficaria
  // entre a câmera e a defesa do portão)
  const gate = new THREE.Group();
  gate.position.set(gateC, 0, wallZ + 0.3);
  const span = gateR - gateL;
  for (const s2 of [-1, 1]) {
    const px = s2 * (span / 2 + 0.6);
    // torres baixas (a câmera olha por cima: nada alto na frente da defesa)
    placeProp(gate, 'castle/tower-square-mid-windows', px, 0, { scale: 1.4 });
    placeProp(gate, 'castle/flag', px, 0, { y: 1.42, scale: 1.2, rot: s2 < 0 ? Math.PI : 0, tint: 0x2e4a8a });
  }
  root.add(gate);
  // torres de pedra nas pontas da praça (castelo Kenney: base + telhado alto) com estandarte
  for (const tx of [plazaL - 0.6, plazaR + 0.6]) {
    placeProp(root, 'castle/tower-square-base', tx, wallZ + 0.4, { scale: 2.3 });
    placeProp(root, 'castle/tower-square-top-roof-high', tx, wallZ + 0.4, { y: 2.3, scale: 2.3 });
    placeProp(root, 'castle/flag-banner-long', tx + (tx < 0 ? 1.2 : -1.2), wallZ - 0.4, { scale: 1.2, rot: Math.PI / 2 });
  }
  // balestras de defesa no alto da muralha
  for (const bx of [plazaL + 5, plazaR - 5]) placeProp(root, 'castle/siege-ballista', bx, wallZ + 0.5, { y: 1.3, rot: Math.PI, scale: 1.1 });


  // ---------------- Água escura com reflexo da lua e das estrelas ----------------
  const waterMat = waterMaterial({ deckL, deckR, plazaL, plazaR, plazaN, wallZ, pierZ0: plazaN - 2.5 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 110, H + 90, 1, 1).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0, WATER_Y, -12);
  root.add(water);
  // (a névoa agora é de partículas rentes à água; as antigas manchas pareciam poças flutuando)
  const mistSpots: THREE.Vector3[] = [];
  for (let i = 0; i < 14; i++) mistSpots.push(new THREE.Vector3((i % 2 ? 1 : -1) * (deckR + 2 + r() * 10), WATER_Y + 0.15, FAR_Z * 0.6 + r() * (H + 10)));

  // ---------------- Margens do rio: barrancos, mata e o acampamento dos refugiados ----------------
  buildBanks(root, { W, H, X, Z, FAR_Z, plazaN, wallZ, deckL, deckR, r });
  riverDressing(root, zone, X, Z);

  // ---------------- Fogo: braseiros, lanternas e tochas ----------------
  // Só o clarão (sprite e brilho do bloom). Sem luz pontual: cada lâmpada custava uma conta por pixel em todo o cenário.
  const flames: { pos: THREE.Vector3; size: number; glow: THREE.Sprite; phase: number }[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: softCircle(), color: new THREE.Color(2.4, 1.1, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const addFlame = (pos: THREE.Vector3, size: number) => {
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(pos);
    glow.scale.setScalar(size * 3.2);
    glow.renderOrder = 5;
    root.add(glow);
    flames.push({ pos, size, glow, phase: r() * 10 });
  };
  // fogueiras do acampamento nas margens
  for (const f of BANK_FIRES) addFlame(f, 0.4);
  for (const l of BANK_LANTERNS) addFlame(l, 0.12);
  // braseiro: a fogueira em pedra do kit do dono (campfire-pit) e o clarão por cima
  const brazier = (x: number, z: number) => {
    placeProp(root, 'survival/campfire-pit', x, z, { scale: 1.1 });
    addFlame(new THREE.Vector3(x, 0.45, z), 0.36);
  };
  // lampião de rua: peça do dono (town/lantern) e o clarão no vidro
  const lantern = (x: number, z: number) => {
    placeProp(root, 'town/lantern', x, z, { scale: 1 });
    addFlame(new THREE.Vector3(x, 1.3, z), 0.16);
  };
  for (const p of zone.props) {
    if (p.kind === 'brazier') {
      // sobre o parapeito da ponte fica colado ao lado de dentro da mureta
      const x = X(p.x);
      const onBridge = p.x === bx0 || p.x === bx1;
      brazier(onBridge ? (p.x === bx0 ? deckL + 0.25 : deckR - 0.25) : x, Z(p.y));
    } else if (p.kind === 'lantern') lantern(X(p.x), Z(p.y));
  }
  // lampiões ao longo do parapeito da ponte, sumindo na névoa
  for (let z = plazaN - 4.5; z > FAR_Z + 6; z -= 6) {
    for (const s of [-1, 1]) lantern(s < 0 ? deckL + 0.25 : deckR - 0.25, z);
  }

  // ---------------- Fumaça ao longe (a outra margem queimando) ----------------
  const smokeSources = [new THREE.Vector3(-9, 0, Z(0) - 6), new THREE.Vector3(8.5, 0, Z(0) - 5), new THREE.Vector3(-1.5, 0, Z(0) - 11)];

  let t = 0;
  let smokeAcc = 0;
  let flameAcc = 0;
  const C_FLAME = new THREE.Color(3.2, 1.4, 0.35);
  const C_FLAME_END = new THREE.Color(0.7, 0.12, 0.02);
  const C_SMOKE = new THREE.Color(0.09, 0.09, 0.11);
  const C_EMBER = new THREE.Color(3, 1.3, 0.3);

  return {
    group: root,
    // as tochas não têm luz pontual: nada a ligar ou desligar (o clarão continua em todos os presets)
    setLights() {},
    update(dt: number, particles: ParticleLayer) {
      t += dt;
      const WU = waterMat.uniforms;
      WU.uTime.value = t;
      // luz do fogo refletida: posição (x, z) + intensidade tremulando de cada chama perto da água
      let nl = 0;
      for (const f of flames) {
        if (nl >= MAX_WATER_LIGHTS) break;
        const k = 0.82 + Math.sin(t * 13 + f.phase) * 0.08 + Math.sin(t * 7.3 + f.phase * 2) * 0.1;
        WU.uLights.value[nl++].set(f.pos.x, f.pos.z, 0.9 + f.size * 3.5, k * Math.min(1, f.size * 3.2));
      }
      WU.uLightN.value = nl;
      // chamas: brilho tremulando + luz com flicker + partículas
      flameAcc += dt;
      const emit = flameAcc > 1 / 30;
      for (const f of flames) {
        const k = 0.82 + Math.sin(t * 13 + f.phase) * 0.08 + Math.sin(t * 7.3 + f.phase * 2) * 0.1;
        f.glow.scale.setScalar(f.size * 3.2 * k);
        if (emit && f.size > 0.15)
          particles.glow.emit({
            pos: f.pos,
            posJitter: f.size * 0.4,
            vel: new THREE.Vector3(0, 1.1, 0),
            velJitter: 0.25,
            life: 0.5,
            size: f.size * 1.3,
            sizeEnd: 0.03,
            color: C_FLAME,
            colorEnd: C_FLAME_END,
            gravity: -0.6,
            count: 2,
          });
        if (emit && f.size > 0.3 && Math.random() < 0.08)
          particles.glow.emit({ pos: f.pos, posJitter: 0.1, vel: new THREE.Vector3(0, 1.6, 0), velJitter: 0.6, life: 1.6, size: 0.05, sizeEnd: 0.01, color: C_EMBER, colorEnd: C_FLAME_END, gravity: -0.3, drag: 0.4 });
      }
      if (emit) flameAcc = 0;
      // fumaça distante
      smokeAcc += dt;
      if (smokeAcc > 0.25) {
        smokeAcc = 0;
        for (const s of smokeSources)
          particles.smoke.emit({ pos: s, posJitter: 0.6, vel: new THREE.Vector3(0.25, 0.9, 0), velJitter: 0.2, life: 6, size: 1.4, sizeEnd: 3.8, color: C_SMOKE, alpha: 0.5, drag: 0.05 });
      }
      // névoa rasteira sobre a água (partículas lentas, sempre encostadas na superfície)
      if (smokeAcc === 0)
        for (const m of mistSpots)
          particles.smoke.emit({ pos: m, posJitter: 2.5, vel: new THREE.Vector3(0.2, 0.05, 0), velJitter: 0.1, life: 7, size: 2.2, sizeEnd: 4.5, color: new THREE.Color(0.55, 0.62, 0.78), alpha: 0.07, count: 1 });
    },
  };
}

const MAX_WATER_LIGHTS = 24;

interface WaterLayout {
  deckL: number;
  deckR: number;
  plazaL: number;
  plazaR: number;
  plazaN: number;
  wallZ: number;
  pierZ0: number;
}

/**
 * Água dos dois lados da ponte (shader próprio, sem textura):
 *  - ondas em camadas → normal por pixel → fresnel entre o fundo escuro e o céu noturno refletido
 *  - estrelas refletidas na direção de reflexão real (tremem com as ondas) e caminho de luar com brilhos
 *  - luz quente dos braseiros/lanternas quebrada nas ondulações
 *  - espuma animada ao pé dos muros da ponte, dos pilares e do cais da praça; sombra embaixo da ponte
 *  - névoa da distância
 */
function waterMaterial(L: WaterLayout): THREE.ShaderMaterial {
  const lights: THREE.Vector4[] = [];
  for (let i = 0; i < MAX_WATER_LIGHTS; i++) lights.push(new THREE.Vector4());
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x061a2e) },
      uMid: { value: new THREE.Color(0x15466a) },
      uSkyLow: { value: new THREE.Color(0x3a5a96) },
      uSkyHigh: { value: new THREE.Color(0x5a6aa8) },
      uMoon: { value: new THREE.Color(0.8, 0.9, 1.2) },
      uMoonDir: { value: new THREE.Vector3(0.3, 0.75, -0.6).normalize() },
      uFog: { value: new THREE.Color(0x0a1020) },
      uFire: { value: new THREE.Color(1.0, 0.45, 0.12) },
      uLights: { value: lights },
      uLightN: { value: 0 },
      uEdges: { value: new THREE.Vector4(L.deckL, L.deckR, L.plazaL, L.plazaR) },
      uQuay: { value: new THREE.Vector3(L.plazaN, L.wallZ, L.pierZ0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vW;
      varying float vDist;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      #define MAXL ${MAX_WATER_LIGHTS}
      uniform float uTime;
      uniform vec3 uDeep, uMid, uSkyLow, uSkyHigh, uMoon, uMoonDir, uFog, uFire;
      uniform vec4 uLights[MAXL];
      uniform int uLightN;
      uniform vec4 uEdges;  // bordas da ponte (x) e da praça (x)
      uniform vec3 uQuay;   // z do cais norte da praça, z da muralha, z do 1º pilar
      varying vec3 vW;
      varying float vDist;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      // altura das ondas: 3 trens direcionais + ruído fino
      float waves(vec2 p) {
        float t = uTime;
        float h = sin(dot(p, vec2(0.9, 0.35)) * 1.6 + t * 1.1) * 0.35;
        h += sin(dot(p, vec2(-0.4, 0.95)) * 2.3 - t * 1.4) * 0.22;
        h += sin(dot(p, vec2(0.7, -0.6)) * 3.7 + t * 1.9) * 0.12;
        h += (noise(p * 2.4 + vec2(t * 0.35, -t * 0.2)) - 0.5) * 0.35;
        h += (noise(p * 6.0 - vec2(t * 0.6, t * 0.4)) - 0.5) * 0.12;
        return h;
      }
      // distância até a borda de pedra mais próxima (muros da ponte + cais da praça)
      float edgeDist(vec2 p) {
        float d = 1e3;
        // laterais da ponte (antes da praça)
        if (p.y < uQuay.x) d = min(d, min(abs(p.x - uEdges.x), abs(p.x - uEdges.y)));
        // laterais da praça
        if (p.y >= uQuay.x && p.y < uQuay.y + 2.0) d = min(d, min(abs(p.x - uEdges.z), abs(p.x - uEdges.w)));
        // cais norte da praça (dos dois lados da ponte)
        if ((p.x < uEdges.x && p.x > uEdges.z) || (p.x > uEdges.y && p.x < uEdges.w)) d = min(d, abs(p.y - uQuay.x));
        return d;
      }
      float pierDist(vec2 p) {
        // quebra-mares a cada 5 m nas duas laterais
        float zz = mod(p.y - uQuay.z + 2.5, 5.0) - 2.5;
        if (p.y > uQuay.x) return 1e3;
        float side = p.x < 0.0 ? uEdges.x - 0.25 : uEdges.y + 0.25;
        return length(vec2(p.x - side, zz * 1.4));
      }
      void main() {
        vec2 p = vW.xz;
        // normal por diferenças finitas
        float e = 0.08;
        float h0 = waves(p);
        vec3 n = normalize(vec3((h0 - waves(p + vec2(e, 0.0))) / e * 0.22, 1.0, (h0 - waves(p + vec2(0.0, e))) / e * 0.22));
        vec3 V = normalize(cameraPosition - vW);
        vec3 R = reflect(-V, n);
        float fres = 0.14 + 0.86 * pow(1.0 - max(dot(n, V), 0.0), 4.0);
        // céu noturno refletido (gradiente + estrelas na direção de reflexão)
        vec3 sky = mix(uSkyLow, uSkyHigh, smoothstep(0.0, 0.8, R.y));
        vec2 sp = R.xz / max(0.15, R.y) * 18.0;
        vec2 cell = floor(sp);
        float hs = hash(cell);
        float star = step(0.965, hs) * smoothstep(0.35, 0.0, length(fract(sp) - 0.5 - (hash(cell + 7.1) - 0.5) * 0.5));
        sky += vec3(0.9, 0.95, 1.2) * star * (0.6 + 0.4 * sin(uTime * 3.0 + hs * 50.0)) * 1.4;
        // lua: brilho especular alongado (caminho de luar) + reflexo suave
        float md = max(dot(R, uMoonDir), 0.0);
        float spec = pow(md, 900.0) * smoothstep(0.55, 0.9, noise(p * 4.0 + uTime * 0.7)); // brilhos soltos
        float glow = pow(md, 40.0);
        vec3 col = mix(mix(uDeep, uMid, 0.3 + h0 * 0.45), sky, fres);
        // brilho quente vindo da cidade em chamas (lado oposto à lua): equilibra os dois lados
        vec3 warmDir = normalize(vec3(-0.55, 0.7, 0.2));
        float wd = max(dot(R, warmDir), 0.0);
        col += uFire * (pow(wd, 30.0) * 0.3 + pow(wd, 260.0) * smoothstep(0.4, 0.85, noise(p * 4.5 - uTime * 0.6)) * 1.1);
        // crista das ondas levemente clara (lê o movimento da água dos dois lados)
        col += uSkyHigh * smoothstep(0.35, 0.75, h0) * 0.22;
        // correnteza: estrias claras descendo o rio (a água "anda")
        float flow = noise(vec2(p.x * 0.7, p.y * 0.18 - uTime * 0.5));
        col += vec3(0.25, 0.4, 0.55) * smoothstep(0.62, 0.9, flow) * 0.18;
        col += uMoon * (spec * 1.6 + glow * 0.05);
        // sombra embaixo/junto da ponte e dos cais
        float ed = edgeDist(p);
        col *= mix(0.45, 1.0, smoothstep(0.0, 2.2, ed));
        // fogo refletido: brilho quente quebrado pelas ondulações
        vec3 fire = vec3(0.0);
        for (int i = 0; i < MAXL; i++) {
          if (i >= uLightN) break;
          vec4 Lt = uLights[i];
          vec2 d = p - Lt.xy;
          float fall = exp(-dot(d, d) / (Lt.z * Lt.z));
          float shimmer = smoothstep(0.1, 0.9, noise(vec2(p.x * 5.0, p.y * 11.0 - uTime * 2.2) + h0 * 3.0));
          fire += uFire * fall * (0.08 + shimmer * shimmer * 1.1) * Lt.w;
        }
        col += fire * 0.32;
        // espuma: faixa animada no pé das pedras e esteira dos pilares
        float fn = noise(p * vec2(3.5, 1.6) + vec2(uTime * 0.4, -uTime * 0.9));
        float foamEdge = smoothstep(0.95, 0.0, ed - fn * 0.5) * smoothstep(0.3, 0.7, fn + 0.25);
        float pd = pierDist(p);
        float foamPier = smoothstep(1.1, 0.0, pd - fn * 0.4) * smoothstep(0.4, 0.8, noise(p * 5.0 + uTime * 0.8) + 0.2);
        vec3 foamCol = vec3(0.55, 0.62, 0.72) + fire * 0.4;
        col = mix(col, foamCol, clamp(foamEdge * 0.75 + foamPier * 0.55, 0.0, 0.85));
        // névoa da distância
        float fog = smoothstep(55.0, 95.0, vDist); // só bem longe (antes escurecia o rio inteiro)
        gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

interface BankLayout {
  W: number;
  H: number;
  X: (x: number) => number;
  Z: (y: number) => number;
  FAR_Z: number;
  plazaN: number;
  wallZ: number;
  deckL: number;
  deckR: number;
  r: () => number;
}

/** Pedras da Kenney são claras (lilás/branco): escurecidas para o tom da pedra da ponte. */
const ROCK_TINT = 0x8a8070;

/** Fogueiras do acampamento e lanternas do mercado (o update anima as chamas). */
export const BANK_FIRES: THREE.Vector3[] = [];
export const BANK_LANTERNS: THREE.Vector3[] = [];

/**
 * Margens do rio dos dois lados: barranco de terra e pedra até a água, pedras na beira
 * (algumas dentro d'água), mata de pinheiros e, ao lado da praça, o acampamento dos
 * refugiados de Valdrec (barracas, fogueiras, caixotes, carroça). Peças GLB da Kenney.
 */
function buildBanks(root: THREE.Group, L: BankLayout): void {
  const { W, X, Z, FAR_Z, wallZ, r } = L;
  void L.deckL;
  BANK_FIRES.length = 0;
  BANK_LANTERNS.length = 0;
  const z0 = FAR_Z - 24;
  const z1 = wallZ + 10;
  const len = z1 - z0;
  const grass = loadTexture('textures/floresta/grama_a.webp');
  grass.repeat.set(10, len / 4);
  const top = new THREE.MeshLambertMaterial({ map: grass, color: 0x6a7a62 });
  const sideTex = wallBlockTexture(57);
  sideTex.repeat.set(len / 3, 1);
  const side = new THREE.MeshLambertMaterial({ map: sideTex, color: 0x7a6e60 });
  const depth = -WATER_Y + 0.6;
  for (const s of [-1, 1]) {
    const edge = s * (W / 2 + 1.5); // um tile de água além da borda do mapa
    const width = 40;
    // barranco em planos (sem caixa lisa): o topo de grama e a face de pedra voltada para o rio
    const relva = new THREE.Mesh(new THREE.PlaneGeometry(width, len).rotateX(-Math.PI / 2), top);
    relva.position.set(edge + (s * width) / 2, -0.15, (z0 + z1) / 2);
    relva.receiveShadow = true;
    root.add(relva);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(len, depth).rotateY(s < 0 ? Math.PI / 2 : -Math.PI / 2), side);
    face.position.set(edge, -0.15 - depth / 2, (z0 + z1) / 2);
    face.receiveShadow = true;
    root.add(face);

    // pedras na beira: algumas meio afundadas na água, outras no alto do barranco
    for (let z = z0 + 2; z < z1 - 1; z += 1.3 + r() * 1.4) {
      const inWater = r() < 0.5;
      const kind = ['town/rock-small', 'town/rock-wide', 'survival/rock-b', 'survival/rock-c', 'castle/rocks-large'][Math.floor(r() * 5)];
      placeProp(root, kind, edge - s * (inWater ? 0.4 + r() * 0.6 : -0.6 - r() * 0.8), z, {
        y: inWater ? WATER_Y - 0.25 : -0.15,
        rot: r() * 6.28,
        scale: kind.startsWith('survival') ? 1.6 + r() * 1.2 : 0.7 + r() * 0.6,
        tint: ROCK_TINT,
      });
    }
    // vitórias-régias na água mansa perto da margem
    for (let i = 0; i < 10; i++) placeProp(root, 'nature/lily_large', edge - s * (0.8 + r() * 4), z0 + 8 + r() * (len - 20), { y: WATER_Y + 0.06, rot: r() * 6.28, scale: 3 + r() * 2 });

    // mata: pinheiros e árvores, mais densa longe da beira
    const campZ0 = L.plazaN - 1;
    const campZ1 = wallZ + 2;
    for (let i = 0; i < 70; i++) {
      const x = edge + s * (2.2 + r() * r() * 22);
      const z = z0 + r() * len;
      const inCamp = z > campZ0 && z < campZ1 && Math.abs(x - edge) < 11;
      if (inCamp) continue;
      const kind = ['town/tree', 'town/tree-high', 'town/tree-high-round', 'castle/tree-large', 'survival/tree-tall', 'town/tree-crooked'][Math.floor(r() * 6)];
      const sc = kind.startsWith('town') ? 1.3 + r() * 0.7 : kind.startsWith('castle') ? 2.2 + r() * 0.8 : 2.4 + r() * 1;
      placeProp(root, kind, x, z, { y: -0.15, rot: r() * 6.28, scale: sc });
    }
    for (let i = 0; i < 16; i++) {
      const kind = ['nature/stump_old', 'survival/tree-log', 'nature/log_stack'][Math.floor(r() * 3)];
      placeProp(root, kind, edge + s * (1.5 + r() * 14), z0 + r() * len, { y: -0.15, rot: r() * 6.28, scale: kind.startsWith('nature') ? 3 : 2.2 });
    }

    // acampamento dos refugiados ao lado da praça
    const cx = edge + s * 5.5;
    const cz = (campZ0 + campZ1) / 2;
    const tents: [string, number, number, number][] = [
      ['nature/tent_detailedOpen', -2.5, -3, 3.2],
      ['survival/tent-canvas', 2.2, -2.2, 3.2],
      ['nature/tent_smallClosed', -3, 2.5, 3],
      ['nature/tent_detailedOpen', 2.6, 3.2, 3],
    ];
    for (const [k, dx, dz, sc] of tents) placeProp(root, k, cx + s * dx, cz + dz, { y: -0.15, rot: Math.atan2(-dx * s, -dz) + (r() - 0.5) * 0.4, scale: sc });
    const fire = new THREE.Vector3(cx, -0.1, cz);
    placeProp(root, 'survival/campfire-pit', fire.x, fire.z, { y: -0.15, scale: 2.6 });
    BANK_FIRES.push(fire.clone().setY(0.15));
    for (const [k, dx, dz, sc, rot] of [
      ['survival/bedroll', -1.2, 0.6, 2.4, 0.4],
      ['survival/bedroll', 1.1, -0.9, 2.4, -0.9],
      ['survival/box-large', 4.2, 0.2, 2.2, 0.3],
      ['survival/box', 4.6, 1.1, 2.2, 1],
      ['survival/barrel', 4.0, -0.9, 2.2, 0],
      ['survival/barrel-open', -4.4, -0.6, 2.2, 0],
      ['survival/bucket', 0.9, 1.4, 2.4, 0],
      ['town/cart', -4.8, 4.8, 1.3, 1.1],
      ['survival/signpost', s * 1 > 0 ? -5.2 : -5.2, -5.4, 2.4, 0.3],
    ] as [string, number, number, number, number][])
      placeProp(root, k, cx + s * dx, cz + dz, { y: -0.15, rot, scale: sc });
  }

  // ---- dentro dos muros (ao sul da muralha): o largo do mercado de Valdrec ----
  const cityDepth = 26;
  const plaza = loadTexture('textures/pedras/pedra_cinza.webp');
  plaza.repeat.set((W + 60) / 4, cityDepth / 4);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(W + 60, cityDepth).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: plaza, color: 0xc8ccd6 }));
  city.position.set(0, 0.005, wallZ + 1 + cityDepth / 2);
  city.receiveShadow = true;
  root.add(city);

  // ---- peças naturais nas margens (naturKit.ts): ruínas, rochas, arbustos e um marco de estrada.
  // Ficam fora da grade (não bloqueiam nem mudam a horda); só dão a moldura da cena.
  const bankPiece = (key: string, x: number, z: number, s: number, rot: number) => instanceKit(root, key, [kitMatrix(x, z, s, rot)]);
  bankPiece(KIT.ruina[0], X(-2.6), Z(30), 1.1, 0.4);
  bankPiece(KIT.ruina[1], X(W + 1.6), Z(33), 1.1, -0.5);
  bankPiece(KIT.marco[0], X(-1.8), Z(27), 1, 0);
  bankPiece(KIT.pedra[0], X(-3.8), Z(37), 1.3, 1.1);
  bankPiece(KIT.pedra[1], X(W + 3.2), Z(36), 1.2, 2);
  bankPiece(KIT.arbusto[0], X(-4.6), Z(33), 1.6, 0.2);
  bankPiece(KIT.arbusto[1], X(W + 4.2), Z(31), 1.6, 1);
  const cz = wallZ + 3.2;
  for (let x = -W / 2 + 3; x < W / 2 - 2; x += 3.4 + r() * 1.5) {
    if (Math.abs(x) < 5) continue; // rua livre atrás do portão
    const k = ['town/stall-red', 'town/stall-green', 'town/stall', 'town/stall-red'][Math.floor(r() * 4)];
    placeProp(root, k, x, cz + r() * 0.8, { rot: Math.PI, scale: 1.6 });
    if (r() < 0.6) placeProp(root, 'survival/barrel', x + 1.1, cz + 0.2, { scale: 2.2 });
    if (r() < 0.4) placeProp(root, 'survival/box-large', x - 1.1, cz + 0.5, { rot: r(), scale: 2 });
  }
  for (let x = -W / 2 + 1; x < W / 2; x += 6) {
    placeProp(root, 'town/lantern', x + 1.5, wallZ + 1.6, { scale: 1.2 });
    BANK_LANTERNS.push(new THREE.Vector3(x + 1.5, 1.72, wallZ + 1.6));
  }
  for (let i = 0; i < 24; i++) {
    const x = (r() - 0.5) * (W + 40);
    if (Math.abs(x) < 4) continue;
    placeProp(root, ['town/tree', 'town/tree-high-round', 'castle/tree-large'][Math.floor(r() * 3)], x, wallZ + 6 + r() * 14, { scale: 1.5 + r() * 0.6 });
  }
}

/**
 * Ruínas e pedras do kit natural (naturKit.ts) dentro do rio, nos tiles de água (vazios): não andam nem bloqueiam
 * nada da grade; dão a silhueta de ponte antiga com pilares quebrados. A escolha é determinística (sem sorteio).
 */
function riverDressing(root: THREE.Group, zone: ParsedZone, X: (x: number) => number, Z: (y: number) => number): void {
  const keys = [KIT.ruina[0], KIT.pedra[2], KIT.ruina[1], KIT.pedra[3], KIT.ruina[0], KIT.pedra[1], KIT.ruina[1], KIT.pedra[0]];
  const pieces: Record<string, THREE.Matrix4[]> = {};
  for (const v of zone.voids) {
    // uma peça a cada ~11 tiles de água, espalhadas pela fórmula
    if ((v.x * 7 + v.y * 13) % 11 !== 0) continue;
    const key = keys[(v.x * 3 + v.y) % keys.length];
    const s = 1.1 + ((v.x * 17 + v.y * 5) % 7) * 0.09;
    const rot = ((v.x * 31 + v.y * 11) % 12) * (Math.PI / 6);
    (pieces[key] ??= []).push(kitMatrix(X(v.x), Z(v.y), s, rot, s, WATER_Y - 0.35));
  }
  for (const [key, mats] of Object.entries(pieces)) instanceKit(root, key, mats);
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
