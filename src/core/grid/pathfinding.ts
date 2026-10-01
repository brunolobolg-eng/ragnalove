import type { Board } from './Board';
import { DIRS8, isDiagonal, type Vec2 } from './types';

export interface PathCosts {
  stepCost: number;
  diagonalCost: number;
  hazardCost: number;
}

/**
 * Obstáculo atravessável para um tipo de inimigo (ex.: os pesados quebram raízes e colunas):
 * devolve o custo extra para entrar no tile, ou -1 se não dá para passar.
 */
export type PassCost = (x: number, y: number) => number;

/**
 * Pode dar um passo de `from` na direção `d`?
 * Diagonais não "cortam quina": se um dos tiles ortogonais for parede ou
 * perigo, a diagonal é proibida — assim uma barreira diagonal não vaza.
 */
export function canStep(board: Board, from: Vec2, d: Vec2): boolean {
  const tx = from.x + d.x;
  const ty = from.y + d.y;
  if (!board.isWalkable(tx, ty)) return false;
  if (isDiagonal(d)) {
    const a = { x: from.x + d.x, y: from.y };
    const b = { x: from.x, y: from.y + d.y };
    if (!board.isWalkable(a.x, a.y) || !board.isWalkable(b.x, b.y)) return false;
    if (board.hazardAt(a.x, a.y) > 0 || board.hazardAt(b.x, b.y) > 0) return false;
  }
  return true;
}

/** Custo de ENTRAR no tile destino a partir de um passo `d` (inclui terreno lento). */
export function stepCost(board: Board, to: Vec2, d: Vec2, c: PathCosts): number {
  const base = isDiagonal(d) ? c.diagonalCost : c.stepCost;
  const hz = board.hazardAt(to.x, to.y) > 0 ? c.hazardCost : 0;
  return base + hz + board.terrainCost(to.x, to.y);
}

/**
 * Campo de fluxo (Dijkstra reverso a partir dos alvos). Um único cálculo serve
 * para a horda inteira: cada inimigo só olha os vizinhos e desce o gradiente.
 */
export class FlowField {
  readonly dist: Int32Array;
  static readonly INF = 0x3fffffff;

  constructor(private readonly board: Board) {
    this.dist = new Int32Array(board.width * board.height);
  }

  /** @param pass obstáculos que este campo atravessa (com custo extra); só em passos ortogonais. */
  compute(goals: readonly Vec2[], costs: PathCosts, pass?: PassCost): void {
    const b = this.board;
    this.dist.fill(FlowField.INF);
    const heap = new MinHeap();
    for (const g of goals) {
      const i = b.idx(g.x, g.y);
      this.dist[i] = 0;
      heap.push(0, i);
    }
    const extra = (x: number, y: number) => (b.isWalkable(x, y) ? 0 : pass ? pass(x, y) : -1);
    while (heap.size > 0) {
      const [d, i] = heap.pop();
      if (d > this.dist[i]) continue;
      const ux = i % b.width;
      const uy = (i / b.width) | 0;
      const into = extra(ux, uy);
      // Relaxa vizinhos v: custo do passo v -> u (entrar em u).
      for (const dir of DIRS8) {
        const vx = ux - dir.x;
        const vy = uy - dir.y;
        const from = extra(vx, vy);
        if (from < 0) continue;
        const v = { x: vx, y: vy };
        if (into > 0 || from > 0) {
          if (isDiagonal(dir)) continue;
        } else if (!canStep(b, v, dir)) continue;
        const nd = d + stepCost(b, { x: ux, y: uy }, dir, costs) + Math.max(0, into);
        const vi = b.idx(vx, vy);
        if (nd < this.dist[vi]) {
          this.dist[vi] = nd;
          heap.push(nd, vi);
        }
      }
    }
  }

  at(x: number, y: number): number {
    return this.board.inBounds(x, y) ? this.dist[this.board.idx(x, y)] : FlowField.INF;
  }
}

/** Heap binário mínimo com desempate determinístico pelo índice. */
class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.k.length;
  }
  push(key: number, val: number): void {
    this.k.push(key);
    this.v.push(val);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(i, p)) {
        this.swap(i, p);
        i = p;
      } else break;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.k[0], this.v[0]];
    const lk = this.k.pop()!;
    const lv = this.v.pop()!;
    if (this.k.length > 0) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.less(l, m)) m = l;
        if (r < this.k.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private less(a: number, b: number): boolean {
    return this.k[a] < this.k[b] || (this.k[a] === this.k[b] && this.v[a] < this.v[b]);
  }
  private swap(a: number, b: number): void {
    [this.k[a], this.k[b]] = [this.k[b], this.k[a]];
    [this.v[a], this.v[b]] = [this.v[b], this.v[a]];
  }
}
