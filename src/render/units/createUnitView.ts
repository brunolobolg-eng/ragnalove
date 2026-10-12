import { ModelUnitView, MODELS } from './model/ModelUnitView';
import { UnitView } from './UnitView';
import { ACT_MONSTERS, BASTION_MONSTERS, MONSTER_MODELS } from '../../config/visualConfig';
import { skinKind } from './model/glbMonsters';
import { ZONE_STATE } from '../../config/gameConfig';
import { REGIONS } from '../../config/world';
import { BASTION_ZONE_ID } from '../../config/bastion';

/** Ato da zona em jogo (undefined fora da rota). */
function currentAct(): number | undefined {
  return REGIONS.find((r) => r.zone === ZONE_STATE.current.id && r.act !== undefined)?.act;
}

/**
 * Dev Lab (F8): força a aparência dos próximos inimigos. `act` undefined = a do mapa atual,
 * null = modelo antigo (procedural); `skin` undefined = cor sorteada, 0 = original, n = variante n.
 */
export const DEV_VISUAL: { act?: number | null; skin?: number } = {};

/**
 * Tabela de visual dos inimigos da zona em jogo: no Último Bastião, o conjunto da horda (sem ato); na campanha,
 * o do ato. O Dev Lab (look forçado) vence as duas.
 */
function enemyVisuals(): Record<string, string> | undefined {
  if (DEV_VISUAL.act === undefined && ZONE_STATE.current.id === BASTION_ZONE_ID) return BASTION_MONSTERS;
  const act = DEV_VISUAL.act === undefined ? currentAct() : (DEV_VISUAL.act ?? undefined);
  return act === undefined ? undefined : ACT_MONSTERS[act];
}

/** Modelo 3D do inimigo conforme a zona (ratos no I, goblins no II, zumbis no Bastião); cai no original se o GLB ainda não carregou. */
function actModel(kind: string, team: 'party' | 'enemy'): string {
  if (team !== 'enemy') return kind;
  const alt = enemyVisuals()?.[kind];
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

/** `visual` = modelo da vocação do herói; sem ele (ou ainda não carregado) usa o da classe. */
export function createUnitView(kind: string, team: 'party' | 'enemy', visual?: string): AnyUnitView {
  const key = team === 'party' && visual && MODELS[visual] ? visual : kind;
  return MODELS[key] ? new ModelUnitView(actModel(key, team), team, kind) : new UnitView(kind, team);
}
