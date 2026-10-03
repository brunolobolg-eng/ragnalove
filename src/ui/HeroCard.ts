import type { Item, Slot } from '../core/progression/equipment';
import { RARITY_INFO, SLOT_KINDS, SLOT_LABEL, itemLines, itemName } from '../core/progression/equipment';
import { HERO_INFO, HERO_NAME } from '../config/heroes';
import type { HeroKind } from '../core/progression/skills';
import { SKILL_ICONS } from './icons';
import { itemArtCanvas, itemIconUrl } from './itemArt';

/** Resumo de um herói para a janelinha do mapa (montado pelo main). */
export interface HeroCardVM {
  kind: HeroKind;
  level: number;
  dead: boolean;
  hp: number;
  maxHp: number;
  /** Ataque da arma (físico ou mágico). */
  atk: number;
  magic: boolean;
  dodge: number;
  block: number;
  /** Pontos de atributo e de habilidade ainda não gastos. */
  points: number;
  skillPoints: number;
  /** Arte de corpo inteiro (renderizada do modelo 3D) ou retrato. */
  art: string;
  equipment: Partial<Record<Slot, Item>>;
}

export interface HeroCardCallbacks {
  onBag(kind: HeroKind): void;
  onAttributes(kind: HeroKind): void;
  onSkills(kind: HeroKind): void;
  onAbandon(): void;
  onUi(): void;
}

/** Slots em volta do personagem, na ordem da arte: cabeça → pés à esquerda, acessórios à direita. */
const LEFT: Slot[] = ['head', 'armor', 'cloak', 'weapon', 'boots'];
const RIGHT: Slot[] = ['earring', 'amulet', 'offhand', 'ring', 'belt'];

const ghostCache = new Map<Slot, string>();
function ghostIcon(s: Slot): string {
  let url = ghostCache.get(s);
  if (!url) {
    url = itemArtCanvas(SLOT_KINDS[s][0], 'common', 64).toDataURL();
    ghostCache.set(s, url);
  }
  return url;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Ícones pequenos dos status (traço simples, legíveis em 14 px). */
const SVG = {
  atk: '<svg viewBox="0 0 24 24"><path d="M4 20 15 9m-2-4 6-1-1 6M4 4l6 6m4 4 6 6M20 4 9 15m2 4-6 1 1-6"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M3 8h11M5 12h12M3 16h9M15 5c4 1 6 4 6 7s-2 6-6 7"/></svg>',
  block: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11Z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9Z"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M19 5l-4 4m-6 6-4 4"/></svg>',
  bag: '<svg viewBox="0 0 24 24"><path d="M8 7V5a4 4 0 0 1 8 0v2M5 8h14l-1 12H6Z"/></svg>',
  attrs: '<svg viewBox="0 0 24 24"><path d="M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3Z"/></svg>',
  skills: '<svg viewBox="0 0 24 24"><path d="M5 19 19 5M5 5l14 14M3 21l4-1-3-3ZM21 21l-1-4-3 3Z"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M5 21V4l9-1v18M14 12h7m-3-3 3 3-3 3"/></svg>',
  paw: '<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="2"/><circle cx="17" cy="8" r="2"/><circle cx="4.5" cy="13" r="1.8"/><circle cx="19.5" cy="13" r="1.8"/><path d="M12 12c-3 0-5 3.5-5 5.5S9 20 12 20s5-.5 5-2.5-2-5.5-5-5.5Z"/></svg>',
  wing: '<svg viewBox="0 0 24 24"><path d="M21 5C13 5 6 9 3 19c4-3 7-4 10-4-2-1-3-2-4-3 3 0 6-1 8-3-2 0-4 0-5-1 4 0 7-1 9-3Z"/></svg>',
};

/**
 * Janelinha do herói aberta pela lista da party no mapa: equipamento em volta do personagem,
 * vida, status principais e atalhos para mochila, atributos e habilidades.
 */
export class HeroCard {
  readonly el: HTMLElement;
  private vm?: HeroCardVM;

  constructor(parent: HTMLElement, private readonly cb: HeroCardCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'hc-veil';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === this.el) return this.close(); // clique fora da janela fecha
      const b = t.closest<HTMLElement>('[data-hc]');
      if (!b || !this.vm) return;
      this.cb.onUi();
      const k = this.vm.kind;
      const a = b.dataset.hc;
      if (a === 'close') this.close();
      else if (a === 'bag') this.cb.onBag(k);
      else if (a === 'attrs') this.cb.onAttributes(k);
      else if (a === 'skills') this.cb.onSkills(k);
      else if (a === 'abandon') this.cb.onAbandon();
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.el.hidden) this.close();
    });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  get kind(): HeroKind | undefined {
    return this.el.hidden ? undefined : this.vm?.kind;
  }

  open(vm: HeroCardVM): void {
    this.vm = vm;
    this.render();
    this.el.hidden = false;
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const h = this.vm!;
    const info = HERO_INFO[h.kind];
    const slot = (s: Slot) => {
      const it = h.equipment[s];
      if (!it) return `<div class="hc-slot empty" title="${SLOT_LABEL[s]} — vazio"><img src="${ghostIcon(s)}" alt=""></div>`;
      const r = RARITY_INFO[it.rarity];
      const tip = esc([itemName(it), ...itemLines(it)].join('\n'));
      return `<div class="hc-slot" style="--rc:${r.color}" title="${tip}"><img src="${itemIconUrl(it)}" alt="">${it.refine ? `<em>+${it.refine}</em>` : ''}</div>`;
    };
    const hpPct = h.maxHp ? Math.max(0, Math.min(1, h.hp / h.maxHp)) : 0;
    const emblem = SKILL_ICONS[info.area]?.() ?? '';
    this.el.innerHTML = `
      <div class="hc ${h.dead ? 'dead' : ''}" role="dialog" aria-label="${HERO_NAME[h.kind]}">
        <button class="hc-x" data-hc="close" title="Fechar (Esc)">×</button>
        <div class="hc-main">
          <header class="hc-head">
            <span class="hc-emblem">${emblem ? `<img src="${emblem}" alt="">` : ''}</span>
            <b>${HERO_NAME[h.kind]}</b><span class="hc-lv">Nv. ${h.level}</span>
          </header>
          <div class="hc-doll">
            <div class="hc-col">${LEFT.map(slot).join('')}</div>
            <div class="hc-figure">
              <img src="${h.art}" alt="">
              <div class="hc-bars">
                <span class="hc-hp">${SVG.heart}<b>${h.dead ? 'Caído' : `${h.hp}/${h.maxHp}`}</b><i style="--p:${hpPct}"></i></span>
              </div>
            </div>
            <div class="hc-col">${RIGHT.map(slot).join('')}</div>
          </div>
          <div class="hc-info">
            <div class="hc-stats">
              <div title="${h.magic ? 'Ataque mágico da arma' : 'Ataque da arma'}">${SVG.atk}<span>${h.magic ? 'ATQ M.' : 'ATQ'}</span><b>${h.atk}</b></div>
              <div title="Chance de esquiva">${SVG.dodge}<span>ESQ</span><b>${pct(h.dodge)}</b></div>
              <div title="Chance de bloqueio">${SVG.block}<span>BLQ</span><b>${pct(h.block)}</b></div>
            </div>
            <div class="hc-points">
              <div class="${h.points ? 'on' : ''}" title="Pontos de atributo para distribuir">${SVG.star}<b>${h.points}</b><span>atrib.</span></div>
              <div class="${h.skillPoints ? 'on sk' : 'sk'}" title="Pontos de habilidade para gastar">${SVG.spark}<b>${h.skillPoints}</b><span>hab.</span></div>
            </div>
          </div>
        </div>
        <aside class="hc-side">
          <section class="hc-extra"><h4>${SVG.paw}Pet</h4><div class="hc-big locked" title="Em breve">${SVG.paw}<small>Em breve</small></div></section>
          <section class="hc-extra"><h4>${SVG.wing}Asas</h4><div class="hc-big locked" title="Em breve">${SVG.wing}<small>Em breve</small></div></section>
        </aside>
        <nav class="hc-actions">
          <button data-hc="bag">${SVG.bag}<span>Mochila</span></button>
          <button data-hc="attrs">${SVG.attrs}<span>Atributos</span>${h.points ? `<i>${h.points}</i>` : ''}</button>
          <button data-hc="skills">${SVG.skills}<span>Habilidades</span>${h.skillPoints ? `<i>${h.skillPoints}</i>` : ''}</button>
          <button data-hc="abandon" class="danger">${SVG.door}<span>Abandonar</span></button>
        </nav>
      </div>`;
  }
}
