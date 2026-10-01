import { GAME_CONFIG } from '../../config/gameConfig';
import { chebyshev, DIRS8, type Vec2 } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Archetype } from './Archetype';

const CFG = GAME_CONFIG.archetypes.archer;

/**
 * Arqueira: dano à distância.
 * Prioridade: Foco do Caçador (pressão) → Flecha Perfurante (2+ em linha) →
 * Chuva de Flechas (grupo denso) → Flecha Precisa (mais próximo com linha de visão).
 */
export const archer: Archetype = {
  id: 'archer',
  maxHp: CFG.hp,
  update(unit, sim) {
    const s = unit.stats;
    const sk = s?.skills;
    const cdm = s?.cooldownMult ?? 1;
    const dm = s?.skillDamageMult ?? 1;
    const ready = (k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);
    const range = (s?.arrowRange ?? CFG.arrow.range) * sim.rangeMult;
    const inRange = sim.visibleEnemies().filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= range);

    // Foco do Caçador: buff instantâneo
    const lvFocus = lvOf(sk, 'hunterFocus');
    if (lvFocus && ready('hunterFocus') && inRange.length >= 4) {
      const n = SKILL_NUM.hunterFocus(lvFocus);
      unit.furyUntil = sim.tick + n.duration;
      unit.cooldowns.hunterFocus = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
      sim.emit({ type: 'focus', unitId: unit.id, ticks: n.duration });
    }
    const haste = lvFocus && (unit.furyUntil ?? 0) > sim.tick ? SKILL_NUM.hunterFocus(lvFocus).cdMult : 1;
    const cd = (t: number) => Math.max(1, Math.round(t * haste));

    // Flecha Perfurante: direção com mais inimigos em linha
    const lvPierce = lvOf(sk, 'piercing');
    if (lvPierce && ready('piercing')) {
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
        if (hits.length >= 2 && (!best || hits.length > best.hits.length)) best = { d, hits, end };
      }
      if (best) {
        const n = SKILL_NUM.piercing(lvPierce);
        unit.facing = best.d;
        sim.emit({ type: 'pierce', unitId: unit.id, from: { x: unit.x, y: unit.y }, to: best.end });
        for (const e of best.hits) sim.damage(e, n.damage * dm, 'pierce', unit.id);
        unit.cooldowns.piercing = sim.tick + cd(Math.round(n.cooldown * cdm));
        return;
      }
    }

    // Chuva de Flechas: centro no grupo mais denso ao alcance
    if (ready('arrowRain') && inRange.length) {
      const rad = s?.rainRadius ?? CFG.rain.radius;
      let best: { c: Unit; n: number } | undefined;
      for (const e of inRange) {
        const n = sim.enemiesWithin(e, rad).length;
        if (!best || n > best.n || (n === best.n && e.id < best.c.id)) best = { c: e, n };
      }
      if (best && best.n >= CFG.rain.minTargets) {
        const c = { x: best.c.x, y: best.c.y };
        unit.facing = { x: Math.sign(c.x - unit.x), y: Math.sign(c.y - unit.y) };
        sim.emit({ type: 'rain', unitId: unit.id, x: c.x, y: c.y, radius: rad });
        for (const e of sim.enemiesWithin(c, rad)) sim.damage(e, s?.rainDamage ?? CFG.rain.damage, 'rain', unit.id);
        const lvFire = lvOf(sk, 'fireRain');
        if (lvFire) {
          const tiles: Vec2[] = [];
          for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (sim.board.isWalkable(c.x + dx, c.y + dy)) tiles.push({ x: c.x + dx, y: c.y + dy });
          if (tiles.length) sim.addEffect({ kind: 'fireBarrier', ownerId: unit.id, tiles, durationTicks: SKILL_NUM.fireRain(lvFire).burnTicks, hostileTo: 'enemy' });
        }
        unit.cooldowns.arrowRain = sim.tick + cd(s?.rainCooldownTicks ?? CFG.rain.cooldownTicks);
        return;
      }
    }

    // Flecha Precisa (ataque básico de alvo único)
    if (!ready('preciseShot')) return;
    const targets = inRange.filter((e) => sim.hasLineOfSight(unit, e)).sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id);
    if (!targets.length) return;
    const shoot = (t: Unit) => {
      const crit = sim.chance(s?.crit ?? 0);
      sim.emit({ type: 'arrow', unitId: unit.id, targetId: t.id, from: { x: unit.x, y: unit.y }, to: { x: t.x, y: t.y }, crit });
      sim.damage(t, (s?.arrowDamage ?? CFG.arrow.damage) * (crit ? 2 : 1), 'arrow', unit.id);
    };
    const t0 = targets[0];
    unit.facing = { x: Math.sign(t0.x - unit.x), y: Math.sign(t0.y - unit.y) };
    shoot(t0);
    const lvDouble = lvOf(sk, 'doubleShot');
    if (lvDouble && targets.length > 1 && sim.chance(SKILL_NUM.doubleShot(lvDouble).chance)) shoot(targets[1]);
    unit.cooldowns.preciseShot = sim.tick + cd(s?.arrowCooldownTicks ?? CFG.arrow.cooldownTicks);
  },
};
