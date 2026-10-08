/**
 * Pacote de fim de run (só vitória): revela as 5 cartas. As cartas já entraram na
 * coleção ao conceder (main.ts) — aqui é só a revelação, com destaque para MVP.
 */
import { CARD_BY_ID, type CardRarity } from '../core/progression/cards';
import { cardArt } from '../core/progression/cards';

const RARITY: Record<CardRarity, { label: string; color: string }> = {
  normal: { label: 'Normal', color: '#b8c4dc' },
  miniboss: { label: 'Mini-Boss', color: '#c77dff' },
  mvp: { label: 'MVP', color: '#ffd700' },
};

export class CardPack {
  readonly el: HTMLElement;
  private onClose: () => void = () => {};

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'cards-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!b) return;
      if (b.dataset.c === 'close') {
        this.hide();
        this.onClose();
      }
    });
  }

  show(ids: string[], onClose: () => void): void {
    this.onClose = onClose;
    const mvps = ids.filter((id) => CARD_BY_ID[id]?.rarity === 'mvp');
    this.el.innerHTML = `<section class="win cards-pack">
      <div class="win-title"><i class="au-ico">🃏</i><span>Pacote de cartas — vitória!</span></div>
      <div class="win-body">
        ${mvps.map((id) => `<div class="mvp-banner">VOCÊ ENCONTROU ${CARD_BY_ID[id].name}!</div>`).join('')}
        <div class="pack-row">${ids
          .map((id) => {
            const d = CARD_BY_ID[id];
            if (!d) return '';
            const r = RARITY[d.rarity];
            return `<div class="pcard got ${d.rarity}" style="--rc:${r.color}" title="${d.name} · ${r.label}">
              <img src="${cardArt(id)}" alt="${d.name}"><b>${d.name}</b><span>${r.label}</span></div>`;
          })
          .join('')}</div>
        <div class="acts"><button class="big-act primary" data-c="close">Guardar na coleção ➜</button></div>
      </div></section>`;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
