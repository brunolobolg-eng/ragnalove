import * as THREE from 'three';
import { Bezier, ConstantColor, ConstantValue, Gradient, IntervalValue, PiecewiseBezier, Vector3 as QV3, Vector4 as QV4, type BurstParameters } from 'three.quarks';
import { softCircle } from '../../../textures';
import { decalTexture, impactTexture, ribbonTexture, smokeAtlas, sparkTexture } from '../../kit/vfxTextures';
import type { VfxBuildKit } from '../VFXManager';

/** Atalhos para montar efeitos do Quarks de forma legível (só visual). */
export const v4 = (r: number, g: number, b: number, a = 1) => new QV4(r, g, b, a);
export const v3 = (x: number, y: number, z: number) => new QV3(x, y, z);
/** Cor inicial fixa (valores acima de 1 acendem o bloom). */
export const col = (r: number, g: number, b: number, a = 1) => new ConstantColor(v4(r, g, b, a));
/** Cor ao longo da vida: de `a` (nascimento) até `b` (morte), canal alfa incluso. */
export const fade = (a: QV4, b: QV4) => new Gradient([[new QV3(a.x, a.y, a.z), 0], [new QV3(b.x, b.y, b.z), 1]], [[a.w, 0], [b.w, 1]]);
export const iv = (a: number, b: number) => new IntervalValue(a, b);
export const cv = (n: number) => new ConstantValue(n);
/** Curva 0→1 do tempo de vida com 4 pontos de controle (Bezier cúbica). */
export const curve = (a: number, b: number, c: number, d: number) => new PiecewiseBezier([[new Bezier(a, b, c, d), 0]]);
/** Rajada única no instante `time`. */
export const burst = (count: number, time = 0): BurstParameters => ({ time, count: cv(count), cycle: 1, interval: 0.01, probability: 1 });
export const GRAVITY = v3(0, -1, 0);
export const UPWARD = v3(0, 1, 0);

/** Os emissores do Quarks saem em +Z; isto aponta o emissor para cima (+Y). */
export function upright<T extends THREE.Object3D>(o: T): T {
  o.rotation.x = -Math.PI / 2;
  return o;
}

/** Materiais compartilhados entre todos os efeitos (mesmo material = mesmo lote de desenho). */
export function additive(k: VfxBuildKit, tex: 'spark' | 'soft' | 'ribbon' | 'ring' | 'glow'): THREE.MeshBasicMaterial {
  return k.material('add-' + tex, () => {
    const map = tex === 'spark' ? sparkTexture() : tex === 'soft' ? softCircle() : tex === 'ribbon' ? ribbonTexture() : decalTexture(tex);
    return new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  });
}

/** Estrela de impacto anime (mistura normal: cor chapada, sem estourar no bloom). */
export function impact(k: VfxBuildKit): THREE.MeshBasicMaterial {
  return k.material('cel-impact', () => new THREE.MeshBasicMaterial({ map: impactTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
}

/** Fumaça/poeira (mistura normal, atlas 4×4 de fumaça). */
export function dust(k: VfxBuildKit): THREE.MeshBasicMaterial {
  return k.material('dust', () => new THREE.MeshBasicMaterial({ map: smokeAtlas(), transparent: true, depthWrite: false }));
}

/** Lascas sólidas iluminadas pela cena (madeira, pedra, osso). */
export function chips(k: VfxBuildKit, key: string, color: number): THREE.MeshStandardMaterial {
  return k.material('chip-' + key, () => new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, flatShading: true }));
}

const geos = new Map<string, THREE.BufferGeometry>();
/** Geometrias das lascas (uma por tipo, compartilhadas). */
export function chipGeometry(kind: 'shard' | 'splinter' | 'rock'): THREE.BufferGeometry {
  let g = geos.get(kind);
  if (!g) {
    g = kind === 'shard' ? new THREE.TetrahedronGeometry(0.5) : kind === 'splinter' ? new THREE.BoxGeometry(0.22, 0.22, 1) : new THREE.IcosahedronGeometry(0.5, 0);
    geos.set(kind, g);
  }
  return g;
}
