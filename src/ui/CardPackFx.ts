/**
 * Partículas do pacote (faíscas de raridade e poeira dourada). Canvas leve: só roda quando há partículas
 * vivas, e o número é limitado para não pesar em computador fraco.
 */
const MAX = 220;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
}

export class CardPackFx {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly ps: Particle[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;

  constructor(private readonly cv: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
  }

  /** Acompanha o tamanho do véu (chamar ao abrir e ao redimensionar). */
  resize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Explosão de faíscas em (x, y), na cor da raridade. */
  burst(x: number, y: number, color: string, n: number, power: number): void {
    for (let i = 0; i < n && this.ps.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = power * (0.35 + Math.random() * 0.65);
      this.ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.25, life: 0, max: 0.7 + Math.random() * 0.8, size: 1.5 + Math.random() * 2.6, color, g: 90 });
    }
    this.kick();
  }

  /** Poeira subindo em volta do pacote fechado (leve, sempre que houver espaço). */
  mote(x: number, y: number, color: string): void {
    if (this.ps.length >= MAX) return;
    this.ps.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: -10 - Math.random() * 16, life: 0, max: 1.8 + Math.random() * 1.4, size: 1 + Math.random() * 1.6, color, g: 0 });
    this.kick();
  }

  clear(): void {
    this.ps.length = 0;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  private kick(): void {
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    c.globalCompositeOperation = 'lighter';
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.ps.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.vx *= 1 - 1.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      c.globalAlpha = Math.min(1, k * 1.2);
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (0.5 + 0.5 * k), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    this.raf = this.ps.length ? requestAnimationFrame((t) => this.frame(t)) : 0;
  }
}
