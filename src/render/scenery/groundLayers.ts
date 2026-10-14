import * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { boxBlur, noise } from './groundMath';
import { VISUAL_CONFIG } from '../../config/visualConfig';

/** Pixels por tile nas máscaras. Borradas, não precisam da resolução da textura (e assim a montagem fica leve). */
export const RES = 4;
/** Amostras de ruído por tile (o campo é interpolado nos pixels, sem custo por pixel). */
export const SUB = 2;

/**
 * Ondulação e reflexo da água das camadas (rio, lago, poças). Os uniformes são compartilhados e o relógio é um só:
 * `definirDetalheAgua` liga ou desliga tudo (preset baixo: água lisa, como antes).
 */
const aguaUniforms = {
  uAguaTempo: { value: 0 },
  uAguaDetalhe: { value: 1 },
  uAguaEscala: { value: VISUAL_CONFIG.agua.escala },
  uAguaVelocidade: { value: VISUAL_CONFIG.agua.velocidade },
  uAguaOnda: { value: VISUAL_CONFIG.agua.ondulacao },
  uAguaReflexo: { value: VISUAL_CONFIG.agua.reflexo },
  uAguaBrilho: { value: VISUAL_CONFIG.agua.brilho },
  uAguaCeu: { value: new THREE.Color(VISUAL_CONFIG.agua.corCeu) },
};

export function definirDetalheAgua(ligado: boolean): void {
  aguaUniforms.uAguaDetalhe.value = ligado ? 1 : 0;
}

/** Acrescenta ao Lambert da água: a normal inclina com um ruído que escorre, e o céu reflete nas bordas de visão. */
function aplicarAgua(sh: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(sh.uniforms, aguaUniforms);
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <common>',
      `#include <common>
uniform float uAguaTempo, uAguaDetalhe, uAguaEscala, uAguaVelocidade, uAguaOnda, uAguaReflexo, uAguaBrilho;
uniform vec3 uAguaCeu;
float hashAgua(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ruidoAgua(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashAgua(i), hashAgua(i + vec2(1.0, 0.0)), f.x), mix(hashAgua(i + vec2(0.0, 1.0)), hashAgua(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
    )
    .replace(
      '#include <normal_fragment_begin>',
      `float aguaCrista = 0.0;
#include <normal_fragment_begin>
{
  // ondulação discreta: um ruído que escorre inclina a normal; a inclinação entra na luz e no reflexo
  vec2 pa = vMapUv * uAguaEscala + vec2(uAguaTempo * uAguaVelocidade, uAguaTempo * uAguaVelocidade * 0.7);
  float e = 0.05;
  float h0 = ruidoAgua(pa);
  float hx = ruidoAgua(pa + vec2(e, 0.0));
  float hz = ruidoAgua(pa + vec2(0.0, e));
  vec2 inclina = vec2(h0 - hx, h0 - hz) / e * uAguaOnda * uAguaDetalhe;
  vec3 eixoX = (viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz;
  vec3 eixoZ = (viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz;
  normal = normalize(normal + inclina.x * eixoX + inclina.y * eixoZ);
  aguaCrista = pow(h0, 6.0) * uAguaDetalhe;
}`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
{
  // reflexo do céu nas bordas de visão (fresnel suave) e brilho nas cristas: pequenos, para não estourar
  float fresnel = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
  totalEmissiveRadiance += uAguaCeu * (fresnel * uAguaReflexo + aguaCrista * uAguaBrilho);
}`,
    );
}

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
  /** Não recebe luz: lava e brilhos mantêm a cor na noite. */
  unlit?: boolean;
  /** Mistura aditiva: brilho somado ao que está embaixo (névoa, brasas). */
  additive?: boolean;
}

/**
 * Pincel das máscaras: pinta branco (1) sobre o fundo preto da grade. Só o que as camadas usam (retângulo, disco e
 * traço de linha com pontas redondas). Não usa canvas: a máscara é calculada em memória, sem textura pintada na hora.
 */
export class Pincel {
  lineWidth = 1;
  lineJoin = 'round';
  lineCap = 'round';
  private subcaminhos: { x: number; y: number }[][] = [];
  private arcos: [number, number, number][] = [];

  constructor(private readonly v: Float32Array, private readonly cw: number, private readonly ch: number) {}

  fillRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.floor(x));
    const x1 = Math.min(this.cw, Math.ceil(x + w));
    const y0 = Math.max(0, Math.floor(y));
    const y1 = Math.min(this.ch, Math.ceil(y + h));
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) this.pinta(py * this.cw + px, 1);
  }

  beginPath(): void {
    this.subcaminhos = [];
    this.arcos = [];
  }

  /** Só círculos inteiros (as máscaras não usam arcos parciais). */
  arc(cx: number, cy: number, r: number, _inicio = 0, _fim = Math.PI * 2): void {
    this.arcos.push([cx, cy, r]);
  }

  fill(): void {
    for (const [cx, cy, r] of this.arcos) {
      const x0 = Math.max(0, Math.floor(cx - r - 1));
      const x1 = Math.min(this.cw - 1, Math.ceil(cx + r + 1));
      const y0 = Math.max(0, Math.floor(cy - r - 1));
      const y1 = Math.min(this.ch - 1, Math.ceil(cy + r + 1));
      for (let py = y0; py <= y1; py++)
        for (let px = x0; px <= x1; px++) {
          const dx = px + 0.5 - cx;
          const dy = py + 0.5 - cy;
          this.pinta(py * this.cw + px, Math.min(1, Math.max(0, r - Math.sqrt(dx * dx + dy * dy) + 0.5)));
        }
    }
  }

  moveTo(x: number, y: number): void {
    this.subcaminhos.push([{ x, y }]);
  }

  lineTo(x: number, y: number): void {
    const atual = this.subcaminhos[this.subcaminhos.length - 1];
    if (atual) atual.push({ x, y });
    else this.subcaminhos.push([{ x, y }]);
  }

  stroke(): void {
    const r = this.lineWidth / 2;
    for (const s of this.subcaminhos) for (let i = 0; i + 1 < s.length; i++) this.traco(s[i], s[i + 1], r);
  }

  /** Cápsula: pixels a até `r` do segmento a-b, com borda suave de 1 px (como o antisserrilhado do canvas). */
  private traco(a: { x: number; y: number }, b: { x: number; y: number }, r: number): void {
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - 1));
    const x1 = Math.min(this.cw - 1, Math.ceil(Math.max(a.x, b.x) + r + 1));
    const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r - 1));
    const y1 = Math.min(this.ch - 1, Math.ceil(Math.max(a.y, b.y) + r + 1));
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const l2 = Math.max(vx * vx + vy * vy, 1e-9);
    for (let py = y0; py <= y1; py++)
      for (let px = x0; px <= x1; px++) {
        const qx = px + 0.5;
        const qy = py + 0.5;
        const t = Math.min(1, Math.max(0, ((qx - a.x) * vx + (qy - a.y) * vy) / l2));
        const ex = a.x + vx * t - qx;
        const ey = a.y + vy * t - qy;
        this.pinta(py * this.cw + px, Math.min(1, Math.max(0, r - Math.sqrt(ex * ex + ey * ey) + 0.5)));
      }
  }

  /** Mistura a cobertura `c` (0..1) de branco sobre o valor que já está no pixel (como o "por cima" do canvas). */
  private pinta(i: number, c: number): void {
    if (c <= 0) return;
    const v = this.v[i];
    this.v[i] = v + c * (1 - v);
  }
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
  rect: (c: Pincel, x: number, y: number) => void;
  disc: (c: Pincel, x: number, y: number, r: number) => void;
  /** Máscara com as formas pintadas, sem desfoque (0 ou 1 por pixel). */
  raster: (draw: (c: Pincel) => void) => Float32Array;
  blurred: (draw: (c: Pincel) => void, blurTiles: number) => Float32Array;
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

  const rect = (c: Pincel, x: number, y: number) => c.fillRect((x + margin) * RES, (y + margin) * RES, RES, RES);
  const disc = (c: Pincel, x: number, y: number, r: number) => {
    c.beginPath();
    c.arc((x + margin + 0.5) * RES, (y + margin + 0.5) * RES, r * RES, 0, Math.PI * 2);
    c.fill();
  };
  /** Formas pintadas de branco sobre preto, sem desfoque (ver `Pincel`). */
  const raster = (draw: (c: Pincel) => void): Float32Array => {
    const v = new Float32Array(N);
    draw(new Pincel(v, CW, CH));
    return v;
  };
  /**
   * Valor de cada pixel depois de desfocar as formas (`draw` pinta de branco sobre preto). `blurTiles` é o
   * desfoque em tiles. O contorno de cada máscara sai daqui: a borda de uma forma fica sempre em 0,5.
   */
  const blurred = (draw: (c: Pincel) => void, blurTiles: number): Float32Array => {
    const v = raster(draw);
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

  /**
   * Camada transparente só onde há tinta. Cada tile (RES x RES texels da máscara) com alfa > 0 vira um quadrado, e os
   * tiles vizinhos entram junto (a amostragem bilinear da máscara não pode cortar a borda). Tile vazio não é desenhado:
   * a imagem sai igual, sem preencher o mapa inteiro com planos quase transparentes (antes eram 10 camadas de planos
   * do tamanho do mapa, e cada pixel era misturado 10 vezes). UV e normal seguem o mapeamento do plano original
   * (u = (x + TW/2) / TW, v = (TH/2 - z) / TH), então textura e luz não mudam.
   */
  const geometriaComTinta = (vals: Uint8ClampedArray): THREE.BufferGeometry => {
    const com = new Uint8Array(TW * TH);
    for (let py = 0; py < CH; py++) for (let px = 0; px < CW; px++) if (vals[py * CW + px] > 0) com[Math.floor(py / RES) * TW + Math.floor(px / RES)] = 1;
    const marca = new Uint8Array(TW * TH);
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (!com[ty * TW + tx]) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x >= 0 && y >= 0 && x < TW && y < TH) marca[y * TW + x] = 1;
      }
    }
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let ty = 0; ty < TH; ty++) for (let tx = 0; tx < TW; tx++) {
      if (!marca[ty * TW + tx]) continue;
      // a máscara é gravada de cima para baixo: o tile ocupa u em [tx/TW, (tx+1)/TW] e v em [(TH-ty-1)/TH, (TH-ty)/TH]
      const u0 = tx / TW, u1 = (tx + 1) / TW, v0 = (TH - ty - 1) / TH, v1 = (TH - ty) / TH;
      const base = pos.length / 3;
      for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) {
        pos.push(u * TW - TW / 2, 0, TH / 2 - v * TH);
        nor.push(0, 1, 0);
        uv.push(u, v);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  };

  const group = new THREE.Group();
  const water: { map: THREE.Texture; vx: number; vy: number }[] = [];
  /** Plano de chão cobrindo a área inteira; a textura repete a cada `tiles` tiles. As camadas transparentes só desenham onde há tinta. */
  const layer = (o: GroundLayer): void => {
    // máscara zerada não desenha nada: a camada nem entra na cena (as camadas de água e de margem são assim)
    if (!o.opaque && o.alpha.every((v) => v === 0)) return;
    if (o.map && o.tiles) o.map.repeat.set(TW / o.tiles, TH / o.tiles);
    if (o.map && o.flow) water.push({ map: o.map, vx: o.flow[0], vy: o.flow[1] });
    const alphaMap = maskTexture(o.alpha);
    const params = {
      // camada só de cor (sem textura): o material não recebe `map`, para não avisar `map = undefined`
      ...(o.map ? { map: o.map } : {}),
      color: o.color ?? 0xffffff,
      opacity: o.opacity ?? 1,
      alphaMap,
      transparent: !o.opaque,
      alphaTest: o.opaque ? 0.5 : 0,
      depthWrite: !!o.opaque,
      polygonOffset: !o.opaque,
      polygonOffsetFactor: -o.order,
      polygonOffsetUnits: -o.order,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    };
    const mat = o.unlit ? new THREE.MeshBasicMaterial(params) : new THREE.MeshLambertMaterial(params);
    // água (camada com fluxo): só esta camada recebe a ondulação; as demais continuam como estavam
    if (o.flow && !o.unlit) {
      mat.onBeforeCompile = aplicarAgua;
      mat.customProgramCacheKey = () => 'vg-agua-camada';
    }
    const geo = o.opaque ? new THREE.PlaneGeometry(TW, TH).rotateX(-Math.PI / 2) : geometriaComTinta(o.alpha);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = o.y;
    m.renderOrder = o.order;
    m.receiveShadow = true;
    group.add(m);
  };
  const update = (dt: number) => {
    aguaUniforms.uAguaTempo.value += dt;
    for (const w of water) {
      w.map.offset.x = (w.map.offset.x + w.vx * dt) % 1;
      w.map.offset.y = (w.map.offset.y + w.vy * dt) % 1;
    }
  };

  return { TW, TH, CW, CH, N, voids, voidPix, field, sample, rect, disc, raster, blurred, layer, group, update };
}
