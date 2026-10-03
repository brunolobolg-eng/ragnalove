import { GAME_CONFIG } from '../../config/gameConfig';
import { linePattern } from '../grid/patterns';
import { chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.mage;

/** Chave de recarga de cada barreira: fireBarrier, fireBarrier2, fireBarrier3. */
export const barrierKey = (i: number) => (i === 0 ? 'fireBarrier' : `fireBarrier${i + 1}`);

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
const lvl = (unit: Unit, id: Parameters<typeof lvOf>[1], force: boolean) => (force ? Math.max(1, lvOf(unit.stats?.skills, id)) : lvOf(unit.stats?.skills, id));
const cdOf = (unit: Unit, t: number) => Math.max(1, Math.round(t * (unit.stats?.cooldownMult ?? 1)));
const dm = (unit: Unit) => unit.stats?.skillDamageMult ?? 1;

/** Barreiras de Fogo: 3 linhas curtas, cada uma com sua recarga (uma conjuração por tick). */
function fireBarrier(unit: Unit, sim: Simulation, force: boolean): boolean {
  const s = unit.stats;
  for (let b = 0; b < sim.setup.barriers.length; b++) {
    const key = barrierKey(b);
    if (!(force || ready(unit, sim, key))) continue;
    const plan = sim.setup.barriers[b];
    const tiles = sim.board.clip(linePattern(plan, plan.orientation, s?.barrierLength ?? CFG.fireBarrier.length));
    if (tiles.length === 0) continue;
    sim.addEffect({ kind: 'fireBarrier', ownerId: unit.id, tiles, durationTicks: s?.barrierDurationTicks ?? CFG.fireBarrier.durationTicks, hostileTo: 'enemy' });
    unit.facing = { x: Math.sign(plan.x - unit.x), y: Math.sign(plan.y - unit.y) };
    unit.cooldowns[key] = sim.tick + (s?.barrierCooldownTicks ?? CFG.fireBarrier.cooldownTicks);
    sim.emit({ type: 'cast', unitId: unit.id, ability: key });
    return true;
  }
  return false;
}

/** Nova Congelante: inimigos colados ou 2+ por perto. */
function frostNova(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'frostNova', force);
  if (!lv || !(force || ready(unit, sim, 'frostNova'))) return false;
  const n = SKILL_NUM.frostNova(lv);
  const near = sim.enemiesWithin(unit, n.radius);
  if (!(near.length >= (force ? 1 : 2) || near.some((e) => chebyshev(e, unit) === 1))) return false;
  sim.emit({ type: 'nova', unitId: unit.id, x: unit.x, y: unit.y, radius: n.radius });
  for (const e of near) {
    sim.damage(e, n.damage * dm(unit), 'nova', unit.id);
    sim.freeze(e, n.freezeTicks);
  }
  unit.cooldowns.frostNova = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Tempestade Elétrica: raios nos congelados (ou no grupo mais denso). */
function thunderstorm(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'thunderstorm', force);
  if (!lv || !(force || ready(unit, sim, 'thunderstorm'))) return false;
  const n = SKILL_NUM.thunderstorm(lv);
  const all = sim.visibleEnemies();
  const min = force ? 1 : 3;
  let targets = all.filter((e) => sim.frozen(e));
  if (targets.length === 0 && all.length >= min) {
    const dens = all.map((e) => ({ e, c: all.filter((o) => chebyshev(o, e) <= 1).length })).sort((a, b) => b.c - a.c || a.e.id - b.e.id);
    if (dens[0].c >= min) targets = dens.slice(0, n.strikes).map((d) => d.e);
  }
  if (!targets.length) return false;
  targets = targets.slice(0, n.strikes);
  sim.emit({ type: 'storm', unitId: unit.id, strikes: targets.map((t) => ({ x: t.x, y: t.y })) });
  for (const t of targets) {
    const at = { x: t.x, y: t.y };
    sim.damage(t, n.damage * dm(unit), 'storm', unit.id);
    for (const o of sim.enemiesWithin(at, 1)) if (o !== t) sim.damage(o, n.damage * dm(unit) * 0.5, 'storm', unit.id);
  }
  unit.cooldowns.thunderstorm = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Raio Gélido à distância (ataque básico de alvo único). */
function frostBolt(unit: Unit, sim: Simulation, force: boolean): boolean {
  const s = unit.stats;
  if (!(force || ready(unit, sim, 'frostBolt'))) return false;
  const range = (s?.boltRange ?? CFG.frostBolt.range) * sim.rangeMultFor(unit);
  let target: Unit | undefined;
  let bestD = Infinity;
  for (const e of sim.visibleEnemies()) {
    const d = Math.hypot(e.x - unit.x, e.y - unit.y);
    if (d > range || d >= bestD) continue;
    if (!sim.hasLineOfSight(unit, e)) continue;
    target = e;
    bestD = d;
  }
  if (!target) return false;
  unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
  sim.emit({ type: 'bolt', unitId: unit.id, targetId: target.id, from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y } });
  sim.damage(target, s?.boltDamage ?? CFG.frostBolt.damage, 'bolt', unit.id);
  // Raio Gélido resfria: o alvo atrasa o próximo passo/ataque
  if (target.alive) target.nextActTick = Math.max(target.nextActTick, sim.tick) + CFG.frostBolt.chillTicks;
  unit.cooldowns.frostBolt = sim.tick + (s?.boltCooldownTicks ?? CFG.frostBolt.cooldownTicks);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'fireBarrier', cast: fireBarrier },
  { id: 'frostNova', cast: frostNova },
  { id: 'thunderstorm', cast: thunderstorm },
  { id: 'frostBolt', cast: frostBolt },
];

/**
 * Mago: controle de área + dano à distância.
 * Prioridade: 1) Barreira de Fogo (monta o funil) → Nova Congelante → Tempestade Elétrica →
 * 2) Raio Gélido no inimigo mais próximo dentro do alcance e com linha de visão.
 */
export const mage: Archetype = {
  id: 'mage',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    if (fireBarrier(unit, sim, false)) return;
    if (frostNova(unit, sim, false)) return;
    if (thunderstorm(unit, sim, false)) return;
    frostBolt(unit, sim, false);
  },
};
