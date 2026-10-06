import { GAME_CONFIG } from '../../config/gameConfig';
import { DIRS8, isDiagonal, type Vec2 } from '../grid/types';
import { combatProfile, type CombatProfile } from './RangeSystem';
import type { Simulation } from './Simulation';
import type { CombatAIStateName, Unit } from './types';

/**
 * Movimento de combate dos heróis (camada autoritativa, determinístico).
 *
 * Tático, curto e automático: o herói continua no seu posto e só anda até
 * `maxCombatMoveDistance` tiles dele para entrar no alcance, perseguir de leve,
 * manter a distância (à distância) e voltar ao posto quando não há mais alvo.
 * Anti-tremedeira: um passo por vez (espera o passo terminar), só anda se o passo
 * melhorar o objetivo em `minStepGain`, volta ao posto só depois de `returnDelayTicks`
 * sem alvo, quem está chegando segue até a distância preferida, e recuo tem recarga.
 */

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Ordem de movimento do jogador: muda o posto do herói (a IA anda até lá
 * e passa a agir em volta do novo posto). Vale no planejamento e na horda.
 */
export function orderMove(u: Unit, x: number, y: number): void {
  const ai = (u.ai ??= { homeX: u.x, homeY: u.y, state: 'IDLE', idleTicks: 0, lastRetreatTick: -1e9 });
  ai.homeX = x;
  ai.homeY = y;
  ai.idleTicks = 0;
  ai.reason = undefined;
}

export function updateCombatMovement(u: Unit, sim: Simulation): void {
  const C = GAME_CONFIG.combatAI;
  const ai = (u.ai ??= { homeX: u.x, homeY: u.y, state: 'IDLE', idleTicks: 0, lastRetreatTick: -1e9 });
  const st = sim.moveStats(u.kind);
  // ainda no meio de um passo: decide quando chegar no tile
  if (sim.tick < u.moveStartTick + u.moveTicks) {
    st.ticksMoving++;
    return;
  }
  const p = combatProfile(u, sim.mods, sim.rangeMult);
  const home = { x: ai.homeX, y: ai.homeY };
  const set = (s: CombatAIStateName) => {
    if (s !== ai.state && (s === 'MOVE_TO_ATTACK_RANGE' || s === 'RETURN_TO_POSITION')) st.repositions++;
    ai.state = s;
  };
  ai.reason = undefined;

  const target = pickTarget(u, sim, p, home);
  if (!target) {
    ai.targetId = undefined;
    if (u.x === home.x && u.y === home.y) {
      ai.idleTicks = 0;
      return set('IDLE');
    }
    if (++ai.idleTicks < C.returnDelayTicks) return set('IDLE');
    return set(step(u, sim, p, home, (t) => dist(t, home), true) ? 'RETURN_TO_POSITION' : 'IDLE');
  }
  ai.idleTicks = 0;
  ai.targetId = target.id;
  const d = dist(u, target);
  const canHit = d <= p.attackRange + 1e-6 && (!p.ranged || sim.hasLineOfSight(u, target));
  const attack = () => {
    st.ticksAttacking++;
    set('ATTACK');
  };

  if (p.ranged) {
    // inimigo colado: um passo para trás (dentro do raio máximo, com recarga — sem kite infinito)
    if (d <= C.retreatDistance && sim.tick - ai.lastRetreatTick >= C.retreatCooldownTicks && step(u, sim, p, home, (t) => -dist(t, target))) {
      ai.lastRetreatTick = sim.tick;
      return set('MOVE_TO_ATTACK_RANGE');
    }
    // quem está chegando segue até a distância preferida (histerese: não para na borda do alcance)
    const approaching = ai.state === 'MOVE_TO_ATTACK_RANGE' && d > p.preferredRange;
    if (canHit && !approaching) return attack();
    const los = sim.hasLineOfSight(u, target);
    if (step(u, sim, p, home, (t) => (los ? Math.max(0, dist(t, target) - p.preferredRange) : dist(t, target)))) return set('MOVE_TO_ATTACK_RANGE');
    if (canHit) return attack();
    ai.reason = 'limite';
    return set('IDLE');
  }

  // corpo a corpo: avança até ficar colado
  if (canHit) return attack();
  if (step(u, sim, p, home, (t) => dist(t, target))) return set('MOVE_TO_ATTACK_RANGE');
  ai.reason = 'limite';
  set('IDLE');
}

/** Inimigo visível mais próximo, dentro da agressão e que dá para atacar sem sair do raio máximo. */
function pickTarget(u: Unit, sim: Simulation, p: CombatProfile, home: Vec2): Unit | undefined {
  let best: Unit | undefined;
  let bestD = Infinity;
  for (const e of sim.visibleEnemies()) {
    const d = dist(u, e);
    if (d > p.aggressionRange || d >= bestD) continue;
    if (dist(e, home) > p.maxCombatMoveDistance + p.attackRange) continue;
    best = e;
    bestD = d;
  }
  return best;
}

/** Dá um passo no vizinho que mais reduz `f` (se melhorar o bastante). `homeward` ignora o raio. */
function step(u: Unit, sim: Simulation, p: CombatProfile, home: Vec2, f: (t: Vec2) => number, homeward = false): boolean {
  const C = GAME_CONFIG.combatAI;
  let best: Vec2 | undefined;
  let bestV = f(u) - C.minStepGain;
  for (const d of DIRS8) {
    const t = { x: u.x + d.x, y: u.y + d.y };
    if (!sim.canHeroStep(u, d)) continue;
    if (!homeward && dist(t, home) > p.maxCombatMoveDistance + 1e-6) continue;
    const v = f(t);
    if (v < bestV) {
      bestV = v;
      best = d;
    }
  }
  if (!best) return false;
  const diag = isDiagonal(best);
  sim.stepUnit(u, best, Math.max(1, Math.round(p.moveTicks * (diag ? C.diagonalMult : 1))));
  sim.moveStats(u.kind).tilesMoved += diag ? Math.SQRT2 : 1;
  return true;
}
