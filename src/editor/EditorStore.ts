import { ROOTS, clone, getDefault, getPath, same, setPath } from './overrides';

export interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

const HISTORY_MAX = 300;

/** Store do Game Editor (F10) quando instalado — o Dev Lab (F8) edita pelo mesmo store (mesmo arquivo, mesmo desfazer). */
export const SHARED_EDITOR: { store?: EditorStore } = {};

/**
 * Estado do Game Editor: edita os objetos de configuração VIVOS (o jogo usa na hora),
 * guarda quais caminhos mudaram, desfaz/refaz e salva só a diferença para o código.
 */
export class EditorStore {
  private readonly touched = new Set<string>();
  private undoStack: Change[][] = [];
  private redoStack: Change[][] = [];
  private readonly listeners = new Set<() => void>();
  /** Há mudanças não salvas no balance.ts. */
  dirty = false;

  /**
   * @param baked balanceamento que veio no build (src/config/balance.ts)
   * @param user  balanceamento do jogador por cima (userData/balance.json no executável), se houver
   */
  constructor(
    private readonly baked: Record<string, unknown> = {},
    user: Record<string, unknown> | null = null,
  ) {
    for (const p of [...Object.keys(baked), ...Object.keys(user ?? {})]) this.touched.add(p);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get(path: string): unknown {
    return getPath(path);
  }
  def(path: string): unknown {
    return getDefault(path);
  }
  /** O valor (ou algo dentro dele) difere do código? */
  isChanged(path: string): boolean {
    return !same(getPath(path), getDefault(path));
  }

  /** Aplica um lote de mudanças como UM passo de desfazer. */
  private commit(changes: Change[]): void {
    const real = changes.filter((c) => !same(c.before, c.after));
    if (real.length === 0) return;
    for (const c of real) {
      setPath(c.path, c.after);
      this.touched.add(c.path);
    }
    this.undoStack.push(real);
    if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
    this.emit();
  }

  set(path: string, value: unknown): void {
    this.commit([{ path, before: clone(getPath(path)), after: clone(value) }]);
  }

  setMany(values: Record<string, unknown>): void {
    this.commit(Object.entries(values).map(([path, v]) => ({ path, before: clone(getPath(path)), after: clone(v) })));
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const step = this.undoStack.pop();
    if (!step) return;
    for (const c of [...step].reverse()) setPath(c.path, c.before);
    this.redoStack.push(step);
    this.dirty = true;
    this.emit();
  }

  redo(): void {
    const step = this.redoStack.pop();
    if (!step) return;
    for (const c of step) setPath(c.path, c.after);
    this.undoStack.push(step);
    this.dirty = true;
    this.emit();
  }

  /** Caminhos alterados que começam por algum dos prefixos (vazio = todos). */
  private changedUnder(prefixes: string[]): string[] {
    return [...this.touched].filter((p) => (prefixes.length === 0 || prefixes.some((x) => p === x || p.startsWith(x + '/'))) && this.isChanged(p));
  }

  /** Volta ao valor do código (desfazível). */
  reset(prefixes: string[] = []): void {
    this.commit(this.changedUnder(prefixes).map((path) => ({ path, before: clone(getPath(path)), after: clone(getDefault(path)) })));
  }

  /** Quantos valores diferem do código sob os prefixos. */
  countChanged(prefixes: string[] = []): number {
    return this.changedUnder(prefixes).length;
  }

  /** Só o que difere do código — é o que vai para o balance.ts. Pai e filho alterados: fica o mais geral. */
  diff(): Record<string, unknown> {
    const paths = this.changedUnder([]).sort();
    const out: Record<string, unknown> = {};
    for (const p of paths) if (!paths.some((q) => q !== p && p.startsWith(q + '/'))) out[p] = clone(getPath(p));
    return out;
  }

  /** Substitui tudo pelo conjunto dado (zera o que não estiver nele). Desfazível. */
  replaceAll(o: Record<string, unknown>): void {
    const changes: Change[] = [];
    for (const path of this.changedUnder([])) if (!(path in o)) changes.push({ path, before: clone(getPath(path)), after: clone(getDefault(path)) });
    for (const [path, v] of Object.entries(o)) {
      const [root] = path.split('/');
      if (!(root in ROOTS)) continue;
      changes.push({ path, before: clone(getPath(path)), after: clone(v) });
    }
    this.commit(changes);
  }

  /** Grava pelo client: src/config/balance.ts (rodando do projeto) ou userData/balance.json (executável). Devolve onde gravou. */
  async save(): Promise<string> {
    const where = await desktop().save(this.diff());
    this.dirty = false;
    this.emit();
    return where;
  }

  /** Recarrega o que está salvo (sem arquivo do usuário, volta ao balanceamento do build). */
  async loadSaved(): Promise<string> {
    const r = await desktop().load();
    this.replaceAll(r.data ?? this.baked);
    this.dirty = false;
    this.emit();
    return r.where;
  }

  /** Salva uma cópia .json onde o jogador escolher (janela do sistema). */
  async exportFile(): Promise<string | null> {
    return desktop().exportFile(this.diff());
  }

  /** Abre um .json (janela do sistema) e aplica. Desfazível. */
  async importFile(): Promise<boolean> {
    const o = await desktop().importFile();
    if (o === null) return false;
    if (typeof o !== 'object' || Array.isArray(o)) throw new Error('Arquivo de balanceamento inválido');
    this.replaceAll(o);
    return true;
  }
}

/** Ponte do Electron (o editor só existe no client desktop). */
function desktop(): NonNullable<Window['vanguardaDesktop']>['balance'] {
  const b = window.vanguardaDesktop?.balance;
  if (!b) throw new Error('O Game Editor só funciona no client desktop');
  return b;
}
