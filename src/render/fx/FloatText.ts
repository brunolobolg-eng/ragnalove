import * as THREE from 'three';

/**
 * Texto flutuante curto ("+5 EXP", "Esquiva!", "NÍVEL 3!"): sobe e desvanece.
 * Desenhado em canvas com contorno escuro, no estilo dos números de dano clássicos.
 */
export class FloatText {
  readonly group = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private t = 0;
  done = false;

  constructor(
    text: string,
    pos: THREE.Vector3,
    color: string,
    private readonly opts: { size?: number; life?: number; rise?: number; dmg?: boolean; color2?: string; drift?: number } = {},
  ) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const px = opts.dmg ? 64 : 48;
    const font = opts.dmg ? `italic 900 ${px}px 'Arial Black', Impact, Tahoma, sans-serif` : `bold ${px}px Tahoma, Verdana, sans-serif`;
    g.font = font;
    const pad = opts.dmg ? 20 : 8;
    const w = Math.ceil(g.measureText(text).width) + pad * 2;
    c.width = w;
    c.height = px + pad * 2;
    g.font = font;
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (opts.dmg) {
      // número de dano: contorno grosso escuro + preenchimento em degradê (claro em cima)
      g.lineWidth = 13;
      g.strokeStyle = 'rgba(28,10,6,0.95)';
      g.strokeText(text, pad, c.height / 2 + 2);
      const gr = g.createLinearGradient(0, pad, 0, c.height - pad);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.45, color);
      gr.addColorStop(1, opts.color2 ?? color);
      g.fillStyle = gr;
      g.fillText(text, pad, c.height / 2);
    } else {
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(20,16,10,0.9)';
      g.strokeText(text, 8, c.height / 2);
      g.fillStyle = color;
      g.fillText(text, 8, c.height / 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    const h = opts.size ?? 0.32;
    this.sprite.scale.set((h * c.width) / c.height, h, 1);
    this.sprite.renderOrder = 20;
    this.group.position.copy(pos);
    this.group.add(this.sprite);
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    const life = this.opts.life ?? 0.9;
    const k = this.t / life;
    // "pop" rápido no começo, depois sobe e some
    const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.55 : 1.15 - Math.min(0.15, (k - 0.12) * 0.5);
    this.sprite.position.y = (this.opts.rise ?? 0.7) * (1 - (1 - k) * (1 - k));
    if (this.opts.drift) this.sprite.position.x = this.opts.drift * k;
    this.sprite.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    this.sprite.scale.multiplyScalar(pop / (this.sprite.userData.lastPop ?? 1));
    this.sprite.userData.lastPop = pop;
    if (k >= 1) this.dispose();
  }

  dispose(): void {
    if (this.done) return;
    this.done = true;
    this.sprite.material.map?.dispose();
    this.sprite.material.dispose();
    this.group.removeFromParent();
  }
}
