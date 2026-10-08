import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Peças de cenário em GLB (Kenney, CC0 — public/models/props/<pacote>/<nome>.glb).
 * Pacotes: town (cidade), castle (castelo), survival (acampamento), nature (barracas/fogueira).
 * Cada modelo é carregado uma vez; `placeProp` coloca uma cópia assim que ele chega
 * (o cenário aparece na hora, as peças entram um instante depois).
 */
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D>>();

function load(path: string): Promise<THREE.Object3D> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(`models/props/${path}.glb`).then((g) => {
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true;
        m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.isMeshStandardMaterial) {
          mat.metalness = 0;
          mat.roughness = 0.9;
        }
      });
      return g.scene;
    });
    cache.set(path, p);
  }
  return p;
}

export interface PropOpts {
  y?: number;
  rot?: number;
  scale?: number;
  /** Multiplica a cor (ex.: escurecer pedras claras demais na cena noturna). */
  tint?: number;
  /** Inclinação (rad) em X/Z: peça caída, torta. */
  tiltX?: number;
  tiltZ?: number;
}

/** Coloca a peça `path` (ex.: 'survival/barrel') em (x, z) do mundo. Devolve o grupo-suporte. */
export function placeProp(parent: THREE.Object3D, path: string, x: number, z: number, o: PropOpts = {}): THREE.Group {
  const holder = new THREE.Group();
  holder.position.set(x, o.y ?? 0, z);
  holder.rotation.set(o.tiltX ?? 0, o.rot ?? 0, o.tiltZ ?? 0);
  holder.scale.setScalar(o.scale ?? 1);
  parent.add(holder);
  load(path)
    .then((src) => {
      const c = src.clone(true);
      if (o.tint !== undefined) {
        const k = new THREE.Color(o.tint);
        c.traverse((n) => {
          const m = n as THREE.Mesh;
          if (!m.isMesh) return;
          const mat = (m.material as THREE.MeshStandardMaterial).clone();
          mat.color.multiply(k);
          m.material = mat;
        });
      }
      holder.add(c);
    })
    .catch(() => {
      /* peça ausente: o cenário segue sem ela */
    });
  return holder;
}

/** Cor da geada: as peças do cenário de neve ficam mais claras e azuladas. */
const FROST = new THREE.Color(0xe4edf8);

export interface InstanceOpts {
  /** Quanto da cor vai para a geada (0 = cor original, 1 = branco-azulado). */
  frost?: number;
}

/**
 * Desenha muitas cópias de uma peça com UMA chamada de desenho por malha (InstancedMesh).
 * `mats` são as matrizes de cada cópia no mundo; a peça é lida uma vez e fica em cache.
 */
export function instanceProps(parent: THREE.Object3D, path: string, mats: THREE.Matrix4[], o: InstanceOpts = {}): void {
  if (!mats.length) return;
  load(path)
    .then((src) => {
      src.updateWorldMatrix(true, true);
      const invRoot = new THREE.Matrix4().copy(src.matrixWorld).invert();
      src.traverse((n) => {
        const m = n as THREE.Mesh;
        if (!m.isMesh) return;
        // a malha vai para o espaço da peça (sem a transformação da raiz do GLB)
        const geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(invRoot, m.matrixWorld));
        const mat = (Array.isArray(m.material) ? m.material[0] : m.material).clone() as THREE.MeshStandardMaterial;
        if (o.frost) mat.color.lerp(FROST, o.frost);
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((mx, i) => im.setMatrixAt(i, mx));
        im.castShadow = true;
        im.receiveShadow = true;
        parent.add(im);
      });
    })
    .catch(() => {
      /* peça ausente: o cenário segue sem ela */
    });
}
