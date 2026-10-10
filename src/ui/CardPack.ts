/**
 * Pacote de fim de run (só vitória). Abertura no estilo Hearthstone: o pacote fica selado; o jogador arrasta
 * (ou toca) o topo para rasgar; as cartas saem viradas para baixo e são reveladas uma a uma (ou todas de uma
 * vez). Cada raridade tem a sua reação: Normal = brilho e moeda; Mini-Boss = aura roxa e faíscas; MVP = clarão,
 * raios, faíscas douradas e a faixa "VOCÊ ENCONTROU ...". As cartas já entraram na coleção ao conceder (main.ts):
 * aqui é só a revelação. A apresentação não decide nada: a lista de cartas vem pronta.
 */
import { CARD_BY_ID, revealOrder, type CardRarity } from '../core/progression/cards';
import type { SfxName } from '../audio/AudioEngine';
import { RARITY_COLOR, RARITY_LABEL, cardBackHtml, cardFaceHtml } from './CardFace';
import { CardPackFx } from './CardPackFx';

type Sfx = (name: SfxName) => void;
type Stage = 'sealed' | 'opening' | 'revealing' | 'done';

/** Quanto o topo precisa ser arrastado (px) para rasgar sem toque. */
const TEAR_DISTANCE = 170;
/** Atraso entre uma carta revelada e a próxima ao usar "Revelar todas". */
const REVEAL_ALL_GAP = 280;

export class CardPack {
  readonly el: HTMLElement;
  private onClose: () => void = () => {};
  private fx?: CardPackFx;
  private ids: string[] = [];
  private flipped: boolean[] = [];
  private stage: Stage = 'sealed';
  private timers: number[] = [];
  private motes = 0;
  private drag?: { id: number; x0: number; y0: number; p: number };
  /** Houve arrasto no pacote: o clique que vem logo depois não deve rasgar. */
  private dragged = false;
  private readonly onResize = () => this.resize();

  constructor(private readonly sfx: Sfx = () => {}) {
    this.el = document.createElement('div');
    this.el.className = 'cards-veil pk-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('pointerdown', (e) => this.onDown(e));
    this.el.addEventListener('pointermove', (e) => this.onMove(e));
    this.el.addEventListener('pointerup', (e) => this.onUp(e));
    this.el.addEventListener('pointercancel', (e) => this.onUp(e));
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  show(ids: string[], onClose: () => void): void {
    this.onClose = onClose;
    this.ids = revealOrder(ids).filter((id) => CARD_BY_ID[id]);
    this.flipped = this.ids.map(() => false);
    this.stage = 'sealed';
    this.clearTimers();
    const cards = this.ids
      .map((id, i) => {
        const d = CARD_BY_ID[id];
        return `<button class="cf-wrap" data-i="${i}" style="--d:${i * 110}ms" aria-label="Carta ${i + 1} virada para baixo. Toque para revelar">
          <span class="cf ${d.rarity}" style="--rc:${RARITY_COLOR[d.rarity]}">
            <span class="cf-inner"><span class="cf-face cf-back">${cardBackHtml()}</span><span class="cf-face cf-front">${cardFaceHtml(id)}</span></span>
          </span></button>`;
      })
      .join('');
    this.el.innerHTML = `
      <canvas class="pk-fx" aria-hidden="true"></canvas>
      <div class="pk-glow" aria-hidden="true"></div>
      <div class="pk-flash" aria-hidden="true"></div>
      <header class="pk-head">
        <p class="pk-kicker">Vitória!</p>
        <h2>Pacote de cartas</h2>
      </header>
      <div class="pk-stage">
        <button class="pk-pack" data-c="tear" aria-label="Rasgar o pacote de ${this.ids.length} cartas">
          <span class="pk-top"><span>AURENTHAL</span></span>
          <span class="pk-body"><img class="pk-emb" src="emblem.png" alt="" draggable="false"><b>PACOTE</b><small>${this.ids.length} cartas</small></span>
        </button>
        <div class="pk-row" hidden>${cards}</div>
        <div class="pk-rays" hidden></div>
        <div class="pk-banner" hidden></div>
      </div>
      <p class="pk-hint">Arraste o topo do pacote para rasgar</p>
      <div class="pk-foot">
        <button class="pk-reveal-all" data-c="all" hidden>Revelar todas</button>
        <button class="big-act primary pk-save" data-c="close" disabled>Guardar na coleção ➜</button>
      </div>`;
    this.el.hidden = false;
    this.fx = new CardPackFx(this.el.querySelector<HTMLCanvasElement>('.pk-fx')!);
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.startMotes();
  }

  hide(): void {
    this.clearTimers();
    this.stopMotes();
    this.fx?.clear();
    window.removeEventListener('resize', this.onResize);
    this.el.hidden = true;
  }

  // ---------- Entrada ----------

  private onDown(e: PointerEvent): void {
    if (this.stage !== 'sealed') return;
    const pack = (e.target as HTMLElement).closest<HTMLElement>('.pk-pack');
    if (!pack) return;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p: 0 };
    this.dragged = false;
    pack.setPointerCapture(e.pointerId);
  }

  private onMove(e: PointerEvent): void {
    const d = this.drag;
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (Math.hypot(dx, dy) > 6) this.dragged = true;
      d.p = Math.min(1, Math.abs(dx) / TEAR_DISTANCE);
      const pack = this.el.querySelector<HTMLElement>('.pk-pack');
      pack?.style.setProperty('--tear', d.p.toFixed(3));
      return;
    }
    this.tilt(e);
  }

  private onUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.drag = undefined;
    if (d.p >= 1) {
      this.tear();
      return;
    }
    // arrasto que não chegou ao fim: o topo volta ao lugar; toque simples fica para o clique
    if (this.dragged) this.el.querySelector<HTMLElement>('.pk-pack')?.style.setProperty('--tear', '0');
  }

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    const wrap = t.closest<HTMLElement>('.cf-wrap');
    if (wrap) {
      if (this.stage === 'revealing') this.reveal(Number(wrap.dataset.i));
      return;
    }
    const b = t.closest<HTMLElement>('[data-c]');
    const wasDrag = this.dragged;
    this.dragged = false;
    if (!b) return;
    const c = b.dataset.c;
    if (c === 'close') {
      if (this.stage !== 'done') return;
      this.hide();
      this.onClose();
    } else if (c === 'tear') {
      if (this.stage === 'sealed' && !wasDrag) this.tear();
    } else if (c === 'all') {
      this.revealAll();
    }
  }

  // ---------- Abertura ----------

  private tear(): void {
    if (this.stage !== 'sealed') return;
    this.stage = 'opening';
    const pack = this.el.querySelector<HTMLElement>('.pk-pack')!;
    pack.classList.add('torn');
    pack.style.removeProperty('--tear');
    this.sfx('cleave');
    const r = pack.getBoundingClientRect();
    const veil = this.el.getBoundingClientRect();
    this.fx?.burst(r.left + r.width / 2 - veil.left, r.top + r.height * 0.22 - veil.top, '#ffd66a', 46, 330);
    this.el.querySelector('.pk-stage')?.classList.add('shake');
    this.stopMotes();
    this.later(560, () => {
      pack.hidden = true;
      this.el.querySelector('.pk-stage')?.classList.remove('shake');
      this.el.querySelector<HTMLElement>('.pk-row')!.hidden = false;
      this.el.querySelector<HTMLElement>('.pk-hint')!.textContent = 'Toque numa carta para revelar';
      this.stage = 'revealing';
      const all = this.el.querySelector<HTMLButtonElement>('.pk-reveal-all')!;
      all.hidden = false;
    });
  }

  private revealAll(): void {
    if (this.stage !== 'revealing') return;
    let k = 0;
    this.flipped.forEach((done, i) => {
      if (done) return;
      this.later(REVEAL_ALL_GAP * k++, () => this.reveal(i));
    });
  }

  private reveal(i: number): void {
    if (this.stage !== 'revealing' || this.flipped[i]) return;
    this.flipped[i] = true;
    const id = this.ids[i];
    const rarity: CardRarity = CARD_BY_ID[id].rarity;
    const wrap = this.el.querySelector<HTMLElement>(`.cf-wrap[data-i="${i}"]`);
    const card = wrap?.querySelector<HTMLElement>('.cf');
    wrap?.classList.add('flipped');
    wrap?.setAttribute('aria-label', `${CARD_BY_ID[id].name}, ${RARITY_LABEL[rarity]}`);
    const c = this.centerOf(card);
    if (rarity === 'normal') {
      this.sfx('coin');
      card?.classList.add('glint');
      this.fx?.burst(c.x, c.y, '#fff3c4', 14, 170);
    } else if (rarity === 'miniboss') {
      this.sfx('drop');
      card?.classList.add('aura');
      this.fx?.burst(c.x, c.y, RARITY_COLOR.miniboss, 40, 260);
      this.shake(false);
    } else {
      this.sfx('jackpot');
      card?.classList.add('aura', 'gold');
      this.fx?.burst(c.x, c.y, '#ffd700', 90, 380);
      this.fx?.burst(c.x, c.y, '#fff4c0', 40, 240);
      this.flash();
      this.shake(true);
      this.rays(true);
      this.banner(CARD_BY_ID[id].name);
    }
    if (this.flipped.every(Boolean)) this.finish();
  }

  private finish(): void {
    this.stage = 'done';
    this.el.querySelector<HTMLElement>('.pk-reveal-all')!.hidden = true;
    this.el.querySelector<HTMLElement>('.pk-hint')!.textContent = this.summary();
    this.el.querySelector<HTMLButtonElement>('.pk-save')!.disabled = false;
    this.el.querySelector<HTMLElement>('.pk-glow')!.style.setProperty('--glow', RARITY_COLOR[this.bestRarity()]);
    this.el.querySelector<HTMLElement>('.pk-glow')!.classList.add('on');
  }

  // ---------- Efeitos ----------

  private shake(big: boolean): void {
    if (reduced()) return;
    const stage = this.el.querySelector<HTMLElement>('.pk-stage');
    if (!stage) return;
    stage.classList.remove('shake', 'shake-big');
    void stage.offsetWidth;
    stage.classList.add(big ? 'shake-big' : 'shake');
  }

  private flash(): void {
    const f = this.el.querySelector<HTMLElement>('.pk-flash');
    if (!f || reduced()) return;
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  private rays(on: boolean): void {
    const r = this.el.querySelector<HTMLElement>('.pk-rays');
    if (r) r.hidden = !on;
  }

  private banner(name: string): void {
    const b = this.el.querySelector<HTMLElement>('.pk-banner');
    if (!b) return;
    b.textContent = `VOCÊ ENCONTROU ${name}!`;
    b.hidden = false;
    b.classList.remove('in');
    void b.offsetWidth;
    b.classList.add('in');
  }

  /** Inclinação holográfica da carta virada, seguindo o ponteiro (só desktop). */
  private tilt(e: PointerEvent): void {
    const wrap = (e.target as HTMLElement).closest<HTMLElement>('.cf-wrap.flipped');
    for (const el of this.el.querySelectorAll<HTMLElement>('.cf.tilting')) if (el.closest('.cf-wrap') !== wrap) el.classList.remove('tilting');
    if (!wrap || reduced()) return;
    const card = wrap.querySelector<HTMLElement>('.cf')!;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.classList.add('tilting');
    card.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${((x - 0.5) * 20).toFixed(2)}deg`);
    card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  }

  private startMotes(): void {
    this.stopMotes();
    if (reduced()) return;
    this.motes = window.setInterval(() => {
      if (this.stage !== 'sealed') return;
      const pack = this.el.querySelector<HTMLElement>('.pk-pack');
      if (!pack) return;
      const r = pack.getBoundingClientRect();
      const veil = this.el.getBoundingClientRect();
      const x = r.left - veil.left + Math.random() * r.width;
      const y = r.top - veil.top + r.height * (0.5 + Math.random() * 0.5);
      this.fx?.mote(x, y, Math.random() < 0.5 ? '#ffe39a' : '#9fb8ff');
    }, 140);
  }

  private stopMotes(): void {
    if (this.motes) window.clearInterval(this.motes);
    this.motes = 0;
  }

  private resize(): void {
    this.fx?.resize(window.innerWidth, window.innerHeight);
  }

  // ---------- Utilidades ----------

  private centerOf(el: HTMLElement | null | undefined): { x: number; y: number } {
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    const veil = this.el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - veil.left, y: r.top + r.height / 2 - veil.top };
  }

  private bestRarity(): CardRarity {
    const order: CardRarity[] = ['mvp', 'miniboss', 'normal'];
    return order.find((r) => this.ids.some((id) => CARD_BY_ID[id].rarity === r)) ?? 'normal';
  }

  private summary(): string {
    const n = { normal: 0, miniboss: 0, mvp: 0 };
    for (const id of this.ids) n[CARD_BY_ID[id].rarity]++;
    const parts = [
      n.normal ? `${n.normal} ${n.normal > 1 ? 'Normais' : 'Normal'}` : '',
      n.miniboss ? `${n.miniboss} Mini-Boss` : '',
      n.mvp ? `${n.mvp} MVP` : '',
    ].filter(Boolean);
    return `Você revelou ${parts.join(' · ')}`;
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}

function reduced(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
