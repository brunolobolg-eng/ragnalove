import { ACTS } from '../../config/world';
import { phaseNumber, type RunState } from './run';

/**
 * Recordes entre jornadas (Ranking da tela inicial). Só guardam o que aconteceu de verdade:
 * recorde que nunca aconteceu fica ausente/zero e a tela mostra "???".
 */
export interface Records {
  /** Maior número de atos concluídos numa jornada ("Dificuldade zerada" enquanto não há seletor de dificuldade). */
  actsCleared: number;
  /** Maior fase alcançada. */
  farthestPhase: number;
  /** Jornada VENCIDA mais rápida, em tempo real jogado (ms). */
  fastestMs?: number;
  /** Maior dano total causado pela party numa jornada. */
  maxDamage: number;
  /** Maior nível de herói alcançado. */
  maxLevel: number;
  /** Melhor cerco (Survival): tempo, estágio e abates da maior resistência. Ausente = nunca jogado. */
  survivalBest?: { seconds: number; stage: number; kills: number };
}

export const emptyRecords = (): Records => ({ actsCleared: 0, farthestPhase: 0, maxDamage: 0, maxLevel: 0 });

/** Registra um cerco (Survival): só supera o recorde se sobreviveu mais tempo (desempate: mais abates). */
export function updateSurvivalBest(rec: Records, seconds: number, stage: number, kills: number): Records {
  const b = rec.survivalBest;
  if (b && (b.seconds > seconds || (b.seconds === seconds && b.kills >= kills))) return rec;
  return { ...rec, survivalBest: { seconds, stage, kills } };
}

/** Recordes atualizados com o estado atual da jornada (fim de onda, fim de fase, fim de jornada). */
export function updateRecords(rec: Records, r: RunState): Records {
  const won = r.ended === 'victory';
  return {
    actsCleared: Math.max(rec.actsCleared, won ? ACTS.length : r.act),
    farthestPhase: Math.max(rec.farthestPhase, phaseNumber(r)),
    fastestMs: won && r.playMs ? Math.min(rec.fastestMs ?? Infinity, r.playMs) : rec.fastestMs,
    maxDamage: Math.max(rec.maxDamage, Math.round(r.damage ?? 0)),
    maxLevel: Math.max(rec.maxLevel, ...r.party.map((h) => r.profile.heroes[h].level)),
    survivalBest: rec.survivalBest,
  };
}
