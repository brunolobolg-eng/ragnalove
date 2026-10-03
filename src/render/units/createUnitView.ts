import { ModelUnitView, MODELS } from './model/ModelUnitView';
import { SPRITES, SpriteUnitView } from './SpriteUnitView';
import { UnitView } from './UnitView';
import { ACT_MONSTERS, MONSTER_MODELS } from '../../config/visualConfig';
import { skinKind } from './model/glbMonsters';
import { ZONE_STATE } from '../../config/gameConfig';
import { REGIONS } from '../../config/world';

/** Ato da zona em jogo (undefined fora da rota). */
function currentAct(): number | undefined {
  return REGIONS.find((r) => r.zone === ZONE_STATE.current.id && r.act !== undefined)?.act;
}

/**
 * Dev Lab (F8): força a aparência dos próximos inimigos. `act` undefined = a do mapa atual,
 * null = modelo antigo (procedural); `skin` undefined = cor sorteada, 0 = original, n = variante n.
 */
export const DEV_VISUAL: { act?: number | null; skin?: number } = {};

/** Modelo 3D do inimigo conforme o ato (ratos no I, goblins no II); cai no original se o GLB ainda não carregou. */
function actModel(kind: string, team: 'party' | 'enemy'): string {
  if (team !== 'enemy') return kind;
  const act = DEV_VISUAL.act === undefined ? currentAct() : (DEV_VISUAL.act ?? undefined);
  const alt = act === undefined ? undefined : ACT_MONSTERS[act]?.[kind];
  return alt && MODELS[alt] ? withSkin(alt) : kind;
}

/** Sorteia a cor do inimigo entre a original e as variantes já carregadas (só visual: a simulação não muda). */
function withSkin(kind: string): string {
  const s = DEV_VISUAL.skin;
  if (s !== undefined) return s > 0 && MODELS[skinKind(kind, s)] ? skinKind(kind, s) : kind;
  const n = MONSTER_MODELS[kind]?.skins?.length ?? 0;
  const options = [kind];
  for (let i = 1; i <= n; i++) if (MODELS[skinKind(kind, i)]) options.push(skinKind(kind, i));
  return options[Math.floor(Math.random() * options.length)];
}

/** Tipos novos sem sprite próprio usam o de um parecido no modo 2D. */
const SPRITE_ALIAS: Record<string, string> = { elite: 'brute', boss2: 'boss', orcboss: 'boss', necro: 'grunt' };

export type AnyUnitView = UnitView | SpriteUnitView | ModelUnitView;
export type UnitStyle = '3d' | 'sprites';

/** Estilo escolhido nas Configurações (3D é o padrão; sprites 2D ficam como alternativa leve). */
export const UNIT_STYLE: { value: UnitStyle } = { value: '3d' };

export function createUnitView(kind: string, team: 'party' | 'enemy'): AnyUnitView {
  if (UNIT_STYLE.value === '3d' && MODELS[kind]) return new ModelUnitView(actModel(kind, team), team);
  const sk = SPRITES[kind] ? kind : SPRITE_ALIAS[kind];
  return sk && SPRITES[sk] ? new SpriteUnitView(sk, team) : new UnitView(kind, team);
}
