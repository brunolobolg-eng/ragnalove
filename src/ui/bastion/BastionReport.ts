import './bastion.css';
import type { BastionReportVM } from './bastionVM';
import { registerOverlay } from '../overlays';

const fmt = (n: number): string => n.toLocaleString('pt-BR');
const frac = (v: number, max: number): number => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);

/** Relatório de cada onda do Bastião: modal centralizado; Continuar, Enter ou Esc fecham. */
export class BastionReport {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private onDone: () => void = () => {};

  /** Fase de captura: Enter é deste modal enquanto ele está aberto. O Esc fecha pelo registro de janelas (também chama Continuar). */
  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.root.hidden || e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    this.finish();
  };

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'bastion-report';
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="au-frame bs-win bs-report" role="dialog" aria-modal="true" aria-labelledby="bs-report-title">
        <header class="bs-win-head">
          <i class="au-ico" aria-hidden="true">✦</i>
          <h2 id="bs-report-title" data-title></h2>
          <span class="au-price bs-verdict" data-verdict></span>
        </header>
        <div class="bs-report-body" data-body></div>
        <footer class="bs-report-foot"><button class="au-btn gold" data-act="continue">Continuar</button></footer>
      </section>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>('[data-body]')!;
    this.root.querySelector<HTMLButtonElement>('[data-act="continue"]')!.addEventListener('click', () => this.finish());
    window.addEventListener('keydown', this.onKey, true);
    registerOverlay({ isOpen: () => this.visible, close: () => this.finish() });
  }

  open(vm: BastionReportVM, onClose: () => void): void {
    this.onDone = onClose;
    this.root.querySelector<HTMLElement>('[data-title]')!.textContent = vm.title;
    const verdict = this.root.querySelector<HTMLElement>('[data-verdict]')!;
    verdict.textContent = vm.victory ? 'Vitória' : 'Derrota';
    verdict.className = `au-price bs-verdict bs-v-${vm.victory ? 'ok' : 'bad'}`;
    this.body.innerHTML = this.bodyHtml(vm);
    this.root.hidden = false;
    this.root.querySelector<HTMLButtonElement>('[data-act="continue"]')!.focus();
  }

  close(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private finish(): void {
    const done = this.onDone;
    this.close();
    done();
  }

  private bodyHtml(vm: BastionReportVM): string {
    const before = frac(vm.coreBefore, vm.coreMaxHp);
    const after = frac(vm.coreAfter, vm.coreMaxHp);
    return `
      <div class="bs-core">
        <div class="bs-core-top"><span>Núcleo</span><b>${fmt(vm.coreBefore)} → ${fmt(vm.coreAfter)} / ${fmt(vm.coreMaxHp)}</b></div>
        <div class="au-bar bs-core-bar" role="meter" aria-label="Vida do núcleo" aria-valuemin="0" aria-valuemax="${vm.coreMaxHp}" aria-valuenow="${vm.coreAfter}">
          <i class="bs-before" style="--p:${before}"></i><i class="bs-after" style="--p:${after};--from:${before}"></i>
        </div>
      </div>
      <dl class="bs-stats">
        <div><dt>Abatidos</dt><dd>${fmt(vm.kills)}</dd></div>
        <div><dt>Invasores</dt><dd>${fmt(vm.invaded)}</dd></div>
        <div><dt>Estruturas perdidas</dt><dd>${fmt(vm.structuresLost)}</dd></div>
        <div><dt>Estruturas danificadas</dt><dd>${fmt(vm.structuresDamaged)}</dd></div>
        <div><dt>Zen ganho</dt><dd>+${fmt(vm.zeniEarned)} Zen</dd></div>
      </dl>
      ${vm.packs > 0 ? `<p class="bs-packs">Pacote de cartas × ${fmt(vm.packs)}</p>` : ''}
      ${vm.attemptEnded ? '<p class="bs-ended">A tentativa acabou. Comece outra pela tela do Bastião.</p>' : ''}`;
  }
}
