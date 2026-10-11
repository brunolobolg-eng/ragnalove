import * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { boxBlur, noise } from './groundMath';

/** Pixels por tile nas máscaras. Borradas, não precisam da resolução da textura (e assim a montagem fica leve). */
export const RES = 4;
/** Amostras de ruído por tile (o campo é interpolado nos pixels, sem custo por pixel). */
export const SUB = 2;

/** Uma camada do chão: textura que repete a cada `tiles` tiles, com máscara (alfa) que diz onde ela aparece. */
export interface GroundLayer {
  map?: THREE.Texture;
  tiles?: number;
  alpha: Uint8ClampedArray;
  color?: number;
  opacity?: number;
  y: number;
  order: number;
  opaque?: boolean;
  /** Água: a textura desliza nesta direção (tiles por segundo). */
  flow?: readonly [number, number];
}

/** Ferramentas da grade de máscaras (um pixel = 1/RES de tile, com margem em volta da grade). */
export interface GroundLayers {
  TW: number;
  TH: number;
  CW: number;
  CH: number;
  N: number;
  /** Tiles de vazio (água), já com a margem. */
  voids: Uint8Array;
  /** Flag de vazio por pixel. */
  voidPix: Uint8Array;
  field: (seed: number, scale: number, sub?: number) => (x: number, y: number) => number;
  sample: (f: (x: number, y: number) => number) => Float32Array;
  rect: (c: CanvasRenderingContext2D, x: number, y: number) => void;
  disc: (c: CanvasRenderingContext2D, x: number, y: number, r: number) => void;
  blurred: (draw: (c: CanvasRenderingContext2D) => void, blurTiles: number) => Float32Array;
  layer: (o: GroundLayer) => void;
  group: THREE.Group;
  update: (dt: number) => void;
}

/**
 * Base dos chãos em camadas: a grade de máscaras (com margem), os campos de ruído, o desfoque e a pilha de
 * camadas. Cada camada é um plano com uma textura do dono e uma máscara suave (alphaMap) que diz onde aparece.
 */
export function groundLayers(zone: ParsedZone, margin: number): GroundLayers {
  const TW = zone.width + 2 * margin;
  const TH = zone.height + 2 * margin;
  const CW = TW * RES;
  const CH = TH * RES;
  const N = CW * CH;
  const voids = new Uint8Array(TW * TH);
  for (const v of zone.voids) voids[(v.y + margin) * TW + v.x + margin] = 1;
  const tileAt = (px: number, py: number): number => Math.floor(py / RES) * TW + Math.floor(px / RES);
  // coordenadas de grade por pixel e a flag de vazio por pixel, calculadas uma vez
  const gxs = new Float32Array(CW);
  for (let px = 0; px < CW; px++) gxs[px] = px / RES - margin;
  const gys = new Float32Array(CH);
  for (let py = 0; py < CH; py++) gys[py] = py / RES - margin;
  const voidPix = new Uint8Array(N);
  for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) voidPix[py * CW + px] = voids[tileAt(px, py)];

  /**
   * Campo de ruído amostrado a cada 1/`sub` de tile e interpolado: barato de consultar em cada pixel. Campos de
   * baixa frequência (manchas grandes) podem usar `sub` = 1, que custa quatro vezes menos.
   */
  const field = (seed: number, scale: number, sub = SUB): ((x: number, y: number) => number) => {
    const w = TW * sub + 1;
    const h = TH * sub + 1;
    const g = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = noise((i / sub - margin) * scale, (j / sub - margin) * scale, seed);
    return (x: number, y: number): number => {
      const fx = Math.min(w - 1.001, Math.max(0, (x + margin) * sub));
      const fy = Math.min(h - 1.001, Math.max(0, (y + margin) * sub));
      const i = Math.floor(fx);
      const j = Math.floor(fy);
      const tx = fx - i;
      const ty = fy - j;
      const top = g[j * w + i] + (g[j * w + i + 1] - g[j * w + i]) * tx;
      const bot = g[(j + 1) * w + i] + (g[(j + 1) * w + i + 1] - g[(j + 1) * w + i]) * tx;
      return top + (bot - top) * ty;
    };
  };
  /** Valor do campo em cada pixel, como uma tabela (uma passada). */
  const sample = (f: (x: number, y: number) => number): Float32Array => {
    const a = new Float32Array(N);
    for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) a[py * CW + px] = f(gxs[px], gys[py]);
    return a;
  };

  const rect = (c: CanvasRenderingContext2D, x: number, y: number) => c.fillRect((x + margin) * RES, (y + margin) * RES, RES, RES);
  const disc = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => {
    c.beginPath();
    c.arc((x + margin + 0.5) * RES, (y + margin + 0.5) * RES, r * RES, 0, Math.PI * 2);
    c.fill();
  };
  /**
   * Valor de cada pixel depois de desfocar as formas (`draw` pinta de branco sobre preto). `blurTiles` é o
   * desfoque em tiles. O contorno de cada máscara sai daqui: a borda de uma forma fica sempre em 0,5.
   */
  const blurred = (draw: (c: CanvasRenderingContext2D) => void, blurTiles: number): Float32Array => {
    const src = document.createElement('canvas');
    src.width = CW;
    src.height = CH;
    const sc = src.getContext('2d')!;
    sc.fillStyle = '#000';
    sc.fillRect(0, 0, CW, CH);
    sc.fillStyle = '#fff';
    sc.strokeStyle = '#fff';
    draw(sc);
    const d = sc.getImageData(0, 0, CW, CH).data;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = d[i * 4] / 255;
    const r = Math.max(1, Math.round(blurTiles * RES * 1.1));
    const tmp = new Float32Array(N);
    boxBlur(v, tmp, CW, CH, r);
    boxBlur(tmp, v, CW, CH, r, true);
    return v;
  };
  /**
   * Máscara como textura de dados (canal verde = visibilidade). A linha de cima (norte) vai para o fim dos dados,
   * porque a textura de dados começa embaixo (sul), ao contrário do canvas.
   */
  const maskTexture = (vals: Uint8ClampedArray): THREE.DataTexture => {
    const data = new Uint8Array(N * 4);
    for (let py = 0; py < CH; py++) {
      const row = (CH - 1 - py) * CW;
      for (let px = 0; px < CW; px++) {
        const v = vals[py * CW + px];
        const d = (row + px) * 4;
        data[d] = data[d + 1] = data[d + 2] = v;
        data[d + 3] = 255;
      }
    }
    const t = new THREE.DataTexture(data, CW, CH, THREE.RGBAFormat);
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };

  const group = new THREE.Group();
  const water: { map: THREE.Texture; vx: number; vy: number }[] = [];
  /** Plano de chão cobrindo a área inteira; a textura repete a cada `tiles` tiles. */
  const layer = (o: GroundLayer): void => {
    // máscara zerada não desenha nada: a camada nem entra na cena (as camadas de água e de margem são assim)
    if (!o.opaque && o.alpha.every((v) => v === 0)) return;
    if (o.map && o.tiles) o.map.repeat.set(TW / o.tiles, TH / o.tiles);
    if (o.map && o.flow) water.push({ map: o.map, vx: o.flow[0], vy: o.flow[1] });
    const alphaMap = maskTexture(o.alpha);
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
    group.add(m);
  };
  const update = (dt: number) => {
    for (const w of water) {
      w.map.offset.x = (w.map.offset.x + w.vx * dt) % 1;
      w.map.offset.y = (w.map.offset.y + w.vy * dt) % 1;
    }
  };

  return { TW, TH, CW, CH, N, voids, voidPix, field, sample, rect, disc, blurred, layer, group, update };
}
