/**
 * Dicas contextuais (tutorial breve): uma frase no momento certo, uma vez só.
 * Vistas salvas em localStorage separado (sem tocar no save da jornada).
 */
const KEY = 'vanguarda.coach.v1';

function seen(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, true>;
  } catch {
    return {};
  }
}

export class CoachTips {
  private readonly el: HTMLElement;
  private queue: { id: string; html: string }[] = [];
  private showing: string | undefined;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'coach-tip';
    this.el.hidden = true;
    this.el.addEventListener('click', () => this.dismiss());
    parent.appendChild(this.el);
  }

  /** Mostra se for a primeira vez; enfileira se já houver uma na tela. */
  maybe(id: string, html: string): void {
    if (seen()[id]) return;
    if (this.showing === id || this.queue.some((q) => q.id === id)) return;
    this.queue.push({ id, html });
    this.next();
  }

  private next(): void {
    if (this.showing || !this.queue.length) return;
    const q = this.queue.shift()!;
    this.showing = q.id;
    this.el.innerHTML = `${q.html}<span class="coach-ok">Entendi ✓</span>`;
    this.el.hidden = false;
  }

  private dismiss(): void {
    if (!this.showing) return;
    try {
      const s = seen();
      s[this.showing] = true;
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* sem storage: mostra de novo na próxima */
    }
    this.showing = undefined;
    this.el.hidden = true;
    this.next();
  }

  hide(): void {
    this.queue.length = 0;
    this.showing = undefined;
    this.el.hidden = true;
  }
}
