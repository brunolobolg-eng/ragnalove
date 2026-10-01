import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParsedZone } from '../../config/zones';
import type { ParticleLayer } from '../fx/Particles';
import { softCircle } from '../textures';
import { bridgeDeckTexture, bridgeSideTexture, plazaTexture, roofTexture, wallBlockTexture, woodTexture } from './bridgeTextures';

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
  const shadow = <T extends THREE.Mesh>(m: T, cast = true): T => {
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };

  // ---------------- Tabuleiro da ponte e praça ----------------
  const deckTex = bridgeDeckTexture();
  const deckLen = plazaN - FAR_Z;
  deckTex.repeat.set((deckR - deckL) / 4, deckLen / 4);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(deckR - deckL, 0.6, deckLen), [
    lambert({ color: 0x5a5e66 }),
    lambert({ color: 0x5a5e66 }),
    lambert({ map: deckTex }),
    lambert({ color: 0x33363c }),
    lambert({ color: 0x5a5e66 }),
    lambert({ color: 0x5a5e66 }),
  ]);
  deck.position.set((deckL + deckR) / 2, -0.3, (FAR_Z + plazaN) / 2);
  root.add(shadow(deck, false));

  const plazaTex = plazaTexture();
  const plazaDepth = wallZ + 1.5 - plazaN;
  plazaTex.repeat.set((plazaR - plazaL) / 4, plazaDepth / 4);
  const plazaMesh = new THREE.Mesh(new THREE.BoxGeometry(plazaR - plazaL, 0.6, plazaDepth), [
    lambert({ color: 0x5c554c }),
    lambert({ color: 0x5c554c }),
    lambert({ map: plazaTex }),
    lambert({ color: 0x33302b }),
    lambert({ color: 0x5c554c }),
    lambert({ color: 0x5c554c }),
  ]);
  plazaMesh.position.set((plazaL + plazaR) / 2, -0.3, plazaN + plazaDepth / 2);
  root.add(shadow(plazaMesh, false));

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
    // pilares quebra-mar a cada 5 m
    for (let z = plazaN - 2.5; z > FAR_Z; z -= 5) {
      const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.9, 1, 3, 1).rotateY(s < 0 ? Math.PI / 2 : -Math.PI / 2), lambert({ map: wallBlockTexture(3), flatShading: true }));
      pier.scale.set(1, -WATER_Y - 0.6, 1);
      pier.position.set((s < 0 ? deckL : deckR) + s * 0.25, (WATER_Y - 0.6) / 2, z);
      root.add(pier);
    }
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
  const stoneTex = wallBlockTexture(9);
  stoneTex.repeat.set(0.5, 0.3);
  const parapetMat = lambert({ map: stoneTex });
  const capMat = lambert({ color: 0x7c7e84 });
  const parGeos: THREE.BufferGeometry[] = [];
  const capGeos: THREE.BufferGeometry[] = [];
  const rubbleSpots: THREE.Vector3[] = [];
  const r = mulberry(7);
  /** Segmento de parapeito de (x0,z0) a (x1,z1); `broken` = sem topo e mais baixo. */
  const segment = (a: THREE.Vector2, b: THREE.Vector2, broken = false) => {
    const len = a.distanceTo(b);
    const h = broken ? 0.18 + r() * 0.12 : 0.55;
    const g = new THREE.BoxGeometry(len, h, 0.42);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.rotateY(-ang);
    g.translate((a.x + b.x) / 2, h / 2, (a.y + b.y) / 2);
    parGeos.push(g);
    if (!broken) {
      const cap = new THREE.BoxGeometry(len + 0.02, 0.08, 0.52);
      cap.rotateY(-ang);
      cap.translate((a.x + b.x) / 2, h + 0.04, (a.y + b.y) / 2);
      capGeos.push(cap);
    } else rubbleSpots.push(new THREE.Vector3((a.x + b.x) / 2, 0, (a.y + b.y) / 2));
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
    // pilaretes a cada 3 m
    for (let z = FAR_Z + 1.5; z < plazaN; z += 3) {
      const post = new THREE.BoxGeometry(0.56, 0.78, 0.56);
      post.translate(x, 0.39, z);
      parGeos.push(post);
      const cap = new THREE.BoxGeometry(0.64, 0.1, 0.64);
      cap.translate(x, 0.83, z);
      capGeos.push(cap);
    }
  }
  root.add(shadow(new THREE.Mesh(mergeGeometries(parGeos)!, parapetMat)));
  root.add(shadow(new THREE.Mesh(mergeGeometries(capGeos)!, capMat)));
  if (dockRows.length) {
    // escadaria do cais: por aqui sobem os mortos que vêm pelo rio
    const d0 = Z(Math.min(...dockRows)) - 0.5;
    const d1 = Z(Math.max(...dockRows)) + 0.5;
    const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) steps.push(new THREE.BoxGeometry(0.7, 0.4, d1 - d0).translate(X(0) - 0.15 - i * 0.55, -0.2 - i * 0.4, (d0 + d1) / 2));
    const stairs = new THREE.Mesh(mergeGeometries(steps)!, lambert({ map: wallBlockTexture(12) }));
    stairs.receiveShadow = true;
    root.add(stairs);
    const dockTex = plazaTexture();
    dockTex.repeat.set(0.3, (d1 - d0) / 4);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, d1 - d0), lambert({ map: dockTex }));
    dock.position.set(X(0), -0.3, (d0 + d1) / 2);
    dock.receiveShadow = true;
    root.add(dock);
  }

  // ---------------- Escombros, carroça, barris (tiles bloqueados do mapa) ----------------
  const rockMat = lambert({ color: 0x6a6c72, flatShading: true });
  const rockGeos: THREE.BufferGeometry[] = [];
  const addRocks = (c: THREE.Vector3, n: number, spread: number, size: number) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.DodecahedronGeometry(size * (0.5 + r() * 0.7), 0);
      g.scale(1, 0.6 + r() * 0.4, 1);
      g.rotateY(r() * 6);
      g.translate(c.x + (r() - 0.5) * spread, size * 0.3, c.z + (r() - 0.5) * spread);
      rockGeos.push(g);
    }
  };
  for (const s of rubbleSpots) addRocks(s, 4, 0.7, 0.16);

  const wood = lambert({ map: woodTexture() });
  const iron = lambert({ color: 0x2f3036 });
  const props = new THREE.Group();
  const cartTiles = zone.props.filter((p) => p.kind === 'cart');
  if (cartTiles.length) {
    // carroça virada de lado, ocupando os tiles 'c'
    const cx = cartTiles.reduce((s, p) => s + X(p.x), 0) / cartTiles.length;
    const cz = cartTiles.reduce((s, p) => s + Z(p.y), 0) / cartTiles.length;
    const cart = new THREE.Group();
    cart.position.set(cx, 0, cz);
    cart.rotation.y = 0.18;
    const bed = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.7), wood));
    bed.position.set(0.3, 0.35, 0);
    const sideA = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.7), wood));
    sideA.position.set(0.02, 0.04, 0);
    const sideB = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 1.7), wood));
    sideB.position.set(0.02, 0.66, 0);
    const back = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.08), wood));
    back.position.set(0.02, 0.35, 0.82);
    cart.add(bed, sideA, sideB, back);
    // roda presa (vertical, deitada no plano do carro) e roda solta no chão
    const wheel = (): THREE.Group => {
      const g = new THREE.Group();
      g.add(shadow(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 6, 16), wood)));
      for (let i = 0; i < 4; i++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.64, 0.04), wood);
        sp.rotation.z = (i * Math.PI) / 4;
        g.add(sp);
      }
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 8).rotateX(Math.PI / 2), iron));
      return g;
    };
    const w1 = wheel();
    w1.position.set(0.42, 0.35, -0.5);
    w1.rotation.y = Math.PI / 2;
    const w2 = wheel();
    w2.position.set(-0.6, 0.06, 0.7);
    w2.rotation.x = -Math.PI / 2 + 0.1;
    cart.add(w1, w2);
    // carga espalhada: sacos e caixotes
    const sackMat = lambert({ color: 0xa08a64 });
    for (const [x, z, s] of [
      [-0.35, -0.4, 0.2],
      [-0.5, 0.1, 0.17],
      [-0.2, 0.45, 0.15],
    ]) {
      const sack = shadow(new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), sackMat));
      sack.scale.set(1.2, 0.7, 0.9);
      sack.position.set(x, s * 0.6, z);
      cart.add(sack);
    }
    const crate = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), wood));
    crate.position.set(-0.45, 0.17, -0.85);
    crate.rotation.y = 0.5;
    cart.add(crate);
    props.add(cart);
  }
  for (const p of zone.props.filter((q) => q.kind === 'rubble')) addRocks(new THREE.Vector3(X(p.x), 0, Z(p.y)), 9, 0.8, 0.22);
  for (const p of zone.props.filter((q) => q.kind === 'barrels')) {
    const g = new THREE.Group();
    g.position.set(X(p.x), 0, Z(p.y));
    const barrel = (x: number, z: number, lying = false) => {
      const b = new THREE.Group();
      const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.52, 12), wood));
      const bulge = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.3, 12), wood));
      const hoop1 = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.018, 4, 14).rotateX(Math.PI / 2), iron);
      hoop1.position.y = 0.17;
      const hoop2 = hoop1.clone();
      hoop2.position.y = -0.17;
      b.add(body, bulge, hoop1, hoop2);
      if (lying) {
        b.rotation.z = Math.PI / 2;
        b.position.set(x, 0.23, z);
      } else b.position.set(x, 0.26, z);
      g.add(b);
    };
    barrel(-0.18, -0.15);
    barrel(0.2, 0.05);
    barrel(-0.05, 0.32, true);
    props.add(g);
  }
  if (rockGeos.length) root.add(shadow(new THREE.Mesh(mergeGeometries(rockGeos)!, rockMat)));
  root.add(props);

  // ---------------- Muralha, torres e casa do portão (última fileira; portão aberto nos tiles 'g') ----------------
  const wallTex = wallBlockTexture(33);
  wallTex.repeat.set(4, 1);
  const wallMat = lambert({ map: wallTex });
  const topMat = lambert({ color: 0x55575d });
  const merlons: THREE.BufferGeometry[] = [];
  const wallGeos: THREE.BufferGeometry[] = [];
  for (const [xa, xb] of [
    [plazaL - 2, gateL - 0.6],
    [gateR + 0.6, plazaR + 2],
  ]) {
    wallGeos.push(new THREE.BoxGeometry(xb - xa, 1.3, 1.2).translate((xa + xb) / 2, 0.65, wallZ + 0.3));
    for (let x = xa + 0.3; x < xb - 0.1; x += 0.7) merlons.push(new THREE.BoxGeometry(0.4, 0.35, 0.28).translate(x, 1.47, wallZ - 0.18));
  }
  const cityWall = shadow(new THREE.Mesh(mergeGeometries(wallGeos)!, wallMat));
  root.add(cityWall);
  root.add(shadow(new THREE.Mesh(mergeGeometries(merlons)!, wallMat)));
  void topMat;
  // casa do portão: arco sobre o vão, com telhado e portas abertas para dentro
  const gate = new THREE.Group();
  gate.position.set(gateC, 0, wallZ + 0.3);
  const span = gateR - gateL;
  for (const s2 of [-1, 1]) {
    // pilares baixos (a câmera olha por cima: nada alto na frente da defesa)
    const pier = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 1.6), wallMat));
    pier.position.set(s2 * (span / 2 + 0.6), 0.85, 0);
    const cap = shadow(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 1.8), lambert({ color: 0x55575d })));
    cap.position.set(s2 * (span / 2 + 0.6), 1.78, 0);
    gate.add(cap);
    gate.add(pier);
  }
  // (sem arco/telhado sobre o vão: ficaria entre a câmera e a defesa do portão)
  // estandartes nas duas pontas
  const banners: THREE.Mesh[] = [];
  const bannerMat = lambert({ color: 0x2e4a8a, side: THREE.DoubleSide });
  for (const s2 of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), iron);
    pole.position.set(s2 * (span / 2 + 0.6), 2.5, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42, 6, 1).translate(0.35, 0, 0), bannerMat);
    flag.position.set(s2 * (span / 2 + 0.6), 2.95, 0);
    gate.add(pole, flag);
    banners.push(flag);
  }
  root.add(gate);
  // torres redondas nas pontas da praça
  for (const tx of [plazaL - 0.4, plazaR + 0.4]) {
    const t = new THREE.Group();
    t.position.set(tx, 0, wallZ + 0.4);
    const tex = wallBlockTexture(44);
    tex.repeat.set(3, 1.2);
    const body = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 1.9, 16), lambert({ map: tex })));
    body.position.y = 0.95;
    const cone = shadow(new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.0, 16), lambert({ map: roofTexture() })));
    cone.position.y = 2.4;
    t.add(body, cone);
    root.add(t);
  }

  // ---------------- Água escura com reflexo da lua e das estrelas ----------------
  const waterMat = waterMaterial({ deckL, deckR, plazaL, plazaR, plazaN, wallZ, pierZ0: plazaN - 2.5 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(W + 110, H + 90, 1, 1).rotateX(-Math.PI / 2), waterMat);
  water.position.set(0, WATER_Y, -12);
  root.add(water);
  // névoa rasteira sobre a água
  const mistTex = softCircle();
  const mists: { m: THREE.Mesh; speed: number; x0: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: mistTex, color: 0x8ea0c8, transparent: true, opacity: 0.12 + r() * 0.1, depthWrite: false }),
    );
    const side = i % 2 ? 1 : -1;
    m.scale.set(4 + r() * 5, 1, 2.5 + r() * 3);
    const x0 = side * (deckR + 2 + r() * 6);
    m.position.set(x0, WATER_Y + 0.4 + r() * 0.8, FAR_Z * 0.6 + r() * (H + 10));
    m.renderOrder = 1;
    root.add(m);
    mists.push({ m, speed: 0.15 + r() * 0.25, x0 });
  }

  // ---------------- Fogo: braseiros, lanternas e tochas ----------------
  const lights: THREE.PointLight[] = [];
  const flames: { pos: THREE.Vector3; size: number; light?: THREE.PointLight; glow: THREE.Sprite; phase: number }[] = [];
  const glowMat = new THREE.SpriteMaterial({ map: softCircle(), color: new THREE.Color(2.4, 1.1, 0.35), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const addFlame = (pos: THREE.Vector3, size: number, withLight: boolean) => {
    const glow = new THREE.Sprite(glowMat);
    glow.position.copy(pos);
    glow.scale.setScalar(size * 3.2);
    glow.renderOrder = 5;
    root.add(glow);
    let light: THREE.PointLight | undefined;
    if (withLight) {
      light = new THREE.PointLight(0xff8a3a, 3.2, 7.5, 1.4);
      light.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0));
      root.add(light);
      lights.push(light);
    }
    flames.push({ pos, size, light, glow, phase: r() * 10 });
  };
  const brazier = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ped = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.75, 8), parapetMat));
    ped.position.y = 0.375;
    const bowl = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.2, 0.26, 10, 1, true), iron));
    bowl.position.y = 0.88;
    const coals = new THREE.Mesh(new THREE.CircleGeometry(0.3, 10).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.7, 0.15) }));
    coals.position.y = 0.95;
    g.add(ped, bowl, coals);
    root.add(g);
    addFlame(new THREE.Vector3(x, 1.05, z), 0.36, true);
  };
  const lantern = (x: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 6), iron));
    post.position.y = 0.95;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), iron);
    arm.position.set(0, 1.85, -0.18);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.6) }));
    box.position.set(0, 1.66, -0.36);
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 4).rotateY(Math.PI / 4), iron);
    lid.position.set(0, 1.86, -0.36);
    g.add(post, arm, box, lid);
    root.add(g);
    addFlame(new THREE.Vector3(x, 1.66, z - 0.36), 0.16, false);
  };
  for (const p of zone.props) {
    if (p.kind === 'brazier') {
      // sobre o parapeito da ponte fica colado ao lado de dentro da mureta
      const x = X(p.x);
      const onBridge = p.x === bx0 || p.x === bx1;
      brazier(onBridge ? (p.x === bx0 ? deckL + 0.25 : deckR - 0.25) : x, Z(p.y));
    } else if (p.kind === 'lantern') lantern(X(p.x), Z(p.y));
  }
  // lanternas nos pilaretes da ponte, sumindo na névoa
  for (let z = plazaN - 4.5; z > FAR_Z + 6; z -= 6) {
    for (const s of [-1, 1]) {
      const x = s < 0 ? deckL + 0.25 : deckR - 0.25;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.3, 0.5) }));
      lamp.position.set(x, 1.0, z);
      root.add(lamp);
      addFlame(new THREE.Vector3(x, 1.0, z), 0.12, false);
    }
  }
  // tochas no alto da muralha e nos pilares do portão
  const sp = span / 2 + 0.6;
  for (const x of [gateC - sp - 3.5, gateC - sp, gateC + sp, gateC + sp + 3.5]) {
    const near = Math.abs(x - gateC) < sp + 0.1;
    const y = near ? 2.05 : 1.55;
    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5), wood);
    torch.position.set(x, y - 0.3, wallZ - 0.55);
    torch.rotation.x = -0.35;
    root.add(torch);
    addFlame(new THREE.Vector3(x, y, wallZ - 0.65), 0.2, near);
  }

  // ---------------- Corvos ----------------
  const crowMat = new THREE.MeshLambertMaterial({ color: 0x14141a, side: THREE.DoubleSide });
  const crows: { g: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; rad: number; h: number; spd: number; ph: number; perched: boolean; c: THREE.Vector3 }[] = [];
  const makeCrow = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), crowMat);
    body.scale.set(0.8, 0.7, 1.6);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), crowMat);
    head.position.set(0, 0.04, 0.16);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3a3a }));
    beak.position.set(0, 0.03, 0.24);
    const wingGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.08), new THREE.Vector3(0, 0, -0.08), new THREE.Vector3(0.34, 0, -0.06)]);
    wingGeo.computeVertexNormals();
    const wl = new THREE.Mesh(wingGeo, crowMat);
    const wr = new THREE.Mesh(wingGeo, crowMat);
    wr.scale.x = -1;
    g.add(body, head, beak, wl, wr);
    root.add(g);
    return { g, wl, wr };
  };
  for (let i = 0; i < 6; i++) {
    const c = makeCrow();
    crows.push({ ...c, rad: 4 + r() * 5, h: 4.5 + r() * 2.5, spd: (0.25 + r() * 0.2) * (i % 2 ? 1 : -1), ph: r() * 6.28, perched: false, c: new THREE.Vector3((r() - 0.5) * 8, 0, Z(0) + 4 + r() * H * 0.6) });
  }
  // pousados no parapeito e na carroça
  for (const [x, z] of [
    [deckR - 0.25, Z(4)],
    [deckL + 0.25, -12],
    [cartTiles.length ? X(cartTiles[0].x) + 0.3 : 2, cartTiles.length ? Z(cartTiles[0].y) + 0.2 : -4],
  ] as const) {
    const c = makeCrow();
    const y = z === Z(4) || z === -12 ? 0.68 : 0.78;
    c.g.position.set(x, y, z);
    c.g.rotation.y = r() * 6.28;
    crows.push({ ...c, rad: 0, h: y, spd: 0, ph: r() * 6.28, perched: true, c: new THREE.Vector3(x, y, z) });
  }

  // ---------------- Fumaça ao longe (a outra margem queimando) ----------------
  const smokeSources = [new THREE.Vector3(-9, 0, Z(0) - 6), new THREE.Vector3(8.5, 0, Z(0) - 5), new THREE.Vector3(-1.5, 0, Z(0) - 11)];

  let t = 0;
  let smokeAcc = 0;
  let flameAcc = 0;
  const lightsOn = { v: true };
  const C_FLAME = new THREE.Color(3.2, 1.4, 0.35);
  const C_FLAME_END = new THREE.Color(0.7, 0.12, 0.02);
  const C_SMOKE = new THREE.Color(0.09, 0.09, 0.11);
  const C_EMBER = new THREE.Color(3, 1.3, 0.3);

  return {
    group: root,
    setLights(on: boolean) {
      lightsOn.v = on;
      for (const l of lights) l.visible = on;
    },
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
        if (f.light) f.light.intensity = 3.2 * k;
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
      // névoa derivando
      for (const m of mists) {
        m.m.position.x = m.x0 + Math.sin(t * m.speed) * 1.5;
      }
      // estandartes ondulando
      for (const b of banners) {
        const pos = b.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          pos.setZ(i, Math.sin(t * 4 + x * 7) * 0.08 * x);
        }
        pos.needsUpdate = true;
      }
      // corvos: voam em círculos; os pousados às vezes batem asas
      for (const c of crows) {
        if (c.perched) {
          const flap = Math.max(0, Math.sin(t * 0.7 + c.ph * 3)) > 0.97 ? Math.sin(t * 30) * 0.8 : 0;
          c.wl.rotation.z = 0.15 + flap;
          c.wr.rotation.z = -0.15 - flap;
          c.g.rotation.y += Math.sin(t * 0.5 + c.ph) * 0.002;
          continue;
        }
        const a = t * c.spd + c.ph;
        c.g.position.set(c.c.x + Math.cos(a) * c.rad, c.h + Math.sin(t * 0.7 + c.ph) * 0.4, c.c.z + Math.sin(a) * c.rad);
        c.g.rotation.y = -a + (c.spd > 0 ? Math.PI : 0);
        c.g.rotation.z = c.spd > 0 ? 0.3 : -0.3;
        const f = Math.sin(t * 9 + c.ph) * 0.6;
        c.wl.rotation.z = f;
        c.wr.rotation.z = -f;
      }
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
      uDeep: { value: new THREE.Color(0x02050b) },
      uMid: { value: new THREE.Color(0x0b1a30) },
      uSkyLow: { value: new THREE.Color(0x24366a) },
      uSkyHigh: { value: new THREE.Color(0x3a3f7a) },
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
        col += uSkyHigh * smoothstep(0.35, 0.75, h0) * 0.12;
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
        float fog = smoothstep(18.0, 42.0, vDist);
        gl_FragColor = vec4(mix(col, uFog, fog), 1.0);
        #include <colorspace_fragment>
      }`,
  });
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
