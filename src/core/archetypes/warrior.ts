import { GAME_CONFIG } from '../../config/gameConfig';
import { conePattern } from '../grid/patterns';
import { DIRS8, chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Archetype } from './Archetype';

const CFG = GAME_CONFIG.archetypes.warrior;

/**
 * Guerreiro: segura a linha.
 * 1) Golpe em Área quando o cone pega 2+ inimigos (controle de grupo);
 * 2) senão Investida no inimigo adjacente mais ferido (ataque básico de alvo único);
 * 3) senão Golpe em Área mesmo com 1 alvo (alcance 2).
 */
export const warrior: Archetype = {
  id: 'warrior',
  maxHp: CFG.hp,
  update(unit, sim) {
    const c = CFG.cleave;
    const sk = unit.stats?.skills;
    const cdm = unit.stats?.cooldownMult ?? 1;
    const dm = unit.stats?.skillDamageMult ?? 1;
    const ready = (k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);

    // Fúria: buff instantâneo quando a pressão aperta (não gasta a ação)
    const lvFury = lvOf(sk, 'fury');
    if (lvFury && ready('fury') && sim.enemiesWithin(unit, 2).length >= 3) {
      const n = SKILL_NUM.fury(lvFury);
      unit.furyUntil = sim.tick + n.duration;
      unit.cooldowns.fury = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
      sim.emit({ type: 'fury', unitId: unit.id, ticks: n.duration });
    }
    const furyMult = lvFury && (unit.furyUntil ?? 0) > sim.tick ? SKILL_NUM.fury(lvFury).cdMult : 1;

    // Onda de Choque: 3+ inimigos em volta
    const lvShock = lvOf(sk, 'shockwave');
    if (lvShock && ready('shockwave')) {
      const n = SKILL_NUM.shockwave(lvShock);
      const near = sim.enemiesWithin(unit, n.radius);
      if (near.length >= 3) {
        sim.emit({ type: 'shockwave', unitId: unit.id, x: unit.x, y: unit.y, radius: n.radius });
        for (const e of near) {
          sim.damage(e, n.damage * dm, 'shock', unit.id);
          if (e.alive) sim.knockback(e, unit, n.push);
        }
        unit.cooldowns.shockwave = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
        return;
      }
    }

    // Provocar: campo de aggro — quem está em volta larga a cidade e vem atrás do Guerreiro
    const lvTaunt = lvOf(sk, 'taunt');
    if (lvTaunt && ready('taunt')) {
      const n = SKILL_NUM.taunt(lvTaunt);
      if (sim.tauntCandidates(unit, n.radius).length >= GAME_CONFIG.aggro.taunt.minTargets) {
        const hooked = sim.applyTaunt(unit, n.radius, n.duration, n.maxEnemies);
        for (const id of hooked) {
          const e = sim.units.get(id);
          if (e && chebyshev(e, unit) > 1) sim.pull(e, unit, n.pull);
        }
        sim.emit({ type: 'taunt', unitId: unit.id, radius: n.radius, pulled: hooked });
        unit.cooldowns.taunt = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
        return;
      }
    }
    // Status derivados de Força/Destreza/equipamento (caem no GAME_CONFIG sem progressão).
    const range = unit.stats?.cleaveRange ?? c.range;
    const halfAngle = unit.stats?.cleaveHalfAngleDeg ?? c.halfAngleDeg;
    const damage = unit.stats?.cleaveDamage ?? c.damage;
    const cooldown = Math.max(1, Math.round((unit.stats?.cleaveCooldownTicks ?? c.cooldownTicks) * furyMult));
    let bestDir = unit.facing;
    let bestHits = 0;
    let bestTiles: { x: number; y: number }[] = [];
    for (const d of DIRS8) {
      const tiles = sim.board.clip(conePattern(unit, d, range, halfAngle));
      let hits = 0;
      for (const t of tiles) {
        const e = sim.unitAt(t.x, t.y);
        if (e && e.team === 'enemy') hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        bestDir = d;
        bestTiles = tiles;
      }
    }
    if (bestHits > 0) unit.facing = bestDir;
    const cleaveReady = sim.tick >= (unit.cooldowns.cleave ?? 0);
    if (!(cleaveReady && bestHits >= 2) && sim.tick >= (unit.cooldowns.bash ?? 0)) {
      let target: Unit | undefined;
      for (const e of sim.enemies()) {
        if (Math.max(Math.abs(e.x - unit.x), Math.abs(e.y - unit.y)) !== 1) continue;
        if (!target || e.hp < target.hp || (e.hp === target.hp && e.id < target.id)) target = e;
      }
      if (target) {
        unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
        sim.emit({ type: 'bash', unitId: unit.id, targetId: target.id, x: target.x, y: target.y });
        sim.damage(target, unit.stats?.bashDamage ?? CFG.bash.damage, 'bash', unit.id);
        const bashCd = Math.max(1, Math.round((unit.stats?.bashCooldownTicks ?? CFG.bash.cooldownTicks) * furyMult));
        unit.cooldowns.bash = sim.tick + bashCd;
        // mesmo braço, mesma arma: a Investida também atrasa o próximo Golpe em Área
        unit.cooldowns.cleave = Math.max(unit.cooldowns.cleave ?? 0, sim.tick + bashCd);
        return;
      }
    }
    if (bestHits === 0 || !cleaveReady) return;

    const hitTiles: { x: number; y: number }[] = [];
    for (const t of bestTiles) {
      const e = sim.unitAt(t.x, t.y);
      if (e && e.team === 'enemy') {
        hitTiles.push(t);
        sim.damage(e, damage, 'cleave', unit.id);
      }
    }
    // Golpe Estilhaçante: empurra quem sobreviveu ao corte
    const lvShat = lvOf(sk, 'shatter');
    if (lvShat) {
      const n = SKILL_NUM.shatter(lvShat);
      for (const t of hitTiles) {
        const e = sim.unitAt(t.x, t.y);
        if (e && e.alive && e.team === 'enemy' && sim.chance(n.chance)) sim.knockback(e, unit, n.distance);
      }
    }
    unit.cooldowns.cleave = sim.tick + cooldown;
    unit.cooldowns.bash = Math.max(unit.cooldowns.bash ?? 0, sim.tick + cooldown);
    sim.emit({ type: 'cleave', unitId: unit.id, facing: bestDir, tiles: bestTiles, hitTiles, hits: bestHits });
  },
};
