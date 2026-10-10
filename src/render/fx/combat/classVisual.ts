import type { SimEvent } from '../../../core/sim/types';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { handleArcher, ARCHER_DEMOS } from './archer';
import { handleAssassin, ASSASSIN_DEMOS } from './assassin';
import { handleMage, MAGE_DEMOS } from './mage';
import { handleWarrior, WARRIOR_DEMOS } from './warrior';

type Handler = (e: SimEvent, c: CombatVisualCtx) => boolean;

const BY_KIND: Record<string, Handler> = {
  mage: handleMage,
  warrior: handleWarrior,
  archer: handleArcher,
  assassin: handleAssassin,
};

/** Todas as demonstrações (a vitrine de efeitos lê daqui). */
export const ALL_DEMOS: DemoEntry[] = [...MAGE_DEMOS, ...WARRIOR_DEMOS, ...ARCHER_DEMOS, ...ASSASSIN_DEMOS];

/** Autor visual do evento: atacante, conjurador ou dono do efeito (nos danos, quem causou). */
function casterOf(e: SimEvent): number | undefined {
  switch (e.type) {
    case 'damage':
      return e.sourceId;
    case 'effectStart':
      return e.effect.ownerId;
    case 'trapSet':
    case 'trapTrigger':
    case 'objectSpawn':
    case 'combust':
      return undefined;
    default:
      return 'unitId' in e ? e.unitId : undefined;
  }
}

/**
 * Entrega o evento para a classe do autor. Retorna true quando a classe assumiu o evento
 * (o GameView então não desenha o caso padrão). Nos danos, a classe só adiciona impacto: nunca consome.
 */
export function classVisual(e: SimEvent, c: CombatVisualCtx): boolean {
  if (e.type === 'trapSet' || e.type === 'trapTrigger') return handleArcher(e, c);
  // objetos criados em batalha (Muralha do Guerreiro): o handler decide se é parede
  if (e.type === 'objectSpawn') return handleWarrior(e, c);
  const id = casterOf(e);
  if (id === undefined) return false;
  const kind = c.kindOf(id);
  const handler = kind ? BY_KIND[kind] : undefined;
  if (!handler) return false;
  const consumed = handler(e, c);
  return e.type === 'damage' ? false : consumed;
}
