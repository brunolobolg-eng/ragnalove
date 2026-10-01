import * as THREE from 'three';
import type { Board } from '../../core/grid/Board';

/**
 * Texturas "pintadas à mão" geradas em canvas (originais, nenhuma arte de terceiros).
 * Direção tirada das referências: pavimento bege em losangos com rejunte musgoso,
 * grama verde-amarelada saturada, arenito claro.
 */

export const PALETTE = {
  grass: ['#6f9a3c', '#7aa845', '#658e35', '#86b24e', '#5c8431'],
  grassBlade: ['#9cc75a', '#4f7a2a', '#a8d066'],
  dirt: ['#a48a5c', '#9a7f52', '#b39a6b'],
  paving: ['#e0d2b0', '#d8c8a3', '#e6d9ba', '#d2c29c', '#dccdaa'],
  grout: '#a9b27c', // rejunte com musgo (fino e claro)
  sandstone: ['#d9c7a0', '#cdb98f', '#e2d2ae'],
  flowers: ['#f2e25c', '#f4f0e6', '#e86a8a', '#b889e0'],
};

const TILE_PX = 64;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick<T>(r: () => number, a: T[]): T {
  return a[Math.floor(r() * a.length)];
}

function finish(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function paintGrass(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: () => number): void {
  g.fillStyle = PALETTE.grass[0];
  g.fillRect(x0, y0, w, h);
  // manchas suaves
  for (let i = 0; i < (w * h) / 900; i++) {
    const x = x0 + r() * w;
    const y = y0 + r() * h;
    const rad = 8 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, pick(r, PALETTE.grass) + 'cc');
    grd.addColorStop(1, pick(r, PALETTE.grass) + '00');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // folhinhas
  g.lineWidth = 1.2;
  for (let i = 0; i < (w * h) / 40; i++) {
    const x = x0 + r() * w;
    const y = y0 + r() * h;
    g.strokeStyle = pick(r, PALETTE.grassBlade) + '99';
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
    g.stroke();
  }
}

function paintFlowers(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w;
    const y = y0 + r() * h;
    g.fillStyle = pick(r, PALETTE.flowers);
    g.beginPath();
    g.arc(x, y, 1.6 + r() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
}

function paintDirt(g: CanvasRenderingContext2D, cx: number, cy: number, rad: number, r: () => number): void {
  for (let i = 0; i < 6; i++) {
    const x = cx + (r() - 0.5) * rad;
    const y = cy + (r() - 0.5) * rad;
    const rr = rad * (0.35 + r() * 0.4);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, pick(r, PALETTE.dirt) + 'dd');
    grd.addColorStop(0.7, pick(r, PALETTE.dirt) + '88');
    grd.addColorStop(1, PALETTE.dirt[0] + '00');
    g.fillStyle = grd;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

/** Pavimento em losangos (grade girada 45°) com rejunte musgoso e sujeira leve. */
function paintPaving(g: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: () => number): void {
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.fillStyle = PALETTE.grout;
  g.fillRect(x0, y0, w, h);
  const s = TILE_PX / 2; // meia-diagonal do losango
  for (let j = -1; j <= h / s + 1; j++) {
    for (let i = -1; i <= w / s + 1; i++) {
      if ((i + j) % 2 !== 0) continue;
      const cx = x0 + i * s;
      const cy = y0 + j * s;
      const inset = 1.3;
      g.fillStyle = pick(r, PALETTE.paving);
      g.beginPath();
      g.moveTo(cx, cy - s + inset);
      g.lineTo(cx + s - inset, cy);
      g.lineTo(cx, cy + s - inset);
      g.lineTo(cx - s + inset, cy);
      g.closePath();
      g.fill();
      // luz no canto superior, sombra no inferior (volume pintado)
      g.strokeStyle = 'rgba(255,250,235,0.45)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(cx - s + inset + 1, cy);
      g.lineTo(cx, cy - s + inset + 1);
      g.lineTo(cx + s - inset - 1, cy);
      g.stroke();
      g.strokeStyle = 'rgba(90,80,55,0.25)';
      g.beginPath();
      g.moveTo(cx - s + inset + 1, cy);
      g.lineTo(cx, cy + s - inset - 1);
      g.lineTo(cx + s - inset - 1, cy);
      g.stroke();
    }
  }
  // desgaste
  for (let i = 0; i < (w * h) / 2500; i++) {
    const x = x0 + r() * w;
    const y = y0 + r() * h;
    const rad = 4 + r() * 14;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, r() < 0.5 ? 'rgba(150,135,95,0.07)' : 'rgba(255,250,235,0.10)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.restore();
}

/** Textura única do tabuleiro: campo (norte) · portão (linha do muro) · praça da cidade (sul). */
export function boardGroundTexture(board: Board, wallRow: number): THREE.CanvasTexture {
  const W = board.width * TILE_PX;
  const H = board.height * TILE_PX;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const r = rng(7);
  const T = TILE_PX;

  paintGrass(g, 0, 0, W, (wallRow + 1) * T, r);
  paintFlowers(g, 0, 0, W, wallRow * T, r, 90);
  // trilha de terra batida que a horda abriu até o portão
  let gapMin = board.width;
  let gapMax = -1;
  for (let x = 0; x < board.width; x++)
    if (board.isWalkable(x, wallRow)) {
      gapMin = Math.min(gapMin, x);
      gapMax = Math.max(gapMax, x);
    }
  const gateCx = ((gapMin + gapMax + 1) / 2) * T;
  for (let y = 0; y <= wallRow; y++) {
    const spread = 0.8 + (y / wallRow) * ((gapMax - gapMin + 1) * 0.35);
    paintDirt(g, gateCx + Math.sin(y * 1.3) * T * 0.6, (y + 0.5) * T, spread * T, r);
  }
  paintPaving(g, 0, (wallRow + 1) * T, W, H - (wallRow + 1) * T, r);

  // meio-fio entre o campo e a praça
  const cy = (wallRow + 1) * T;
  for (let x = 0; x < W; x += 21) {
    g.fillStyle = pick(r, PALETTE.sandstone);
    g.fillRect(x + 1, cy - 5, 19, 9);
    g.fillStyle = 'rgba(80,70,50,0.35)';
    g.fillRect(x + 1, cy + 3, 19, 2);
  }

  // Grade SQM sutil: só a sugestão das casas (o overlay forte aparece no planejamento).
  g.strokeStyle = 'rgba(60,50,25,0.16)';
  g.lineWidth = 1;
  for (let x = 0; x <= board.width; x++) {
    g.beginPath();
    g.moveTo(x * T + 0.5, 0);
    g.lineTo(x * T + 0.5, H);
    g.stroke();
  }
  for (let y = 0; y <= board.height; y++) {
    g.beginPath();
    g.moveTo(0, y * T + 0.5);
    g.lineTo(W, y * T + 0.5);
    g.stroke();
  }
  return finish(c);
}

/** Grama repetível para o terreno fora do tabuleiro. */
export function grassTileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(11);
  paintGrass(g, 0, 0, 256, 256, r);
  paintFlowers(g, 0, 0, 256, 256, r, 10);
  return finish(c, true);
}

/** Pavimento repetível para a cidade ao redor da praça. */
export function pavingTileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  paintPaving(c.getContext('2d')!, 0, 0, 256, 256, rng(5));
  return finish(c, true);
}

/** Blocos de arenito para muros e construções. */
export function sandstoneBrickTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(3);
  g.fillStyle = '#b8a47c';
  g.fillRect(0, 0, 128, 128);
  const bh = 16;
  for (let row = 0; row < 128 / bh; row++) {
    const off = row % 2 ? 16 : 0;
    for (let x = -32; x < 128; x += 32) {
      g.fillStyle = pick(r, PALETTE.sandstone);
      g.fillRect(x + off + 1, row * bh + 1, 30, bh - 2);
      g.fillStyle = 'rgba(255,250,235,0.35)';
      g.fillRect(x + off + 1, row * bh + 1, 30, 2);
    }
  }
  return finish(c, true);
}

/** Tufo de grama (billboard com alpha). */
export function grassTuftTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(21);
  for (let i = 0; i < 22; i++) {
    const x = 10 + r() * 44;
    const hgt = 20 + r() * 38;
    g.strokeStyle = pick(r, ['#79a843', '#8fbe52', '#9fcc5e', '#6b9a3a']);
    g.lineWidth = 2 + r() * 2;
    g.beginPath();
    g.moveTo(x, 64);
    g.quadraticCurveTo(x + (r() - 0.5) * 10, 64 - hgt * 0.6, x + (r() - 0.5) * 16, 64 - hgt);
    g.stroke();
  }
  return finish(c);
}
