import { GAME_CONFIG } from '../../config/gameConfig';
import { conePattern } from '../grid/patterns';
import { DIRS8, chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.assassin;

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
const cd = (unit: Unit, t: number) => Math.max(1, Math.round(t * (unit.stats?.cooldownMult ?? 1)));
const pw = (unit: Unit) => unit.stats?.classPower ?? 1;
const critOf = (unit: Unit) => Math.min(0.9, (unit.stats?.crit ?? 0) + CFG.backstab.critBonus);

/** Lâminas Envenenadas: veneno em quem foi atingido. */
function poison(unit: Unit, sim: Simulation, e: Unit): void {
  const lvPoison = lvOf(unit.stats?.skills, 'poisonBlades');
  if (!lvPoison || !e.alive) return;
  const n = SKILL_NUM.poisonBlades(lvPoison);
  sim.addDot(e, ((n.dot * GAME_CONFIG.dot.intervalTicks) / GAME_CONFIG.sim.tickRate) * pw(unit), n.ticks, 'poison', unit.id);
}

/** Execução: finaliza um inimigo comum com pouca vida (CAST forçado ignora o limite de vida). */
function execute(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = force ? Math.max(1, lvOf(unit.stats?.skills, 'execute')) : lvOf(unit.stats?.skills, 'execute');
  if (!lv || !(force || ready(unit, sim, 'execute'))) return false;
  const n = SKILL_NUM.execute(lv);
  const t = sim
    .enemiesWithin(unit, n.range)
    .filter((e) => !GAME_CONFIG.bossKinds.includes(e.kind) && (force || e.hp / e.maxHp <= n.threshold))
    .sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
  if (!t) return false;
  unit.facing = { x: Math.sign(t.x - unit.x), y: Math.sign(t.y - unit.y) };
  sim.emit({ type: 'execute', unitId: unit.id, targetId: t.id, x: t.x, y: t.y });
  sim.damage(t, t.hp, 'execute', unit.id);
  unit.cooldowns.execute = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Leque de Lâminas: cone curto na direção com mais inimigos. */
function bladeFan(unit: Unit, sim: Simulation, force: boolean): boolean {
  const F = CFG.fan;
  if (!(force || ready(unit, sim, 'bladeFan'))) return false;
  let best = { hits: 0, d: unit.facing, tiles: [] as { x: number; y: number }[] };
  for (const d of DIRS8) {
    const tiles = sim.board.clip(conePattern(unit, d, F.range, F.halfAngleDeg));
    const hits = tiles.filter((t) => sim.unitAt(t.x, t.y)?.team === 'enemy').length;
    if (hits > best.hits) best = { hits, d, tiles };
  }
  if (best.hits < (force ? 1 : F.minTargets)) return false;
  unit.facing = best.d;
  const crit = critOf(unit);
  const dmg = F.damage * SKILL_NUM.bladeFan(Math.max(1, lvOf(unit.stats?.skills, 'bladeFan'))).dmgMult * pw(unit);
  const hitTiles: { x: number; y: number }[] = [];
  for (const t of best.tiles) {
    const e = sim.unitAt(t.x, t.y);
    if (!e || e.team !== 'enemy') continue;
    hitTiles.push(t);
    const c = sim.chance(crit);
    sim.damage(e, dmg * (c ? unit.stats?.critDamage ?? 1.5 : 1), 'blade', unit.id, c);
    poison(unit, sim, e);
  }
  sim.emit({ type: 'cleave', unitId: unit.id, facing: best.d, tiles: best.tiles, hitTiles, hits: best.hits });
  unit.cooldowns.bladeFan = sim.tick + cd(unit, F.cooldownTicks);
  return true;
}

/** Golpe Furtivo (ataque básico): adjacente mais ferido. */
function backstab(unit: Unit, sim: Simulation, force: boolean): boolean {
  if (!(force || ready(unit, sim, 'backstab'))) return false;
  let target: Unit | undefined;
  for (const e of sim.enemies()) {
    if (chebyshev(e, unit) !== 1) continue;
    if (!target || e.hp < target.hp || (e.hp === target.hp && e.id < target.id)) target = e;
  }
  if (!target) return false;
  unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
  const isCrit = sim.chance(critOf(unit));
  sim.emit({ type: 'bash', unitId: unit.id, targetId: target.id, x: target.x, y: target.y, crit: isCrit });
  sim.damage(target, CFG.backstab.damage * SKILL_NUM.backstab(Math.max(1, lvOf(unit.stats?.skills, 'backstab'))).dmgMult * pw(unit) * (isCrit ? unit.stats?.critDamage ?? 1.5 : 1), 'blade', unit.id, isCrit);
  poison(unit, sim, target);
  unit.cooldowns.backstab = sim.tick + cd(unit, CFG.backstab.cooldownTicks);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'execute', cast: execute },
  { id: 'bladeFan', cast: bladeFan },
  { id: 'backstab', cast: backstab },
];

/**
 * Assassino: corpo a corpo letal.
 * Cada uma dispara quando fica pronta (sem prioridade entre elas): Execução (inimigo fraco perto) → Leque de Lâminas (2+ no cone) → Golpe Furtivo (adjacente).
 */
export const assassin: Archetype = {
  id: 'assassin',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    // cada habilidade pronta dispara no seu tick, sem prioridade entre elas
    execute(unit, sim, false);
    bladeFan(unit, sim, false);
    backstab(unit, sim, false);
  },
};
