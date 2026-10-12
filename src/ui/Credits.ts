/**
 * Créditos finais (só ao vencer a luta final). Primeiro passam as fotos que o próprio jogo tirou ao vencer
 * cada fase (zoom lento e legenda); depois o roteiro de cenas (config/credits.ts), uma de cada vez, cada uma
 * com o seu tempo. "Pular" ou Esc encerra a qualquer momento. A tela só mostra o roteiro pronto: não decide nada.
 */
import './credits.css';
import { CREDITS_CONFIG, CREDITS_SCRIPT } from '../config/credits';
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

  /** Começa os créditos. Sem fotos, vai direto para o roteiro. `onDone` roda uma vez, ao terminar ou pular. */
  play(shots: CreditShot[], onDone: () => void): void {
    this.onDone = onDone;
    this.el.hidden = false;
    window.addEventListener('keydown', this.onKey);
    requestAnimationFrame(() => this.el.classList.add('on'));
    this.slide(shots, 0);
  }

  private slide(shots: CreditShot[], i: number): void {
    if (i >= shots.length) return this.cena(0);
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

  /** Uma cena do roteiro: aparece, fica o seu tempo e some. A última fica na tela até o jogador continuar. */
  private cena(i: number): void {
    const cena = CREDITS_SCRIPT[i];
    if (!cena) return this.end();
    const el = document.createElement('div');
    el.className = cena.apagao ? 'cr-cena apagao' : 'cr-cena';
    for (const l of cena.linhas) {
      const p = document.createElement('p');
      p.className = `cr-linha cr-${l.estilo}`;
      p.textContent = l.texto;
      el.append(p);
    }
    this.stage.replaceChildren(el);
    requestAnimationFrame(() => el.classList.add('on'));
    if (i === CREDITS_SCRIPT.length - 1) return this.later(() => this.end(), CREDITS_CONFIG.endDelayMs);
    this.later(() => {
      el.classList.remove('on');
      this.later(() => this.cena(i + 1), CREDITS_CONFIG.fadeMs);
    }, cena.ms);
  }

  private end(): void {
    this.skip.textContent = 'Continuar ➜';
    this.skip.classList.add('end');
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(
      window.setTimeout(() => {
        if (!this.el.hidden) fn();
      }, ms),
    );
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
