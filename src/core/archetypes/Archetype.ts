import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';

/**
 * Contrato de um arquétipo da party. Novo personagem (arqueiro, clérigo...) =
 * novo arquivo implementando isto + registro em `registry.ts`.
 */
export interface Archetype {
  id: string;
  maxHp: number;
  /** Chamado uma vez por tick enquanto a unidade está viva. */
  update(unit: Unit, sim: Simulation): void;
}
