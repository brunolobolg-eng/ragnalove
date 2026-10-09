import { RARITIES, RARITY_INFO, itemKind, type Item, type Rarity } from '../core/progression/equipment';
export { itemKind };

/**
 * Arte dos equipamentos (desenhos originais em canvas): cada item recebe uma variante
 * do seu tipo (espada, machado, cajado, arco...; peitoral, túnica, elmo, escudo...;
 * anel, amuleto, bracelete...) escolhida pelo id, com materiais e brilho pela raridade.
 */
type Mat = { light: string; mid: string; dark: string; gem: string; trim: string; glow: number };
const MATS: Record<Rarity, Mat> = {
  common: { light: '#c9c4bb', mid: '#8f897f', dark: '#4e4943', gem: '#9a9a9a', trim: '#7a5a3a', glow: 0 },
  uncommon: { light: '#e2e8ee', mid: '#9aa6b2', dark: '#4e5864', gem: '#43d860', trim: '#8a6a3a', glow: 0.25 },
  rare: { light: '#e8f2ff', mid: '#8fb2d8', dark: '#3a5a86', gem: '#3f8fff', trim: '#c8d4e4', glow: 0.45 },
  epic: { light: '#f2e6ff', mid: '#a88ad8', dark: '#4e2e7a', gem: '#c060ff', trim: '#d8b0ff', glow: 0.65 },
  legendary: { light: '#fff6d0', mid: '#e8c050', dark: '#8a5a10', gem: '#ff6a3a', trim: '#fff0a0', glow: 0.85 },
  mythic: { light: '#ffe0d0', mid: '#e85a3a', dark: '#6a1a10', gem: '#ffe060', trim: '#ffd060', glow: 1 },
};

const cache = new Map<string, string>();

/**
 * Ícones (uma linha por tipo, uma coluna por raridade, da Comum à Mítica):
 *  - item_art.webp (células de 128px): arte nova da folha de equipamentos (14 tipos), recortada por
 *    scripts/build_item_art.py. A moldura colorida e o brilho vêm do código, como nos demais.
 *  - item_icons.png (células de 96px): arte antiga, só para os tipos que ainda não têm arte nova.
 */
const ART_KINDS = ['sword', 'axe', 'staff', 'bow', 'dagger', 'book', 'plate', 'cloak', 'helm', 'ring', 'earring', 'amulet', 'belt', 'boots'];
const ART_CELL = 128;
const art = new Image();
let artReady = false;
art.onload = () => {
  artReady = true;
  cache.clear();
};
art.src = 'sprites/item_art.webp';

const OLD_KINDS = ['shield', 'robe', 'vest', 'bracelet', 'orb', 'spear'];
const OLD_CELL = 96;
const atlas = new Image();
let atlasReady = false;
atlas.onload = () => {
  atlasReady = true;
  cache.clear();
};
atlas.src = 'sprites/item_icons.png';

/** URL (data:) do ícone do item, com cache por variante + raridade. */
export function itemIconUrl(it: Pick<Item, 'id' | 'slot' | 'rarity'>, size = 96): string {
  const kind = itemKind(it);
  const key = `${kind}:${it.rarity}:${size}`;
  let url = cache.get(key);
  if (!url) {
    url = itemArtCanvas(kind, it.rarity, size).toDataURL();
    // só guarda no cache quando a arte do tipo já carregou (senão ficaria o desenho provisório)
    const ready = ART_KINDS.includes(kind) ? artReady : OLD_KINDS.includes(kind) ? atlasReady : true;
    if (ready) cache.set(key, url);
  }
  return url;
}

export function itemArtCanvas(kind: string, rarity: Rarity, size = 96): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.scale(size / 64, size / 64);
  const m = MATS[rarity];
  const rc = RARITY_INFO[rarity].color;
  const tier = RARITIES.indexOf(rarity);
  // fundo: pedra escura com halo da raridade
  const bg = g.createRadialGradient(32, 30, 2, 32, 32, 44);
  bg.addColorStop(0, shade(rc, -0.55));
  bg.addColorStop(0.55, '#171a26');
  bg.addColorStop(1, '#0b0d14');
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  if (m.glow > 0) {
    const halo = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    halo.addColorStop(0, withAlpha(rc, 0.35 * m.glow));
    halo.addColorStop(1, withAlpha(rc, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, 64, 64);
  }
  g.save();
  g.shadowColor = m.glow > 0 ? withAlpha(rc, 0.9) : 'rgba(0,0,0,0.6)';
  g.shadowBlur = 3 + m.glow * 6;
  const artRow = ART_KINDS.indexOf(kind);
  const oldRow = OLD_KINDS.indexOf(kind);
  if (artReady && artRow >= 0) g.drawImage(art, tier * ART_CELL, artRow * ART_CELL, ART_CELL, ART_CELL, 5, 5, 54, 54);
  else if (atlasReady && oldRow >= 0) g.drawImage(atlas, tier * OLD_CELL, oldRow * OLD_CELL, OLD_CELL, OLD_CELL, 5, 5, 54, 54);
  else DRAW[kind]?.(g, m, tier);
  g.restore();
  // brilhos (raridades altas)
  if (tier >= 3) {
    g.fillStyle = '#fff';
    for (const [x, y, s] of [[12, 14, 1.6], [50, 12, 1.2], [52, 48, 1.8], [14, 50, 1]] as const) star(g, x, y, s * (0.55 + 0.2 * (tier - 3)));
  }
  // moldura
  g.strokeStyle = 'rgba(8,10,16,0.95)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 61, 61);
  g.strokeStyle = rc;
  g.lineWidth = 2;
  g.strokeRect(3.5, 3.5, 57, 57);
  if (tier >= 4) {
    g.fillStyle = rc;
    for (const [x, y] of [[4, 4], [60, 4], [4, 60], [60, 60]]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

// ---------------- desenhos ----------------
type Draw = (g: CanvasRenderingContext2D, m: Mat, tier: number) => void;

function lin(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function outline(g: CanvasRenderingContext2D, w = 1.4): void {
  g.save();
  g.shadowBlur = 0;
  g.strokeStyle = 'rgba(10,8,6,0.85)';
  g.lineWidth = w;
  g.stroke();
  g.restore();
}
function gem(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 0.2, x, y, r);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.35, col);
  gr.addColorStop(1, shade(col, -0.5));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  g.fill();
  outline(g, 0.8);
}
function star(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y - s * 2);
  g.lineTo(x + s * 0.5, y - s * 0.5);
  g.lineTo(x + s * 2, y);
  g.lineTo(x + s * 0.5, y + s * 0.5);
  g.lineTo(x, y + s * 2);
  g.lineTo(x - s * 0.5, y + s * 0.5);
  g.lineTo(x - s * 2, y);
  g.lineTo(x - s * 0.5, y - s * 0.5);
  g.closePath();
  g.fill();
}
const WOOD = ['#b07a44', '#7a4e26', '#4a2e14'];
const LEATHER = ['#a0703e', '#6e4622', '#3e2610'];

const DRAW: Record<string, Draw> = {
  sword(g, m, t) {
    g.translate(32, 32);
    g.rotate(-Math.PI / 4);
    // lâmina com fio e sulco
    g.fillStyle = lin(g, -5, 0, 5, 0, [[0, m.dark], [0.45, m.light], [0.55, m.mid], [1, m.dark]]);
    g.beginPath();
    g.moveTo(-4.5, 8);
    g.lineTo(-4.5, -20);
    g.lineTo(0, -28);
    g.lineTo(4.5, -20);
    g.lineTo(4.5, 8);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = withAlpha(m.dark, 0.6);
    g.fillRect(-0.8, -20, 1.6, 26);
    // guarda curva
    g.fillStyle = lin(g, 0, 6, 0, 12, [[0, m.trim], [1, shade(m.trim, -0.45)]]);
    g.beginPath();
    g.moveTo(-13, 7);
    g.quadraticCurveTo(0, 13, 13, 7);
    g.lineTo(12, 11);
    g.quadraticCurveTo(0, 16, -12, 11);
    g.closePath();
    g.fill();
    outline(g);
    // cabo com tiras
    g.fillStyle = lin(g, -2.5, 0, 2.5, 0, [[0, LEATHER[2]], [0.5, LEATHER[0]], [1, LEATHER[2]]]);
    g.fillRect(-2.6, 12, 5.2, 12);
    g.strokeStyle = LEATHER[2];
    g.lineWidth = 0.8;
    for (let y = 14; y < 24; y += 2.5) {
      g.beginPath();
      g.moveTo(-2.6, y);
      g.lineTo(2.6, y + 1.2);
      g.stroke();
    }
    gem(g, 0, 26.5, 3.2, m.gem);
    if (t >= 2) gem(g, 0, 9.5, 2, m.gem);
  },
  axe(g, m, t) {
    g.translate(32, 32);
    g.rotate(-Math.PI / 5);
    g.fillStyle = lin(g, -2, 0, 2, 0, [[0, WOOD[2]], [0.5, WOOD[0]], [1, WOOD[2]]]);
    g.fillRect(-2.2, -24, 4.4, 50);
    g.beginPath();
    g.rect(-2.2, -24, 4.4, 50);
    outline(g);
    // lâmina em meia-lua
    g.fillStyle = lin(g, 2, -18, 22, -4, [[0, m.dark], [0.5, m.mid], [0.85, m.light], [1, '#ffffff']]);
    g.beginPath();
    g.moveTo(2, -22);
    g.quadraticCurveTo(12, -26, 21, -30);
    g.quadraticCurveTo(28, -14, 21, 2);
    g.quadraticCurveTo(12, -2, 2, -6);
    g.closePath();
    g.fill();
    outline(g);
    if (t >= 2) {
      g.beginPath();
      g.moveTo(-2, -20);
      g.quadraticCurveTo(-9, -18, -12, -22);
      g.quadraticCurveTo(-13, -12, -12, -6);
      g.quadraticCurveTo(-8, -9, -2, -8);
      g.closePath();
      g.fill();
      outline(g);
    }
    g.fillStyle = m.trim;
    g.fillRect(-3, -8, 6, 3);
    g.fillRect(-3, -22, 6, 3);
    gem(g, 8, -14, 2.4, m.gem);
  },
  staff(g, m, t) {
    g.translate(32, 32);
    g.rotate(-Math.PI / 6);
    g.strokeStyle = lin(g, 0, -20, 0, 28, [[0, WOOD[0]], [1, WOOD[2]]]);
    g.lineWidth = 4.5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, 28);
    g.quadraticCurveTo(3, 6, -1, -16);
    g.stroke();
    // garras em volta do orbe
    g.strokeStyle = m.trim;
    g.lineWidth = 2.2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(-1, -14);
      g.quadraticCurveTo(s * 10, -20, s * 5, -28);
      g.stroke();
    }
    const orb = g.createRadialGradient(-2, -25, 0.5, 0, -23, 7);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.35, m.gem);
    orb.addColorStop(1, shade(m.gem, -0.6));
    g.fillStyle = orb;
    g.beginPath();
    g.arc(0, -23, 6.5, 0, Math.PI * 2);
    g.fill();
    outline(g, 1);
    g.fillStyle = m.trim;
    g.fillRect(-3, -2, 6, 2.5);
    g.fillRect(-2.6, 8, 5.2, 2);
    if (t >= 3) for (let i = 0; i < 3; i++) star(g, -8 + i * 8, -34 + (i % 2) * 4, 0.8);
  },
  bow(g, m, t) {
    g.translate(32, 32);
    g.rotate(-Math.PI / 4);
    g.strokeStyle = lin(g, 0, -26, 0, 26, [[0, m.trim], [0.2, WOOD[0]], [0.5, WOOD[1]], [0.8, WOOD[0]], [1, m.trim]]);
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-2, -26);
    g.bezierCurveTo(16, -18, 16, 18, -2, 26);
    g.stroke();
    g.strokeStyle = '#f2ead8';
    g.lineWidth = 0.9;
    g.beginPath();
    g.moveTo(-2, -26);
    g.lineTo(-2, 26);
    g.stroke();
    g.fillStyle = LEATHER[1];
    g.fillRect(9, -4, 5, 8);
    // flecha
    g.strokeStyle = '#d8c8a8';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(-8, 0);
    g.lineTo(22, 0);
    g.stroke();
    g.fillStyle = m.light;
    g.beginPath();
    g.moveTo(26, 0);
    g.lineTo(21, -3);
    g.lineTo(21, 3);
    g.fill();
    g.fillStyle = '#c84a3a';
    g.fillRect(-9, -2.5, 4, 5);
    if (t >= 2) gem(g, 12, 0, 2.2, m.gem);
  },
  mace(g, m, t) {
    g.translate(32, 32);
    g.rotate(-Math.PI / 4);
    g.fillStyle = lin(g, -2, 0, 2, 0, [[0, LEATHER[2]], [0.5, LEATHER[0]], [1, LEATHER[2]]]);
    g.fillRect(-2.4, -4, 4.8, 30);
    const head = g.createRadialGradient(-3, -17, 1, 0, -14, 11);
    head.addColorStop(0, m.light);
    head.addColorStop(0.6, m.mid);
    head.addColorStop(1, m.dark);
    g.fillStyle = head;
    g.beginPath();
    g.arc(0, -14, 9, 0, Math.PI * 2);
    g.fill();
    outline(g);
    g.fillStyle = m.light;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 8, -14 + Math.sin(a) * 8);
      g.lineTo(Math.cos(a + 0.18) * 13, -14 + Math.sin(a + 0.18) * 13);
      g.lineTo(Math.cos(a + 0.36) * 8, -14 + Math.sin(a + 0.36) * 8);
      g.fill();
    }
    g.fillStyle = m.trim;
    g.fillRect(-3.4, -5, 6.8, 3);
    if (t >= 2) gem(g, 0, -14, 3, m.gem);
  },
  dagger(g, m, t) {
    g.translate(32, 32);
    g.rotate(Math.PI / 4);
    g.fillStyle = lin(g, -4, 0, 4, 0, [[0, m.dark], [0.5, m.light], [1, m.mid]]);
    g.beginPath();
    g.moveTo(-4, 2);
    g.quadraticCurveTo(-5, -12, 0, -24);
    g.quadraticCurveTo(5, -12, 4, 2);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = m.trim;
    g.beginPath();
    g.moveTo(-10, 2);
    g.lineTo(10, 2);
    g.lineTo(7, 6);
    g.lineTo(-7, 6);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = lin(g, -2, 0, 2, 0, [[0, LEATHER[2]], [0.5, LEATHER[0]], [1, LEATHER[2]]]);
    g.fillRect(-2.2, 6, 4.4, 12);
    gem(g, 0, 20, 2.6, m.gem);
    if (t >= 3) {
      g.strokeStyle = withAlpha(m.gem, 0.8);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -20);
      g.lineTo(0, -2);
      g.stroke();
    }
  },
  plate(g, m, t) {
    g.translate(32, 33);
    g.fillStyle = lin(g, -18, 0, 18, 0, [[0, m.dark], [0.3, m.mid], [0.5, m.light], [0.7, m.mid], [1, m.dark]]);
    g.beginPath();
    g.moveTo(-10, -20);
    g.quadraticCurveTo(0, -14, 10, -20);
    g.lineTo(21, -15);
    g.lineTo(18, -2);
    g.lineTo(15, 18);
    g.quadraticCurveTo(0, 24, -15, 18);
    g.lineTo(-18, -2);
    g.lineTo(-21, -15);
    g.closePath();
    g.fill();
    outline(g);
    // ombreiras
    g.fillStyle = lin(g, 0, -22, 0, -8, [[0, m.light], [1, m.dark]]);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(s * 19, -15, 8, 5.5, s * 0.4, 0, Math.PI * 2);
      g.fill();
      outline(g, 1);
    }
    // linhas das placas
    g.strokeStyle = withAlpha(m.dark, 0.9);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -14);
    g.lineTo(0, 20);
    for (const y of [2, 10]) {
      g.moveTo(-14, y);
      g.quadraticCurveTo(0, y + 4, 14, y);
    }
    g.stroke();
    g.fillStyle = m.trim;
    g.fillRect(-14, -1, 28, 2.5);
    gem(g, 0, -6, 3.2, m.gem);
    if (t >= 3) {
      g.fillStyle = withAlpha(m.gem, 0.5);
      g.beginPath();
      g.arc(0, -6, 7, 0, Math.PI * 2);
      g.fill();
    }
  },
  robe(g, m, t) {
    g.translate(32, 32);
    const cloth = t >= 2 ? m.gem : '#6a4a8a';
    g.fillStyle = lin(g, -16, 0, 16, 0, [[0, shade(cloth, -0.5)], [0.5, cloth], [1, shade(cloth, -0.5)]]);
    g.beginPath();
    g.moveTo(-8, -22);
    g.lineTo(8, -22);
    g.lineTo(20, -12);
    g.lineTo(14, -6);
    g.lineTo(12, 24);
    g.lineTo(-12, 24);
    g.lineTo(-14, -6);
    g.lineTo(-20, -12);
    g.closePath();
    g.fill();
    outline(g);
    // gola e faixa
    g.fillStyle = m.trim;
    g.beginPath();
    g.moveTo(-8, -22);
    g.lineTo(0, -10);
    g.lineTo(8, -22);
    g.lineTo(5, -22);
    g.lineTo(0, -14);
    g.lineTo(-5, -22);
    g.closePath();
    g.fill();
    g.fillRect(-12, 4, 24, 3);
    g.strokeStyle = withAlpha(m.trim, 0.8);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(0, 24);
    g.stroke();
    // runas
    g.fillStyle = withAlpha(m.light, 0.8);
    for (const [x, y] of [[-7, 14], [6, 16], [-5, 19]]) star(g, x, y, 0.7);
    gem(g, 0, 5.5, 2.4, m.gem);
  },
  vest(g, m, t) {
    g.translate(32, 32);
    g.fillStyle = lin(g, -16, 0, 16, 0, [[0, LEATHER[2]], [0.5, LEATHER[0]], [1, LEATHER[2]]]);
    g.beginPath();
    g.moveTo(-9, -21);
    g.lineTo(-3, -12);
    g.lineTo(3, -12);
    g.lineTo(9, -21);
    g.lineTo(17, -16);
    g.lineTo(15, 20);
    g.lineTo(-15, 20);
    g.lineTo(-17, -16);
    g.closePath();
    g.fill();
    outline(g);
    g.strokeStyle = LEATHER[2];
    g.lineWidth = 1;
    g.setLineDash([2, 2]);
    g.beginPath();
    g.moveTo(-12, -12);
    g.lineTo(-11, 18);
    g.moveTo(12, -12);
    g.lineTo(11, 18);
    g.stroke();
    g.setLineDash([]);
    // fivelas
    g.fillStyle = m.mid;
    for (const y of [-4, 4, 12]) g.fillRect(-2.5, y, 5, 3);
    g.fillStyle = m.trim;
    g.fillRect(-15, 8, 30, 2);
    if (t >= 2) gem(g, 0, -8, 2.2, m.gem);
  },
  helm(g, m, t) {
    g.translate(32, 34);
    g.fillStyle = lin(g, -16, -10, 16, 10, [[0, m.light], [0.5, m.mid], [1, m.dark]]);
    g.beginPath();
    g.moveTo(-16, 10);
    g.quadraticCurveTo(-18, -22, 0, -22);
    g.quadraticCurveTo(18, -22, 16, 10);
    g.lineTo(9, 16);
    g.lineTo(-9, 16);
    g.closePath();
    g.fill();
    outline(g);
    // viseira
    g.fillStyle = '#0c0e14';
    g.fillRect(-11, -4, 22, 4);
    g.fillRect(-2, -4, 4, 14);
    // crista
    g.fillStyle = t >= 3 ? m.gem : '#b02a2a';
    g.beginPath();
    g.moveTo(-3, -22);
    g.quadraticCurveTo(0, -34, 14, -30);
    g.quadraticCurveTo(6, -24, 3, -21);
    g.closePath();
    g.fill();
    g.fillStyle = m.trim;
    g.fillRect(-16, 6, 32, 2.5);
    gem(g, 0, -12, 2.6, m.gem);
  },
  shield(g, m, t) {
    g.translate(32, 32);
    g.fillStyle = lin(g, -18, -20, 18, 20, [[0, m.light], [0.5, m.mid], [1, m.dark]]);
    g.beginPath();
    g.moveTo(0, -24);
    g.quadraticCurveTo(14, -22, 20, -18);
    g.quadraticCurveTo(20, 8, 0, 25);
    g.quadraticCurveTo(-20, 8, -20, -18);
    g.quadraticCurveTo(-14, -22, 0, -24);
    g.closePath();
    g.fill();
    outline(g);
    const field = t >= 2 ? m.gem : '#3a5a8a';
    g.fillStyle = shade(field, -0.2);
    g.beginPath();
    g.moveTo(0, -19);
    g.quadraticCurveTo(11, -17, 15, -14);
    g.quadraticCurveTo(15, 6, 0, 19);
    g.quadraticCurveTo(-15, 6, -15, -14);
    g.quadraticCurveTo(-11, -17, 0, -19);
    g.fill();
    // emblema (asa/estrela)
    g.fillStyle = m.trim;
    star(g, 0, -1, 3.2);
    g.fillRect(-1, -16, 2, 32);
    g.fillRect(-13, -4, 26, 2);
    if (t >= 3) gem(g, 0, -1, 2.4, '#ffffff');
  },
  hat(g, m, t) {
    // chapéu de mago: aba larga e ponta dobrada
    g.translate(32, 36);
    const cloth = t >= 2 ? m.gem : '#4a3a8a';
    g.fillStyle = lin(g, -24, 0, 24, 0, [[0, shade(cloth, -0.5)], [0.5, cloth], [1, shade(cloth, -0.5)]]);
    g.beginPath();
    g.ellipse(0, 12, 26, 7, 0, 0, Math.PI * 2);
    g.fill();
    outline(g);
    g.beginPath();
    g.moveTo(-14, 11);
    g.quadraticCurveTo(-6, -8, 4, -26);
    g.quadraticCurveTo(10, -18, 20, -20);
    g.quadraticCurveTo(10, -10, 14, 11);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = m.trim;
    g.fillRect(-14, 5, 28, 4);
    star(g, 0, -4, 1.6);
    gem(g, 8, 7, 2.4, m.gem);
  },
  cloak(g, m, t) {
    // capa com gola e fecho
    g.translate(32, 32);
    const cloth = t >= 2 ? m.gem : '#8a2a2a';
    g.fillStyle = lin(g, -20, 0, 20, 0, [[0, shade(cloth, -0.55)], [0.5, cloth], [1, shade(cloth, -0.55)]]);
    g.beginPath();
    g.moveTo(-10, -22);
    g.lineTo(10, -22);
    g.quadraticCurveTo(22, 4, 22, 26);
    g.quadraticCurveTo(12, 20, 6, 26);
    g.quadraticCurveTo(0, 20, -6, 26);
    g.quadraticCurveTo(-12, 20, -22, 26);
    g.quadraticCurveTo(-22, 4, -10, -22);
    g.closePath();
    g.fill();
    outline(g);
    g.strokeStyle = withAlpha('#000000', 0.25);
    g.lineWidth = 1.2;
    for (const x of [-9, 0, 9]) {
      g.beginPath();
      g.moveTo(x * 0.6, -14);
      g.quadraticCurveTo(x, 6, x * 1.3, 22);
      g.stroke();
    }
    g.fillStyle = lin(g, 0, -26, 0, -16, [[0, m.light], [1, m.dark]]);
    g.beginPath();
    g.ellipse(0, -21, 13, 5, 0, 0, Math.PI * 2);
    g.fill();
    outline(g, 1);
    gem(g, 0, -17, 3.2, m.gem);
  },
  boots(g, m, t) {
    // par de botas de couro com biqueira e fivela
    g.translate(32, 34);
    for (const [dx, sc] of [[-8, 0.92], [7, 1]] as const) {
      g.save();
      g.translate(dx, 0);
      g.scale(sc, sc);
      g.fillStyle = lin(g, -8, -20, 8, 20, [[0, LEATHER[0]], [1, LEATHER[2]]]);
      g.beginPath();
      g.moveTo(-7, -22);
      g.lineTo(6, -22);
      g.lineTo(6, 8);
      g.quadraticCurveTo(18, 10, 18, 18);
      g.lineTo(-8, 18);
      g.closePath();
      g.fill();
      outline(g);
      g.fillStyle = lin(g, 0, -24, 0, -16, [[0, m.light], [1, m.dark]]);
      g.fillRect(-8.5, -24, 16, 6);
      g.fillStyle = m.mid;
      g.fillRect(-8, 15, 26, 4);
      g.fillStyle = m.trim;
      g.fillRect(-7, -6, 13, 3);
      if (t >= 2) gem(g, -0.5, -4.5, 2, m.gem);
      g.restore();
    }
  },
  ring(g, m, t) {
    g.translate(32, 36);
    g.strokeStyle = lin(g, -14, 0, 14, 0, [[0, m.dark], [0.3, m.light], [0.6, m.mid], [1, m.dark]]);
    g.lineWidth = 5;
    g.beginPath();
    g.ellipse(0, 4, 13, 10, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = m.trim;
    g.beginPath();
    g.moveTo(-7, -7);
    g.lineTo(7, -7);
    g.lineTo(5, -2);
    g.lineTo(-5, -2);
    g.closePath();
    g.fill();
    gem(g, 0, -12, 6 + t * 0.4, m.gem);
  },
  amulet(g, m, t) {
    g.translate(32, 32);
    g.strokeStyle = m.trim;
    g.lineWidth = 1.5;
    g.setLineDash([2, 1.5]);
    g.beginPath();
    g.moveTo(-16, -24);
    g.quadraticCurveTo(0, 2, 16, -24);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = lin(g, -10, 0, 10, 20, [[0, m.light], [1, m.dark]]);
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(11, 6);
    g.lineTo(0, 24);
    g.lineTo(-11, 6);
    g.closePath();
    g.fill();
    outline(g);
    gem(g, 0, 8, 5.5, m.gem);
    if (t >= 3) {
      g.strokeStyle = withAlpha(m.gem, 0.7);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 8, 9, 0, Math.PI * 2);
      g.stroke();
    }
  },
  bracelet(g, m, t) {
    g.translate(32, 32);
    g.fillStyle = lin(g, 0, -12, 0, 14, [[0, m.light], [0.5, m.mid], [1, m.dark]]);
    g.beginPath();
    g.ellipse(0, 0, 20, 13, 0, 0, Math.PI * 2);
    g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2, true);
    g.fill('evenodd');
    outline(g);
    for (const a of [-2.2, -1.57, -0.9]) gem(g, Math.cos(a) * 16.5, Math.sin(a) * 10, 2.4, m.gem);
    g.strokeStyle = m.trim;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(0, 0, 17, 10.5, 0, 0.2, Math.PI - 0.2);
    g.stroke();
    void t;
  },
  earring(g, m, t) {
    g.translate(32, 30);
    for (const s of [-1, 1]) {
      g.save();
      g.translate(s * 9, 0);
      g.strokeStyle = m.trim;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, -14, 4, Math.PI * 0.2, Math.PI * 1.8);
      g.stroke();
      g.fillStyle = lin(g, 0, -8, 0, 16, [[0, m.light], [1, m.dark]]);
      g.beginPath();
      g.moveTo(0, -9);
      g.quadraticCurveTo(7, 4, 0, 18);
      g.quadraticCurveTo(-7, 4, 0, -9);
      g.fill();
      outline(g, 1);
      gem(g, 0, 5, 3 + t * 0.3, m.gem);
      g.restore();
    }
  },
  belt(g, m, t) {
    g.translate(32, 32);
    g.fillStyle = lin(g, 0, -6, 0, 6, [[0, LEATHER[0]], [1, LEATHER[2]]]);
    g.beginPath();
    g.moveTo(-26, -4);
    g.quadraticCurveTo(0, -12, 26, -4);
    g.lineTo(26, 6);
    g.quadraticCurveTo(0, -2, -26, 6);
    g.closePath();
    g.fill();
    outline(g);
    g.fillStyle = lin(g, -8, -8, 8, 8, [[0, m.light], [1, m.dark]]);
    g.beginPath();
    g.roundRect(-9, -11, 18, 16, 3);
    g.fill();
    outline(g);
    g.fillStyle = '#0c0e14';
    g.fillRect(-5, -7, 10, 8);
    gem(g, 0, -3, 3, m.gem);
    g.fillStyle = LEATHER[1];
    g.fillRect(14, 4, 6, 12);
    void t;
  },
  orb(g, m, t) {
    g.translate(32, 32);
    const orb = g.createRadialGradient(-5, -6, 1, 0, 0, 16);
    orb.addColorStop(0, '#ffffff');
    orb.addColorStop(0.3, m.gem);
    orb.addColorStop(1, shade(m.gem, -0.65));
    g.fillStyle = orb;
    g.beginPath();
    g.arc(0, -2, 14, 0, Math.PI * 2);
    g.fill();
    outline(g);
    // suporte em garras
    g.fillStyle = m.trim;
    g.beginPath();
    g.moveTo(-12, 10);
    g.lineTo(12, 10);
    g.lineTo(8, 20);
    g.lineTo(-8, 20);
    g.closePath();
    g.fill();
    outline(g, 1);
    g.strokeStyle = m.trim;
    g.lineWidth = 2;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * 10, 10);
      g.quadraticCurveTo(s * 17, 0, s * 11, -10);
      g.stroke();
    }
    if (t >= 2) {
      g.fillStyle = withAlpha('#ffffff', 0.8);
      star(g, -4, -6, 1.4);
    }
  },
};

// ---------------- cores ----------------
function parse(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function shade(c: string, k: number): string {
  const [r, g, b] = parse(c);
  const f = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function withAlpha(c: string, a: number): string {
  if (c.startsWith('rgb(')) return c.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const [r, g, b] = parse(c);
  return `rgba(${r},${g},${b},${a})`;
}
