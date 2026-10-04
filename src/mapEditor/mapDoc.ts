/**
 * Documento do editor de mapas: um ZoneDef editável + metadados.
 * O jogo carrega ZoneDef (applyZone/parseZone) — o editor nunca cria
 * formato isolado: salvar/exportar sempre deriva daqui para ZoneDef.
 */
import type { Vec2 } from '../core/grid/types';
import type { PartySetup } from '../config/gameConfig';
import type { MapObjectDef, WaveMix, ZoneDef, ZoneTheme } from '../config/zones';

export const MAP_VERSION = 1;

export interface MapDoc {
  mapVersion: number;
  id: string;
  name: string;
  theme: ZoneTheme;
  width: number;
  height: number;
  /** Uma string por linha (y = 0 em cima, como em zones.ts). */
  grid: string[];
  spawnPoints: [Vec2, Vec2];
  spawnSplit?: number;
  objects: MapObjectDef[];
  setup: PartySetup;
  wave: { count: number; spawnIntervalTicks: number; seed: number; mix: WaveMix[]; boss?: string; bossDelayTicks: number };
  /** Mapa pintado (arte do dono): preservado byte a byte no round-trip. */
  painted?: ZoneDef['painted'];
  /** Nome do arquivo (só editor, não vai para o jogo). */
  fileName?: string;
}

export function newMap(name: string, w: number, h: number, theme: ZoneTheme = 'forest'): MapDoc {
  const id = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'mapa_novo';
  return {
    mapVersion: MAP_VERSION,
    id,
    name,
    theme,
    width: w,
    height: h,
    grid: Array.from({ length: h }, () => '.'.repeat(w)),
    spawnPoints: [
      { x: 1, y: 1 },
      { x: w - 2, y: 1 },
    ],
    objects: [],
    setup: {
      members: [
        { archetype: 'warrior', x: Math.floor(w / 2) - 2, y: h - 4 },
        { archetype: 'mage', x: Math.floor(w / 2) + 2, y: h - 3 },
      ],
      barriers: [],
    },
    wave: { count: 40, spawnIntervalTicks: 20, seed: 1, mix: [{ kind: 'grunt', weight: 70 }, { kind: 'runner', weight: 30 }], bossDelayTicks: 0 },
  };
}

export function fromZoneDef(z: ZoneDef): MapDoc {
  return {
    mapVersion: MAP_VERSION,
    id: z.id,
    name: z.name,
    theme: z.theme,
    width: z.widthTiles,
    height: z.heightTiles,
    grid: [...z.map],
    spawnPoints: [{ ...z.spawnPoints[0] }, { ...z.spawnPoints[1] }],
    spawnSplit: z.spawnSplit,
    objects: z.objects.map((o) => ({ ...o })),
    setup: JSON.parse(JSON.stringify(z.defaultSetup)) as PartySetup,
    wave: JSON.parse(JSON.stringify(z.wave)) as MapDoc['wave'],
    ...(z.painted ? { painted: JSON.parse(JSON.stringify(z.painted)) as ZoneDef['painted'] } : {}),
  };
}

export function toZoneDef(d: MapDoc): ZoneDef {
  return {
    id: d.id,
    name: d.name,
    theme: d.theme,
    widthTiles: d.width,
    heightTiles: d.height,
    map: [...d.grid],
    spawnPoints: [{ ...d.spawnPoints[0] }, { ...d.spawnPoints[1] }],
    ...(d.spawnSplit !== undefined ? { spawnSplit: d.spawnSplit } : {}),
    objects: d.objects.map((o) => ({ ...o })),
    defaultSetup: JSON.parse(JSON.stringify(d.setup)) as PartySetup,
    wave: JSON.parse(JSON.stringify(d.wave)) as ZoneDef['wave'],
    ...(d.painted ? { painted: JSON.parse(JSON.stringify(d.painted)) as ZoneDef['painted'] } : {}),
  };
}

export function cloneDoc(d: MapDoc): MapDoc {
  return JSON.parse(JSON.stringify(d)) as MapDoc;
}

export const inBounds = (d: MapDoc, x: number, y: number): boolean => x >= 0 && y >= 0 && x < d.width && y < d.height;
export const getChar = (d: MapDoc, x: number, y: number): string => (inBounds(d, x, y) ? d.grid[y][x] : '');
export function setChar(d: MapDoc, x: number, y: number, ch: string): void {
  if (!inBounds(d, x, y)) return;
  const row = d.grid[y];
  d.grid[y] = row.slice(0, x) + ch + row.slice(x + 1);
}

/** Redimensiona sem destruir: preserva a área comum, preenche com '.' e prende objetos/spawns. */
export function resize(d: MapDoc, w: number, h: number): void {
  w = Math.max(5, Math.min(120, Math.round(w)));
  h = Math.max(5, Math.min(120, Math.round(h)));
  const grid: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) row += y < d.height && x < d.width ? d.grid[y][x] : '.';
    grid.push(row);
  }
  d.grid = grid;
  d.width = w;
  d.height = h;
  const clamp = (p: Vec2): Vec2 => ({ x: Math.max(0, Math.min(w - 1, p.x)), y: Math.max(0, Math.min(h - 1, p.y)) });
  d.spawnPoints = [clamp(d.spawnPoints[0]), clamp(d.spawnPoints[1])];
  d.objects = d.objects.filter((o) => o.x >= 0 && o.y >= 0 && o.x < w && o.y < h);
  for (const m of d.setup.members) {
    m.x = Math.max(0, Math.min(w - 1, m.x));
    m.y = Math.max(0, Math.min(h - 1, m.y));
  }
  d.setup.barriers = d.setup.barriers.filter((b) => b.x >= 0 && b.y >= 0 && b.x < w && b.y < h);
  if (d.setup.wall && (d.setup.wall.x < 0 || d.setup.wall.y < 0 || d.setup.wall.x >= w || d.setup.wall.y >= h)) delete d.setup.wall;
}

export function serialize(d: MapDoc): string {
  return JSON.stringify(d, null, 2);
}

export function deserialize(json: string): MapDoc {
  const d = JSON.parse(json) as MapDoc;
  if (typeof d !== 'object' || !d || !Array.isArray(d.grid)) throw new Error('Arquivo de mapa inválido.');
  if (d.mapVersion !== MAP_VERSION) throw new Error(`Versão do mapa ${d.mapVersion} não suportada (editor v${MAP_VERSION}).`);
  return d;
}
