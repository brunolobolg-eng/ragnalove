import type * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { ICE_ART as A } from '../../config/biomeArt';
import { KIT, instanceKit, kitMatrix, loadTexture } from './naturKit';
import { RES, groundLayers } from './groundLayers';
import { hash, smooth, trailRoutes, type GroundHandle } from './groundMath';

/**
 * Chão de gelo em camadas (Passo da Geada e Garganta de Ferrugem): neve e gelo das texturas do dono, neve soprada,
 * fendas de gelo, neve com pedras perto das rochas, trilha compactada até o portão e, por cima, névoa e neve soprando
 * devagar. Lagos congelados nos vazios. Só apresentação: a grade não muda.
 */

/** Pasta das texturas de gelo da folha 24 do dono (public/textures/gelo). */
const DIR = 'textures/gelo/';
/** Objetos que projetam sombra no gelo. */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall']);
/** Objetos de pedra: em volta deles a neve fica rochosa. */
const STONE_KINDS = new Set<string>(['rock', 'ruin', 'wall']);

/** Monta o chão de gelo para a grade `zone`. `margin` = tiles de chão além da grade. */
export function iceGround(zone: ParsedZone, margin: number): GroundHandle {
  const g = groundLayers(zone, margin);
  const { TW, TH, N, voids, voidPix, field, sample, rect, disc, blurred, layer } = g;
  const tex = (name: string) => loadTexture(`${DIR}${name}.webp`, false);

  // ---- formas (uma vez) ----
  // dentro do tabuleiro vale 1 e fora dele 0
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

  // ---- campos de ruído (uma vez): manchas grandes com uma amostra por tile, detalhes com duas ----
  const driftN = sample(field(31, 0.3, 1));
  const crackN = sample(field(33, 0.9, 1));
  const crack2N = sample(field(35, 0.7, 1));
  const rockN = sample(field(37, 1.4));
  const frostN = sample(field(39, 0.55, 1));
  const lakeN = sample(field(21, 0.9, 1));
  const shadeN = sample(field(5, 0.7, 1));
  const trailN = sample(field(9, 1.1, 1));
  const plazaN = sample(field(4, 1.6));
  const mistN = sample(field(41, 0.22, 1));
  const streakN = sample(field(43, 0.5, 1));
  const webN = sample(field(45, 0.8, 1));

  // ---- máscaras: uma passada por pixel ----
  const holes = new Uint8ClampedArray(N);
  const lake = new Uint8ClampedArray(N);
  const bank = new Uint8ClampedArray(N);
  const drifts = new Uint8ClampedArray(N);
  const cracks = new Uint8ClampedArray(N);
  const cracks2 = new Uint8ClampedArray(N);
  const rocky = new Uint8ClampedArray(N);
  const frost = new Uint8ClampedArray(N);
  const shade = new Uint8ClampedArray(N);
  const trail = new Uint8ClampedArray(N);
  const plaza = new Uint8ClampedArray(N);
  const mist = new Uint8ClampedArray(N);
  const streak = new Uint8ClampedArray(N);
  const web = new Uint8ClampedArray(N);
  for (let p = 0; p < N; p++) {
    const isVoid = voidPix[p] === 1;
    // lago congelado: o mesmo contorno irregular dos outros lagos (buraco no chão, margem e gelo por cima)
    const t = voidV[p] + (lakeN[p] - 0.5) * 0.7;
    const lk = smooth(0.42, 0.58, t);
    holes[p] = 255 * (1 - lk);
    lake[p] = 255 * lk;
    bank[p] = 255 * smooth(0.1, 0.3, voidV[p]) * (1 - lk);
    drifts[p] = 255 * smooth(0.35, 0.6, driftN[p]);
    cracks[p] = isVoid ? 0 : 255 * inside[p] * smooth(0.68, 0.8, crackN[p]);
    cracks2[p] = isVoid ? 0 : 255 * inside[p] * smooth(0.7, 0.82, crack2N[p]);
    rocky[p] = isVoid ? 0 : 255 * smooth(0.25, 0.55, stoneV[p] * 0.8 + (rockN[p] - 0.5) * 0.6 + 0.1);
    frost[p] = isVoid ? 0 : 255 * smooth(0.6, 0.74, frostN[p]);
    shade[p] = isVoid ? 0 : 255 * smooth(0.2, 0.5, shadeV[p] * (0.8 + 0.4 * shadeN[p]));
    trail[p] = isVoid ? 0 : 255 * smooth(0.3, 0.62, trailV[p] + (trailN[p] - 0.5) * 0.7);
    plaza[p] = isVoid ? 0 : 255 * smooth(0.4, 0.6, plazaV[p] + (plazaN[p] - 0.5) * 0.5);
    mist[p] = 255 * smooth(0.38, 0.7, mistN[p]);
    streak[p] = 255 * smooth(0.42, 0.62, streakN[p]);
    web[p] = isVoid ? 0 : 255 * smooth(0.62, 0.78, webN[p]);
  }

  // ---- camadas, de baixo para cima ----
  layer({ map: tex('piso_neve_clara'), tiles: A.tiles.base, alpha: holes, opaque: true, y: -0.03, order: 0 });
  layer({ map: tex('piso_neve_ondulada'), tiles: A.tiles.drift, alpha: drifts, y: -0.028, order: 1 });
  layer({ map: tex('piso_gelo_fenda_a'), tiles: A.tiles.crack, opacity: A.opacity.crack, alpha: cracks, y: -0.026, order: 2 });
  layer({ map: tex('piso_gelo_fenda_b'), tiles: A.tiles.crack, opacity: A.opacity.crack, alpha: cracks2, y: -0.025, order: 3 });
  layer({ map: tex('piso_neve_pedrosa'), tiles: A.tiles.rocky, opacity: A.opacity.rocky, alpha: rocky, y: -0.024, order: 4 });
  layer({ map: tex('piso_gelo_claro'), tiles: A.tiles.frost, opacity: A.opacity.frost, alpha: frost, y: -0.022, order: 5 });
  layer({ map: tex('piso_neve_clara'), tiles: A.tiles.shade, color: A.color.shade, opacity: A.opacity.shade, alpha: shade, y: -0.02, order: 6 });
  layer({ map: tex('piso_neve_pedrosa'), tiles: A.tiles.trail, color: A.color.trail, opacity: A.opacity.trail, alpha: trail, y: -0.016, order: 7 });
  layer({ map: tex('piso_rocha_neve'), tiles: A.tiles.plaza, alpha: plaza, y: -0.013, order: 8 });
  // lago congelado: gelo claro azulado sobre o buraco do chão, com a margem já desenhada acima
  layer({ map: tex('piso_gelo_claro'), tiles: A.tiles.lake, color: A.color.lake, alpha: lake, y: -0.011, order: 9 });
  layer({ map: tex('piso_neve_pedrosa'), tiles: A.tiles.lake, color: 0x7d8ea4, alpha: bank, y: -0.01, order: 10 });
  // névoa e neve soprando: transparentes e lentas (não tocam os objetos, que ficam acima do chão)
  layer({ map: tex('ambiente_nevoa'), tiles: A.tiles.mist, opacity: A.opacity.mist, alpha: mist, flow: A.flow.mist, y: -0.004, order: 11 });
  layer({ map: tex('ambiente_neve_faixas'), tiles: A.tiles.streak, opacity: A.opacity.streak, alpha: streak, additive: true, flow: A.flow.streak, y: -0.003, order: 12 });
  layer({ map: tex('ambiente_geada_teia'), tiles: A.tiles.web, opacity: A.opacity.web, alpha: web, additive: true, y: -0.0025, order: 13 });

  // ---- margem do lago e pedras soltas: gelo do kit em volta da água (o tile continua livre) ----
  const isVoid = (x: number, y: number): boolean =>
    x + margin >= 0 && y + margin >= 0 && x + margin < TW && y + margin < TH && voids[(y + margin) * TW + x + margin] === 1;
  const shore: Record<string, THREE.Matrix4[]> = {};
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isVoid(x, y) || !(isVoid(x + 1, y) || isVoid(x - 1, y) || isVoid(x, y + 1) || isVoid(x, y - 1))) continue;
      if (hash(x, y, 31) > 0.35) continue;
      const key = KIT.geloRocha[Math.floor(hash(x, y, 37) * KIT.geloRocha.length)];
      const s = 0.5 + hash(x, y, 41) * 0.3;
      const mx = x - zone.width / 2 + 0.5 + (hash(x, y, 43) - 0.5) * 0.4;
      const mz = y - zone.height / 2 + 0.5 + (hash(x, y, 47) - 0.5) * 0.4;
      (shore[key] ??= []).push(kitMatrix(mx, mz, s, hash(x, y, 53) * Math.PI * 2));
    }
  }
  for (const [key, mats] of Object.entries(shore)) instanceKit(g.group, key, mats);

  return { group: g.group, update: g.update };
}
