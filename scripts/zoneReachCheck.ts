/**
 * Checagem de navegabilidade das zonas (M11): todo spawn alcança o portão?
 * Setup e objetos estão em tiles caminháveis? Uso: tsx scripts/zoneReachCheck.ts
 */
import '../src/config/gameConfig'; // primeiro: quebra o ciclo zones <-> gameConfig
import { parseZone, ZONES } from '../src/config/zones';

let failures = 0;
for (const [id, z] of Object.entries(ZONES)) {
  const tag = `zona ${id} (${z.widthTiles}x${z.heightTiles})`;
  try {
    const p = parseZone(z);
    const blocked = new Set([...p.walls, ...p.voids].map((t) => `${t.x},${t.y}`));
    const walkable = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < p.width && y < p.height && !blocked.has(`${x},${y}`);
    const city = new Set(p.city.map((t) => `${t.x},${t.y}`));
    if (!p.city.length) {
      console.log(`  AVISO ${tag}: sem portão da cidade`);
    }
    for (const [si, s] of p.spawnPoints.entries()) {
      if (!walkable(s.x, s.y)) {
        failures++;
        console.error(`  FALHA ${tag}: spawn ${si + 1} (${s.x},${s.y}) bloqueado`);
        continue;
      }
      // BFS 4-dir até o portão mais próximo
      const seen = new Set<string>([`${s.x},${s.y}`]);
      const q: [number, number][] = [[s.x, s.y]];
      let reached = city.has(`${s.x},${s.y}`);
      while (q.length && !reached) {
        const [x, y] = q.pop()!;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${y + dy}`;
          if (!walkable(x + dx, y + dy) || seen.has(k)) continue;
          seen.add(k);
          if (city.has(k)) {
            reached = true;
            break;
          }
          q.push([x + dx, y + dy]);
        }
      }
      if (!reached) {
        failures++;
        console.error(`  FALHA ${tag}: spawn ${si + 1} sem caminho até o portão`);
      }
    }
    for (const m of z.defaultSetup.members) {
      if (!walkable(m.x, m.y)) {
        failures++;
        console.error(`  FALHA ${tag}: herói ${m.archetype} em tile bloqueado (${m.x},${m.y})`);
      }
    }
    for (const b of z.defaultSetup.barriers) {
      if (!walkable(b.x, b.y)) console.log(`  AVISO ${tag}: barreira em tile bloqueado (${b.x},${b.y})`);
    }
    for (const o of z.objects) {
      if (!walkable(o.x, o.y)) console.log(`  AVISO ${tag}: objeto ${o.type} sobre tile bloqueado (${o.x},${o.y})`);
    }
  } catch (e) {
    failures++;
    console.error(`  FALHA ${tag}: ${(e as Error).message}`);
  }
}
if (failures) throw new Error(`${failures} FALHA(S)`);
console.log('\nTodas as zonas navegáveis.');
