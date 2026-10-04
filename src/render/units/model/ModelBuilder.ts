import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Monta um personagem 3D estilizado a partir de peças simples (esferas, cápsulas,
 * cones, tornos...) coloridas por vértice, cada peça presa a um osso. No fim tudo
 * vira UMA geometria com skinning → 1 draw call para o corpo + 1 para o contorno.
 *
 * Convenções: personagem olha para +Z, Y para cima, lado ESQUERDO do personagem em +X.
 * Ossos em pose de descanso sem rotação (só deslocamento), braços caídos ao lado do corpo.
 */

export interface BoneDef {
  name: string;
  parent?: string;
  /** Posição relativa ao pai (na pose de descanso). */
  pos: [number, number, number];
  /**
   * Rotação de descanso local (quat xyzw). Rigs procedurais/auto-rig usam
   * identidade (ausente); GLBs Mixamo/V2Fun trazem a sua — sem ela o bind
   * desmonta (esqueleto colapsa na origem).
   */
  rest?: [number, number, number, number];
}

export interface PartOpts {
  pos?: [number, number, number]; // relativo ao osso
  rot?: [number, number, number]; // graus, ordem XYZ
  scale?: [number, number, number] | number;
  /** Transformação extra aplicada depois da local (para montar peças compostas, ex.: escudo). */
  post?: THREE.Matrix4;
}

type Weights = [string, number][];

export interface BuiltModel {
  geometry: THREE.BufferGeometry;
  bones: BoneDef[];
  /** Peças brilhantes presas a ossos (orbe, olhos...) — viram malhas filhas do osso. */
  glows: { bone: string; geometry: THREE.BufferGeometry; color: THREE.Color; pos: THREE.Vector3 }[];
  height: number;
  /** Textura de cor (modelos importados); os construídos em código usam cor por vértice. */
  map?: THREE.Texture;
  /** Inversas de bind do arquivo (GLBs com descanso rotacionado); sem elas, o instantiateSkeleton deriva. */
  inverses?: THREE.Matrix4[];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const D2R = Math.PI / 180;

export class ModelBuilder {
  private readonly bones: BoneDef[] = [];
  private readonly index = new Map<string, number>();
  private readonly world = new Map<string, THREE.Vector3>();
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly glows: BuiltModel['glows'] = [];

  bone(name: string, parent: string | undefined, pos: [number, number, number]): this {
    this.index.set(name, this.bones.length);
    this.bones.push({ name, parent, pos });
    const w = new THREE.Vector3(...pos);
    if (parent) w.add(this.world.get(parent)!);
    this.world.set(name, w);
    return this;
  }

  /** Posição de descanso do osso no espaço do modelo. */
  boneWorld(name: string): THREE.Vector3 {
    return this.world.get(name)!.clone();
  }

  /** Peça rígida presa a um osso. */
  add(bone: string, geo: THREE.BufferGeometry, color: number | THREE.Color, o: PartOpts = {}): this {
    return this.addWeighted(geo, color, () => [[bone, 1]], o, bone);
  }

  /**
   * Peça com pesos por vértice (capa, saia): `weights(p)` recebe a posição do vértice
   * no espaço do modelo e devolve até 4 pares [osso, peso].
   */
  addWeighted(geo: THREE.BufferGeometry, color: number | THREE.Color, weights: (p: THREE.Vector3) => Weights, o: PartOpts = {}, anchor?: string): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    const sc = o.scale === undefined ? [1, 1, 1] : typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : o.scale;
    _e.set((o.rot?.[0] ?? 0) * D2R, (o.rot?.[1] ?? 0) * D2R, (o.rot?.[2] ?? 0) * D2R);
    _v.set(...(o.pos ?? [0, 0, 0]));
    if (anchor && !o.post) _v.add(this.world.get(anchor)!);
    _m.compose(_v, _q.setFromEuler(_e), _s.set(sc[0], sc[1], sc[2]));
    g.applyMatrix4(_m);
    if (o.post) g.applyMatrix4(o.post);
    if (anchor && o.post) g.translate(...this.world.get(anchor)!.toArray());
    const n = g.attributes.position.count;
    const c = new THREE.Color(color);
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      p.fromBufferAttribute(g.attributes.position, i);
      const w = weights(p);
      let total = 0;
      for (const [, v] of w) total += v;
      w.slice(0, 4).forEach(([b, v], k) => {
        si[i * 4 + k] = this.index.get(b)!;
        sw[i * 4 + k] = v / (total || 1);
      });
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    this.parts.push(g);
    return this;
  }

  /** Brilho (malha não-skinada filha do osso, material emissivo). */
  glow(bone: string, geo: THREE.BufferGeometry, color: THREE.Color, pos: [number, number, number]): this {
    this.glows.push({ bone, geometry: geo, color, pos: new THREE.Vector3(...pos) });
    return this;
  }

  build(): BuiltModel {
    const geometry = mergeGeometries(this.parts, false)!;
    geometry.setAttribute('aSmoothNormal', smoothNormals(geometry));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const height = geometry.boundingBox!.max.y;
    for (const p of this.parts) p.dispose();
    return { geometry, bones: this.bones, glows: this.glows, height };
  }
}

/** Normais médias por posição (para o contorno não abrir nas quinas das peças). */
function smoothNormals(g: THREE.BufferGeometry): THREE.BufferAttribute {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const acc = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const v = acc.get(k) ?? acc.set(k, new THREE.Vector3()).get(k)!;
    v.x += nor.getX(i);
    v.y += nor.getY(i);
    v.z += nor.getZ(i);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = acc.get(key(i))!;
    const l = v.length() || 1;
    out[i * 3] = v.x / l;
    out[i * 3 + 1] = v.y / l;
    out[i * 3 + 2] = v.z / l;
  }
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Cria uma instância nova de ossos + esqueleto para a geometria compartilhada.
 * Com descanso identidade (padrão), as inversas derivadas são as de sempre;
 * com `rest` rotacionado (GLB Mixamo), compõe o mundo completo.
 * `inverses` do arquivo têm precedência (bind exato do modelo).
 */
export function instantiateSkeleton(
  bones: BoneDef[],
  inverses?: THREE.Matrix4[],
): { root: THREE.Bone; bones: THREE.Bone[]; skeleton: THREE.Skeleton; byName: Map<string, THREE.Bone> } {
  const byName = new Map<string, THREE.Bone>();
  const list: THREE.Bone[] = [];
  const inv: THREE.Matrix4[] = [];
  const world = new Map<string, THREE.Vector3>();
  const worldQ = new Map<string, THREE.Quaternion>();
  let root: THREE.Bone | undefined;
  const IDENT = new THREE.Quaternion();
  for (const d of bones) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.set(...d.pos);
    const rq = d.rest ? new THREE.Quaternion(...d.rest) : IDENT.clone();
    b.quaternion.copy(rq);
    const w = new THREE.Vector3(...d.pos);
    let wq = rq.clone();
    if (d.parent) {
      byName.get(d.parent)!.add(b);
      // posição relativa vive no espaço do pai (com a rotação de descanso dele)
      w.copy(world.get(d.parent)!).add(new THREE.Vector3(...d.pos).applyQuaternion(worldQ.get(d.parent)!));
      wq = worldQ.get(d.parent)!.clone().multiply(rq);
    } else root = b;
    world.set(d.name, w);
    worldQ.set(d.name, wq);
    byName.set(d.name, b);
    list.push(b);
    inv.push(inverses?.[list.length - 1]?.clone() ?? new THREE.Matrix4().compose(w, wq, new THREE.Vector3(1, 1, 1)).invert());
  }
  return { root: root!, bones: list, skeleton: new THREE.Skeleton(list, inv), byName };
}

// ---------- primitivas úteis ----------
export const G = {
  sphere: (r: number, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  /** Esfera parcial (capacete, cabelo). thetaLen em graus a partir do topo. */
  cap: (r: number, thetaLenDeg: number, w = 16, h = 8, phiStart = 0, phiLen = 360) =>
    new THREE.SphereGeometry(r, w, h, phiStart * D2R, phiLen * D2R, 0, thetaLenDeg * D2R),
  capsule: (r: number, len: number, seg = 8) => new THREE.CapsuleGeometry(r, len, 3, seg),
  box: (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z),
  cyl: (rt: number, rb: number, h: number, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  cone: (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg),
  torus: (r: number, tube: number, seg = 12, arc = 360) => new THREE.TorusGeometry(r, tube, 5, seg, arc * D2R),
  /** Sólido de revolução (saia, túnica, manto) a partir de um perfil [raio, altura]. */
  lathe: (profile: [number, number][], seg = 14, phiStart = 0, phiLen = 360) =>
    new THREE.LatheGeometry(
      // de baixo para cima = normais para fora
      [...profile].sort((a, b) => a[1] - b[1]).map(([r, y]) => new THREE.Vector2(r, y)),
      seg,
      phiStart * D2R,
      phiLen * D2R,
    ),
};
