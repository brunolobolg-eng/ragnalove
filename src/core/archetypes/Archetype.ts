import type { Unit } from '../sim/types';
import type { Simulation } from '../sim/Simulation';

/**
 * Uma habilidade do arquétipo. `cast` é a MESMA função que a IA usa na onda;
 * `force` (CAST do Dev Lab) ignora recarga, nível mínimo e o mínimo de alvos,
 * mas continua precisando de um alvo válido. Devolve true se conjurou.
 */
export interface ArchetypeSkill {
  id: string;
  cast(unit: Unit, sim: Simulation, force: boolean): boolean;
}

/**
 * Contrato de um arquétipo da party. Novo personagem (arqueiro, clérigo...) =
 * novo arquivo implementando isto + registro em `registry.ts`.
 */
export interface Archetype {
  id: string;
  maxHp: number;
  /** Chamado uma vez por tick enquanto a unidade está viva. */
  update(unit: Unit, sim: Simulation): void;
  /** Habilidades ativas, na ordem de prioridade da IA. */
  skills: ArchetypeSkill[];
}
