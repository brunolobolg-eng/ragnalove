import { ModelUnitView, MODELS } from './model/ModelUnitView';
import { SPRITES, SpriteUnitView } from './SpriteUnitView';
import { UnitView } from './UnitView';

/** Tipos novos sem sprite próprio usam o de um parecido no modo 2D. */
const SPRITE_ALIAS: Record<string, string> = { elite: 'brute', boss2: 'boss', orcboss: 'boss', necro: 'grunt' };

export type AnyUnitView = UnitView | SpriteUnitView | ModelUnitView;
export type UnitStyle = '3d' | 'sprites';

/** Estilo escolhido nas Configurações (3D é o padrão; sprites 2D ficam como alternativa leve). */
export const UNIT_STYLE: { value: UnitStyle } = { value: '3d' };

export function createUnitView(kind: string, team: 'party' | 'enemy'): AnyUnitView {
  if (UNIT_STYLE.value === '3d' && MODELS[kind]) return new ModelUnitView(kind, team);
  const sk = SPRITES[kind] ? kind : SPRITE_ALIAS[kind];
  return sk && SPRITES[sk] ? new SpriteUnitView(sk, team) : new UnitView(kind, team);
}
