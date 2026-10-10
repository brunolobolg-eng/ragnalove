import type { SimEvent } from '../../../core/sim/types';
import { LEVELUP_FX as K } from '../../../config/fx/levelup';
import { HERO_NAME, HERO_ORDER } from '../../../config/heroes';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { DivineRiseFX, levelUpPalette } from './levelUpFx';

/**
 * Subida de nível do herói: feixe, asas, círculo de runas e auréola na cor da classe, com explosão e penas.
 * Repete o texto NÍVEL do caso padrão. Retorna true: assume o evento.
 */
export function handleLevelUp(e: SimEvent, c: CombatVisualCtx): boolean {
  if (e.type !== 'levelup') return false;
  const v = c.view(e.unitId);
  if (!v) return true;
  v.levelUp?.();
  const feet = v.root.position.clone().setY(0);
  const pal = levelUpPalette(c.kindOf(e.unitId));
  c.float(`NÍVEL ${e.level}!`, feet.clone().setY(K.text.height), pal.text, K.text.size, K.text.life, K.text.rise);
  c.add(new DivineRiseFX(c.kit, feet, pal));
  return true;
}

/** Uma subida de nível por classe, cada uma na cor do herói (a vitrine mostra as seis). */
export const LEVELUP_DEMOS: DemoEntry[] = HERO_ORDER.map(
  (k): DemoEntry => ({
    cls: k as DemoEntry['cls'],
    id: 'levelup',
    label: `Subida de nível: ${HERO_NAME[k]}`,
    span: K.life,
    steps: (ids) => [{ at: 0, e: { type: 'levelup', unitId: ids.caster, level: 5 } }],
  }),
);
