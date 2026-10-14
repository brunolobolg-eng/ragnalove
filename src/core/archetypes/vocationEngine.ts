import { GAME_CONFIG } from '../../config/gameConfig';
import { VOCATION_TREES, type VocationBehavior, type VocationSkillSpec, type VocationTreeSpec } from '../../config/vocationSkills';
import { conePattern } from '../grid/patterns';
import { DIRS8, chebyshev, type Vec2 } from '../grid/types';
import { lvOf, type SkillId } from '../progression/skills';
import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';
import type { Archetype, ArchetypeSkill } from './Archetype';

/**
 * Motor das vocações (Crusado, Hypnomancer): executa as árvores de config/vocationSkills.ts.
 * Cada habilidade é um `behavior` com números por nível; a regra de disparo é a mesma do resto
 * da party: cada habilidade pronta dispara no seu tick (sem prioridade), só o corpo a corpo sai um por vez.
 * Tudo determinístico: alvos escolhidos por distância e id, nunca por sorteio.
 */

type Num = Record<string, number>;
interface Ctx {
  u: Unit;
  sim: Simulation;
  n: Num;
  spec: VocationSkillSpec;
  force: boolean;
}
type Behavior = (c: Ctx) => boolean;

const SPEC_BY_ID = Object.fromEntries(Object.values(VOCATION_TREES).flatMap((t) => t.skills.map((s) => [s.id, s]))) as Record<string, VocationSkillSpec>;

/** Poder da classe (Força ou Inteligência, com equipamento): multiplica o dano-base de cada habilidade. */
const power = (u: Unit): number => u.stats?.classPower ?? 1;
const learnedLv = (u: Unit, id: string): number => lvOf(u.stats?.skills, id as SkillId);
const ready = (u: Unit, sim: Simulation, id: string): boolean => sim.tick >= (u.cooldowns[id] ?? 0);

/** Recarga em ticks: Skill Haste e, enquanto a Fúria Sagrada dura, o multiplicador dela. */
function cdOf(u: Unit, sim: Simulation, ticks: number): number {
  const fury = (u.furyUntil ?? 0) > sim.tick ? (u.furyMult ?? 1) : 1;
  return Math.max(1, Math.round(ticks * (u.stats?.cooldownMult ?? 1) * fury));
}

/** Valor de uma passiva aprendida (0 se a habilidade não está aprendida). */
function passiveValue(u: Unit, id: string, key: string): number {
  const lv = learnedLv(u, id);
  return lv ? (SPEC_BY_ID[id]?.num(lv)[key] ?? 0) : 0;
}

/** Inimigo mais próximo ao alcance (com linha de visão, se pedido). Empate: menor id. */
function nearestFoe(u: Unit, sim: Simulation, range: number, los: boolean): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const e of sim.enemies()) {
    const d = chebyshev(e, u);
    if (d > range || (los && !sim.hasLineOfSight(u, e))) continue;
    if (!best || d < bestD || (d === bestD && e.id < best.id)) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Aliado com menos vida (proporção) ao alcance, incluindo a própria vocação. `hurt`: só quem não está cheio. */
function lowestAlly(u: Unit, sim: Simulation, range: number, hurt: boolean): Unit | undefined {
  let best: Unit | undefined;
  for (const a of sim.sortedUnits('party')) {
    if (chebyshev(a, u) > range || (hurt && a.hp >= a.maxHp)) continue;
    if (!best || a.hp / a.maxHp < best.hp / best.maxHp || (a.hp / a.maxHp === best.hp / best.maxHp && a.id < best.id)) best = a;
  }
  return best;
}

/** Golpe que cura o herói: `lifesteal` (Sopro de Luz) devolve parte do dano dos golpes corpo a corpo. */
function lifesteal(u: Unit, sim: Simulation, dealt: number): void {
  const p = passiveValue(u, 'soproDeLuz', 'pct');
  if (p > 0 && dealt > 0) sim.heal(u, dealt * p);
}

/** Guarda: `cut` de redução até `until`. Um guarda já ativo fica com o maior corte (não some por refresco de passiva). */
function setGuard(u: Unit, now: number, until: number, cut: number): void {
  const active = (u.guardUntil ?? 0) > now;
  u.guardCut = active ? Math.max(u.guardCut ?? 0, cut) : cut;
  u.guardUntil = Math.max(u.guardUntil ?? 0, until);
}

// ---------------- comportamentos ----------------

/** Golpe corpo a corpo no adjacente mais ferido (o básico, e o Impacto Devoto com atordoamento). */
const melee: Behavior = ({ u, sim, n, spec }) => {
  let target: Unit | undefined;
  for (const e of sim.enemies()) {
    if (chebyshev(e, u) !== 1) continue;
    if (!target || e.hp < target.hp || (e.hp === target.hp && e.id < target.id)) target = e;
  }
  if (!target) return false;
  u.facing = { x: Math.sign(target.x - u.x), y: Math.sign(target.y - u.y) };
  sim.emit({ type: 'bash', unitId: u.id, targetId: target.id, x: target.x, y: target.y });
  const dmg = n.dmg * power(u);
  sim.damage(target, dmg, spec.src ?? 'bash', u.id);
  if (target.alive && n.stun) sim.stun(target, n.stun);
  lifesteal(u, sim, dmg);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Investida: avança até o inimigo (a casa livre mais perto de quem avança, colada no alvo) e golpeia. */
const charge: Behavior = ({ u, sim, n, spec }) => {
  const t = nearestFoe(u, sim, n.range, false);
  if (!t || chebyshev(t, u) < 2) return false;
  let spot: Vec2 | undefined;
  let spotD = Infinity;
  for (const d of DIRS8) {
    const x = t.x + d.x;
    const y = t.y + d.y;
    if (!sim.board.isWalkable(x, y) || sim.unitAt(x, y) || sim.board.isCity(x, y)) continue;
    const dd = chebyshev({ x, y }, u);
    if (dd < spotD) {
      spotD = dd;
      spot = { x, y };
    }
  }
  if (!spot) return false;
  sim.relocate(u, spot.x, spot.y);
  u.facing = { x: Math.sign(t.x - u.x), y: Math.sign(t.y - u.y) };
  sim.emit({ type: 'bash', unitId: u.id, targetId: t.id, x: t.x, y: t.y });
  sim.damage(t, n.dmg * power(u), spec.src ?? 'bash', u.id);
  if (t.alive) sim.stun(t, n.stun);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Linha: estocada na direção do inimigo mais próximo; atinge todos os inimigos da linha (só se acertar algum). */
const line: Behavior = ({ u, sim, n, spec }) => {
  const t = nearestFoe(u, sim, n.range, false);
  if (!t) return false;
  const d = { x: Math.sign(t.x - u.x), y: Math.sign(t.y - u.y) };
  if (d.x === 0 && d.y === 0) return false;
  const tiles: Vec2[] = [];
  for (let i = 1; i <= n.len; i++) {
    const x = u.x + d.x * i;
    const y = u.y + d.y * i;
    if (!sim.board.isWalkable(x, y)) break;
    tiles.push({ x, y });
  }
  const hit: Unit[] = [];
  for (const tile of tiles) {
    const e = sim.unitAt(tile.x, tile.y);
    if (e && e.team === 'enemy' && e.alive) hit.push(e);
  }
  if (!hit.length) return false;
  u.facing = d;
  sim.emit({ type: 'pierce', unitId: u.id, from: { x: u.x, y: u.y }, to: tiles[tiles.length - 1] });
  for (const e of hit) sim.damage(e, n.dmg * power(u), spec.src ?? 'pierce', u.id);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Cone: na direção com mais inimigos; quem é atingido pode ficar gelado. */
const cone: Behavior = ({ u, sim, n, spec }) => {
  let best: { dir: Vec2; tiles: Vec2[]; hits: Unit[] } | undefined;
  for (const d of DIRS8) {
    const tiles = sim.board.clip(conePattern(u, d, n.range, n.halfAngle));
    const hits: Unit[] = [];
    for (const t of tiles) {
      const e = sim.unitAt(t.x, t.y);
      if (e && e.team === 'enemy' && e.alive) hits.push(e);
    }
    if (hits.length > (best?.hits.length ?? 0)) best = { dir: d, tiles, hits };
  }
  if (!best || !best.hits.length) return false;
  u.facing = best.dir;
  sim.emit({ type: 'cleave', unitId: u.id, facing: best.dir, tiles: best.tiles, hitTiles: best.hits.map((e) => ({ x: e.x, y: e.y })), hits: best.hits.length });
  for (const e of best.hits) {
    if (!e.alive) continue;
    sim.damage(e, n.dmg * power(u), spec.src ?? 'spell', u.id);
    if (e.alive && n.chill) sim.chill(e, n.chill);
  }
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Área em volta da própria vocação: dano, atordoa e (se `knock`) empurra quem está colado. */
const areaSelf: Behavior = ({ u, sim, n, spec }) => {
  const near = sim.enemiesWithin(u, n.radius).filter((e) => e.alive);
  if (!near.length) return false;
  if (n.knock) sim.emit({ type: 'stomp', unitId: u.id, x: u.x, y: u.y, radius: n.radius });
  else sim.emit({ type: 'shockwave', unitId: u.id, x: u.x, y: u.y, radius: n.radius });
  for (const e of near) {
    if (!e.alive) continue;
    sim.damage(e, n.dmg * power(u), spec.src ?? 'shock', u.id);
    if (e.alive && n.knock) sim.knockback(e, { x: u.x, y: u.y }, n.knock);
    if (e.alive && n.stun) sim.stun(e, n.stun);
  }
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Área no grupo mais denso ao alcance: quadrado (`radius`) ou cruz (pilares). Precisa de `minTargets` inimigos. */
const areaTarget: Behavior = ({ u, sim, n, spec, force }) => {
  const foes = sim.enemies();
  let best: { c: Unit; group: Unit[] } | undefined;
  for (const c of foes) {
    if (chebyshev(c, u) > n.range) continue;
    const group = foes.filter((e) => (n.cross ? (e.x === c.x || e.y === c.y) && chebyshev(e, c) <= n.radius : chebyshev(e, c) <= n.radius));
    if (!best || group.length > best.group.length || (group.length === best.group.length && c.id < best.c.id)) best = { c, group };
  }
  if (!best || best.group.length < (force ? 1 : n.minTargets)) return false;
  const { c, group } = best;
  if (n.cross) sim.emit({ type: 'storm', unitId: u.id, strikes: [{ x: c.x, y: c.y }], ability: 'judgment' });
  else if (spec.src === 'meteor') sim.emit({ type: 'meteor', unitId: u.id, x: c.x, y: c.y, radius: n.radius });
  else sim.emit({ type: 'shockwave', unitId: u.id, x: c.x, y: c.y, radius: n.radius });
  for (const e of group) {
    if (!e.alive) continue;
    sim.damage(e, n.dmg * power(u), spec.src ?? 'spell', u.id);
    if (e.alive && n.stun) sim.stun(e, n.stun);
  }
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Alvo único à distância, com efeito extra: queimadura, veneno, gelo, dreno de vida para a vocação. */
const bolt: Behavior = ({ u, sim, n, spec }) => {
  const t = nearestFoe(u, sim, n.range, true);
  if (!t) return false;
  const pw = power(u);
  u.facing = { x: Math.sign(t.x - u.x), y: Math.sign(t.y - u.y) };
  sim.emit({ type: 'bolt', unitId: u.id, targetId: t.id, from: { x: u.x, y: u.y }, to: { x: t.x, y: t.y } });
  const dmg = n.dmg * pw;
  sim.damage(t, dmg, spec.src ?? 'bolt', u.id);
  if (t.alive && n.freeze) sim.freeze(t, n.freeze);
  if (t.alive && n.burn) sim.addDot(t, n.burn * pw, n.burnTicks, 'burn', u.id);
  if (t.alive && n.poison) sim.addDot(t, n.poison * pw, n.poisonTicks, 'poison', u.id);
  if (n.drain) sim.heal(u, dmg * n.drain);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Raio que salta de inimigo em inimigo; cada salto causa `fall` do dano anterior. */
const chain: Behavior = ({ u, sim, n, spec }) => {
  const first = nearestFoe(u, sim, n.range, true);
  if (!first) return false;
  const hits: Unit[] = [first];
  let cur = first;
  for (let j = 0; j < n.jumps; j++) {
    let next: Unit | undefined;
    let nextD = Infinity;
    for (const e of sim.enemies()) {
      if (!e.alive || hits.includes(e)) continue;
      const d = chebyshev(e, cur);
      if (d > n.reach) continue;
      if (!next || d < nextD || (d === nextD && e.id < next.id)) {
        next = e;
        nextD = d;
      }
    }
    if (!next) break;
    hits.push(next);
    cur = next;
  }
  sim.emit({ type: 'storm', unitId: u.id, strikes: hits.map((e) => ({ x: e.x, y: e.y })) });
  const dmg = n.dmg * power(u);
  hits.forEach((e, i) => {
    if (e.alive) sim.damage(e, dmg * Math.pow(n.fall, i), spec.src ?? 'storm', u.id);
  });
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Controle mental: atordoa o inimigo mais forte (sem chefe) ao alcance e o puxa até a vocação. */
const control: Behavior = ({ u, sim, n, spec }) => {
  let t: Unit | undefined;
  for (const e of sim.enemies()) {
    if (chebyshev(e, u) > n.range || GAME_CONFIG.bossKinds.includes(e.kind) || !sim.hasLineOfSight(u, e)) continue;
    if (!t || e.hp > t.hp || (e.hp === t.hp && e.id < t.id)) t = e;
  }
  if (!t) return false;
  sim.emit({ type: 'taunt', unitId: u.id, radius: n.range, pulled: [t.id] });
  sim.stun(t, n.stun);
  sim.pull(t, u, n.pull);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Armadilha de mina no caminho da horda, `ahead` casas à frente do inimigo mais próximo. */
const trap: Behavior = ({ u, sim, n, spec }) => {
  const t = nearestFoe(u, sim, n.range, false);
  if (!t) return false;
  const at = sim.pathAhead(t, 2);
  if (!at || !sim.placeTrap(u.id, at, n.dmg * power(u), 0, 1, { kind: 'mine', radius: n.radius, stunTicks: n.stun })) return false;
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Escudo: o aliado mais ferido ao alcance, todos numa área, ou a própria vocação. */
const shield: Behavior = ({ u, sim, n, spec }) => {
  let targets: Unit[];
  if (n.self) targets = [u];
  else if (n.radius > 0) targets = sim.sortedUnits('party').filter((a) => chebyshev(a, u) <= n.radius);
  else targets = [lowestAlly(u, sim, n.range, false)].filter((a): a is Unit => !!a);
  if (!targets.length) return false;
  for (const t of targets) sim.shieldAlly(u, t, n.absorb, n.ticks);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Cura: o aliado mais ferido ao alcance (`amount`), ou todos numa área (`pct` da vida máxima). */
const heal: Behavior = ({ u, sim, n, spec }) => {
  if (n.radius > 0) {
    const targets = sim.sortedUnits('party').filter((a) => chebyshev(a, u) <= n.radius && a.hp < a.maxHp);
    if (!targets.length) return false;
    for (const a of targets) {
      sim.emit({ type: 'divineHeal', unitId: u.id, targetId: a.id });
      sim.heal(a, n.pct * a.maxHp);
    }
  } else {
    const a = lowestAlly(u, sim, n.range, true);
    if (!a) return false;
    sim.emit({ type: 'divineHeal', unitId: u.id, targetId: a.id });
    sim.heal(a, n.amount);
  }
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Bênção: a party perto (ou a própria vocação) causa mais dano por um tempo. */
const bless: Behavior = ({ u, sim, n, spec }) => {
  const targets = n.self ? [u] : sim.sortedUnits('party').filter((a) => chebyshev(a, u) <= n.radius);
  sim.bless(u, targets, n.amp, n.ticks);
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

/** Guarda própria: reduz o dano recebido (100% = imune) por um tempo. */
const guard: Behavior = ({ u, sim, n, spec }) => {
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  setGuard(u, sim.tick, sim.tick + n.ticks, n.cut);
  sim.emit({ type: 'holyShield', unitId: u.id, targetId: u.id, ticks: n.ticks });
  return true;
};

/** Fúria: recargas mais curtas (multiplicador `cdMult`) por um tempo. */
const fury: Behavior = ({ u, sim, n, spec }) => {
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  u.furyUntil = sim.tick + n.ticks;
  u.furyMult = n.cdMult;
  sim.emit({ type: 'fury', unitId: u.id, ticks: n.ticks });
  return true;
};

/** Teleporte: salta até `range` casas para o tile livre mais longe do inimigo mais próximo (ao menos `minDist`). */
const blink: Behavior = ({ u, sim, n, spec }) => {
  const foes = sim.enemies();
  if (!foes.length) return false;
  const nowNear = Math.min(...foes.map((e) => chebyshev(e, u)));
  let best: Vec2 | undefined;
  let bestD = -1;
  for (let dy = -n.range; dy <= n.range; dy++) {
    for (let dx = -n.range; dx <= n.range; dx++) {
      const x = u.x + dx;
      const y = u.y + dy;
      if ((dx === 0 && dy === 0) || !sim.board.isWalkable(x, y) || sim.unitAt(x, y) || sim.board.isCity(x, y)) continue;
      const near = Math.min(...foes.map((e) => chebyshev(e, { x, y })));
      if (near < n.minDist || near <= nowNear) continue;
      if (near > bestD) {
        bestD = near;
        best = { x, y };
      }
    }
  }
  if (!best) return false;
  sim.relocate(u, best.x, best.y);
  sim.emit({ type: 'nova', unitId: u.id, x: best.x, y: best.y, radius: 1 });
  u.cooldowns[spec.id] = sim.tick + cdOf(u, sim, n.cd);
  return true;
};

const BEHAVIORS: Partial<Record<VocationBehavior, Behavior>> = {
  melee,
  charge,
  line,
  cone,
  areaSelf,
  areaTarget,
  bolt,
  chain,
  control,
  trap,
  shield,
  heal,
  bless,
  guard,
  fury,
  blink,
};

/** Passivas: refresca o que dão a cada tick (reflexo, aura) e anuncia cada uma no começo da luta. */
function passives(tree: VocationTreeSpec, u: Unit, sim: Simulation): void {
  const rv = passiveValue(u, 'revidar', 'pct');
  if (rv > 0) {
    u.reflectPct = rv;
    u.reflectUntil = Math.max(u.reflectUntil ?? 0, sim.tick + 2);
  }
  const aura = tree.skills.find((s) => s.behavior === 'auraGuard');
  const lvA = aura ? learnedLv(u, aura.id) : 0;
  if (aura && lvA) {
    const n = aura.num(lvA);
    for (const a of sim.sortedUnits('party')) if (chebyshev(a, u) <= n.radius) setGuard(a, sim.tick, sim.tick + 2, n.cut);
    if (sim.tick % 30 === 0) sim.emit({ type: 'holyShield', unitId: u.id, targetId: u.id, ticks: 20 });
  }
  if (sim.tick === 1) {
    for (const s of tree.skills) {
      const lv = learnedLv(u, s.id);
      if (s.kind === 'passive' && lv > 0) sim.emit({ type: 'cardProc', unitId: u.id, name: s.name, effect: s.effect(s.num(lv)) });
    }
  }
}

/** Dispara uma habilidade: exige aprendida (ou o básico) e recarga pronta, salvo CAST forçado. */
function castSpec(tree: VocationTreeSpec, spec: VocationSkillSpec, u: Unit, sim: Simulation, force: boolean): boolean {
  const basic = spec.id === tree.basic;
  const learned = learnedLv(u, spec.id);
  if (!basic && !learned && !force) return false;
  if (!force && !ready(u, sim, spec.id)) return false;
  const behavior = spec.behavior ? BEHAVIORS[spec.behavior] : undefined;
  if (!behavior) return false;
  return behavior({ u, sim, n: spec.num(Math.max(1, learned)), spec, force });
}

/** Arquétipo de uma vocação: as habilidades ativas (ordem da árvore) e as passivas a cada tick. */
export function vocationArchetype(id: string, maxHp: number): Archetype {
  const tree = VOCATION_TREES[id];
  const actives = tree.skills.filter((s) => s.kind === 'active');
  const skills: ArchetypeSkill[] = actives.map((spec) => ({ id: spec.id, cast: (u, sim, force) => castSpec(tree, spec, u, sim, force) }));
  return {
    id,
    maxHp,
    skills,
    update(u, sim) {
      passives(tree, u, sim);
      // só um golpe corpo a corpo por tick (a animação e a posição dependem dele); o resto dispara sem prioridade
      let meleeUsed = false;
      for (const spec of actives) {
        const isMelee = spec.behavior === 'melee' || spec.behavior === 'charge';
        if (isMelee && meleeUsed) continue;
        if (castSpec(tree, spec, u, sim, false) && isMelee) meleeUsed = true;
      }
    },
  };
}

