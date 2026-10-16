import { sizeOf, type StructureKind } from '../../config/bastion';
import type { Vec2 } from '../grid/types';

/**
 * Área que uma construção da cidade ocupa. A origem (x, y) é o canto de cima à esquerda; uma construção de lado
 * `size` cobre os tiles de x a x+size-1 e de y a y+size-1. Muralha e torre são 1×1 (ver sizeOf).
 * Regras puras: a colocação, a seleção e a prévia usam estas mesmas funções.
 */

/** Todos os tiles que uma construção do tipo `kind` cobre, com a origem em `at`. */
export function footprintTiles(kind: StructureKind, at: Vec2): Vec2[] {
  const n = sizeOf(kind);
  const tiles: Vec2[] = [];
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) tiles.push({ x: at.x + dx, y: at.y + dy });
  return tiles;
}

/** A construção que cobre (x, y) com origem em `at` cobre esse tile? */
export function footprintCovers(kind: StructureKind, at: Vec2, x: number, y: number): boolean {
  const n = sizeOf(kind);
  return x >= at.x && x < at.x + n && y >= at.y && y < at.y + n;
}

/** A construção do save (tipo e origem) cobre o tile? Use isto no lugar de comparar a origem. */
export function estruturaCobre(s: { kind: StructureKind; x: number; y: number }, t: Vec2): boolean {
  return footprintCovers(s.kind, { x: s.x, y: s.y }, t.x, t.y);
}

/** Todos os tiles da construção do save. */
export function areaDaEstrutura(s: { kind: StructureKind; x: number; y: number }): Vec2[] {
  return footprintTiles(s.kind, { x: s.x, y: s.y });
}

/** Duas áreas se sobrepõem? (cada uma com seu tipo e origem). */
export function footprintsOverlap(a: { kind: StructureKind; at: Vec2 }, b: { kind: StructureKind; at: Vec2 }): boolean {
  const na = sizeOf(a.kind);
  const nb = sizeOf(b.kind);
  return a.at.x < b.at.x + nb && b.at.x < a.at.x + na && a.at.y < b.at.y + nb && b.at.y < a.at.y + na;
}
