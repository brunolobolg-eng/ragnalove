// @ts-nocheck - mostra o entorno do portão de cada zona (descartável)
import '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
for (const [id, z] of Object.entries(ZONES)) {
  const rows = z.map;
  const gy = rows.findIndex((r) => r.includes('g'));
  if (gy < 0) continue;
  console.log(`== ${id} ${z.widthTiles}x${z.heightTiles} gate y=${gy}`);
  for (let y = Math.max(0, gy - 3); y <= gy; y++) {
    console.log(`  y${y}: col14-31 '${rows[y].slice(14, 32)}'`);
  }
  console.log(`  setup: ${JSON.stringify(z.defaultSetup.members)} barriers: ${JSON.stringify(z.defaultSetup.barriers.map((b) => [b.x, b.y]))}`);
  console.log(`  objects: ${z.objects.map((o) => `${o.type}(${o.x},${o.y}${o.w ? ` ${o.w}x${o.h}` : ''})`).join(' ')}`);
}
