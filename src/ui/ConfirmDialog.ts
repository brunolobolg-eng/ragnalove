import { registerOverlay } from './overlays';

/**
 * Caixa de confirmação no estilo das janelas da HUD (ex.: ESC → voltar ao menu).
 * Enter confirma; ESC cancela (fecha pelo registro de janelas, junto com as outras). Enquanto aberta, o jogo fica pausado (quem pausa é o main).
 */
export class ConfirmDialog {
  private readonly el: HTMLElement;
  private onYes: () => void = () => {};

  constructor(private readonly onUiSound: () => void = () => {}) {
    this.el = document.createElement('div');
    this.el.className = 'confirm-veil';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="win confirm-win" role="dialog" aria-modal="true">
        <div class="win-title"><span data-title></span><span class="dots"></span></div>
        <div class="win-body">
          <p data-text></p>
          <div class="confirm-btns">
            <button class="confirm-yes danger" data-yes></button>
            <button data-no>Continuar jogando</button>
          </div>
          <small>Enter confirma · Esc cancela</small>
        </div>
      </div>`;
    document.body.appendChild(this.el);
    this.el.querySelector('[data-yes]')!.addEventListener('click', () => this.answer(true));
    this.el.querySelector('[data-no]')!.addEventListener('click', () => this.answer(false));
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.answer(false); // clique fora = cancelar
    });
    // captura: roda antes de qualquer outro atalho do jogo. O Esc não é tratado aqui: passa para o registro (fecha todas as janelas de uma vez)
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.el.hidden || e.key === 'Escape') return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.key === 'Enter') this.answer(true);
      },
      true,
    );
    registerOverlay({ isOpen: () => this.isOpen, close: () => this.close() });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  /** Fecha como "não" (Esc e clique fora). */
  close(): void {
    this.answer(false);
  }

  /** `tone`: cor do botão de confirmar. 'danger' (vermelho, ação destrutiva) é o padrão; 'normal' é a ação principal (dourado). */
  ask(title: string, text: string, yesLabel: string, onYes: () => void, tone: 'danger' | 'normal' = 'danger'): void {
    this.el.querySelector('[data-title]')!.textContent = title;
    this.el.querySelector('[data-text]')!.textContent = text;
    const yes = this.el.querySelector<HTMLButtonElement>('[data-yes]')!;
    yes.textContent = yesLabel;
    yes.className = tone === 'danger' ? 'confirm-yes danger' : 'confirm-yes primary';
    this.onYes = onYes;
    this.el.hidden = false;
    this.onUiSound();
    (this.el.querySelector('[data-no]') as HTMLButtonElement).focus();
  }

  private answer(yes: boolean): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this.onUiSound();
    if (yes) this.onYes();
  }
}
