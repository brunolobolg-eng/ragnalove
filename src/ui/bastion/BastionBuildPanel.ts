import './bastion.css';
import { repairVerb, type BastionBuildHooks, type BastionBuildVM, type BastionMoveWhy, type BastionPaletteRow, type BastionStructureRow } from './bastionVM';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string | number): string => String(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const fmt = (n: number): string => n.toLocaleString('pt-BR');
const frac = (v: number, max: number): number => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);
const STATUS: Record<BastionStructureRow['status'], string> = { intact: 'Inteira', damaged: 'Danificada', destroyed: 'Destruída' };
const HINT = 'Escolha uma construção e leve o mouse ao campo: a prévia mostra onde ela fica e se dá. Muralhas vão a qualquer lugar; torres só nos lotes azuis.';
const MOVING = 'Movendo: leve o mouse ao campo e clique numa casa livre. Clique na própria muralha ou Esc cancela o movimento.';
/** Por que a construção pode (ou não) ser movida. A regra é isMovable (core); aqui só o texto. */
const MOVE_WHY: Record<BastionMoveWhy, string> = {
  recent: 'Recente: pode mover até a próxima noite',
  old: 'Construída em noite anterior: já não se move',
  destroyed: 'Destruída: clique em Reconstruir antes de mover',
  fixed: 'Torres não se movem',
};
const zenLabel = (verb: string, cost: number, none: string): string => `${verb} · ${cost > 0 ? `${fmt(cost)} Zen` : none}`;

type Selected = NonNullable<BastionBuildVM['selected']>;

/** Barra de construção no campo (planejamento): só o painel recebe o mouse; o resto do campo segue clicável. */
export class BastionBuildPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly night: HTMLButtonElement;
  private vm: BastionBuildVM | null = null;

  constructor(private readonly hooks: BastionBuildHooks) {
    this.root = document.createElement('section');
    this.root.id = 'bastion-build';
    this.root.className = 'au-frame bs-win';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', 'Construção');
    this.root.innerHTML = `
      <header class="bs-win-head"><i class="au-ico" aria-hidden="true">✦</i><h2>Construção</h2></header>
      <div class="bs-build-body" data-body></div>
      <footer class="bs-build-foot">
        <button class="au-btn gold" data-act="night">Iniciar noite</button>
        <button class="au-btn" data-act="back">Voltar ao Bastião</button>
        <p class="bs-msg" data-msg aria-live="polite"></p>
      </footer>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>('[data-body]')!;
    this.msg = this.root.querySelector<HTMLElement>('[data-msg]')!;
    this.night = this.root.querySelector<HTMLButtonElement>('[data-act="night"]')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  open(vm: BastionBuildVM): void {
    this.vm = vm;
    this.root.hidden = false;
    this.render();
  }

  update(vm: BastionBuildVM): void {
    if (!this.visible) return;
    this.vm = vm;
    this.render();
  }

  close(): void {
    this.root.hidden = true;
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  private render(): void {
    const vm = this.vm;
    if (!vm) return;
    this.night.disabled = !vm.canStartNight;
    this.msg.textContent = vm.message ?? '';
    this.body.innerHTML = `
      <p class="bs-city-line">Zen <b>${fmt(vm.zeni)}</b> · Núcleo <b>${fmt(vm.coreHp)} / ${fmt(vm.coreMaxHp)}</b></p>
      <p class="bs-hint${vm.selected?.moving ? ' bs-moving' : ''}">${vm.selected?.moving ? MOVING : HINT}</p>
      <div class="bs-palette">${vm.palette.map((r, i) => this.paletteBtn(r, i)).join('')}</div>
      ${vm.selected ? this.selectedBox(vm.selected, vm.zeni) : ''}`;
  }

  private paletteBtn(r: BastionPaletteRow, i: number): string {
    const shot = r.shot ? ` · Tiro ${fmt(r.shot.damage)} · alcance ${fmt(r.shot.range)}` : '';
    return `<button class="au-btn bs-pal" data-i="${i}" aria-pressed="${r.selected}" title="${esc(r.desc)}"${r.unlocked ? '' : ' disabled'}>
        <span class="bs-pal-top"><b>${esc(r.name)}</b><span class="au-price">${fmt(r.cost)} Zen</span></span>
        <span class="bs-pal-meta">HP ${fmt(r.hp)}${shot}</span>
        ${r.selected ? `<span class="bs-pal-desc">${esc(r.desc)}</span>` : ''}
        ${!r.unlocked && r.lockReason ? `<span class="bs-lock">${esc(r.lockReason)}</span>` : ''}
      </button>`;
  }

  private selectedBox(s: Selected, zeni: number): string {
    const up = s.upgradeCost;
    const upText = up !== undefined ? zenLabel('Aprimorar', up, '') : `Aprimorar · ${s.status === 'destroyed' ? 'indisponível' : 'nível máximo'}`;
    return `<section class="au-sec bs-sel" aria-label="Construção escolhida">
        <h3 class="au-h">${esc(s.name)}</h3>
        <p class="bs-meta"><span>Nível ${s.level}/${s.maxLevel}</span><span>HP ${fmt(s.hp)}/${fmt(s.maxHp)}</span><span class="au-price bs-st bs-st-${s.status}">${STATUS[s.status]}</span></p>
        <div class="au-bar sm hp" role="meter" aria-label="Vida da construção" aria-valuemin="0" aria-valuemax="${s.maxHp}" aria-valuenow="${s.hp}" style="--p:${frac(s.hp, s.maxHp)}"><i></i></div>
        <p class="bs-sub">Investido: ${fmt(s.invested)} Zen</p>
        <div class="bs-acts">
          <button class="au-btn" data-act="repair" data-id="${s.id}"${s.repairCost > 0 && zeni >= s.repairCost ? '' : ' disabled'}>${zenLabel(repairVerb(s.status), s.repairCost, 'inteira')}</button>
          <button class="au-btn" data-act="upgrade" data-id="${s.id}"${up !== undefined && zeni >= up ? '' : ' disabled'}>${upText}</button>
          <div class="bs-move">
            <button class="au-btn${s.moving ? ' gold' : ''}" data-act="move" data-id="${s.id}"${s.movable || s.moving ? '' : ' disabled'}>${s.moving ? 'Cancelar movimento' : 'Mover'}</button>
            <p class="bs-sub bs-move-why${s.movable ? ' bs-move-ok' : ''}">${MOVE_WHY[s.moveWhy]}</p>
          </div>
          <button class="au-btn danger" data-act="remove" data-id="${s.id}">Remover · devolve ${fmt(s.refund)} Zen</button>
        </div>
      </section>`;
  }

  private onClick(e: Event): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-i],[data-act]');
    const vm = this.vm;
    if (!el || !vm || (el as HTMLButtonElement).disabled) return;
    const { act, i, id } = el.dataset;
    if (i !== undefined) {
      const row = vm.palette[Number(i)];
      this.hooks.onPick(row.selected ? undefined : row.kind);
      return;
    }
    const sid = Number(id);
    switch (act) {
      case 'night': this.hooks.onNight(); break;
      case 'back': this.hooks.onBackToHub(); break;
      case 'repair': this.hooks.onRepair(sid); break;
      case 'upgrade': this.hooks.onUpgrade(sid); break;
      case 'remove': this.hooks.onRemove(sid); break;
      case 'move': this.hooks.onMove(sid); break;
    }
  }
}
