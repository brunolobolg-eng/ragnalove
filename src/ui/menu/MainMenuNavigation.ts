/**
 * Navegação do menu principal: botões em ordem, foco com mouse/teclado (setas, Tab)
 * e ativação com Enter/Espaço. Não sabe o que cada item faz — só avisa `onActivate`.
 */
export class MainMenuNavigation {
  private index = 0;

  constructor(
    private readonly items: HTMLButtonElement[],
    private readonly onActivate: (id: string) => void,
    private readonly onMove: () => void,
  ) {
    items.forEach((b, i) => {
      b.addEventListener('mouseenter', () => this.focus(i, false));
      b.addEventListener('click', () => this.activate(i));
    });
    this.focus(0, false);
  }

  /** Tecla dentro do menu. Devolve true se foi tratada. */
  key(e: KeyboardEvent): boolean {
    const n = this.items.length;
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        this.focus((this.index + 1) % n);
        return true;
      case 'ArrowUp':
      case 'ArrowLeft':
        this.focus((this.index - 1 + n) % n);
        return true;
      case 'Tab':
        this.focus((this.index + (e.shiftKey ? n - 1 : 1)) % n);
        return true;
      case 'Enter':
      case ' ':
        this.activate(this.index);
        return true;
    }
    return false;
  }

  /** Volta o foco para a ação principal (ao reabrir o menu). */
  reset(): void {
    this.focus(0, false);
  }

  private focus(i: number, sound = true): void {
    if (sound && i !== this.index) this.onMove();
    this.index = i;
    this.items.forEach((b, k) => b.classList.toggle('focus', k === i));
  }

  private activate(i: number): void {
    this.focus(i, false);
    this.onActivate(this.items[i].dataset.id!);
  }
}
