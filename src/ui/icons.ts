/**
 * Ícones de habilidade desenhados em canvas (originais), no formato de
 * "skill icon" pequeno e pintado dos MMOs clássicos: 32px, moldura escura, brilho.
 */
function icon(draw: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  draw(g);
  // moldura
  g.strokeStyle = 'rgba(20,24,40,0.9)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 61, 61);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.strokeRect(4.5, 4.5, 55, 55);
  return c.toDataURL();
}

export const ICONS = {
  frostBolt: () =>
    icon((g) => {
      const bg = g.createRadialGradient(40, 24, 2, 32, 32, 46);
      bg.addColorStop(0, '#1d4a78');
      bg.addColorStop(1, '#060d1e');
      g.fillStyle = bg;
      g.fillRect(0, 0, 64, 64);
      // rastro
      const tr = g.createLinearGradient(8, 56, 44, 20);
      tr.addColorStop(0, 'rgba(90,200,255,0)');
      tr.addColorStop(1, 'rgba(150,235,255,0.85)');
      g.strokeStyle = tr;
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(10, 54);
      g.lineTo(42, 22);
      g.stroke();
      // cristal (losango alongado) apontando para cima-direita
      g.save();
      g.translate(44, 20);
      g.rotate(Math.PI / 4);
      const cr = g.createLinearGradient(0, -16, 0, 12);
      cr.addColorStop(0, '#ffffff');
      cr.addColorStop(0.5, '#9fe8ff');
      cr.addColorStop(1, '#2f7fd0');
      g.fillStyle = cr;
      g.beginPath();
      g.moveTo(0, -17);
      g.lineTo(6, 0);
      g.lineTo(0, 12);
      g.lineTo(-6, 0);
      g.closePath();
      g.fill();
      g.restore();
      // cristaizinhos
      g.fillStyle = 'rgba(220,250,255,0.9)';
      for (const [x, y] of [[18, 40], [26, 48], [14, 30], [30, 38]]) g.fillRect(x, y, 2, 2);
    }),
  bash: () =>
    icon((g) => {
      const bg = g.createRadialGradient(34, 34, 2, 32, 32, 46);
      bg.addColorStop(0, '#6a3a18');
      bg.addColorStop(1, '#140a06');
      g.fillStyle = bg;
      g.fillRect(0, 0, 64, 64);
      // estrela de impacto
      g.fillStyle = 'rgba(255,200,90,0.9)';
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 9 : 22;
        g.lineTo(38 + Math.cos(a) * r, 36 + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#fff6d0';
      g.beginPath();
      g.arc(38, 36, 6, 0, Math.PI * 2);
      g.fill();
      // espada descendo em diagonal
      g.save();
      g.translate(24, 22);
      g.rotate(-Math.PI / 4);
      const bl = g.createLinearGradient(-4, 0, 4, 0);
      bl.addColorStop(0, '#9aa6b8');
      bl.addColorStop(0.5, '#f4f7ff');
      bl.addColorStop(1, '#7a8598');
      g.fillStyle = bl;
      g.beginPath();
      g.moveTo(-4, -2);
      g.lineTo(4, -2);
      g.lineTo(4, 24);
      g.lineTo(0, 30);
      g.lineTo(-4, 24);
      g.closePath();
      g.fill();
      g.fillStyle = '#c99a3a';
      g.fillRect(-10, -6, 20, 4);
      g.fillStyle = '#5a3a1e';
      g.fillRect(-2.5, -18, 5, 12);
      g.restore();
    }),
  fireBarrier: () =>
    icon((g) => {
      const bg = g.createLinearGradient(0, 0, 0, 64);
      bg.addColorStop(0, '#3a1408');
      bg.addColorStop(1, '#120604');
      g.fillStyle = bg;
      g.fillRect(0, 0, 64, 64);
      // parede de chamas: 4 línguas de fogo
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 14;
        const h = 30 + (i % 2) * 10;
        const grd = g.createLinearGradient(0, 56, 0, 56 - h);
        grd.addColorStop(0, '#fff2a8');
        grd.addColorStop(0.35, '#ffb02e');
        grd.addColorStop(0.75, '#e8461a');
        grd.addColorStop(1, 'rgba(160,20,5,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x - 2, 56);
        g.quadraticCurveTo(x - 6, 56 - h * 0.5, x + 6, 56 - h);
        g.quadraticCurveTo(x + 12, 56 - h * 0.45, x + 14, 56);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#6b4a2b';
      g.fillRect(4, 55, 56, 5);
    }),
  cleave: () =>
    icon((g) => {
      const bg = g.createRadialGradient(32, 40, 4, 32, 40, 44);
      bg.addColorStop(0, '#5a6b8c');
      bg.addColorStop(1, '#141a2a');
      g.fillStyle = bg;
      g.fillRect(0, 0, 64, 64);
      // arco do golpe
      g.strokeStyle = 'rgba(255,230,170,0.9)';
      g.lineWidth = 5;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(32, 46, 24, Math.PI * 1.12, Math.PI * 1.88);
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(32, 46, 19, Math.PI * 1.18, Math.PI * 1.82);
      g.stroke();
      // espada
      g.save();
      g.translate(32, 44);
      g.rotate(-0.6);
      g.fillStyle = '#e6ecf2';
      g.fillRect(-2.5, -30, 5, 26);
      g.fillStyle = '#c9a24a';
      g.fillRect(-8, -4, 16, 4);
      g.fillStyle = '#5a3a22';
      g.fillRect(-2, 0, 4, 9);
      g.restore();
    }),
};

/** Ícone de equipamento (arma / armadura / acessório) com moldura na cor da raridade. */
export function itemIconCanvas(slot: 'weapon' | 'armor' | 'accessory', rarityColor: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const bg = g.createRadialGradient(32, 32, 4, 32, 32, 40);
  bg.addColorStop(0, '#3a4058');
  bg.addColorStop(1, '#141826');
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
  g.save();
  g.translate(32, 32);
  if (slot === 'weapon') {
    g.rotate(-Math.PI / 4);
    g.fillStyle = '#e6ecf2';
    g.fillRect(-3, -26, 6, 34);
    g.fillStyle = '#c9a24a';
    g.fillRect(-10, 6, 20, 5);
    g.fillStyle = '#6b4a2b';
    g.fillRect(-2.5, 11, 5, 12);
  } else if (slot === 'armor') {
    g.fillStyle = '#9aa3ad';
    g.beginPath();
    g.moveTo(-18, -16);
    g.lineTo(-8, -20);
    g.lineTo(0, -14);
    g.lineTo(8, -20);
    g.lineTo(18, -16);
    g.lineTo(15, 18);
    g.lineTo(0, 22);
    g.lineTo(-15, 18);
    g.closePath();
    g.fill();
    g.fillStyle = '#c9a24a';
    g.fillRect(-15, 2, 30, 4);
  } else {
    g.strokeStyle = '#e8c05a';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 4, 13, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = rarityColor;
    g.beginPath();
    g.arc(0, -11, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.strokeStyle = rarityColor;
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, 59, 59);
  return c;
}

// ---------------- Ícones das habilidades da árvore (desenhos originais) ----------------
function bgRadial(g: CanvasRenderingContext2D, a: string, b: string): void {
  const bg = g.createRadialGradient(32, 26, 2, 32, 32, 46);
  bg.addColorStop(0, a);
  bg.addColorStop(1, b);
  g.fillStyle = bg;
  g.fillRect(0, 0, 64, 64);
}
function glowStroke(g: CanvasRenderingContext2D, color: string, w: number, blur = 8): void {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = blur;
}
function flame(g: CanvasRenderingContext2D, x: number, y: number, s: number, c1: string, c2: string): void {
  const gr = g.createLinearGradient(x, y - 18 * s, x, y + 6 * s);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y - 20 * s);
  g.bezierCurveTo(x + 10 * s, y - 8 * s, x + 9 * s, y + 6 * s, x, y + 6 * s);
  g.bezierCurveTo(x - 9 * s, y + 6 * s, x - 10 * s, y - 6 * s, x, y - 20 * s);
  g.fill();
}

export const SKILL_ICONS: Record<string, () => string> = {
  frostBolt: ICONS.frostBolt,
  fireBarrier: ICONS.fireBarrier,
  bash: ICONS.bash,
  cleave: ICONS.cleave,
  meditation: () =>
    icon((g) => {
      bgRadial(g, '#3a3f8a', '#0b0c24');
      glowStroke(g, '#b8c8ff', 3, 10);
      g.beginPath();
      g.arc(32, 36, 16, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
      g.fillStyle = '#e8ecff';
      g.beginPath();
      g.arc(32, 22, 5, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(20, 46);
      g.quadraticCurveTo(32, 30, 44, 46);
      g.quadraticCurveTo(32, 40, 20, 46);
      g.fill();
      g.shadowBlur = 0;
    }),
  frostNova: () =>
    icon((g) => {
      bgRadial(g, '#3a8ad0', '#061228');
      glowStroke(g, '#dff6ff', 3, 10);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.moveTo(32, 32);
        g.lineTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
        g.moveTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13);
        g.lineTo(32 + Math.cos(a + 0.45) * 18, 32 + Math.sin(a + 0.45) * 18);
        g.moveTo(32 + Math.cos(a) * 13, 32 + Math.sin(a) * 13);
        g.lineTo(32 + Math.cos(a - 0.45) * 18, 32 + Math.sin(a - 0.45) * 18);
        g.stroke();
      }
      g.shadowBlur = 0;
    }),
  doubleBarrier: () =>
    icon((g) => {
      bgRadial(g, '#5a1e08', '#140402');
      for (let i = 0; i < 4; i++) flame(g, 14 + i * 12, 30, 0.6, '#ffe07a', '#d8401a');
      for (let i = 0; i < 3; i++) flame(g, 32, 18 + i * 14, 0.5, '#fff0a0', '#ff6a2a');
    }),
  arcaneShield: () =>
    icon((g) => {
      bgRadial(g, '#5a3aa8', '#10082a');
      glowStroke(g, '#c8a8ff', 3.5, 12);
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        g[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20);
      }
      g.closePath();
      g.stroke();
      g.fillStyle = 'rgba(200,170,255,0.35)';
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#f2eaff';
      g.fillRect(30, 22, 4, 20);
      g.fillRect(22, 30, 20, 4);
    }),
  thunderstorm: () =>
    icon((g) => {
      bgRadial(g, '#2a2a5a', '#06061a');
      g.fillStyle = '#3a3a5a';
      g.beginPath();
      g.ellipse(24, 16, 14, 8, 0, 0, Math.PI * 2);
      g.ellipse(40, 15, 13, 8, 0, 0, Math.PI * 2);
      g.fill();
      glowStroke(g, '#e8e0ff', 3.5, 12);
      g.beginPath();
      g.moveTo(34, 20);
      g.lineTo(26, 34);
      g.lineTo(34, 34);
      g.lineTo(24, 54);
      g.stroke();
      g.shadowBlur = 0;
    }),
  combustion: () =>
    icon((g) => {
      bgRadial(g, '#7a2a08', '#180402');
      flame(g, 32, 40, 1.2, '#fff0a0', '#e04a10');
      flame(g, 16, 46, 0.6, '#ffd070', '#c83a10');
      flame(g, 48, 46, 0.6, '#ffd070', '#c83a10');
      g.fillStyle = '#ffe8a0';
      for (const [x, y] of [[12, 30], [52, 28], [22, 20], [44, 18]]) g.fillRect(x, y, 3, 3);
    }),
  ironSkin: () =>
    icon((g) => {
      bgRadial(g, '#5a6070', '#12141a');
      const gr = g.createLinearGradient(16, 12, 48, 52);
      gr.addColorStop(0, '#e8ecf2');
      gr.addColorStop(1, '#5a6272');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(32, 10);
      g.lineTo(50, 18);
      g.quadraticCurveTo(50, 44, 32, 54);
      g.quadraticCurveTo(14, 44, 14, 18);
      g.closePath();
      g.fill();
      g.strokeStyle = '#2a2e38';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#3a404c';
      for (const [x, y] of [[24, 22], [40, 22], [24, 38], [40, 38]]) {
        g.beginPath();
        g.arc(x, y, 2.5, 0, Math.PI * 2);
        g.fill();
      }
    }),
  taunt: () =>
    icon((g) => {
      bgRadial(g, '#6a1414', '#180404');
      glowStroke(g, '#ff8a6a', 3, 8);
      for (const r of [10, 17, 24]) {
        g.beginPath();
        g.arc(22, 32, r, -0.7, 0.7);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.fillStyle = '#ffd0b0';
      g.beginPath();
      g.moveTo(12, 24);
      g.lineTo(24, 32);
      g.lineTo(12, 40);
      g.closePath();
      g.fill();
    }),
  shatter: () =>
    icon((g) => {
      bgRadial(g, '#4a5a7a', '#0e121c');
      glowStroke(g, '#dfe8ff', 4, 8);
      g.beginPath();
      g.arc(20, 44, 26, -1.3, -0.1);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = '#c8d4f0';
      for (const [x, y, s] of [[46, 22, 6], [52, 34, 4], [40, 14, 3], [54, 16, 3]]) {
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s, y);
        g.lineTo(x, y + s);
        g.lineTo(x - s * 0.6, y);
        g.fill();
      }
    }),
  battleBreath: () =>
    icon((g) => {
      bgRadial(g, '#1e5a2a', '#041408');
      g.fillStyle = '#ff6a6a';
      g.beginPath();
      g.moveTo(32, 48);
      g.bezierCurveTo(10, 34, 16, 14, 32, 24);
      g.bezierCurveTo(48, 14, 54, 34, 32, 48);
      g.fill();
      glowStroke(g, '#9aff9a', 2.5, 8);
      g.beginPath();
      g.arc(32, 32, 22, 0.3, Math.PI * 1.6);
      g.stroke();
      g.shadowBlur = 0;
    }),
  shockwave: () =>
    icon((g) => {
      bgRadial(g, '#6a4a20', '#140c04');
      glowStroke(g, '#ffd08a', 3, 8);
      for (const r of [8, 15, 22]) {
        g.beginPath();
        g.ellipse(32, 46, r * 1.3, r * 0.45, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.fillStyle = '#e8d8c0';
      g.fillRect(27, 12, 10, 26);
      g.fillRect(23, 30, 18, 8);
    }),
  fury: () =>
    icon((g) => {
      bgRadial(g, '#8a1a08', '#1a0402');
      flame(g, 32, 44, 1.4, '#ffe080', '#c82a08');
      g.fillStyle = '#1a0402';
      g.beginPath();
      g.moveTo(20, 30);
      g.lineTo(30, 34);
      g.lineTo(21, 36);
      g.fill();
      g.beginPath();
      g.moveTo(44, 30);
      g.lineTo(34, 34);
      g.lineTo(43, 36);
      g.fill();
    }),
};

function arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col = '#f2e6c8'): void {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.strokeStyle = col;
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
  g.fillStyle = '#d8dee8';
  g.beginPath();
  g.moveTo(x1 + Math.cos(a) * 7, y1 + Math.sin(a) * 7);
  g.lineTo(x1 + Math.cos(a + 2.5) * 7, y1 + Math.sin(a + 2.5) * 7);
  g.lineTo(x1 + Math.cos(a - 2.5) * 7, y1 + Math.sin(a - 2.5) * 7);
  g.fill();
  g.strokeStyle = '#c84a3a';
  g.lineWidth = 2;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x0 + Math.cos(a + s * 2.6) * 7, y0 + Math.sin(a + s * 2.6) * 7);
    g.stroke();
  }
}
Object.assign(SKILL_ICONS, {
  preciseShot: () =>
    icon((g) => {
      bgRadial(g, '#3a5a2a', '#0a1406');
      glowStroke(g, 'rgba(255,240,180,0.6)', 2, 8);
      g.beginPath();
      g.arc(44, 20, 9, 0, Math.PI * 2);
      g.stroke();
      g.shadowBlur = 0;
      arrow(g, 12, 52, 42, 22);
    }),
  arrowRain: () =>
    icon((g) => {
      bgRadial(g, '#2a4a5a', '#06101a');
      for (const [x, y] of [[16, 10], [30, 18], [44, 8], [22, 30], [38, 34], [50, 24]]) arrow(g, x - 4, y - 8, x + 2, y + 12);
      g.fillStyle = 'rgba(200,180,140,0.5)';
      g.fillRect(6, 52, 52, 4);
    }),
  eagleEye: () =>
    icon((g) => {
      bgRadial(g, '#6a5a2a', '#140e04');
      g.fillStyle = '#f2e6c8';
      g.beginPath();
      g.ellipse(32, 32, 22, 12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#d8a030';
      g.beginPath();
      g.arc(32, 32, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1a1006';
      g.beginPath();
      g.arc(32, 32, 4, 0, Math.PI * 2);
      g.fill();
    }),
  piercing: () =>
    icon((g) => {
      bgRadial(g, '#4a4a6a', '#0a0a14');
      glowStroke(g, '#bfe0ff', 2, 10);
      g.beginPath();
      g.moveTo(6, 44);
      g.lineTo(58, 18);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = '#7a8a9a';
      for (const x of [22, 36]) {
        g.beginPath();
        g.arc(x, 44 - (x - 6) / 2, 6, 0, Math.PI * 2);
        g.fill();
      }
      arrow(g, 8, 44, 54, 21);
    }),
  volley: () =>
    icon((g) => {
      bgRadial(g, '#3a4a6a', '#080c1a');
      for (let i = 0; i < 9; i++) arrow(g, 8 + i * 6, 6 + (i % 3) * 6, 12 + i * 6, 30 + (i % 3) * 8);
    }),
  doubleShot: () =>
    icon((g) => {
      bgRadial(g, '#4a3a5a', '#0e0814');
      arrow(g, 10, 40, 50, 16);
      arrow(g, 12, 54, 52, 30);
    }),
  fireRain: () =>
    icon((g) => {
      bgRadial(g, '#6a2a0a', '#180602');
      for (const [x, y] of [[18, 12], [34, 8], [48, 16]]) arrow(g, x - 3, y - 6, x + 2, y + 14, '#ffd070');
      flame(g, 20, 52, 0.6, '#ffe080', '#d84010');
      flame(g, 34, 54, 0.7, '#ffe080', '#d84010');
      flame(g, 48, 52, 0.6, '#ffe080', '#d84010');
    }),
  hunterFocus: () =>
    icon((g) => {
      bgRadial(g, '#1e5a3a', '#04140a');
      glowStroke(g, '#9aff9a', 2.5, 10);
      for (const r of [8, 16, 24]) {
        g.beginPath();
        g.arc(32, 32, r, 0, Math.PI * 2);
        g.stroke();
      }
      g.shadowBlur = 0;
      g.fillStyle = '#eaffea';
      g.fillRect(31, 6, 2, 52);
      g.fillRect(6, 31, 52, 2);
    }),
});

// ---------------- Muralha, Armadilha e classes avançadas ----------------
/** Ícone simples: fundo radial + traço brilhante desenhado por `draw`. */
const glyph = (inner: string, outer: string, stroke: string, draw: (g: CanvasRenderingContext2D) => void) => () =>
  icon((g) => {
    bgRadial(g, inner, outer);
    glowStroke(g, stroke, 3, 10);
    g.fillStyle = stroke;
    draw(g);
    g.shadowBlur = 0;
  });
const star = (g: CanvasRenderingContext2D, x: number, y: number, r: number, n = 5) => {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
};
Object.assign(SKILL_ICONS, {
  shieldWall: glyph('#6a6458', '#16140f', '#e8e0cc', (g) => {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.strokeRect(10 + c * 15 + (r % 2) * 7 - 3, 14 + r * 12, 14, 10);
    g.beginPath();
    g.moveTo(32, 22);
    g.lineTo(44, 28);
    g.lineTo(42, 44);
    g.lineTo(32, 52);
    g.lineTo(22, 44);
    g.lineTo(20, 28);
    g.closePath();
    g.fill();
  }),
  snareTrap: glyph('#5a4a2a', '#120c04', '#f0d8a0', (g) => {
    g.beginPath();
    g.arc(32, 36, 16, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(32 + Math.cos(a) * 16, 36 + Math.sin(a) * 16);
      g.lineTo(32 + Math.cos(a) * 8, 36 + Math.sin(a) * 8);
      g.stroke();
    }
  }),
  arcaneOrb: glyph('#7a3ac0', '#12041e', '#f0d0ff', (g) => {
    g.beginPath();
    g.arc(32, 32, 11, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(32, 32, 19, 0.3, Math.PI * 1.6);
    g.stroke();
  }),
  meteorStrike: glyph('#a04a1a', '#1e0804', '#ffd08a', (g) => {
    g.beginPath();
    g.arc(38, 38, 10, 0, Math.PI * 2);
    g.fill();
    for (const o of [-6, 0, 6]) {
      g.beginPath();
      g.moveTo(10 + o, 12 - o);
      g.lineTo(30 + o, 32 - o);
      g.stroke();
    }
  }),
  arcaneFlow: glyph('#4a3a9a', '#0a0620', '#d8c8ff', (g) => {
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(10, 22 + i * 10);
      g.bezierCurveTo(24, 12 + i * 10, 40, 32 + i * 10, 54, 22 + i * 10);
      g.stroke();
    }
  }),
  chainLightning: glyph('#3a5ac0', '#060a24', '#e0f0ff', (g) => {
    g.beginPath();
    g.moveTo(12, 14);
    g.lineTo(28, 30);
    g.lineTo(22, 34);
    g.lineTo(40, 52);
    g.lineTo(34, 36);
    g.lineTo(42, 32);
    g.lineTo(28, 14);
    g.stroke();
  }),
  meteorShower: glyph('#a0381a', '#1a0604', '#ffc070', (g) => {
    for (const [x, y] of [[20, 24], [40, 20], [32, 44]]) {
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
    }
  }),
  lifeDrain: glyph('#8a1a3a', '#1a0408', '#ffb0c8', (g) => {
    g.beginPath();
    g.moveTo(32, 50);
    g.bezierCurveTo(10, 34, 16, 14, 32, 24);
    g.bezierCurveTo(48, 14, 54, 34, 32, 50);
    g.fill();
  }),
  curse: glyph('#6a1a6a', '#120412', '#ff9aff', (g) => {
    star(g, 32, 32, 18);
    g.stroke();
    g.beginPath();
    g.arc(32, 32, 22, 0, Math.PI * 2);
    g.stroke();
  }),
  darkPact: glyph('#3a0a2a', '#08020a', '#ff6a9a', (g) => {
    g.beginPath();
    g.moveTo(32, 10);
    g.lineTo(32, 54);
    g.moveTo(18, 24);
    g.lineTo(46, 24);
    g.stroke();
  }),
  shadowSwarm: glyph('#2a1a4a', '#06040e', '#c8a0ff', (g) => {
    for (const [x, y] of [[20, 22], [40, 18], [28, 38], [46, 40], [16, 46]]) {
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }),
  soulHarvest: glyph('#1a5a5a', '#041212', '#a0fff0', (g) => {
    g.beginPath();
    g.arc(32, 30, 14, Math.PI * 0.2, Math.PI * 1.4);
    g.stroke();
    g.beginPath();
    g.moveTo(32, 30);
    g.lineTo(32, 54);
    g.stroke();
  }),
  backstab: glyph('#5a4a1a', '#120e04', '#ffe8a0', (g) => {
    g.beginPath();
    g.moveTo(14, 50);
    g.lineTo(46, 18);
    g.lineTo(50, 14);
    g.lineTo(48, 22);
    g.closePath();
    g.stroke();
  }),
  bladeFan: glyph('#6a5a1a', '#141004', '#fff0b0', (g) => {
    for (const a of [-0.5, 0, 0.5]) {
      g.beginPath();
      g.moveTo(32, 50);
      g.lineTo(32 + Math.sin(a) * 30, 50 - Math.cos(a) * 30);
      g.stroke();
    }
  }),
  shadowStep: glyph('#2a2a3a', '#06060a', '#c8d0ff', (g) => {
    for (const [x, y] of [[22, 44], [32, 32], [42, 20]]) {
      g.beginPath();
      g.ellipse(x, y, 5, 8, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }),
  poisonBlades: glyph('#2a5a1a', '#061204', '#b0ff80', (g) => {
    g.beginPath();
    g.moveTo(16, 48);
    g.lineTo(44, 20);
    g.stroke();
    g.beginPath();
    g.arc(46, 46, 6, 0, Math.PI * 2);
    g.fill();
  }),
  execute: glyph('#7a1a1a', '#160404', '#ffd0a0', (g) => {
    g.beginPath();
    g.moveTo(14, 14);
    g.lineTo(50, 50);
    g.moveTo(50, 14);
    g.lineTo(14, 50);
    g.stroke();
  }),
});
