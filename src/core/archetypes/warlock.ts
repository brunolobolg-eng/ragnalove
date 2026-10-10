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
/** Nível da habilidade; o CAST do Dev Lab (force) usa pelo menos o nível 1. */
const lvl = (unit: Unit, id: Parameters<typeof lvOf>[1], force: boolean) => (force ? Math.max(1, lvOf(unit.stats?.skills, id)) : lvOf(unit.stats?.skills, id));
/** Magias novas: inimigos visíveis a até `r` casas (distância de Chebyshev), escalado pelo alcance do ambiente. */
const reach = (unit: Unit, sim: Simulation, r: number) => sim.visibleEnemies().filter((e) => chebyshev(e, unit) <= r * sim.rangeMultFor(unit));
/** Inimigo ao alcance mais próximo (empate: menor id). */
const nearest = (unit: Unit, sim: Simulation, r: number) => reach(unit, sim, r).sort((a, b) => chebyshev(a, unit) - chebyshev(b, unit) || a.id - b.id)[0];
/** Centro de área: inimigo ao alcance com mais inimigos num raio `radius` em volta dele (empate: menor id). */
const densest = (unit: Unit, sim: Simulation, r: number, radius: number) =>
  reach(unit, sim, r)
    .map((c) => ({ c, n: sim.enemiesWithin(c, radius).length }))
    .sort((a, b) => b.n - a.n || a.c.id - b.c.id)[0]?.c;
/** Inteligência da Bruxa (escala Lodaçal Abissal). */
const intOf = (unit: Unit) => unit.stats?.attrs.int ?? 0;

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

/**
 * Cárcere Etéreo: prende um inimigo (não chefe) em cristal. Alvo: o de maior vida ao alcance que ainda
 * não está preso. Chance de falhar (evento com ok=false); a recarga vale mesmo assim.
 */
function etherealCage(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'etherealCage', force);
  if (!lv || !(force || ready(unit, sim, 'etherealCage'))) return false;
  const n = SKILL_NUM.etherealCage(lv);
  const t = reach(unit, sim, n.range)
    .filter((e) => !GAME_CONFIG.bossKinds.includes(e.kind) && (e.cagedUntil ?? 0) <= sim.tick)
    .sort((a, b) => b.hp - a.hp || a.id - b.id)[0];
  if (!t) return false;
  face(unit, t);
  const ok = sim.chance(n.chance);
  sim.emit({ type: 'etherealCage', unitId: unit.id, targetId: t.id, x: t.x, y: t.y, ticks: n.ticks, ok });
  if (ok) sim.cage(t, n.ticks);
  unit.cooldowns.etherealCage = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Eco da Alma: duas batidas de sombra no inimigo mais próximo e em quem está na área; dobra contra presos. */
function soulEcho(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'soulEcho', force);
  if (!lv || !(force || ready(unit, sim, 'soulEcho'))) return false;
  const n = SKILL_NUM.soulEcho(lv);
  const t = nearest(unit, sim, n.range);
  if (!t) return false;
  face(unit, t);
  const hit = sim.enemiesWithin(t, n.radius).sort((a, b) => a.id - b.id);
  const caged = new Set(hit.filter((e) => (e.cagedUntil ?? 0) > sim.tick).map((e) => e.id));
  sim.emit({ type: 'soulEcho', unitId: unit.id, targetId: t.id, x: t.x, y: t.y, radius: n.radius, targetIds: hit.map((e) => e.id), doubled: caged.size > 0 });
  const base = n.damage * pw(unit);
  for (const e of hit) {
    const amount = base * (caged.has(e.id) ? n.cagedMult : 1);
    for (let i = 0; i < n.blows; i++) sim.damage(e, amount, 'shadow', unit.id);
  }
  unit.cooldowns.soulEcho = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Névoa Gélida: área no chão no centro mais denso ao alcance. Sem dano instantâneo; pulsa gelo e deixa Frio. */
function frostMist(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'frostMist', force);
  if (!lv || !(force || ready(unit, sim, 'frostMist'))) return false;
  const n = SKILL_NUM.frostMist(lv);
  const c = densest(unit, sim, n.range, n.radius);
  if (!c) return false;
  face(unit, c);
  sim.emit({ type: 'frostMist', unitId: unit.id, x: c.x, y: c.y, radius: n.radius, ticks: n.ticks });
  sim.addFrostMist(unit, c, n.radius, n.ticks, n.pulse * pw(unit), CFG.chill.durationTicks);
  unit.cooldowns.frostMist = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Geada Negra: gelo instantâneo na área mais densa; mais dano nos inimigos já gelados. */
function blackFrost(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'blackFrost', force);
  if (!lv || !(force || ready(unit, sim, 'blackFrost'))) return false;
  const n = SKILL_NUM.blackFrost(lv);
  const c = densest(unit, sim, n.range, n.radius);
  if (!c) return false;
  face(unit, c);
  const hit = sim.enemiesWithin(c, n.radius).sort((a, b) => a.id - b.id);
  const frozen = new Set(hit.filter((e) => (e.chilledUntil ?? 0) > sim.tick).map((e) => e.id));
  sim.emit({ type: 'blackFrost', unitId: unit.id, x: c.x, y: c.y, radius: n.radius, targetIds: hit.map((e) => e.id), chilled: frozen.size });
  for (const e of hit) sim.damage(e, n.damage * pw(unit) * (frozen.has(e.id) ? n.chillMult : 1), 'frost', unit.id);
  unit.cooldowns.blackFrost = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Lodaçal Abissal: raízes no inimigo mais próximo — lentidão (maior valor vale) e vulnerabilidade (Inteligência escala as duas). */
function abyssMarsh(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'abyssMarsh', force);
  if (!lv || !(force || ready(unit, sim, 'abyssMarsh'))) return false;
  const n = SKILL_NUM.abyssMarsh(lv);
  const t = nearest(unit, sim, n.range);
  if (!t) return false;
  face(unit, t);
  const slowMult = Math.min(n.slowCap, n.slow + n.slowPerInt * intOf(unit));
  const curseAmp = Math.min(n.curseCap, n.curse + n.cursePerInt * intOf(unit));
  sim.emit({ type: 'abyssMarsh', unitId: unit.id, targetId: t.id, ticks: n.ticks, slowMult, curseAmp });
  sim.applySlow(t, slowMult, n.ticks);
  sim.curse(t, curseAmp, n.ticks);
  unit.cooldowns.abyssMarsh = sim.tick + cd(unit, n.cooldown);
  return true;
}

/** Ápice Sombrio: buff na própria Bruxa (não gasta a ação, como a Fúria). Só ativa com inimigo perto. */
function darkApex(unit: Unit, sim: Simulation, force: boolean): boolean {
  const lv = lvl(unit, 'darkApex', force);
  if (!lv) return false;
  const n = SKILL_NUM.darkApex(lv);
  if (!(force || (ready(unit, sim, 'darkApex') && reach(unit, sim, n.range).length > 0))) return false;
  unit.apexUntil = sim.tick + n.ticks;
  unit.apexAmp = n.amp;
  sim.emit({ type: 'darkApex', unitId: unit.id, ticks: n.ticks, amp: n.amp });
  unit.cooldowns.darkApex = sim.tick + cd(unit, n.cooldown);
  return true;
}

const SKILLS: ArchetypeSkill[] = [
  { id: 'darkApex', cast: darkApex },
  { id: 'curse', cast: curse },
  { id: 'etherealCage', cast: etherealCage },
  { id: 'frostMist', cast: frostMist },
  { id: 'soulEcho', cast: soulEcho },
  { id: 'blackFrost', cast: blackFrost },
  { id: 'abyssMarsh', cast: abyssMarsh },
  { id: 'shadowSwarm', cast: shadowSwarm },
  { id: 'lifeDrain', cast: lifeDrain },
];

/**
 * Bruxa: maldições, gelo, prisão e dreno de vida. Cada magia tem a própria recarga e dispara quando fica
 * pronta, sem prioridade entre elas: Maldição, Cárcere Etéreo, Névoa Gélida, Eco da Alma, Geada Negra,
 * Lodaçal Abissal, Enxame de Sombras, Dreno de Vida (ataque básico) e Ápice Sombrio (buff).
 * A ordem da lista só desempata o que resolve no mesmo tick.
 */
export const warlock: Archetype = {
  id: 'warlock',
  maxHp: CFG.hp,
  skills: SKILLS,
  update(unit, sim) {
    darkApex(unit, sim, false);
    curse(unit, sim, false);
    etherealCage(unit, sim, false);
    frostMist(unit, sim, false);
    soulEcho(unit, sim, false);
    blackFrost(unit, sim, false);
    abyssMarsh(unit, sim, false);
    shadowSwarm(unit, sim, false);
    lifeDrain(unit, sim, false);
  },
};
