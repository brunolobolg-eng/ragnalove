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

/**
 * O kit vem sem normais e com a ordem das faces irregular: a luz ficava falhada e algumas faces sumiam por fora.
 * Cada bloco é convexo (o centro fica dentro), então cada triângulo recebe a normal apontando para fora e a ordem
 * dos vértices é ajustada para ficar de frente para fora. As cores por vértice (COLOR_0) são preservadas.
 */
function outwardFaces(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const centro = new THREE.Vector3();
  for (let i = 0; i < n; i++) centro.add(new THREE.Vector3().fromBufferAttribute(pos, i));
  centro.multiplyScalar(1 / n);
  const normais = new Float32Array(n * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const meio = new THREE.Vector3();
  for (let t = 0; t < n; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    nrm.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (nrm.lengthSq() === 0) nrm.set(0, 1, 0); // triângulo degenerado: não tem face
    nrm.normalize();
    meio.addVectors(a, b).add(c).multiplyScalar(1 / 3).sub(centro);
    if (nrm.dot(meio) < 0) {
      swapVertices(g, t + 1, t + 2); // a face passa a olhar para fora
      nrm.negate();
    }
    for (let k = 0; k < 3; k++) normais.set([nrm.x, nrm.y, nrm.z], (t + k) * 3);
  }
  g.setAttribute('normal', new THREE.BufferAttribute(normais, 3));
  return g;
}

/** Troca dois vértices de todos os atributos (posição, cor, normal). */
function swapVertices(g: THREE.BufferGeometry, i: number, j: number): void {
  for (const attr of Object.values(g.attributes) as THREE.BufferAttribute[]) {
    const arr = attr.array as Float32Array;
    const s = attr.itemSize;
    for (let k = 0; k < s; k++) {
      const x = arr[i * s + k];
      arr[i * s + k] = arr[j * s + k];
      arr[j * s + k] = x;
    }
  }
}

/** Monta a peça com os meshes cujo nome começa por `prefix`. */
function build(prefix: string): { group: THREE.Group; size: THREE.Vector3 } {
  const group = new THREE.Group();
  source?.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name.startsWith(prefix)) return;
    const mat = (o.material as THREE.Material).clone();
    mat.side = THREE.DoubleSide; // faces que sobrarem por ordem irregular continuam visíveis
    group.add(new THREE.Mesh(outwardFaces(o.geometry.clone().applyMatrix4(o.matrixWorld)), mat));
  });
  // peças do cache são compartilhadas por todos os muros: quem descarta um muro não pode liberar essa geometria nem esse material
  for (const m of group.children as THREE.Mesh[]) {
    m.geometry.userData.compartilhado = true;
    (m.material as THREE.Material).userData.compartilhado = true;
  }
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
