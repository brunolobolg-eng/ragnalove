/**
 * Tela inicial (login). Só interface por enquanto: os campos de usuário/senha, o
 * seletor de mundo e o botão "Entrar" existem no DOM (prontos para plugar a lógica
 * real depois), mas estão desabilitados. "Toque para começar" leva ao jogo.
 *
 * Fundo 100% original, desenhado em canvas: floresta mística noturna em azul/violeta,
 * árvore anciã, raios de luz volumétricos e vagalumes. No centro, o ESPECTRO do jogo
 * (a mesma ideia visual do golpe dos heróis), pairando.
 */

interface Firefly {
  x: number;
  y: number;
  r: number;
  sp: number;
  ph: number;
  hue: number;
}

export class LoginScreen {
  private readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private staticLayer = document.createElement('canvas');
  private flies: Firefly[] = [];
  private raf = 0;
  private t0 = performance.now();
  private closed = false;

  /** Elementos prontos para a lógica de autenticação futura. */
  readonly userInput: HTMLInputElement;
  readonly passInput: HTMLInputElement;
  readonly worldSelect: HTMLSelectElement;
  readonly enterButton: HTMLButtonElement;

  constructor(private readonly onEnter: () => void) {
    this.el = document.createElement('div');
    this.el.id = 'login';
    // caminho relativo ao documento: funciona no navegador e empacotado (file://) no Electron
    this.el.style.setProperty('--spectre-mask', `url("${new URL('sprites/warrior_front.png', document.baseURI).href}")`);
    this.el.innerHTML = `
      <canvas class="login-bg"></canvas>
      <div class="login-spectre" aria-hidden="true"><i class="haze"></i><i class="rim"></i><i class="body"></i></div>
      <header class="login-logo">
        <img class="login-emblem" src="emblem.png" alt="" onerror="this.remove()">
        <h1>ROguard</h1>
        <p>Crônicas das Almas Roubadas</p>
      </header>
      <form class="login-panel" onsubmit="return false" aria-label="Entrar na conta (em breve)">
        <label class="world">
          <span>Mundo</span>
          <select name="world" disabled title="Seleção de mundo disponível em breve">
            <option>Aurora Sombria</option>
          </select>
        </label>
        <label class="field">
          <i class="ico user"></i>
          <input name="user" type="text" placeholder="Usuário" autocomplete="username" disabled />
          <i class="ico lock" title="Login em breve"></i>
        </label>
        <label class="field">
          <i class="ico key"></i>
          <input name="pass" type="password" placeholder="Senha" autocomplete="current-password" disabled />
          <i class="ico lock" title="Login em breve"></i>
        </label>
        <button type="submit" class="login-btn" disabled>Entrar</button>
        <small class="login-note">Contas online chegam em breve</small>
      </form>
      <button class="login-cta" type="button">TOQUE PARA COMEÇAR</button>
      <footer class="login-foot">v0.5 · protótipo</footer>
    `;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('.login-bg')!;
    this.g = this.canvas.getContext('2d')!;
    this.userInput = this.el.querySelector('input[name=user]')!;
    this.passInput = this.el.querySelector('input[name=pass]')!;
    this.worldSelect = this.el.querySelector('select')!;
    this.enterButton = this.el.querySelector('.login-btn')!;

    // Começar: CTA, clique no fundo ou qualquer tecla (sem backend de login ainda).
    this.el.querySelector('.login-cta')!.addEventListener('click', () => this.close());
    this.canvas.addEventListener('click', () => this.close());
    this.keyHandler = (e: KeyboardEvent) => {
      // A tela de login "engole" as teclas para o jogo não reagir por baixo dela.
      e.stopImmediatePropagation();
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private hideTimer = 0;

  /** Volta para a tela inicial (ESC → confirmar no jogo). */
  open(): void {
    if (!this.closed) return;
    this.closed = false;
    clearTimeout(this.hideTimer);
    cancelAnimationFrame(this.raf);
    this.el.hidden = false;
    this.el.classList.add('leaving');
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('leaving')));
    window.addEventListener('keydown', this.keyHandler, true);
    window.addEventListener('resize', this.resize);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private keyHandler: (e: KeyboardEvent) => void;

  get active(): boolean {
    return !this.closed;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.keyHandler, true);
    window.removeEventListener('resize', this.resize);
    this.el.classList.add('leaving');
    this.onEnter();
    this.hideTimer = window.setTimeout(() => {
      cancelAnimationFrame(this.raf);
      this.el.hidden = true; // fica guardada para voltar ao menu sem recriar tudo
    }, 900);
  }

  // ---------- Fundo ----------

  private resize = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of [this.canvas, this.staticLayer]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.drawStatic(w, h, dpr);
    const n = Math.round(Math.min(140, (w * h) / 9000));
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.flies = Array.from({ length: n }, () => ({
      x: r() * w,
      y: h * 0.25 + r() * h * 0.75,
      r: 1 + r() * 2.2,
      sp: 0.3 + r() * 0.9,
      ph: r() * 6.28,
      hue: r() < 0.7 ? 175 : 265, // ciano-verde e violeta
    }));
  };

  /** Camadas que não animam: céu, lua, floresta em camadas e a árvore anciã. */
  private drawStatic(w: number, h: number, dpr: number): void {
    const g = this.staticLayer.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#070a24');
    sky.addColorStop(0.45, '#1d1850');
    sky.addColorStop(0.75, '#2b2466');
    sky.addColorStop(1, '#0d1030');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    // estrelas
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(220,230,255,${0.2 + r() * 0.6})`;
      g.fillRect(r() * w, r() * h * 0.5, r() < 0.9 ? 1 : 2, 1);
    }
    // lua enevoada atrás da árvore
    const mx = w * 0.62;
    const my = h * 0.24;
    const halo = g.createRadialGradient(mx, my, 0, mx, my, h * 0.45);
    halo.addColorStop(0, 'rgba(210,220,255,0.9)');
    halo.addColorStop(0.08, 'rgba(170,180,255,0.55)');
    halo.addColorStop(0.35, 'rgba(120,100,220,0.18)');
    halo.addColorStop(1, 'rgba(60,40,140,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, w, h);

    // floresta em 3 camadas de profundidade (mais clara/azulada ao fundo)
    const layers: [string, number, number, number][] = [
      ['#23265e', 0.58, 26, 0.22],
      ['#171a45', 0.66, 34, 0.3],
      ['#0d0f2c', 0.76, 46, 0.4],
    ];
    for (const [col, base, step, hVar] of layers) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = -20; x <= w + 40; x += step) {
        const th = h * (base - hVar * (0.35 + r() * 0.65) * 0.35);
        g.lineTo(x, h * base);
        g.lineTo(x + step * 0.5, th);
        g.lineTo(x + step, h * base);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
      g.fillRect(0, h * base, w, h * (1 - base));
    }

    // árvore anciã (tronco largo, raízes, copa em nuvens)
    const tx = w * 0.62;
    const ty = h * 0.86;
    g.fillStyle = '#080a1f';
    g.beginPath();
    g.moveTo(tx - w * 0.09, ty);
    g.bezierCurveTo(tx - w * 0.04, ty - h * 0.08, tx - w * 0.045, ty - h * 0.3, tx - w * 0.02, ty - h * 0.46);
    g.lineTo(tx + w * 0.025, ty - h * 0.46);
    g.bezierCurveTo(tx + w * 0.05, ty - h * 0.3, tx + w * 0.045, ty - h * 0.08, tx + w * 0.1, ty);
    g.closePath();
    g.fill();
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (1.05 + r() * 0.9);
      const d = w * (0.05 + r() * 0.17);
      const cx = tx + Math.cos(a) * d * 1.3;
      const cy = ty - h * 0.52 + Math.sin(a) * d * 0.55;
      g.beginPath();
      g.arc(cx, cy, w * (0.035 + r() * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    // manchas bioluminescentes na copa
    for (let i = 0; i < 40; i++) {
      const cx = tx + (r() - 0.5) * w * 0.42;
      const cy = ty - h * (0.5 + r() * 0.25);
      const rr = 2 + r() * 5;
      const gl = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 4);
      gl.addColorStop(0, 'rgba(120,255,230,0.55)');
      gl.addColorStop(1, 'rgba(120,255,230,0)');
      g.fillStyle = gl;
      g.fillRect(cx - rr * 4, cy - rr * 4, rr * 8, rr * 8);
    }
    // chão escuro
    const gr = g.createLinearGradient(0, h * 0.8, 0, h);
    gr.addColorStop(0, 'rgba(5,6,20,0)');
    gr.addColorStop(1, 'rgba(5,6,20,0.95)');
    g.fillStyle = gr;
    g.fillRect(0, h * 0.8, w, h * 0.2);
  }

  private frame = (now: number): void => {
    const t = (now - this.t0) / 1000;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const dpr = this.canvas.width / Math.max(1, w);
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.staticLayer, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // raios de luz volumétricos vindos da lua, pulsando devagar
    g.globalCompositeOperation = 'lighter';
    const ox = w * 0.62;
    const oy = h * 0.2;
    for (let i = 0; i < 6; i++) {
      const ang = Math.PI * 0.5 + (i - 2.5) * 0.16 + Math.sin(t * 0.2 + i) * 0.03;
      const len = h * 1.1;
      const spread = 0.05 + (i % 2) * 0.03;
      const a = 0.05 + 0.035 * Math.sin(t * 0.6 + i * 1.7);
      const grd = g.createLinearGradient(ox, oy, ox + Math.cos(ang) * len, oy + Math.sin(ang) * len);
      grd.addColorStop(0, `rgba(170,170,255,${a})`);
      grd.addColorStop(1, 'rgba(120,90,255,0)');
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(ang - spread) * len, oy + Math.sin(ang - spread) * len);
      g.lineTo(ox + Math.cos(ang + spread) * len, oy + Math.sin(ang + spread) * len);
      g.closePath();
      g.fill();
    }

    // vagalumes / poeira mágica
    for (const f of this.flies) {
      const x = f.x + Math.sin(t * f.sp + f.ph) * 22;
      const y = f.y - ((t * f.sp * 12) % (h * 0.8)) + Math.cos(t * f.sp * 1.3 + f.ph) * 10;
      const yy = y < h * 0.15 ? y + h * 0.8 : y;
      const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 * f.sp + f.ph));
      const rr = f.r * 5;
      const gl = g.createRadialGradient(x, yy, 0, x, yy, rr);
      gl.addColorStop(0, `hsla(${f.hue},100%,80%,${0.9 * blink})`);
      gl.addColorStop(0.3, `hsla(${f.hue},100%,65%,${0.35 * blink})`);
      gl.addColorStop(1, `hsla(${f.hue},100%,60%,0)`);
      g.fillStyle = gl;
      g.fillRect(x - rr, yy - rr, rr * 2, rr * 2);
    }

    // névoa rasteira
    for (let i = 0; i < 3; i++) {
      const fy = h * (0.8 + i * 0.06);
      const fx = ((t * (8 + i * 5)) % (w * 1.5)) - w * 0.25;
      const fog = g.createRadialGradient(fx, fy, 0, fx, fy, w * 0.5);
      fog.addColorStop(0, 'rgba(120,130,220,0.07)');
      fog.addColorStop(1, 'rgba(120,130,220,0)');
      g.fillStyle = fog;
      g.fillRect(0, h * 0.55, w, h * 0.45);
    }
    g.globalCompositeOperation = 'source-over';
    if (!this.el.hidden) this.raf = requestAnimationFrame(this.frame);
  };
}
