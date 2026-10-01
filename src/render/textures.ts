import * as THREE from 'three';

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

let soft: THREE.Texture | undefined;
/** Sprite macio (partículas de fogo, fumaça, brilho). */
export function softCircle(): THREE.Texture {
  return (soft ??= canvasTex(64, (g, s) => {
    const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, s, s);
  }));
}

let outline: THREE.Texture | undefined;
/** Contorno de tile com brilho sutil nas bordas (indicadores de grade). */
export function tileOutline(): THREE.Texture {
  return (outline ??= canvasTex(128, (g, s) => {
    const b = 10;
    const grad = g.createLinearGradient(0, 0, b, 0);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) {
      g.save();
      g.translate(s / 2, s / 2);
      g.rotate((i * Math.PI) / 2);
      g.translate(-s / 2, -s / 2);
      g.fillStyle = grad;
      g.fillRect(0, 0, b, s);
      g.restore();
    }
  }));
}
