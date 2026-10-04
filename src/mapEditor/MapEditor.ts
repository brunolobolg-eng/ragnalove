/**
 * EDITOR DE MAPAS (F6) — ferramenta interna de desenvolvimento.
 * Edita ZoneDef de verdade (grade ASCII + objetos + spawns + setup + onda):
 * o que sai daqui (Salvar JSON / Exportar TS) carrega direto no jogo
 * via parseZone/applyZone. Sem tilesets: a paleta são os 27 caracteres
 * da legenda de zones.ts; o visual final é o tema do jogo.
 */
import { GAME_CONFIG } from '../config/gameConfig';
import { ORIENTATIONS } from '../core/grid/types';
import { ZONES } from '../config/zones';
import { History } from './history';
import { CHAR_INFO, HERO_KINDS, OBJECT_TYPES, THEMES } from './legend';
import { deserialize, fromZoneDef, getChar, inBounds, newMap, resize, serialize, type MapDoc } from './mapDoc';
import { MAP_EDITOR_CSS } from './mapEditorStyle';
import { defaultView, MapCanvas, type LayerId } from './MapCanvas';
import { openJsonFile, exportTs, saveJson } from './storage';
import { applyLine, applyRect, floodFill, TOOLS, paintAt, type ToolId } from './tools';
import { validate } from './validate';

type El = HTMLElement;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const LAYERS: { id: LayerId; label: string; key: string }[] = [
  { id: 'ground', label: 'Chão', key: '1' },
  { id: 'props', label: 'Props', key: '2' },
  { id: 'objects', label: 'Objetos', key: '3' },
  { id: 'spawns', label: 'Spawns', key: '4' },
  { id: 'collision', label: 'Colisão', key: '5' },
];

const ENEMY_KINDS = Object.keys(GAME_CONFIG.enemies);

type Selection = { kind: 'object'; index: number } | { kind: 'spawn'; index: number } | { kind: 'member'; index: number } | { kind: 'barrier'; index: number } | null;
type PlaceMode = { kind: 'object'; objType: string } | { kind: 'spawn'; index: number } | { kind: 'member'; hero: string } | { kind: 'barrier' } | null;

export class MapEditor {
  readonly root = h('div', 'me-win');
  private doc: MapDoc = newMap('mapa_novo', 45, 39);
  private history = new History();
  private view = defaultView();
  private canvas: MapCanvas;
  private tool: ToolId = 'brush';
  private selChar = '#';
  private hover: { x: number; y: number } | null = null;
  private selection: Selection = null;
  private placeMode: PlaceMode = null;
  private strokeBase = '';
  private stroking = false;
  private lineStart: { x: number; y: number } | null = null;
  private panning = false;
  private spaceDown = false;
  private tab: 'zona' | 'objetos' | 'spawns' | 'onda' = 'zona';

  private statusMini!: HTMLElement;
  private bottom!: HTMLElement;
  private toolBtns = new Map<ToolId, HTMLButtonElement>();
  private layerChecks = new Map<LayerId, HTMLInputElement>();
  private panel!: HTMLElement;
  private isOpen = false;

  constructor() {
    const style = document.createElement('style');
    style.textContent = MAP_EDITOR_CSS;
    document.head.append(style);
    this.root.hidden = true;
    this.root.append(this.buildTop(), this.buildBody(), this.buildBottom());
    this.canvas = new MapCanvas(this.view, (x, y) => {
      this.hover = { x, y };
      this.draw();
      this.updateBottom();
    });
    this.root.querySelector('.me-center')!.append(this.canvas.canvas);
    this.wireCanvas();
    this.refreshAll();
    window.addEventListener('resize', () => {
      if (this.isOpen) {
        this.canvas.resizeToParent();
        this.draw();
      }
    });
  }

  toggle(open = !this.isOpen): void {
    if (open === this.isOpen) return;
    if (!open && this.history.isDirty(serialize(this.doc)) && !confirm('Fechar o editor com alterações não salvas?')) return;
    this.isOpen = open;
    this.root.hidden = !open;
    if (open) {
      this.canvas.resizeToParent();
      this.canvas.centerOn(this.doc);
      this.draw();
    }
  }

  // ---------------------------------------------------------- estrutura
  private buildTop(): El {
    const top = h('div', 'me-top');
    const title = h('span', 'me-title', 'EDITOR DE MAPAS');
    title.append(h('span', 'me-dev', 'DEV'));
    top.append(title);
    const btn = (text: string, tip: string, fn: () => void, cls = '') => {
      const b = h('button', `me-btn ${cls}`, text) as HTMLButtonElement;
      b.title = tip;
      b.onclick = () => void this.guard(fn);
      top.append(b);
      return b;
    };
    btn('Novo', 'Novo mapa (pede nome e tamanho)', () => this.doNew());
    btn('Abrir ▾', 'Abrir zona do jogo ou arquivo .json', () => this.doOpenMenu());
    btn('Salvar', 'Salvar .json (Ctrl+S)', () => this.doSave(false), 'primary');
    btn('Salvar como', 'Salvar .json com outro nome', () => this.doSave(true));
    btn('Exportar TS', 'Literal ZoneDef para zones.ts', () => this.doExport());
    top.append(h('span', 'me-sep'));
    const undo = btn('↶', 'Desfazer (Ctrl+Z)', () => this.doUndo());
    const redo = btn('↷', 'Refazer (Ctrl+Y)', () => this.doRedo());
    undo.id = 'me-undo';
    redo.id = 'me-redo';
    top.append(h('span', 'me-sep'));
    btn('Grade', 'Liga/desliga a grade', () => {
      this.view.grid = !this.view.grid;
      this.draw();
    });
    btn('−', 'Zoom −', () => this.zoomBy(1 / 1.2));
    btn('+', 'Zoom +', () => this.zoomBy(1.2));
    this.statusMini = h('span', 'me-status-mini', 'SALVO');
    top.append(this.statusMini);
    return top;
  }

  private buildBody(): El {
    const body = h('div', 'me-body');
    const left = h('div', 'me-left');
    left.append(h('h4', '', 'Ferramentas'));
    for (const t of TOOLS) {
      const b = h('button', 'me-btn', `${t.label}`) as HTMLButtonElement;
      b.title = `${t.label} (${t.key})`;
      b.onclick = () => this.setTool(t.id);
      this.toolBtns.set(t.id, b);
      left.append(b);
    }
    left.append(h('h4', '', 'Paleta (chão)'));
    const palG = h('div', 'me-pal');
    for (const [ch, info] of Object.entries(CHAR_INFO)) {
      if (info.cat !== 'ground' && info.cat !== 'gate' && info.cat !== 'void') continue;
      palG.append(this.swatch(ch, info.label, info.color));
    }
    left.append(palG);
    left.append(h('h4', '', 'Paleta (bloqueio)'));
    const palB = h('div', 'me-pal');
    for (const [ch, info] of Object.entries(CHAR_INFO)) {
      if (info.cat !== 'block') continue;
      palB.append(this.swatch(ch, info.label, info.color));
    }
    left.append(palB);
    const center = h('div', 'me-center');
    const right = h('div', 'me-right');
    const layers = h('div', '');
    layers.append(h('h4', '', 'Camadas'));
    for (const l of LAYERS) {
      const row = h('label', 'me-layer');
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = this.view.layers[l.id];
      c.onchange = () => {
        this.view.layers[l.id] = c.checked;
        this.draw();
      };
      this.layerChecks.set(l.id, c);
      row.append(c, h('span', '', `${l.label} `), h('span', 'me-kbd', l.key));
      layers.append(row);
    }
    right.append(layers);
    const tabs = h('div', 'me-tabs');
    for (const [id, label] of [['zona', 'Zona'], ['objetos', 'Objetos'], ['spawns', 'Spawns'], ['onda', 'Onda']] as const) {
      const b = h('button', 'me-tab', label) as HTMLButtonElement;
      b.dataset.tab = id;
      b.onclick = () => {
        this.tab = id;
        this.renderPanel();
      };
      tabs.append(b);
    }
    right.append(tabs);
    this.panel = h('div', 'me-panel');
    right.append(this.panel);
    body.append(left, center, right);
    return body;
  }

  private swatch(ch: string, label: string, color: string): El {
    const b = h('button', 'me-swatch') as HTMLButtonElement;
    b.title = `${label} ("${ch}")`;
    b.dataset.ch = ch;
    b.append(h('b', '', ch));
    const s = h('span', '', label);
    s.style.color = color;
    b.append(s);
    b.onclick = () => {
      this.selChar = ch;
      this.setTool('brush');
      this.draw();
      this.refreshSwatches();
    };
    return b;
  }

  private buildBottom(): El {
    this.bottom = h('div', 'me-bottom');
    return this.bottom;
  }

  // ---------------------------------------------------------- canvas
  private wireCanvas(): void {
    const cv = this.canvas.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      if (e.button === 1 || this.spaceDown) {
        this.panning = true;
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const { x, y } = this.canvas.screenToTile(e.clientX, e.clientY);
      if (this.placeMode) {
        this.commitPlace(x, y);
        return;
      }
      if (this.tool === 'select') {
        this.pickAt(x, y);
        return;
      }
      if (this.tool === 'eyedropper') {
        if (inBounds(this.doc, x, y)) {
          this.selChar = getChar(this.doc, x, y);
          this.setTool('brush');
          this.refreshSwatches();
          this.draw();
        }
        return;
      }
      if (this.tool === 'fill') {
        if (!inBounds(this.doc, x, y)) return;
        this.checkpoint();
        floodFill(this.doc, x, y, this.selChar);
        this.afterEdit();
        return;
      }
      this.stroking = true;
      this.strokeBase = serialize(this.doc);
      this.lineStart = { x, y };
      if (this.tool === 'brush' || this.tool === 'eraser') {
        this.checkpoint();
        paintAt(this.doc, x, y, this.tool === 'brush' ? this.selChar : '.');
        this.afterEdit(false);
      }
    });
    cv.addEventListener('mousemove', (e) => {
      this.canvas.trackHover(e);
      if (this.panning) {
        this.view.ox += e.movementX;
        this.view.oy += e.movementY;
        this.draw();
        return;
      }
      if (!this.stroking || !this.lineStart) return;
      const { x, y } = this.canvas.screenToTile(e.clientX, e.clientY);
      if (this.tool === 'brush' || this.tool === 'eraser') {
        paintAt(this.doc, x, y, this.tool === 'brush' ? this.selChar : '.');
        this.afterEdit(false);
      } else if (this.tool === 'line' || this.tool === 'rect') {
        this.doc = deserialize(this.strokeBase);
        if (this.tool === 'line') applyLine(this.doc, this.lineStart.x, this.lineStart.y, x, y, this.selChar);
        else applyRect(this.doc, this.lineStart.x, this.lineStart.y, x, y, this.selChar, e.shiftKey);
        this.afterEdit(false);
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (this.panning && e.button !== 1) return;
      this.panning = false;
      if (this.stroking) {
        this.stroking = false;
        if ((this.tool === 'line' || this.tool === 'rect') && this.lineStart) {
          const r = this.canvas.canvas.getBoundingClientRect();
          const { x, y } = this.canvas.screenToTile(e.clientX, e.clientY);
          void r;
          this.doc = deserialize(this.strokeBase);
          this.checkpoint();
          if (this.tool === 'line') applyLine(this.doc, this.lineStart.x, this.lineStart.y, x, y, this.selChar);
          else applyRect(this.doc, this.lineStart.x, this.lineStart.y, x, y, this.selChar, e.shiftKey);
        }
        this.afterEdit();
      }
      this.lineStart = null;
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
    }, { passive: false });
    this.root.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') {
        if (e.key !== 'Escape') return;
      }
      e.stopPropagation();
      if (e.key === ' ') {
        this.spaceDown = true;
        e.preventDefault();
      } else if (e.key === 'F6') {
        this.toggle();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        this.doUndo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        this.doRedo();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        this.doSave(false);
        e.preventDefault();
      } else if (!e.ctrlKey && !e.metaKey) {
        const t = TOOLS.find((x) => x.key === e.key.toUpperCase());
        if (t) this.setTool(t.id);
        else if (e.key >= '1' && e.key <= '5') {
          const l = LAYERS[Number(e.key) - 1];
          this.view.layers[l.id] = !this.view.layers[l.id];
          this.layerChecks.get(l.id)!.checked = this.view.layers[l.id];
          this.draw();
        }
      }
    });
    this.root.addEventListener('keyup', (e) => {
      e.stopPropagation();
      if (e.key === ' ') this.spaceDown = false;
    });
  }

  private zoomBy(k: number, cx?: number, cy?: number): void {
    const v = this.view;
    const nz = Math.max(0.25, Math.min(6, v.zoom * k));
    const f = nz / v.zoom;
    if (cx !== undefined && cy !== undefined) {
      const r = this.canvas.canvas.getBoundingClientRect();
      const px = cx - r.left;
      const py = cy - r.top;
      v.ox = px - (px - v.ox) * f;
      v.oy = py - (py - v.oy) * f;
    }
    v.zoom = nz;
    this.draw();
  }

  // ---------------------------------------------------------- edição
  private checkpoint(): void {
    this.history.checkpoint(serialize(this.doc));
  }

  private afterEdit(full = true): void {
    this.draw();
    if (full) {
      this.renderPanel();
      this.updateBottom();
      this.updateDirty();
    } else this.updateDirty();
  }

  private setTool(t: ToolId): void {
    this.tool = t;
    this.placeMode = null;
    for (const [id, b] of this.toolBtns) b.classList.toggle('on', id === t);
    this.updateBottom();
  }

  private pickAt(x: number, y: number): void {
    const oi = this.doc.objects.findIndex((o) => o.x === x && o.y === y);
    if (oi >= 0) {
      this.selection = { kind: 'object', index: oi };
      this.tab = 'objetos';
      this.renderPanel();
      this.updateBottom();
      return;
    }
    const si = this.doc.spawnPoints.findIndex((p) => p.x === x && p.y === y);
    if (si >= 0) {
      this.selection = { kind: 'spawn', index: si };
      this.tab = 'spawns';
      this.renderPanel();
      this.updateBottom();
      return;
    }
    const mi = this.doc.setup.members.findIndex((m) => m.x === x && m.y === y);
    if (mi >= 0) {
      this.selection = { kind: 'member', index: mi };
      this.tab = 'spawns';
      this.renderPanel();
      this.updateBottom();
      return;
    }
    this.selection = null;
    this.updateBottom();
  }

  private commitPlace(x: number, y: number): void {
    if (!inBounds(this.doc, x, y)) return;
    const pm = this.placeMode;
    if (!pm) return;
    this.checkpoint();
    if (pm.kind === 'object') this.doc.objects.push({ type: pm.objType as never, x, y });
    else if (pm.kind === 'spawn') this.doc.spawnPoints[pm.index] = { x, y };
    else if (pm.kind === 'member') this.doc.setup.members.push({ archetype: pm.hero as never, x, y });
    else if (pm.kind === 'barrier') this.doc.setup.barriers.push({ x, y, orientation: 'H' });
    this.placeMode = null;
    this.setTool('select');
    this.afterEdit();
  }

  // ---------------------------------------------------------- arquivo
  private async guard(fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      alert(`Editor de mapas: ${(e as Error).message}`);
    }
  }

  private doNew(): void {
    if (this.history.isDirty(serialize(this.doc)) && !confirm('Descartar o mapa atual e criar um novo?')) return;
    const name = prompt('Nome do mapa:', 'Mapa novo');
    if (!name) return;
    const w = Math.max(5, Math.min(120, Number(prompt('Largura (tiles):', '45')) || 45));
    const h = Math.max(5, Math.min(120, Number(prompt('Altura (tiles):', '39')) || 39));
    this.doc = newMap(name, w, h);
    this.history.clear();
    this.history.markSaved('');
    this.selection = null;
    this.canvas.centerOn(this.doc);
    this.refreshAll();
  }

  private doOpenMenu(): void {
    const names = Object.keys(ZONES);
    const pick = prompt(`Abrir zona do jogo:\n${names.join(', ')}\n\n(ou cancele e use "Abrir arquivo" no próximo passo)`, names[0]);
    if (pick && ZONES[pick]) {
      if (this.history.isDirty(serialize(this.doc)) && !confirm('Descartar o mapa atual?')) return;
      this.doc = fromZoneDef(ZONES[pick]);
      this.doc.fileName = undefined;
      this.history.clear();
      this.selection = null;
      this.canvas.centerOn(this.doc);
      this.refreshAll();
      return;
    }
    void this.guard(async () => {
      const text = await openJsonFile();
      const d = deserialize(text);
      if (this.history.isDirty(serialize(this.doc)) && !confirm('Descartar o mapa atual?')) return;
      this.doc = d;
      this.history.clear();
      this.selection = null;
      this.canvas.centerOn(this.doc);
      this.refreshAll();
    });
  }

  private doSave(as: boolean): void {
    if (as || !this.doc.fileName) {
      const name = prompt('Nome do arquivo:', this.doc.fileName ?? this.doc.id);
      if (!name) return;
      this.doc.fileName = name.replace(/\.json$/, '');
    }
    const v = validate(this.doc);
    if (v.errors.length && !confirm(`Há ${v.errors.length} erro(s):\n${v.errors.slice(0, 5).join('\n')}\n\nSalvar mesmo assim?`)) return;
    saveJson(this.doc);
    this.history.markSaved(serialize(this.doc));
    this.updateDirty();
    this.updateBottom();
  }

  private doExport(): void {
    const v = validate(this.doc);
    if (v.errors.length) {
      alert(`Corrija antes de exportar:\n${v.errors.join('\n')}`);
      return;
    }
    exportTs(this.doc);
  }

  private doUndo(): void {
    const s = this.history.undo(serialize(this.doc));
    if (s === null) return;
    this.doc = deserialize(s);
    this.refreshAll();
  }

  private doRedo(): void {
    const s = this.history.redo(serialize(this.doc));
    if (s === null) return;
    this.doc = deserialize(s);
    this.refreshAll();
  }

  // ---------------------------------------------------------- render
  private draw(): void {
    if (!this.isOpen) return;
    this.canvas.draw(this.doc, this.hover, this.selChar);
  }

  private refreshSwatches(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.me-swatch').forEach((b) => b.classList.toggle('on', b.dataset.ch === this.selChar));
  }

  private refreshAll(): void {
    this.refreshSwatches();
    for (const [id, b] of this.toolBtns) b.classList.toggle('on', id === this.tool);
    this.renderPanel();
    this.updateBottom();
    this.updateDirty();
    this.draw();
  }

  private updateDirty(): void {
    const dirty = this.history.isDirty(serialize(this.doc));
    this.statusMini.textContent = dirty ? '● ALTERAÇÕES NÃO SALVAS' : 'SALVO';
    this.statusMini.classList.toggle('dirty', dirty);
    (this.root.querySelector('#me-undo') as HTMLButtonElement).disabled = !this.history.canUndo();
    (this.root.querySelector('#me-redo') as HTMLButtonElement).disabled = !this.history.canRedo();
  }

  private updateBottom(): void {
    const v = validate(this.doc);
    const hoverTxt = this.hover && inBounds(this.doc, this.hover.x, this.hover.y)
      ? `X:${this.hover.x} Y:${this.hover.y} "${getChar(this.doc, this.hover.x, this.hover.y)}" ${CHAR_INFO[getChar(this.doc, this.hover.x, this.hover.y)]?.label ?? ''}`
      : this.hover
        ? `X:${this.hover.x} Y:${this.hover.y} (fora)`
        : '—';
    const sel = this.selection
      ? `sel: ${this.selection.kind}[${this.selection.index}]`
      : this.placeMode
        ? `clique para posicionar: ${this.placeMode.kind}`
        : `ferramenta: ${this.tool}`;
    const val = v.errors.length
      ? `<span class="err">❌ ${v.errors.length} erro(s)</span>`
      : v.warnings.length
        ? `<span class="warn">⚠ ${v.warnings.length} aviso(s)</span>`
        : `<span class="okv">✓ válido</span>`;
    this.bottom.innerHTML = '';
    this.bottom.append(h('span', '', `${this.doc.id} · ${this.doc.width}×${this.doc.height}`), h('span', '', hoverTxt), h('span', '', sel), h('span', '', ''));
    const vs = h('span', '', '');
    vs.innerHTML = val;
    this.bottom.append(vs);
  }

  private field(label: string, input: El): El {
    const row = h('div', 'me-row');
    row.append(h('label', '', label), input);
    return row;
  }

  private num(value: number, on: (v: number) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'number';
    i.value = String(value);
    i.onchange = () => {
      const v = Number(i.value);
      if (!Number.isFinite(v)) return;
      this.checkpoint();
      on(v);
      this.afterEdit();
    };
    return i;
  }

  private text(value: string, on: (v: string) => void): HTMLInputElement {
    const i = document.createElement('input');
    i.type = 'text';
    i.value = value;
    i.onchange = () => {
      this.checkpoint();
      on(i.value);
      this.afterEdit();
    };
    return i;
  }

  private select<T extends string>(value: T, options: readonly { id: T; label: string }[] | readonly T[], on: (v: T) => void): HTMLSelectElement {
    const s = document.createElement('select');
    const list = (options as readonly { id: T; label: string }[]).map((o) => (typeof o === 'string' ? { id: o as T, label: o as string } : o));
    for (const o of list) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      if (o.id === value) opt.selected = true;
      s.append(opt);
    }
    s.onchange = () => {
      this.checkpoint();
      on(s.value as T);
      this.afterEdit();
    };
    return s;
  }

  private renderPanel(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.me-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const p = this.panel;
    p.innerHTML = '';
    if (this.tab === 'zona') this.renderZona(p);
    else if (this.tab === 'objetos') this.renderObjetos(p);
    else if (this.tab === 'spawns') this.renderSpawns(p);
    else this.renderOnda(p);
  }

  private renderZona(p: El): void {
    const d = this.doc;
    p.append(this.field('ID', this.text(d.id, (v) => {
      d.id = v;
    })));
    p.append(this.field('Nome', this.text(d.name, (v) => {
      d.name = v;
    })));
    p.append(this.field('Tema', this.select(d.theme, THEMES as never, (v) => {
      d.theme = v as never;
    })));
    p.append(this.field('Largura', this.num(d.width, () => {})));
    p.append(this.field('Altura', this.num(d.height, () => {})));
    const apply = h('button', 'me-btn', 'Aplicar tamanho') as HTMLButtonElement;
    apply.onclick = () => {
      const ws = p.querySelectorAll('input[type=number]');
      const w = Number((ws[0] as HTMLInputElement).value);
      const hh = Number((ws[1] as HTMLInputElement).value);
      this.checkpoint();
      resize(d, w, hh);
      this.afterEdit();
    };
    p.append(apply);
    if (d.painted) {
      const pz = h('div', '');
      pz.style.color = '#9fb0c9';
      const fx = d.painted.fx;
      const fxTxt = fx ? ` (fx: ${[fx.mist && 'mist', fx.torches && 'torches', fx.glow && 'glow'].filter(Boolean).join(', ') || '—'})` : '';
      pz.textContent = `🖼 Pintado: ${d.painted.image}${fxTxt} (preservado na exportação)`;
      p.append(pz);
    }
    const v = validate(d);
    const box = h('div', '');
    box.append(h('h4', '', 'Validação'));
    if (!v.errors.length && !v.warnings.length) box.append(h('div', '', '✓ Mapa válido.'));
    for (const e of v.errors) {
      const r = h('div', '');
      r.style.color = '#ff6b60';
      r.textContent = `❌ ${e}`;
      box.append(r);
    }
    for (const wmsg of v.warnings) {
      const r = h('div', '');
      r.style.color = '#ffb347';
      r.textContent = `⚠ ${wmsg}`;
      box.append(r);
    }
    p.append(box);
  }

  private renderObjetos(p: El): void {
    const d = this.doc;
    const addRow = h('div', 'me-row');
    const typeSel = document.createElement('select');
    for (const o of OBJECT_TYPES) {
      const opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      typeSel.append(opt);
    }
    const addBtn = h('button', 'me-btn', '+ posicionar') as HTMLButtonElement;
    addBtn.onclick = () => {
      this.placeMode = { kind: 'object', objType: typeSel.value };
      this.setTool('select');
      this.updateBottom();
    };
    addRow.append(typeSel, addBtn);
    p.append(addRow);
    d.objects.forEach((o, i) => {
      const box = h('div', `me-obj${this.selection?.kind === 'object' && this.selection.index === i ? ' sel' : ''}`);
      const del = h('button', 'me-btn', '×') as HTMLButtonElement;
      del.title = 'Excluir';
      del.onclick = () => {
        this.checkpoint();
        d.objects.splice(i, 1);
        this.selection = null;
        this.afterEdit();
      };
      box.append(del);
      box.append(h('div', '', `${OBJECT_TYPES.find((t) => t.id === o.type)?.label ?? o.type} (${o.x},${o.y})`));
      const xy = h('div', 'me-row');
      const xi = this.num(o.x, (v) => {
        o.x = Math.round(v);
      });
      xi.style.maxWidth = '52px';
      const yi = this.num(o.y, (v) => {
        o.y = Math.round(v);
      });
      yi.style.maxWidth = '52px';
      xy.append(h('label', '', 'pos'), xi, yi);
      box.append(xy);
      box.onclick = (e) => {
        if ((e.target as HTMLElement).tagName !== 'BUTTON' && (e.target as HTMLElement).tagName !== 'INPUT') {
          this.selection = { kind: 'object', index: i };
          this.renderPanel();
        }
      };
      p.append(box);
    });
    if (!d.objects.length) p.append(h('div', '', 'Nenhum objeto. Use "+ posicionar" e clique no mapa.'));
  }

  private renderSpawns(p: El): void {
    const d = this.doc;
    d.spawnPoints.forEach((s, i) => {
      const box = h('div', 'me-obj');
      box.append(h('div', '', `Spawn inimigos ${i + 1} (${s.x},${s.y})`));
      const row = h('div', 'me-row');
      const xi = this.num(s.x, (v) => {
        s.x = Math.round(v);
      });
      xi.style.maxWidth = '52px';
      const yi = this.num(s.y, (v) => {
        s.y = Math.round(v);
      });
      yi.style.maxWidth = '52px';
      const put = h('button', 'me-btn', 'posicionar') as HTMLButtonElement;
      put.onclick = () => {
        this.placeMode = { kind: 'spawn', index: i };
        this.setTool('select');
        this.updateBottom();
      };
      row.append(xi, yi, put);
      box.append(row);
      p.append(box);
    });
    p.append(h('h4', '', 'Party (Player Spawn)'));
    d.setup.members.forEach((m, i) => {
      const box = h('div', 'me-obj');
      const del = h('button', 'me-btn', '×') as HTMLButtonElement;
      del.title = 'Remover';
      del.onclick = () => {
        this.checkpoint();
        d.setup.members.splice(i, 1);
        this.afterEdit();
      };
      box.append(del);
      const row = h('div', 'me-row');
      const kind = this.select(m.archetype, HERO_KINDS as never, (v) => {
        m.archetype = v as never;
      });
      kind.style.maxWidth = '92px';
      const xi = this.num(m.x, (v) => {
        m.x = Math.round(v);
      });
      xi.style.maxWidth = '46px';
      const yi = this.num(m.y, (v) => {
        m.y = Math.round(v);
      });
      yi.style.maxWidth = '46px';
      row.append(kind, xi, yi);
      box.append(row);
      p.append(box);
    });
    const addRow = h('div', 'me-row');
    const heroSel = document.createElement('select');
    for (const hh of HERO_KINDS) {
      const opt = document.createElement('option');
      opt.value = hh.id;
      opt.textContent = hh.label;
      heroSel.append(opt);
    }
    const addBtn = h('button', 'me-btn', '+ posicionar') as HTMLButtonElement;
    addBtn.onclick = () => {
      this.placeMode = { kind: 'member', hero: heroSel.value };
      this.setTool('select');
      this.updateBottom();
    };
    addRow.append(heroSel, addBtn);
    p.append(addRow);
    p.append(h('h4', '', 'Barreiras'));
    d.setup.barriers.forEach((b, i) => {
      const box = h('div', 'me-obj');
      const del = h('button', 'me-btn', '×') as HTMLButtonElement;
      del.onclick = () => {
        this.checkpoint();
        d.setup.barriers.splice(i, 1);
        this.afterEdit();
      };
      box.append(del);
      const row = h('div', 'me-row');
      const xi = this.num(b.x, (v) => {
        b.x = Math.round(v);
      });
      xi.style.maxWidth = '46px';
      const yi = this.num(b.y, (v) => {
        b.y = Math.round(v);
      });
      yi.style.maxWidth = '46px';
      const ori = this.select(b.orientation, ORIENTATIONS, (v) => {
        b.orientation = v;
      });
      ori.style.maxWidth = '86px';
      row.append(xi, yi, ori);
      box.append(row);
      p.append(box);
    });
    const addB = h('button', 'me-btn', '+ posicionar barreira') as HTMLButtonElement;
    addB.onclick = () => {
      this.placeMode = { kind: 'barrier' };
      this.setTool('select');
      this.updateBottom();
    };
    p.append(addB);
  }

  private renderOnda(p: El): void {
    const d = this.doc;
    p.append(this.field('Inimigos', this.num(d.wave.count, (v) => {
      d.wave.count = Math.max(1, Math.round(v));
    })));
    p.append(this.field('Intervalo', this.num(d.wave.spawnIntervalTicks, (v) => {
      d.wave.spawnIntervalTicks = Math.max(1, Math.round(v));
    })));
    p.append(this.field('Seed', this.num(d.wave.seed, (v) => {
      d.wave.seed = Math.round(v) >>> 0;
    })));
    p.append(this.field('Atraso chefe', this.num(d.wave.bossDelayTicks, (v) => {
      d.wave.bossDelayTicks = Math.max(0, Math.round(v));
    })));
    const bossRow = h('div', 'me-row');
    const bossSel = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '(sem chefe)';
    bossSel.append(none);
    for (const k of ENEMY_KINDS) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      if (k === d.wave.boss) opt.selected = true;
      bossSel.append(opt);
    }
    bossSel.onchange = () => {
      this.checkpoint();
      if (bossSel.value) d.wave.boss = bossSel.value;
      else delete d.wave.boss;
      this.afterEdit();
    };
    bossRow.append(h('label', '', 'Chefe'), bossSel);
    p.append(bossRow);
    p.append(h('h4', '', 'Mix'));
    d.wave.mix.forEach((m, i) => {
      const row = h('div', 'me-row');
      const kind = this.select(m.kind, ENEMY_KINDS, (v) => {
        m.kind = v;
      });
      kind.style.maxWidth = '86px';
      const wt = this.num(m.weight, (v) => {
        m.weight = Math.max(0, v);
      });
      wt.style.maxWidth = '52px';
      const del = h('button', 'me-btn', '×') as HTMLButtonElement;
      del.onclick = () => {
        this.checkpoint();
        d.wave.mix.splice(i, 1);
        this.afterEdit();
      };
      row.append(kind, wt, del);
      p.append(row);
    });
    const addM = h('button', 'me-btn', '+ tipo') as HTMLButtonElement;
    addM.onclick = () => {
      this.checkpoint();
      d.wave.mix.push({ kind: ENEMY_KINDS[0], weight: 10 });
      this.afterEdit();
    };
    p.append(addM);
  }
}

export function installMapEditor(addButton?: (html: string, title: string, onClick: () => void) => unknown): MapEditor {
  const ed = new MapEditor();
  document.body.append(ed.root);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F6') {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      ed.toggle();
      e.preventDefault();
    }
  });
  addButton?.('🗺', 'Editor de mapas (F6)', () => ed.toggle());
  return ed;
}
