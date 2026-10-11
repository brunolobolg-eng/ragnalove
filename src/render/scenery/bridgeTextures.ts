import * as THREE from 'three';

/**
 * Texturas pintadas em canvas para a zona da ponte (originais): lajes de pedra
 * azul-acinzentada gastas, calçamento da praça, blocos das muralhas, madeira e telhas.
 * Tudo com o mesmo "pincel" simples do resto do jogo (manchas + rejunte + rachaduras).
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const pick = <T>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, rx = 1, ry = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  return t;
}

/** Pedra com variação interna: base + manchas + bisel claro em cima / escuro embaixo. */
function stone(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, r: () => number, round = 3): void {
  g.fillStyle = base;
  g.beginPath();
  g.roundRect(x, y, w, h, round);
  g.fill();
  for (let i = 0; i < 4; i++) {
    const cx = x + r() * w;
    const cy = y + r() * h;
    const rad = Math.min(w, h) * (0.3 + r() * 0.5);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const light = r() > 0.5;
    grd.addColorStop(0, light ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
  }
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(x + 2, y + 1, w - 4, 2);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x + 2, y + h - 3, w - 4, 2);
}

function crack(g: CanvasRenderingContext2D, x: number, y: number, len: number, r: () => number): void {
  g.strokeStyle = 'rgba(20,22,28,0.55)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x, y);
  let cx = x;
  let cy = y;
  let a = r() * Math.PI * 2;
  for (let i = 0; i < 5; i++) {
    a += (r() - 0.5) * 1.2;
    cx += Math.cos(a) * (len / 5);
    cy += Math.sin(a) * (len / 5);
    g.lineTo(cx, cy);
  }
  g.stroke();
}

function moss(g: CanvasRenderingContext2D, x: number, y: number, rad: number): void {
  const grd = g.createRadialGradient(x, y, 0, x, y, rad);
  grd.addColorStop(0, 'rgba(78,96,58,0.55)');
  grd.addColorStop(1, 'rgba(78,96,58,0)');
  g.fillStyle = grd;
  g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
}

/** Blocos grandes de muralha/parapeito (cinza frio), 256 px ≈ 2 m. */
export function wallBlockTexture(seed = 9): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const r = rng(seed);
  g.fillStyle = '#3a3c42';
  g.fillRect(0, 0, S, S);
  const cols = ['#707279', '#686a71', '#76787e', '#61636a', '#6d6e73'];
  const rowH = 42;
  for (let row = 0; row * rowH < S; row++) {
    let x = row % 2 ? -36 : 0;
    while (x < S) {
      const w = 60 + Math.floor(r() * 3) * 14;
      stone(g, x + 2, row * rowH + 2, w - 4, rowH - 4, pick(r, cols), r, 2);
      if (x + w > S) stone(g, x + 2 - S, row * rowH + 2, w - 4, rowH - 4, pick(r, cols), r, 2);
      x += w;
    }
  }
  for (let i = 0; i < 5; i++) crack(g, r() * S, r() * S, 14 + r() * 24, r);
  for (let i = 0; i < 6; i++) moss(g, r() * S, S * (0.6 + r() * 0.4), 8 + r() * 18);
  return finish(c);
}

/** Lateral da ponte: blocos + arcos escuros (o vão por onde a água passa). */
export function bridgeSideTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  const r = rng(51);
  const blocks = wallBlockTexture(51).image as HTMLCanvasElement;
  for (let x = 0; x < W; x += 256) g.drawImage(blocks, x, 0, 256, 256);
  // arco: um por textura (a textura repete ao longo da ponte)
  const cx = W / 2;
  const top = 70;
  g.fillStyle = '#0b0e16';
  g.beginPath();
  g.moveTo(cx - 150, H);
  g.lineTo(cx - 150, top + 120);
  g.ellipse(cx, top + 120, 150, 120, 0, Math.PI, 0);
  g.lineTo(cx + 150, H);
  g.fill();
  // aduelas do arco
  g.strokeStyle = '#8a8c92';
  g.lineWidth = 10;
  g.beginPath();
  g.ellipse(cx, top + 120, 158, 128, 0, Math.PI, 0);
  g.stroke();
  g.strokeStyle = '#3a3c42';
  g.lineWidth = 2;
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 150, top + 120 + Math.sin(a) * 120);
    g.lineTo(cx + Math.cos(a) * 166, top + 120 + Math.sin(a) * 136);
    g.stroke();
  }
  // escorrido de umidade embaixo
  const wet = g.createLinearGradient(0, H * 0.55, 0, H);
  wet.addColorStop(0, 'rgba(10,20,30,0)');
  wet.addColorStop(1, 'rgba(10,20,30,0.55)');
  g.fillStyle = wet;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++) moss(g, r() * W, H * (0.7 + r() * 0.3), 14 + r() * 20);
  return finish(c);
}

export function woodTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(5);
  const cols = ['#6d4a2c', '#5f3f25', '#77522f', '#654427'];
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = pick(r, cols);
    g.fillRect(0, y, 128, 15);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, y + 15, 128, 1);
    g.strokeStyle = 'rgba(30,18,8,0.35)';
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(0, y + 3 + r() * 10);
      g.bezierCurveTo(40, y + r() * 15, 80, y + r() * 15, 128, y + 3 + r() * 10);
      g.stroke();
    }
  }
  return finish(c);
}

export function roofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(17);
  g.fillStyle = '#2a1414';
  g.fillRect(0, 0, 128, 128);
  const cols = ['#6e2a24', '#7a3029', '#62251f', '#83372d'];
  for (let y = 0; y < 128; y += 16)
    for (let x = (y / 16) % 2 ? -8 : 0; x < 128; x += 16) {
      g.fillStyle = pick(r, cols);
      g.beginPath();
      g.roundRect(x + 1, y + 1, 14, 15, [0, 0, 7, 7]);
      g.fill();
    }
  return finish(c);
}
