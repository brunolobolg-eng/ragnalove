import './bastion.css';
import { repairVerb, type BastionHeroRow, type BastionHordeRow, type BastionHubHooks, type BastionHubVM, type BastionStructureRow } from './bastionVM';

/** Tamanho da party (regra do core: de 1 a 6 heróis). A tela só desliga o toggle que a quebraria. */
const PARTY_MAX = 6;
const TABS = [
  ['structures', 'Estruturas'],
  ['projects', 'Projetos'],
  ['heroes', 'Heróis'],
] as const;
type Tab = (typeof TABS)[number][0];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string | number): string => String(s).replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const fmt = (n: number): string => n.toLocaleString('pt-BR');
const frac = (v: number, max: number): number => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);
const STATUS: Record<BastionStructureRow['status'], string> = { intact: 'Inteira', damaged: 'Danificada', destroyed: 'Destruída' };
const zenLabel = (verb: string, cost: number, none: string): string => `${verb} · ${cost > 0 ? `${fmt(cost)} Zen` : none}`;
const TIER_LABEL: Record<BastionHordeRow['tier'], string> = { comum: 'Comum', mini: 'Mini-chefe', mvp: 'MVP' };
const upLabel = (s: BastionStructureRow): string =>
  s.upgradeCost !== undefined ? zenLabel('Aprimorar', s.upgradeCost, '') : `Aprimorar · ${s.status === 'destroyed' ? 'indisponível' : 'nível máximo'}`;
const meter = (v: number, max: number, label: string, text = '', cls = ''): string =>
  `<div class="au-bar ${cls}" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${v}" style="--p:${frac(v, max)}"><i></i>${text ? `<b>${text}</b>` : ''}</div>`;

/** O toggle quebraria a regra da party (0 ou mais de PARTY_MAX heróis): fica desligado. */
const partyBlocked = (party: BastionHeroRow[], i: number): boolean => {
  const count = party.filter((h) => h.selected).length;
  const next = party[i].selected ? count - 1 : count + 1;
  return next < 1 || next > PARTY_MAX;
};

/** Tela principal do Último Bastião (Montar Defesa): só mostra o VM e chama os ganchos. */
export class BastionHub {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly attempt: HTMLElement;
  private vm: BastionHubVM | null = null;
  private tab: Tab = 'structures';

  constructor(private readonly hooks: BastionHubHooks) {
    this.root = document.createElement('div');
    this.root.id = 'bastion-hub';
    this.root.hidden = true;
    this.root.innerHTML = `
      <section class="au-frame bs-win bs-hub-win" role="dialog" aria-modal="true" aria-labelledby="bs-hub-title">
        <header class="bs-win-head">
          <i class="au-ico" aria-hidden="true">✦</i>
          <h2 id="bs-hub-title">Montar Defesa · O Último Bastião</h2>
          <span class="bs-attempt" data-attempt></span>
          <button class="au-x" data-act="exit" title="Sair do modo" aria-label="Sair do modo">×</button>
        </header>
        <div class="bs-hub-body" data-body></div>
        <footer class="bs-win-foot"><p class="bs-msg" data-msg aria-live="polite"></p></footer>
      </section>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector<HTMLElement>('[data-body]')!;
    this.msg = this.root.querySelector<HTMLElement>('[data-msg]')!;
    this.attempt = this.root.querySelector<HTMLElement>('[data-attempt]')!;
    this.root.addEventListener('click', (e) => this.onClick(e));
  }

  open(vm: BastionHubVM): void {
    this.vm = vm;
    this.root.hidden = false;
    this.render();
  }

  update(vm: BastionHubVM): void {
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
    this.attempt.textContent = `Tentativa ${vm.attempt}`;
    this.msg.textContent = vm.message ?? '';
    this.body.innerHTML = `<div class="bs-hub-grid">${this.cityCol(vm)}<div class="bs-main">${this.mainCol(vm)}</div></div>`;
  }

  private onClick(e: Event): void {
    const el = (e.target as Element | null)?.closest<HTMLElement>('[data-act],[data-tab]');
    const vm = this.vm;
    if (!el || !vm || (el as HTMLButtonElement).disabled) return;
    const { act, tab, id, i } = el.dataset;
    if (tab) {
      this.tab = tab as Tab;
      this.render();
      return;
    }
    const sid = Number(id);
    switch (act) {
      case 'exit': this.hooks.onExit(); break;
      case 'build': this.hooks.onBuild(); break;
      case 'night': this.hooks.onNight(); break;
      case 'new-attempt': this.hooks.onNewAttempt(); break;
      case 'repair-core': this.hooks.onRepairCore(); break;
      case 'cards': this.hooks.onCards(); break;
      case 'repair': this.hooks.onRepairStructure(sid); break;
      case 'upgrade': this.hooks.onUpgradeStructure(sid); break;
      case 'unlock': this.hooks.onUnlock(id ?? ''); break;
      case 'party': this.hooks.onParty(this.partyWith(vm, Number(i))); break;
    }
  }

  private partyWith(vm: BastionHubVM, i: number): BastionHeroRow['kind'][] {
    return vm.party.filter((h, j) => (j === i ? !h.selected : h.selected)).map((h) => h.kind);
  }

  private cityCol(vm: BastionHubVM): string {
    const coreRepair = vm.coreRepairCost > 0 && vm.zeni >= vm.coreRepairCost;
    return `<aside class="bs-city">
        <section class="au-sec">
          <h3 class="au-h">Cidade</h3>
          ${meter(vm.coreHp, vm.coreMaxHp, 'Vida do núcleo', `${fmt(vm.coreHp)} / ${fmt(vm.coreMaxHp)}`)}
          <p class="bs-kv"><span>Zen</span><span class="au-price">${fmt(vm.zeni)} Zen</span></p>
          <p class="bs-kv"><span>Noites vencidas</span><b>${fmt(vm.nights)}</b></p>
          <p class="bs-sub">Nesta tentativa: ${fmt(vm.nightsInAttempt)} · Melhor sequência: ${fmt(vm.bestNights)}</p>
        </section>
        ${this.horde(vm.nextHorde)}
        <section class="au-sec bs-acts">
          <button class="au-btn" data-act="build">Construir</button>
          <button class="au-btn gold" data-act="night"${vm.canStartNight ? '' : ' disabled'}>Iniciar noite</button>
          ${vm.canNewAttempt ? `<button class="au-btn${vm.attemptEnded ? ' gold' : ''}" data-act="new-attempt">Recomeçar do zero</button>` : ''}
          <button class="au-btn" data-act="repair-core"${coreRepair ? '' : ' disabled'}>${zenLabel('Reparar núcleo', vm.coreRepairCost, 'inteiro')}</button>
          <button class="au-btn" data-act="cards">Cartas</button>
          <button class="au-btn" data-act="exit">Sair do modo</button>
        </section>
        ${vm.attemptEnded ? `<p class="bs-note">A tentativa acabou.${vm.canNewAttempt ? ' Use Recomeçar do zero para voltar à noite 1.' : ''}</p>` : ''}
      </aside>`;
  }

  /** Próxima horda: título, quem chega e a marca do tipo (mini-chefe e MVP ficam destacados). */
  private horde(h: BastionHordeRow): string {
    const quem = h.tier === 'comum' ? 'Tropa' : 'Chefe';
    return `<section class="au-sec bs-horde bs-horde-${h.tier}" aria-label="Próxima horda">
          <h3 class="au-h">Próxima horda</h3>
          <p class="bs-horde-top"><b class="bs-horde-title">${esc(h.title)}</b><span class="au-price bs-tier bs-tier-${h.tier}">${TIER_LABEL[h.tier]}</span></p>
          <p class="bs-horde-detail"><span class="bs-sub">${quem}:</span> ${esc(h.detail)}</p>
          <p class="bs-sub">${fmt(h.count)} inimigos comuns${h.tier === 'comum' ? '' : ' + o chefe da noite'}</p>
        </section>`;
  }

  private mainCol(vm: BastionHubVM): string {
    const tabs = TABS.map(
      ([id, label]) => `<button class="au-tab${this.tab === id ? ' on' : ''}" data-tab="${id}" aria-pressed="${this.tab === id}">${label}</button>`,
    ).join('');
    const panel = this.tab === 'structures' ? this.structures(vm) : this.tab === 'projects' ? this.projects(vm) : this.heroes(vm);
    return `<div class="au-tabs">${tabs}</div><div class="bs-panel">${panel}</div>`;
  }

  private structures(vm: BastionHubVM): string {
    if (!vm.structures.length) return '<p class="bs-empty">Nenhuma construção ainda. Use Construir para começar.</p>';
    return vm.structures
      .map(
        (s) => `<article class="au-sec bs-row">
          <div class="bs-row-main">
            <b class="bs-row-name">${esc(s.name)}</b>
            <small>Nível ${s.level}/${s.maxLevel} · HP ${fmt(s.hp)}/${fmt(s.maxHp)}</small>
            ${meter(s.hp, s.maxHp, 'Vida da construção', '', 'sm hp')}
          </div>
          <span class="au-price bs-st bs-st-${s.status}">${STATUS[s.status]}</span>
          <div class="bs-row-acts">
            <button class="au-btn" data-act="repair" data-id="${s.id}"${s.repairCost > 0 && vm.zeni >= s.repairCost ? '' : ' disabled'}>${zenLabel(repairVerb(s.status), s.repairCost, 'inteira')}</button>
            <button class="au-btn" data-act="upgrade" data-id="${s.id}"${s.upgradeCost !== undefined && vm.zeni >= s.upgradeCost ? '' : ' disabled'}>${upLabel(s)}</button>
          </div>
        </article>`,
      )
      .join('');
  }

  private projects(vm: BastionHubVM): string {
    if (!vm.projects.length) return '<p class="bs-empty">Nenhum projeto disponível.</p>';
    return vm.projects
      .map((p) => {
        const blocked = Boolean(p.lockReason) || vm.zeni < p.cost;
        const action = p.owned
          ? '<span class="bs-owned">Desbloqueado</span>'
          : `<button class="au-btn" data-act="unlock" data-id="${esc(p.id)}"${blocked ? ' disabled' : ''}>${zenLabel('Desbloquear', p.cost, 'grátis')}</button>`;
        return `<article class="au-sec bs-row">
          <div class="bs-row-main">
            <b class="bs-row-name">${esc(p.name)}</b>
            <small>${esc(p.desc)}</small>
            ${!p.owned && p.lockReason ? `<small class="bs-lock">${esc(p.lockReason)}</small>` : ''}
          </div>
          <span class="au-price">${fmt(p.cost)} Zen</span>
          <div class="bs-row-acts">${action}</div>
        </article>`;
      })
      .join('');
  }

  private heroes(vm: BastionHubVM): string {
    const picked = vm.party.filter((h) => h.selected).length;
    const cells = vm.party
      .map(
        (h, i) => `<button class="au-tab bs-hero${h.selected ? ' on' : ''}" data-act="party" data-i="${i}" aria-pressed="${h.selected}"${partyBlocked(vm.party, i) ? ' disabled' : ''}>${esc(h.name)}</button>`,
      )
      .join('');
    return `<p class="bs-hint">Escolha de 1 a ${PARTY_MAX} heróis para defender o bastião. Escolhidos: ${picked}.</p><div class="bs-heroes">${cells}</div>`;
  }
}
