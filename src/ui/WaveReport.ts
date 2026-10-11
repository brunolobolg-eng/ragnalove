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
/** Cor de cada tipo de inimigo na barra de composição (mesma leitura das raridades do jogo). */
const KIND_COLOR: Record<string, string> = { runner: '#ffd23f', grunt: '#b8bcc4', brute: '#ff7a3a', necro: '#b55cff', elite: '#3f8fff', boss: '#ff3b3b', boss2: '#ff3b3b', orcboss: '#ff3b3b' };

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
  /** Blocos extras (nova classe, herói que se juntou, pontuação da Sobrevivência...). */
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
const STAR = `<svg class="nr-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9Z"/></svg>`;
const SKULL = `<svg class="nr-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V19h2.5v-1.5h1V19h3v-1.5h1V19H17v-2.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8Zm-3.5 9a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Zm7 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z"/></svg>`;
const CROWN = `<svg class="nr-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5Z"/></svg>`;

/**
 * Relatório da Noite (depois de cada horda), visual primeiro: um cartão só, sem rolagem.
 * Números e símbolos no lugar de frases; detalhes ficam no tooltip (passar o mouse).
 * Ordem: estatísticas, party, cidade, itens, extras e rodapé com fase e botões.
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
      .map((b, i) => `<button data-k="${i}" class="${b.primary ? 'nr-go au-btn gold' : 'nr-alt au-btn'}"${b.disabled ? ' disabled' : ''}>${b.label.replace(/\s*➜\s*$/, '')}${b.primary ? '<i>➜</i>' : ''}</button>`)
      .join('');
    this.el.innerHTML = `
      <section class="nr-card au-frame" role="dialog" aria-label="${esc(vm.title)}">
        <header class="nr-head">${MOON}<h2>${esc(vm.title)}</h2></header>
        ${stats(vm.report)}
        ${party(vm)}
        ${city(vm.report)}
        ${loot(vm.items)}
        ${vm.extraHtml ? `<div class="nr-extra">${vm.extraHtml}</div>` : ''}
        <footer class="nr-foot">${phase(vm)}<nav class="nr-btns">${btns}</nav></footer>
      </section>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}

/** Quatro números que resumem a noite (abatidos, almas, EXP e Zen), sem frases. */
function stats(r: WaveReport): string {
  return `<div class="nr-stats">
    <div class="nr-stat" title="Inimigos eliminados nesta noite">${SKULL}<b>${fmt(r.enemiesKilled)}</b></div>
    <div class="nr-stat" title="Almas coletadas"><i class="soul-ico big"></i><b>${fmt(r.soulsCollected)}</b></div>
    <div class="nr-stat exp" title="EXP para a party">${STAR}<b>+${fmt(r.expEarned)}</b></div>
    <div class="nr-stat" title="Zen ganho nesta noite"><i class="zeni-ico big"></i><b>+${fmt(r.zeniEarned)}</b></div>
  </div>`;
}

/** Party: retrato com a cor do herói, barra de vida e barra de dano (dourada). Coroa no que mais causou dano. */
function party(vm: NightReportVM): string {
  const r = vm.report;
  const best = r.damageDealtByUnit.reduce<{ kind: string; v: number } | undefined>((m, d) => (d.amount > (m?.v ?? 0) ? { kind: d.kind, v: d.amount } : m), undefined);
  const total = r.damageDealtByUnit.reduce((s, d) => s + d.amount, 0);
  return `<div class="nr-party">${vm.heroes.map((h) => heroRow(h, vm, best?.kind, total)).join('')}</div>`;
}

function heroRow(h: NightHero, vm: NightReportVM, topKind: string | undefined, total: number): string {
  const dmg = vm.report.damageDealtByUnit.find((d) => d.kind === h.kind)?.amount ?? 0;
  const share = total ? dmg / total : 0;
  const hp = h.maxHp ? Math.max(0, Math.min(1, h.hp / h.maxHp)) : 0;
  const mvp = h.kind === topKind && total > 0;
  const tip = `${NAME[h.kind]} · Nv. ${h.level}\n${fmt(dmg)} de dano (${Math.round(share * 100)}%)\nVida ${h.dead ? 'caído' : `${fmt(h.hp)} / ${fmt(h.maxHp)}`}\nEXP ${Math.round(h.exp * 100)}%`;
  return `<div class="nr-hero ${h.dead ? 'dead' : ''} ${h.leveled ? 'up' : ''}" style="--hc:${hex(HERO_INFO[h.kind].color)}" title="${esc(tip)}">
    <div class="nr-pic"><img src="${vm.portraits[h.kind] ?? ''}" alt=""><img class="nr-cls" src="${classIcon(h.kind)}" alt=""></div>
    <b>${NAME[h.kind]}</b>
    <div class="au-bar sm hp"><i style="width:${hp * 100}%"></i></div>
    <div class="au-bar sm dmg"><i style="width:${share * 100}%"></i></div>
    ${mvp ? `<em class="nr-crown">${CROWN}</em>` : ''}
    ${h.leveled ? '<em class="nr-up">▲</em>' : ''}
  </div>`;
}

/** Cidade: barra de vida, composição de quem chegou (um pedaço por tipo), dois números e um selo de estado. */
function city(r: WaveReport): string {
  const S = GAME_CONFIG.cityDefense.states;
  const frac = r.cityMaxHp ? r.cityHpRemaining / r.cityMaxHp : 0;
  const state = r.cityHpRemaining <= 0 ? 'fallen' : frac < S.critical ? 'critical' : frac < S.pressure ? 'danger' : frac < S.safe ? 'warn' : 'safe';
  const stateTxt =
    r.enemiesReachedCity === 0 && state === 'safe' ? 'Defesa perfeita' : state === 'fallen' ? 'Caiu' : state === 'critical' || state === 'danger' ? 'Em perigo' : state === 'warn' ? 'Sob pressão' : 'Segura';
  const threat = Math.round(r.cityThreatPercent * 100);
  const comp = Object.entries(r.reachedByKind)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `<i style="flex:${n};background:${KIND_COLOR[k] ?? '#7fd1ff'}" title="${n} ${ENEMY[k] ?? k}"></i>`)
    .join('');
  return `<section class="nr-city ${state}" title="Ameaça da noite: ${threat}%">
    <div class="nr-castle-wrap">${CASTLE}${state !== 'safe' ? '<em class="nr-alert">!</em>' : ''}</div>
    <div class="nr-city-main">
      <div class="au-bar city ${state}"><i style="width:${Math.max(0, frac * 100)}%"></i><b>${fmt(r.cityHpRemaining)} / ${fmt(r.cityMaxHp)}</b></div>
      <div class="nr-comp">${comp || '<i class="nr-none"></i>'}</div>
    </div>
    <div class="nr-num" title="Inimigos que alcançaram a cidade"><b class="${r.enemiesReachedCity ? 'bad' : 'good'}">${fmt(r.enemiesReachedCity)}</b><small>alcançaram</small></div>
    <div class="nr-num" title="Dano que a cidade sofreu"><b class="${r.cityDamageTaken ? 'bad' : 'good'}">−${fmt(r.cityDamageTaken)}</b><small>dano</small></div>
    <span class="nr-state">${stateTxt}</span>
  </section>`;
}

/** Itens que caíram: uma moldura por item, na cor da raridade. Nome e detalhes no tooltip. */
function loot(items: Item[]): string {
  if (!items.length) return '<p class="nr-none-txt">Nenhum item caiu nesta noite.</p>';
  const shown = items.slice(0, 6);
  const more = items.length - shown.length;
  const tiles = shown
    .map((it) => {
      const name = itemName(it);
      const tip = [name, `${ITEM_KIND_LABEL[itemKind(it)] ?? SLOT_LABEL[it.slot]} · ${RARITY_INFO[it.rarity as Rarity].label}`, ...itemLines(it)].join('\n');
      return `<div class="au-slot r-${it.rarity} nr-tile" title="${esc(tip)}"><img src="${itemIconUrl(it)}" alt="">${it.refine ? `<em>+${it.refine}</em>` : ''}</div>`;
    })
    .join('');
  return `<div class="nr-loot">${tiles}${more > 0 ? `<div class="nr-more" title="Mais ${more} item(ns) na bolsa">+${more}</div>` : ''}</div>`;
}

/** Rodapé: fase em bolinhas (região e ato no tooltip) e o banco do jogador em números. */
function phase(vm: NightReportVM): string {
  const p = vm.phase;
  const dots = Array.from({ length: p.total }, (_, i) => `<i class="${i + 1 < p.phase ? 'done' : i + 1 === p.phase ? 'now' : ''}"></i>`).join('');
  return `<div class="nr-phase" title="${esc(`${NODE_LABEL[p.node]} · ${p.region} · ${p.act}`)}">
      <img src="${nodeIconUrl(p.node)}" alt="" style="--nc:${NODE_COLOR[p.node]}">
      <b>Fase ${p.phase}/${p.total}</b>
      <div class="nr-dots">${dots}</div>
      <span class="nr-bank" title="Zen e almas no bolso"><i class="zeni-ico"></i>${fmt(vm.bank.zeni)} <i class="soul-ico"></i>${fmt(vm.bank.souls)}</span>
    </div>`;
}
