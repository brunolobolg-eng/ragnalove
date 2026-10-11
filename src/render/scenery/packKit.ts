import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ParsedZone } from '../../config/zones';
import type { Vec2 } from '../../core/grid/types';

/**
 * Kit do pacote "packtextura" (AURENTHAL Stylized Environment Props): peças nomeadas de um GLB
 * (árvores, rochas, arbustos, troncos, ruínas, barricadas, marco) e texturas de terreno.
 * Cada peça é recentrada na base (y = 0) uma vez; o cenário desenha muitas cópias com InstancedMesh.
 * Só apresentação: nada aqui altera a grade do mapa nem a simulação.
 */

const GLB_URL = 'models/packtextura/AURENTHAL_Stylized_Environment_Props.glb';
const TEX_DIR = 'textures/packtextura/';
/** Texturas de chão recortadas da folha de texturas do dono (public/textures/floresta/). */
const FLOOR_DIR = 'textures/floresta/';
/** Pixels por tile nas máscaras das camadas do chão. As bordas são suaves, então não precisam da resolução da textura. */
const MASK_PX = 12;

/** Peças do kit por nome. Cada nome pega todas as malhas que começam com ele (Tree_01 = tronco + copas). */
export const PACK: Record<string, string[]> = {
  trees: ['Tree_01', 'Tree_02', 'Tree_03', 'Tree_04', 'Tree_05', 'Tree_06'],
  rocks: ['Rock_01', 'Rock_02', 'Rock_03', 'Rock_04', 'Rock_05', 'Rock_06', 'Rock_07', 'Rock_08', 'Rock_09'],
  bushes: [1, 2, 3, 4, 5, 6].flatMap((n) => [0, 1, 2].map((k) => `Bush_0${n}_${k}`)),
  logs: ['Fallen_Log_01', 'Fallen_Log_02', 'Fallen_Log_03', 'Fallen_Log_04'],
  ruins: ['Ruin_01', 'Ruin_02', 'Ruin_03', 'Ruin_04'],
  barricades: ['Battle_Barricade_1', 'Battle_Barricade_2', 'Battle_Barricade_3'],
  waystone: ['Waystone'],
};
const ALL_KEYS = Object.values(PACK).flat();

export interface PackPiece {
  /** malhas da peça, já na base e centradas em x/z = 0 */
  parts: THREE.BufferGeometry[];
  mats: THREE.MeshLambertMaterial[];
  /** altura total da peça (1 unidade = 1 tile) */
  height: number;
}

let kit: Promise<Map<string, PackPiece>> | undefined;

/** Carrega o GLB do kit uma vez. O cenário aparece na hora; as peças entram quando chegam. */
export function loadPackKit(): Promise<Map<string, PackPiece>> {
  if (!kit) {
    kit = new GLTFLoader().loadAsync(GLB_URL).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const meshes: { name: string; geo: THREE.BufferGeometry }[] = [];
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        meshes.push({ name: m.name || m.parent?.name || '', geo });
      });
      const pieces = new Map<string, PackPiece>();
      for (const key of ALL_KEYS) {
        const own = meshes.filter((m) => m.name === key || m.name.startsWith(`${key}_`));
        if (!own.length) continue;
        const box = new THREE.Box3();
        for (const m of own) {
          m.geo.computeBoundingBox();
          box.union(m.geo.boundingBox!);
        }
        const cx = (box.min.x + box.max.x) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        const y0 = box.min.y;
        const parts = own.map((m) => m.geo.translate(-cx, -y0, -cz));
        pieces.set(key, {
          parts,
          mats: parts.map((g) => new THREE.MeshLambertMaterial({ vertexColors: !!g.getAttribute('color') })),
          height: box.max.y - y0,
        });
      }
      return pieces;
    });
  }
  return kit;
}

/** Matriz de uma cópia da peça em (x, z) do mundo (base em `y`), com escala e giro em torno de Y. */
export function packMatrix(x: number, z: number, s: number, rot = 0, sy = s, y = 0): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot),
    new THREE.Vector3(s, sy, s),
  );
}

/**
 * Desenha as cópias de uma peça do kit com UMA chamada de desenho por malha (InstancedMesh).
 * Se o kit ainda não chegou, as cópias entram assim que ele carregar.
 */
export function packInstances(parent: THREE.Object3D, key: string, mats: THREE.Matrix4[], tint?: number): void {
  if (!mats.length) return;
  loadPackKit()
    .then((pieces) => {
      const p = pieces.get(key);
      if (!p) return;
      p.parts.forEach((geo, i) => {
        // `tint` multiplica a cor de vértice (ex.: copas mais escuras e musgosas para casar com a grama)
        const mat = tint === undefined ? p.mats[i] : new THREE.MeshLambertMaterial({ vertexColors: p.mats[i].vertexColors, color: tint });
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((mx, k) => im.setMatrixAt(k, mx));
        im.castShadow = true;
        im.receiveShadow = true;
        parent.add(im);
      });
    })
    .catch(() => {
      /* kit ausente: o cenário segue sem essas peças */
    });
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

/** Textura que aparece na hora e recebe a imagem quando ela chega (cada uso tem o seu `repeat`). */
function loadTexture(url: string, linear: boolean): THREE.Texture {
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

/**
 * Textura de cor do kit (repete). Cor é sRGB; mapa de normais (`linear`) não.
 */
export function packTexture(name: string, linear = false): THREE.Texture {
  return loadTexture(`${TEX_DIR}${name}.webp`, linear);
}

/**
 * Material PBR de pedra do kit (cor + mapa de normais, relevo sob a luz). Usa o `repeat` da cor também na
 * normal, então o `repeat` definido depois no `map` vale para as duas. Fica para superfícies de pedra
 * importantes (deque, praça), que pedem mais detalhe que o Lambert plano do resto do cenário.
 */
export function packStoneMaterial(name: string, map: THREE.Texture, color = 0xffffff): THREE.MeshStandardMaterial {
  const normalMap = packTexture(`${name}_Normal`, true);
  normalMap.repeat = map.repeat;
  return new THREE.MeshStandardMaterial({ map, normalMap, color, roughness: 0.92, metalness: 0 });
}

/** Tipos de peça que projetam sombra no chão (copas, rochas, troncos, ruínas, muros). */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall']);

/** Hash inteiro determinístico (só visual): o mesmo mapa sai sempre igual. */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ruído de valor suave (0 a 1), com interpolação em S. */
function valueNoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, s);
  const b = hash(x0 + 1, y0, s);
  const c = hash(x0, y0 + 1, s);
  const d = hash(x0 + 1, y0 + 1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Ruído em três oitavas (0 a 1): bordas orgânicas e manchas irregulares. */
function noise(x: number, y: number, s: number): number {
  return 0.6 * valueNoise(x, y, s) + 0.3 * valueNoise(x * 2.03, y * 2.03, s + 1) + 0.1 * valueNoise(x * 4.1, y * 4.1, s + 2);
}

/** Degrau suave: 0 abaixo de `a`, 1 acima de `b`. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Chão da floresta em camadas. Cada camada é um plano com uma textura da folha do dono e uma máscara suave
 * (alphaMap) que diz onde ela aparece: grama base, manchas de grama florida, sombra sob as copas e na
 * neblina, trilha de terra com borda orgânica (das entradas até o portão), pedra no portão e poças.
 * A textura fica nítida de perto; só as máscaras são de baixa resolução, e por serem borrão ninguém as vê.
 * Os vazios (água) saem em todas as camadas. `margin` = tiles de chão além da grade.
 */
export function packForestGround(zone: ParsedZone, margin: number): THREE.Group {
  const TW = zone.width + 2 * margin;
  const TH = zone.height + 2 * margin;
  const CW = TW * MASK_PX;
  const CH = TH * MASK_PX;
  const voids = new Uint8Array(TW * TH);
  for (const v of zone.voids) voids[(v.y + margin) * TW + v.x + margin] = 1;
  const tileAt = (px: number, py: number): number => Math.floor(py / MASK_PX) * TW + Math.floor(px / MASK_PX);
  const gx = (px: number) => px / MASK_PX - margin;
  const gy = (py: number) => py / MASK_PX - margin;

  const rect = (c: CanvasRenderingContext2D, x: number, y: number) => c.fillRect((x + margin) * MASK_PX, (y + margin) * MASK_PX, MASK_PX, MASK_PX);
  const disc = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    c.beginPath();
    c.arc((x + margin + 0.5) * MASK_PX, (y + margin + 0.5) * MASK_PX, r * MASK_PX, 0, Math.PI * 2);
    c.fill();
  };

  /**
   * Máscara em tons de cinza: `draw` pinta as formas (branco sobre preto), o desfoque amacia a borda e
   * `shape(valor, x, y)` decide o contorno final com ruído. Os vazios são sempre zerados.
   */
  const mask = (draw: (c: CanvasRenderingContext2D) => void, blur: number, shape: (v: number, x: number, y: number) => number): HTMLCanvasElement => {
    const src = document.createElement('canvas');
    src.width = CW;
    src.height = CH;
    const sc = src.getContext('2d')!;
    sc.fillStyle = '#000';
    sc.fillRect(0, 0, CW, CH);
    sc.fillStyle = '#fff';
    sc.strokeStyle = '#fff';
    draw(sc);
    const out = document.createElement('canvas');
    out.width = CW;
    out.height = CH;
    const oc = out.getContext('2d')!;
    oc.filter = `blur(${blur}px)`;
    oc.drawImage(src, 0, 0);
    oc.filter = 'none';
    const img = oc.getImageData(0, 0, CW, CH);
    const d = img.data;
    for (let py = 0; py < CH; py++) {
      for (let px = 0; px < CW; px++) {
        const i = (py * CW + px) * 4;
        const v = voids[tileAt(px, py)] ? 0 : Math.min(1, Math.max(0, shape(d[i] / 255, gx(px), gy(py))));
        d[i] = d[i + 1] = d[i + 2] = Math.round(v * 255);
        d[i + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    return out;
  };

  const ground = new THREE.Group();
  /** Plano de chão cobrindo a área inteira; a textura repete a cada `tiles` tiles. */
  const layer = (
    o: { map?: THREE.Texture; tiles?: number; alpha: HTMLCanvasElement; color?: number; opacity?: number; y: number; order: number; opaque?: boolean },
  ): void => {
    if (o.map && o.tiles) o.map.repeat.set(TW / o.tiles, TH / o.tiles);
    const alphaMap = new THREE.CanvasTexture(o.alpha);
    alphaMap.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshLambertMaterial({
      map: o.map,
      color: o.color ?? 0xffffff,
      opacity: o.opacity ?? 1,
      alphaMap,
      transparent: !o.opaque,
      alphaTest: o.opaque ? 0.5 : 0,
      depthWrite: !!o.opaque,
      polygonOffset: !o.opaque,
      polygonOffsetFactor: -o.order,
      polygonOffsetUnits: -o.order,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH).rotateX(-Math.PI / 2), mat);
    m.position.y = o.y;
    m.renderOrder = o.order;
    m.receiveShadow = true;
    ground.add(m);
  };

  const routes = trailRoutes(zone);
  const shadeProps = zone.props.filter((p) => SHADE_KINDS.has(p.kind));

  // 0 · grama base em toda a área (os vazios saem por máscara, o que está embaixo aparece)
  layer({
    map: loadTexture(`${FLOOR_DIR}grama_a.webp`, false),
    tiles: 3,
    alpha: mask((c) => c.fillRect(0, 0, CW, CH), 0, () => 1),
    opaque: true,
    y: -0.03,
    order: 0,
  });
  // 1 · manchas de grama florida, em blocos irregulares
  layer({
    map: loadTexture(`${FLOOR_DIR}grama_b.webp`, false),
    tiles: 3,
    alpha: mask(() => {}, 0, (_v, x, y) => smooth(0.5, 0.64, noise(x * 0.16 + 3, y * 0.16 - 2, 11))),
    y: -0.025,
    order: 1,
  });
  // 2 · sombra sob as copas, rochas, troncos e na neblina (grama escurecida)
  layer({
    map: loadTexture(`${FLOOR_DIR}grama_a.webp`, false),
    tiles: 3,
    color: 0x3d4f3a,
    opacity: 0.85,
    alpha: mask(
      (c) => {
        for (const p of shadeProps) disc(c, p.x, p.y, 1.2);
        for (const f of zone.fog) rect(c, f.x, f.y);
      },
      6,
      (v, x, y) => smooth(0.2, 0.5, v * (0.8 + 0.4 * noise(x * 0.7, y * 0.7, 5))),
    ),
    y: -0.02,
    order: 2,
  });
  // 3 · trilha de terra: borda orgânica, e as raízes expostas também ficam de terra
  layer({
    map: loadTexture(`${FLOOR_DIR}terra.webp`, false),
    tiles: 2,
    alpha: mask(
      (c) => {
        c.lineWidth = 1.3 * MASK_PX;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        for (const r of routes) {
          c.beginPath();
          r.forEach((p, i) => {
            const px = (p.x + margin + 0.5) * MASK_PX;
            const py = (p.y + margin + 0.5) * MASK_PX;
            if (i === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          });
          c.stroke();
        }
        for (const s of zone.slow) rect(c, s.x, s.y);
      },
      4,
      (v, x, y) => smooth(0.3, 0.62, v + (noise(x * 1.1, y * 1.1, 9) - 0.5) * 0.7),
    ),
    y: -0.015,
    order: 3,
  });
  // 4 · pedra no portão da cidade (calçada irregular)
  layer({
    map: loadTexture(`${FLOOR_DIR}pedra.webp`, false),
    tiles: 2,
    alpha: mask(
      (c) => {
        for (const f of zone.floor) if (f.plaza || f.ground === 'gate') rect(c, f.x, f.y);
      },
      2,
      (v, x, y) => smooth(0.4, 0.6, v + (noise(x * 1.6, y * 1.6, 4) - 0.5) * 0.5),
    ),
    y: -0.012,
    order: 4,
  });
  // 5 · poças: água escura com borda irregular
  layer({
    color: 0x1c3b46,
    opacity: 0.85,
    alpha: mask(
      (c) => {
        for (const f of zone.floor) if (f.ground === 'puddle') disc(c, f.x, f.y, 0.55);
      },
      3,
      (v, x, y) => smooth(0.3, 0.6, v + (noise(x * 2, y * 2, 13) - 0.5) * 0.35),
    ),
    y: -0.009,
    order: 5,
  });
  return ground;
}

/** Caminho mais curto de cada entrada até o portão, por tiles livres (sem muro, vazio ou árvore). */
function trailRoutes(zone: ParsedZone): Vec2[][] {
  const W = zone.width;
  const blocked = new Set([...zone.walls, ...zone.voids].map((p) => p.y * W + p.x));
  const goals = new Set(zone.city.map((p) => p.y * W + p.x));
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const routes: Vec2[][] = [];
  for (const s of zone.spawnPoints) {
    const start = s.y * W + s.x;
    const prev = new Map<number, number>([[start, -1]]);
    const queue = [start];
    let goal = -1;
    for (let i = 0; i < queue.length && goal < 0; i++) {
      const cur = queue[i];
      if (goals.has(cur)) {
        goal = cur;
        break;
      }
      const x = cur % W;
      const y = (cur - x) / W;
      for (const [dx, dy] of steps) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= zone.height) continue;
        const n = ny * W + nx;
        if (blocked.has(n) || prev.has(n)) continue;
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (goal < 0) continue;
    const path: Vec2[] = [];
    for (let c = goal; c >= 0; c = prev.get(c)!) path.push({ x: c % W, y: Math.floor(c / W) });
    routes.push(path);
  }
  return routes;
}
