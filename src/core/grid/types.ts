export interface Vec2 {
  x: number;
  y: number;
}

/** Orientação de padrões de linha. y cresce "para baixo" (em direção à party). */
export type Orientation = 'H' | 'V' | 'DIAG_DOWN' | 'DIAG_UP';

export const ORIENTATIONS: Orientation[] = ['H', 'V', 'DIAG_DOWN', 'DIAG_UP'];

/** 8 direções, em ordem fixa (determinismo): N, NE, E, SE, S, SW, W, NW. */
export const DIRS8: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export const chebyshev = (a: Vec2, b: Vec2): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const isDiagonal = (d: Vec2): boolean => d.x !== 0 && d.y !== 0;
