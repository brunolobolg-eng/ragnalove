/**
 * Arena de Skills: mapa de teste + agregação de dano. Sem DOM aqui (este módulo é
 * importável em teste headless); a aba visual mora em SkillArena.ts.
 *
 * O mapa NÃO entra em ZONES (campanha nunca o vê): o Dev Lab o aplica direto.
 */
import type { DamageSource } from '../../core/sim/types';
import type { ZoneDef } from '../../config/zones';

export const TEST_ZONE_ID = 'testArena';

/** Sala aberta 40×30 com 4 pilares (testar movimento e posicionamento de área). */
function buildMap(): string[] {
  const W = 40;
  const H = 30;
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) row += x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 'R' : '.';
    rows.push(row);
  }
  const block = (x0: number, y0: number, w: number, h: number) => {
    for (let y = y0; y < y0 + h; y++) rows[y] = rows[y].slice(0, x0) + 'U'.repeat(w) + rows[y].slice(x0 + w);
  };
  block(10, 8, 2, 4);
  block(28, 8, 2, 4);
  block(10, 19, 2, 4);
  block(28, 19, 2, 4);
  return rows;
}

export const TEST_ZONE: ZoneDef = {
  id: TEST_ZONE_ID,
  name: 'Arena de Teste',
  theme: 'plains',
  widthTiles: 40,
  heightTiles: 30,
  map: buildMap(),
  spawnPoints: [{ x: 2, y: 2 }, { x: 37, y: 2 }],
  objects: [],
  defaultSetup: {
    members: [
      { archetype: 'warrior', x: 19, y: 24 },
      { archetype: 'mage', x: 21, y: 24 },
    ],
    barriers: [{ x: 18, y: 24, orientation: 'H' }, { x: 21, y: 24, orientation: 'H' }, { x: 19, y: 21, orientation: 'H' }],
  },
  // onda vazia: a arena só tem o que o testador spawnar; sem chefe a onda nunca "termina" sozinha
  wave: { count: 0, spawnIntervalTicks: 5, seed: 4242, mix: [{ kind: 'grunt', weight: 1 }], bossDelayTicks: 0 },
};

/** Nome pt-BR de cada fonte de dano (comparação de skills). */
export const SOURCE_LABEL: Record<DamageSource, string> = {
  enchant: 'Lâmina Encantada',
  wave: 'Onda Sônica',
  spear: 'Cem Lanças',
  wind: 'Cortador de Vento',
  reflect: 'Limite da Morte (devolvido)',
  burn: 'Queimadura',
  cleave: 'Golpe em Área',
  melee: 'Corpo a corpo',
  bolt: 'Projéteis',
  bash: 'Investida',
  debug: 'Debug',
  nova: 'Nova',
  storm: 'Tempestade',
  shock: 'Onda de choque',
  combust: 'Combustão',
  arrow: 'Flecha',
  rain: 'Chuva',
  pierce: 'Perfurante',
  spell: 'Magia',
  meteor: 'Meteoro',
  oil: 'Óleo',
  ruin: 'Ruína',
  trap: 'Armadilha',
  arcane: 'Arcano',
  shadow: 'Sombra',
  blade: 'Lâmina',
  poison: 'Veneno',
  curse: 'Maldição',
  execute: 'Execução',
};

/** Um golpe registrado pelo tap de eventos da simulação (dano real, sem cálculo paralelo). */
export interface HitSample {
  tick: number;
  hero: string;
  source: DamageSource;
  amount: number;
  crit: boolean;
  target: number;
  targetKind: string;
}

export interface GroupStat {
  hero: string;
  source: DamageSource;
  count: number;
  total: number;
  avg: number;
  max: number;
  crits: number;
  /** Dano por segundo na janela (padrão: últimos 100 ticks = 10 s). */
  dps: number;
}

export interface TargetStat {
  id: number;
  kind: string;
  count: number;
  total: number;
}

/** Agrega os golpes: por (herói, fonte) para comparar skills, e por alvo para multi-boneco. */
export function summarizeHits(hits: HitSample[], nowTick: number, dpsWindow = 100): { groups: GroupStat[]; targets: TargetStat[]; total: number } {
  const g = new Map<string, GroupStat & { sumWin: number }>();
  const t = new Map<number, TargetStat>();
  let total = 0;
  for (const h of hits) {
    total += h.amount;
    const k = `${h.hero}|${h.source}`;
    let e = g.get(k);
    if (!e) {
      e = { hero: h.hero, source: h.source, count: 0, total: 0, avg: 0, max: 0, crits: 0, dps: 0, sumWin: 0 };
      g.set(k, e);
    }
    e.count++;
    e.total += h.amount;
    if (h.amount > e.max) e.max = h.amount;
    if (h.crit) e.crits++;
    if (h.tick > nowTick - dpsWindow) e.sumWin += h.amount;
    let te = t.get(h.target);
    if (!te) {
      te = { id: h.target, kind: h.targetKind, count: 0, total: 0 };
      t.set(h.target, te);
    }
    te.count++;
    te.total += h.amount;
  }
  const groups = [...g.values()]
    .map((e) => ({ hero: e.hero, source: e.source, count: e.count, total: e.total, avg: e.total / Math.max(1, e.count), max: e.max, crits: e.crits, dps: e.sumWin / (dpsWindow / 10) }))
    .sort((a, b) => b.total - a.total);
  const targets = [...t.values()].sort((a, b) => b.total - a.total);
  return { groups, targets, total };
}
