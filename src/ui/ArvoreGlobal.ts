import type { HeroKind } from '../core/progression/skills';
import { ARVORE_CONFIG, type Categoria, type MasteryId, type NoTipo } from '../config/arvoreGlobal';
import { ARVORE_VISUAL, FAMILIA_VISUAL, TAMANHO_NO } from '../config/arvoreVisual';
import { registerOverlay } from './overlays';
import { caminhoAte, type ArvoreVM, type CandidatoVM, type HeroiVM, type MasteryVM, type NoVM } from './arvoreVM';

/**
 * Árvore Global de Aurenthal: a roda (anéis, setores por família, emblema de Aurenthal no centro), com zoom e pan,
 * caminho aceso até o nó sob o cursor ou selecionado, tooltip compacto ao passar o cursor, painel de detalhes do nó
 * (nome, efeito, requisitos, custo e ação) e painel de Masteries (uma por personagem, com custo em Zen antes de
 * confirmar) e reorganização. Tudo é pago pelo banco de Zen.
 * Na roda não há nomes: cada nó é uma forma com ícone. O nome aparece no tooltip e no painel (com o toque, pela seleção).
 * Só apresentação: quem decide regra é o núcleo (core/progression/arvore.ts). Cada ação devolve o
 * motivo do erro (pt-BR) ou undefined; a tela sempre redesenha a partir do view model atual.
 */
export interface ArvoreCallbacks {
  onBuy(id: string): string | undefined;
  onAssign(mastery: MasteryId, kind: HeroKind): string | undefined;
  onRemove(mastery: MasteryId): string | undefined;
  onReset(): string | undefined;
  onUi(): void;
}

const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!);
const inicial = (nome: string) => esc(nome.trim().charAt(0).toUpperCase());
const ARRASTE_MIN = 4;
const PASSO_ZOOM = 1.25;
/** Deslocamento do tooltip em relação ao cursor (px). */
const TIP_FOLGA = 16;

/** Polígono regular com `n` lados (rot 0 = vértice no alto), em px. */
function poligono(n: number, r: number, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180 - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Estrela de `pontas` pontas (R = externo, r = interno). */
function estrela(R: number, r: number, pontas = 5): string {
  const pts: string[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i * Math.PI) / pontas - Math.PI / 2;
    pts.push(`${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Forma de cada tipo de nó (o tamanho vem de TAMANHO_NO; a forma diz o tipo de relance, o ícone diz o bônus). */
function forma(tipo: NoTipo, classe: string): string {
  const d = TAMANHO_NO[tipo] / 2;
  switch (tipo) {
    case 'raiz':
      return `<circle class="${classe}" r="${d}"/>`;
    case 'comum':
      return `<circle class="${classe}" r="${d}"/>`;
    case 'notavel':
      // rosácea de 8 pontas com moldura interna: silhueta própria, maior que o comum
      return `<polygon class="${classe}" points="${estrela(d, d * 0.8, 8)}"/><circle class="gt-orn" r="${(d * 0.66).toFixed(1)}"/>`;
    case 'caminho':
      return `<polygon class="${classe}" points="${poligono(4, d)}"/><line class="gt-simb" x1="-5" y1="0" x2="5" y2="0"/>`;
    case 'mastery':
      // hexágono de moldura dupla: é a forma mais rara da roda
      return `<polygon class="${classe}" points="${poligono(6, d)}"/><polygon class="gt-orn" points="${poligono(6, d * 0.78)}"/>`;
  }
}

/** Tamanho do ícone dentro do nó (px): o caminho alternativo não tem ícone. */
function tamanhoIcone(tipo: NoTipo): number {
  if (tipo === 'notavel') return ARVORE_VISUAL.icone.notavel;
  if (tipo === 'mastery') return ARVORE_VISUAL.icone.mastery;
  return ARVORE_VISUAL.icone.comum;
}

const CATEGORIA_DESC: Record<Categoria, string> = {
  progressao: 'EXP, Zen por tipo de nó, pontos de habilidade, recrutas e descontos.',
  campanha: 'Eventos, reparo e preço da cidade, e recursos dos nós do mapa.',
  bastiao: 'Construção, reparo, muralha e Zen por noite.',
  combate: 'Vida, dano, velocidade de ataque, crítico, esquiva e atributos.',
  masteries: 'Pontos que desbloqueiam as Masteries táticas (uma por personagem).',
  ligacao: 'Notáveis e caminhos alternativos que ligam as regiões.',
};

/** Nome curto do estado (tooltip). */
const ESTADO_CURTO: Record<NoVM['estado'], string> = { aberto: 'Aberto', disponivel: 'Pode abrir', 'sem-zen': 'Falta Zen', bloqueado: 'Bloqueado' };

/** Tipos de nó da legenda: a forma de cada um e uma frase curta (sem descrever nó por nó). */
const LEGENDA_TIPOS: { tipo: NoTipo; nome: string; dica: string }[] = [
  { tipo: 'comum', nome: 'Comum', dica: 'bônus simples' },
  { tipo: 'notavel', nome: 'Notável', dica: 'efeito maior, com moldura' },
  { tipo: 'caminho', nome: 'Caminho', dica: 'liga as regiões' },
  { tipo: 'mastery', nome: 'Mastery', dica: 'abre uma especialização' },
];

/** Arestas do caminho aceso: da rede aberta até o primeiro nó fechado, e entre os nós seguintes. */
function arestasDoCaminho(vm: ArvoreVM, ids: string[]): [string, string][] {
  const out: [string, string][] = [];
  if (!ids.length) return out;
  const porId = new Map(vm.nos.map((n) => [n.id, n]));
  const aberto = (vm.adjacencia[ids[0]] ?? []).find((v) => porId.get(v)?.estado === 'aberto');
  if (aberto) out.push([aberto, ids[0]]);
  for (let i = 1; i < ids.length; i++) out.push([ids[i - 1], ids[i]]);
  return out;
}

export class ArvoreGlobal {
  readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly canvas: HTMLElement;
  private readonly head: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly side: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly legenda: HTMLElement;
  private vm!: ArvoreVM;
  /** Nó selecionado (toque ou clique): fixa o painel de detalhes e o caminho aceso. */
  private sel?: string;
  /** Nó sob o cursor do mouse (o toque não tem passagem: só seleciona). */
  private hover?: string;
  /** Último ponto do ponteiro (px da tela), para reposicionar o tooltip ao redesenhar. */
  private ptr = { x: 0, y: 0 };
  private pick?: HeroKind;
  private confirmandoReset = false;
  private msg = '';
  private msgOk = true;
  /** Elementos da roda por id (para acender e apagar sem redesenhar tudo). */
  private elNo = new Map<string, SVGGElement>();
  private elAresta: { a: string; b: string; el: SVGLineElement }[] = [];
  // zoom e pan (em px da tela, com a roda centrada): o valor atual se aproxima do alvo; o arraste mexe direto
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private tZoom = 1;
  private tPanX = 0;
  private tPanY = 0;
  private frame = 0;
  private drag?: { x0: number; y0: number; px: number; py: number };
  private arrastou = false;
  /** Filtro de categoria (undefined = todas). Nós fora do filtro ficam esmaecidos. */
  private filtro?: Categoria;

  constructor(
    private readonly cb: ArvoreCallbacks,
    private readonly vmOf: () => ArvoreVM,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'gt-veil';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="gt-win au-frame" role="dialog" aria-modal="true" aria-label="Árvore de Aurenthal">
        <header class="gt-head"></header>
        <div class="gt-bar" hidden></div>
        <div class="gt-body">
          <aside class="gt-legenda" aria-label="Legenda"></aside>
          <section class="gt-canvas" aria-label="Roda da progressão">
            <svg class="gt-svg" aria-hidden="false">
              <defs class="gt-defs"></defs>
              <g class="gt-world"></g>
            </svg>
            <div class="gt-tip" hidden></div>
            <nav class="gt-filtros" aria-label="Filtrar por categoria"></nav>
            <div class="gt-zoom">
              <button class="au-btn" data-c="zin" title="Aproximar">+</button>
              <button class="au-btn" data-c="zout" title="Afastar">−</button>
              <button class="au-btn" data-c="fit" title="Centralizar">Centro</button>
            </div>
          </section>
          <aside class="gt-side"></aside>
        </div>
      </div>`;
    document.body.appendChild(this.el);
    this.svg = this.el.querySelector<SVGSVGElement>('.gt-svg')!;
    this.world = this.el.querySelector<SVGGElement>('.gt-world')!;
    this.canvas = this.el.querySelector<HTMLElement>('.gt-canvas')!;
    this.head = this.el.querySelector<HTMLElement>('.gt-head')!;
    this.bar = this.el.querySelector<HTMLElement>('.gt-bar')!;
    this.side = this.el.querySelector<HTMLElement>('.gt-side')!;
    this.tip = this.el.querySelector<HTMLElement>('.gt-tip')!;
    this.legenda = this.el.querySelector<HTMLElement>('.gt-legenda')!;

    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.svg.addEventListener('click', (e) => this.onNodeClick(e));
    this.svg.addEventListener('pointerover', (e) => this.onOver(e));
    this.svg.addEventListener('pointermove', (e) => this.onSvgMove(e));
    this.svg.addEventListener('pointerleave', () => this.setHover(undefined));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => (this.drag = undefined));
    // a janela de desenho acompanha o tamanho do canvas (a faixa de mensagem e a janela mudam a altura)
    new ResizeObserver(() => this.medirCanvas()).observe(this.canvas);
    registerOverlay({ isOpen: () => this.visible, close: () => this.close() });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.sel = undefined;
    this.hover = undefined;
    this.pick = undefined;
    this.confirmandoReset = false;
    this.msg = '';
    this.tip.hidden = true;
    this.el.hidden = false;
    this.medirCanvas();
    this.fit(true);
    this.renderAll();
    this.side.scrollTop = 0;
    this.cb.onUi();
  }

  close(): void {
    if (this.el.hidden) return;
    this.el.hidden = true;
  }

  /** Redesenha com o estado atual (chamada depois de cada mudança de progresso). */
  refresh(): void {
    if (this.visible) this.renderAll();
  }

  // ---------------- cliques e teclado ----------------

  private onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t === this.el) return this.close();
    const b = t.closest<HTMLElement>('[data-c]');
    if (!b || b.hasAttribute('disabled')) return;
    this.cb.onUi();
    const c = b.dataset.c;
    switch (c) {
      case 'close':
        return this.close();
      case 'filtro': {
        const k = b.dataset.k;
        this.filtro = k === 'todas' ? undefined : (k as Categoria);
        break;
      }
      case 'zin':
        return this.zoomBy(PASSO_ZOOM);
      case 'zout':
        return this.zoomBy(1 / PASSO_ZOOM);
      case 'fit':
        return this.fit();
      case 'reset-ask':
        this.confirmandoReset = true;
        break;
      case 'reset-no':
        this.confirmandoReset = false;
        break;
      case 'reset-yes': {
        const err = this.cb.onReset();
        this.confirmandoReset = false;
        this.pick = undefined;
        this.flash(err ?? 'Árvore reorganizada: os nós e as Masteries voltaram para a guarda.', !err);
        break;
      }
      case 'buy': {
        const id = b.dataset.id!;
        const err = this.cb.onBuy(id);
        this.flash(err ?? `${this.vm.nos.find((n) => n.id === id)?.nome ?? 'Nó'} aberto.`, !err);
        break;
      }
      case 'mast': {
        // o cartão da Mastery seleciona o ponto dela na roda (o painel mostra a atribuição)
        const m = this.vm.masteries.find((x) => x.id === b.dataset.id);
        this.escolherNo(this.sel === m?.noId ? undefined : m?.noId);
        break;
      }
      case 'roster': {
        const k = b.dataset.k as HeroKind;
        const m = this.selMastery();
        if (m?.candidatos.find((x) => x.kind === k)?.elegivel) this.pick = k;
        break;
      }
      case 'cancel':
        this.pick = undefined;
        break;
      case 'assign': {
        const m = b.dataset.m as MasteryId;
        const k = b.dataset.k as HeroKind;
        const err = this.cb.onAssign(m, k);
        const mv = this.vm.masteries.find((x) => x.id === m);
        this.flash(err ?? `${mv?.nome ?? 'Mastery'} agora está com ${this.vm.herois.find((h) => h.kind === k)?.nome ?? k}. Custo: ${mv?.custo ?? 0} Zen.`, !err);
        this.pick = undefined;
        break;
      }
      case 'remove': {
        const m = b.dataset.m as MasteryId;
        const mv = this.vm.masteries.find((x) => x.id === m);
        const err = this.cb.onRemove(m);
        this.flash(err ?? `${mv?.nome ?? 'Mastery'} voltou para a guarda (sem custo).`, !err);
        this.pick = undefined;
        break;
      }
      default:
        return;
    }
    this.renderAll();
  }

  /** Filtro de categoria (seletor no canto da roda). */
  private onChange(e: Event): void {
    const t = e.target as HTMLSelectElement;
    if (!t.classList.contains('gt-filtro')) return;
    this.filtro = t.value === 'todas' ? undefined : (t.value as Categoria);
    this.atualizarDestaque();
  }

  private onKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).dataset.c === 'mast') {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  }

  /** Seleciona um nó (ou nenhum): troca o painel de detalhes e o caminho aceso, e fecha a escolha de herói. */
  private escolherNo(id: string | undefined): void {
    this.sel = id;
    this.pick = undefined;
  }

  /** Clique (ou toque) no nó: só conta se não foi arraste. A seleção mantém o caminho aceso até trocar. */
  private onNodeClick(e: MouseEvent): void {
    if (this.arrastou) {
      this.arrastou = false;
      return;
    }
    const g = (e.target as Element).closest<SVGGElement>('.gt-no');
    if (!g) return;
    this.cb.onUi();
    this.escolherNo(g.dataset.id);
    this.renderAll();
  }

  /** Cursor sobre um nó: acende o caminho até ele e mostra o tooltip. Toque não tem passagem: a seleção faz isso. */
  private onOver(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    this.ptr = { x: e.clientX, y: e.clientY };
    const g = (e.target as Element).closest<SVGGElement>('.gt-no');
    this.setHover(g?.dataset.id);
    if (g?.dataset.id) this.mostrarTip(g.dataset.id, e.clientX, e.clientY);
  }

  /** Movimento do cursor sobre a roda: o tooltip segue o cursor (sem refazer o desenho). */
  private onSvgMove(e: PointerEvent): void {
    if (e.pointerType !== 'mouse') return;
    this.ptr = { x: e.clientX, y: e.clientY };
    if (this.hover && !this.drag) this.posicionarTip(e.clientX, e.clientY);
  }

  private setHover(id: string | undefined): void {
    if (this.hover === id) return;
    this.hover = id;
    if (!id) this.tip.hidden = true;
    this.atualizarDestaque();
  }

  // ---------------- tooltip ----------------

  /** Tooltip compacto do nó: nome, tipo, estado e o que falta para abrir (sem ocupar espaço fixo). */
  private mostrarTip(id: string, clientX: number, clientY: number): void {
    const v = this.vm;
    const n = v.nos.find((x) => x.id === id);
    if (!n) return;
    const cam = caminhoAte(v, id);
    let linha = '';
    if (!n.raiz && n.estado !== 'aberto') {
      const zen = cam.ids.length ? cam.zen : n.custo;
      const via = cam.umPasso ? 'abre com 1 passo' : cam.ids.length ? `caminho de ${cam.nos} nós` : 'sem caminho ainda';
      linha = `<em>${via} · ${zen} Zen${zen > v.banco ? ` · faltam ${zen - v.banco}` : ''}</em>`;
    }
    this.tip.innerHTML = `<b>${esc(n.nome)}</b><span>${esc(n.tipoNome)} · ${esc(ESTADO_CURTO[n.estado])}</span>${linha}`;
    this.tip.hidden = false;
    this.posicionarTip(clientX, clientY);
  }

  /** Põe o tooltip ao lado do cursor, invertendo para dentro da área da roda quando não cabe. */
  private posicionarTip(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    const w = this.tip.offsetWidth;
    const h = this.tip.offsetHeight;
    let x = clientX - r.left + TIP_FOLGA;
    let y = clientY - r.top + TIP_FOLGA;
    if (x + w > r.width - 8) x = clientX - r.left - w - TIP_FOLGA;
    if (y + h > r.height - 8) y = clientY - r.top - h - TIP_FOLGA;
    this.tip.style.transform = `translate(${Math.max(8, x).toFixed(0)}px, ${Math.max(8, y).toFixed(0)}px)`;
  }

  // ---------------- zoom e pan ----------------

  /** Mede o canvas e ajusta a janela de desenho: 1 unidade = 1 px na tela, roda centrada. Não mexe no zoom do usuário. */
  private medirCanvas(): void {
    if (this.el.hidden) return;
    const w = Math.max(200, this.canvas.clientWidth);
    const h = Math.max(200, this.canvas.clientHeight);
    this.svg.setAttribute('viewBox', `${-w / 2} ${-h / 2} ${w} ${h}`);
    this.svg.dataset.w = String(w);
    this.svg.dataset.h = String(h);
    this.apply();
  }

  /** Zoom que mostra a roda inteira no canvas (no máximo o zoom 1: os nós mantêm o tamanho de referência). */
  private zoomPadrao(): number {
    const w = Number(this.svg.dataset.w ?? 800);
    const h = Number(this.svg.dataset.h ?? 700);
    const cabe = Math.min(w, h) / (2 * ARVORE_VISUAL.aroRaio + 16);
    return Math.max(ARVORE_VISUAL.zoom.minimo, Math.min(ARVORE_VISUAL.zoom.padrao, cabe));
  }

  /** Ponteiro em px da tela, com a roda centrada na origem. */
  private pontoSvg(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.arrastou = false;
    this.drag = { x0: e.clientX, y0: e.clientY, px: this.tPanX, py: this.tPanY };
  }

  private onMove(e: PointerEvent): void {
    if (!this.drag || this.el.hidden) return;
    const dx = e.clientX - this.drag.x0;
    const dy = e.clientY - this.drag.y0;
    if (!this.arrastou && Math.hypot(dx, dy) < ARRASTE_MIN) return;
    this.arrastou = true;
    this.tip.hidden = true;
    this.tPanX = this.panX = this.drag.px + dx;
    this.tPanY = this.panY = this.drag.py + dy;
    this.apply();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.zoomAt(this.pontoSvg(e.clientX, e.clientY), e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  private zoomBy(f: number): void {
    this.zoomAt({ x: 0, y: 0 }, f);
  }

  /** Zoom em torno de um ponto da tela (o que está sob o ponteiro fica no lugar). */
  private zoomAt(p: { x: number; y: number }, f: number): void {
    const { minimo, maximo } = ARVORE_VISUAL.zoom;
    const novo = Math.min(maximo, Math.max(minimo, this.tZoom * f));
    const mx = (p.x - this.tPanX) / this.tZoom;
    const my = (p.y - this.tPanY) / this.tZoom;
    this.tPanX = p.x - mx * novo;
    this.tPanY = p.y - my * novo;
    this.tZoom = novo;
    this.animar();
  }

  /** Volta à vista inicial (zoom padrão, roda centrada). `imediato`: sem animação (ao abrir a tela). */
  private fit(imediato = false): void {
    this.tZoom = this.zoomPadrao();
    this.tPanX = 0;
    this.tPanY = 0;
    if (imediato) {
      this.zoom = this.tZoom;
      this.panX = 0;
      this.panY = 0;
      this.apply();
    } else this.animar();
  }

  private flash(texto: string, ok: boolean): void {
    this.msg = texto;
    this.msgOk = ok;
  }

  private animar(): void {
    if (this.frame) return;
    const passo = () => {
      this.zoom += (this.tZoom - this.zoom) * 0.3;
      this.panX += (this.tPanX - this.panX) * 0.3;
      this.panY += (this.tPanY - this.panY) * 0.3;
      const pronto = Math.abs(this.tZoom - this.zoom) < 1e-3 && Math.abs(this.tPanX - this.panX) < 0.2 && Math.abs(this.tPanY - this.panY) < 0.2;
      if (pronto) {
        this.zoom = this.tZoom;
        this.panX = this.tPanX;
        this.panY = this.tPanY;
      }
      this.apply();
      this.frame = pronto ? 0 : requestAnimationFrame(passo);
    };
    this.frame = requestAnimationFrame(passo);
  }

  private apply(): void {
    this.world.setAttribute('transform', `translate(${this.panX.toFixed(2)} ${this.panY.toFixed(2)}) scale(${this.zoom.toFixed(4)})`);
  }

  // ---------------- desenho ----------------

  private renderAll(): void {
    this.vm = this.vmOf();
    if (this.sel && !this.vm.nos.some((n) => n.id === this.sel)) this.sel = undefined;
    this.renderHead();
    this.renderBar();
    this.renderCanvas();
    this.renderSide();
    this.apply();
    if (this.hover && !this.tip.hidden) this.mostrarTip(this.hover, this.ptr.x, this.ptr.y);
  }

  private renderHead(): void {
    const v = this.vm;
    const r = v.reorganizar;
    const travado = v.emCombate || !!r.erro;
    this.head.innerHTML = `
      <i class="au-ico" aria-hidden="true">✦</i>
      <span class="gt-title">Árvore de Aurenthal<small>Fortaleça sua equipe. Escolha seu caminho.</small></span>
      <span class="gt-zeni" title="Banco de Zen: o que os nós e as Masteries custam. Vem das jornadas e dos blocos do Bastião."><i class="zeni-ico"></i>Banco: <b>${v.banco.toLocaleString('pt-BR')}</b> Zen</span>
      <button class="au-btn danger gt-reset-btn" data-c="reset-ask" ${this.confirmandoReset ? 'hidden' : ''} ${travado ? 'disabled' : ''} title="${esc(r.erro ?? 'Fecha todos os nós e guarda as Masteries. O Zen gasto não volta.')}">Reorganizar · ${r.custo} Zen</button>
      <button class="au-x" data-c="close" title="Fechar (Esc)" aria-label="Fechar">×</button>`;
  }

  private renderBar(): void {
    if (this.confirmandoReset) {
      this.bar.hidden = false;
      this.bar.className = 'gt-bar ask';
      this.bar.innerHTML = `<p>Reorganizar custa <b>${this.vm.reorganizar.custo} Zen</b> do banco. Todos os nós abertos e as Masteries voltam para a guarda. O Zen não volta.</p>
        <div class="gt-acts"><button class="au-btn" data-c="reset-no">Cancelar</button><button class="au-btn danger" data-c="reset-yes">Confirmar · ${this.vm.reorganizar.custo} Zen</button></div>`;
      return;
    }
    if (this.msg) {
      this.bar.hidden = false;
      this.bar.className = `gt-bar ${this.msgOk ? 'ok' : 'bad'}`;
      this.bar.textContent = this.msg;
      return;
    }
    this.bar.hidden = true;
    this.bar.textContent = '';
  }

  /** Desenha a roda inteira (uma vez por abertura e por mudança de progresso). */
  private renderCanvas(): void {
    const v = this.vm;
    const { aneis, emblemas, aroRaio, mioloRaio, nucleoArte } = v.roda;
    const defs = this.el.querySelector<SVGDefsElement>('.gt-defs')!;
    defs.innerHTML = emblemas
      .map((e) => `<radialGradient id="gt-setor-${e.id}"><stop offset="0" stop-color="${e.cor}" stop-opacity="0.12"/><stop offset="1" stop-color="${e.cor}" stop-opacity="0"/></radialGradient>`)
      .join('');
    const setores = emblemas
      .map((e) => `<circle class="gt-setor" cx="${(e.x * 1.1).toFixed(1)}" cy="${(e.y * 1.1).toFixed(1)}" r="230" fill="url(#gt-setor-${e.id})"/>`)
      .join('');
    const anelSvg = aneis.map((r) => `<circle class="gt-anel" r="${r.toFixed(1)}"/>`).join('');
    const emblemaSvg = emblemas
      .map((e) => `<image class="gt-emblema" href="${FAMILIA_VISUAL[e.id].emblema}" x="${(e.x - ARVORE_VISUAL.emblema.diametro / 2).toFixed(1)}" y="${(e.y - ARVORE_VISUAL.emblema.diametro / 2).toFixed(1)}" width="${ARVORE_VISUAL.emblema.diametro}" height="${ARVORE_VISUAL.emblema.diametro}" data-f="${e.id}"><title>${esc(e.nome)}</title></image>`)
      .join('');
    const porId = new Map(v.nos.map((n) => [n.id, n]));
    this.elAresta = [];
    const arestas = v.conexoes
      .map(([a, b]) => {
        const na = porId.get(a);
        const nb = porId.get(b);
        if (!na || !nb) return '';
        const id = `${a}|${b}`;
        return `<line class="gt-aresta" data-k="${esc(id)}" style="--c:${na.cor}" x1="${na.x.toFixed(1)}" y1="${na.y.toFixed(1)}" x2="${nb.x.toFixed(1)}" y2="${nb.y.toFixed(1)}"/>`;
      })
      .join('');
    const nos = v.nos.map((n) => this.noSvg(n)).join('');
    this.el.querySelector<HTMLElement>('.gt-filtros')!.innerHTML = `<select class="gt-filtro" aria-label="Filtrar por categoria" title="Esmaece os nós fora da categoria escolhida"><option value="todas"${this.filtro ? '' : ' selected'}>Todas as categorias · ${v.totalNos}</option>${v.categorias.map((c) => `<option value="${c.id}"${this.filtro === c.id ? ' selected' : ''} title="${esc(CATEGORIA_DESC[c.id])}">${esc(c.nome)} · ${c.total}</option>`).join('')}</select>`;
    this.legenda.innerHTML = this.legendaHtml(v);
    this.world.innerHTML = `
      <image class="gt-miolo" href="ui/arvore/fundo-roda.webp" x="${-mioloRaio}" y="${-mioloRaio}" width="${2 * mioloRaio}" height="${2 * mioloRaio}"/>
      <g class="gt-setores">${setores}</g>
      <g class="gt-aneis">${anelSvg}</g>
      <image class="gt-aro" href="ui/arvore/anel-roda.webp" x="${-aroRaio}" y="${-aroRaio}" width="${2 * aroRaio}" height="${2 * aroRaio}"/>
      <g class="gt-emblemas">${emblemaSvg}</g>
      <g class="gt-arestas">${arestas}</g>
      <g class="gt-nos">${nos}</g>
      <image class="gt-nucleo-arte" href="ui/arvore/nucleo.webp" x="${-nucleoArte / 2}" y="${-nucleoArte / 2}" width="${nucleoArte}" height="${nucleoArte}"/>`;
    // índices para acender e apagar sem redesenhar
    this.elNo = new Map();
    this.world.querySelectorAll<SVGGElement>('.gt-no').forEach((g) => this.elNo.set(g.dataset.id!, g));
    this.elAresta = [];
    this.world.querySelectorAll<SVGLineElement>('.gt-aresta').forEach((l) => {
      const [a, b] = l.dataset.k!.split('|');
      this.elAresta.push({ a, b, el: l });
    });
    this.atualizarDestaque();
  }

  /** Nó na roda: forma, ícone e nada escrito. O nome vai para o painel de detalhes e para o tooltip. */
  private noSvg(n: NoVM): string {
    const sel = this.sel === n.id;
    const classes = [n.estado, n.tipo, n.destaque ? 'destaque' : ''].filter(Boolean).join(' ');
    const pulso = n.estado === 'disponivel' ? `<circle class="gt-pulso" r="${(n.r + 4).toFixed(1)}"/>` : '';
    const selAnel = sel ? `<circle class="gt-sel" r="${(n.r + 7).toFixed(1)}"/>` : '';
    const s = tamanhoIcone(n.tipo);
    const icone = n.icone ? `<image class="gt-icone" href="${n.icone}" x="${(-s / 2).toFixed(1)}" y="${(-s / 2).toFixed(1)}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>` : '';
    return `<g class="gt-no ${classes}" data-id="${n.id}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})" style="--c:${n.cor}" role="button" aria-label="${esc(n.nome)}" tabindex="-1">
      <g class="gt-corpo">${pulso}${selAnel}<g class="gt-caminho-anel"><circle r="${(n.r + 5).toFixed(1)}"/></g>${forma(n.tipo, 'gt-shape')}${icone}</g></g>`;
  }

  /** Acende o caminho até o nó sob o cursor (ou o selecionado) e aplica o filtro de categoria. */
  private atualizarDestaque(): void {
    const v = this.vm;
    if (!v) return;
    const alvo = this.hover ?? this.sel;
    const cam = alvo ? caminhoAte(v, alvo) : undefined;
    const noCaminho = new Set<string>(cam?.ids ?? []);
    if (cam && !cam.aberto && cam.ids.length) noCaminho.add(cam.alvo);
    const arestasCam = new Set<string>();
    if (cam && cam.ids.length) for (const [a, b] of arestasDoCaminho(v, cam.ids)) arestasCam.add(`${a}|${b}`).add(`${b}|${a}`);
    const porId = new Map(v.nos.map((n) => [n.id, n]));
    const esmaecidoDe = (id: string) => this.filtro !== undefined && porId.get(id)?.categoria !== this.filtro;
    for (const [id, g] of this.elNo) {
      g.classList.toggle('caminho', noCaminho.has(id));
      g.classList.toggle('dim', esmaecidoDe(id));
      g.classList.toggle('foco', id === this.hover || id === this.sel);
      g.classList.toggle('sel', id === this.sel);
    }
    for (const { a, b, el } of this.elAresta) {
      const na = porId.get(a), nb = porId.get(b);
      const abertos = (na?.estado === 'aberto' ? 1 : 0) + (nb?.estado === 'aberto' ? 1 : 0);
      el.setAttribute('class', `gt-aresta ${abertos === 2 ? 'aberta' : abertos === 1 ? 'meio' : 'fechada'}${arestasCam.has(`${a}|${b}`) ? ' caminho' : ''}${esmaecidoDe(a) || esmaecidoDe(b) ? ' dim' : ''}`);
    }
  }

  /** Legenda (coluna da esquerda): tipos de nó, regiões temáticas e estados. Frases curtas; não descreve cada nó. */
  private legendaHtml(v: ArvoreVM): string {
    const tipos = LEGENDA_TIPOS.map((t) => `<li><svg viewBox="-24 -24 48 48" aria-hidden="true">${forma(t.tipo, 'gt-leg-shape')}</svg><span>${t.nome}<small>${t.dica}</small></span></li>`).join('');
    const regioes = v.familias.map((f) => `<li><i class="gt-sw" style="--c:${f.cor}"></i><span>${esc(f.nome)}</span></li>`).join('');
    const estados = [
      ['aberto', 'Desbloqueado'],
      ['disponivel', 'Pode abrir'],
      ['sem-zen', 'Falta Zen'],
      ['bloqueado', 'Bloqueado'],
      ['caminho', 'Caminho aceso'],
      ['sel', 'Selecionado'],
    ].map(([k, nome]) => `<li><i class="gt-st ${k}"></i>${nome}</li>`).join('');
    return `<h4 class="au-h">Tipos de nó</h4><ul class="gt-leg-lista">${tipos}</ul>
      <h4 class="au-h">Regiões temáticas</h4><ul class="gt-leg-lista">${regioes}</ul>
      <h4 class="au-h">Estados</h4><ul class="gt-leg-estados">${estados}</ul>
      <p class="gt-leg-nota">Passe o cursor (ou toque) num nó para ver o nome e o que ele dá.</p>`;
  }

  private selNo(): NoVM | undefined {
    return this.vm.nos.find((n) => n.id === this.sel);
  }

  /** A Mastery cujo ponto está selecionado na roda (cada ponto de Mastery abre uma). */
  private selMastery(): MasteryVM | undefined {
    const n = this.selNo();
    return n ? this.vm.masteries.find((m) => m.noId === n.id) : undefined;
  }

  private renderSide(): void {
    const n = this.selNo();
    const detalhe = n
      ? this.detalheNo(n)
      : `<h4 class="au-h">Detalhes</h4><p class="gt-hint">Passe o cursor num nó para ver o caminho aceso. Toque (ou clique) num nó para ver o que ele dá, o que falta e o custo.</p>`;
    this.side.innerHTML = `
      <section class="au-frame tall gt-detail">${detalhe}</section>
      <section class="au-sec gt-mast">
        <h4 class="au-h">Masteries táticas</h4>
        <p class="gt-sub">Cada Mastery vai para um personagem e fica com ele, mesmo fora da party. Atribuir ou trocar custa ${ARVORE_CONFIG.atribuirZen} Zen.</p>
        ${this.vm.masteries.map((m) => this.cardMastery(m)).join('')}
      </section>`;
  }

  /** Painel de detalhes do nó: nome, efeito, requisitos, custo, estado e a ação. Ponto de Mastery traz a atribuição. */
  private detalheNo(n: NoVM): string {
    const v = this.vm;
    const m = this.selMastery();
    const cam = caminhoAte(v, n.id);
    const acao = n.raiz ? '' : this.botaoAbrir(n);
    const pend = n.pendencias.length ? `<ul class="gt-pend" title="Bônus que aparecem na árvore mas ainda não atuam no jogo">${n.pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    const icone = n.icone ? `<img src="${n.icone}" alt="">` : `<svg viewBox="-24 -24 48 48" aria-hidden="true">${forma(n.tipo, 'gt-leg-shape')}</svg>`;
    const custo = n.raiz ? 'Grátis' : n.estado === 'aberto' ? `Pago · ${n.custo} Zen` : `${n.custo} Zen${n.custo > v.banco ? ` · faltam ${n.custo - v.banco}` : ''}`;
    return `
      <header class="gt-det-cab">
        <span class="gt-det-ico" style="--c:${n.cor}">${icone}</span>
        <div><h4>${esc(n.nome)}</h4><small>${esc(n.tipoNome)} · ${esc(n.familiaNome ?? n.regiaoNome)}</small></div>
      </header>
      <p class="gt-state st-${n.estado}">${esc(n.estadoTexto)}</p>
      <p class="gt-desc">${esc(n.descricao)}</p>
      <div class="gt-bloco"><h5>Efeito</h5>
        <ul class="gt-bonus">${n.bonus.length ? n.bonus.map((b) => `<li>${esc(b)}</li>`).join('') : '<li class="none">Sem bônus direto: abre uma Mastery</li>'}</ul>
        <p class="gt-para">Vale para: <b>${esc(n.para)}</b></p>
      </div>
      <div class="gt-bloco"><h5>Requisitos</h5><ul class="gt-req-lista">${this.requisitos(n, cam, m)}</ul></div>
      <div class="gt-bloco"><h5>Custo</h5><p class="gt-custo"><span class="au-price">${custo}</span><span>Banco: <b>${v.banco.toLocaleString('pt-BR')}</b> Zen</span></p></div>
      ${pend}
      <div class="gt-acts">${acao}</div>
      ${m ? this.blocoMastery(m) : ''}`;
  }

  /** Requisitos do nó: o caminho que falta abrir (ou o que já está pronto) e, na Mastery, o nível do herói. */
  private requisitos(n: NoVM, cam: ReturnType<typeof caminhoAte>, m: MasteryVM | undefined): string {
    const itens: string[] = [];
    if (n.raiz) itens.push('Ponto de partida: sempre aberto.');
    else if (cam.aberto) itens.push('Já aberto.');
    else if (cam.umPasso) itens.push('Ligado a um nó aberto: abre com 1 passo.');
    else if (cam.ids.length) itens.push(`Caminho de ${cam.nos} nós a partir da rede aberta (${cam.zen} Zen no total).`);
    else itens.push('Sem caminho até a rede aberta: abra antes um nó ligado a este.');
    if (m) itens.push(`Mastery ${m.nome}: nível mínimo do herói ${m.nivelMin}.`);
    return itens.map((i) => `<li>${esc(i)}</li>`).join('');
  }

  /** Botão de ação do nó: abre quando há Zen e a luta acabou; senão, diz por que não. */
  private botaoAbrir(n: NoVM): string {
    const v = this.vm;
    const podeAbrir = n.estado === 'disponivel' && !v.emCombate;
    const rotulo = n.estado === 'aberto' ? 'Aberto' : n.estado === 'disponivel' ? `Abrir · ${n.custo} Zen` : n.estado === 'sem-zen' ? `Faltam ${n.custo - v.banco} Zen` : 'Bloqueado';
    const dica = v.emCombate ? 'Fora da luta.' : n.estadoTexto;
    return `<button class="au-btn${podeAbrir ? ' gold' : ''}" data-c="buy" data-id="${n.id}" ${podeAbrir ? '' : 'disabled'} title="${esc(dica)}">${rotulo}</button>`;
  }

  /** Atribuição da Mastery dentro do painel do ponto dela: quem recebe, o custo e a confirmação. */
  private blocoMastery(m: MasteryVM): string {
    return `<div class="gt-bloco gt-mast-bloco" style="--c:${m.cor}">
        <h5>Mastery · ${esc(m.familia)}</h5>
        <p class="gt-mast-nome">${esc(m.nome)}</p>
        <i>${esc(m.identidade)}</i>
        <p class="gt-efeito">${esc(m.efeito)}</p>
        <p class="gt-note">Nível mínimo ${m.nivelMin} · ${m.portador ? `Com <b>${esc(m.portadorNome ?? '')}</b>` : 'Guardada, sem dono'}</p>
        ${this.areaAtribuir(m)}
      </div>`;
  }

  private rosterHtml(m: MasteryVM): string {
    return `<div class="gt-roster">${this.vm.herois.map((h) => this.heroiSvg(h, m)).join('')}</div>`;
  }

  private heroiSvg(h: HeroiVM, m: MasteryVM): string {
    const cand = m.candidatos.find((c) => c.kind === h.kind);
    const alvo = !!cand?.elegivel;
    const cls = ['gt-hero', alvo ? 'alvo' : '', this.pick === h.kind ? 'on' : '', alvo ? '' : 'no', h.mastery ? 'com' : ''].join(' ');
    const img = h.retrato ? `<img src="${h.retrato}" alt="">` : `<span class="gt-ini">${inicial(h.nome)}</span>`;
    const motivo = cand?.erro ? ` · ${cand.erro}` : '';
    return `<button class="${cls}" data-c="roster" data-k="${h.kind}" title="${esc(h.nome)} · Nv. ${h.nivel}${h.mastery ? ` · ${esc(h.mastery)}` : ''}${esc(motivo)}"${alvo ? '' : ' tabindex="-1"'}>
      <span class="gt-port">${img}</span><b>${esc(h.nome)}</b><small>Nv. ${h.nivel}</small>${h.mastery ? `<em>${esc(h.mastery)}</em>` : ''}</button>`;
  }

  private cardMastery(m: MasteryVM): string {
    const on = this.sel === m.noId;
    return `<div class="gt-mcard${on ? ' on' : ''}${m.portador ? ' com' : ''}" role="button" tabindex="0" data-c="mast" data-id="${m.id}" style="--c:${m.cor}">
      <div class="gt-mhead"><b>${esc(m.nome)}</b><small>${esc(m.familia)}</small></div>
      <i>${esc(m.identidade)}</i>
      <p>${esc(m.efeito)}</p>
      <div class="gt-req">
        <span class="${m.noAberto ? 'ok' : 'no'}">${m.noAberto ? 'Ponto aberto' : `Abra: ${esc(m.noNome)}`}</span>
        <span>Nível ${m.nivelMin}</span>
        <span class="gt-holder">${m.portador ? `Com ${esc(m.portadorNome ?? '')}` : 'Guardada'}</span>
      </div></div>`;
  }

  /** Quem recebe a Mastery: os retratos (só os elegíveis respondem) e, com um herói escolhido, o custo antes de confirmar. */
  private areaAtribuir(m: MasteryVM): string {
    const escolhido: CandidatoVM | undefined = this.pick ? m.candidatos.find((c) => c.kind === this.pick) : undefined;
    const erro = escolhido?.erro;
    const tirar = m.portador
      ? `<button class="au-btn" data-c="remove" data-m="${m.id}" title="Tira a Mastery e a guarda. Não custa Zen.">Tirar de ${esc(m.portadorNome ?? '')} (grátis)</button>`
      : '';
    const previa = escolhido
      ? `<div class="gt-prev"><span class="au-price">${m.custo} Zen</span><span>Banco: <b>${this.vm.banco.toLocaleString('pt-BR')}</b> Zen</span></div>
         <p class="gt-note ${erro ? 'bad' : 'ok'}">${erro ? esc(erro) : `Pronto para ${esc(escolhido.nome)}. Nada é gasto até você confirmar.`}</p>
         <div class="gt-acts"><button class="au-btn" data-c="cancel">Cancelar</button><button class="au-btn gold" data-c="assign" data-m="${m.id}" data-k="${escolhido.kind}" ${erro ? 'disabled' : ''}>Confirmar · ${m.custo} Zen</button></div>`
      : `<p class="gt-hint">Escolha quem recebe ${esc(m.nome)}. ${this.vm.emCombate ? 'Fora da luta.' : ''}</p>`;
    return `<div class="gt-assign"><h5>Quem recebe?</h5>${this.rosterHtml(m)}${previa}${tirar ? `<div class="gt-acts">${tirar}</div>` : ''}</div>`;
  }
}
