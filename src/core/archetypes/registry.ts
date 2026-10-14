import type { Archetype } from './Archetype';
import { archer } from './archer';
import { assassin } from './assassin';
import { crusado } from './crusado';
import { hypnomancer } from './hypnomancer';
import { mage } from './mage';
import { sorcerer } from './sorcerer';
import { warlock } from './warlock';
import { warrior } from './warrior';
import { vocationTreeId, type HeroKind } from '../progression/skills';

export const ARCHETYPES: Record<string, Archetype> = {
  [mage.id]: mage,
  [warrior.id]: warrior,
  [archer.id]: archer,
  [sorcerer.id]: sorcerer,
  [warlock.id]: warlock,
  [assassin.id]: assassin,
};

/** Arquétipos das vocações com árvore própria (o Bárbaro não está aqui: segue o do Guerreiro). */
export const VOCATION_ARCHETYPES: Record<string, Archetype> = {
  [crusado.id]: crusado,
  [hypnomancer.id]: hypnomancer,
};

/** Quem comanda a unidade: o arquétipo da vocação com árvore, senão o da classe. */
export function archetypeOf(kind: string, vocation?: string): Archetype {
  const tree = vocationTreeId(kind as HeroKind, vocation);
  return (tree && VOCATION_ARCHETYPES[tree]) || ARCHETYPES[kind];
}
