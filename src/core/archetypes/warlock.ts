import { GAME_CONFIG } from '../../config/gameConfig';
import { chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.warlock;

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
const cd = (unit: Unit, t: number) => Math.max(1, Math.round(t * (unit.stats?.cooldownMult ?? 1)));
const pw = (unit: Unit) => unit.stats?.classPower ?? 1;
const within = (unit: Unit, sim: Simulation, r: number) => sim.visibleEnemies().filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= r * sim.rangeMultFor(unit));
const face = (unit: Unit, t: { x: number; y: number }) => (unit.facing = { x: Math.sign(t.x - unit.x), y: Math.sign(t.y - unit.y) });

/** Maldição: grupo ainda não amaldiçoado. */
function curse(unit: Unit, sim: Simulation, force: boolean): boolean {
  const C = CFG.curse;
  if (!(force || ready(unit, sim, 'curse'))) return false;
  const n = SKILL_NUM.curse(Math.max(1, lvOf(unit.stats?.skills, 'curse')));
  const best = within(unit, sim, C.range)
    .map((e) => ({ e, g: sim.enemiesWithin(e, C.radius).filter((o) => (o.cursedUntil ?? 0) <= sim.tick) }))
    .sort((a, b) => b.g.length - a.g.length || a.e.id - b.e.id)[0];
  if (!best || best.g.length < (force ? 1 : C.minTargets)) return false;
  face(unit, best.e);
  sim.emit({ type: 'curse', unitId: unit.id, x: best.e.x, y: best.e.y, radius: C.radius });
  for (const e of best.g) {
    sim.curse(e, n.amp, C.durationTicks);
    sim.addDot(e, C.damage * n.dmgMult * pw(unit), C.durationTicks, 'curse', unit.id);
  }
  unit.cooldowns.curse = sim.tick + cd(unit, C.cooldownTicks);
  return true;
}

/** Enxame de Sombras: dano contínuo nos mais próximos. */
function shadowSwarm(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = force ? Math.max(1, lvOf(unit.stats?.skills, 'shadowSwarm')) : lvOf(unit.stats?.skills, 'shadowSwarm');
  if (!lv || !(force || ready(unit, sim, 'shadowSwarm'))) return false;
  const n = SKILL_NUM.shadowSwarm(lv);
  const ts = within(unit, sim, CFG.curse.range)
    .sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id)
    .slice(0, n.targets);
  if (ts.length < (force ? 1 : 2)) return false;
  face(unit, ts[0]);
  sim.emit({ type: 'cast', unitId: unit.id, ability: 'shadowSwarm' });
  const perPulse = (n.dot * GAME_CONFIG.dot.intervalTicks) / GAME_CONFIG.sim.tickRate;
  for (const e of ts) sim.addDot(e, perPulse * pw(unit), n.ticks, 'shadow', unit.id);
  unit.cooldowns.shadowSwarm = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Dreno de Vida (ataque básico): cura a Bruxa. */
function lifeDrain(unit: Unit, sim: Simulation, force: boolean): boolean {
  if (!(force || ready(unit, sim, 'lifeDrain'))) return false;
  const D = CFG.drain;
  const t = within(unit, sim, D.range)
    .filter((e) => sim.hasLineOfSight(unit, e))
    .sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id)[0];
  if (!t) return false;
  const n = SKILL_NUM.lifeDrain(Math.max(1, lvOf(unit.stats?.skills, 'lifeDrain')));
  face(unit, t);
  sim.emit({ type: 'shadowBolt', unitId: unit.id, targetId: t.id, from: { x: unit.x, y: unit.y }, to: { x: t.x, y: t.y } });
  const dmg = D.damage * n.dmgMult * pw(unit);
  sim.damage(t, dmg, 'shadow', unit.id);
  sim.heal(unit, dmg * n.heal);
  unit.cooldowns.lifeDrain = sim.tick + cd(unit, D.cooldownTicks);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'curse', cast: curse },
  { id: 'shadowSwarm', cast: shadowSwarm },
  { id: 'lifeDrain', cast: lifeDrain },
];

/**
 * Bruxa: maldições e dreno de vida.
 * Prioridade: Maldição (grupo) → Enxame de Sombras (vários alvos) → Dreno de Vida (mais próximo, cura).
 */
export const warlock: Archetype = {
  id: 'warlock',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    if (curse(unit, sim, false)) return;
    if (shadowSwarm(unit, sim, false)) return;
    lifeDrain(unit, sim, false);
  },
};
