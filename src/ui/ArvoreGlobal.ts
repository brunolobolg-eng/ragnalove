import type { HeroKind } from '../core/progression/skills';
import { ARVORE_CONFIG, ARVORE_VISUAL, type Categoria, type MasteryId, type NoTipo } from '../config/arvoreGlobal';
import { registerOverlay } from './overlays';
import type { ArvoreVM, CandidatoVM, HeroiVM, MasteryVM, NoVM } from './arvoreVM';

/**
 * Árvore Global de Aurenthal: rede de nós com zoom e pan suaves, painel de detalhes do nó,
 * painel de Masteries (uma por personagem, com custo em Zen antes de confirmar) e reorganização. Tudo é pago pelo banco de Zen.
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

/** Área da rede (unidades da viewBox). A grade do núcleo é multiplicada por ESPACO. A parte de baixo é maior: a legenda cobre o rodapé. */
const VB = { x: -980, y: -980, w: 1960, h: 1960 };
const ESPACO = ARVORE_VISUAL.espaco;
/** Zoom a partir do qual os nomes dos nós aparecem (abaixo disso, só a forma, a cor e o nome ao passar o cursor). */
const ZOOM_ROTULOS = 1.9;
const NODE_R = 30;
const RAIZ_R = 40;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 3;
const ARRASTE_MIN = 4;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inicial = (nome: string) => esc(nome.trim().charAt(0).toUpperCase());

/**
 * Nome do nó em até duas linhas (quebra na palavra), para os rótulos não se sobreporem aos vizinhos.
 * Nomes curtos ficam numa linha só.
 */
function linhasNome(nome: string, max = 13): string[] {
  const palavras = nome.split(' ');
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    if (atual && (atual + ' ' + p).length > max) {
      linhas.push(atual);
      atual = p;
    } else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Polígono regular com `n` lados (rot 0 = vértice no alto). */
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

/** Forma de cada tipo de nó: a forma é o que diz o tipo (a cor diz a região; o estado diz se está aberto). */
function forma(tipo: NoTipo, r: number): string {
  switch (tipo) {
    case 'raiz':
      return `<circle class="gt-shape" r="${r}"/><circle class="gt-core" r="${(r * 0.45).toFixed(1)}"/>`;
    case 'comum':
      return `<circle class="gt-shape" r="${(r * 0.8).toFixed(1)}"/>`;
    case 'notavel':
      return `<polygon class="gt-shape" points="${estrela(r * 1.05, r * 0.5)}"/>`;
    case 'caminho':
      return `<polygon class="gt-shape" points="${poligono(4, r * 0.9)}"/>`;
    case 'mastery':
      return `<polygon class="gt-shape" points="${poligono(6, r * 0.95)}"/>`;
  }
}

const CATEGORIA_DESC: Record<Categoria, string> = {
  progressao: 'EXP, Zen por tipo de nó, pontos de habilidade, recrutas e descontos.',
  campanha: 'Eventos, reparo e recompensa da cidade, sorte de loja e recursos do mapa.',
  bastiao: 'Construção, reparo, muralha, portão, Zen por noite e blocos.',
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

export class ArvoreGlobal {
  readonly el: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly world: SVGGElement;
  private readonly head: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly side: HTMLElement;
  private vm!: ArvoreVM;
  private sel?: string;
  private selM?: MasteryId;
  private pick?: HeroKind;
  private confirmandoReset = false;
  private msg = '';
  private msgOk = true;
  // zoom e pan: o valor atual se aproxima do alvo (suave); o arraste mexe direto
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
          <section class="gt-canvas" aria-label="Rede de progressão">
            <svg class="gt-svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet">
              <defs class="gt-defs"></defs>
              <g class="gt-world"></g>
            </svg>
            <nav class="gt-filtros" aria-label="Filtrar por categoria"></nav>
            <div class="gt-zoom">
              <button class="au-btn" data-c="zin" title="Aproximar">+</button>
              <button class="au-btn" data-c="zout" title="Afastar">−</button>
              <button class="au-btn" data-c="fit" title="Centralizar">Centro</button>
            </div>
            <ul class="gt-legend">${LEGENDA_TIPOS.map((t) => `<li><svg viewBox="-14 -14 28 28" aria-hidden="true">${forma(t.tipo, 10).replace(/class="gt-(shape|core)"/g, 'class="gt-leg-$1"')}</svg>${t.nome}</li>`).join('')}
              <li class="gt-leg-sep"><i class="gt-st on"></i>Aberto</li><li><i class="gt-st dispo"></i>Pode abrir</li><li><i class="gt-st sem"></i>Falta Zen</li><li><i class="gt-st bloq"></i>Bloqueado</li></ul>
          </section>
          <aside class="gt-side"></aside>
        </div>
      </div>`;
    document.body.appendChild(this.el);
    this.svg = this.el.querySelector<SVGSVGElement>('.gt-svg')!;
    this.world = this.el.querySelector<SVGGElement>('.gt-world')!;
    this.head = this.el.querySelector<HTMLElement>('.gt-head')!;
    this.bar = this.el.querySelector<HTMLElement>('.gt-bar')!;
    this.side = this.el.querySelector<HTMLElement>('.gt-side')!;

    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('keydown', (e) => this.onKey(e));
    this.svg.addEventListener('pointerdown', (e) => this.onDown(e));
    this.svg.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.svg.addEventListener('click', (e) => this.onNodeClick(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', () => (this.drag = undefined));
    registerOverlay({ isOpen: () => this.visible, close: () => this.close() });
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.sel = undefined;
    this.selM = undefined;
    this.pick = undefined;
    this.confirmandoReset = false;
    this.msg = '';
    this.el.hidden = false;
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
        return this.zoomBy(1.25);
      case 'zout':
        return this.zoomBy(0.8);
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

  private onKey(e: KeyboardEvent): void {
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).dataset.c === 'mast') {
      e.preventDefault();
      (e.target as HTMLElement).click();
    }
  }

  /** Clique no nó (só conta se não foi arraste). */
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

  // ---------------- zoom e pan ----------------

  /** Converte a posição do ponteiro para as unidades da viewBox (considera o letterbox). */
  private vbPoint(clientX: number, clientY: number): { x: number; y: number } {
    const s = this.escala();
    const r = this.svg.getBoundingClientRect();
    const ox = (r.width - VB.w * s) / 2;
    const oy = (r.height - VB.h * s) / 2;
    return { x: VB.x + (clientX - r.left - ox) / s, y: VB.y + (clientY - r.top - oy) / s };
  }

  private escala(): number {
    const r = this.svg.getBoundingClientRect();
    return Math.min(r.width / VB.w, r.height / VB.h) || 1;
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
    const s = this.escala();
    this.tPanX = this.panX = this.drag.px + dx / s;
    this.tPanY = this.panY = this.drag.py + dy / s;
    this.apply();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.vbPoint(e.clientX, e.clientY);
    this.zoomAt(p, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  private zoomBy(f: number): void {
    const c = { x: 0, y: 0 };
    this.zoomAt(c, f);
  }

  /** Zoom em torno de um ponto da viewBox (o que está sob o ponteiro fica no lugar). */
  private zoomAt(p: { x: number; y: number }, f: number): void {
    const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.tZoom * f));
    // mundo sob o ponto: (p − pan) / zoom; depois do zoom, pan' = p − mundo × zoom'
    const mx = (p.x - this.tPanX) / this.tZoom;
    const my = (p.y - this.tPanY) / this.tZoom;
    this.tPanX = p.x - mx * novo;
    this.tPanY = p.y - my * novo;
    this.tZoom = novo;
    this.animar();
  }

  /** Volta à vista inicial (zoom 1, centro). `imediato`: sem animação (ao abrir a tela). */
  private fit(imediato = false): void {
    this.tZoom = 1;
    this.tPanX = 0;
    this.tPanY = 0;
    if (imediato) {
      this.zoom = 1;
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
    // nomes só com zoom suficiente: a rede inteira continua legível pela forma e pela cor
    this.world.classList.toggle('gt-lbl-on', this.zoom >= ZOOM_ROTULOS);
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

  private renderCanvas(): void {
    const v = this.vm;
    const porId = new Map(v.nos.map((n) => [n.id, n]));
    const defs = this.el.querySelector<SVGDefsElement>('.gt-defs')!;
    defs.innerHTML = v.regioes
      .map((r) => `<radialGradient id="gt-r-${r.id}"><stop offset="0" stop-color="${r.cor}" stop-opacity="0.32"/><stop offset="1" stop-color="${r.cor}" stop-opacity="0"/></radialGradient>`)
      .join('');
    const halos = v.regioes
      .map((r) => `<circle class="gt-halo" cx="${r.cx * ESPACO}" cy="${r.cy * ESPACO}" r="${r.id === 'nucleo' ? 200 : 230}" fill="url(#gt-r-${r.id})"/>`)
      .join('');
    const arestas = v.conexoes
      .map(([a, b]) => {
        const na = porId.get(a);
        const nb = porId.get(b);
        if (!na || !nb) return '';
        const abertos = (na.estado === 'aberto' ? 1 : 0) + (nb.estado === 'aberto' ? 1 : 0);
        const cls = abertos === 2 ? 'on' : abertos === 1 ? 'half' : '';
        return `<line class="gt-edge ${cls}" x1="${na.x * ESPACO}" y1="${na.y * ESPACO}" x2="${nb.x * ESPACO}" y2="${nb.y * ESPACO}"/>`;
      })
      .join('');
    const nos = v.nos.map((n) => this.noSvg(n)).join('');
    this.el.querySelector<HTMLElement>('.gt-filtros')!.innerHTML = [`<button class="au-btn${this.filtro ? '' : ' gold'}" data-c="filtro" data-k="todas">Todas · ${v.totalNos}</button>`, ...v.categorias.map((c) => `<button class="au-btn${this.filtro === c.id ? ' gold' : ''}" data-c="filtro" data-k="${c.id}" title="${esc(CATEGORIA_DESC[c.id])}">${esc(c.nome)} · ${c.total}</button>`)].join('');
    this.world.innerHTML = `${halos}<g class="gt-edges">${arestas}</g><g class="gt-nodes">${nos}</g>`;
  }

  private noSvg(n: NoVM): string {
    const r = n.raiz ? RAIZ_R : NODE_R;
    const sel = this.sel === n.id;
    const esmaecido = this.filtro !== undefined && n.categoria !== this.filtro;
    const custo = n.custo > 0 && n.estado !== 'aberto';
    const badge = custo ? `<g class="gt-cost" transform="translate(${(r * 0.78).toFixed(1)} ${(-r * 0.78).toFixed(1)})"><circle r="12"/><text y="4">${n.custo}</text></g>` : '';
    const anel = sel ? `<circle class="gt-ring" r="${r + 10}"/>` : '';
    const linhas = linhasNome(n.nome);
    const rotulo = linhas.map((l, i) => `<tspan x="0" dy="${i === 0 ? 0 : 16}">${esc(l)}</tspan>`).join('');
    return `<g class="gt-no ${n.estado} ${n.tipo}${sel ? ' sel' : ''}${esmaecido ? ' dim' : ''}" data-id="${n.id}" transform="translate(${n.x * ESPACO} ${n.y * ESPACO})" style="--c:${n.cor}">
      <title>${esc(n.nome)} · ${esc(n.estadoTexto)}</title>${anel}${forma(n.tipo, r)}${badge}
      <text class="gt-lbl" y="${r + 22}">${rotulo}</text></g>`;
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
      detalhe = `<h4 class="au-h">Detalhes</h4><p class="gt-hint">Clique num nó para ver o que ele dá, o que falta para abrir e o custo.</p>`;
    } else {
      const podeAbrir = n.estado === 'disponivel' && !v.emCombate;
      const acao = n.raiz
        ? ''
        : `<button class="au-btn gold" data-c="buy" data-id="${n.id}" ${podeAbrir ? '' : 'disabled'} title="${v.emCombate ? 'Fora da luta.' : n.estado === 'disponivel' ? '' : esc(n.estadoTexto)}">Abrir · ${n.custo} Zen</button>`;
      detalhe = `<h4 class="au-h">${esc(n.nome)}</h4>
        <div class="gt-tags"><span class="au-price">${esc(n.tipoNome)}</span><span class="gt-reg" style="--c:${n.cor}">${esc(n.regiaoNome)}</span></div>
        <p class="gt-desc">${esc(n.descricao)}</p>
        <ul class="gt-bonus">${n.bonus.length ? n.bonus.map((b) => `<li>${esc(b)}</li>`).join('') : '<li class="none">Sem bônus direto: abre uma Mastery</li>'}</ul>
        ${n.mastery ? `<p class="gt-note">Desbloqueia a Mastery <b>${esc(n.mastery)}</b>.</p>` : ''}
        <p class="gt-para">Vale para: <b>${esc(n.para)}</b></p>
        <p class="gt-state st-${n.estado}">${esc(n.estadoTexto)}</p>
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
    return `<div class="gt-mcard${on ? ' on' : ''}${m.portador ? ' com' : ''}" role="button" tabindex="0" data-c="mast" data-id="${m.id}">
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
