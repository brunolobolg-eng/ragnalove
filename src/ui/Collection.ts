/**
 * Coleção permanente de cartas (meta, entre runs): ver coleção, equipar builds por
 * herói e fundir duplicatas. Equipar aqui vale a partir da PRÓXIMA jornada
 * (a run atual usa o que foi aplicado ao começar).
 */
import { HERO_ORDER, HERO_NAME } from '../config/heroes';
import {
  CARD_BY_ID,
  CARD_CATALOG,
  MINIBOSSES,
  NORMALS,
  cardArt,
  cardBonusFor,
  cardSlots,
  equipCard,
  freeCopies,
  fuseBulk,
  fuseTriple,
  unequipCard,
  type CardCollection,
  type CardRarity,
} from '../core/progression/cards';
import type { HeroKind } from '../core/progression/skills';
import { ATTR_LABEL } from '../core/progression/attributes';

export interface CollectionCallbacks {
  /** Persiste a coleção (meta) e atualiza o que mostra o estado. */
  onChange(): void;
  onUi(): void;
}

const RARITY: Record<CardRarity, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#b8c4dc' },
  miniboss: { label: 'Mini-Boss', color: '#c77dff' },
  mvp: { label: 'MVP', color: '#ffd700' },
};

const bonusText = (hero: HeroKind, id: string): string => {
  const d = CARD_BY_ID[id];
  if (!d) return '';
  const full = d.affinity.includes(hero);
  const v = (n: number): number => (full ? n : Math.floor(n / 2));
  const parts = [`${ATTR_LABEL[d.attr]} +${v(d.value)}${full ? '' : ' (½)'}`];
  if (d.second) parts.push(`${ATTR_LABEL[d.second.attr]} +${v(d.second.value)}${full ? '' : ' (½)'}`);
  return parts.join(' · ');
};

export class Collection {
  readonly el: HTMLElement;
  private cards: CardCollection = { owned: {}, equipped: {} };
  private runsWon = 0;
  private hero: HeroKind = 'warrior';
  private msg = '';
  private filter: 'all' | CardRarity = 'all';

  constructor(private readonly cb: CollectionCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'cards-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!b || b.hasAttribute('disabled')) return;
      this.cb.onUi();
      const c = b.dataset.c!;
      if (c === 'close') return this.hide();
      if (c === 'hero') this.hero = b.dataset.h as HeroKind;
      else if (c === 'filter') this.filter = b.dataset.f as typeof this.filter;
      else if (c === 'equip' && b.dataset.id) this.msg = equipCard(this.cards, this.hero, b.dataset.id, cardSlots(this.runsWon)) ?? `${CARD_BY_ID[b.dataset.id]?.name} equipada!`;
      else if (c === 'unequip') {
        unequipCard(this.cards, this.hero, Number(b.dataset.i));
        this.msg = 'Carta removida.';
      } else if (c === 'fuse3' && b.dataset.id) {
        const r = fuseTriple(this.cards, b.dataset.id);
        this.msg = r.made ? `Fusão: 3× ${CARD_BY_ID[b.dataset.id]?.name} → ${CARD_BY_ID[r.made]?.name}!` : (r.err ?? '');
      } else if (c === 'fuse10') {
        const r = fuseBulk(this.cards);
        this.msg = r.made ? `Fusão: 10 Normais → ${CARD_BY_ID[r.made]?.name} (Mini-Boss)!` : (r.err ?? '');
      }
      this.cb.onChange();
      this.render();
    });
  }

  open(cards: CardCollection, runsWon: number, hero?: HeroKind): void {
    this.cards = cards;
    this.runsWon = runsWon;
    if (hero) this.hero = hero;
    this.msg = '';
    this.el.hidden = false;
    this.render();
  }

  hide(): void {
    this.el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  private render(): void {
    const slots = cardSlots(this.runsWon);
    const list = this.cards.equipped[this.hero] ?? [];
    const bonus = cardBonusFor(this.hero, this.cards);
    const bonusTxt = (Object.entries(bonus) as [keyof typeof bonus, number][]).filter(([, v]) => v > 0).map(([k, v]) => `${ATTR_LABEL[k]} +${v}`).join(' · ') || '—';
    const freeNormals = NORMALS.reduce((s, d) => s + freeCopies(this.cards, d.id), 0);
    const defs = CARD_CATALOG.filter((d) => this.filter === 'all' || d.rarity === this.filter).sort((a, b) => (MINIBOSSES.includes(a) || a.rarity === 'mvp' ? 0 : 1) - (MINIBOSSES.includes(b) || b.rarity === 'mvp' ? 0 : 1));
    const ownedKinds = CARD_CATALOG.filter((d) => (this.cards.owned[d.id] ?? 0) > 0).length;
    this.el.innerHTML = `<section class="win cards-win">
      <div class="win-title"><i class="au-ico">🃏</i><span>Coleção de cartas</span><button class="au-x" data-c="close" title="Fechar (Esc)">×</button></div>
      <div class="win-body">
        <div class="tabs-row">${HERO_ORDER.map((h) => `<button data-c="hero" data-h="${h}" class="${h === this.hero ? 'on' : ''}">${HERO_NAME[h]}</button>`).join('')}
          <span class="sk-bank">Runs vencidas: <b>${this.runsWon}</b> · Slots: <b>${list.length}/${slots}</b></span></div>
        <p class="hint">Bônus atual de ${HERO_NAME[this.hero]}: <b>${bonusTxt}</b> <small>(vale a partir da próxima jornada)</small></p>
        <h4>Equipada — clique para remover</h4>
        <div class="build-row">${list.length ? list.map((id, i) => `<button class="mini-card" data-c="unequip" data-i="${i}" title="${bonusText(this.hero, id)} — clique para remover"><img src="${cardArt(id)}" alt=""><small>${CARD_BY_ID[id]?.name}</small></button>`).join('') : '<div class="empty">Nenhuma carta equipada</div>'}</div>
        <h4>Fusão <small>(3 iguais → 1 Normal diferente · 10 Normais → 1 Mini-Boss)</small></h4>
        <div class="acts"><button class="big-act" data-c="fuse10"${freeNormals >= 10 ? '' : ' disabled'} title="Consome 10 Normais livres">🎁 Fundir 10 Normais <span class="tag">${freeNormals}/10</span></button></div>
        <h4>Coleção (${ownedKinds}/${CARD_CATALOG.length})</h4>
        <div class="au-tabs">${(['all', 'normal', 'miniboss', 'mvp'] as const).map((f) => `<button class="au-tab ${this.filter === f ? 'on' : ''}" data-c="filter" data-f="${f}">${f === 'all' ? 'Todas' : RARITY[f].label}</button>`).join('')}</div>
        <div class="igrid">${defs
          .map((d) => {
            const owned = this.cards.owned[d.id] ?? 0;
            const free = freeCopies(this.cards, d.id);
            const r = RARITY[d.rarity];
            return `<div class="icard${owned ? '' : ' missing'}" style="--rc:${r.color}" title="${d.name} · ${r.label} · ${bonusText(this.hero, d.id)}${d.affinity.includes(this.hero) ? '' : ' — sem afinidade (metade)'}">
              <img class="ic" src="${cardArt(d.id)}" alt=""><span>${r.label}</span><b>×${owned}</b>
              ${owned ? `<button class="price" data-c="equip" data-id="${d.id}"${free > 0 && list.length < slots ? '' : ' disabled'}>Equipar</button>` : ''}
              ${d.rarity === 'normal' && free >= 3 ? `<button class="price sell" data-c="fuse3" data-id="${d.id}">Fundir 3</button>` : ''}</div>`;
          })
          .join('')}</div>
        <div class="toast">${this.msg}</div>
      </div></section>`;
  }
}
