/**
 * Coleção permanente de cartas (meta, entre runs): álbum com uma aba por herói (a classe em destaque), raridade
 * pela moldura e pela gema, quem está usando cada carta e um painel com o efeito da carta (ao passar o mouse).
 * Equipar aqui vale a partir da PRÓXIMA jornada (a run atual usa o que foi aplicado ao começar).
 * As regras (equipar, fundir, slots) vêm do core; aqui é só apresentação.
 */
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import {
  CARD_BY_ID,
  CARD_CATALOG,
  NORMALS,
  cardBonusFor,
  cardSlotsPool,
  equipCard,
  freeCopies,
  fuseBulk,
  fuseTriple,
  unequipCard,
  type CardCollection,
  type CardDef,
  type CardRarity,
} from '../core/progression/cards';
import type { HeroKind } from '../core/progression/skills';
import { ATTR_LABEL } from '../core/progression/attributes';
import { RARITY_COLOR, RARITY_LABEL, cardAffinityText, cardArtHtml } from './CardFace';
import { kitIcon } from './kit';

export interface CollectionCallbacks {
  /** Persiste a coleção (meta) e atualiza o que mostra o estado. */
  onChange(): void;
  onUi(): void;
}

type Filtro = 'all' | CardRarity;
type Ordem = 'raridade' | 'nome' | 'copias';

/** Cartas por página: 6 colunas × 3 linhas, o que cabe em 1280×720 sem rolagem. */
const POR_PAGINA = 18;
const RANK: Record<CardRarity, number> = { normal: 0, miniboss: 1, mvp: 2 };
const FILTRO_NOME: Record<Filtro, string> = { all: 'Todas', normal: 'Normais', miniboss: 'Mini-Boss', mvp: 'MVP' };
const ORDEM_NOME: Record<Ordem, string> = { raridade: 'Raridade', nome: 'Nome', copias: 'Cópias' };
/** Moldura da folha 32 por raridade: dourada, azul e vermelha, as mesmas cores de RARITY_COLOR. */
const RARITY_FRAME: Record<CardRarity, string> = { normal: 'cardframe_normal', miniboss: 'cardframe_miniboss', mvp: 'cardframe_mvp' };
/** Emblema de classe da folha 32. Feiticeira e Bruxa não têm ícone na folha: usam o retrato do herói. */
const CLASS_EMBLEM: Partial<Record<HeroKind, string>> = { warrior: 'cls_guerreiro', mage: 'cls_mago', archer: 'cls_arqueiro', assassin: 'cls_assassino' };
/** Cor de destaque de cada classe (aba, painel e barra de progresso). */
const HERO_ACCENT: Record<HeroKind, string> = { warrior: '#d8483a', mage: '#3f8cff', archer: '#4cb85c', sorcerer: '#2fc8d8', warlock: '#e8892b', assassin: '#a85ce6' };

const portraitOf = (h: HeroKind): string => `sprites/portrait_${h}.png`;
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Emblema da classe (ou o retrato, quando a classe não tem ícone na folha). */
function emblemHtml(h: HeroKind, cls: string): string {
  const e = CLASS_EMBLEM[h];
  return e ? `<img class="${cls}" src="${kitIcon(e)}" alt="">` : `<img class="${cls} port" src="${portraitOf(h)}" alt="">`;
}

/** Bônus da carta no herói: cheio com afinidade, metade sem. */
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
  private bastionNights = 0;
  private hero: HeroKind = 'warrior';
  private msg = '';
  private filter: Filtro = 'all';
  private sort: Ordem = 'raridade';
  private query = '';
  private page = 0;
  /** Carta escolhida com clique (fica no painel) e carta sob o mouse (prévia, não troca a escolha). */
  private sel?: string;
  private hover?: string;
  private gridEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private pageEl!: HTMLElement;
  private titleEl!: HTMLElement;

  constructor(private readonly cb: CollectionCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'cards-veil';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onSearch(e));
    this.el.addEventListener('change', (e) => this.onSort(e));
    this.el.addEventListener('mouseover', (e) => this.onHover(e));
    this.el.addEventListener('mouseout', (e) => this.onLeaveGrid(e));
  }

  open(cards: CardCollection, runsWon: number, hero?: HeroKind, bastionNights = 0): void {
    this.cards = cards;
    this.runsWon = runsWon;
    this.bastionNights = bastionNights;
    if (hero) this.hero = hero;
    this.msg = '';
    this.hover = undefined;
    this.el.hidden = false;
    this.render();
  }

  hide(): void {
    this.el.hidden = true;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
    if (!b || b.hasAttribute('disabled')) return;
    this.cb.onUi();
    this.hover = undefined; // o painel passa a mostrar a carta escolhida, não a que estava sob o mouse antes do clique
    const c = b.dataset.c!;
    if (c === 'close') return this.hide();
    if (c === 'hero') {
      this.hero = b.dataset.h as HeroKind;
      this.page = 0;
    } else if (c === 'filter') {
      this.filter = b.dataset.f as Filtro;
      this.page = 0;
    } else if (c === 'page') {
      this.page += Number(b.dataset.p);
    } else if (c === 'pick' && b.dataset.id) {
      this.sel = b.dataset.id;
    } else if (c === 'equip' && b.dataset.id) {
      this.msg = equipCard(this.cards, this.hero, b.dataset.id, cardSlotsPool(this.runsWon, this.bastionNights)) ?? `${CARD_BY_ID[b.dataset.id]?.name} equipada!`;
      this.sel = b.dataset.id;
      return this.changed();
    } else if (c === 'unequip' && b.dataset.i !== undefined) {
      unequipCard(this.cards, this.hero, Number(b.dataset.i));
      this.msg = 'Carta removida.';
      return this.changed();
    } else if (c === 'fuse3' && b.dataset.id) {
      const r = fuseTriple(this.cards, b.dataset.id);
      this.msg = r.made ? `Fusão: 3× ${CARD_BY_ID[b.dataset.id]?.name} → ${CARD_BY_ID[r.made]?.name}!` : (r.err ?? '');
      return this.changed();
    } else if (c === 'fuse10') {
      const r = fuseBulk(this.cards);
      this.msg = r.made ? `Fusão: 10 Normais → ${CARD_BY_ID[r.made]?.name} (Mini-Boss)!` : (r.err ?? '');
      return this.changed();
    }
    this.render();
  }

  private changed(): void {
    this.cb.onChange();
    this.render();
  }

  /** Prévia: passar o mouse numa carta mostra o painel dela, sem trocar a carta escolhida. */
  private onHover(e: MouseEvent): void {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.cl-card[data-id]');
    if (!c || c.dataset.id === this.hover) return;
    this.hover = c.dataset.id;
    this.renderDetail(this.hover);
  }

  /** Saiu da grade: volta o painel para a carta escolhida. */
  private onLeaveGrid(e: MouseEvent): void {
    if (!this.hover) return;
    const saiu = (e.target as HTMLElement).closest('.cl-grid') && !(e.relatedTarget as HTMLElement | null)?.closest?.('.cl-grid');
    if (!saiu) return;
    this.hover = undefined;
    this.renderDetail(this.sel);
  }

  private onSearch(e: Event): void {
    const t = e.target as HTMLInputElement;
    if (!t.classList.contains('cl-search-in')) return;
    this.query = t.value;
    this.page = 0;
    this.renderGrid();
  }

  private onSort(e: Event): void {
    const t = e.target as HTMLSelectElement;
    if (!t.classList.contains('cl-sort')) return;
    this.sort = t.value as Ordem;
    this.renderGrid();
  }

  private render(): void {
    const slots = cardSlotsPool(this.runsWon, this.bastionNights);
    const equipped = this.cards.equipped[this.hero] ?? [];
    const found = (r?: CardRarity): number => CARD_CATALOG.filter((d) => (!r || d.rarity === r) && (this.cards.owned[d.id] ?? 0) > 0).length;
    const total = (r?: CardRarity): number => CARD_CATALOG.filter((d) => !r || d.rarity === r).length;
    const bonus = cardBonusFor(this.hero, this.cards);
    const bonusTxt = (Object.entries(bonus) as [keyof typeof bonus, number][]).filter(([, v]) => v > 0).map(([k, v]) => `${ATTR_LABEL[k]} +${v}`).join(' · ') || 'nenhum';
    const freeNormals = NORMALS.reduce((s, d) => s + freeCopies(this.cards, d.id), 0);
    const pct = Math.round((found() / total()) * 100);

    const filtros = (['all', 'normal', 'miniboss', 'mvp'] as const)
      .map((f) => {
        const r = f === 'all' ? undefined : f;
        const icone = r ? `<i class="cl-gem g-${r}" aria-hidden="true"></i>` : `<img class="cl-ico" src="${kitIcon('ico_star')}" alt="">`;
        return `<button class="cl-filter${this.filter === f ? ' on' : ''}" data-c="filter" data-f="${f}">${icone}<span>${FILTRO_NOME[f]}</span><b>${found(r)}/${total(r)}</b></button>`;
      })
      .join('');

    const slotsHtml = Array.from({ length: Math.max(slots, equipped.length) }, (_, i) => {
      const id = equipped[i];
      if (!id || !CARD_BY_ID[id]) return '<i class="cl-slot" aria-hidden="true"></i>';
      return `<button class="cl-slot filled" style="--rc:${RARITY_COLOR[CARD_BY_ID[id].rarity]}" data-c="unequip" data-i="${i}" title="${CARD_BY_ID[id].name}: clique para remover">${cardArtHtml(id, 'cl-art')}</button>`;
    }).join('');

    const side = `<aside class="cl-side">
        <div class="cl-hero" style="--acc:${HERO_ACCENT[this.hero]}">
          ${emblemHtml(this.hero, 'cl-emb')}
          <div><b>${HERO_NAME[this.hero]}</b><small>Coleção de cartas</small></div>
        </div>
        <div class="cl-prog">
          <p><b>${found()}</b><span>/ ${total()}</span><small>Cartas encontradas</small></p>
          <div class="cl-bar"><i style="width:${pct}%"></i></div>
        </div>
        <nav class="cl-filters" aria-label="Raridade">${filtros}</nav>
        <div class="cl-equip">
          <h4>Equipadas <b>${equipped.length}/${slots}</b></h4>
          <div class="cl-slots">${slotsHtml || '<p class="cl-empty">Vença jornadas para liberar slots de carta.</p>'}</div>
          <p class="cl-bonus">Bônus: <b>${bonusTxt}</b></p>
          <p class="cl-note">Vale a partir da próxima jornada.</p>
        </div>
        <div class="cl-fuse">
          <button class="au-btn" data-c="fuse10"${freeNormals >= 10 ? '' : ' disabled'} title="Consome 10 Normais livres">Fundir 10 Normais <span class="cl-tag">${Math.min(freeNormals, 10)}/10</span></button>
          <p>3 iguais viram 1 Normal diferente.</p>
        </div>
      </aside>`;

    const tabs = HERO_ORDER.map(
      (h) => `<button class="cl-tab${h === this.hero ? ' on' : ''}" style="--acc:${HERO_ACCENT[h]}" data-c="hero" data-h="${h}">${emblemHtml(h, 'cl-tico')}<span>${HERO_NAME[h]}</span></button>`,
    ).join('');
    const ordens = (Object.keys(ORDEM_NOME) as Ordem[]).map((o) => `<option value="${o}"${this.sort === o ? ' selected' : ''}>Ordenar: ${ORDEM_NOME[o]}</option>`).join('');

    this.el.innerHTML = `<section class="au-frame cards-win" style="--acc:${HERO_ACCENT[this.hero]}">
      <div class="win-title"><i class="au-ico"><img src="${kitIcon('ico_star')}" alt=""></i><span>Coleção de cartas</span><small class="cl-sub">Reúna as cartas, fortaleça seu poder</small><button class="au-x" data-c="close" title="Fechar (Esc)">×</button></div>
      <div class="cl-body">
        ${side}
        <div class="cl-right">
          <nav class="cl-tabs" aria-label="Classes">${tabs}</nav>
          <section class="cl-main">
            <header class="cl-head">
              <h3 class="cl-title"></h3>
              <label class="cl-search"><input class="cl-search-in" type="search" placeholder="Buscar por nome da carta..." value="${esc(this.query)}" aria-label="Buscar carta pelo nome"></label>
              <select class="cl-sort" aria-label="Ordenar">${ordens}</select>
            </header>
            <div class="cl-grid"></div>
            <div class="cl-detail"></div>
            <footer class="cl-foot">
              <button class="au-btn cl-pg-btn" data-c="page" data-p="-1" aria-label="Página anterior">‹</button>
              <span class="cl-pg"></span>
              <button class="au-btn cl-pg-btn" data-c="page" data-p="1" aria-label="Próxima página">›</button>
              <span class="toast">${this.msg}</span>
            </footer>
          </section>
        </div>
      </div>
    </section>`;
    this.gridEl = this.el.querySelector<HTMLElement>('.cl-grid')!;
    this.detailEl = this.el.querySelector<HTMLElement>('.cl-detail')!;
    this.pageEl = this.el.querySelector<HTMLElement>('.cl-pg')!;
    this.titleEl = this.el.querySelector<HTMLElement>('.cl-title')!;
    this.renderGrid();
    this.renderDetail(this.hover ?? this.sel);
  }

  /** Só a grade, a página e o título (busca e ordenação não recriam a janela e não tiram o foco do campo). */
  private renderGrid(): void {
    const lista = this.filtradas();
    const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    this.page = Math.min(Math.max(this.page, 0), paginas - 1);
    const pagina = lista.slice(this.page * POR_PAGINA, (this.page + 1) * POR_PAGINA);
    const nome = this.filter === 'all' ? 'Todas as cartas' : `Cartas ${FILTRO_NOME[this.filter]}`;
    this.titleEl.textContent = `${nome} · ${lista.length}`;
    this.gridEl.innerHTML = pagina.length ? pagina.map((d) => this.cardHtml(d)).join('') : '<p class="cl-empty">Nenhuma carta com esse filtro.</p>';
    this.pageEl.textContent = `${this.page + 1} / ${paginas}`;
    this.el.querySelector<HTMLButtonElement>('[data-p="-1"]')!.disabled = this.page === 0;
    this.el.querySelector<HTMLButtonElement>('[data-p="1"]')!.disabled = this.page >= paginas - 1;
  }

  /** Cartas do filtro e da busca: as possuídas vêm primeiro; depois, pela ordem escolhida. */
  private filtradas(): CardDef[] {
    const q = this.query.trim().toLowerCase();
    const copias = (id: string): number => this.cards.owned[id] ?? 0;
    return CARD_CATALOG.filter((d) => (this.filter === 'all' || d.rarity === this.filter) && (!q || d.name.toLowerCase().includes(q))).sort((a, b) => {
      const posse = Number(copias(b.id) > 0) - Number(copias(a.id) > 0);
      if (posse) return posse;
      if (this.sort === 'nome') return a.name.localeCompare(b.name, 'pt-BR');
      if (this.sort === 'copias') return copias(b.id) - copias(a.id) || RANK[b.rarity] - RANK[a.rarity] || a.name.localeCompare(b.name, 'pt-BR');
      return RANK[b.rarity] - RANK[a.rarity] || a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  private cardHtml(d: CardDef): string {
    const n = this.cards.owned[d.id] ?? 0;
    const cor = RARITY_COLOR[d.rarity];
    const frame = `<img class="cl-frame" src="${kitIcon(RARITY_FRAME[d.rarity])}" alt="">`;
    const gema = `<i class="cl-gem cl-gtag g-${d.rarity}" aria-hidden="true"></i>`;
    const base = `cl-card r-${d.rarity}${this.sel === d.id ? ' sel' : ''}`;
    if (!n) {
      return `<button class="${base} locked" style="--rc:${cor}" data-c="pick" data-id="${d.id}" aria-label="Carta ainda não encontrada, ${RARITY_LABEL[d.rarity]}">${cardArtHtml(d.id, 'cl-art')}${frame}${gema}<span class="cl-cnt">???</span></button>`;
    }
    const usam = HERO_ORDER.filter((h) => (this.cards.equipped[h] ?? []).includes(d.id));
    const aqui = usam.includes(this.hero);
    const quem = usam.slice(0, 3).map((h) => `<img class="cl-who-chip" src="${portraitOf(h)}" alt="" title="Equipada: ${HERO_NAME[h]}" style="--acc:${HERO_ACCENT[h]}">`).join('')
      + (usam.length > 3 ? `<span class="cl-who-more">+${usam.length - 3}</span>` : '');
    return `<button class="${base}${aqui ? ' on' : ''}" style="--rc:${cor}" data-c="pick" data-id="${d.id}" aria-label="${d.name}, ${RARITY_LABEL[d.rarity]}, ${n} cópia(s)">${cardArtHtml(d.id, 'cl-art')}${frame}${gema}${aqui ? '<i class="cl-check" aria-hidden="true">✓</i>' : ''}${quem ? `<span class="cl-who">${quem}</span>` : ''}<span class="cl-cnt">×${n}</span></button>`;
  }

  /** Painel da carta: efeito no herói atual, classes com bônus cheio, cópias e ações (equipar, desequipar, fundir). */
  private renderDetail(id?: string): void {
    const d: CardDef | undefined = id ? CARD_BY_ID[id] : undefined;
    if (!d) {
      this.detailEl.innerHTML = '<p class="cl-dt-hint">Passe o mouse ou clique numa carta para ver o efeito e equipar.</p>';
      return;
    }
    const n = this.cards.owned[d.id] ?? 0;
    const frame = `<img class="cl-frame" src="${kitIcon(RARITY_FRAME[d.rarity])}" alt="">`;
    if (!n) {
      this.detailEl.innerHTML = `<div class="cl-dt locked r-${d.rarity}" style="--rc:${RARITY_COLOR[d.rarity]}">
        <div class="cl-dt-card">${cardArtHtml(d.id, 'cl-art')}${frame}</div>
        <div class="cl-dt-txt"><b>???</b><em><i class="cl-gem g-${d.rarity}"></i>${RARITY_LABEL[d.rarity]}</em><p>Ainda não encontrada. As cartas vêm dos pacotes de vitória.</p></div>
      </div>`;
      return;
    }
    const list = this.cards.equipped[this.hero] ?? [];
    const idx = list.indexOf(d.id);
    const livres = freeCopies(this.cards, d.id);
    const lotado = list.length >= cardSlotsPool(this.runsWon, this.bastionNights);
    const usam = HERO_ORDER.filter((h) => (this.cards.equipped[h] ?? []).includes(d.id)).map((h) => HERO_NAME[h]);
    const motivo = livres <= 0 ? 'Sem cópias livres' : lotado ? 'Sem slots livres' : `Equipar em ${HERO_NAME[this.hero]}`;
    const botaoEquipar = idx >= 0
      ? `<button class="au-btn" data-c="unequip" data-i="${idx}">Desequipar</button>`
      : `<button class="au-btn gold" data-c="equip" data-id="${d.id}"${livres > 0 && !lotado ? '' : ' disabled'} title="${motivo}">Equipar</button>`;
    const fundir = d.rarity === 'normal' && livres >= 3 ? `<button class="au-btn" data-c="fuse3" data-id="${d.id}">Fundir 3</button>` : '';
    this.detailEl.innerHTML = `<div class="cl-dt r-${d.rarity}" style="--rc:${RARITY_COLOR[d.rarity]}">
        <div class="cl-dt-card">${cardArtHtml(d.id, 'cl-art')}${frame}</div>
        <div class="cl-dt-txt">
          <b>${d.name}</b>
          <em><i class="cl-gem g-${d.rarity}"></i>${RARITY_LABEL[d.rarity]}</em>
          <p><span>Efeito em ${HERO_NAME[this.hero]}:</span> ${bonusText(this.hero, d.id)}</p>
          <p class="cl-dt-sub">${cardAffinityText(d.id)}</p>
          <p class="cl-dt-sub">Cópias: ${n} · livres: ${livres}${usam.length ? ` · equipada em ${usam.join(', ')}` : ''}</p>
        </div>
        <div class="cl-dt-btns">${botaoEquipar}${fundir}</div>
      </div>`;
  }
}
