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

/* ---------------- Cavaleiro Rúnico (conjunto de teste; ver RUNIC_SKILLS em skills.ts) ---------------- */

/** Lâmina Encantada: liga a magia na arma quando há inimigo perto. Não gasta a ação. */
function enchantBlade(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'enchantBlade', force);
  if (!lv || !(force || ready(unit, sim, 'enchantBlade'))) return false;
  const n = SKILL_NUM.enchantBlade(lv);
  if (!force && sim.enemiesWithin(unit, n.range).length === 0) return false;
  unit.enchantUntil = sim.tick + n.ticks;
  unit.cooldowns.enchantBlade = sim.tick + cdOf(unit, n.cooldown);
  sim.emit({ type: 'enchantBlade', unitId: unit.id, ticks: n.ticks });
  return true;
}

/** Dano mágico extra de cada golpe corpo a corpo (Investida e Golpe em Área) enquanto a Lâmina Encantada dura. */
function enchantHit(unit: Unit, sim: Simulation, target: Unit): void {
  const lv = lvOf(unit.stats?.skills, 'enchantBlade');
  if (!lv || (unit.enchantUntil ?? 0) <= sim.tick) return;
  sim.damage(target, SKILL_NUM.enchantBlade(lv).bonus * (unit.stats?.skillDamageMult ?? 1), 'enchant', unit.id);
}

/** Onda Sônica: dano à distância no inimigo mais perto do alcance (2 a 5 casas, sem linha de visão). */
function sonicWave(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'sonicWave', force);
  if (!lv || !(force || ready(unit, sim, 'sonicWave'))) return false;
  const n = SKILL_NUM.sonicWave(lv);
  let target: Unit | undefined;
  for (const e of sim.enemies()) {
    const d = chebyshev(e, unit);
    if (d > n.range || (!force && d < 2)) continue; // colado: fica para o golpe corpo a corpo
    if (!target || d < chebyshev(target, unit) || (d === chebyshev(target, unit) && e.id < target.id)) target = e;
  }
  if (!target) return false;
  const from = { x: unit.x, y: unit.y };
  unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
  sim.emit({ type: 'sonicWave', unitId: unit.id, targetId: target.id, fromX: from.x, fromY: from.y, x: target.x, y: target.y });
  sim.damage(target, n.damage * (unit.stats?.skillDamageMult ?? 1), 'wave', unit.id);
  unit.cooldowns.sonicWave = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Limite da Morte: marca o inimigo mais forte ao alcance (nunca chefe). Não gasta a ação. */
function deathBound(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'deathBound', force);
  if (!lv || !(force || ready(unit, sim, 'deathBound'))) return false;
  const n = SKILL_NUM.deathBound(lv);
  let target: Unit | undefined;
  for (const e of sim.enemies()) {
    if (GAME_CONFIG.bossKinds.includes(e.kind) || (e.markedUntil ?? 0) > sim.tick || chebyshev(e, unit) > n.range) continue;
    if (!target || e.hp > target.hp || (e.hp === target.hp && e.id < target.id)) target = e;
  }
  if (!target) return false;
  sim.mark(target, n.amp, n.reflect, n.ticks);
  sim.emit({ type: 'deathBound', unitId: unit.id, targetId: target.id, x: target.x, y: target.y, ticks: n.ticks });
  unit.cooldowns.deathBound = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Cem Lanças (só com lança): golpes em sequência no inimigo com mais inimigos em volta e nos vizinhos dele. */
function hundredSpear(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'hundredSpear', force);
  if (!lv || !(force || ready(unit, sim, 'hundredSpear')) || unit.stats?.weapon !== 'spear') return false;
  const n = SKILL_NUM.hundredSpear(lv);
  let best: { t: Unit; around: Unit[] } | undefined;
  for (const e of sim.enemies()) {
    if (chebyshev(e, unit) > n.range) continue;
    const around = sim.enemiesWithin(e, n.radius);
    if (!best || around.length > best.around.length || (around.length === best.around.length && e.id < best.t.id)) best = { t: e, around };
  }
  if (!best) return false;
  // "Base Level": o golpe cresce com o nível do herói (+2% por nível acima do 1º)
  const dmg = n.damage * (unit.stats?.skillDamageMult ?? 1) * (1 + 0.02 * (unit.level - 1));
  unit.facing = { x: Math.sign(best.t.x - unit.x), y: Math.sign(best.t.y - unit.y) };
  sim.emit({ type: 'hundredSpear', unitId: unit.id, targetId: best.t.id, x: best.t.x, y: best.t.y, hits: n.hits, radius: n.radius, tiles: best.around.map((e) => ({ x: e.x, y: e.y })) });
  for (let i = 0; i < n.hits; i++) for (const e of best.around) sim.damage(e, dmg, 'spear', unit.id);
  unit.cooldowns.hundredSpear = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Cortador de Vento: giro que atinge os inimigos em volta (com lança, a pressão alcança mais longe). */
function windCutter(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'windCutter', force);
  if (!lv || !(force || ready(unit, sim, 'windCutter'))) return false;
  const n = SKILL_NUM.windCutter(lv);
  const reach = unit.stats?.weapon === 'spear' ? n.spearRadius : n.radius;
  const near = sim.enemiesWithin(unit, reach);
  if (near.length < (force ? 1 : 2)) return false;
  sim.emit({ type: 'windCutter', unitId: unit.id, x: unit.x, y: unit.y, radius: reach, tiles: near.map((e) => ({ x: e.x, y: e.y })), hits: near.length });
  for (const e of near) sim.damage(e, n.damage * (unit.stats?.skillDamageMult ?? 1), 'wind', unit.id);
  unit.cooldowns.windCutter = sim.tick + cdOf(unit, n.cooldown);
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
  enchantHit(unit, sim, target);
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
      enchantHit(unit, sim, e);
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
  { id: 'enchantBlade', cast: enchantBlade },
  { id: 'sonicWave', cast: sonicWave },
  { id: 'deathBound', cast: deathBound },
  { id: 'hundredSpear', cast: hundredSpear },
  { id: 'windCutter', cast: windCutter },
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
    // buffs/marcas não gastam a ação
    enchantBlade(unit, sim, false);
    deathBound(unit, sim, false);
    if (shockwave(unit, sim, false)) return;
    if (windCutter(unit, sim, false)) return;
    if (hundredSpear(unit, sim, false)) return;
    if (taunt(unit, sim, false)) return;
    const best = bestCone(unit, sim);
    if (best.hits > 0) unit.facing = best.dir;
    const cleaveReady = ready(unit, sim, 'cleave');
    if (!(cleaveReady && best.hits >= 2) && bash(unit, sim, false)) return;
    // sem inimigo colado: a Onda Sônica alcança quem está mais longe
    if (best.hits === 0 && sonicWave(unit, sim, false)) return;
    if (best.hits === 0 || !cleaveReady) return;
    cleaveCone(unit, sim, best);
  },
};
