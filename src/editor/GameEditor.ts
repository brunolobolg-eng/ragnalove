/**
 * GAME EDITOR V1 (F10) — balanceamento sem mexer em código.
 * Abas: Monstros · Ondas · Loot & Economia · Configurações do jogo.
 * Edita os objetos de configuração vivos (vale na próxima onda/zona), salva a diferença em
 * src/config/balance.ts (rodando do projeto) ou userData/balance.json (executável) PELO CLIENT
 * (Electron, electron/main.cjs) e tem desfazer/refazer, resetar, importar/exportar com a janela do sistema.
 * Só existe no client desktop (main.ts carrega quando há `window.vanguardaDesktop`).
 */
import { EDITOR_CSS } from './editorStyle';
import { BALANCE_OVERRIDES } from '../config/balance';
import { ZONE_STATE } from '../config/gameConfig';
import { RARITIES, SLOTS, RARITY_INFO, SLOT_LABEL } from '../core/progression/equipment';
import { EditorStore, SHARED_EDITOR } from './EditorStore';

type TabId = 'monsters' | 'waves' | 'loot' | 'settings';
const TABS: { id: TabId; label: string; prefixes: string[] }[] = [
  { id: 'monsters', label: 'Monstros', prefixes: ['game/enemies', 'game/souls', 'game/zeni/dropPerKill', 'game/zeni/defaultDrop', 'game/progression/expPerKill', 'game/progression/defaultExp', 'game/cityDefense/threat', 'game/cityDefense/defaultThreat', 'game/aggro/byKind', 'game/enemySpells'] },
  { id: 'waves', label: 'Ondas', prefixes: ['zones', 'acts', 'game/cityDefense/threatActMult', 'game/city/actPriceMult', 'game/wave', 'game/survival'] },
  { id: 'loot', label: 'Loot & Economia', prefixes: ['loot', 'rarityWeights', 'slotWeight', 'weaponAtk', 'refine', 'rollPool', 'attributes/luk/dropChancePerPoint', 'attributes/luk/rarityShiftPerPoint', 'game/zeni/waveClearBonus', 'game/zeni/attrPointBase', 'game/zeni/attrPointStep', 'game/zeni/respecBase', 'game/city/potions', 'game/city/shopStock', 'game/city/itemPrice', 'game/city/sellPrice', 'game/city/rerollPrice', 'game/city/orePrice', 'game/city/refineFeePerLevel', 'game/city/awakenSouls', 'game/city/reviveFraction', 'game/cityDefense/repairStep', 'game/cityDefense/repairZeniPerHp'] },
  { id: 'settings', label: 'Configurações do jogo', prefixes: ['game/progression', 'game/cityDefense', 'game/aggro/taunt', 'game/objects', 'game/biome', 'game/soloBonus', 'game/archetypes', 'game/pathing', 'attributes'] },
];

const KIND_LABEL: Record<string, string> = {
  grunt: 'Comum',
  runner: 'Rápido',
  brute: 'Pesado',
  raydric: 'Raydric (pesado)',
  necro: 'Necromante',
  elite: 'Elite',
  boss: 'Chefe Ato I',
  boss2: 'Chefe Ato II',
  orcboss: 'Chefe Ato III',
  goblinImp: 'Krexx pequeno',
  dinoBoss: 'Dino (mini-chefe)',
  goblinWarlord: 'Krexx retorcido',
};
const AGGRO_TYPES = ['city', 'tauntable', 'bypass', 'heavy', 'hunter'];
const AGGRO_LABEL: Record<string, string> = { city: 'cidade', tauntable: 'cidade (provocável)', bypass: 'ignora heróis', heavy: 'pesado (quebra)', hunter: 'caçador' };

/** Rótulos legíveis das chaves mais comuns (o resto aparece com o nome do código). */
const KEY_LABEL: Record<string, string> = {
  hp: 'Vida', damage: 'Dano', cooldownTicks: 'Recarga (ticks)', range: 'Alcance', radius: 'Raio', durationTicks: 'Duração (ticks)',
  moveTicks: 'Mover (ticks/tile)', attackTicks: 'Ataque (ticks)', count: 'Quantidade', weight: 'Peso', min: 'Mín', max: 'Máx',
  price: 'Preço', exp: 'EXP', telegraphTicks: 'Aviso (ticks)', burnDamage: 'Dano de queima', burnIntervalTicks: 'Queima a cada (ticks)',
  regenPerSec: 'Cura/s', zeniCost: 'Custo Zen', soulCost: 'Custo almas', slowMult: 'Lentidão ×', pathCost: 'Custo de caminho',
  maxHp: 'Vida máx.', length: 'Comprimento', chillTicks: 'Gelo (ticks)', minTargets: 'Mín. alvos', halfAngleDeg: 'Meio ângulo (°)',
  stageKills: 'Abates por estágio', hpGrowth: 'Vida × por estágio', dmgGrowth: 'Dano × por estágio', intervalMin: 'Intervalo mín.', eliteEvery: 'Elite a cada',
  pointsPerLevel: 'Pontos por nível', levelsPerBoss: 'Níveis por chefe', skillPointsPerLevel: 'Pontos de habilidade/nível', base: 'Base', growth: 'Crescimento',
  expCurve: 'Curva de EXP', soulAbsorb: 'Almas → EXP', souls: 'Almas', states: 'Faixas de estado (fração)', safe: 'Seguro', pressure: 'Pressão', critical: 'Crítico',
  survivalThreatMult: 'Ameaça na Sobrevivência ×', rangePerLevel: 'Alcance por nível', durationPerLevel: 'Duração por nível', maxEnemies: 'Máx. inimigos',
  maxPerLevel: 'Máx. por nível', cooldownPerLevel: 'Recarga por nível', mage: 'Mago', archer: 'Arqueira', warrior: 'Guerreiro',
  fireBarrier: 'Barreira de Fogo', frostBolt: 'Raio Gélido', arrow: 'Flecha Precisa', rain: 'Chuva de Flechas', cleave: 'Golpe em Área', bash: 'Investida',
  cooldown: 'Recarga ×', revealRange: 'Revela a (tiles)', fog: 'Neblina', roots: 'Raízes', sandstorm: 'Tempestade de areia',
  stepCost: 'Passo', diagonalCost: 'Diagonal', hazardCost: 'Perigo', breakCost: 'Quebrar', triggerRadius: 'Raio de gatilho', areaHit: 'Dano em área',
};
const label = (k: string) => KEY_LABEL[k] ?? k;

type El = HTMLElement;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const fmt = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : v === undefined ? '—' : String(v));
const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

export class GameEditor {
  readonly root = h('div', 'ge-win');
  private readonly body = h('div', 'ge-body');
  private readonly tabBar = h('div', 'ge-tabs');
  private readonly status = h('span', 'ge-status');
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private tab: TabId = 'monsters';
  private zone = ZONE_STATE.current.id;

  constructor(readonly store: EditorStore) {
    this.root.hidden = true;
    const title = h('div', 'ge-title');
    title.append(h('span', '', 'GAME EDITOR'), h('span', 'ge-dev', 'DEV'));
    const close = h('button', 'ge-x', '×');
    close.title = 'Fechar (F10)';
    close.onclick = () => this.toggle(false);
    title.append(close);

    const tools = h('div', 'ge-tools');
    const btn = (text: string, tip: string, fn: () => void, cls = '') => {
      const b = h('button', `ge-btn ${cls}`, text);
      b.title = tip;
      b.onclick = fn;
      tools.append(b);
      return b;
    };
    btn('Salvar', 'Grava o balanceamento pelo client (Ctrl+S)', () => void this.run(() => this.save()), 'ge-primary');
    btn('Carregar', 'Recarrega o balanceamento salvo', () => void this.run(() => this.loadSaved()));
    btn('Importar…', 'Abre um .json de balanceamento', () => void this.run(() => this.importFile()));
    btn('Exportar…', 'Salva uma cópia .json onde você escolher', () => void this.run(() => this.exportFile()));
    tools.append(h('span', 'ge-sep'));
    this.undoBtn = btn('↶ Desfazer', 'Ctrl+Z', () => this.store.undo());
    this.redoBtn = btn('↷ Refazer', 'Ctrl+Y / Ctrl+Shift+Z', () => this.store.redo());
    tools.append(h('span', 'ge-sep'));
    btn('Resetar aba', 'Volta os valores desta aba aos do código', () => this.resetTab());
    btn('Resetar tudo', 'Volta TODOS os valores aos do código', () => this.resetAll(), 'ge-danger');
    tools.append(this.status);


    for (const t of TABS) {
      const b = h('button', 'ge-tab', t.label);
      b.dataset.tab = t.id;
      b.onclick = () => {
        this.tab = t.id;
        this.render();
      };
      this.tabBar.append(b);
    }
    const hint = h('div', 'ge-hint', 'Os valores valem na hora para o que nascer depois (próxima onda); mudanças de zona valem ao entrar na zona. Clique direito num campo = voltar ao valor do código.');
    this.root.append(title, tools, this.tabBar, hint, this.body);
    this.root.addEventListener('keydown', (e) => e.stopPropagation());
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    store.onChange(() => this.render());
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(open = !this.isOpen): void {
    this.root.hidden = !open;
    if (open) {
      this.zone = ZONE_STATE.current.id;
      this.render();
    }
  }

  /** Atalhos globais enquanto o editor está aberto. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.key === 'F10') {
      this.toggle();
      return true;
    }
    if (!this.isOpen || !(e.ctrlKey || e.metaKey)) return false;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) this.store.undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) this.store.redo();
    else if (k === 's') void this.run(() => this.save());
    else return false;
    return true;
  }

  /** Executa uma ação de arquivo mostrando o erro na barra de status. */
  private async run(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.flash(`Erro: ${(e as Error).message}`, true);
    }
  }
  private async save(): Promise<void> {
    this.flash(`Salvo em ${await this.store.save()}`);
  }
  private async loadSaved(): Promise<void> {
    if (this.store.dirty && !confirm('Descartar as mudanças não salvas e recarregar o balanceamento salvo?')) return;
    this.flash(`Recarregado de ${await this.store.loadSaved()}`);
  }
  private async importFile(): Promise<void> {
    if (await this.store.importFile()) this.flash('Arquivo importado (Salvar para gravar)');
  }
  private async exportFile(): Promise<void> {
    const where = await this.store.exportFile();
    if (where) this.flash(`Exportado para ${where}`);
  }
  private resetTab(): void {
    const t = TABS.find((x) => x.id === this.tab)!;
    if (this.tab === 'settings') {
      // a aba geral não reseta o que pertence às outras abas
      const others = TABS.filter((x) => x.id !== 'settings').flatMap((x) => x.prefixes);
      this.store.reset(t.prefixes.flatMap((p) => this.leafPrefixes(p)).filter((p) => !others.some((o) => p === o || p.startsWith(o + '/'))));
    } else this.store.reset(t.prefixes);
    this.flash('Aba resetada (Ctrl+Z desfaz)');
  }
  private resetAll(): void {
    if (!confirm('Voltar TODOS os valores aos do código? (dá para desfazer com Ctrl+Z)')) return;
    this.store.reset();
  }
  /** Caminhos folha sob um prefixo (para resetar a aba geral sem pegar campos das outras abas). */
  private leafPrefixes(prefix: string): string[] {
    const out: string[] = [];
    const rec = (p: string, v: unknown) => {
      if (v !== null && typeof v === 'object') for (const [k, c] of Object.entries(v)) rec(`${p}/${k}`, c);
      else out.push(p);
    };
    rec(prefix, this.store.def(prefix));
    return out;
  }

  private flashT = 0;
  private flash(msg: string, err = false): void {
    this.status.textContent = msg;
    this.status.classList.toggle('ge-err', err);
    this.flashT = Date.now();
    setTimeout(() => {
      if (Date.now() - this.flashT >= 3900) this.updateStatus();
    }, 4000);
  }
  private updateStatus(): void {
    const n = this.store.countChanged();
    this.status.classList.remove('ge-err');
    this.status.textContent = `${n} valor${n === 1 ? '' : 'es'} diferente${n === 1 ? '' : 's'} do código${this.store.dirty ? ' · não salvo' : ''}`;
  }

  // ---------------------------------------------------------------- render
  render(): void {
    if (!this.isOpen) return;
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.path;
    const scroll = this.body.scrollTop;
    for (const b of this.tabBar.querySelectorAll<HTMLButtonElement>('.ge-tab')) {
      const t = TABS.find((x) => x.id === b.dataset.tab)!;
      const n = this.store.countChanged(t.prefixes);
      b.classList.toggle('on', t.id === this.tab);
      b.textContent = n ? `${t.label} • ${n}` : t.label;
    }
    this.undoBtn.disabled = !this.store.canUndo;
    this.redoBtn.disabled = !this.store.canRedo;
    if (Date.now() - this.flashT > 4000) this.updateStatus();
    this.body.replaceChildren();
    if (this.tab === 'monsters') this.renderMonsters();
    else if (this.tab === 'waves') this.renderWaves();
    else if (this.tab === 'loot') this.renderLoot();
    else this.renderSettings();
    this.body.scrollTop = scroll;
    if (focused) this.body.querySelector<HTMLElement>(`[data-path="${CSS.escape(focused)}"]`)?.focus();
  }

  private section(title: string, note?: string): El {
    const s = h('section', 'ge-sec');
    s.append(h('h4', '', title));
    if (note) s.append(h('div', 'ge-note', note));
    this.body.append(s);
    return s;
  }

  /** Campo numérico ligado a um caminho. */
  private num(path: string, opts: { step?: number; w?: number } = {}): HTMLInputElement {
    const i = h('input', 'ge-num');
    i.type = 'number';
    i.step = String(opts.step ?? 'any');
    if (opts.w) i.style.width = `${opts.w}px`;
    const v = this.store.get(path);
    i.value = typeof v === 'number' ? String(v) : '';
    i.dataset.path = path;
    this.decorate(i, path);
    i.addEventListener('change', () => {
      const n = parseFloat(i.value);
      if (Number.isFinite(n)) this.store.set(path, n);
      else i.value = String(this.store.get(path) ?? '');
    });
    return i;
  }

  private select(path: string, options: [string, string][], allowEmpty?: string): HTMLSelectElement {
    const s = h('select', 'ge-sel');
    const cur = this.store.get(path);
    if (allowEmpty !== undefined) s.append(new Option(allowEmpty, ''));
    for (const [v, t] of options) s.append(new Option(t, v));
    s.value = typeof cur === 'string' ? cur : '';
    s.dataset.path = path;
    this.decorate(s, path);
    s.addEventListener('change', () => this.store.set(path, s.value === '' ? undefined : s.value));
    return s;
  }

  /** Marca valor alterado, mostra o valor do código e reseta no clique direito. */
  private decorate(e: HTMLInputElement | HTMLSelectElement, path: string): void {
    const changed = this.store.isChanged(path);
    e.classList.toggle('chg', changed);
    e.title = `${path}\nCódigo: ${fmt(this.store.def(path))}${changed ? '\n(clique direito: voltar ao código)' : ''}`;
    e.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      if (this.store.isChanged(path)) this.store.reset([path]);
    });
  }

  private field(parent: El, text: string, input: El, extra?: string): void {
    const r = h('label', 'ge-field');
    r.append(h('span', 'ge-lab', text), input);
    if (extra) r.append(h('span', 'ge-extra', extra));
    parent.append(r);
  }

  private table(parent: El, head: string[]): HTMLTableSectionElement {
    const t = h('table', 'ge-table');
    const hr = h('tr');
    for (const c of head) hr.append(h('th', '', c));
    t.append(h('thead'));
    t.tHead!.append(hr);
    const tb = h('tbody');
    t.append(tb);
    parent.append(t);
    return tb;
  }
  private row(tb: HTMLTableSectionElement, cells: (El | string)[]): HTMLTableRowElement {
    const tr = h('tr');
    for (const c of cells) {
      const td = h('td');
      if (typeof c === 'string') td.textContent = c;
      else td.append(c);
      tr.append(td);
    }
    tb.append(tr);
    return tr;
  }

  private kinds(): string[] {
    return Object.keys(this.store.get('game/enemies') as Record<string, unknown>);
  }
  private kindOptions(): [string, string][] {
    return this.kinds().map((k) => [k, KIND_LABEL[k] ? `${KIND_LABEL[k]} (${k})` : k]);
  }

  // ---------------------------------------------------------------- Monstros
  private renderMonsters(): void {
    const tick = this.store.get('game/sim/tickRate') as number;
    const s = this.section('Monstros', 'Vel. e DPS são calculados (só leitura). Ticks: 10 ticks = 1 segundo.');
    const tb = this.table(s, ['Monstro', 'Vida', 'Mover', 'Ataque', 'Dano', 'Vel. tiles/s', 'DPS', 'Almas', 'Zen', 'EXP', 'Ameaça', 'Aggro']);
    for (const k of this.kinds()) {
      const e = this.store.get(`game/enemies/${k}`) as { moveTicks: number; attackTicks: number; damage: number };
      this.row(tb, [
        h('b', '', KIND_LABEL[k] ?? k),
        this.num(`game/enemies/${k}/hp`, { w: 54 }),
        this.num(`game/enemies/${k}/moveTicks`, { w: 44 }),
        this.num(`game/enemies/${k}/attackTicks`, { w: 44 }),
        this.num(`game/enemies/${k}/damage`, { w: 44 }),
        h('span', 'ge-ro', (tick / e.moveTicks).toFixed(2)),
        h('span', 'ge-ro', ((e.damage * tick) / e.attackTicks).toFixed(1)),
        this.num(`game/souls/dropPerKill/${k}`, { w: 44 }),
        this.num(`game/zeni/dropPerKill/${k}`, { w: 50 }),
        this.num(`game/progression/expPerKill/${k}`, { w: 50 }),
        this.num(`game/cityDefense/threat/${k}`, { w: 50 }),
        this.select(`game/aggro/byKind/${k}`, AGGRO_TYPES.map((a) => [a, AGGRO_LABEL[a]])),
      ]);
    }
    const d = this.section('Padrões (tipos sem valor próprio)');
    const dg = h('div', 'ge-grid');
    this.field(dg, 'Almas', this.num('game/souls/defaultDrop'));
    this.field(dg, 'Zen', this.num('game/zeni/defaultDrop'));
    this.field(dg, 'EXP', this.num('game/progression/defaultExp'));
    this.field(dg, 'Ameaça à cidade', this.num('game/cityDefense/defaultThreat'));
    d.append(dg);

    const sp = this.section('Magias dos monstros', 'Dano escala com o multiplicador de dano do ato.');
    const spells = this.store.get('game/enemySpells') as Record<string, Record<string, unknown>[]>;
    for (const [k, list] of Object.entries(spells)) {
      list.forEach((spell, i) => {
        const r = h('div', 'ge-inline');
        r.append(h('b', 'ge-inline-t', `${KIND_LABEL[k] ?? k} · ${String(spell.id)}`));
        for (const key of Object.keys(spell)) if (key !== 'id' && typeof spell[key] === 'number') this.field(r, label(key), this.num(`game/enemySpells/${k}/${i}/${key}`, { w: 48 }));
        sp.append(r);
      });
    }
  }

  // ---------------------------------------------------------------- Ondas
  private renderWaves(): void {
    const kindOpts = this.kindOptions();
    const a = this.section('Atos', 'HP×/Dano× escalam todos os monstros do ato; Ameaça× pesa o dano à cidade; Preço× as lojas.');
    const acts = this.store.get('acts') as { name: string }[];
    const ta = this.table(a, ['Ato', 'Chefe', 'HP×', 'Dano×', 'Ameaça×', 'Preço×']);
    acts.forEach((act, i) =>
      this.row(ta, [
        h('b', '', act.name),
        this.select(`acts/${i}/boss`, kindOpts),
        this.num(`acts/${i}/hpMult`, { w: 52, step: 0.1 }),
        this.num(`acts/${i}/dmgMult`, { w: 52, step: 0.1 }),
        this.num(`game/cityDefense/threatActMult/${i}`, { w: 52, step: 0.1 }),
        this.num(`game/city/actPriceMult/${i}`, { w: 52, step: 0.1 }),
      ]),
    );

    const zones = this.store.get('zones') as Record<string, { name: string; theme: string; widthTiles: number; heightTiles: number; spawnPoints: { x: number; y: number }[] }>;
    if (!zones[this.zone]) this.zone = Object.keys(zones)[0];
    const z = this.section('Onda da zona', 'Vale na próxima vez que a party entrar nesta zona.');
    const pick = h('select', 'ge-sel');
    for (const [id, zz] of Object.entries(zones)) {
      const n = this.store.countChanged([`zones/${id}`]);
      pick.append(new Option(`${zz.name} (${id})${n ? ` • ${n}` : ''}`, id));
    }
    pick.value = this.zone;
    pick.onchange = () => {
      this.zone = pick.value;
      this.render();
    };
    this.field(z, 'Zona', pick);
    const zz = zones[this.zone];
    z.append(h('div', 'ge-note', `Tema ${zz.theme} · ${zz.widthTiles}×${zz.heightTiles} tiles · spawns ${zz.spawnPoints.map((p) => `(${p.x},${p.y})`).join(' e ')} (editor de mapa/spawn: V2)`));
    const zp = `zones/${this.zone}`;
    const g = h('div', 'ge-grid');
    this.field(g, 'Monstros na onda', this.num(`${zp}/wave/count`));
    this.field(g, 'Intervalo de spawn (ticks)', this.num(`${zp}/wave/spawnIntervalTicks`));
    this.field(g, 'Atraso do chefe (ticks)', this.num(`${zp}/wave/bossDelayTicks`));
    this.field(g, 'Fração no 1º spawn (0–1)', this.num(`${zp}/spawnSplit`, { step: 0.05 }), 'vazio = padrão');
    this.field(g, 'Semente', this.num(`${zp}/wave/seed`, { step: 1 }));
    this.field(g, 'Chefe da zona', this.select(`${zp}/wave/boss`, kindOpts, '(nenhum)'), 'na rota, o chefe do ato manda');
    z.append(g);

    // composição (mix): a lista inteira é um valor só (cada zona fica com a sua cópia)
    const mixPath = `${zp}/wave/mix`;
    const mix = (this.store.get(mixPath) as { kind: string; weight: number }[]) ?? [];
    const total = mix.reduce((s, m) => s + m.weight, 0) || 1;
    const tm = this.table(z, ['Monstro', 'Peso', 'Chance', '']);
    mix.forEach((m, i) => {
      const w = h('input', 'ge-num');
      w.type = 'number';
      w.step = 'any';
      w.style.width = '60px';
      w.value = String(m.weight);
      w.dataset.path = `${mixPath}#${i}`;
      w.onchange = () => {
        const n = parseFloat(w.value);
        if (!Number.isFinite(n) || n < 0) return void (w.value = String(m.weight));
        this.store.set(mixPath, mix.map((x, j) => (j === i ? { ...x, weight: n } : { ...x })));
      };
      const del = h('button', 'ge-btn ge-mini', '✕');
      del.title = 'Remover da onda';
      del.onclick = () => this.store.set(mixPath, mix.filter((_, j) => j !== i).map((x) => ({ ...x })));
      this.row(tm, [h('b', '', KIND_LABEL[m.kind] ?? m.kind), w, h('span', 'ge-ro', pct(m.weight / total)), del]);
    });
    if (this.store.isChanged(mixPath)) tm.parentElement!.classList.add('chg');
    const add = h('div', 'ge-inline');
    const addSel = h('select', 'ge-sel');
    for (const [k, t] of kindOpts) if (!mix.some((m) => m.kind === k)) addSel.append(new Option(t, k));
    const addBtn = h('button', 'ge-btn', '+ Adicionar monstro');
    addBtn.disabled = addSel.options.length === 0;
    addBtn.onclick = () => this.store.set(mixPath, [...mix.map((x) => ({ ...x })), { kind: addSel.value, weight: 10 }]);
    const mixReset = h('button', 'ge-btn', 'Resetar composição');
    mixReset.disabled = !this.store.isChanged(mixPath);
    mixReset.onclick = () => this.store.reset([mixPath]);
    add.append(addSel, addBtn, mixReset);
    z.append(add);

    const w = this.section('Onda (global)');
    const wg = h('div', 'ge-grid');
    this.field(wg, 'Fração padrão no 1º spawn', this.num('game/wave/defaultSpawnSplit', { step: 0.05 }));
    this.field(wg, 'Espalhar spawn ocupado (tiles)', this.num('game/wave/spawnSpread'));
    this.field(wg, 'Raio seguro do spawn p/ heróis', this.num('game/wave/spawnSafeRadius'));
    w.append(wg);
    const sv = this.section('Sobrevivência');
    this.tree(sv, 'game/survival');
  }

  // ---------------------------------------------------------------- Loot & Economia
  private renderLoot(): void {
    const rarOpts: [string, string][] = RARITIES.map((r) => [r, RARITY_INFO[r].label]);
    const d = this.section('Drop de equipamento');
    const dg = h('div', 'ge-grid');
    const dc = this.store.get('loot/dropChance') as number;
    this.field(dg, 'Chance por monstro', this.num('loot/dropChance', { step: 0.005 }), pct(dc));
    this.field(dg, 'Teto da chance (com Sorte)', this.num('loot/maxDropChance', { step: 0.01 }));
    this.field(dg, 'Chance + por ponto de Sorte', this.num('attributes/luk/dropChancePerPoint', { step: 0.0005 }));
    this.field(dg, 'Desvio de raridade por Sorte', this.num('attributes/luk/rarityShiftPerPoint', { step: 0.01 }));
    d.append(dg);

    const rw = this.section('Raridade dos drops comuns', 'Peso relativo; a chance é calculada.');
    const weights = this.store.get('rarityWeights') as Record<string, number>;
    const tot = Object.values(weights).reduce((s, v) => s + v, 0) || 1;
    const tr = this.table(rw, ['Raridade', 'Peso', 'Chance', 'ATQ da arma', 'Preço loja', 'Venda', 'Rerrolar']);
    for (const r of RARITIES)
      this.row(tr, [
        h('b', '', RARITY_INFO[r].label),
        this.num(`rarityWeights/${r}`, { w: 50 }),
        h('span', 'ge-ro', pct(weights[r] / tot)),
        this.num(`weaponAtk/${r}`, { w: 50 }),
        this.num(`game/city/itemPrice/${r}`, { w: 60 }),
        this.num(`game/city/sellPrice/${r}`, { w: 60 }),
        this.num(`game/city/rerollPrice/${r}`, { w: 60 }),
      ]);

    const b = this.section('Drop garantido dos chefes', '"default" vale para chefes sem regra própria.');
    const tb = this.table(b, ['Chefe', 'Raridade alta', 'Chance da alta', 'Senão']);
    for (const k of Object.keys(this.store.get('loot/bossRarity') as Record<string, unknown>))
      this.row(tb, [h('b', '', KIND_LABEL[k] ?? k), this.select(`loot/bossRarity/${k}/top`, rarOpts), this.num(`loot/bossRarity/${k}/topChance`, { w: 56, step: 0.05 }), this.select(`loot/bossRarity/${k}/base`, rarOpts)]);

    const sl = this.section('Peso de cada slot');
    const sg = h('div', 'ge-grid');
    for (const s of SLOTS) this.field(sg, SLOT_LABEL[s], this.num(`slotWeight/${s}`, { step: 0.1 }));
    sl.append(sg);

    const rp = this.section('Rolagens de atributo dos itens');
    const tp = this.table(rp, ['Tipo', 'Peso', 'Mín', 'Máx']);
    (this.store.get('rollPool') as { kind: string }[]).forEach((e, i) => this.row(tp, [h('b', '', e.kind), this.num(`rollPool/${i}/weight`, { w: 50 }), this.num(`rollPool/${i}/min`, { w: 50 }), this.num(`rollPool/${i}/max`, { w: 50 })]));

    const rf = this.section('Refino', 'Chance de sucesso ao ir PARA cada nível (+0 … +10).');
    this.tree(rf, 'refine');

    const ec = this.section('Economia (Zen)');
    const eg = h('div', 'ge-grid');
    this.field(eg, 'Bônus por vencer a onda', this.num('game/zeni/waveClearBonus'));
    this.field(eg, 'Ponto de atributo: base', this.num('game/zeni/attrPointBase'));
    this.field(eg, 'Ponto de atributo: passo', this.num('game/zeni/attrPointStep'));
    this.field(eg, 'Redistribuir: base', this.num('game/zeni/respecBase'));
    this.field(eg, 'Itens na loja', this.num('game/city/shopStock', { step: 1 }));
    this.field(eg, 'Minério de refino', this.num('game/city/orePrice'));
    this.field(eg, 'Taxa de refino por nível', this.num('game/city/refineFeePerLevel'));
    this.field(eg, 'Reviver (fração do Zen)', this.num('game/city/reviveFraction', { step: 0.05 }));
    this.field(eg, 'Reparo: HP por compra', this.num('game/cityDefense/repairStep'));
    this.field(eg, 'Reparo: Zen por HP', this.num('game/cityDefense/repairZeniPerHp', { step: 0.1 }));
    for (const r of Object.keys(this.store.get('game/city/awakenSouls') as Record<string, number>)) this.field(eg, `Despertar ${RARITY_INFO[r as keyof typeof RARITY_INFO]?.label ?? r} (almas)`, this.num(`game/city/awakenSouls/${r}`));
    ec.append(eg);
    const pt = this.table(ec, ['Poção', 'EXP', 'Preço']);
    (this.store.get('game/city/potions') as { name: string }[]).forEach((p, i) => this.row(pt, [h('b', '', p.name), this.num(`game/city/potions/${i}/exp`, { w: 60 }), this.num(`game/city/potions/${i}/price`, { w: 60 })]));
  }

  // ---------------------------------------------------------------- Configurações gerais
  private renderSettings(): void {
    const groups: [string, string, string[]?][] = [
      ['Progressão (EXP e níveis)', 'game/progression', ['expPerKill', 'defaultExp']],
      ['Cidade (vida e ameaça)', 'game/cityDefense', ['threat', 'defaultThreat', 'threatActMult', 'repairStep', 'repairZeniPerHp']],
      ['Provocar (Taunt)', 'game/aggro/taunt'],
      ['Heróis', 'game/archetypes'],
      ['Herói sozinho (Ato I)', 'game/soloBonus'],
      ['Atributos', 'attributes', ['luk']],
      ['Objetos dos mapas', 'game/objects'],
      ['Biomas', 'game/biome'],
      ['Caminho (pathfinding)', 'game/pathing'],
    ];
    for (const [title, path, skip] of groups) {
      const s = this.section(title);
      this.tree(s, path, skip);
    }
    const luk = this.section('Atributos · Sorte', 'Chance de drop e desvio de raridade da Sorte ficam na aba Loot.');
    this.tree(luk, 'attributes/luk', ['dropChancePerPoint', 'rarityShiftPerPoint']);
  }

  /** Renderiza todos os números (e listas de números) sob um caminho, agrupando objetos. */
  private tree(parent: El, path: string, skip: string[] = []): void {
    const v = this.store.get(path);
    if (v === null || typeof v !== 'object') return;
    const grid = h('div', 'ge-grid');
    const nested: [string, unknown][] = [];
    for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
      if (skip.includes(k)) continue;
      if (typeof c === 'number') this.field(grid, label(k), this.num(`${path}/${k}`));
      else if (Array.isArray(c) && c.every((x) => typeof x === 'number')) {
        const box = h('span', 'ge-arr');
        c.forEach((_, i) => box.append(this.num(`${path}/${k}/${i}`, { w: 46 })));
        this.field(grid, label(k), box);
      } else if (c !== null && typeof c === 'object') nested.push([k, c]);
    }
    if (grid.childElementCount) parent.append(grid);
    for (const [k] of nested) {
      const det = h('details', 'ge-det');
      const n = this.store.countChanged([`${path}/${k}`]);
      det.open = n > 0 || nested.length <= 3;
      det.append(h('summary', '', n ? `${label(k)} • ${n}` : label(k)));
      this.tree(det, `${path}/${k}`);
      parent.append(det);
    }
  }
}

/** Instala o editor (F10) e o botão na barra de sistema. */
export function installEditor(userBalance: Record<string, unknown> | null, addButton?: (html: string, title: string, onClick: () => void) => unknown): GameEditor {
  const style = document.createElement('style');
  style.textContent = EDITOR_CSS;
  document.head.append(style);
  const ed = new GameEditor((SHARED_EDITOR.store = new EditorStore(BALANCE_OVERRIDES, userBalance)));
  document.body.append(ed.root);
  window.addEventListener(
    'keydown',
    (e) => {
      if (ed.handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
  addButton?.('✎', 'Game Editor (F10)', () => ed.toggle());
  return ed;
}
