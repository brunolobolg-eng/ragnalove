import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Kit do pacote "packtextura" (AURENTHAL Stylized Environment Props): peças nomeadas de um GLB
 * (árvores, rochas, arbustos, troncos, ruínas, barricadas, marco) e texturas de terreno.
 * Cada peça é recentrada na base (y = 0) uma vez; o cenário desenha muitas cópias com InstancedMesh.
 * Só apresentação: nada aqui altera a grade do mapa nem a simulação.
 */

const GLB_URL = 'models/packtextura/AURENTHAL_Stylized_Environment_Props.glb';
const TEX_DIR = 'textures/packtextura/';

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

/** Textura de cor do kit `packtextura` (repete). */
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
