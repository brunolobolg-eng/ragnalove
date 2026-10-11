import type * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { POND_VISUAL } from '../../config/visualConfig';
import { KITS, tintHex } from './biomeKits';
import { KIT, instanceKit, kitMatrix, loadTexture } from './naturKit';
import { RES, groundLayers } from './groundLayers';
import { hash, smooth, trailRoutes, type GroundHandle } from './groundMath';

/**
 * Chão do deserto em camadas (Dunas Vermelhas, Ruínas Solares): areia plana das texturas do dono, dunas fora do
 * tabuleiro, ondulações, areia rachada, pedrinhas perto das pedras, areia avermelhada, trilha batida até o portão
 * e um oásis com margem úmida e água (o mesmo método do lago da floresta). Só apresentação: a grade não muda.
 */

const SAND_DIR = 'textures/deserto/';
/** Água do oásis: as mesmas texturas de água da floresta. */
const WATER_DIR = 'textures/floresta/';
/** Objetos que projetam sombra no chão do deserto. */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall', 'cactus', 'palm']);
/** Objetos de pedra: ao redor deles a areia ganha pedrinhas. */
const STONE_KINDS = new Set<string>(['rock', 'ruin', 'wall']);

/** Monta o chão do deserto para a grade `zone`. `margin` = tiles de chão além da grade. */
export function desertGround(zone: ParsedZone, margin: number): GroundHandle {
  const g = groundLayers(zone, margin);
  const { TW, TH, N, voids, voidPix, field, sample, rect, disc, blurred, layer } = g;
  const sand = (name: string) => loadTexture(`${SAND_DIR}${name}.webp`, false);
  const water = (name: string) => loadTexture(`${WATER_DIR}${name}.webp`, false);
  const P = POND_VISUAL;

  // ---- formas (uma vez) ----
  // dentro do tabuleiro vale 1 e fora dele 0: fora, dunas; dentro, areia plana com manchas
  const inside = blurred((c) => {
    for (let y = 0; y < zone.height; y++) for (let x = 0; x < zone.width; x++) rect(c, x, y);
  }, 1.5);
  const voidV = blurred((c) => {
    for (const p of zone.voids) rect(c, p.x, p.y);
  }, 0.8);
  const shadeProps = zone.props.filter((p) => SHADE_KINDS.has(p.kind));
  const shadeV = blurred((c) => {
    for (const p of shadeProps) disc(c, p.x, p.y, 1.2);
  }, 0.6);
  const stoneV = blurred((c) => {
    for (const p of zone.props) if (STONE_KINDS.has(p.kind)) disc(c, p.x, p.y, 2);
  }, 1.2);
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
  const plazaV = blurred((c) => {
    for (const f of zone.floor) if (f.plaza || f.ground === 'gate') rect(c, f.x, f.y);
  }, 0.2);

  // ---- campos de ruído (uma vez) ----
  // manchas grandes (escala até 1,1) usam uma amostra por tile; pedrinhas e plaza, que são mais miúdas, usam duas
  const duneN = sample(field(7, 0.25, 1));
  const rippleN = sample(field(15, 0.6, 1));
  const crackN = sample(field(17, 0.9, 1));
  const pebbleN = sample(field(23, 1.4));
  const redN = sample(field(29, 0.4, 1));
  const lakeN = sample(field(21, 0.9, 1));
  const shadeN = sample(field(5, 0.7, 1));
  const trailN = sample(field(9, 1.1, 1));
  const plazaN = sample(field(4, 1.6));

  // ---- máscaras: uma passada por pixel calcula todas ----
  const holes = new Uint8ClampedArray(N);
  const dunes = new Uint8ClampedArray(N);
  const ripples = new Uint8ClampedArray(N);
  const cracks = new Uint8ClampedArray(N);
  const pebbles = new Uint8ClampedArray(N);
  const reddish = new Uint8ClampedArray(N);
  const shade = new Uint8ClampedArray(N);
  const trail = new Uint8ClampedArray(N);
  const plaza = new Uint8ClampedArray(N);
  const bank = new Uint8ClampedArray(N);
  const rim = new Uint8ClampedArray(N);
  const deep = new Uint8ClampedArray(N);
  for (let p = 0; p < N; p++) {
    const isVoid = voidPix[p] === 1;
    // oásis: o mesmo contorno irregular do lago da floresta (buraco no chão, margem úmida, água rasa e funda)
    const t = voidV[p] + (lakeN[p] - 0.5) * 0.7;
    const lk = smooth(0.42, 0.58, t);
    holes[p] = 255 * (1 - lk);
    rim[p] = 255 * lk * (1 - smooth(0.8, 0.92, t));
    deep[p] = 255 * smooth(0.8, 0.92, t);
    bank[p] = 255 * smooth(0.1, 0.3, voidV[p]) * (1 - lk);
    // fora do tabuleiro: dunas com borda irregular; dentro: areia plana com ondulações, rachaduras e pedrinhas
    const out = smooth(0.3, 0.7, 1 - inside[p] + (duneN[p] - 0.5) * 0.7);
    dunes[p] = 255 * out;
    const inner = 1 - out;
    ripples[p] = isVoid ? 0 : 255 * inner * smooth(0.5, 0.65, rippleN[p]);
    cracks[p] = isVoid ? 0 : 255 * inner * smooth(0.68, 0.8, crackN[p]);
    pebbles[p] = isVoid ? 0 : 255 * smooth(0.25, 0.55, stoneV[p] * 0.8 + (pebbleN[p] - 0.5) * 0.6 + 0.1);
    reddish[p] = isVoid ? 0 : 255 * smooth(0.6, 0.72, redN[p]);
    shade[p] = isVoid ? 0 : 255 * smooth(0.2, 0.5, shadeV[p] * (0.8 + 0.4 * shadeN[p]));
    trail[p] = isVoid ? 0 : 255 * smooth(0.3, 0.62, trailV[p] + (trailN[p] - 0.5) * 0.7);
    plaza[p] = isVoid ? 0 : 255 * smooth(0.4, 0.6, plazaV[p] + (plazaN[p] - 0.5) * 0.5);
  }

  // ---- camadas, de baixo para cima ----
  layer({ map: sand('areia_plana'), tiles: 3, alpha: holes, opaque: true, y: -0.03, order: 0 });
  layer({ map: sand('areia_duna_c'), tiles: 6, alpha: dunes, y: -0.028, order: 1 });
  layer({ map: sand('areia_ondas_b'), tiles: 4, alpha: ripples, y: -0.026, order: 2 });
  layer({ map: sand('areia_avermelhada'), tiles: 3, opacity: 0.85, alpha: reddish, y: -0.024, order: 3 });
  layer({ map: sand('areia_rachada_b'), tiles: 2, opacity: 0.7, alpha: cracks, y: -0.022, order: 4 });
  layer({ map: sand('areia_pedrinhas_b'), tiles: 2, alpha: pebbles, y: -0.02, order: 5 });
  layer({ map: sand('areia_plana'), tiles: 3, color: 0x7a5630, opacity: 0.5, alpha: shade, y: -0.018, order: 6 });
  layer({ map: sand('areia_grumos'), tiles: 2, color: 0xc49a66, opacity: 0.9, alpha: trail, y: -0.015, order: 7 });
  layer({ map: sand('areia_pedras_b'), tiles: 2, alpha: plaza, y: -0.012, order: 8 });
  layer({ map: sand('areia_rachada_b'), tiles: 2, color: 0x8c6442, alpha: bank, y: -0.011, order: 9 });
  layer({ map: water('agua_rasa'), tiles: P.waterTiles, color: P.rimColor, opacity: P.rimOpacity, alpha: rim, y: -0.009, order: 10, flow: P.flowRim });
  layer({ map: water('agua_funda'), tiles: P.waterTiles, color: P.deepColor, opacity: P.deepOpacity, alpha: deep, y: -0.008, order: 11, flow: P.flowDeep });

  // ---- margem do oásis e pedras soltas: arenito do kit em volta da água (o tile continua livre) ----
  const isVoid = (x: number, y: number): boolean =>
    x + margin >= 0 && y + margin >= 0 && x + margin < TW && y + margin < TH && voids[(y + margin) * TW + x + margin] === 1;
  const shore: Record<string, THREE.Matrix4[]> = {};
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isVoid(x, y) || !(isVoid(x + 1, y) || isVoid(x - 1, y) || isVoid(x, y + 1) || isVoid(x, y - 1))) continue;
      if (hash(x, y, 31) > 0.3) continue;
      const key = KIT.arenito[Math.floor(hash(x, y, 37) * KIT.arenito.length)];
      const s = 0.5 + hash(x, y, 41) * 0.3;
      const mx = x - zone.width / 2 + 0.5 + (hash(x, y, 43) - 0.5) * 0.4;
      const mz = y - zone.height / 2 + 0.5 + (hash(x, y, 47) - 0.5) * 0.4;
      (shore[key] ??= []).push(kitMatrix(mx, mz, s, hash(x, y, 53) * Math.PI * 2));
    }
  }
  const rockTint = tintHex(KITS.desert.rockTint);
  for (const [key, mats] of Object.entries(shore)) instanceKit(g.group, key, mats, rockTint);

  return { group: g.group, update: g.update };
}
