import * as THREE from 'three';

/**
 * Texturas de efeito geradas em canvas (originais): atlas "flipbook" de fogo e fumaça,
 * decalques de chão (queimado, gelo, rachadura), círculos rúnicos e anel de onda de choque.
 * Tudo é gerado uma vez e reaproveitado.
 */

const cache = new Map<string, THREE.Texture>();
function once(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ruído de valor 2D simples (para pintar no canvas)
function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 64;
  const g = new Float32Array(N * N).map(() => r());
  const at = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const n = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x: number, y: number) => n(x, y) * 0.5 + n(x * 2.1, y * 2.1) * 0.3 + n(x * 4.3, y * 4.3) * 0.2;
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Atlas 4×4 de labaredas (branco-quente; a cor vem da partícula). Quadro = tempo de vida. */
export function flameAtlas(): THREE.Texture {
  return once('flame', () => {
    const F = 64;
    const c = document.createElement('canvas');
    c.width = c.height = F * 4;
    const g = c.getContext('2d')!;
    const img = g.createImageData(F * 4, F * 4);
    const noise = makeNoise(11);
    for (let f = 0; f < 16; f++) {
      const ox = (f % 4) * F;
      const oy = Math.floor(f / 4) * F;
      const life = f / 15; // 0 = nasce, 1 = some
      for (let y = 0; y < F; y++)
        for (let x = 0; x < F; x++) {
          const u = x / (F - 1) - 0.5;
          const v = 1 - y / (F - 1); // 0 embaixo
          const n = noise(x * 0.12 + f * 1.7, y * 0.12 + f * 2.3);
          // gota que afina no topo e se desfaz com a idade
          const width = (0.42 - v * 0.3) * (1 - life * 0.35);
          const shape = Math.max(0, 1 - Math.abs(u + (n - 0.5) * 0.25 * v) / Math.max(0.01, width));
          const vert = Math.max(0, 1 - Math.abs(v - 0.38) / (0.55 - life * 0.15));
          let a = shape * vert * (0.55 + n * 0.9);
          a = Math.max(0, a - life * 0.35 * (1 - n));
          const i = ((oy + y) * F * 4 + ox + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = Math.min(255, a * 255);
        }
    }
    g.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

/** Atlas 4×4 de fumaça (bolhas que se abrem e se desfazem). */
export function smokeAtlas(): THREE.Texture {
  return once('smoke', () => {
    const F = 64;
    const c = document.createElement('canvas');
    c.width = c.height = F * 4;
    const g = c.getContext('2d')!;
    const img = g.createImageData(F * 4, F * 4);
    const noise = makeNoise(23);
    for (let f = 0; f < 16; f++) {
      const ox = (f % 4) * F;
      const oy = Math.floor(f / 4) * F;
      const life = f / 15;
      for (let y = 0; y < F; y++)
        for (let x = 0; x < F; x++) {
          const dx = x / (F - 1) - 0.5;
          const dy = y / (F - 1) - 0.5;
          const d = Math.hypot(dx, dy) * 2;
          const n = noise(x * 0.09 + f * 0.9, y * 0.09 - f * 0.6);
          const edge = 0.55 + life * 0.35 + (n - 0.5) * 0.5;
          let a = Math.max(0, 1 - d / edge) * (0.5 + n * 0.8);
          a *= 1 - life * 0.5;
          const i = ((oy + y) * F * 4 + ox + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
          img.data[i + 3] = Math.min(255, a * 200);
        }
    }
    g.putImageData(img, 0, 0);
    return tex(c, false);
  });
}

/** Faísca: núcleo + cruz fina (brilho de "estrela"). */
export function sparkTexture(): THREE.Texture {
  return once('spark', () => {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.18, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [
      [S, 3],
      [3, S],
    ]) {
      const l = g.createLinearGradient(0, 0, w > h ? S : 0, w > h ? 0 : S);
      l.addColorStop(0, 'rgba(255,255,255,0)');
      l.addColorStop(0.5, 'rgba(255,255,255,0.45)');
      l.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = l;
      g.fillRect((S - w) / 2, (S - h) / 2, w, h);
    }
    return tex(c, false);
  });
}

/**
 * Estrela de impacto estilo anime: estouro de 8 pontas irregulares, recorte seco (sem degradê),
 * miolo branco e borda externa um pouco mais escura — a cor vem do efeito.
 */
export function impactTexture(): THREE.Texture {
  return once('impact', () => {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const r = rng(77);
    const star = (outer: number, inner: number, n: number, rot: number) => {
      g.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = rot + (i / (n * 2)) * Math.PI * 2;
        const rad = i % 2 ? inner : outer * (0.72 + r() * 0.28);
        g[i ? 'lineTo' : 'moveTo'](S / 2 + Math.cos(a) * rad, S / 2 + Math.sin(a) * rad);
      }
      g.closePath();
      g.fill();
    };
    g.fillStyle = 'rgb(150,150,150)';
    star(62, 22, 8, 0.2);
    g.fillStyle = 'rgb(255,255,255)';
    star(46, 16, 8, 0.2);
    return tex(c, false);
  });
}

export type DecalKind = 'scorch' | 'frost' | 'crack' | 'runesFire' | 'runesFrost' | 'ring' | 'glow' | 'aoe' | 'disc';

/** Decalques de chão (alfa na textura, cor/intensidade no material). */
export function decalTexture(kind: DecalKind): THREE.Texture {
  return once('decal-' + kind, () => {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    const r = rng(kind.length * 97 + 3);
    const cx = S / 2;
    if (kind === 'scorch') {
      const img = g.createImageData(S, S);
      const noise = makeNoise(5);
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const d = Math.hypot(x - cx, y - cx) / (S / 2);
          const n = noise(x * 0.05, y * 0.05);
          const a = Math.max(0, 1 - d / (0.55 + n * 0.5)) ** 0.7;
          const i = (y * S + x) * 4;
          const burn = 20 + n * 25;
          img.data[i] = burn;
          img.data[i + 1] = burn * 0.8;
          img.data[i + 2] = burn * 0.7;
          img.data[i + 3] = Math.min(255, a * 235);
        }
      g.putImageData(img, 0, 0);
    } else if (kind === 'frost') {
      g.translate(cx, cx);
      g.strokeStyle = 'rgba(235,248,255,0.95)';
      g.lineCap = 'round';
      const branch = (len: number, w: number, depth: number) => {
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(len, 0);
        g.stroke();
        if (depth <= 0) return;
        for (const t of [0.4, 0.7]) {
          for (const s of [-1, 1]) {
            g.save();
            g.translate(len * t, 0);
            g.rotate(s * (0.7 + r() * 0.3));
            branch(len * 0.4, w * 0.7, depth - 1);
            g.restore();
          }
        }
      };
      for (let i = 0; i < 6; i++) {
        g.save();
        g.rotate((i / 6) * Math.PI * 2 + r() * 0.2);
        branch(90 + r() * 25, 4, 2);
        g.restore();
      }
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 120);
      grd.addColorStop(0, 'rgba(200,235,255,0.55)');
      grd.addColorStop(1, 'rgba(200,235,255,0)');
      g.fillStyle = grd;
      g.fillRect(-128, -128, 256, 256);
    } else if (kind === 'crack') {
      g.translate(cx, cx);
      g.strokeStyle = 'rgba(10,8,8,0.95)';
      g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        let a = (i / 9) * Math.PI * 2 + r() * 0.4;
        let x = 0;
        let y = 0;
        g.lineWidth = 5;
        g.beginPath();
        g.moveTo(0, 0);
        const len = 60 + r() * 60;
        for (let k = 0; k < 6; k++) {
          a += (r() - 0.5) * 0.7;
          x += (Math.cos(a) * len) / 6;
          y += (Math.sin(a) * len) / 6;
          g.lineWidth = 5 - k * 0.7;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 50);
      grd.addColorStop(0, 'rgba(0,0,0,0.75)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(-128, -128, 256, 256);
    } else if (kind === 'runesFire' || kind === 'runesFrost') {
      // círculo mágico original: dois anéis, triângulos entrelaçados e 12 glifos simples
      g.translate(cx, cx);
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.fillStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(0, 0, 118, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(0, 0, 96, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(0, 0, 44, 0, Math.PI * 2);
      g.stroke();
      const poly = (n: number, rad: number, rot: number) => {
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = rot + (i / n) * Math.PI * 2;
          g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
        }
        g.stroke();
      };
      if (kind === 'runesFire') {
        poly(3, 94, -Math.PI / 2);
        poly(3, 94, Math.PI / 2);
      } else {
        poly(6, 94, 0);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(Math.cos(a) * 94, Math.sin(a) * 94);
          g.stroke();
        }
      }
      for (let i = 0; i < 12; i++) {
        g.save();
        g.rotate((i / 12) * Math.PI * 2);
        g.translate(0, -107);
        g.lineWidth = 2;
        const k = i % 4;
        g.beginPath();
        if (k === 0) {
          g.moveTo(-5, 5);
          g.lineTo(0, -6);
          g.lineTo(5, 5);
        } else if (k === 1) {
          g.moveTo(-5, -5);
          g.lineTo(5, 5);
          g.moveTo(5, -5);
          g.lineTo(-5, 5);
        } else if (k === 2) g.arc(0, 0, 5, 0, Math.PI * 2);
        else {
          g.moveTo(0, -6);
          g.lineTo(0, 6);
          g.moveTo(-5, 0);
          g.lineTo(5, 0);
        }
        g.stroke();
        g.restore();
      }
    } else if (kind === 'ring') {
      const grd = g.createRadialGradient(cx, cx, S * 0.3, cx, cx, S * 0.5);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.85, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    } else if (kind === 'aoe') {
      // área de perigo: miolo translúcido, borda grossa e brilhante, anel interno e marcas apontando pro centro
      const R = S / 2 - 4;
      const fill = g.createRadialGradient(cx, cx, 0, cx, cx, R);
      fill.addColorStop(0, 'rgba(255,255,255,0.10)');
      fill.addColorStop(0.75, 'rgba(255,255,255,0.28)');
      fill.addColorStop(0.95, 'rgba(255,255,255,0.55)');
      fill.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fill;
      g.beginPath();
      g.arc(cx, cx, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,1)';
      g.lineWidth = 7;
      g.beginPath();
      g.arc(cx, cx, R - 5, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      g.globalAlpha = 0.6;
      g.beginPath();
      g.arc(cx, cx, R * 0.62, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 0.85;
      g.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.save();
        g.translate(cx + Math.cos(a) * R * 0.8, cx + Math.sin(a) * R * 0.8);
        g.rotate(a + Math.PI);
        g.beginPath();
        g.moveTo(10, 0);
        g.lineTo(-6, -8);
        g.lineTo(-2, 0);
        g.lineTo(-6, 8);
        g.closePath();
        g.fill();
        g.restore();
      }
      g.globalAlpha = 1;
    } else if (kind === 'disc') {
      const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.9, 'rgba(255,255,255,0.75)');
      grd.addColorStop(0.97, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    } else {
      const grd = g.createRadialGradient(cx, cx, 0, cx, cx, S / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.4, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    return tex(c, false);
  });
}

/** Gradiente horizontal para as fitas (ribbon): forte no centro, some nas bordas. */
export function ribbonTexture(): THREE.Texture {
  return once('ribbon', () => {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(0.65, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 64);
    return tex(c, false);
  });
}
