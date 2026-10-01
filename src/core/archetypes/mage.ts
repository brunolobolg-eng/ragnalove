import { GAME_CONFIG } from '../../config/gameConfig';
import { linePattern } from '../grid/patterns';
import { chebyshev } from '../grid/types';
import { SKILL_NUM, lvOf } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Archetype } from './Archetype';

const CFG = GAME_CONFIG.archetypes.mage;

/**
 * Mago: controle de área + dano à distância.
 * Prioridade: 1) Barreira de Fogo (monta o funil) → 2) Raio Gélido no inimigo
 * mais próximo dentro do alcance e com linha de visão.
 */
/** Chave de recarga de cada barreira: fireBarrier, fireBarrier2, fireBarrier3. */
export const barrierKey = (i: number) => (i === 0 ? 'fireBarrier' : `fireBarrier${i + 1}`);

export const mage: Archetype = {
  id: 'mage',
  maxHp: CFG.hp,
  update(unit, sim) {
    const s = unit.stats;
    const sk = s?.skills;
    const cdm = s?.cooldownMult ?? 1;
    const dm = s?.skillDamageMult ?? 1;
    const ready = (k: string) => sim.tick >= (unit.cooldowns[k] ?? 0);

    // 1) Barreiras de Fogo: 3 linhas curtas, cada uma com sua recarga (uma conjuração por tick)
    for (let b = 0; b < sim.setup.barriers.length; b++) {
      const key = barrierKey(b);
      if (!ready(key)) continue;
      const plan = sim.setup.barriers[b];
      const tiles = sim.board.clip(linePattern(plan, plan.orientation, s?.barrierLength ?? CFG.fireBarrier.length));
      if (tiles.length === 0) continue;
      sim.addEffect({ kind: 'fireBarrier', ownerId: unit.id, tiles, durationTicks: s?.barrierDurationTicks ?? CFG.fireBarrier.durationTicks, hostileTo: 'enemy' });
      unit.facing = { x: Math.sign(plan.x - unit.x), y: Math.sign(plan.y - unit.y) };
      unit.cooldowns[key] = sim.tick + (s?.barrierCooldownTicks ?? CFG.fireBarrier.cooldownTicks);
      sim.emit({ type: 'cast', unitId: unit.id, ability: key });
      return;
    }

    // 1c) Nova Congelante: inimigos colados ou 2+ por perto
    const lvNova = lvOf(sk, 'frostNova');
    if (lvNova && ready('frostNova')) {
      const n = SKILL_NUM.frostNova(lvNova);
      const near = sim.enemiesWithin(unit, n.radius);
      if (near.length >= 2 || near.some((e) => chebyshev(e, unit) === 1)) {
        sim.emit({ type: 'nova', unitId: unit.id, x: unit.x, y: unit.y, radius: n.radius });
        for (const e of near) {
          sim.damage(e, n.damage * dm, 'nova', unit.id);
          sim.freeze(e, n.freezeTicks);
        }
        unit.cooldowns.frostNova = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
        return;
      }
    }

    // 1d) Tempestade Elétrica: raios nos congelados (ou no grupo mais denso)
    const lvStorm = lvOf(sk, 'thunderstorm');
    if (lvStorm && ready('thunderstorm')) {
      const n = SKILL_NUM.thunderstorm(lvStorm);
      const all = sim.visibleEnemies();
      let targets = all.filter((e) => sim.frozen(e));
      if (targets.length === 0 && all.length >= 3) {
        const dens = all.map((e) => ({ e, c: all.filter((o) => chebyshev(o, e) <= 1).length })).sort((a, b) => b.c - a.c || a.e.id - b.e.id);
        if (dens[0].c >= 3) targets = dens.slice(0, n.strikes).map((d) => d.e);
      }
      if (targets.length) {
        targets = targets.slice(0, n.strikes);
        sim.emit({ type: 'storm', unitId: unit.id, strikes: targets.map((t) => ({ x: t.x, y: t.y })) });
        for (const t of targets) {
          const at = { x: t.x, y: t.y };
          sim.damage(t, n.damage * dm, 'storm', unit.id);
          for (const o of sim.enemiesWithin(at, 1)) if (o !== t) sim.damage(o, n.damage * dm * 0.5, 'storm', unit.id);
        }
        unit.cooldowns.thunderstorm = sim.tick + Math.max(1, Math.round(n.cooldown * cdm));
        return;
      }
    }

    // 2) Raio Gélido à distância (ataque básico de alvo único)
    if (sim.tick < (unit.cooldowns.frostBolt ?? 0)) return;
    const range = (s?.boltRange ?? CFG.frostBolt.range) * sim.rangeMult;
    let target: Unit | undefined;
    let bestD = Infinity;
    for (const e of sim.visibleEnemies()) {
      const d = Math.hypot(e.x - unit.x, e.y - unit.y);
      if (d > range || d >= bestD) continue;
      if (!sim.hasLineOfSight(unit, e)) continue;
      target = e;
      bestD = d;
    }
    if (!target) return;
    unit.facing = { x: Math.sign(target.x - unit.x), y: Math.sign(target.y - unit.y) };
    sim.emit({ type: 'bolt', unitId: unit.id, targetId: target.id, from: { x: unit.x, y: unit.y }, to: { x: target.x, y: target.y } });
    sim.damage(target, s?.boltDamage ?? CFG.frostBolt.damage, 'bolt', unit.id);
    // Raio Gélido resfria: o alvo atrasa o próximo passo/ataque
    if (target.alive) target.nextActTick = Math.max(target.nextActTick, sim.tick) + CFG.frostBolt.chillTicks;
    unit.cooldowns.frostBolt = sim.tick + (s?.boltCooldownTicks ?? CFG.frostBolt.cooldownTicks);
  },
};
