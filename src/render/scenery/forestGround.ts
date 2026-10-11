import type * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { POND_VISUAL } from '../../config/visualConfig';
import { KIT, instanceKit, kitMatrix, loadTexture } from './naturKit';
import { RES, groundLayers } from './groundLayers';
import { hash, smooth, trailRoutes, type GroundHandle } from './groundMath';

/**
 * Chão da floresta em camadas, com lago e poças. Cada camada é um plano com uma textura da folha do dono e uma
 * máscara suave (alphaMap) que diz onde ela aparece. A textura fica nítida de perto; as máscaras são de baixa
 * resolução e borradas, então o contorno sai suave. O lago tem margem de terra molhada, parte rasa, parte funda
 * e contorno irregular. Só apresentação: a grade e a simulação não mudam.
 */

/** Pasta das texturas de chão recortadas da folha de texturas do dono. */
const FLOOR_DIR = 'textures/floresta/';
/** Tipos de peça que projetam sombra no chão (copas, rochas, troncos, ruínas, muros). */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall']);

/**
 * Monta o chão da floresta (com lago e poças) para a grade `zone`. `margin` = tiles de chão além da grade.
 */
export function forestGround(zone: ParsedZone, margin: number): GroundHandle {
  const g = groundLayers(zone, margin);
  const { TW, TH, N, voids, voidPix, field, sample, rect, disc, blurred, layer } = g;
  const shadeProps = zone.props.filter((p) => SHADE_KINDS.has(p.kind));

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
      const key = rock ? KIT.pedra[Math.floor(pick * KIT.pedra.length)] : KIT.arbusto[Math.floor(pick * KIT.arbusto.length)];
      const s = rock ? 0.5 + hash(x, y, 41) * 0.3 : 0.8 + hash(x, y, 41) * 0.3;
      const mx = x - zone.width / 2 + 0.5 + (hash(x, y, 43) - 0.5) * 0.4;
      const mz = y - zone.height / 2 + 0.5 + (hash(x, y, 47) - 0.5) * 0.4;
      (shore[key] ??= []).push(kitMatrix(mx, mz, s, hash(x, y, 53) * Math.PI * 2));
    }
  }
  for (const [key, mats] of Object.entries(shore)) instanceKit(g.group, key, mats);

  return { group: g.group, update: g.update };
}
