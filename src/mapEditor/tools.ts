/**
 * Ferramentas de pintura sobre a grade (puras: recebem o doc e mutam).
 * O MapEditor cuida de history (checkpoint no início do traço).
 */
import { inBounds, setChar, type MapDoc } from './mapDoc';

export type ToolId = 'select' | 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'eyedropper';

export const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Selecionar', key: 'S' },
  { id: 'brush', label: 'Pincel', key: 'B' },
  { id: 'eraser', label: 'Borracha', key: 'E' },
  { id: 'fill', label: 'Preencher', key: 'G' },
  { id: 'line', label: 'Linha', key: 'L' },
  { id: 'rect', label: 'Retângulo', key: 'R' },
  { id: 'eyedropper', label: 'Conta-gotas', key: 'I' },
];

export function paintAt(d: MapDoc, x: number, y: number, ch: string): boolean {
  if (!inBounds(d, x, y)) return false;
  setChar(d, x, y, ch);
  return true;
}

export function floodFill(d: MapDoc, sx: number, sy: number, ch: string): number {
  if (!inBounds(d, sx, sy)) return 0;
  const target = d.grid[sy][sx];
  if (target === ch) return 0;
  let n = 0;
  const stack: [number, number][] = [[sx, sy]];
  const seen = new Set<number>();
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (!inBounds(d, x, y)) continue;
    const k = y * d.width + x;
    if (seen.has(k) || d.grid[y][x] !== target) continue;
    seen.add(k);
    setChar(d, x, y, ch);
    n++;
    if (n > d.width * d.height) break;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    cells.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

export function applyLine(d: MapDoc, x0: number, y0: number, x1: number, y1: number, ch: string): number {
  let n = 0;
  for (const [x, y] of lineCells(x0, y0, x1, y1)) if (paintAt(d, x, y, ch)) n++;
  return n;
}

export function applyRect(d: MapDoc, x0: number, y0: number, x1: number, y1: number, ch: string, filled: boolean): number {
  let n = 0;
  const xa = Math.min(x0, x1);
  const xb = Math.max(x0, x1);
  const ya = Math.min(y0, y1);
  const yb = Math.max(y0, y1);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      if (!filled && x !== xa && x !== xb && y !== ya && y !== yb) continue;
      if (paintAt(d, x, y, ch)) n++;
    }
  }
  return n;
}
