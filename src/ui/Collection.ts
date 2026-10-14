/**
 * Coleção permanente de cartas (meta, entre runs): álbum com uma aba por herói (a classe em destaque), filtro por
 * categoria e um painel da carta escolhida: nome com o melhor nível, bônus no nível escolhido, desbloqueio do
 * nível 5, cópias por nível e as ações (equipar em um nível, desequipar, fundir). Equipar aqui vale a partir da
 * PRÓXIMA jornada (a run atual usa o que foi aplicado ao começar).
 * As regras (equipar, fundir, níveis, slots) vêm do core; aqui é só apresentação.
 */
import { HERO_NAME, HERO_ORDER } from '../config/heroes';
import {
  CARD_BY_ID,
  CARD_CATALOG,
  CARD_CATEGORIES,
  CARD_CATEGORY_LABEL,
  CARD_MAX_LEVEL,
  FUSION_COST,
  LEVEL_SUFFIX,
  cardLevelLabel,
  cardRuntimeFor,
  cardSlotsPool,
  copiesAt,
  emptyCollection,
  equipCard,
  freeCopiesAt,
  fuseCard,
  unequipCard,
  type CardCategory,
  type CardCollection,
  type CardDef,
} from '../core/progression/cards';
import type { HeroKind } from '../core/progression/skills';
import { CARD_GOLD, NIVEL_MAX_TAG, cardArtHtml, cardBonusText, cardUnlockText, categoriaTexto, escTxt, origemTexto } from './CardFace';
import { kitIcon } from './kit';
import { registerOverlay } from './overlays';

export interface CollectionCallbacks {
  /** Persiste a coleção (meta) e atualiza o que mostra o estado. */
  onChange(): void;
  onUi(): void;
}

type Filtro = 'all' | CardCategory;
type Ordem = 'categoria' | 'nome' | 'copias';

/** Cartas por página: 6 colunas × 3 linhas, o que cabe em 1280×720 sem rolagem. */
const POR_PAGINA = 18;
const ORDEM_NOME: Record<Ordem, string> = { categoria: 'Categoria', nome: 'Nome', copias: 'Cópias' };
/** Moldura da folha 32: a mesma para todas as cartas (não há raridade). */
const CARD_FRAME = 'cardframe_normal';
/** Níveis do álbum (1 a CARD_MAX_LEVEL). */
const NIVEIS = Array.from({ length: CARD_MAX_LEVEL }, (_, i) => i + 1);
/** Custos de fusão para a legenda: '5 → +', '2 → ++'... (lidos do core). */
const CUSTOS_TXT = NIVEIS.slice(0, -1)
  .map((L) => `${FUSION_COST[L]} → ${LEVEL_SUFFIX[L]}`)
  .join(' · ');
/** Emblema de classe da folha 32. Feiticeira e Bruxa não têm ícone na folha: usam o retrato do herói. */
const CLASS_EMBLEM: Partial<Record<HeroKind, string>> = { warrior: 'cls_guerreiro', mage: 'cls_mago', archer: 'cls_arqueiro', assassin: 'cls_assassino' };
/** Cor de destaque de cada classe (aba, painel e barra de progresso). */
const HERO_ACCENT: Record<HeroKind, string> = { warrior: '#d8483a', mage: '#3f8cff', archer: '#4cb85c', sorcerer: '#2fc8d8', warlock: '#e8892b', assassin: '#a85ce6' };

const portraitOf = (h: HeroKind): string => `sprites/portrait_${h}.png`;

/** Emblema da classe (ou o retrato, quando a classe não tem ícone na folha). */
function emblemHtml(h: HeroKind, cls: string): string {
  const e = CLASS_EMBLEM[h];
  return e ? `<img class="${cls}" src="${kitIcon(e)}" alt="">` : `<img class="${cls} port" src="${portraitOf(h)}" alt="">`;
}

/** Total de cópias da carta (todos os níveis, livres e equipadas). */
const totalOf = (c: CardCollection, id: string): number => (c.owned[id] ?? []).reduce((s, n) => s + n, 0);

/** Maior nível em que a carta tem alguma cópia (0: não possui). */
function melhorNivel(c: CardCollection, id: string): number {
  for (let L = CARD_MAX_LEVEL; L >= 1; L--) if (copiesAt(c, id, L) > 0) return L;
  return 0;
}

export class Collection {
  readonly el: HTMLElement;
  private cards: CardCollection = emptyCollection();
  private runsWon = 0;
  private bastionNights = 0;
  /** Retorno de quem abriu (ex.: o Bastião reabre o menu). Só roda no fechamento pelo jogador (× ou Esc). */
  private onClose?: () => void;
  private hero: HeroKind = 'warrior';
  private msg = '';
  private filter: Filtro = 'all';
  private sort: Ordem = 'categoria';
  private query = '';
  private page = 0;
  /** Carta escolhida com clique (fica no painel) e carta sob o mouse (prévia, não troca a escolha). */
  private sel?: string;
  private hover?: string;
  /** Nível escolhido nos botões do painel, por carta. Sem escolha, vale o maior nível com cópia livre. */
  private lvl?: { id: string; level: number };
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
    // Esc fecha pelo registro de janelas (ui/overlays.ts): mesmo caminho do ×
    registerOverlay({ isOpen: () => this.visible, close: () => this.dismiss() });
  }

  open(cards: CardCollection, runsWon: number, hero?: HeroKind, bastionNights = 0, onClose?: () => void): void {
    this.cards = cards;
    this.runsWon = runsWon;
    this.bastionNights = bastionNights;
    if (hero) this.hero = hero;
    this.msg = '';
    this.hover = undefined;
    this.lvl = undefined;
    this.onClose = onClose;
    this.el.hidden = false;
    this.render();
  }

  /** Fecha sem avisar ninguém (chamado pelo próprio jogo ao trocar de tela). */
  hide(): void {
    this.el.hidden = true;
    this.onClose = undefined;
  }

  /** Fechamento pelo jogador (× ou Esc): fecha e chama o retorno de quem abriu. */
  dismiss(): void {
    const volta = this.onClose;
    this.hide();
    volta?.();
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
    if (c === 'close') return this.dismiss();
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
    } else if (c === 'lvl' && b.dataset.id) {
      this.sel = b.dataset.id;
      this.lvl = { id: b.dataset.id, level: Number(b.dataset.l) };
    } else if (c === 'equip' && b.dataset.id) {
      const d = CARD_BY_ID[b.dataset.id];
      const nivel = Number(b.dataset.l);
      const motivo = equipCard(this.cards, this.hero, d.id, nivel, cardSlotsPool(this.runsWon, this.bastionNights));
      this.msg = motivo ?? `${cardLevelLabel(d, nivel)} equipada em ${HERO_NAME[this.hero]}!`;
      this.sel = d.id;
      this.lvl = { id: d.id, level: nivel };
      return this.changed();
    } else if (c === 'unequip' && b.dataset.i !== undefined) {
      unequipCard(this.cards, this.hero, Number(b.dataset.i));
      this.msg = 'Carta removida.';
      return this.changed();
    } else if (c === 'fuse' && b.dataset.id) {
      const d = CARD_BY_ID[b.dataset.id];
      const de = Number(b.dataset.l);
      const r = fuseCard(this.cards, d.id, de);
      this.msg = r.ok ? `Fusão: ${FUSION_COST[de]} × ${cardLevelLabel(d, de)} → ${cardLevelLabel(d, r.level)}!` : r.err;
      if (r.ok) {
        this.sel = d.id;
        this.lvl = { id: d.id, level: r.level };
      }
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
    const achadas = (f?: CardCategory): number => CARD_CATALOG.filter((d) => (!f || d.category === f) && totalOf(this.cards, d.id) > 0).length;
    const total = (f?: CardCategory): number => CARD_CATALOG.filter((d) => !f || d.category === f).length;
    const regras = cardRuntimeFor(this.hero, this.cards);
    const bonusTxt = regras.length ? regras.map((r) => escTxt(r.name)).join(' · ') : 'nenhum';
    const pct = Math.round((achadas() / total()) * 100);

    const filtros = (['all', ...CARD_CATEGORIES] as Filtro[])
      .map((f) => {
        const cat = f === 'all' ? undefined : f;
        const nome = cat ? CARD_CATEGORY_LABEL[cat] : 'Todas';
        return `<button class="cl-filter${this.filter === f ? ' on' : ''}" data-c="filter" data-f="${f}"><span>${nome}</span><b>${achadas(cat)}/${total(cat)}</b></button>`;
      })
      .join('');

    const slotsHtml = Array.from({ length: Math.max(slots, equipped.length) }, (_, i) => {
      const e = equipped[i];
      const d = e ? CARD_BY_ID[e.id] : undefined;
      if (!e || !d) return '<i class="cl-slot" aria-hidden="true"></i>';
      const sufixo = e.level > 1 ? `<i class="cl-slot-lv">${LEVEL_SUFFIX[e.level - 1]}</i>` : '';
      return `<button class="cl-slot filled" style="--rc:${CARD_GOLD}" data-c="unequip" data-i="${i}" title="${escTxt(cardLevelLabel(d, e.level))}: clique para remover">${cardArtHtml(d.id, 'cl-art')}${sufixo}</button>`;
    }).join('');

    const side = `<aside class="cl-side">
        <div class="cl-hero" style="--acc:${HERO_ACCENT[this.hero]}">
          ${emblemHtml(this.hero, 'cl-emb')}
          <div><b>${HERO_NAME[this.hero]}</b><small>Coleção de cartas</small></div>
        </div>
        <div class="cl-prog">
          <p><b>${achadas()}</b><span>/ ${total()}</span><small>Cartas encontradas</small></p>
          <div class="cl-bar"><i style="width:${pct}%"></i></div>
        </div>
        <nav class="cl-filters" aria-label="Categoria">${filtros}</nav>
        <div class="cl-equip">
          <h4>Equipadas <b>${equipped.length}/${slots}</b></h4>
          <div class="cl-slots">${slotsHtml || '<p class="cl-empty">Vença jornadas para liberar slots de carta.</p>'}</div>
          <p class="cl-bonus">Bônus: <b>${bonusTxt}</b></p>
          <p class="cl-note">Vale a partir da próxima jornada.</p>
        </div>
        <div class="cl-fuse">
          <p class="cl-fuse-txt"><b>Fundir</b> cópias livres do mesmo nível: ${CUSTOS_TXT}</p>
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
              <label class="cl-search"><input class="cl-search-in" type="search" placeholder="Buscar por nome da carta..." value="${escTxt(this.query)}" aria-label="Buscar carta pelo nome"></label>
              <select class="cl-sort" aria-label="Ordenar">${ordens}</select>
            </header>
            <div class="cl-grid"></div>
            <div class="cl-detail"></div>
            <footer class="cl-foot">
              <button class="au-btn cl-pg-btn" data-c="page" data-p="-1" aria-label="Página anterior">‹</button>
              <span class="cl-pg"></span>
              <button class="au-btn cl-pg-btn" data-c="page" data-p="1" aria-label="Próxima página">›</button>
              <span class="toast">${escTxt(this.msg)}</span>
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
    const nome = this.filter === 'all' ? 'Todas as cartas' : `Cartas: ${CARD_CATEGORY_LABEL[this.filter]}`;
    this.titleEl.textContent = `${nome} · ${lista.length}`;
    this.gridEl.innerHTML = pagina.length ? pagina.map((d) => this.cardHtml(d)).join('') : '<p class="cl-empty">Nenhuma carta com esse filtro.</p>';
    this.pageEl.textContent = `${this.page + 1} / ${paginas}`;
    this.el.querySelector<HTMLButtonElement>('[data-p="-1"]')!.disabled = this.page === 0;
    this.el.querySelector<HTMLButtonElement>('[data-p="1"]')!.disabled = this.page >= paginas - 1;
  }

  /** Cartas do filtro e da busca: as possuídas vêm primeiro; depois, pela ordem escolhida. */
  private filtradas(): CardDef[] {
    const q = this.query.trim().toLowerCase();
    const copias = (id: string): number => totalOf(this.cards, id);
    const ordemCat = (c: CardCategory): number => CARD_CATEGORIES.indexOf(c);
    return CARD_CATALOG.filter((d) => (this.filter === 'all' || d.category === this.filter) && (!q || d.name.toLowerCase().includes(q))).sort((a, b) => {
      const posse = Number(copias(b.id) > 0) - Number(copias(a.id) > 0);
      if (posse) return posse;
      if (this.sort === 'copias') return copias(b.id) - copias(a.id) || a.name.localeCompare(b.name, 'pt-BR');
      if (this.sort === 'nome') return a.name.localeCompare(b.name, 'pt-BR');
      return ordemCat(a.category) - ordemCat(b.category) || a.name.localeCompare(b.name, 'pt-BR');
    });
  }

  private cardHtml(d: CardDef): string {
    const n = totalOf(this.cards, d.id);
    const base = `cl-card${this.sel === d.id ? ' sel' : ''}`;
    const frame = `<img class="cl-frame" src="${kitIcon(CARD_FRAME)}" alt="">`;
    if (!n) {
      return `<button class="${base} locked" style="--rc:${CARD_GOLD}" data-c="pick" data-id="${d.id}" aria-label="Carta ainda não encontrada">${cardArtHtml(d.id, 'cl-art')}${frame}<span class="cl-cnt">???</span></button>`;
    }
    const nome = escTxt(cardLevelLabel(d, melhorNivel(this.cards, d.id)));
    const usam = HERO_ORDER.filter((h) => (this.cards.equipped[h] ?? []).some((e) => e.id === d.id));
    const aqui = usam.includes(this.hero);
    const quem = usam.slice(0, 3).map((h) => `<img class="cl-who-chip" src="${portraitOf(h)}" alt="" title="Equipada: ${HERO_NAME[h]}" style="--acc:${HERO_ACCENT[h]}">`).join('')
      + (usam.length > 3 ? `<span class="cl-who-more">+${usam.length - 3}</span>` : '');
    return `<button class="${base}${aqui ? ' on' : ''}" style="--rc:${CARD_GOLD}" data-c="pick" data-id="${d.id}" aria-label="${nome}, ${categoriaTexto(d)}, ${n} cópia(s)">${cardArtHtml(d.id, 'cl-art')}${frame}<span class="cl-nm">${nome}</span>${aqui ? '<i class="cl-check" aria-hidden="true">✓</i>' : ''}${quem ? `<span class="cl-who">${quem}</span>` : ''}<span class="cl-cnt">×${n}</span></button>`;
  }

  /**
   * Nível mostrado no painel e usado por Equipar/Fundir: o que o jogador escolheu nos botões de nível; sem escolha,
   * o maior nível com cópia livre (o padrão de equipar).
   */
  private nivelDe(d: CardDef): number {
    if (this.lvl?.id === d.id && copiesAt(this.cards, d.id, this.lvl.level) > 0) return this.lvl.level;
    for (let L = CARD_MAX_LEVEL; L >= 1; L--) if (freeCopiesAt(this.cards, d.id, L) > 0) return L;
    return Math.max(1, melhorNivel(this.cards, d.id));
  }

  /** Painel da carta: nome, bônus no nível escolhido, desbloqueio do nível 5, cópias por nível e as ações. */
  private renderDetail(id?: string): void {
    const d: CardDef | undefined = id ? CARD_BY_ID[id] : undefined;
    if (!d) {
      this.detailEl.innerHTML = '<p class="cl-dt-hint">Passe o mouse ou clique numa carta para ver o efeito e equipar.</p>';
      return;
    }
    const frame = `<img class="cl-frame" src="${kitIcon(CARD_FRAME)}" alt="">`;
    if (!totalOf(this.cards, d.id)) {
      this.detailEl.innerHTML = `<div class="cl-dt locked" style="--rc:${CARD_GOLD}">
        <div class="cl-dt-card">${cardArtHtml(d.id, 'cl-art')}${frame}</div>
        <div class="cl-dt-txt"><b>???</b><em>${categoriaTexto(d)}</em><p>Ainda não encontrada. As cartas vêm dos pacotes de vitória.</p></div>
      </div>`;
      return;
    }
    const nivel = this.nivelDe(d);
    const livres = freeCopiesAt(this.cards, d.id, nivel);
    const list = this.cards.equipped[this.hero] ?? [];
    const idx = list.findIndex((e) => e.id === d.id && e.level === nivel);
    const lotado = list.length >= cardSlotsPool(this.runsWon, this.bastionNights);
    const usam = HERO_ORDER.flatMap((h) => (this.cards.equipped[h] ?? []).filter((e) => e.id === d.id).map((e) => `${HERO_NAME[h]}${LEVEL_SUFFIX[e.level - 1]}`));

    const chips = NIVEIS.map((L) => {
      const cop = copiesAt(this.cards, d.id, L);
      const liv = freeCopiesAt(this.cards, d.id, L);
      const txt = cop ? `${cop} cópia${cop > 1 ? 's' : ''} · ${liv} livre${liv === 1 ? '' : 's'}` : 'sem cópia';
      return `<button class="cl-lv${L === nivel ? ' on' : ''}" data-c="lvl" data-id="${d.id}" data-l="${L}"${cop ? '' : ' disabled'} title="Nível ${L}: ${txt}"><b>Nível ${L}</b><small>${txt}</small></button>`;
    }).join('');

    const alvo = nivel < CARD_MAX_LEVEL;
    const progresso = alvo ? `${livres}/${FUSION_COST[nivel]} cópias para o próximo nível` : 'Nível máximo: bônus no teto e desbloqueio liberado';
    const fundir = alvo
      ? `<button class="au-btn" data-c="fuse" data-id="${d.id}" data-l="${nivel}"${livres >= FUSION_COST[nivel] ? '' : ' disabled'} title="Consome ${FUSION_COST[nivel]} cópias livres de ${escTxt(cardLevelLabel(d, nivel))}">Fundir ${FUSION_COST[nivel]} → ${LEVEL_SUFFIX[nivel]}</button>`
      : '<button class="au-btn" disabled>Nível máximo</button>';
    const acao = idx >= 0
      ? `<button class="au-btn" data-c="unequip" data-i="${idx}">Desequipar nível ${nivel}</button>`
      : `<button class="au-btn gold" data-c="equip" data-id="${d.id}" data-l="${nivel}"${livres > 0 && !lotado ? '' : ' disabled'} title="${livres <= 0 ? `Sem cópia livre no nível ${nivel}` : lotado ? 'Sem slots livres' : `Equipar em ${HERO_NAME[this.hero]}`}">Equipar nível ${nivel}</button>`;
    const desbloqueioAtivo = nivel >= CARD_MAX_LEVEL;

    this.detailEl.innerHTML = `<div class="cl-dt" style="--rc:${CARD_GOLD}">
        <div class="cl-dt-card">${cardArtHtml(d.id, 'cl-art')}${frame}</div>
        <div class="cl-dt-txt">
          <b>${escTxt(cardLevelLabel(d, melhorNivel(this.cards, d.id)))}</b>
          <em>${categoriaTexto(d)} · onde vai: ${escTxt(origemTexto(d))}</em>
          <p class="cl-dt-bonus"><span>Nível ${nivel}:</span> ${cardBonusText(d.id, nivel)}</p>
          <p class="cl-dt-unlock${desbloqueioAtivo ? ' on' : ''}">${NIVEL_MAX_TAG} ${cardUnlockText(d.id)}${desbloqueioAtivo ? '' : ' <span>(liberado só no nível 5)</span>'}</p>
          <div class="cl-lvls">${chips}</div>
          <p class="cl-dt-sub">${progresso} · equipada em: ${usam.length ? escTxt(usam.join(', ')) : 'ninguém'}</p>
        </div>
        <div class="cl-dt-btns">${acao}${fundir}</div>
      </div>`;
  }
}
