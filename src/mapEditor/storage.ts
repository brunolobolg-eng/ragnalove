/**
 * Arquivos do editor: download/upload (funciona offline no navegador
 * e no Electron, sem IPC novo). JSON versionado para o Git; TS para o jogo.
 */
import { serialize, toZoneDef, type MapDoc } from './mapDoc';

function download(name: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function saveJson(d: MapDoc): void {
  const name = (d.fileName ?? `${d.id}.zone`) + '.json';
  d.fileName = name.replace(/\.json$/, '');
  download(name, serialize(d), 'application/json');
}

export function openJsonFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) {
        reject(new Error('Nenhum arquivo.'));
        return;
      }
      const r = new FileReader();
      r.onload = () => resolve(String(r.result ?? ''));
      r.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
      r.readAsText(f);
    };
    input.click();
  });
}

/** Literal TypeScript do ZoneDef, pronto para colar em ZONES (zones.ts). */
export function zoneDefTs(d: MapDoc): string {
  const z = toZoneDef(d);
  const q = (s: string): string => JSON.stringify(s);
  const lines: string[] = [];
  lines.push(`  ${z.id}: {`);
  lines.push(`    id: ${q(z.id)},`);
  lines.push(`    name: ${q(z.name)},`);
  lines.push(`    theme: ${q(z.theme)},`);
  lines.push(`    widthTiles: ${z.widthTiles},`);
  lines.push(`    heightTiles: ${z.heightTiles},`);
  lines.push(`    map: [`);
  for (const row of z.map) lines.push(`      ${q(row)},`);
  lines.push(`    ],`);
  lines.push(`    spawnPoints: [{ x: ${z.spawnPoints[0].x}, y: ${z.spawnPoints[0].y} }, { x: ${z.spawnPoints[1].x}, y: ${z.spawnPoints[1].y} }],`);
  if (z.spawnSplit !== undefined) lines.push(`    spawnSplit: ${z.spawnSplit},`);
  lines.push(`    objects: [${z.objects.map((o) => `{ type: ${q(o.type)}, x: ${o.x}, y: ${o.y}${o.w !== undefined ? `, w: ${o.w}` : ''}${o.h !== undefined ? `, h: ${o.h}` : ''} }`).join(', ')}],`);
  lines.push(`    defaultSetup: {`);
  lines.push(`      members: [${z.defaultSetup.members.map((m) => `{ archetype: ${q(m.archetype)}, x: ${m.x}, y: ${m.y} }`).join(', ')}],`);
  lines.push(`      barriers: [${z.defaultSetup.barriers.map((b) => `{ x: ${b.x}, y: ${b.y}, orientation: ${q(b.orientation)} }`).join(', ')}],`);
  if (z.defaultSetup.wall) lines.push(`      wall: { x: ${z.defaultSetup.wall.x}, y: ${z.defaultSetup.wall.y}, orientation: ${q(z.defaultSetup.wall.orientation)} },`);
  lines.push(`    },`);
  lines.push(`    wave: { count: ${z.wave.count}, spawnIntervalTicks: ${z.wave.spawnIntervalTicks}, seed: ${z.wave.seed}, mix: [${z.wave.mix.map((m) => `{ kind: ${q(m.kind)}, weight: ${m.weight} }`).join(', ')}]${z.wave.boss ? `, boss: ${q(z.wave.boss)}` : ''}, bossDelayTicks: ${z.wave.bossDelayTicks} },`);
  lines.push(`  },`);
  return lines.join('\n');
}

export function exportTs(d: MapDoc): void {
  download(`${d.id}.zone.ts.txt`, `// Cole em ZONES (src/config/zones.ts)\n${zoneDefTs(d)}\n`, 'text/plain');
}
