import { GAME_CONFIG } from '../../config/gameConfig';
import { chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.sorcerer;

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
const cd = (unit: Unit, t: number) => Math.max(1, Math.round(t * (unit.stats?.cooldownMult ?? 1)));
const pw = (unit: Unit) => unit.stats?.classPower ?? 1;
const within = (unit: Unit, sim: Simulation, r: number) => sim.visibleEnemies().filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= r * sim.rangeMultFor(unit));
const face = (unit: Unit, t: { x: number; y: number }) => (unit.facing = { x: Math.sign(t.x - unit.x), y: Math.sign(t.y - unit.y) });

/** Meteoro: centro no grupo mais denso ao alcance (+ meteoros menores com a Chuva de Meteoros). */
function meteorStrike(unit: Unit, sim: Simulation, force: boolean): boolean {
  const sk = unit.stats?.skills;
  const M = CFG.meteor;
  if (!(force || ready(unit, sim, 'meteorStrike'))) return false;
  const cands = within(unit, sim, M.range)
    .map((e) => ({ e, n: sim.enemiesWithin(e, M.radius).length }))
    .sort((a, b) => b.n - a.n || a.e.id - b.e.id);
  if (!cands.length || cands[0].n < (force ? 1 : M.minTargets)) return false;
  const dmg = M.damage * SKILL_NUM.meteorStrike(Math.max(1, lvOf(sk, 'meteorStrike'))).dmgMult * pw(unit);
  const centers = [cands[0].e];
  const lvShower = lvOf(sk, 'meteorShower');
  if (lvShower) {
    const n = SKILL_NUM.meteorShower(lvShower);
    for (const c of cands.slice(1)) {
      if (centers.length > n.extra) break;
      if (centers.every((o) => chebyshev(o, c.e) > M.radius * 2)) centers.push(c.e);
    }
  }
  face(unit, centers[0]);
  sim.emit({ type: 'cast', unitId: unit.id, ability: 'meteorStrike' });
  centers.forEach((c, i) => {
    const at = { x: c.x, y: c.y };
    const k = i === 0 ? 1 : SKILL_NUM.meteorShower(lvOf(sk, 'meteorShower')).dmgMult;
    sim.emit({ type: 'meteor', unitId: unit.id, x: at.x, y: at.y, radius: M.radius });
    for (const e of sim.enemiesWithin(at, M.radius)) sim.damage(e, dmg * k, 'meteor', unit.id);
  });
  unit.cooldowns.meteorStrike = sim.tick + cd(unit, M.cooldownTicks);
  return true;
}

/** Corrente Elétrica: salta entre inimigos próximos. */
function chainLightning(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = force ? Math.max(1, lvOf(unit.stats?.skills, 'chainLightning')) : lvOf(unit.stats?.skills, 'chainLightning');
  if (!lv || !(force || ready(unit, sim, 'chainLightning'))) return false;
  const n = SKILL_NUM.chainLightning(lv);
  const visible = sim.visibleEnemies();
  const first = within(unit, sim, CFG.orb.range).filter((e) => sim.hasLineOfSight(unit, e)).sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id)[0];
  if (!first) return false;
  const hit: Unit[] = [first];
  while (hit.length < n.jumps) {
    const last = hit[hit.length - 1];
    const next = visible.filter((e) => !hit.includes(e) && chebyshev(e, last) <= 2).sort((a, b) => chebyshev(a, last) - chebyshev(b, last) || a.id - b.id)[0];
    if (!next) break;
    hit.push(next);
  }
  if (hit.length < (force ? 1 : 2)) return false;
  face(unit, first);
  sim.emit({ type: 'storm', unitId: unit.id, strikes: hit.map((e) => ({ x: e.x, y: e.y })) });
  for (const e of hit) sim.damage(e, n.damage * pw(unit), 'storm', unit.id);
  unit.cooldowns.chainLightning = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Orbe Arcano (ataque básico). */
function arcaneOrb(unit: Unit, sim: Simulation, force: boolean): boolean {
  if (!(force || ready(unit, sim, 'arcaneOrb'))) return false;
  const t = within(unit, sim, CFG.orb.range)
    .filter((e) => sim.hasLineOfSight(unit, e))
    .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y) || a.id - b.id)[0];
  if (!t) return false;
  face(unit, t);
  sim.emit({ type: 'bolt', unitId: unit.id, targetId: t.id, from: { x: unit.x, y: unit.y }, to: { x: t.x, y: t.y } });
  sim.damage(t, CFG.orb.damage * SKILL_NUM.arcaneOrb(Math.max(1, lvOf(unit.stats?.skills, 'arcaneOrb'))).dmgMult * pw(unit), 'arcane', unit.id);
  unit.cooldowns.arcaneOrb = sim.tick + cd(unit, CFG.orb.cooldownTicks);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'meteorStrike', cast: meteorStrike },
  { id: 'chainLightning', cast: chainLightning },
  { id: 'arcaneOrb', cast: arcaneOrb },
];

/**
 * Feiticeira: dano arcano à distância.
 * Prioridade: Meteoro (grupo denso) → Corrente Elétrica (2+ inimigos) → Orbe Arcano (mais próximo).
 */
export const sorcerer: Archetype = {
  id: 'sorcerer',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    if (meteorStrike(unit, sim, false)) return;
    if (chainLightning(unit, sim, false)) return;
    arcaneOrb(unit, sim, false);
  },
};
