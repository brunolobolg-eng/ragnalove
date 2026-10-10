import { ModelUnitView, MODELS } from './model/ModelUnitView';
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
  const model = alt && MODELS[alt] ? alt : kind;
  // o sorteio de cor passa por todo inimigo com modelo (mini-chefe dino entra direto, sem ato)
  return MODELS[model] ? withSkin(model) : model;
}

/**
 * Sorteia a cor do inimigo (só visual: a simulação não muda). Monstro com `themeColors` (dinos) sorteia
 * só entre as cores do tema da zona em jogo; os demais, entre a original e as variantes já carregadas.
 */
function withSkin(kind: string): string {
  const s = DEV_VISUAL.skin;
  if (s !== undefined) return s > 0 && MODELS[skinKind(kind, s)] ? skinKind(kind, s) : kind;
  const v = MONSTER_MODELS[kind];
  const options: string[] = [];
  if (v?.themeColors) {
    const zone = ZONE_STATE.current;
    for (const name of v.themeColors[zone.id] ?? v.themeColors[zone.theme] ?? []) {
      if (name === 'azul') options.push(kind);
      else {
        const i = (v.skinNames ?? []).indexOf(name) + 1;
        if (MODELS[skinKind(kind, i)]) options.push(skinKind(kind, i));
      }
    }
    // a textura do tema ainda não carregou: fica o original (some assim que a variante chega)
    if (!options.length) options.push(kind);
  } else {
    options.push(kind);
    const n = v?.skins?.length ?? 0;
    for (let i = 1; i <= n; i++) if (MODELS[skinKind(kind, i)]) options.push(skinKind(kind, i));
  }
  return options[Math.floor(Math.random() * options.length)];
}

/** Tipo de unidade da simulação → a view usada (3D quando há modelo; procedural enquanto o GLB não chega). */
export type AnyUnitView = UnitView | ModelUnitView;

export function createUnitView(kind: string, team: 'party' | 'enemy'): AnyUnitView {
  return MODELS[kind] ? new ModelUnitView(actModel(kind, team), team) : new UnitView(kind, team);
}
