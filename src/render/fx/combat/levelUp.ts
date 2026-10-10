import type { SimEvent } from '../../../core/sim/types';
import { LEVELUP_FX as K } from '../../../config/fx/levelup';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { DivineRiseFX } from './levelUpFx';

/**
 * Subida de nível do herói: explosão divina e um anjo branco que se mostra acima dele, depois some em luz.
 * Substitui o efeito antigo e repete o texto NÍVEL do caso padrão. Retorna true: assume o evento.
 */
export function handleLevelUp(e: SimEvent, c: CombatVisualCtx): boolean {
  if (e.type !== 'levelup') return false;
  const v = c.view(e.unitId);
  if (!v) return true;
  v.levelUp?.();
  const feet = v.root.position.clone().setY(0);
  c.float(`NÍVEL ${e.level}!`, feet.clone().setY(K.text.height), K.text.color, K.text.size, K.text.life, K.text.rise);
  c.add(new DivineRiseFX(c.kit, feet));
  return true;
}

export const LEVELUP_DEMOS: DemoEntry[] = [
  {
    cls: 'mage',
    id: 'levelup',
    label: 'Subida de nível: explosão divina e anjo branco',
    span: K.life,
    steps: (ids) => [{ at: 0, e: { type: 'levelup', unitId: ids.caster, level: 5 } }],
  },
];
