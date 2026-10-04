/** Histórico por snapshots (simples e robusto para grade + objetos). */
export class History {
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private lastSaved = '';

  constructor(private readonly max = 100) {}

  /** Tira foto do estado atual ANTES de mudar (chamar antes de cada mutação). */
  checkpoint(snapshot: string): void {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last === snapshot) return;
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.max) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(current: string): string | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(current);
    return prev;
  }

  redo(current: string): string | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(current);
    return next;
  }

  markSaved(snapshot: string): void {
    this.lastSaved = snapshot;
  }
  isDirty(current: string): boolean {
    return current !== this.lastSaved;
  }
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.lastSaved = '';
  }
}
