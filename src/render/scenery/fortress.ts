import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Kit de muralha do dono (public/models/fortress.glb): peças nomeadas no arquivo (muro reto de 2 e 4 m, canto, torre,
 * barricada, portão, tocha, suporte de bandeira). Cada peça vira um grupo centralizado em x/z, com a base em y = 0 e
 * as transformações do arquivo já aplicadas. As geometrias são compartilhadas entre os clones.
 */

let source: THREE.Object3D | undefined;
let loading: Promise<void> | undefined;
const pieces = new Map<string, { group: THREE.Group; size: THREE.Vector3 }>();

/** Carrega o kit uma vez (chamado no menu, junto das texturas de efeito). */
export function loadFortress(): Promise<void> {
  loading ??= new GLTFLoader().loadAsync('models/fortress.glb').then((g) => {
    g.scene.updateMatrixWorld(true);
    source = g.scene;
  });
  return loading;
}

/** Monta a peça com os meshes cujo nome começa por `prefix`. */
function build(prefix: string): { group: THREE.Group; size: THREE.Vector3 } {
  const group = new THREE.Group();
  source?.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name.startsWith(prefix)) return;
    group.add(new THREE.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld), o.material));
  });
  const box = new THREE.Box3().setFromObject(group);
  const c = box.getCenter(new THREE.Vector3());
  // centraliza a geometria (não o grupo): assim escala e rotação giram em torno do centro da peça
  for (const m of group.children as THREE.Mesh[]) m.geometry.translate(-c.x, -box.min.y, -c.z);
  return { group, size: box.getSize(new THREE.Vector3()) };
}

/** Peça do kit pelo prefixo do nome (ex.: 'Wall_Straight_2m'). Devolve um clone pronto; vazia se o kit não carregou. */
export function fortressPiece(prefix: string): THREE.Group {
  if (!source) return new THREE.Group(); // ainda carregando: não guarda nada no cache
  let p = pieces.get(prefix);
  if (!p) {
    p = build(prefix);
    pieces.set(prefix, p);
  }
  return p.group.clone();
}

/** Tamanho original da peça (m). Zero se o kit não carregou. */
export function fortressSize(prefix: string): THREE.Vector3 {
  if (!source) return new THREE.Vector3();
  fortressPiece(prefix);
  return pieces.get(prefix)?.size.clone() ?? new THREE.Vector3();
}
