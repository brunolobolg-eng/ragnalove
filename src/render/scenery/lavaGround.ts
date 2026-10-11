import type * as THREE from 'three';
import type { ParsedZone } from '../../config/zones';
import { LAVA_ART as A } from '../../config/biomeArt';
import { KIT, instanceKit, kitMatrix, loadTexture } from './naturKit';
import { RES, groundLayers } from './groundLayers';
import { hash, smooth, trailRoutes, type GroundHandle } from './groundMath';

/**
 * Chão de cinzas e lava em camadas (Cume das Cinzas): basalto com placas e veias incandescentes, cinza no caminho,
 * lagos de lava animados (rio por baixo, brilho na beira, crosta escura) e, por cima, fumaça e brasas lentas.
 * A lava e as veias não recebem luz: continuam brilhando na noite. Só apresentação: a grade não muda.
 */

/** Pasta das texturas de vulcão e lava da folha 24 do dono (public/textures/vulcao). */
const DIR = 'textures/vulcao/';
/** Objetos que projetam sombra no basalto. */
const SHADE_KINDS = new Set<string>(['tree', 'rock', 'stump', 'ruin', 'wall']);
/** Objetos de pedra: em volta deles as veias de lava aparecem com mais força. */
const STONE_KINDS = new Set<string>(['rock', 'ruin', 'wall']);

/** Monta o chão de lava para a grade `zone`. `margin` = tiles de chão além da grade. */
export function lavaGround(zone: ParsedZone, margin: number): GroundHandle {
  const g = groundLayers(zone, margin);
  const { TW, TH, N, voids, voidPix, field, sample, rect, disc, blurred, layer } = g;
  const tex = (name: string) => loadTexture(`${DIR}${name}.webp`, false);

  // ---- formas (uma vez) ----
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
  const plateN = sample(field(31, 0.45, 1));
  const crackN = sample(field(33, 0.9, 1));
  const veinN = sample(field(35, 1.4));
  const lakeN = sample(field(21, 0.9, 1));
  const flowN = sample(field(37, 1.2, 1));
  const shadeN = sample(field(5, 0.7, 1));
  const trailN = sample(field(9, 1.1, 1));
  const plazaN = sample(field(4, 1.6));
  const smokeN = sample(field(41, 0.22, 1));
  const emberN = sample(field(43, 0.8, 1));

  // ---- máscaras: uma passada por pixel ----
  const holes = new Uint8ClampedArray(N);
  const lava = new Uint8ClampedArray(N);
  const lavaFlow = new Uint8ClampedArray(N);
  const rimGlow = new Uint8ClampedArray(N);
  const bank = new Uint8ClampedArray(N);
  const plates = new Uint8ClampedArray(N);
  const cracks = new Uint8ClampedArray(N);
  const veins = new Uint8ClampedArray(N);
  const trail = new Uint8ClampedArray(N);
  const plaza = new Uint8ClampedArray(N);
  const shade = new Uint8ClampedArray(N);
  const smoke = new Uint8ClampedArray(N);
  const embers = new Uint8ClampedArray(N);
  for (let p = 0; p < N; p++) {
    const isVoid = voidPix[p] === 1;
    // lago de lava: o mesmo contorno irregular dos lagos (buraco no basalto, crosta, brilho e lava por cima)
    const t = voidV[p] + (lakeN[p] - 0.5) * 0.7;
    const lk = smooth(0.42, 0.58, t);
    holes[p] = 255 * (1 - lk);
    lava[p] = 255 * lk;
    lavaFlow[p] = 255 * lk * smooth(0.45, 0.7, flowN[p]);
    rimGlow[p] = 255 * (1 - lk) * smooth(0.12, 0.3, voidV[p]);
    bank[p] = 255 * smooth(0.1, 0.3, voidV[p]) * (1 - lk);
    plates[p] = isVoid ? 0 : 255 * inside[p] * smooth(0.45, 0.62, plateN[p]);
    cracks[p] = isVoid ? 0 : 255 * inside[p] * smooth(0.68, 0.8, crackN[p]);
    veins[p] = isVoid ? 0 : 255 * smooth(0.3, 0.6, stoneV[p] * 0.8 + (veinN[p] - 0.5) * 0.6);
    trail[p] = isVoid ? 0 : 255 * smooth(0.3, 0.62, trailV[p] + (trailN[p] - 0.5) * 0.7);
    plaza[p] = isVoid ? 0 : 255 * smooth(0.4, 0.6, plazaV[p] + (plazaN[p] - 0.5) * 0.5);
    shade[p] = isVoid ? 0 : 255 * smooth(0.2, 0.5, shadeV[p] * (0.8 + 0.4 * shadeN[p]));
    smoke[p] = 255 * smooth(0.4, 0.7, smokeN[p]);
    embers[p] = 255 * smooth(0.5, 0.7, emberN[p]);
  }

  // ---- camadas, de baixo para cima ----
  layer({ map: tex('piso_basalto'), tiles: A.tiles.base, alpha: holes, opaque: true, y: -0.03, order: 0 });
  layer({ map: tex('piso_lava_placas'), tiles: A.tiles.plates, opacity: A.opacity.plates, alpha: plates, y: -0.028, order: 1 });
  layer({ map: tex('piso_lava_fenda_a'), tiles: A.tiles.crack, opacity: A.opacity.crack, alpha: cracks, unlit: true, y: -0.026, order: 2 });
  layer({ map: tex('piso_basalto_veias'), tiles: A.tiles.vein, opacity: A.opacity.vein, alpha: veins, unlit: true, y: -0.024, order: 3 });
  layer({ map: tex('piso_lava_rochosa'), tiles: A.tiles.trail, color: A.color.trail, opacity: A.opacity.trail, alpha: trail, y: -0.016, order: 4 });
  layer({ map: tex('piso_basalto'), tiles: A.tiles.plaza, color: A.color.plaza, alpha: plaza, y: -0.013, order: 5 });
  layer({ map: tex('piso_basalto'), tiles: A.tiles.shade, color: A.color.shade, opacity: A.opacity.shade, alpha: shade, y: -0.02, order: 6 });
  // lagos de lava: crosta escura na margem, brilho na beira, rio de lava animado e detalhe de fluxo
  layer({ map: tex('piso_basalto'), tiles: A.tiles.bank, color: A.color.bank, alpha: bank, y: -0.011, order: 7 });
  layer({ map: tex('ambiente_lava_brilho'), tiles: A.tiles.rim, opacity: A.opacity.rim, additive: true, unlit: true, alpha: rimGlow, flow: A.flow.rim, y: -0.0095, order: 8 });
  layer({ map: tex('piso_lava_rio'), tiles: A.tiles.lava, unlit: true, alpha: lava, flow: A.flow.lava, y: -0.009, order: 9 });
  layer({ map: tex('ambiente_lava_fluxo'), tiles: A.tiles.lavaFlow, opacity: A.opacity.lavaFlow, additive: true, unlit: true, alpha: lavaFlow, flow: A.flow.lavaFlow, y: -0.0085, order: 10 });
  // fumaça e brasas: sobre o chão, abaixo dos objetos
  layer({ map: tex('ambiente_fumaca'), tiles: A.tiles.smoke, opacity: A.opacity.smoke, alpha: smoke, flow: A.flow.smoke, y: -0.004, order: 11 });
  layer({ map: tex('ambiente_cinza_brasas'), tiles: A.tiles.embers, opacity: A.opacity.embers, additive: true, alpha: embers, flow: A.flow.embers, y: -0.003, order: 12 });

  // ---- margem do lago e pedras soltas: basalto do kit em volta da lava (o tile continua livre) ----
  const isVoid = (x: number, y: number): boolean =>
    x + margin >= 0 && y + margin >= 0 && x + margin < TW && y + margin < TH && voids[(y + margin) * TW + x + margin] === 1;
  const shore: Record<string, THREE.Matrix4[]> = {};
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      if (isVoid(x, y) || !(isVoid(x + 1, y) || isVoid(x - 1, y) || isVoid(x, y + 1) || isVoid(x, y - 1))) continue;
      if (hash(x, y, 31) > 0.35) continue;
      const key = KIT.basaltoRocha[Math.floor(hash(x, y, 37) * KIT.basaltoRocha.length)];
      const s = 0.5 + hash(x, y, 41) * 0.3;
      const mx = x - zone.width / 2 + 0.5 + (hash(x, y, 43) - 0.5) * 0.4;
      const mz = y - zone.height / 2 + 0.5 + (hash(x, y, 47) - 0.5) * 0.4;
      (shore[key] ??= []).push(kitMatrix(mx, mz, s, hash(x, y, 53) * Math.PI * 2));
    }
  }
  for (const [key, mats] of Object.entries(shore)) instanceKit(g.group, key, mats);

  return { group: g.group, update: g.update };
}
