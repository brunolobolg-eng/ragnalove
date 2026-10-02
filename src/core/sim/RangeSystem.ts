import { GAME_CONFIG } from '../../config/gameConfig';
import type { Unit } from './types';

/**
 * Alcances dos heróis (RANGE SYSTEM) e modificadores de teste.
 *
 * Separa detectionRange / attackRange / preferredRange / maxCombatMoveDistance.
 * Os modificadores (`SimMods`) são temporários: vivem só na simulação em memória e nunca
 * mudam os valores base do GAME_CONFIG. Neutros (padrão), o jogo é exatamente o original.
 */

/** Ajustes temporários de um herói (Dev Lab). Ausente = valor do GAME_CONFIG. */
export interface HeroMods {
  attackRange?: number;
  detectionRange?: number;
  preferredRange?: number;
  maxCombatMoveDistance?: number;
  /** Ticks por passo (menor = mais rápido). */
  moveTicks?: number;
  /** Multiplicador de velocidade de ataque (2 = recargas pela metade). */
  attackSpeed?: number;
}

export interface SimMods {
  /** undefined = GAME_CONFIG.combatAI.enabled. */
  combatMovement?: boolean;
  /** Multiplicador do alcance dos heróis à distância (1 = desligado). */
  rangedRangeMult: number;
  /** Raio máximo de movimento para todos (undefined = o de cada herói). */
  maxCombatMoveDistance?: number;
  heroes: Record<string, HeroMods>;
}

export const neutralMods = (): SimMods => ({ rangedRangeMult: 1, heroes: {} });

export const isRanged = (kind: string): boolean => GAME_CONFIG.combatAI.rangedKinds.includes(kind);

/** Alcance base da arma do herói (sem modificadores): é o mesmo número que o arquétipo usa. */
export function baseAttackRange(u: Unit): number {
  const A = GAME_CONFIG.archetypes;
  switch (u.kind) {
    case 'archer':
      return u.stats?.arrowRange ?? A.archer.arrow.range;
    case 'mage':
      return u.stats?.boltRange ?? A.mage.frostBolt.range;
    case 'sorcerer':
      return A.sorcerer.orb.range;
    case 'warlock':
      return A.warlock.drain.range;
    default:
      return GAME_CONFIG.combatAI.heroes[u.kind]?.attackRange ?? 1.5;
  }
}

/** Multiplicador de alcance só dos modificadores de teste (1 com mods neutros). */
export function testRangeMult(u: Unit, mods: SimMods): number {
  if (!isRanged(u.kind)) return 1;
  const o = mods.heroes[u.kind]?.attackRange;
  const ratio = o !== undefined ? o / Math.max(0.01, baseAttackRange(u)) : 1;
  return mods.rangedRangeMult * ratio;
}

export interface CombatProfile {
  ranged: boolean;
  detectionRange: number;
  /** Alcance efetivo (já com tempestade e modificadores de teste). */
  attackRange: number;
  preferredRange: number;
  maxCombatMoveDistance: number;
  moveTicks: number;
  attackSpeed: number;
}

/** Números de combate efetivos do herói agora. `envMult` = multiplicador do ambiente (tempestade). */
export function combatProfile(u: Unit, mods: SimMods, envMult: number): CombatProfile {
  const C = GAME_CONFIG.combatAI;
  const base = C.heroes[u.kind] ?? C.heroes.warrior;
  const m = mods.heroes[u.kind] ?? {};
  const ranged = isRanged(u.kind);
  const attackRange = ranged ? baseAttackRange(u) * envMult * testRangeMult(u, mods) : (m.attackRange ?? baseAttackRange(u));
  const pref = m.preferredRange ?? base.preferredRange * (ranged ? mods.rangedRangeMult : 1);
  return {
    ranged,
    detectionRange: m.detectionRange ?? base.detectionRange,
    attackRange,
    preferredRange: Math.min(pref, attackRange),
    maxCombatMoveDistance: m.maxCombatMoveDistance ?? mods.maxCombatMoveDistance ?? base.maxCombatMoveDistance,
    moveTicks: Math.max(1, Math.round(m.moveTicks ?? base.moveTicks)),
    attackSpeed: m.attackSpeed ?? 1,
  };
}
