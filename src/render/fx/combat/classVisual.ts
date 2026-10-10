import type { SimEvent } from '../../../core/sim/types';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { handleArcher, ARCHER_DEMOS } from './archer';
import { handleAssassin, ASSASSIN_DEMOS } from './assassin';
import { handleMage, MAGE_DEMOS } from './mage';
import { handleWarrior, WARRIOR_DEMOS } from './warrior';
import { handleSorcerer, SORCERER_DEMOS } from './sorcerer';
import { handleWarlock, WARLOCK_DEMOS } from './warlock';
import { handleLevelUp, LEVELUP_DEMOS } from './levelUp';
import { handleShared, SHARED_DEMOS } from './shared';

type Handler = (e: SimEvent, c: CombatVisualCtx) => boolean;

const BY_KIND: Record<string, Handler> = {
  mage: handleMage,
  warrior: handleWarrior,
  archer: handleArcher,
  assassin: handleAssassin,
  sorcerer: handleSorcerer,
  warlock: handleWarlock,
};

/** Todas as demonstrações (a vitrine de efeitos lê daqui). */
export const ALL_DEMOS: DemoEntry[] = [...MAGE_DEMOS, ...WARRIOR_DEMOS, ...ARCHER_DEMOS, ...ASSASSIN_DEMOS, ...SORCERER_DEMOS, ...WARLOCK_DEMOS, ...LEVELUP_DEMOS, ...SHARED_DEMOS];

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
  // subida de nível: efeito divino do próprio herói, seja qual for a classe
  if (e.type === 'levelup') return handleLevelUp(e, c);
  // efeitos sem autor de classe (combustão)
  if (e.type === 'combust') return handleShared(e, c);
  // objetos criados em batalha (Muralha do Guerreiro): o handler decide se é parede
  if (e.type === 'objectSpawn') return handleWarrior(e, c);
  // dano devolvido pelo Limite da Morte: não tem sourceId (sem autor de classe), então vai direto ao Guerreiro.
  // Nos danos a classe só adiciona impacto: o caso padrão do GameView (número, reação) continua
  if (e.type === 'damage' && e.source === 'reflect') {
    handleWarrior(e, c);
    return false;
  }
  const id = casterOf(e);
  if (id === undefined) return false;
  const kind = c.kindOf(id);
  const handler = kind ? BY_KIND[kind] : undefined;
  if (!handler) return false;
  const consumed = handler(e, c);
  return e.type === 'damage' ? false : consumed;
}
