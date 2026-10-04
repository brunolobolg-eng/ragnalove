/**
 * Canvas 2D do editor: desenha a grade ASCII com as cores da legenda,
 * marcadores de objetos/spawns/setup e o overlay de colisão.
 */
import { CHAR_INFO } from './legend';
import { getChar, type MapDoc } from './mapDoc';

export type LayerId = 'ground' | 'props' | 'objects' | 'spawns' | 'collision';

export interface ViewState {
  zoom: number;
  ox: number;
  oy: number;
  grid: boolean;
  layers: Record<LayerId, boolean>;
  layerOpacity: number;
}

export const defaultView = (): ViewState => ({ zoom: 1, ox: 0, oy: 0, grid: true, layers: { ground: true, props: true, objects: true, spawns: true, collision: false }, layerOpacity: 0.85 });

const TILE = 26;
const OBJ_COLOR: Record<string, string> = {
  cart: '#c98a4b', oilBarrel: '#b03a2e', torch: '#ffb347', roots: '#6abe50', altar: '#c9b458',
  sandColumn: '#d9c08a', unstableRuin: '#9c8a70', dryOasis: '#4bc9c9', campfire: '#ff6b35', shieldWall: '#7f8ea3',
};

export class MapCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(
    readonly view: ViewState,
    private onHover: (x: number, y: number) => void,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'me-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível.');
    this.ctx = ctx;
  }

  resizeToParent(): void {
    const p = this.canvas.parentElement;
    if (!p) return;
    const r = p.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
  }

  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = (sx - r.left) * dpr;
    const py = (sy - r.top) * dpr;
    const t = TILE * this.view.zoom * dpr;
    return { x: Math.floor((px - this.view.ox * dpr) / t), y: Math.floor((py - this.view.oy * dpr) / t) };
  }

  centerOn(doc: MapDoc): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const t = TILE * this.view.zoom * dpr;
    const p = this.canvas.parentElement?.getBoundingClientRect();
    if (!p) return;
    this.view.ox = (p.width * dpr - doc.width * t) / 2;
    this.view.oy = (p.height * dpr - doc.height * t) / 2;
  }

  trackHover(e: MouseEvent): void {
    const { x, y } = this.screenToTile(e.clientX, e.clientY);
    this.onHover(x, y);
  }

  draw(doc: MapDoc, hover: { x: number; y: number } | null, selChar: string): void {
    const { ctx, view } = this;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = this.canvas.width;
    const H = this.canvas.height;
    const t = TILE * view.zoom * dpr;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = view.layerOpacity;
    const font = `${Math.max(8, t * 0.52)}px monospace`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const ch = getChar(doc, x, y);
        const info = CHAR_INFO[ch];
        if (!info) continue;
        const px = view.ox * dpr + x * t;
        const py = view.oy * dpr + y * t;
        if (px + t < 0 || py + t < 0 || px > W || py > H) continue;
        const isBlock = info.cat === 'block';
        if ((isBlock && !view.layers.props) || (!isBlock && ch !== '~' && ch !== 'g' && !view.layers.ground)) {
          ctx.fillStyle = '#181d26';
          ctx.fillRect(px, py, t, t);
          continue;
        }
        ctx.fillStyle = info.bg;
        ctx.fillRect(px, py, t, t);
        ctx.fillStyle = info.color;
        ctx.fillText(ch, px + t / 2, py + t / 2 + 1);
      }
    }
    ctx.restore();
    // overlay de colisão (dado derivado, não depende do sprite)
    if (view.layers.collision) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      for (let y = 0; y < doc.height; y++) {
        for (let x = 0; x < doc.width; x++) {
          const info = CHAR_INFO[getChar(doc, x, y)];
          if (!info) continue;
          let c: string | null = null;
          if (info.cat === 'block') c = '#ff3b30';
          else if (info.cat === 'void') c = '#3a6ea5';
          else if (info.cat === 'gate') c = '#30d158';
          else if (getChar(doc, x, y) === 'r') c = '#ffd60a';
          else if (getChar(doc, x, y) === ':') c = '#8e8e93';
          if (!c) continue;
          ctx.fillStyle = c;
          ctx.fillRect(view.ox * dpr + x * t + 1, view.oy * dpr + y * t + 1, t - 2, t - 2);
        }
      }
      ctx.restore();
    }
    // objetos interativos
    if (view.layers.objects) {
      ctx.save();
      ctx.font = `${Math.max(8, t * 0.42)}px monospace`;
      for (const o of doc.objects) {
        const px = view.ox * dpr + o.x * t;
        const py = view.oy * dpr + o.y * t;
        ctx.fillStyle = OBJ_COLOR[o.type] ?? '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + t / 2, py + t / 2, t * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.fillText('◆', px + t / 2, py + t / 2 + 1);
      }
      ctx.restore();
    }
    // spawns + setup da party
    if (view.layers.spawns) {
      const dot = (x: number, y: number, c: string, label: string) => {
        const px = view.ox * dpr + x * t;
        const py = view.oy * dpr + y * t;
        ctx.fillStyle = c;
        ctx.fillRect(px + 1, py + 1, t - 2, 3);
        ctx.fillRect(px + 1, py + t - 4, t - 2, 3);
        ctx.fillRect(px + 1, py + 1, 3, t - 2);
        ctx.fillRect(px + t - 4, py + 1, 3, t - 2);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(8, t * 0.4)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px + t / 2, py + t / 2);
      };
      doc.spawnPoints.forEach((p, i) => dot(p.x, p.y, '#ff453a', `E${i + 1}`));
      doc.setup.members.forEach((m, i) => dot(m.x, m.y, '#30d158', `P${i + 1}`));
      ctx.save();
      ctx.strokeStyle = '#0a84ff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      for (const b of doc.setup.barriers) ctx.strokeRect(view.ox * dpr + b.x * t + 2, view.oy * dpr + b.y * t + 2, t - 4, t - 4);
      ctx.restore();
    }
    // grade + hover
    if (view.grid && t >= 8) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= doc.width; x++) {
        ctx.moveTo(view.ox * dpr + x * t, view.oy * dpr);
        ctx.lineTo(view.ox * dpr + x * t, view.oy * dpr + doc.height * t);
      }
      for (let y = 0; y <= doc.height; y++) {
        ctx.moveTo(view.ox * dpr, view.oy * dpr + y * t);
        ctx.lineTo(view.ox * dpr + doc.width * t, view.oy * dpr + y * t);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (hover) {
      ctx.save();
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 2;
      ctx.strokeRect(view.ox * dpr + hover.x * t + 1, view.oy * dpr + hover.y * t + 1, t - 2, t - 2);
      ctx.restore();
    }
    void selChar;
  }
}
