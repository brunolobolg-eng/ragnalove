/**
 * Créditos finais (só ao vencer a luta final). Primeiro passam as fotos que o próprio jogo tirou ao vencer
 * cada fase (zoom lento e legenda), depois os créditos sobem na tela. "Pular" ou Esc encerra a qualquer momento.
 * A tela só mostra a lista pronta: não decide nada.
 */
import './credits.css';
import { CREDITS_CONFIG, CREDITS_TEAM } from '../config/credits';
import type { CreditShot } from '../save/CreditShots';

export class Credits {
  readonly el: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly skip: HTMLButtonElement;
  private timers: number[] = [];
  private onDone: () => void = () => {};
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.finish();
  };

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'cr-veil';
    this.el.hidden = true;
    this.el.innerHTML = '<div class="cr-stage"></div><button class="cr-skip" type="button">Pular ⏭</button>';
    this.stage = this.el.querySelector<HTMLElement>('.cr-stage')!;
    this.skip = this.el.querySelector<HTMLButtonElement>('.cr-skip')!;
    this.skip.addEventListener('click', () => this.finish());
    document.body.appendChild(this.el);
  }

  /** Começa os créditos. Sem fotos, vai direto para a rolagem. `onDone` roda uma vez, ao terminar ou pular. */
  play(shots: CreditShot[], onDone: () => void): void {
    this.onDone = onDone;
    this.el.hidden = false;
    window.addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.slide(shots, 0);
  }

  private slide(shots: CreditShot[], i: number): void {
    if (i >= shots.length) return this.roll();
    const shot = shots[i];
    const fig = document.createElement('figure');
    fig.className = 'cr-slide';
    const img = document.createElement('img');
    img.src = shot.dataUrl;
    img.alt = shot.caption;
    const cap = document.createElement('figcaption');
    cap.textContent = shot.caption;
    fig.append(img, cap);
    this.stage.replaceChildren(fig);
    requestAnimationFrame(() => fig.classList.add('on'));
    this.later(() => this.slide(shots, i + 1), CREDITS_CONFIG.slideMs);
  }

  private roll(): void {
    const roll = document.createElement('div');
    roll.className = 'cr-roll';
    roll.style.animationDuration = `${CREDITS_CONFIG.rollMs}ms`;
    roll.innerHTML =
      '<h2 class="cr-title">ROguard</h2><p class="cr-sub">Crônicas das Almas Roubadas</p>' +
      CREDITS_TEAM.map((sec) => `<h3 class="cr-sec">${sec.titulo}</h3>${sec.nomes.map((n) => `<p class="cr-name">${n}</p>`).join('')}`).join('') +
      '<p class="cr-sub cr-thanks">Obrigado por jogar</p>';
    this.stage.replaceChildren(roll);
    this.later(() => {
      this.skip.textContent = 'Continuar ➜';
      this.skip.classList.add('end');
    }, CREDITS_CONFIG.rollMs);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private finish(): void {
    if (this.el.hidden) return;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    window.removeEventListener('keydown', this.onKey);
    this.el.classList.remove('on');
    this.el.hidden = true;
    this.stage.replaceChildren();
    this.skip.textContent = 'Pular ⏭';
    this.skip.classList.remove('end');
    this.onDone();
  }
}
