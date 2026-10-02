import { GAME_CONFIG } from '../../config/gameConfig';
import { conePattern, linePattern } from '../grid/patterns';
import { DIRS8, chebyshev, type Vec2 } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

const CFG = GAME_CONFIG.archetypes.warrior;

const ready = (unit: Unit, sim: Simulation, k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
/** Nível da habilidade; CAST forçado usa pelo menos o nível 1. */
const lvl = (unit: Unit, id: Parameters<typeof lvOf>[1], force: boolean) => (force ? Math.max(1, lvOf(unit.stats?.skills, id)) : lvOf(unit.stats?.skills, id));
const cdOf = (unit: Unit, t: number) => Math.max(1, Math.round(t * (unit.stats?.cooldownMult ?? 1)));
/** Fúria ativa: recargas de Investida/Golpe mais curtas. */
const furyMult = (unit: Unit, sim: Simulation) => ((unit.furyUntil ?? 0) > sim.tick ? SKILL_NUM.fury(Math.max(1, lvOf(unit.stats?.skills, 'fury'))).cdMult : 1);

/** Muralha: ergue os blocos onde o jogador posicionou (não gasta a ação); volta depois da recarga. */
function shieldWall(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'shieldWall', force);
  if (!lv || !(force || ready(unit, sim, 'shieldWall')) || sim.wallsStanding() !== 0) return false;
  const n = SKILL_NUM.shieldWall(lv);
  const plan = sim.setup.wall ?? { x: unit.x, y: unit.y - 2, orientation: 'H' as const };
  const hp = n.hp + (unit.stats?.attrs.vit ?? 0) * CFG.shieldWall.hpPerVit;
  if (sim.raiseWall(unit.id, sim.board.clip(linePattern(plan, plan.orientation, n.length)), hp) <= 0) return false;
  unit.cooldowns.shieldWall = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Fúria: buff instantâneo quando a pressão aperta (não gasta a ação). */
function fury(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'fury', force);
  if (!lv || !(force || (ready(unit, sim, 'fury') && sim.enemiesWithin(unit, 2).length >= 3))) return false;
  const n = SKILL_NUM.fury(lv);
  unit.furyUntil = sim.tick + n.duration;
  unit.cooldowns.fury = sim.tick + cdOf(unit, n.cooldown);
  sim.emit({ type: 'fury', unitId: unit.id, ticks: n.duration });
  return true;
}

/** Onda de Choque: 3+ inimigos em volta. */
function shockwave(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'shockwave', force);
  if (!lv || !(force || ready(unit, sim, 'shockwave'))) return false;
  const n = SKILL_NUM.shockwave(lv);
  const near = sim.enemiesWithin(unit, n.radius);
  if (near.length < (force ? 1 : 3)) return false;
  sim.emit({ type: 'shockwave', unitId: unit.id, x: unit.x, y: unit.y, radius: n.radius });
  for (const e of near) {
    sim.damage(e, n.damage * (unit.stats?.skillDamageMult ?? 1), 'shock', unit.id);
    if (e.alive) sim.stun(e, n.stun);
  }
  unit.cooldowns.shockwave = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Provocar: campo de aggro — quem está em volta larga a cidade e vem atrás do Guerreiro. */
function taunt(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'taunt', force);
  if (!lv || !(force || ready(unit, sim, 'taunt'))) return false;
  const n = SKILL_NUM.taunt(lv);
  if (sim.tauntCandidates(unit, n.radius).length < (force ? 1 : GAME_CONFIG.aggro.taunt.minTargets)) return false;
  const hooked = sim.applyTaunt(unit, n.radius, n.duration, n.maxEnemies);
  for (const id of hooked) {
    const e = sim.units.get(id);
    if (e && chebyshev(e, unit) > 1) sim.pull(e, unit, n.pull);
  }
  sim.emit({ type: 'taunt', unitId: unit.id, radius: n.radius, pulled: hooked });
  unit.cooldowns.taunt = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Investida: golpe corpo a corpo no inimigo adjacente mais ferido (ataque básico de alvo único). */
function bash(unit: Unit, sim: Simulation, force: boolean): boolean {
  if (!(force || ready(unit, sim, 'bash'))) return false;
  let target: Unit | undefined;
  for (const e of sim.enemies()) {
    if (Math.max(Math.abs(e.x - unit.x), Math.abs(e.y - unit.y)) !== 1) continue;
    if (!target || e.hp < target.hp || (e.hp === target.hp && e.id < target.id)) target = e;
  }
  if (!target) return false;
  unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
  sim.emit({ type: 'bash', unitId: unit.id, targetId: target.id, x: target.x, y: target.y });
  sim.damage(target, unit.stats?.bashDamage ?? CFG.bash.damage, 'bash', unit.id);
  const bashCd = Math.max(1, Math.round((unit.stats?.bashCooldownTicks ?? CFG.bash.cooldownTicks) * furyMult(unit, sim)));
  unit.cooldowns.bash = sim.tick + bashCd;
  // mesmo braço, mesma arma: a Investida também atrasa o próximo Golpe em Área
  unit.cooldowns.cleave = Math.max(unit.cooldowns.cleave ?? 0, sim.tick + bashCd);
  return true;
}

/** Direção do cone do Golpe em Área que pega mais inimigos. */
function bestCone(unit: Unit, sim: Simulation): { dir: Vec2; hits: number; tiles: Vec2[] } {
  const range = unit.stats?.cleaveRange ?? CFG.cleave.range;
  const halfAngle = unit.stats?.cleaveHalfAngleDeg ?? CFG.cleave.halfAngleDeg;
  let best = { dir: unit.facing, hits: 0, tiles: [] as Vec2[] };
  for (const d of DIRS8) {
    const tiles = sim.board.clip(conePattern(unit, d, range, halfAngle));
    let hits = 0;
    for (const t of tiles) {
      const e = sim.unitAt(t.x, t.y);
      if (e && e.team === 'enemy') hits++;
    }
    if (hits > best.hits) best = { dir: d, hits, tiles };
  }
  return best;
}

/** Golpe em Área no cone escolhido (+ Golpe Estilhaçante). */
function cleaveCone(unit: Unit, sim: Simulation, best: { dir: Vec2; hits: number; tiles: Vec2[] }): void {
  const cooldown = Math.max(1, Math.round((unit.stats?.cleaveCooldownTicks ?? CFG.cleave.cooldownTicks) * furyMult(unit, sim)));
  const damage = unit.stats?.cleaveDamage ?? CFG.cleave.damage;
  const hitTiles: Vec2[] = [];
  for (const t of best.tiles) {
    const e = sim.unitAt(t.x, t.y);
    if (e && e.team === 'enemy') {
      hitTiles.push(t);
      sim.damage(e, damage, 'cleave', unit.id);
    }
  }
  // Golpe Estilhaçante: atordoa quem sobreviveu ao corte (sem empurrar)
  const lvShat = lvOf(unit.stats?.skills, 'shatter');
  if (lvShat) {
    const n = SKILL_NUM.shatter(lvShat);
    for (const t of hitTiles) {
      const e = sim.unitAt(t.x, t.y);
      if (e && e.alive && e.team === 'enemy' && sim.chance(n.chance)) sim.stun(e, n.stun);
    }
  }
  unit.cooldowns.cleave = sim.tick + cooldown;
  unit.cooldowns.bash = Math.max(unit.cooldowns.bash ?? 0, sim.tick + cooldown);
  sim.emit({ type: 'cleave', unitId: unit.id, facing: best.dir, tiles: best.tiles, hitTiles, hits: best.hits });
}

function cleave(unit: Unit, sim: Simulation, force: boolean): boolean {
  const best = bestCone(unit, sim);
  if (best.hits === 0 || !(force || ready(unit, sim, 'cleave'))) return false;
  unit.facing = best.dir;
  cleaveCone(unit, sim, best);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'shieldWall', cast: shieldWall },
  { id: 'fury', cast: fury },
  { id: 'shockwave', cast: shockwave },
  { id: 'taunt', cast: taunt },
  { id: 'bash', cast: bash },
  { id: 'cleave', cast: cleave },
];

/**
 * Guerreiro: segura a linha.
 * 1) Golpe em Área quando o cone pega 2+ inimigos (controle de grupo);
 * 2) senão Investida no inimigo adjacente mais ferido (ataque básico de alvo único);
 * 3) senão Golpe em Área mesmo com 1 alvo (alcance 2).
 */
export const warrior: Archetype = {
  id: 'warrior',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    shieldWall(unit, sim, false);
    fury(unit, sim, false);
    if (shockwave(unit, sim, false)) return;
    if (taunt(unit, sim, false)) return;
    const best = bestCone(unit, sim);
    if (best.hits > 0) unit.facing = best.dir;
    const cleaveReady = ready(unit, sim, 'cleave');
    if (!(cleaveReady && best.hits >= 2) && bash(unit, sim, false)) return;
    if (best.hits === 0 || !cleaveReady) return;
    cleaveCone(unit, sim, best);
  },
};
