import { GAME_CONFIG } from '../../config/gameConfig';
import { chebyshev, DIRS8, type Vec2 } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.archer;

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
const lvl = (unit: Unit, id: Parameters<typeof lvOf>[1], force: boolean) => (force ? Math.max(1, lvOf(unit.stats?.skills, id)) : lvOf(unit.stats?.skills, id));
const cdm = (unit: Unit) => unit.stats?.cooldownMult ?? 1;
const dm = (unit: Unit) => unit.stats?.skillDamageMult ?? 1;
/** Inimigos visíveis ao alcance da Flecha. */
const inRange = (unit: Unit, sim: Simulation) => {
  const range = (unit.stats?.arrowRange ?? CFG.arrow.range) * sim.rangeMultFor(unit);
  return sim.visibleEnemies().filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= range);
};
/** Foco do Caçador ativo: recargas mais curtas. */
const cd = (unit: Unit, sim: Simulation, t: number) => {
  const haste = (unit.furyUntil ?? 0) > sim.tick ? SKILL_NUM.hunterFocus(Math.max(1, lvOf(unit.stats?.skills, 'hunterFocus'))).cdMult : 1;
  return Math.max(1, Math.round(t * haste));
};

/** Foco do Caçador: buff instantâneo (não gasta a ação). */
function hunterFocus(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'hunterFocus', force);
  if (!lv || !(force || (ready(unit, sim, 'hunterFocus') && inRange(unit, sim).length >= 4))) return false;
  const n = SKILL_NUM.hunterFocus(lv);
  unit.furyUntil = sim.tick + n.duration;
  unit.cooldowns.hunterFocus = sim.tick + Math.max(1, Math.round(n.cooldown * cdm(unit)));
  sim.emit({ type: 'focus', unitId: unit.id, ticks: n.duration });
  return true;
}

/** Armadilha: arma no caminho do inimigo mais adiantado (o mais perto do portão) ao alcance. */
function snareTrap(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'snareTrap', force);
  const list = inRange(unit, sim);
  if (!lv || !(force || ready(unit, sim, 'snareTrap')) || !list.length) return false;
  const n = SKILL_NUM.snareTrap(lv);
  const mine = sim.traps.filter((t) => t.ownerId === unit.id).length;
  if (mine >= n.maxTraps) return false;
  const lead = [...list].sort((a, b) => sim.flowCost(a.x, a.y) - sim.flowCost(b.x, b.y) || a.id - b.id);
  for (const e of lead) {
    const at = sim.pathAhead(e, CFG.trap.ahead);
    if (!at || Math.hypot(at.x - unit.x, at.y - unit.y) > CFG.trap.range) continue;
    if (sim.placeTrap(unit.id, at, n.damage * dm(unit), n.slowTicks, n.slowMult)) {
      unit.facing = { x: Math.sign(at.x - unit.x), y: Math.sign(at.y - unit.y) };
      sim.emit({ type: 'cast', unitId: unit.id, ability: 'snareTrap' });
      unit.cooldowns.snareTrap = sim.tick + Math.max(1, Math.round(n.cooldown * cdm(unit)));
      return true;
    }
  }
  return false;
}

/** Flecha Perfurante: direção com mais inimigos em linha. */
function piercing(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'piercing', force);
  if (!lv || !(force || ready(unit, sim, 'piercing'))) return false;
  const range = (unit.stats?.arrowRange ?? CFG.arrow.range) * sim.rangeMultFor(unit);
  const min = force ? 1 : 2;
  let best: { d: Vec2; hits: Unit[]; end: Vec2 } | undefined;
  for (const d of DIRS8) {
    const hits: Unit[] = [];
    let end = { x: unit.x, y: unit.y };
    for (let i = 1; i <= Math.floor(range); i++) {
      const x = unit.x + d.x * i;
      const y = unit.y + d.y * i;
      if (!sim.board.inBounds(x, y) || sim.board.blocksSight(x, y)) break;
      end = { x, y };
      const u = sim.unitAt(x, y);
      if (u && u.team === 'enemy') hits.push(u);
    }
    if (hits.length >= min && (!best || hits.length > best.hits.length)) best = { d, hits, end };
  }
  if (!best) return false;
  const n = SKILL_NUM.piercing(lv);
  unit.facing = best.d;
  sim.emit({ type: 'pierce', unitId: unit.id, from: { x: unit.x, y: unit.y }, to: best.end });
  for (const e of best.hits) sim.damage(e, n.damage * dm(unit), 'pierce', unit.id);
  unit.cooldowns.piercing = sim.tick + cd(unit, sim, Math.round(n.cooldown * cdm(unit)));
  return true;
}

/** Chuva de Flechas: centro no grupo mais denso ao alcance. */
function arrowRain(unit: Unit, sim: Simulation, force: boolean): boolean {
  const s = unit.stats;
  const list = inRange(unit, sim);
  if (!(force || ready(unit, sim, 'arrowRain')) || !list.length) return false;
  const rad = s?.rainRadius ?? CFG.rain.radius;
  let best: { c: Unit; n: number } | undefined;
  for (const e of list) {
    const n = sim.enemiesWithin(e, rad).length;
    if (!best || n > best.n || (n === best.n && e.id < best.c.id)) best = { c: e, n };
  }
  if (!best || best.n < (force ? 1 : CFG.rain.minTargets)) return false;
  const c = { x: best.c.x, y: best.c.y };
  unit.facing = { x: Math.sign(c.x - unit.x), y: Math.sign(c.y - unit.y) };
  sim.emit({ type: 'rain', unitId: unit.id, x: c.x, y: c.y, radius: rad });
  for (const e of sim.enemiesWithin(c, rad)) sim.damage(e, s?.rainDamage ?? CFG.rain.damage, 'rain', unit.id);
  const lvFire = lvOf(s?.skills, 'fireRain');
  if (lvFire) {
    const tiles: Vec2[] = [];
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (sim.board.isWalkable(c.x + dx, c.y + dy)) tiles.push({ x: c.x + dx, y: c.y + dy });
    if (tiles.length) sim.addEffect({ kind: 'fireBarrier', ownerId: unit.id, tiles, durationTicks: SKILL_NUM.fireRain(lvFire).burnTicks, hostileTo: 'enemy' });
  }
  unit.cooldowns.arrowRain = sim.tick + cd(unit, sim, s?.rainCooldownTicks ?? CFG.rain.cooldownTicks);
  return true;
}

/** Flecha Precisa (ataque básico de alvo único). */
function preciseShot(unit: Unit, sim: Simulation, force: boolean): boolean {
  const s = unit.stats;
  if (!(force || ready(unit, sim, 'preciseShot'))) return false;
  const targets = inRange(unit, sim)
    .filter((e) => sim.hasLineOfSight(unit, e))
    .sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id);
  if (!targets.length) return false;
  const shoot = (t: Unit) => {
    const crit = sim.chance(s?.crit ?? 0);
    sim.emit({ type: 'arrow', unitId: unit.id, targetId: t.id, from: { x: unit.x, y: unit.y }, to: { x: t.x, y: t.y }, crit });
    sim.damage(t, (s?.arrowDamage ?? CFG.arrow.damage) * (crit ? s?.critDamage ?? 1.5 : 1), 'arrow', unit.id, crit);
  };
  const t0 = targets[0];
  unit.facing = { x: Math.sign(t0.x - unit.x), y: Math.sign(t0.y - unit.y) };
  shoot(t0);
  const lvDouble = lvOf(s?.skills, 'doubleShot');
  if (lvDouble && targets.length > 1 && sim.chance(SKILL_NUM.doubleShot(lvDouble).chance)) shoot(targets[1]);
  unit.cooldowns.preciseShot = sim.tick + cd(unit, sim, s?.arrowCooldownTicks ?? CFG.arrow.cooldownTicks);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'hunterFocus', cast: hunterFocus },
  { id: 'snareTrap', cast: snareTrap },
  { id: 'piercing', cast: piercing },
  { id: 'arrowRain', cast: arrowRain },
  { id: 'preciseShot', cast: preciseShot },
];

/**
 * Arqueira: dano à distância.
 * Prioridade: Foco do Caçador (pressão) → Armadilha → Flecha Perfurante (2+ em linha) →
 * Chuva de Flechas (grupo denso) → Flecha Precisa (mais próximo com linha de visão).
 */
export const archer: Archetype = {
  id: 'archer',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    hunterFocus(unit, sim, false);
    if (snareTrap(unit, sim, false)) return;
    if (piercing(unit, sim, false)) return;
    if (arrowRain(unit, sim, false)) return;
    preciseShot(unit, sim, false);
  },
};
