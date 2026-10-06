import { HERO_INFO, HERO_NAME } from '../config/heroes';
import { GAME_CONFIG } from '../config/gameConfig';
import { NODE_LABEL, type NodeType } from '../config/world';
import { ITEM_KIND_LABEL, RARITY_INFO, SLOT_LABEL, itemKind, itemLines, itemName, type Item, type Rarity } from '../core/progression/equipment';
import type { HeroKind } from '../core/progression/skills';
import type { WaveReport } from '../core/sim/types';
import { SKILL_ICONS } from './icons';
import { itemIconUrl } from './itemArt';
import { NODE_COLOR, nodeIconUrl } from './nodeArt';

const NAME: Record<string, string> = HERO_NAME;
const ENEMY: Record<string, string> = { grunt: 'comuns', runner: 'rápidos', brute: 'pesados', necro: 'necromantes', elite: 'elite', boss: 'chefe', boss2: 'chefe', orcboss: 'chefe' };

/** Herói na coluna da party (estado no fim da onda). */
export interface NightHero {
  kind: HeroKind;
  level: number;
  /** Subiu de nível nesta noite. */
  leveled: boolean;
  dead: boolean;
  hp: number;
  maxHp: number;
  /** Progresso da EXP até o próximo nível (0..1). */
  exp: number;
}

/** Tudo o que a tela do Relatório da Noite mostra — montado pelo main (a tela não calcula regra). */
export interface NightReportVM {
  title: string;
  report: WaveReport;
  zeniBonus?: number;
  portraits: Record<string, string>;
  heroes: NightHero[];
  /** Itens que caíram (com ícone do jogo). */
  items: Item[];
  /** Blocos extras no centro (nova classe, herói que se juntou, pontuação da Sobrevivência...). */
  extraHtml?: string;
  phase: { phase: number; total: number; region: string; act: string; node: NodeType };
  bank: { zeni: number; souls: number };
}

export interface NightButton {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const fmt = (n: number) => n.toLocaleString('pt-BR');
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const iconCache = new Map<string, string>();
const classIcon = (k: HeroKind) => {
  const id = HERO_INFO[k].area;
  if (!iconCache.has(id)) iconCache.set(id, SKILL_ICONS[id]?.() ?? '');
  return iconCache.get(id)!;
};

/** Silhueta do castelo (ameaça à cidade). */
const CASTLE = `<svg class="nr-castle" viewBox="0 0 120 50" aria-hidden="true"><path d="M2 50V30h6v-6h5v6h6V18h5v-6h4v6h5v12h7V22h5v-8l4-6 4 6v8h5v8h7V18h5v-6h4v6h5v12h6v-6h5v6h6v20Z"/></svg>`;
const MOON = `<svg class="nr-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/><circle cx="17" cy="6" r="1"/><circle cx="20.5" cy="9.5" r=".7"/></svg>`;

/**
 * Relatório da Noite (depois de cada horda), no visual de jornada (azul-marinho + dourado):
 * party à esquerda, relatório no centro (desempenho, ameaça à cidade, recompensas) e a fase à direita.
 */
export class NightReport {
  readonly el: HTMLElement;
  private handlers: (() => void)[] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'nr-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (!b || b.hasAttribute('disabled')) return;
      this.handlers[Number(b.dataset.k)]?.();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  show(vm: NightReportVM, buttons: NightButton[]): void {
    this.handlers = buttons.map((b) => b.onClick);
    const btns = buttons
      .map((b, i) => `<button data-k="${i}" class="${b.primary ? 'nr-go' : 'nr-alt'}"${b.disabled ? ' disabled' : ''}>${b.label.replace(/\s*➜\s*$/, '')}${b.primary ? '<i>➜</i>' : ''}</button>`)
      .join('');
    this.el.innerHTML = `
      <aside class="nr-party">${vm.heroes.map((h) => heroRow(h, vm.portraits)).join('')}</aside>
      <section class="nr-main" role="dialog" aria-label="${esc(vm.title)}">
        <header class="nr-title">${MOON}<h2>${vm.title}</h2></header>
        ${performance(vm)}
        ${city(vm.report)}
        ${rewards(vm)}
        ${vm.extraHtml ? `<div class="nr-extra">${vm.extraHtml}</div>` : ''}
        <nav class="nr-btns">${btns}</nav>
      </section>
      <aside class="nr-side">${phaseCard(vm)}</aside>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}

function heroRow(h: NightHero, portraits: Record<string, string>): string {
  const hp = h.maxHp ? Math.max(0, Math.min(1, h.hp / h.maxHp)) : 0;
  return `<div class="nr-hero ${h.dead ? 'dead' : ''} ${h.leveled ? 'up' : ''}" style="--hc:${hex(HERO_INFO[h.kind].color)}">
    <div class="nr-pic"><img src="${portraits[h.kind] ?? ''}" alt=""><img class="nr-cls" src="${classIcon(h.kind)}" alt=""></div>
    <div class="nr-hinfo">
      <div class="nr-hname"><b>${NAME[h.kind]}</b><span>Nv. ${h.level}</span></div>
      <div class="nr-bar hp"><i style="width:${hp * 100}%"></i><span>${h.dead ? 'Caído' : `${fmt(h.hp)} / ${fmt(h.maxHp)}`}</span></div>
      <div class="nr-bar xp"><i style="width:${Math.max(0, Math.min(1, h.exp)) * 100}%"></i><span>EXP ${Math.round(h.exp * 100)}%</span></div>
      ${h.leveled ? `<em class="nr-lvup">⬆ Subiu para o nível ${h.level}!</em>` : ''}
    </div>
  </div>`;
}

function performance(vm: NightReportVM): string {
  const r = vm.report;
  const total = r.damageDealtByUnit.reduce((s, d) => s + d.amount, 0);
  const best = (list: { kind: string; amount?: number; count?: number }[]) =>
    list.reduce<{ kind: string; v: number } | undefined>((m, x) => ((x.amount ?? x.count ?? 0) > (m?.v ?? 0) ? { kind: x.kind, v: x.amount ?? x.count ?? 0 } : m), undefined)?.kind;
  const topDmg = best(r.damageDealtByUnit);
  const topTank = best(r.damageTakenByUnit);
  const topSkill = best(r.skillsUsedByUnit);
  const kinds = vm.heroes.map((h) => h.kind);
  const cards = kinds
    .map((k) => {
      const dmg = r.damageDealtByUnit.find((d) => d.kind === k)?.amount ?? 0;
      const share = total ? dmg / total : 0;
      const tags = [k === topDmg && total ? '⚔ Maior dano' : '', k === topTank ? '🛡 Tanque' : '', k === topSkill ? '✦ Habilidades' : ''].filter(Boolean);
      return `<div class="nr-perf" style="--hc:${hex(HERO_INFO[k].color)}" title="${fmt(dmg)} de dano causado">
        <img class="nr-ppic" src="${vm.portraits[k] ?? ''}" alt="">
        <div class="nr-pinfo">
          <div class="nr-pname"><b>${NAME[k]}</b></div>
          <div class="nr-pbar"><i style="width:${share * 100}%"></i></div>
          <div class="nr-pnum"><span>${fmt(dmg)} dano</span><b>${Math.round(share * 100)}%</b></div>
          ${tags.length ? `<div class="nr-tags">${tags.map((t) => `<em>${t}</em>`).join('')}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');
  return `<section class="nr-sec">
    <h3><span class="nr-ico">⚔</span>Desempenho da Party</h3>
    <div class="nr-perfs">${cards}</div>
    <div class="nr-kills"><span>☠ <b>${fmt(r.enemiesKilled)}</b> inimigos eliminados</span><span><i class="soul-ico"></i><b>${fmt(r.soulsCollected)}</b> almas coletadas</span></div>
  </section>`;
}

function city(r: WaveReport): string {
  const S = GAME_CONFIG.cityDefense.states;
  const frac = r.cityMaxHp ? r.cityHpRemaining / r.cityMaxHp : 0;
  const state = r.cityHpRemaining <= 0 ? 'fallen' : frac < S.critical ? 'critical' : frac < S.pressure ? 'danger' : frac < S.safe ? 'warn' : 'safe';
  const stateTxt = state === 'fallen' ? 'A cidade caiu!' : state === 'critical' || state === 'danger' ? 'A cidade está em perigo crítico!' : state === 'warn' ? 'A cidade está sob pressão.' : 'Cidade segura.';
  const kinds = Object.entries(r.reachedByKind)
    .map(([k, n]) => `${n} ${ENEMY[k] ?? k}`)
    .join(' • ');
  const threat = Math.round(r.cityThreatPercent * 100);
  const lines =
    r.enemiesReachedCity === 0
      ? '<p class="nr-perfect">✦ Defesa perfeita! Nenhum inimigo alcançou a cidade.</p>'
      : `<p><b class="nr-hl">${r.enemiesReachedCity} inimigo${r.enemiesReachedCity > 1 ? 's alcançaram' : ' alcançou'} a cidade</b>${kinds ? ` <span class="nr-dim">(${kinds})</span>` : ''}</p>
         <p>A cidade sofreu <b>${fmt(r.cityDamageTaken)}</b> de dano (${threat}% da vida total)</p>`;
  return `<section class="nr-sec nr-city ${state}">
    <h3><span class="nr-ico">♜</span>Ameaça à Cidade</h3>
    <div class="nr-cityrow"><div class="nr-citytxt">${lines}</div><div class="nr-cityart">${CASTLE}${state !== 'safe' ? '<span class="nr-alert">!</span>' : ''}</div></div>
    <div class="nr-bar threat"><i style="width:${Math.min(100, threat)}%"></i><span>Ameaça da noite: ${threat}%</span></div>
    <div class="nr-bar city ${state}"><i style="width:${Math.max(0, frac * 100)}%"></i><span>Vida da cidade: ${fmt(r.cityHpRemaining)} / ${fmt(r.cityMaxHp)}</span></div>
    <div class="nr-state ${state}">${stateTxt}</div>
  </section>`;
}

function rewards(vm: NightReportVM): string {
  const r = vm.report;
  const zeni = r.zeniEarned + (vm.zeniBonus ?? 0);
  const items = vm.items.length
    ? vm.items
        .map((it) => {
          const info = RARITY_INFO[it.rarity as Rarity];
          const name = itemName(it);
          const sub = `${ITEM_KIND_LABEL[itemKind(it)] ?? SLOT_LABEL[it.slot]} · ${info.label}`;
          return `<div class="nr-item r-${it.rarity}" style="--rc:${info.color}" title="${esc([name, ...itemLines(it)].join('\n'))}">
            <img src="${itemIconUrl(it)}" alt=""><div><b>${name}${it.refine ? ` +${it.refine}` : ''}</b><em>${sub}</em></div></div>`;
        })
        .join('')
    : '<p class="nr-dim nr-noitem">Nenhum item caiu nesta noite.</p>';
  return `<section class="nr-sec">
    <h3><span class="nr-ico">✦</span>Recompensas</h3>
    <div class="nr-gains">
      <span><b class="nr-star">★</b>+${fmt(r.expEarned)} EXP <small>para a party</small></span>
      <span><i class="soul-ico big"></i>+${fmt(r.soulsCollected)} <small>almas</small></span>
      <span><i class="zeni-ico"></i>+${fmt(zeni)} Zen${vm.zeniBonus ? ` <small>(inclui ${fmt(vm.zeniBonus)} de bônus)</small>` : ''}</span>
    </div>
    <div class="nr-items">${items}</div>
  </section>`;
}

function phaseCard(vm: NightReportVM): string {
  const p = vm.phase;
  const dots = Array.from({ length: p.total }, (_, i) => `<i class="${i + 1 < p.phase ? 'done' : i + 1 === p.phase ? 'now' : ''}"></i>`).join('');
  return `<div class="nr-card">
      <div class="nr-phase">
        <img src="${nodeIconUrl(p.node)}" alt="" style="--nc:${NODE_COLOR[p.node]}">
        <div><b>Fase ${p.phase} de ${p.total}</b><span>${p.region}</span><small>${p.act}</small></div>
      </div>
      <div class="nr-dots">${dots}</div>
      <div class="nr-node" style="--nc:${NODE_COLOR[p.node]}">${NODE_LABEL[p.node]}</div>
    </div>
    <div class="nr-card nr-bank">
      <span><i class="zeni-ico"></i><b>${fmt(vm.bank.zeni)}</b> Zen</span>
      <span><i class="soul-ico big"></i><b>${fmt(vm.bank.souls)}</b> almas</span>
    </div>`;
}
