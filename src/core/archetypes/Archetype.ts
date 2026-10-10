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
  /**
   * Chamado uma vez por tick enquanto a unidade está viva. Cada habilidade pronta (recarga zerada e alvo
   * válido) dispara NO SEU TICK, sem prioridade entre elas: duas ou mais prontas no mesmo tick saem juntas
   * (uma animação de conjuração, os efeitos de todas). Só o ataque corpo a corpo do Guerreiro é escolhido
   * (um golpe por vez, porque a animação e a posição dependem dele).
   */
  update(unit: Unit, sim: Simulation): void;
  /** Habilidades ativas. A ordem da lista só desempata o que resolve no mesmo tick (determinismo), não decide quem dispara. */
  skills: ArchetypeSkill[];
}
