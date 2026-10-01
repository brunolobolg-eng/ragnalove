import type { Archetype } from './Archetype';
import { archer } from './archer';
import { mage } from './mage';
import { warrior } from './warrior';

export const ARCHETYPES: Record<string, Archetype> = {
  [mage.id]: mage,
  [warrior.id]: warrior,
  [archer.id]: archer,
};
