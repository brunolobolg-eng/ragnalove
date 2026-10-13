import * as THREE from 'three';
import { imageOf, loadTexture } from './naturKit';

/**
 * Texturas da zona da ponte. A pedra (blocos do tabuleiro, muralhas, cais e calçamento da praça) é a arte
 * do dono em WebP (public/textures/cidade). Madeira e telhas seguem pintadas em canvas, pequenas e sem
 * detalhe de perto.
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

const PEDRA_BLOCOS_URL = 'textures/cidade/pedra_bloco_claro.webp';

/** Pedra de construção clara (blocos do tabuleiro, muralhas, cais). Cada uso ajusta o seu `repeat`. */
export function pedraBlocos(): THREE.Texture {
  return loadTexture(PEDRA_BLOCOS_URL);
}

/**
 * Lateral da ponte: blocos de pedra + arco escuro (o vão por onde a água passa). Os blocos são a textura do
 * dono; enquanto a imagem não chega, o fundo é cinza liso e o arco já aparece.
 */
export function bridgeSideTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const [c, g] = canvas(W, H);
  const tex = finish(c);

  const desenha = (blocos?: HTMLImageElement) => {
    if (blocos) for (let x = 0; x < W; x += 256) g.drawImage(blocos, x, 0, 256, 256);
    else {
      g.fillStyle = '#5c5e64';
      g.fillRect(0, 0, W, H);
    }
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
  };

  desenha();
  imageOf(PEDRA_BLOCOS_URL)
    .then((img) => {
      g.clearRect(0, 0, W, H);
      desenha(img);
      tex.needsUpdate = true;
    })
    .catch(() => {
      /* sem a imagem a lateral segue cinza com o arco */
    });
  return tex;
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
