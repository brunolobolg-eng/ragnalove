import type { EventDef } from '../config/world';

/**
 * Telas curtas da run: evento na estrada, resultado da fase (com reviver) e fim da jornada.
 * Todas são modais com o mesmo estilo de janela do HUD.
 */
export class Modal {
  readonly el: HTMLElement;
  private handlers = new Map<string, () => void>();

  constructor(cls = '') {
    this.el = document.createElement('div');
    this.el.className = `run-veil ${cls}`;
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!b || b.hasAttribute('disabled')) return;
      this.handlers.get(b.dataset.k!)?.();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(title: string, body: string, buttons: { label: string; primary?: boolean; disabled?: boolean; onClick: () => void }[]): void {
    this.handlers.clear();
    const btns = buttons
      .map((b, i) => {
        this.handlers.set(String(i), b.onClick);
        return `<button data-k="${i}" class="${b.primary ? 'primary' : ''}"${b.disabled ? ' disabled' : ''}>${b.label}</button>`;
      })
      .join('');
    this.el.innerHTML = `<div class="win run-win"><div class="win-title"><span>${title}</span><i class="dots"></i></div><div class="win-body">${body}<div class="run-btns">${btns}</div></div></div>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}

export function eventBody(ev: EventDef, costs: (number | undefined)[], zeni: number): { body: string; disabled: boolean[] } {
  const body = `<div class="ev-art" data-ev="${ev.id}"></div><p class="ev-text">${ev.text}</p>`;
  return { body, disabled: costs.map((c) => (c ?? 0) > zeni) };
}

/** Pequena ilustração original por evento (CSS + emoji-free: formas simples). */
export function paintEventArt(root: HTMLElement, id: string): void {
  const host = root.querySelector<HTMLElement>('.ev-art');
  if (!host) return;
  const c = document.createElement('canvas');
  c.width = 420;
  c.height = 150;
  host.appendChild(c);
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 150);
  sky.addColorStop(0, '#1a2034');
  sky.addColorStop(1, '#4a4a5a');
  g.fillStyle = sky;
  g.fillRect(0, 0, 420, 150);
  g.fillStyle = '#2a2a24';
  g.fillRect(0, 118, 420, 32);
  const glow = (x: number, y: number, r: number, col: string) => {
    const gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  g.fillStyle = '#12121a';
  switch (id) {
    case 'cart':
      g.save();
      g.translate(210, 108);
      g.rotate(-0.25);
      g.fillRect(-60, -30, 120, 30);
      g.restore();
      g.beginPath();
      g.arc(160, 118, 16, 0, Math.PI * 2);
      g.arc(262, 96, 16, 0, Math.PI * 2);
      g.fill();
      break;
    case 'shrine':
      glow(210, 60, 70, 'rgba(255,220,150,0.5)');
      g.fillStyle = '#12121a';
      g.fillRect(190, 40, 40, 78);
      g.beginPath();
      g.arc(210, 40, 16, 0, Math.PI * 2);
      g.fill();
      g.fillRect(160, 110, 100, 10);
      break;
    case 'refugees':
      for (const [x, h] of [[170, 60], [200, 70], [232, 44], [252, 36]]) {
        g.fillRect(x, 118 - h, 16, h);
        g.beginPath();
        g.arc(x + 8, 118 - h - 8, 8, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'peddler':
      g.fillRect(150, 70, 120, 48);
      g.beginPath();
      g.moveTo(140, 70);
      g.lineTo(210, 40);
      g.lineTo(280, 70);
      g.fill();
      glow(300, 100, 30, 'rgba(255,200,120,0.6)');
      break;
    case 'soulWell':
      glow(210, 70, 80, 'rgba(90,255,220,0.45)');
      g.fillStyle = '#12121a';
      g.fillRect(170, 86, 80, 32);
      for (let i = 0; i < 8; i++) glow(180 + Math.random() * 60, 30 + Math.random() * 50, 8, 'rgba(160,255,240,0.9)');
      break;
    case 'veteran':
      g.fillRect(200, 50, 22, 68);
      g.beginPath();
      g.arc(211, 40, 11, 0, Math.PI * 2);
      g.fill();
      g.fillRect(222, 30, 4, 90);
      break;
    case 'rift':
      glow(210, 70, 90, 'rgba(255,210,90,0.55)');
      g.strokeStyle = '#fff4c0';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(206, 20);
      g.lineTo(214, 60);
      g.lineTo(204, 90);
      g.lineTo(212, 120);
      g.stroke();
      break;
    case 'hermit':
      g.fillRect(150, 60, 120, 58);
      g.beginPath();
      g.moveTo(140, 60);
      g.lineTo(210, 20);
      g.lineTo(280, 60);
      g.fill();
      glow(210, 90, 26, 'rgba(255,220,150,0.7)');
      g.beginPath();
      g.arc(210, 84, 9, 0, Math.PI * 2);
      g.fill();
      break;
    case 'starfall':
      glow(300, 60, 60, 'rgba(150,200,255,0.6)');
      g.strokeStyle = 'rgba(200,230,255,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(120, 20);
      g.lineTo(280, 70);
      g.stroke();
      g.fillStyle = '#12121a';
      g.beginPath();
      g.arc(300, 100, 18, 0, Math.PI * 2);
      g.fill();
      break;
    case 'fairyRing':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        glow(210 + Math.cos(a) * 55, 95 + Math.sin(a) * 22, 10, 'rgba(150,255,200,0.9)');
      }
      break;
    case 'oldTower':
      g.fillStyle = '#12121a';
      g.fillRect(185, 30, 50, 88);
      g.fillRect(185, 30, 50, 14);
      g.beginPath();
      g.moveTo(185, 30);
      g.lineTo(210, 8);
      g.lineTo(235, 30);
      g.fill();
      break;
    case 'warHorn':
      glow(210, 80, 50, 'rgba(255,200,120,0.5)');
      g.strokeStyle = '#12121a';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(210, 110, 45, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      break;
    case 'sickTraveler':
      g.fillStyle = '#12121a';
      g.fillRect(150, 96, 120, 22);
      g.beginPath();
      g.arc(160, 88, 10, 0, Math.PI * 2);
      g.fill();
      glow(300, 60, 24, 'rgba(255,150,150,0.6)');
      break;
    case 'diceGame':
      g.fillStyle = '#12121a';
      for (const [x, y, r] of [[185, 85, 0], [235, 90, 1]] as const) {
        g.save();
        g.translate(x, y);
        g.rotate(r ? 0.3 : -0.2);
        g.fillRect(-16, -16, 32, 32);
        g.fillStyle = '#e8e8f0';
        for (const [dx, dy] of [[-7, -7], [7, 7], [7, -7], [-7, 7], [0, 0]] as const) {
          g.beginPath();
          g.arc(dx, dy, 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = '#12121a';
        g.restore();
      }
      break;
    case 'battlefield':
      g.strokeStyle = '#12121a';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(150, 110);
      g.lineTo(200, 50);
      g.moveTo(270, 110);
      g.lineTo(220, 50);
      g.stroke();
      g.fillStyle = '#12121a';
      for (const x of [150, 200, 220, 270]) {
        g.fillRect(x - 8, 104, 16, 14);
      }
      break;
    case 'blacksmith':
      glow(210, 80, 44, 'rgba(255,140,60,0.7)');
      g.fillStyle = '#12121a';
      g.beginPath();
      g.moveTo(175, 95);
      g.lineTo(245, 95);
      g.lineTo(230, 118);
      g.lineTo(190, 118);
      g.closePath();
      g.fill();
      g.fillRect(150, 40, 10, 50);
      g.save();
      g.translate(155, 38);
      g.rotate(-0.5);
      g.fillRect(-16, -6, 32, 12);
      g.restore();
      break;
    case 'wyrmNest':
      glow(210, 85, 55, 'rgba(255,120,60,0.55)');
      g.fillStyle = '#12121a';
      g.beginPath();
      g.ellipse(210, 92, 26, 34, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#3a3a48';
      g.lineWidth = 5;
      g.beginPath();
      g.ellipse(210, 100, 60, 16, 0, 0, Math.PI * 2);
      g.stroke();
      break;
    default:
      glow(210, 100, 60, 'rgba(255,150,60,0.6)');
      g.fillStyle = '#12121a';
      for (const x of [120, 280]) {
        g.beginPath();
        g.moveTo(x - 40, 118);
        g.lineTo(x, 60);
        g.lineTo(x + 40, 118);
        g.fill();
      }
  }
}
