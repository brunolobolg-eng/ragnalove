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
/** Pixels por tile no chão pintado: 16 fica nítido de perto e leve na memória. */
const PX = 16;

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

function imageOf(name: string): Promise<HTMLImageElement> {
  let p = images.get(name);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`textura do kit ausente: ${name}`));
      img.src = `${TEX_DIR}${name}.webp`;
    });
    images.set(name, p);
  }
  return p;
}

/**
 * Textura do kit (repete). Cor é sRGB; mapa de normais (`linear`) não. Devolve a textura na hora e preenche
 * a imagem quando ela chega, então cada uso pode ter o seu `repeat`.
 */
export function packTexture(name: string, linear = false): THREE.Texture {
  const t = new THREE.Texture();
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  imageOf(name)
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
 * Material PBR de pedra do kit (cor + mapa de normais, relevo sob a luz). Usa o `repeat` da cor também na
 * normal, então o `repeat` definido depois no `map` vale para as duas. Fica para superfícies de pedra
 * importantes (deque, praça), que pedem mais detalhe que o Lambert plano do resto do cenário.
 */
export function packStoneMaterial(name: string, map: THREE.Texture, color = 0xffffff): THREE.MeshStandardMaterial {
  const normalMap = packTexture(`${name}_Normal`, true);
  normalMap.repeat = map.repeat;
  return new THREE.MeshStandardMaterial({ map, normalMap, color, roughness: 0.92, metalness: 0 });
}

/** Tipos de peça que projetam sombra no chão pintado (copas, rochas, troncos, ruínas, muros). */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall']);

/**
 * Chão do mapa pintado com o kit: grama base em toda a área, sombra sob as copas e na neblina,
 * trilha de terra dos caminhos (das entradas até o portão), raízes, calçada na praça e poças.
 * Os vazios (`voids`) saem transparentes, e a água embaixo aparece. `margin` = tiles de chão além da grade.
 */
export function packGroundTexture(zone: ParsedZone, margin: number): THREE.CanvasTexture {
  const CW = (zone.width + 2 * margin) * PX;
  const CH = (zone.height + 2 * margin) * PX;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // até as texturas chegarem, o chão tem a cor média da grama (nada fica vazio)
  g.fillStyle = '#4f7a34';
  g.fillRect(0, 0, CW, CH);

  type Fill = { img: HTMLImageElement; tiles: number } | { color: string };
  const scratch = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = CW;
    c.height = CH;
    return c;
  };
  /** Pinta `fill` só onde `draw` desenha (máscara em branco), com a borda suavizada por `blur`. */
  const through = (fill: Fill, draw: (c: CanvasRenderingContext2D) => void, o: { blur?: number; alpha?: number } = {}) => {
    const mask = scratch();
    const mc = mask.getContext('2d')!;
    mc.fillStyle = '#fff';
    mc.strokeStyle = '#fff';
    draw(mc);
    let src = mask;
    if (o.blur) {
      src = scratch();
      const sc = src.getContext('2d')!;
      sc.filter = `blur(${o.blur}px)`;
      sc.drawImage(mask, 0, 0);
    }
    const color = scratch();
    const cc = color.getContext('2d')!;
    if ('img' in fill) {
      const pat = cc.createPattern(fill.img, 'repeat')!;
      const s = (PX * fill.tiles) / fill.img.width;
      pat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
      cc.fillStyle = pat;
    } else cc.fillStyle = fill.color;
    cc.fillRect(0, 0, CW, CH);
    cc.globalCompositeOperation = 'destination-in';
    cc.drawImage(src, 0, 0);
    g.globalAlpha = o.alpha ?? 1;
    g.drawImage(color, 0, 0);
    g.globalAlpha = 1;
  };
  const cells = (list: Vec2[]) => (c: CanvasRenderingContext2D) => {
    for (const p of list) c.fillRect((p.x + margin) * PX, (p.y + margin) * PX, PX, PX);
  };
  const trail = (routes: Vec2[][]) => (c: CanvasRenderingContext2D) => {
    c.lineWidth = PX * 1.2;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const r of routes) {
      c.beginPath();
      r.forEach((p, i) => {
        const px = (p.x + margin + 0.5) * PX;
        const py = (p.y + margin + 0.5) * PX;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      });
      c.stroke();
    }
  };

  const routes = trailRoutes(zone);
  const shade = [...zone.props.filter((p) => SHADE_KINDS.has(p.kind)), ...zone.fog];
  const cobble = zone.floor.filter((f) => f.plaza || f.ground === 'gate');
  const puddles = zone.floor.filter((f) => f.ground === 'puddle');

  const compose = (imgs: HTMLImageElement[]) => {
    const [grass, shadeTex, dirt, cobbleTex] = imgs;
    through({ img: grass, tiles: 6 }, (c) => c.fillRect(0, 0, CW, CH));
    through({ img: shadeTex, tiles: 4 }, cells(shade), { blur: 7, alpha: 0.9 });
    through({ img: dirt, tiles: 4 }, (c) => {
      cells(zone.slow)(c);
      trail(routes)(c);
    }, { blur: 3, alpha: 0.95 });
    through({ img: cobbleTex, tiles: 2 }, cells(cobble));
    through({ color: '#1c3b46' }, cells(puddles), { blur: 4, alpha: 0.75 });
    // vazios: transparentes (o alphaTest do material deixa a água aparecer)
    g.globalCompositeOperation = 'destination-out';
    cells(zone.voids)(g);
    g.globalCompositeOperation = 'source-over';
    tex.needsUpdate = true;
  };
  Promise.all(['Grass_Lush', 'Grass_Shadow', 'Dirt_Trail', 'Cobblestone_Night'].map(imageOf))
    .then(compose)
    .catch(() => {
      /* sem as texturas, o chão fica na cor média da grama */
    });
  return tex;
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
