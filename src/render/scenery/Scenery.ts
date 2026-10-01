import * as THREE from 'three';
import type { Board } from '../../core/grid/Board';
import { tileToWorld } from '../coords';
import {
  boardGroundTexture,
  grassTileTexture,
  grassTuftTexture,
  pavingTileTexture,
  sandstoneBrickTexture,
} from './sceneryTextures';

/**
 * Cenário puramente decorativo: campo ao norte, portão de arenito na linha do muro,
 * praça pavimentada da cidade ao sul. Não altera nada da grade — só veste o que o
 * Board já define (paredes continuam onde a simulação diz).
 */
export function buildScenery(board: Board): THREE.Group {
  const root = new THREE.Group();
  const W = board.width;
  const H = board.height;
  const wallRow = findWallRow(board);

  const lambert = (o: THREE.MeshLambertMaterialParameters) => new THREE.MeshLambertMaterial(o);

  // --- Chão do tabuleiro (uma textura pintada, alinhada às casas) ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2),
    lambert({ map: boardGroundTexture(board, wallRow) }),
  );
  ground.receiveShadow = true;
  root.add(ground);

  // --- Terreno em volta: grama ao norte, pavimento da cidade ao sul ---
  const grassTex = grassTileTexture();
  grassTex.repeat.set(12, 12);
  const outerGrass = new THREE.Mesh(new THREE.PlaneGeometry(W + 24, H + 24).rotateX(-Math.PI / 2), lambert({ map: grassTex }));
  outerGrass.position.y = -0.02;
  outerGrass.receiveShadow = true;
  root.add(outerGrass);

  const townDepth = H - wallRow - 1 + 6;
  const paveTex = pavingTileTexture();
  paveTex.repeat.set((W + 8) / 4, townDepth / 4);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, townDepth).rotateX(-Math.PI / 2), lambert({ map: paveTex }));
  const zTop = -H / 2 + wallRow + 1;
  apron.position.set(0, -0.01, zTop + townDepth / 2);
  apron.receiveShadow = true;
  root.add(apron);

  // --- Muro de arenito na linha do portão (inclusive além das bordas) ---
  const brick = sandstoneBrickTexture();
  const wallMat = lambert({ map: brick });
  const capMat = lambert({ color: 0xe6d8b6 });
  const wallGeo = new THREE.BoxGeometry(1, 0.85, 0.62);
  const capGeo = new THREE.BoxGeometry(1.04, 0.1, 0.72);
  const p = new THREE.Vector3();
  const wallXs: number[] = [];
  for (let x = -5; x < W + 5; x++) if (x < 0 || x >= W || board.isWall(x, wallRow)) wallXs.push(x);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallXs.length);
  const caps = new THREE.InstancedMesh(capGeo, capMat, wallXs.length);
  const m = new THREE.Matrix4();
  wallXs.forEach((x, i) => {
    tileToWorld(x, wallRow, p);
    const hj = ((x * 37) % 5) * 0.03; // irregularidade leve
    m.makeTranslation(p.x, 0.425 + hj / 2, p.z);
    walls.setMatrixAt(i, m);
    m.makeTranslation(p.x, 0.9 + hj, p.z);
    caps.setMatrixAt(i, m);
  });
  for (const im of [walls, caps]) {
    im.castShadow = true;
    im.receiveShadow = true;
    root.add(im);
  }

  // Pilares canelados do portão (colunas com capitel escuro octogonal)
  let gapMin = W;
  let gapMax = -1;
  for (let x = 0; x < W; x++)
    if (board.isWalkable(x, wallRow)) {
      gapMin = Math.min(gapMin, x);
      gapMax = Math.max(gapMax, x);
    }
  if (gapMax >= 0) for (const x of [gapMin - 1, gapMax + 1]) root.add(pillar(tileToWorld(x, wallRow)));

  // --- Árvores e arbustos nas laterais do campo ---
  const treeSpots: [number, number, number][] = [
    [-2.2, 0.5, 1.1], [-3.4, 2.4, 1.3], [-2.0, 3.9, 0.9], [-4.2, -0.8, 1.2],
    [W + 1.3, 0.2, 1.2], [W + 2.6, 2.1, 1.0], [W + 1.5, 4.0, 1.3], [W + 3.4, -0.6, 1.1],
    [2, -2.3, 1.2], [6.5, -3.2, 1.0], [11.5, -2.5, 1.3], [W - 1, -3.6, 1.0],
  ];
  for (const [x, y, s] of treeSpots) root.add(tree(tileToWorld(x, y), s, x * 13 + y * 7));
  for (const [x, y] of [[-1.2, 4.2], [W + 0.3, 4.3], [-1.4, 1.5], [W + 0.2, 1.2]] as [number, number][])
    root.add(bush(tileToWorld(x, y), x + y));

  // --- Tufos de grama espalhados (baixos, para não esconder unidades) ---
  root.add(grassTufts(board, wallRow));

  // --- Cidade: casas e poço nas bordas da praça ---
  root.add(house(tileToWorld(-3.2, wallRow + 3.4), 0.3));
  root.add(house(tileToWorld(W + 2.2, wallRow + 3.8), -0.25));
  root.add(well(tileToWorld(-1.8, H - 1.2)));
  root.add(lamp(tileToWorld(-0.9, wallRow + 1.4)));
  root.add(lamp(tileToWorld(W - 0.1, wallRow + 1.4)));

  return root;
}

function findWallRow(board: Board): number {
  let best = 0;
  let bestN = -1;
  for (let y = 0; y < board.height; y++) {
    let n = 0;
    for (let x = 0; x < board.width; x++) if (board.isWall(x, y)) n++;
    if (n > bestN) {
      bestN = n;
      best = y;
    }
  }
  return best;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function pillar(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = new THREE.MeshLambertMaterial({ color: 0xe4d6b4 });
  const fluted = new THREE.MeshLambertMaterial({ color: 0xd8c8a2, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x4a5068, flatShading: true });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), stone);
  base.position.y = 0.15;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.33, 1.9, 16), fluted);
  shaft.position.y = 1.25;
  const capital = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.8), stone);
  capital.position.y = 2.28;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.22, 8), dark);
  top.position.y = 2.48;
  g.add(base, shaft, capital, top);
  return shadowed(g);
}

function tree(pos: THREE.Vector3, s: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.scale.setScalar(s);
  const bark = new THREE.MeshLambertMaterial({ color: 0x6b4a2b });
  const leafA = new THREE.MeshLambertMaterial({ color: 0x4f8a2e });
  const leafB = new THREE.MeshLambertMaterial({ color: 0x6aa83a });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.2, 8), bark);
  trunk.position.y = 0.6;
  g.add(trunk);
  const blobs: [number, number, number, number][] = [
    [0, 1.55, 0, 0.75], [0.45, 1.3, 0.1, 0.5], [-0.4, 1.35, -0.1, 0.55], [0.1, 1.95, -0.15, 0.5], [-0.1, 1.3, 0.4, 0.45],
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), (i + seed) % 2 ? leafA : leafB);
    b.position.set(x, y, z);
    g.add(b);
  });
  g.rotation.y = seed;
  return shadowed(g);
}

function bush(pos: THREE.Vector3, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const leaf = new THREE.MeshLambertMaterial({ color: 0x5a9632 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 - i * 0.05, 1), leaf);
    b.position.set(Math.cos(seed + i * 2) * 0.25, 0.22, Math.sin(seed + i * 2) * 0.25);
    g.add(b);
  }
  return shadowed(g);
}

function grassTufts(board: Board, wallRow: number): THREE.InstancedMesh {
  const geo = new THREE.BufferGeometry();
  // dois quads cruzados
  const a = new THREE.PlaneGeometry(0.5, 0.28).translate(0, 0.14, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const merged = mergeTwo(a, b);
  geo.copy(merged);
  const mat = new THREE.MeshLambertMaterial({ map: grassTuftTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  const spots: THREE.Vector3[] = [];
  let s = 17;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 70; i++) {
    let x = -4 + r() * (board.width + 8);
    // poucos tufos dentro do tabuleiro: leitura tática em primeiro lugar
    if (x > 0 && x < board.width && r() < 0.7) x = x < board.width / 2 ? -1 - r() * 3 : board.width + 1 + r() * 3;
    const y = -4 + r() * (wallRow + 3.5);
    spots.push(tileToWorld(x - 0.5, y - 0.5));
  }
  const im = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
    const sc = 0.7 + ((i * 37) % 10) / 15;
    m.compose(p, q, new THREE.Vector3(sc, sc, sc));
    im.setMatrixAt(i, m);
  });
  return im;
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const aa = a.getAttribute(name) as THREE.BufferAttribute;
    const bb = b.getAttribute(name) as THREE.BufferAttribute;
    const arr = new Float32Array(aa.array.length + bb.array.length);
    arr.set(aa.array as Float32Array);
    arr.set(bb.array as Float32Array, aa.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, aa.itemSize));
  }
  const ia = Array.from(a.getIndex()!.array);
  const ib = Array.from(b.getIndex()!.array).map((v) => v + a.getAttribute('position').count);
  out.setIndex([...ia, ...ib]);
  return out;
}

function house(pos: THREE.Vector3, yaw: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  g.rotation.y = yaw;
  const brick = sandstoneBrickTexture();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.7, 2.2), new THREE.MeshLambertMaterial({ map: brick }));
  walls.position.y = 0.85;
  const tri = new THREE.Shape();
  tri.moveTo(-1.55, 0);
  tri.lineTo(1.55, 0);
  tri.lineTo(0, 1.1);
  tri.closePath();
  const roof = new THREE.Mesh(
    new THREE.ExtrudeGeometry(tri, { depth: 2.6, bevelEnabled: false }).translate(0, 0, -1.3),
    new THREE.MeshLambertMaterial({ color: 0x8e3d2c, flatShading: true }),
  );
  roof.position.y = 1.72;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.12, 2.3), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }));
  trim.position.y = 1.72;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.05), new THREE.MeshLambertMaterial({ color: 0x4a3120 }));
  door.position.set(0, 0.45, 1.11);
  const win = new THREE.MeshLambertMaterial({ color: 0x3c5a78 });
  for (const x of [-0.8, 0.8]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.05), win);
    w.position.set(x, 1.05, 1.11);
    g.add(w);
  }
  g.add(walls, roof, trim, door);
  return shadowed(g);
}

function well(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = new THREE.MeshLambertMaterial({ color: 0xd7c6a0, flatShading: true });
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.55, 12, 1, true), stone);
  ring.material.side = THREE.DoubleSide;
  ring.position.y = 0.275;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.09, 6, 16).rotateX(Math.PI / 2), stone);
  lip.position.y = 0.56;
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 20).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3f86c2, emissive: 0x0d2a44 }),
  );
  water.position.y = 0.4;
  g.add(ring, lip, water);
  return shadowed(g);
}

function lamp(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const iron = new THREE.MeshLambertMaterial({ color: 0x4a5068 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), iron);
  post.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.25, 6), iron);
  head.position.y = 1.7;
  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xffe2a0, emissive: 0xffc060, emissiveIntensity: 0.6 }),
  );
  glass.position.y = 1.62;
  g.add(post, head, glass);
  return shadowed(g);
}
