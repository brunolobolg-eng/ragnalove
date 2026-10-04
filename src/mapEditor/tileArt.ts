/**
 * Arte procedural dos tiles do editor: cada caractere da legenda vira um
 * desenho 2D visto de cima (sem assets novos — tudo desenhado no canvas).
 * Estilo "prateleira de objetos": o dono vê o mapa enquanto cria.
 */
export type Ctx = CanvasRenderingContext2D;

/** Variação determinística por tile (granulado, pedras, ondas). */
function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 974634) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function shadow(g: Ctx, px: number, py: number, t: number, w = 0.36): void {
  g.fillStyle = 'rgba(0,0,0,0.28)';
  ellipse(g, px + t / 2, py + t * 0.78, t * w, t * 0.13);
}

function speckles(g: Ctx, px: number, py: number, t: number, x: number, y: number, n: number, color: string, s0 = 0.03, s1 = 0.06): void {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const sx = px + hash(x, y, 10 + i) * t;
    const sy = py + hash(x, y, 50 + i) * t;
    const r = t * (s0 + hash(x, y, 90 + i) * (s1 - s0));
    g.beginPath();
    g.arc(sx, sy, r, 0, Math.PI * 2);
    g.fill();
  }
}

/** Desenha o tile do caractere `ch` no retângulo (px,py,t). x,y = coords do tile (variação). */
export function paintTile(g: Ctx, ch: string, px: number, py: number, t: number, x: number, y: number): void {
  const cx = px + t / 2;
  const cy = py + t / 2;
  switch (ch) {
    case '.':
      g.fillStyle = '#2e2a21';
      g.fillRect(px, py, t, t);
      speckles(g, px, py, t, x, y, 5, '#3a3427');
      speckles(g, px, py, t, x, y, 3, '#242019');
      break;
    case ',':
      g.fillStyle = '#3b3b44';
      g.fillRect(px, py, t, t);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = Math.max(1, t * 0.03);
      g.strokeRect(px + 1, py + 1, t - 2, t - 2);
      g.beginPath();
      g.moveTo(px + t / 2, py);
      g.lineTo(px + t / 2, py + t);
      g.moveTo(px, py + t / 2);
      g.lineTo(px + t, py + t / 2);
      g.stroke();
      speckles(g, px, py, t, x, y, 2, '#4a4a55');
      break;
    case ':':
      g.fillStyle = '#26333b';
      g.fillRect(px, py, t, t);
      g.fillStyle = 'rgba(160,200,220,0.22)';
      ellipse(g, px + t * (0.3 + hash(x, y, 1) * 0.4), py + t * 0.4, t * 0.3, t * 0.16);
      ellipse(g, px + t * (0.3 + hash(x, y, 2) * 0.4), py + t * 0.65, t * 0.26, t * 0.14);
      break;
    case 'r':
      g.fillStyle = '#27331f';
      g.fillRect(px, py, t, t);
      speckles(g, px, py, t, x, y, 4, '#1d2617');
      g.strokeStyle = '#5c7a3a';
      g.lineWidth = Math.max(1, t * 0.05);
      for (let i = 0; i < 3; i++) {
        const yy = py + t * (0.25 + i * 0.25);
        g.beginPath();
        g.moveTo(px + t * 0.15, yy);
        g.quadraticCurveTo(px + t * 0.5, yy + t * 0.12, px + t * 0.85, yy - t * 0.05);
        g.stroke();
      }
      break;
    case 'w':
      g.fillStyle = '#1e3d4f';
      g.fillRect(px, py, t, t);
      g.strokeStyle = 'rgba(140,220,245,0.5)';
      g.lineWidth = Math.max(1, t * 0.04);
      for (let i = 0; i < 2; i++) {
        const yy = py + t * (0.35 + i * 0.3);
        g.beginPath();
        g.arc(px + t * 0.5, yy, t * 0.18, Math.PI * 1.15, Math.PI * 1.85);
        g.stroke();
      }
      break;
    case 'g':
      g.fillStyle = '#3a2f14';
      g.fillRect(px, py, t, t);
      g.strokeStyle = '#ffd75e';
      g.lineWidth = Math.max(1.5, t * 0.06);
      g.strokeRect(px + t * 0.12, py + t * 0.12, t * 0.76, t * 0.76);
      g.fillStyle = '#ffd75e';
      ellipse(g, cx, cy, t * 0.13, t * 0.13);
      g.fillStyle = '#3a2f14';
      ellipse(g, cx, cy, t * 0.06, t * 0.06);
      break;
    case '~':
      g.fillStyle = '#141f2c';
      g.fillRect(px, py, t, t);
      g.strokeStyle = 'rgba(90,140,190,0.35)';
      g.lineWidth = Math.max(1, t * 0.04);
      g.beginPath();
      g.arc(px + t * (0.3 + hash(x, y, 3) * 0.4), py + t * 0.5, t * 0.2, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      break;
    case '#':
      g.fillStyle = '#4c4c58';
      g.fillRect(px, py, t, t);
      g.fillStyle = '#5d5d6a';
      g.fillRect(px, py, t, t * 0.22);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.lineWidth = Math.max(1, t * 0.03);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(px, py + t * (0.45 + i * 0.2));
        g.lineTo(px + t, py + t * (0.45 + i * 0.2));
        g.stroke();
      }
      g.beginPath();
      g.moveTo(px + t * 0.5, py + t * 0.45);
      g.lineTo(px + t * 0.5, py + t * 0.65);
      g.stroke();
      break;
    case 'W':
      g.fillStyle = '#3e3e48';
      g.fillRect(px, py, t, t);
      g.fillStyle = '#54545f';
      for (let i = 0; i < 4; i++) g.fillRect(px + (i * t) / 4, py, t / 8, t * 0.25);
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = Math.max(1, t * 0.03);
      g.beginPath();
      g.moveTo(px, py + t * 0.55);
      g.lineTo(px + t, py + t * 0.55);
      g.stroke();
      break;
    case 'P':
      g.fillStyle = '#2e2a21';
      g.fillRect(px, py, t, t);
      g.fillStyle = '#8a6a42';
      g.fillRect(px + t * 0.08, py + t * 0.3, t * 0.84, t * 0.4);
      g.fillStyle = '#a5814f';
      g.fillRect(px + t * 0.08, py + t * 0.3, t * 0.84, t * 0.1);
      g.fillStyle = '#5e4526';
      for (let i = 0; i < 3; i++) g.fillRect(px + t * (0.15 + i * 0.3), py + t * 0.22, t * 0.08, t * 0.56);
      break;
    case 'B':
      g.fillStyle = '#33231a';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t);
      g.fillStyle = '#4a4a52';
      ellipse(g, cx, cy + t * 0.08, t * 0.26, t * 0.22);
      g.fillStyle = '#ff7a2e';
      g.beginPath();
      g.moveTo(cx - t * 0.13, cy + t * 0.1);
      g.quadraticCurveTo(cx, cy - t * 0.28, cx + t * 0.13, cy + t * 0.1);
      g.fill();
      g.fillStyle = '#ffd75e';
      ellipse(g, cx, cy + t * 0.04, t * 0.07, t * 0.1);
      break;
    case 'L':
      g.fillStyle = '#2e2c1c';
      g.fillRect(px, py, t, t);
      g.fillStyle = 'rgba(255,220,130,0.18)';
      ellipse(g, cx, cy, t * 0.42, t * 0.42);
      g.strokeStyle = '#5e4a2a';
      g.lineWidth = Math.max(1.5, t * 0.06);
      g.beginPath();
      g.moveTo(cx, py + t * 0.85);
      g.lineTo(cx, py + t * 0.3);
      g.stroke();
      g.fillStyle = '#ffe9a3';
      g.fillRect(cx - t * 0.11, py + t * 0.16, t * 0.22, t * 0.22);
      g.fillStyle = '#8a6a30';
      g.fillRect(cx - t * 0.13, py + t * 0.12, t * 0.26, t * 0.06);
      break;
    case 'c':
      g.fillStyle = '#2c2115';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t);
      g.fillStyle = '#7a5230';
      g.beginPath();
      g.roundRect(px + t * 0.18, py + t * 0.3, t * 0.64, t * 0.36, t * 0.06);
      g.fill();
      g.fillStyle = '#3a2a18';
      ellipse(g, px + t * 0.24, cy + t * 0.1, t * 0.11, t * 0.11);
      ellipse(g, px + t * 0.76, cy + t * 0.1, t * 0.11, t * 0.11);
      break;
    case 'x':
      g.fillStyle = '#26262b';
      g.fillRect(px, py, t, t);
      g.fillStyle = '#6e6e78';
      for (let i = 0; i < 4; i++) {
        const bx = px + t * (0.2 + hash(x, y, 20 + i) * 0.6);
        const by = py + t * (0.25 + hash(x, y, 30 + i) * 0.5);
        const r = t * (0.08 + hash(x, y, 40 + i) * 0.08);
        g.beginPath();
        g.moveTo(bx - r, by + r * 0.6);
        g.lineTo(bx, by - r);
        g.lineTo(bx + r, by + r * 0.5);
        g.closePath();
        g.fill();
      }
      break;
    case 'o':
      g.fillStyle = '#2b2317';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t);
      for (const [ox, oy] of [[0.32, 0.4], [0.66, 0.6]] as const) {
        g.fillStyle = '#8a5f30';
        ellipse(g, px + t * ox, py + t * oy, t * 0.17, t * 0.17);
        g.strokeStyle = '#4a3018';
        g.lineWidth = Math.max(1, t * 0.035);
        g.beginPath();
        g.moveTo(px + t * ox - t * 0.14, py + t * oy);
        g.lineTo(px + t * ox + t * 0.14, py + t * oy);
        g.stroke();
      }
      break;
    case 'T':
      g.fillStyle = '#1e3324';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t, 0.42);
      g.fillStyle = '#2e7a3e';
      ellipse(g, cx - t * 0.12, cy - t * 0.05, t * 0.24, t * 0.22);
      ellipse(g, cx + t * 0.14, cy - t * 0.02, t * 0.22, t * 0.24);
      g.fillStyle = '#3fae5c';
      ellipse(g, cx - t * 0.04, cy - t * 0.14, t * 0.2, t * 0.17);
      g.fillStyle = '#5e4026';
      ellipse(g, cx, cy + t * 0.22, t * 0.05, t * 0.05);
      break;
    case 'R':
      g.fillStyle = '#2a2a30';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t);
      g.fillStyle = '#7a7a86';
      g.beginPath();
      g.moveTo(cx - t * 0.26, cy + t * 0.2);
      g.lineTo(cx - t * 0.12, cy - t * 0.22);
      g.lineTo(cx + t * 0.14, cy - t * 0.16);
      g.lineTo(cx + t * 0.26, cy + t * 0.18);
      g.closePath();
      g.fill();
      g.fillStyle = '#9a9aa6';
      g.beginPath();
      g.moveTo(cx - t * 0.12, cy - t * 0.22);
      g.lineTo(cx + t * 0.02, cy - t * 0.1);
      g.lineTo(cx - t * 0.06, cy + t * 0.02);
      g.closePath();
      g.fill();
      break;
    case 'K':
      g.fillStyle = '#1f3324';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t, 0.3);
      g.fillStyle = '#3fae5c';
      g.beginPath();
      g.roundRect(cx - t * 0.09, py + t * 0.18, t * 0.18, t * 0.56, t * 0.09);
      g.fill();
      g.beginPath();
      g.roundRect(cx - t * 0.26, py + t * 0.4, t * 0.12, t * 0.26, t * 0.06);
      g.fill();
      g.fillStyle = '#5ce07f';
      g.fillRect(cx - t * 0.02, py + t * 0.24, t * 0.04, t * 0.44);
      break;
    case 'U':
      g.fillStyle = '#2e2a20';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t);
      g.fillStyle = '#9a8668';
      ellipse(g, cx, cy + t * 0.12, t * 0.24, t * 0.2);
      g.fillStyle = '#c4b08d';
      g.fillRect(cx - t * 0.1, py + t * 0.1, t * 0.2, t * 0.3);
      g.fillStyle = '#6e5e44';
      g.fillRect(cx - t * 0.1, py + t * 0.1, t * 0.2, t * 0.07);
      break;
    case 'S':
      g.fillStyle = '#2b241a';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t, 0.3);
      g.fillStyle = '#6a4e2e';
      ellipse(g, cx, cy + t * 0.05, t * 0.2, t * 0.18);
      g.fillStyle = '#a5814f';
      ellipse(g, cx, cy + t * 0.05, t * 0.12, t * 0.1);
      break;
    case 'A':
      g.fillStyle = '#33241a';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t, 0.4);
      g.fillStyle = '#c08a5c';
      g.beginPath();
      g.moveTo(cx, py + t * 0.12);
      g.lineTo(cx + t * 0.32, py + t * 0.72);
      g.lineTo(cx - t * 0.32, py + t * 0.72);
      g.closePath();
      g.fill();
      g.strokeStyle = '#7a5230';
      g.lineWidth = Math.max(1, t * 0.04);
      g.beginPath();
      g.moveTo(cx, py + t * 0.12);
      g.lineTo(cx, py + t * 0.72);
      g.stroke();
      break;
    case 'M':
      g.fillStyle = '#1e3326';
      g.fillRect(px, py, t, t);
      shadow(g, px, py, t, 0.38);
      g.strokeStyle = '#4ac06a';
      g.lineWidth = Math.max(1.5, t * 0.06);
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * (0.15 + i * 0.175));
        g.beginPath();
        g.moveTo(cx, cy);
        g.quadraticCurveTo(cx + Math.cos(a) * t * 0.2, cy - t * 0.12 + Math.sin(a) * t * 0.1, cx + Math.cos(a) * t * 0.34, cy + Math.sin(a) * t * 0.22);
        g.stroke();
      }
      g.fillStyle = '#6a4e2e';
      ellipse(g, cx, cy + t * 0.05, t * 0.05, t * 0.05);
      break;
    default:
      g.fillStyle = '#181d26';
      g.fillRect(px, py, t, t);
      break;
  }
}

/** Prateleiras da paleta (nomes que o dono entende). */
export const SHELVES: { label: string; chars: string[] }[] = [
  { label: 'Chão', chars: ['.', ',', ':', 'r', 'w', 'g', '~'] },
  { label: 'Vegetação', chars: ['T', 'M', 'K', 'S'] },
  { label: 'Pedra e ruína', chars: ['R', 'x', 'U', '#'] },
  { label: 'Construções', chars: ['P', 'W', 'A', 'c', 'o'] },
  { label: 'Luz e fogo', chars: ['L', 'B'] },
];
