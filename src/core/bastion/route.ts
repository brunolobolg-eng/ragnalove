import { parseZone, type ZoneDef } from '../../config/zones';
import { Board } from '../grid/Board';
import { canStep } from '../grid/pathfinding';
import { DIRS8, type Vec2 } from '../grid/types';
import { OBJECT_RULES, makeObject } from '../sim/objects';
import type { BuildEnv } from './rules';

/**
 * Grade ESTÁTICA de uma zona (paredes, vazio, portão e objetos fixos do mapa), montada do mesmo jeito
 * que a simulação monta a sua. Não tem as estruturas da cidade: elas são quebráveis, então a horda
 * sempre pode passar por elas (quebrando), e não entram na checagem de rota.
 */
export function staticBoard(zone: ZoneDef): Board {
  const z = parseZone(zone);
  const b = new Board(z.width, z.height);
  for (const w of z.walls) b.setWall(w.x, w.y);
  for (const v of z.voids) b.setVoid(v.x, v.y);
  for (const c of z.city) b.setCity(c.x, c.y);
  z.objects.forEach((d, i) => {
    const o = makeObject(i + 1, d);
    const rule = OBJECT_RULES[o.type];
    if (rule.blocksWalk(o)) for (const t of o.tiles) b.setObject(t.x, t.y, o.id, rule.blocksSight(o));
  });
  return b;
}

/**
 * Ambiente de colocação do Último Bastião para uma zona: a grade estática, os tiles de construção (lotes
 * `b` e especiais `1`–`4`), os portais e a posição da party agora (não se constrói em cima de herói).
 */
export function bastionBuildEnv(zone: ZoneDef, heroes: readonly Vec2[], spawnSafeRadius: number): BuildEnv {
  const lots = new Set(parseZone(zone).lots.map((l) => `${l.x},${l.y}`));
  return { board: staticBoard(zone), buildable: (x, y) => lots.has(`${x},${y}`), spawns: zone.spawnPoints, spawnSafeRadius, heroes };
}

/**
 * Há caminho dos portais até um tile de portão, andando pela grade estática com as mesmas regras de passo
 * da horda (diagonal não corta quina)? Usada na colocação de estruturas e para validar o mapa do modo.
 */
export function routeOpen(board: Board, spawns: readonly Vec2[]): boolean {
  const seen = new Uint8Array(board.width * board.height);
  const queue: Vec2[] = [];
  for (const s of spawns) {
    if (!board.isWalkable(s.x, s.y) || seen[board.idx(s.x, s.y)]) continue;
    seen[board.idx(s.x, s.y)] = 1;
    queue.push({ x: s.x, y: s.y });
  }
  for (let k = 0; k < queue.length; k++) {
    const u = queue[k];
    if (board.isCity(u.x, u.y)) return true;
    for (const d of DIRS8) {
      if (!canStep(board, u, d)) continue;
      const nx = u.x + d.x;
      const ny = u.y + d.y;
      if (seen[board.idx(nx, ny)]) continue;
      seen[board.idx(nx, ny)] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return false;
}
