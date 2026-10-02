import type { NodeType } from '../config/world';
import { NODE_ICONS } from '../config/visualConfig';

/**
 * Ícones pintados (canvas, arte original) dos tipos de fase no mapa:
 * horda, elite, evento, cidade, chefe e sobrevivência.
 */
const cache = new Map<string, string>();

export const NODE_COLOR: Record<NodeType, string> = {
  horde: '#7aa04a',
  elite: '#a45ae8',
  event: '#3aa6d8',
  city: '#e0b040',
  boss: '#e04a32',
  survival: '#2ec4b0',
};

export function nodeIconUrl(t: NodeType, size = 128): string {
  // arte pintada (sprites/nodes); o desenho em canvas fica de reserva
  const art = NODE_ICONS[t];
  if (art) return art;
  const key = `${t}:${size}`;
  let url = cache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d')!;
    g.scale(size / 128, size / 128);
    backdrop(g, NODE_COLOR[t]);
    DRAW[t](g);
    url = c.toDataURL();
    cache.set(key, url);
  }
  return url;
}

function backdrop(g: CanvasRenderingContext2D, col: string): void {
  // medalhão: disco escuro com aro metálico e brilho da cor do tipo
  const r = g.createRadialGradient(64, 58, 6, 64, 64, 62);
  r.addColorStop(0, rgba(col, 0.55));
  r.addColorStop(0.55, '#1a1c28');
  r.addColorStop(1, '#0a0b12');
  g.fillStyle = r;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = lin(g, 0, 4, 0, 124, [[0, '#f4dc9a'], [0.5, '#9a7434'], [1, '#4a3414']]);
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = rgba(col, 0.9);
  g.beginPath();
  g.arc(64, 64, 55, 0, Math.PI * 2);
  g.stroke();
}

type Draw = (g: CanvasRenderingContext2D) => void;

const DRAW: Record<NodeType, Draw> = {
  horde(g) {
    // três mortos-vivos em silhueta, o da frente maior, olhos vermelhos
    const figs: [number, number, number][] = [[38, 70, 0.8], [90, 70, 0.8], [64, 78, 1.05]];
    for (const [x, y, s] of figs) zombie(g, x, y, s);
    // névoa no chão
    g.fillStyle = 'rgba(160,200,120,0.18)';
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.ellipse(30 + i * 17, 104 + (i % 2) * 3, 16, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  },
  elite(g) {
    // crânio com chifres e aura roxa
    aura(g, 64, 62, 44, '#b060ff');
    g.fillStyle = lin(g, 0, 20, 0, 60, [[0, '#e8d8c0'], [1, '#6a5a4a']]);
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(64 + s * 20, 46);
      g.bezierCurveTo(64 + s * 44, 40, 64 + s * 46, 20, 64 + s * 36, 10);
      g.bezierCurveTo(64 + s * 36, 26, 64 + s * 30, 34, 64 + s * 16, 36);
      g.closePath();
      g.fill();
      stroke(g);
    }
    skull(g, 64, 66, 1, '#e8dfc8', '#c060ff');
  },
  event(g) {
    // pergaminho aberto com lacre e ponto de interrogação rúnico
    g.save();
    g.translate(64, 66);
    g.rotate(-0.12);
    g.fillStyle = lin(g, -34, 0, 34, 0, [[0, '#b89a62'], [0.5, '#f0dfb0'], [1, '#b89a62']]);
    g.fillRect(-30, -30, 60, 58);
    stroke(g);
    for (const y of [-30, 28]) {
      g.fillStyle = lin(g, 0, y - 6, 0, y + 6, [[0, '#f4e4b8'], [1, '#8a6a3a']]);
      g.beginPath();
      g.ellipse(0, y, 36, 6, 0, 0, Math.PI * 2);
      g.fill();
      stroke(g);
    }
    g.strokeStyle = 'rgba(90,60,30,0.6)';
    g.lineWidth = 2;
    for (const y of [-16, -8, 0, 8]) {
      g.beginPath();
      g.moveTo(-20, y);
      g.lineTo(y === 8 ? 4 : 20, y);
      g.stroke();
    }
    g.fillStyle = '#b02a2a';
    g.beginPath();
    g.arc(14, 16, 8, 0, Math.PI * 2);
    g.fill();
    stroke(g);
    g.fillStyle = '#ffd0a0';
    g.font = 'bold 12px serif';
    g.textAlign = 'center';
    g.fillText('?', 14, 20);
    g.restore();
  },
  city(g) {
    // portão de muralha com torres, bandeiras e luz na passagem
    g.fillStyle = lin(g, 0, 30, 0, 100, [[0, '#c8c0b0'], [1, '#5a544a']]);
    g.fillRect(26, 48, 76, 54);
    for (const x of [22, 88]) {
      g.fillRect(x, 36, 18, 66);
      for (let i = 0; i < 3; i++) g.fillRect(x + i * 7, 30, 5, 8);
    }
    for (let i = 0; i < 6; i++) g.fillRect(40 + i * 8, 42, 5, 7);
    g.beginPath();
    g.rect(22, 36, 18, 66);
    g.rect(88, 36, 18, 66);
    g.rect(26, 48, 76, 54);
    stroke(g);
    // passagem iluminada
    g.fillStyle = lin(g, 0, 62, 0, 102, [[0, '#ffe6a0'], [1, '#ff9a3a']]);
    g.beginPath();
    g.moveTo(50, 102);
    g.lineTo(50, 74);
    g.arc(64, 74, 14, Math.PI, 0);
    g.lineTo(78, 102);
    g.closePath();
    g.fill();
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 1.5;
    for (let x = 53; x < 78; x += 5) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x, 88);
      g.stroke();
    }
    // bandeiras
    for (const x of [31, 97]) {
      g.strokeStyle = '#3a2a1a';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 30);
      g.lineTo(x, 12);
      g.stroke();
      g.fillStyle = '#c8302a';
      g.beginPath();
      g.moveTo(x, 12);
      g.lineTo(x + 14, 16);
      g.lineTo(x, 21);
      g.fill();
    }
    // janelas
    g.fillStyle = '#ffd070';
    for (const x of [28, 94]) g.fillRect(x, 52, 6, 9);
  },
  boss(g) {
    // crânio demoníaco coroado envolto em chamas
    flames(g);
    skull(g, 64, 70, 1.1, '#f0e0c8', '#ff3a1a');
    g.fillStyle = lin(g, 0, 18, 0, 40, [[0, '#fff0a0'], [1, '#c88a18']]);
    g.beginPath();
    g.moveTo(40, 40);
    g.lineTo(42, 20);
    g.lineTo(52, 30);
    g.lineTo(64, 14);
    g.lineTo(76, 30);
    g.lineTo(86, 20);
    g.lineTo(88, 40);
    g.closePath();
    g.fill();
    stroke(g);
    for (const [x, y, c] of [[64, 30, '#e02a2a'], [48, 34, '#3a8aff'], [80, 34, '#3a8aff']] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  },
  survival(g) {
    // ampulheta com areia caindo, crânios empilhados na base
    aura(g, 64, 64, 46, '#2ec4b0');
    g.fillStyle = lin(g, 0, 16, 0, 26, [[0, '#f4dc9a'], [1, '#7a5a24']]);
    g.fillRect(36, 16, 56, 9);
    g.fillRect(36, 101, 56, 9);
    for (const x of [40, 84]) g.fillRect(x, 24, 4, 78);
    g.fillStyle = 'rgba(200,240,255,0.25)';
    g.beginPath();
    g.moveTo(46, 26);
    g.lineTo(82, 26);
    g.quadraticCurveTo(80, 52, 66, 63);
    g.quadraticCurveTo(80, 74, 82, 100);
    g.lineTo(46, 100);
    g.quadraticCurveTo(48, 74, 62, 63);
    g.quadraticCurveTo(48, 52, 46, 26);
    g.fill();
    g.strokeStyle = '#d8f4ff';
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = '#e8c878';
    g.beginPath();
    g.moveTo(52, 36);
    g.lineTo(76, 36);
    g.quadraticCurveTo(72, 52, 64, 60);
    g.quadraticCurveTo(56, 52, 52, 36);
    g.fill();
    g.fillRect(63, 60, 2, 24);
    // crânios na base
    for (const [x, y, s] of [[56, 94, 0.32], [72, 94, 0.32], [64, 86, 0.32]] as const) skull(g, x, y, s, '#e8dfc8', '#2ef4d0');
  },
};

function zombie(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = '#24301c';
  g.beginPath();
  // cabeça inclinada, ombros caídos, braços estendidos
  g.ellipse(-2, -30, 9, 10, -0.3, 0, Math.PI * 2);
  g.moveTo(-14, -18);
  g.quadraticCurveTo(0, -24, 14, -18);
  g.lineTo(26, -14);
  g.lineTo(26, -9);
  g.lineTo(12, -10);
  g.lineTo(11, 12);
  g.lineTo(15, 32);
  g.lineTo(6, 32);
  g.lineTo(1, 14);
  g.lineTo(-4, 32);
  g.lineTo(-13, 32);
  g.lineTo(-11, 10);
  g.lineTo(-14, -8);
  g.lineTo(-24, -4);
  g.lineTo(-24, -9);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(170,220,120,0.55)';
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = '#ff3a2a';
  g.shadowColor = '#ff2a1a';
  g.shadowBlur = 6;
  g.beginPath();
  g.arc(-6, -31, 2, 0, Math.PI * 2);
  g.arc(2, -32, 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function skull(g: CanvasRenderingContext2D, x: number, y: number, s: number, bone: string, eye: string): void {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = lin(g, -26, -30, 20, 26, [[0, '#ffffff'], [0.4, bone], [1, '#7a6a58']]);
  g.beginPath();
  g.moveTo(-26, -4);
  g.bezierCurveTo(-28, -38, 28, -38, 26, -4);
  g.quadraticCurveTo(26, 8, 16, 12);
  g.lineTo(14, 26);
  g.lineTo(-14, 26);
  g.lineTo(-16, 12);
  g.quadraticCurveTo(-26, 8, -26, -4);
  g.closePath();
  g.fill();
  stroke(g, 2);
  g.fillStyle = '#120a0a';
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * 11, -2, 8, 9, sx * 0.25, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(0, 8);
  g.lineTo(-4, 15);
  g.lineTo(4, 15);
  g.fill();
  g.strokeStyle = '#3a2a20';
  g.lineWidth = 1.5;
  for (let i = -9; i <= 9; i += 6) {
    g.beginPath();
    g.moveTo(i, 18);
    g.lineTo(i, 26);
    g.stroke();
  }
  g.fillStyle = eye;
  g.shadowColor = eye;
  g.shadowBlur = 10;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * 11, -1, 3.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function flames(g: CanvasRenderingContext2D): void {
  const f = (w: number, h: number, c0: string, c1: string) => {
    g.fillStyle = lin(g, 0, 110 - h, 0, 110, [[0, c0], [1, c1]]);
    g.beginPath();
    g.moveTo(64 - w, 108);
    for (let i = 0; i <= 8; i++) {
      const x = 64 - w + (i / 8) * w * 2;
      const tip = i % 2 === 0 ? 108 - h * (0.55 + 0.45 * Math.sin((i / 8) * Math.PI)) : 108 - h * 0.35;
      g.lineTo(x, tip);
    }
    g.lineTo(64 + w, 108);
    g.closePath();
    g.fill();
  };
  f(50, 96, 'rgba(255,90,20,0)', 'rgba(255,60,10,0.9)');
  f(40, 76, 'rgba(255,200,60,0)', 'rgba(255,150,30,0.9)');
}

function aura(g: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  const gr = g.createRadialGradient(x, y, r * 0.2, x, y, r);
  gr.addColorStop(0, rgba(col, 0.55));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function stroke(g: CanvasRenderingContext2D, w = 2): void {
  g.strokeStyle = 'rgba(12,8,6,0.9)';
  g.lineWidth = w;
  g.stroke();
}
function lin(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rgba(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}
