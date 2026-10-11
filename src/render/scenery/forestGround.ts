import * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import type { Vec2 } from '../../core/grid/types';
import { POND_VISUAL } from '../../config/visualConfig';
import { PACK, loadTexture, packInstances, packMatrix } from './packKit';

/**
 * Chão da floresta em camadas, com lago e poças. Cada camada é um plano com uma textura da folha do dono e uma
 * máscara suave (alphaMap) que diz onde ela aparece. A textura fica nítida de perto; as máscaras são de baixa
 * resolução e borradas, então o contorno sai suave. O lago tem margem de terra molhada, parte rasa, parte funda
 * e contorno irregular. Só apresentação: a grade e a simulação não mudam.
 */

/** Pasta das texturas de chão recortadas da folha de texturas do dono. */
const FLOOR_DIR = 'textures/floresta/';
/** Pixels por tile nas máscaras. Borradas, não precisam da resolução da textura (e assim a montagem fica leve). */
const RES = 4;
/** Amostras de ruído por tile (o campo é interpolado nos pixels, sem custo por pixel). */
const SUB = 2;
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
 * Desfoque de caixa (média móvel) de raio `r`, em linhas ou em colunas. As bordas repetem o pixel da borda.
 * Duas passadas (linhas e depois colunas) dão um desfoque suave, bem mais leve que o filtro do canvas.
 */
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, vertical = false): void {
  const n = vertical ? h : w;
  const lines = vertical ? w : h;
  const step = vertical ? w : 1;
  const lineStep = vertical ? 1 : w;
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(n - 1, Math.max(0, k)) * step];
    for (let k = 0; k < n; k++) {
      dst[base + k * step] = acc * inv;
      acc += src[base + Math.min(n - 1, k + r + 1) * step] - src[base + Math.max(0, k - r) * step];
    }
  }
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

export interface ForestGround {
  group: THREE.Group;
  /** Anima a água: as ondas deslizam devagar sobre a textura. */
  update(dt: number): void;
}

/**
 * Monta o chão da floresta (com lago e poças) para a grade `zone`. `margin` = tiles de chão além da grade.
 */
export function packForestGround(zone: ParsedZone, margin: number): ForestGround {
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

  /** Campo de ruído amostrado a cada 1/SUB de tile e interpolado: barato de consultar em cada pixel. */
  const field = (seed: number, scale: number): ((x: number, y: number) => number) => {
    const w = TW * SUB + 1;
    const h = TH * SUB + 1;
    const g = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g[j * w + i] = noise((i / SUB - margin) * scale, (j / SUB - margin) * scale, seed);
    return (x: number, y: number): number => {
      const fx = Math.min(w - 1.001, Math.max(0, (x + margin) * SUB));
      const fy = Math.min(h - 1.001, Math.max(0, (y + margin) * SUB));
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

  // ---- formas e ruído de cada máscara (desfoques e tabelas, uma vez) ----
  const voidV = blurred((c) => {
    for (const p of zone.voids) rect(c, p.x, p.y);
  }, 0.8);
  const puddleV = blurred((c) => {
    for (const f of zone.floor) if (f.ground === 'puddle') disc(c, f.x, f.y, 0.55);
  }, 0.3);
  const puddleWaterV = blurred((c) => {
    for (const f of zone.floor) if (f.ground === 'puddle') disc(c, f.x, f.y, 0.4);
  }, 0.3);
  const shadeProps = zone.props.filter((p) => SHADE_KINDS.has(p.kind));
  const shadeV = blurred((c) => {
    for (const p of shadeProps) disc(c, p.x, p.y, 1.2);
    for (const f of zone.fog) rect(c, f.x, f.y);
  }, 0.6);
  const routes = trailRoutes(zone);
  const trailV = blurred((c) => {
    c.lineWidth = 1.3 * RES;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const r of routes) {
      c.beginPath();
      r.forEach((p, i) => {
        const px = (p.x + margin + 0.5) * RES;
        const py = (p.y + margin + 0.5) * RES;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.stroke();
    }
    for (const s of zone.slow) rect(c, s.x, s.y);
  }, 0.4);
  const cobbleV = blurred((c) => {
    for (const f of zone.floor) if (f.plaza || f.ground === 'gate') rect(c, f.x, f.y);
  }, 0.2);
  const lakeN = sample(field(21, 0.9));
  const puddleN = sample(field(13, 2));
  const shadeN = sample(field(5, 0.7));
  const trailN = sample(field(9, 1.1));
  const cobbleN = sample(field(4, 1.6));
  const patchN = sample(field(11, 0.16));

  // ---- máscaras: uma só passada por pixel calcula todas. Lago, grama, leito, margem e as duas faixas de água
  // usam o mesmo valor `t`, por isso o contorno de um casa com o do outro ----
  const lake = new Uint8ClampedArray(N);
  const grassHole = new Uint8ClampedArray(N);
  const rim = new Uint8ClampedArray(N);
  const deep = new Uint8ClampedArray(N);
  const bank = new Uint8ClampedArray(N);
  const puddles = new Uint8ClampedArray(N);
  const puddleWater = new Uint8ClampedArray(N);
  const shade = new Uint8ClampedArray(N);
  const trail = new Uint8ClampedArray(N);
  const cobble = new Uint8ClampedArray(N);
  const patches = new Uint8ClampedArray(N);
  for (let p = 0; p < N; p++) {
    const isVoid = voidPix[p] === 1;
    const t = voidV[p] + (lakeN[p] - 0.5) * 0.7;
    const lk = smooth(0.42, 0.58, t);
    lake[p] = 255 * lk;
    grassHole[p] = 255 * (1 - lk);
    rim[p] = 255 * lk * (1 - smooth(0.8, 0.92, t));
    deep[p] = 255 * smooth(0.8, 0.92, t);
    bank[p] = 255 * smooth(0.1, 0.3, voidV[p]) * (1 - lk);
    const pj = (puddleN[p] - 0.5) * 0.7;
    puddles[p] = isVoid ? 0 : 255 * smooth(0.3, 0.6, puddleV[p] + pj);
    puddleWater[p] = isVoid ? 0 : 255 * smooth(0.45, 0.7, puddleWaterV[p] + pj);
    shade[p] = isVoid ? 0 : 255 * smooth(0.2, 0.5, shadeV[p] * (0.8 + 0.4 * shadeN[p]));
    trail[p] = isVoid ? 0 : 255 * smooth(0.3, 0.62, trailV[p] + (trailN[p] - 0.5) * 0.7);
    cobble[p] = isVoid ? 0 : 255 * smooth(0.4, 0.6, cobbleV[p] + (cobbleN[p] - 0.5) * 0.5);
    patches[p] = isVoid ? 0 : 255 * smooth(0.5, 0.64, patchN[p]);
  }

  const group = new THREE.Group();
  const water: { map: THREE.Texture; vx: number; vy: number }[] = [];
  /** Plano de chão cobrindo a área inteira; a textura repete a cada `tiles` tiles. */
  const layer = (o: {
    map?: THREE.Texture;
    tiles?: number;
    alpha: Uint8ClampedArray;
    color?: number;
    opacity?: number;
    y: number;
    order: number;
    opaque?: boolean;
    flow?: readonly [number, number];
  }): void => {
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
  const tex = (name: string) => loadTexture(`${FLOOR_DIR}${name}.webp`, false);
  const P = POND_VISUAL;

  layer({ map: tex('grama_a'), tiles: 3, alpha: grassHole, opaque: true, y: -0.03, order: 0 });
  layer({ map: tex('grama_b'), tiles: 3, alpha: patches, y: -0.025, order: 1 });
  layer({ map: tex('grama_a'), tiles: 3, color: 0x3d4f3a, opacity: 0.85, alpha: shade, y: -0.02, order: 2 });
  layer({ map: tex('terra'), tiles: 2, alpha: trail, y: -0.015, order: 3 });
  layer({ map: tex('pedra'), tiles: 2, alpha: cobble, y: -0.012, order: 4 });
  layer({ map: tex('terra'), tiles: 2, color: P.bankColor, alpha: bank, y: -0.011, order: 5 });
  layer({ map: tex('terra'), tiles: 2, color: P.mudColor, alpha: puddles, y: -0.0105, order: 6 });
  layer({ map: tex('terra'), tiles: 2, color: P.bedColor, alpha: lake, y: -0.01, order: 7 });
  layer({ map: tex('agua_rasa'), tiles: P.waterTiles, color: P.rimColor, opacity: P.rimOpacity, alpha: rim, y: -0.009, order: 8, flow: P.flowRim });
  layer({ map: tex('agua_funda'), tiles: P.waterTiles, color: P.deepColor, opacity: P.deepOpacity, alpha: deep, y: -0.008, order: 9, flow: P.flowDeep });
  layer({ map: tex('agua_funda'), tiles: P.waterTiles, color: P.deepColor, opacity: P.deepOpacity, alpha: puddleWater, y: -0.0085, order: 9, flow: P.flowDeep });

  // ---- margem do lago: pedras e arbustos do kit nas bordas (só visual; o tile continua livre) ----
  const isVoid = (x: number, y: number): boolean =>
    x + margin >= 0 && y + margin >= 0 && x + margin < TW && y + margin < TH && voids[(y + margin) * TW + x + margin] === 1;
  const shore: Record<string, THREE.Matrix4[]> = {};
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isVoid(x, y) || !(isVoid(x + 1, y) || isVoid(x - 1, y) || isVoid(x, y + 1) || isVoid(x, y - 1))) continue;
      const h = hash(x, y, 31);
      if (h > 0.42) continue;
      const rock = h < 0.3;
      const pick = hash(x, y, 37);
      const key = rock ? PACK.rocks[Math.floor(pick * PACK.rocks.length)] : PACK.bushes[Math.floor(pick * PACK.bushes.length)];
      const s = rock ? 0.5 + hash(x, y, 41) * 0.3 : 0.8 + hash(x, y, 41) * 0.3;
      const mx = x - zone.width / 2 + 0.5 + (hash(x, y, 43) - 0.5) * 0.4;
      const mz = y - zone.height / 2 + 0.5 + (hash(x, y, 47) - 0.5) * 0.4;
      (shore[key] ??= []).push(packMatrix(mx, mz, s, hash(x, y, 53) * Math.PI * 2));
    }
  }
  // pedras da margem com o mesmo tom das outras pedras da floresta (senão saem brancas, como bolas)
  for (const [key, mats] of Object.entries(shore)) packInstances(group, key, mats, key.startsWith('Rock_') ? 0x8f958c : undefined);

  return {
    group,
    update: (dt: number) => {
      for (const w of water) {
        w.map.offset.x = (w.map.offset.x + w.vx * dt) % 1;
        w.map.offset.y = (w.map.offset.y + w.vy * dt) % 1;
      }
    },
  };
}
