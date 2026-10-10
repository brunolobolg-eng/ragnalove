import * as THREE from 'three';

/**
 * Texturas e formas desenhadas por código, sem arquivo de imagem: anéis de energia, rachaduras, poça de veneno,
 * anel de runas, disco suave, pedras de cantaria, bandeira e cristais. Cada textura é gerada uma vez e reaproveitada.
 * Energia, rachadura e poça são brancas com alfa (aditivas, tingidas pelo material); pedra e bandeira são cores chapadas.
 */

const textures = new Map<string, THREE.Texture>();
const geometries = new Map<string, THREE.BufferGeometry>();

/** Textura de canvas gerada uma vez (chave). Sem contexto 2D, fica transparente em vez de quebrar. */
function paint(key: string, size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  let t = textures.get(key);
  if (!t) {
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d');
    if (g) draw(g, size);
    t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(key, t);
  }
  return t;
}

/** Gerador pequeno e determinístico: a mesma semente desenha sempre a mesma forma. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** Anel de energia: três arcos com falhas e faíscas nas bordas (o brilho vem do material). */
export function energyRingTexture(): THREE.Texture {
  return paint('energyRing', 512, (g, s) => {
    const r = rng(7);
    const c = s / 2;
    const halo = g.createRadialGradient(c, c, s * 0.34, c, c, s * 0.5);
    halo.addColorStop(0, 'rgba(255,255,255,0)');
    halo.addColorStop(0.55, 'rgba(255,255,255,0.3)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, s, s);
    for (const [rad, w, a] of [[0.44, 4, 0.95], [0.41, 2, 0.7], [0.47, 1.5, 0.6]] as const) {
      let ang = 0;
      while (ang < Math.PI * 2) {
        const len = 0.3 + r() * 0.9;
        g.beginPath();
        g.arc(c, c, s * rad, ang, ang + len);
        g.strokeStyle = `rgba(255,255,255,${a * (0.6 + r() * 0.4)})`;
        g.lineWidth = w * (0.6 + r());
        g.stroke();
        ang += len + 0.05 + r() * 0.25;
      }
    }
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = s * (0.38 + r() * 0.12);
      g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`;
      g.fillRect(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + r() * 2, 2 + r() * 2);
    }
  });
}

/** Rachaduras de luz no chão: linhas tortas que se ramificam a partir do centro. */
export function crackTexture(): THREE.Texture {
  return paint('cracks', 512, (g, s) => {
    const r = rng(21);
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
      let px = x;
      let py = y;
      let pa = a;
      const steps = 6 + Math.floor(r() * 6);
      for (let i = 0; i < steps; i++) {
        pa += (r() - 0.5) * 0.7;
        const seg = len / steps;
        const nx = px + Math.cos(pa) * seg;
        const ny = py + Math.sin(pa) * seg;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(nx, ny);
        g.strokeStyle = 'rgba(255,255,255,0.9)';
        g.lineWidth = w;
        g.lineCap = 'round';
        g.stroke();
        px = nx;
        py = ny;
        if (depth > 0 && r() < 0.25) branch(px, py, pa + (r() > 0.5 ? 0.6 : -0.6), len * 0.45, w * 0.6, depth - 1);
      }
    };
    for (let k = 0; k < 7; k++) branch(s / 2, s / 2, (k / 7) * Math.PI * 2 + r() * 0.3, s * 0.42, 3, 3);
  });
}

/** Poça de veneno: muitas bolhas de brilho com a borda apagada (núcleo mais forte, sem contorno reto). */
export function poolTexture(): THREE.Texture {
  return paint('pool', 512, (g, s) => {
    const r = rng(33);
    const c = s / 2;
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.pow(r(), 0.6) * s * 0.36;
      const x = c + Math.cos(a) * d;
      const y = c + Math.sin(a) * d;
      const rad = s * (0.04 + r() * 0.09);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(c, c, 0, c, c, s * 0.5);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(0.7, 'rgba(0,0,0,0.9)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'source-over';
  });
}

/** Anel de runas: dois círculos e runas (traços, triângulos e cruzes) em volta. */
export function runeRingTexture(): THREE.Texture {
  return paint('runes', 512, (g, s) => {
    const r = rng(45);
    const c = s / 2;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, s * 0.44, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 2;
    g.beginPath();
    g.arc(c, c, s * 0.37, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + r() * 0.05;
      const d = s * 0.405;
      g.save();
      g.translate(c + Math.cos(a) * d, c + Math.sin(a) * d);
      g.rotate(a + Math.PI / 2);
      g.lineWidth = 2.5;
      g.beginPath();
      const kind = Math.floor(r() * 3);
      if (kind === 0) {
        g.moveTo(-8, 0);
        g.lineTo(8, 0);
        g.moveTo(0, -8);
        g.lineTo(0, 8);
      } else if (kind === 1) {
        g.moveTo(-7, -9);
        g.lineTo(0, 9);
        g.lineTo(7, -9);
      } else {
        g.moveTo(-6, -6);
        g.lineTo(6, 6);
        g.moveTo(6, -6);
        g.lineTo(-6, 6);
      }
      g.stroke();
      g.restore();
    }
  });
}

/** Disco com borda suave (núcleo escuro e brilho de chão). */
export function softDiscTexture(): THREE.Texture {
  return paint('softDisc', 256, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.8)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
}

/** Pedra de cantaria: fiadas irregulares com juntas, sujeira e variação de tom. */
export function stoneTexture(): THREE.Texture {
  return paint('stone', 256, (g, s) => {
    const r = rng(99);
    g.fillStyle = '#6f6a63';
    g.fillRect(0, 0, s, s);
    const rows = 6;
    const cols = 4;
    const bh = s / rows;
    const bw = s / cols;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const off = (y % 2) * (bw / 2);
        const v = 80 + Math.floor(r() * 45);
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(x * bw + off + 2, y * bh + 2, bw - 4, bh - 4);
      }
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`;
      g.fillRect(r() * s, r() * s, 2 + r() * 4, 2 + r() * 4);
    }
  });
}

/** Bandeira azul com friso dourado e estrela de quatro pontas (o mesmo desenho do brasão do jogo). */
export function bannerTexture(): THREE.Texture {
  return paint('banner', 256, (g, s) => {
    g.fillStyle = '#1f3f7a';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#d6a64a';
    g.lineWidth = 10;
    g.strokeRect(8, 8, s - 16, s - 16);
    const c = s / 2;
    const R = s * 0.3;
    const k = s * 0.06;
    g.fillStyle = '#e8c35a';
    g.beginPath();
    g.moveTo(c, c - R);
    g.quadraticCurveTo(c + k, c - k, c + R, c);
    g.quadraticCurveTo(c + k, c + k, c, c + R);
    g.quadraticCurveTo(c - k, c + k, c - R, c);
    g.quadraticCurveTo(c - k, c - k, c, c - R);
    g.fill();
  });
}

/**
 * Pedra ou cristal irregular (poliedro deformado, sempre a mesma forma para a mesma semente). `stretch` alonga em Y
 * (cristal, > 1) ou achata (pedra, < 1). A base fica em y = 0. Cache por (semente, alongamento).
 */
export function shardGeometry(seed: number, stretch = 1): THREE.BufferGeometry {
  const key = `${seed}:${stretch}`;
  let geo = geometries.get(key);
  if (!geo) {
    const r = rng(seed);
    geo = new THREE.IcosahedronGeometry(0.5, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // vértices que coincidem recebem o mesmo deslocamento (a malha não racha)
    const shift = new Map<string, number>();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let f = shift.get(k);
      if (f === undefined) {
        f = 0.7 + r() * 0.55;
        shift.set(k, f);
      }
      v.multiplyScalar(f);
      v.y *= stretch;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeBoundingBox();
    geo.translate(0, -(geo.boundingBox?.min.y ?? 0), 0);
    geo.computeVertexNormals();
    geometries.set(key, geo);
  }
  return geo;
}
