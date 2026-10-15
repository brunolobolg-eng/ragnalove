import type { HeroKind } from '../core/progression/skills';
import { ARVORE_CONFIG, type Categoria, type MasteryId, type NoTipo } from '../config/arvoreGlobal';
import { ARVORE_VISUAL, FAMILIA_VISUAL, TAMANHO_NO } from '../config/arvoreVisual';
import { registerOverlay } from './overlays';
import { caminhoAte, type ArvoreVM, type CandidatoVM, type HeroiVM, type MasteryVM, type NoVM } from './arvoreVM';

/**
 * Árvore Global de Aurenthal: a roda (anéis, setores por família, núcleo ROGUARD), com zoom e pan suaves,
 * caminho aceso até o nó sob o cursor ou selecionado, painel de detalhes do nó e painel de Masteries
 * (uma por personagem, com custo em Zen antes de confirmar) e reorganização. Tudo é pago pelo banco de Zen.
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

/** Polígono regular com `n` lados (rot 0 = vértice no alto), em px. */
function poligono(n: number, r: number, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((rot + (i * 360) / n) * Math.PI) / 180 - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Estrela de 5 pontas (R = externo, r = interno). */
function estrela(R: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** Forma de cada tipo de nó (o tamanho vem de TAMANHO_NO; o símbolo interno diz o tipo de relance). */
function forma(tipo: NoTipo, classe: string): string {
  const d = TAMANHO_NO[tipo] / 2;
  switch (tipo) {
    case 'raiz':
      return `<circle class="${classe}" r="${d}"/>`;
    case 'comum':
      return `<circle class="${classe}" r="${d}"/><circle class="gt-simb" r="3.5"/>`;
    case 'notavel':
      return `<polygon class="${classe}" points="${estrela(d, d * 0.52)}"/><circle class="gt-simb" r="4"/>`;
    case 'caminho':
      return `<polygon class="${classe}" points="${poligono(4, d)}"/><line class="gt-simb" x1="-5" y1="0" x2="5" y2="0"/>`;
    case 'mastery':
      return `<polygon class="${classe}" points="${poligono(6, d)}"/><polygon class="gt-simb" points="${poligono(4, 6, 45)}"/>`;
  }
}

const CATEGORIA_DESC: Record<Categoria, string> = {
  progressao: 'EXP, Zen por tipo de nó, pontos de habilidade, recrutas e descontos.',
  campanha: 'Eventos, reparo e preço da cidade, e recursos dos nós do mapa.',
  bastiao: 'Construção, reparo, muralha e Zen por noite.',
  combate: 'Vida, dano, velocidade de ataque, crítico, esquiva e atributos.',
  masteries: 'Pontos que desbloqueiam as Masteries táticas (uma por personagem).',
  ligacao: 'Notáveis e caminhos alternativos que ligam as regiões.',
};

const LEGENDA_TIPOS: { tipo: NoTipo; nome: string }[] = [
  { tipo: 'raiz', nome: 'Núcleo' },
  { tipo: 'comum', nome: 'Comum' },
  { tipo: 'notavel', nome: 'Notável' },
  { tipo: 'caminho', nome: 'Caminho alternativo' },
  { tipo: 'mastery', nome: 'Ponto de Mastery' },
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
  private readonly caminhoCard: HTMLElement;
  private vm!: ArvoreVM;
  private sel?: string;
  private hover?: string;
  private selM?: MasteryId;
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
          <section class="gt-canvas" aria-label="Roda da progressão">
            <svg class="gt-svg" aria-hidden="false">
              <defs class="gt-defs"></defs>
              <g class="gt-world"></g>
            </svg>
            <div class="gt-caminho" hidden></div>
            <nav class="gt-filtros" aria-label="Filtrar por categoria"></nav>
            <div class="gt-zoom">
              <button class="au-btn" data-c="zin" title="Aproximar">+</button>
              <button class="au-btn" data-c="zout" title="Afastar">−</button>
              <button class="au-btn" data-c="fit" title="Centralizar">Centro</button>
            </div>
            <details class="gt-legend"></details>
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
    this.caminhoCard = this.el.querySelector<HTMLElement>('.gt-caminho')!;

    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.svg.addEventListener('click', (e) => this.onNodeClick(e));
    this.svg.addEventListener('pointerover', (e) => this.onOver(e));
    this.svg.addEventListener('pointerleave', () => this.setHover(undefined));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => (this.drag = undefined));
    window.addEventListener('resize', () => this.medirCanvas());
    registerOverlay({ isOpen: () => this.visible, close: () => this.close() });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.sel = undefined;
    this.hover = undefined;
    this.selM = undefined;
    this.pick = undefined;
    this.confirmandoReset = false;
    this.msg = '';
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
        this.selM = undefined;
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
        const id = b.dataset.id as MasteryId;
        this.selM = this.selM === id ? undefined : id;
        this.pick = undefined;
        break;
      }
      case 'pick':
        this.pick = b.dataset.k as HeroKind;
        break;
      case 'roster': {
        const k = b.dataset.k as HeroKind;
        const m = this.selMasteryVM();
        if (m?.candidatos.find((x) => x.kind === k)?.elegivel) this.pick = k;
        break;
      }
      case 'cancel':
        this.selM = undefined;
        this.pick = undefined;
        break;
      case 'assign': {
        const m = b.dataset.m as MasteryId;
        const k = b.dataset.k as HeroKind;
        const err = this.cb.onAssign(m, k);
        const mv = this.vm.masteries.find((x) => x.id === m);
        this.flash(err ?? `${mv?.nome ?? 'Mastery'} agora está com ${this.vm.herois.find((h) => h.kind === k)?.nome ?? k}. Custo: ${mv?.custo ?? 0} Zen.`, !err);
        this.selM = undefined;
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

  /** Clique no nó (só conta se não foi arraste). Seleção mantém o caminho aceso até trocar. */
  private onNodeClick(e: MouseEvent): void {
    if (this.arrastou) {
      this.arrastou = false;
      return;
    }
    const g = (e.target as Element).closest<SVGGElement>('.gt-no');
    if (!g) return;
    this.cb.onUi();
    this.sel = g.dataset.id;
    this.renderAll();
  }

  /** Cursor sobre um nó: acende o caminho até ele (enquanto o cursor estiver ali). */
  private onOver(e: PointerEvent): void {
    const g = (e.target as Element).closest<SVGGElement>('.gt-no');
    this.setHover(g?.dataset.id);
  }

  private setHover(id: string | undefined): void {
    if (this.hover === id) return;
    this.hover = id;
    this.atualizarDestaque();
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
    // nomes: os notáveis e as Masteries a partir do zoom de destaque; os demais a partir do zoom de todos os nomes
    const { rotulosDestaque, rotulosTodos } = ARVORE_VISUAL.zoom;
    this.world.classList.toggle('gt-lbl-dest', this.zoom >= rotulosDestaque);
    this.world.classList.toggle('gt-lbl-todos', this.zoom >= rotulosTodos);
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
  }

  private renderHead(): void {
    const v = this.vm;
    const r = v.reorganizar;
    const travado = v.emCombate || !!r.erro;
    this.head.innerHTML = `
      <i class="au-ico" aria-hidden="true">✦</i>
      <span class="gt-title">Árvore de Aurenthal</span>
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
    this.el.querySelector<HTMLElement>('.gt-legend')!.innerHTML = this.legendaHtml(v);
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
    this.world.querySelectorAll<SVGLineElement>('.gt-aresta').forEach((l) => {
      const [a, b] = l.dataset.k!.split('|');
      this.elAresta.push({ a, b, el: l });
    });
    this.atualizarDestaque();
  }

  private noSvg(n: NoVM): string {
    const sel = this.sel === n.id;
    const classes = [n.estado, n.tipo, n.destaque ? 'destaque' : '', n.rotulo?.livre ? 'livre' : ''].filter(Boolean).join(' ');
    const linhas = n.rotulo?.linhas ?? [];
    const rx = n.rotulo ? n.rotulo.x - n.x : 0;
    const ry = n.rotulo ? n.rotulo.y - n.y : 0;
    const rw = n.rotulo?.w ?? 0;
    const rotulo = n.rotulo
      ? `<text class="gt-lbl" x="${(rx + rw / 2).toFixed(1)}" y="${(ry + 12).toFixed(1)}" text-anchor="middle">${linhas.map((l, i) => `<tspan x="${(rx + rw / 2).toFixed(1)}" dy="${i === 0 ? 0 : ARVORE_VISUAL.rotulo.linha}">${esc(l)}</tspan>`).join('')}</text>`
      : '';
    const selAnel = sel ? `<circle class="gt-sel" r="${n.r + 6}"/>` : '';
    const pulso = n.estado === 'disponivel' ? `<circle class="gt-pulso" r="${n.r + 4}"/>` : '';
    return `<g class="gt-no ${classes} ${n.tipo}" data-id="${n.id}" transform="translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})" style="--c:${n.cor}" tabindex="-1">
      <title>${esc(n.nome)} · ${esc(n.estadoTexto)}</title>${pulso}${selAnel}<g class="gt-caminho-anel"><circle r="${n.r + 5}"/></g>${forma(n.tipo, 'gt-shape')}${rotulo}</g>`;
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
    this.renderCaminhoCard(cam);
  }

  private renderCaminhoCard(cam: ReturnType<typeof caminhoAte> | undefined): void {
    const alvo = cam ? this.vm.nos.find((n) => n.id === cam.alvo) : undefined;
    if (!cam || !alvo) {
      this.caminhoCard.hidden = true;
      return;
    }
    const banco = this.vm.banco;
    const nomes = cam.ids.map((id) => this.vm.nos.find((n) => n.id === id)?.nome ?? id);
    const lista = nomes.slice(0, 5).map((n, i) => `<li><i>${i + 1}</i>${esc(n)}</li>`).join('') + (nomes.length > 5 ? `<li class="mais">e mais ${nomes.length - 5}…</li>` : '');
    let cabeca: string;
    if (cam.aberto) cabeca = `<b>${esc(alvo.nome)}</b> já está aberto.`;
    else if (cam.umPasso) cabeca = `<b>${esc(alvo.nome)}</b> abre com 1 passo · <span class="au-price">${cam.zen} Zen</span>${cam.zen > banco ? ` <em>faltam ${cam.zen - banco}</em>` : ''}`;
    else cabeca = `Caminho até <b>${esc(alvo.nome)}</b>: ${cam.nos} nós · <span class="au-price">${cam.zen} Zen</span>${cam.zen > banco ? ` <em>faltam ${cam.zen - banco}</em>` : ''}`;
    this.caminhoCard.hidden = false;
    this.caminhoCard.innerHTML = `<p>${cabeca}</p>${cam.aberto || !cam.ids.length ? '' : `<ol>${lista}</ol>`}`;
  }

  /** Legenda recolhível: tipos de nó, estados e a cor de cada setor (família). */
  private legendaHtml(v: ArvoreVM): string {
    const tipos = LEGENDA_TIPOS.map((t) => `<li><svg viewBox="-24 -24 48 48" aria-hidden="true">${forma(t.tipo, 'gt-leg-shape')}</svg>${t.nome}</li>`).join('');
    const estados = `<li class="gt-leg-sep">Estados</li><li><i class="gt-st aberto"></i>Aberto</li><li><i class="gt-st disponivel"></i>Pode abrir</li><li><i class="gt-st sem-zen"></i>Falta Zen</li><li><i class="gt-st bloqueado"></i>Bloqueado</li><li><i class="gt-st caminho"></i>Caminho aceso</li>`;
    const setores = v.familias.map((f) => `<li><i class="gt-sw" style="--c:${f.cor}"></i>${esc(f.nome)}</li>`).join('');
    return `<summary>Legenda</summary><ul>${tipos}${estados}<li class="gt-leg-sep">Setores</li>${setores}</ul>`;
  }

  private selNo(): NoVM | undefined {
    return this.vm.nos.find((n) => n.id === this.sel);
  }

  private selMasteryVM(): MasteryVM | undefined {
    return this.vm.masteries.find((m) => m.id === this.selM);
  }

  private renderSide(): void {
    const v = this.vm;
    const n = this.selNo();
    let detalhe: string;
    if (!n) {
      detalhe = `<h4 class="au-h">Detalhes</h4><p class="gt-hint">Passe o cursor num nó para ver o caminho aceso; clique para fixar e ver o que ele dá, o que falta e o custo.</p>`;
    } else {
      const podeAbrir = n.estado === 'disponivel' && !v.emCombate;
      const acao = n.raiz
        ? ''
        : `<button class="au-btn gold" data-c="buy" data-id="${n.id}" ${podeAbrir ? '' : 'disabled'} title="${v.emCombate ? 'Fora da luta.' : n.estado === 'disponivel' ? '' : esc(n.estadoTexto)}">Abrir · ${n.custo} Zen</button>`;
      const cam = caminhoAte(v, n.id);
      const caminhoTxt = n.raiz || cam.aberto ? '' : `<p class="gt-caminho-txt">${cam.umPasso ? 'Abre com 1 passo' : `Caminho: ${cam.nos} nós`} · <b>${cam.zen} Zen</b> no total.</p>`;
      detalhe = `<h4 class="au-h">${esc(n.nome)}</h4>
        <div class="gt-tags"><span class="au-price">${esc(n.tipoNome)}</span><span class="gt-reg" style="--c:${n.cor}">${esc(n.familiaNome ?? n.regiaoNome)}</span></div>
        <p class="gt-desc">${esc(n.descricao)}</p>
        <ul class="gt-bonus">${n.bonus.length ? n.bonus.map((b) => `<li>${esc(b)}</li>`).join('') : '<li class="none">Sem bônus direto: abre uma Mastery</li>'}</ul>
        ${n.mastery ? `<p class="gt-note">Desbloqueia a Mastery <b>${esc(n.mastery)}</b>.</p>` : ''}
        <p class="gt-para">Vale para: <b>${esc(n.para)}</b></p>
        <p class="gt-state st-${n.estado}">${esc(n.estadoTexto)}</p>
        ${caminhoTxt}
        ${n.pendencias.length ? `<ul class="gt-pend" title="Bônus que aparecem na árvore mas ainda não atuam no jogo">${n.pendencias.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        <div class="gt-acts">${acao}</div>`;
    }
    this.side.innerHTML = `
      <section class="au-sec gt-detail">${detalhe}</section>
      <section class="au-sec gt-mast">
        <h4 class="au-h">Masteries táticas</h4>
        <p class="gt-sub">Cada Mastery vai para um personagem e fica com ele, mesmo fora da party. Atribuir ou trocar custa ${ARVORE_CONFIG.atribuirZen} Zen.</p>
        <div class="gt-roster">${v.herois.map((h) => this.heroiSvg(h)).join('')}</div>
        ${v.masteries.map((m) => this.cardMastery(m)).join('')}
        ${this.areaAtribuir()}
      </section>`;
  }

  private heroiSvg(h: HeroiVM): string {
    const m = this.selMasteryVM();
    const cand = m?.candidatos.find((c) => c.kind === h.kind);
    const alvo = !!m && !!cand?.elegivel;
    const cls = ['gt-hero', alvo ? 'alvo' : '', this.pick === h.kind ? 'on' : '', m && !alvo ? 'no' : '', h.mastery ? 'com' : ''].join(' ');
    const img = h.retrato ? `<img src="${h.retrato}" alt="">` : `<span class="gt-ini">${inicial(h.nome)}</span>`;
    const motivo = m && cand?.erro ? ` · ${cand.erro}` : '';
    return `<button class="${cls}" data-c="roster" data-k="${h.kind}" title="${esc(h.nome)} · Nv. ${h.nivel}${h.mastery ? ` · ${esc(h.mastery)}` : ''}${esc(motivo)}"${alvo ? '' : ' tabindex="-1"'}>
      <span class="gt-port">${img}</span><b>${esc(h.nome)}</b><small>Nv. ${h.nivel}</small>${h.mastery ? `<em>${esc(h.mastery)}</em>` : ''}</button>`;
  }

  private cardMastery(m: MasteryVM): string {
    const on = this.selM === m.id;
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

  private areaAtribuir(): string {
    const m = this.selMasteryVM();
    if (!m) return `<p class="gt-hint">Escolha uma Mastery acima para ver quem pode recebê-la e o custo antes de confirmar.</p>`;
    const escolhido: CandidatoVM | undefined = this.pick ? m.candidatos.find((c) => c.kind === this.pick) : undefined;
    const erro = escolhido?.erro;
    const tirar = m.portador
      ? `<button class="au-btn" data-c="remove" data-m="${m.id}" title="Tira a Mastery e a guarda. Não custa Zen.">Tirar de ${esc(m.portadorNome ?? '')} (grátis)</button>`
      : '';
    const previa = escolhido
      ? `<div class="gt-prev"><span class="au-price">${m.custo} Zen</span><span>Banco: <b>${this.vm.banco.toLocaleString('pt-BR')}</b> Zen</span></div>
         <p class="gt-note ${erro ? 'bad' : 'ok'}">${erro ? esc(erro) : `Pronto para ${esc(escolhido.nome)}. Nada é gasto até você confirmar.`}</p>
         <div class="gt-acts"><button class="au-btn" data-c="cancel">Cancelar</button><button class="au-btn gold" data-c="assign" data-m="${m.id}" data-k="${escolhido.kind}" ${erro ? 'disabled' : ''}>Confirmar · ${m.custo} Zen</button></div>`
      : `<p class="gt-hint">Escolha quem recebe <b>${esc(m.nome)}</b> (retratos acima). ${this.vm.emCombate ? 'Fora da luta.' : ''}</p>
         <div class="gt-acts"><button class="au-btn" data-c="cancel">Fechar</button></div>`;
    return `<div class="gt-assign"><h5>Quem recebe ${esc(m.nome)}?</h5>${previa}${tirar ? `<div class="gt-acts">${tirar}</div>` : ''}</div>`;
  }
}

