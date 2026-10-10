import type { SimEvent } from '../../../core/sim/types';

/** Classes que têm visual próprio de combate. */
export type FxClass = 'mage' | 'warrior' | 'archer' | 'assassin' | 'sorcerer' | 'warlock';

/** Ids usados pela vitrine: o conjurador e três inimigos (grunts) em tiles fixos. */
export interface DemoIds {
  caster: number;
  t1: number;
  t2: number;
  t3: number;
}

/** Evento da demonstração, disparado `at` segundos depois do início. */
export interface DemoStep {
  at: number;
  e: SimEvent;
}

/**
 * Uma habilidade (ou ataque básico) demonstrável na vitrine. Os eventos são os mesmos que a simulação emite,
 * então a vitrine exercita exatamente o caminho que o jogo usa.
 * Posições (tiles): conjurador em (0,0); t1 em (3,0); t2 em (3,1); t3 em (4,-1).
 */
export interface DemoEntry {
  /** classe do conjurador (define o modelo e o lado da cena na vitrine) */
  cls: FxClass;
  /** identificador curto: "bolt", "nova", "backstab"... (a vitrine usa "classe/id") */
  id: string;
  label: string;
  /** duração total da demonstração (s) */
  span: number;
  steps: (ids: DemoIds) => DemoStep[];
}
