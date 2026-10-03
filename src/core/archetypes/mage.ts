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

// ---------------- Especialização Divina (cura) ----------------

/** Força das curas: Dom da Cura e a arma mágica (cajado/livro) aumentam. */
const healPower = (unit: Unit) => {
  const g = lvOf(unit.stats?.skills, 'healGift');
  return (g ? SKILL_NUM.healGift(g).healMult : 1) * dm(unit);
};
const ratio = (u: Unit) => u.hp / Math.max(1, u.maxHp);
/** Aliados vivos (inclui a própria Cléria), do mais ferido para o menos. */
const alliesByNeed = (unit: Unit, sim: Simulation, range: number) =>
  sim.sortedUnits('party').filter((u) => Math.hypot(u.x - unit.x, u.y - unit.y) <= range).sort((a, b) => ratio(a) - ratio(b) || a.id - b.id);

/** Cura: o(s) aliado(s) mais ferido(s) ao alcance (abaixo de 80% de vida). */
function heal(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'heal', force);
  if (!lv || !(force || ready(unit, sim, 'heal'))) return false;
  const n = SKILL_NUM.heal(lv);
  const g = lvOf(unit.stats?.skills, 'healGift');
  const want = g ? SKILL_NUM.healGift(g).targets : 1;
  const list = alliesByNeed(unit, sim, n.range).filter((u) => force || ratio(u) < 0.8).slice(0, want);
  if (!list.length) return false;
  for (const t of list) {
    sim.emit({ type: 'divineHeal', unitId: unit.id, targetId: t.id });
    sim.heal(t, n.amount * healPower(unit));
  }
  unit.cooldowns.heal = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Santuário: no aliado mais ferido quando 2+ estão feridos (ou alguém abaixo de 50%). */
function sanctuary(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'sanctuary', force);
  if (!lv || !(force || ready(unit, sim, 'sanctuary'))) return false;
  const n = SKILL_NUM.sanctuary(lv);
  const list = alliesByNeed(unit, sim, 7);
  const hurt = list.filter((u) => ratio(u) < 0.75);
  if (!force && !(hurt.length >= 2 || (hurt[0] && ratio(hurt[0]) < 0.5))) return false;
  const c = (hurt[0] ?? list[0] ?? unit);
  sim.addSanctuary(unit, { x: c.x, y: c.y }, n.radius, n.perSec * healPower(unit), n.ticks);
  unit.cooldowns.sanctuary = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Escudo Sagrado: no aliado sem escudo que está sendo atacado (inimigo colado), o mais ferido. */
function holyShield(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'holyShield', force);
  if (!lv || !(force || ready(unit, sim, 'holyShield'))) return false;
  const n = SKILL_NUM.holyShield(lv);
  const t = alliesByNeed(unit, sim, 7).find((u) => ((u.shield ?? 0) <= 0 || (u.shieldUntil ?? 0) <= sim.tick) && (force || sim.enemiesWithin(u, 1).length > 0));
  if (!t) return false;
  sim.shieldAlly(unit, t, Math.round(n.absorb * healPower(unit)), n.ticks);
  unit.cooldowns.holyShield = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Bênção: com a horda ao alcance, a party por perto causa mais dano. */
function blessing(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'blessing', force);
  if (!lv || !(force || ready(unit, sim, 'blessing'))) return false;
  const n = SKILL_NUM.blessing(lv);
  if (!force && sim.visibleEnemies().length < 3) return false;
  const targets = sim.sortedUnits('party').filter((u) => Math.hypot(u.x - unit.x, u.y - unit.y) <= n.radius);
  sim.bless(unit, targets, n.amp, n.ticks);
  unit.cooldowns.blessing = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

/** Julgamento Divino (especialização Arcana): cruz de luz no grupo mais denso. */
function judgment(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'judgment', force);
  if (!lv || !(force || ready(unit, sim, 'judgment'))) return false;
  const n = SKILL_NUM.judgment(lv);
  const all = sim.visibleEnemies().filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= CFG.frostBolt.range + 2);
  if (!all.length) return false;
  const best = all.map((e) => ({ e, c: all.filter((o) => chebyshev(o, e) <= 1).length })).sort((a, b) => b.c - a.c || a.e.id - b.e.id)[0];
  if (best.c < (force ? 1 : 3)) return false;
  const c = { x: best.e.x, y: best.e.y };
  const cross = [c, ...[1, 2].flatMap((k) => [{ x: c.x + k, y: c.y }, { x: c.x - k, y: c.y }, { x: c.x, y: c.y + k }, { x: c.x, y: c.y - k }])];
  sim.emit({ type: 'storm', unitId: unit.id, strikes: cross.filter((t, i) => i < 5 && sim.board.inBounds(t.x, t.y)) });
  for (const t of cross) {
    const e = sim.unitAt(t.x, t.y);
    if (!e || e.team !== 'enemy') continue;
    sim.damage(e, n.damage * dm(unit), 'spell', unit.id);
    sim.stun(e, n.stun);
  }
  unit.cooldowns.judgment = sim.tick + cdOf(unit, n.cooldown);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'heal', cast: heal },
  { id: 'holyShield', cast: holyShield },
  { id: 'sanctuary', cast: sanctuary },
  { id: 'blessing', cast: blessing },
  { id: 'judgment', cast: judgment },
  { id: 'fireBarrier', cast: fireBarrier },
  { id: 'frostNova', cast: frostNova },
  { id: 'thunderstorm', cast: thunderstorm },
  { id: 'frostBolt', cast: frostBolt },
];

/**
 * Mago (Cléria, maga divina): controle de área + cura OU dano, conforme a especialização.
 * Prioridade: Cura → Escudo Sagrado → Santuário → Bênção (Divina) → Barreira de Fogo →
 * Nova Congelante → Julgamento → Tempestade (Arcana) → Raio Gélido (ataque básico).
 * Habilidades fora dos slots de Mana nunca são usadas (a simulação as segura).
 */
export const mage: Archetype = {
  id: 'mage',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    if (heal(unit, sim, false)) return;
    if (holyShield(unit, sim, false)) return;
    if (sanctuary(unit, sim, false)) return;
    if (blessing(unit, sim, false)) return;
    if (fireBarrier(unit, sim, false)) return;
    if (frostNova(unit, sim, false)) return;
    if (judgment(unit, sim, false)) return;
    if (thunderstorm(unit, sim, false)) return;
    frostBolt(unit, sim, false);
  },
};
