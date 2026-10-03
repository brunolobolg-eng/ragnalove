import type { Archetype } from './Archetype';
import { archer } from './archer';
import { assassin } from './assassin';
import { mage } from './mage';
import { sorcerer } from './sorcerer';
import { warlock } from './warlock';
import { warrior } from './warrior';

export const ARCHETYPES: Record<string, Archetype> = {
  [mage.id]: mage,
  [warrior.id]: warrior,
  [archer.id]: archer,
  [sorcerer.id]: sorcerer,
  [warlock.id]: warlock,
  [assassin.id]: assassin,
};
