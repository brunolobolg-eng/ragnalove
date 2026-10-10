import * as THREE from 'three';
import type { SimEvent } from '../../../core/sim/types';
import { WARRIOR_RUNIC_FX as C } from '../../../config/fx/warriorRunic';
import type { CombatVisualCtx, VisualUnit } from './CombatVisualCtx';
import {
  DeathBoundFX,
  EnchantBladeFX,
  SonicWaveFX,
  SpearRainFX,
  WindCutterFX,
  nearestMark,
  reflectSpark,
} from './warriorRunicFx';

/** Uma Lâmina Encantada por Guerreiro: religar enquanto já brilha atualiza a que existe, sem empilhar. */
const auras = new WeakMap<VisualUnit, EnchantBladeFX>();

/** Vira o herói para `to`, com a mesma regra de `stepTowards` do warrior.ts (não importo de lá: evita ciclo). */
function faceToward(view: VisualUnit | undefined, from: THREE.Vector3 | undefined, to: THREE.Vector3): void {
  if (!view || !from) return;
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  view.setFacing(Math.abs(dx) < 0.5 ? 0 : Math.sign(dx), Math.abs(dz) < 0.5 ? 0 : Math.sign(dz), true);
}

/**
 * Visual do Cavaleiro Rúnico (Guerreiro): Lâmina Encantada, Onda Sônica, Limite da Morte, Cem Lanças, Cortador de
 * Vento e a faísca do dano devolvido pelo Limite da Morte. Retorna true quando assume o evento.
 */
export function handleWarriorRunic(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'enchantBlade': {
      const view = c.view(e.unitId);
      if (!view) return true;
      const cur = auras.get(view);
      if (cur && !cur.done) cur.refresh(e.ticks);
      else {
        const fx = new EnchantBladeFX(c.kit, view, () => c.staffTip(e.unitId), e.ticks);
        auras.set(view, fx);
        c.add(fx);
      }
      view.cast();
      c.float('Lâmina Encantada!', view.root.position.clone().setY(C.enchant.floatHeight), C.enchant.floatColor, C.enchant.floatSize, C.enchant.floatLife);
      return true;
    }
    case 'sonicWave': {
      const view = c.view(e.unitId);
      view?.setFacing(Math.sign(e.x - e.fromX), Math.sign(e.y - e.fromY), true);
      view?.attack();
      c.spectre(e.unitId, C.sonic.spectre);
      c.add(new SonicWaveFX(c.tile(e.fromX, e.fromY, C.sonic.lift), c.tile(e.x, e.y, C.sonic.lift), c.kit));
      return true;
    }
    case 'deathBound': {
      c.view(e.unitId)?.cast();
      c.add(new DeathBoundFX(c.kit, c.view(e.targetId), c.tile(e.x, e.y, 0), e.ticks));
      c.float('Limite da Morte!', c.tile(e.x, e.y, C.death.floatHeight), C.death.floatColor, C.death.floatSize, C.death.floatLife);
      return true;
    }
    case 'hundredSpear': {
      const view = c.view(e.unitId);
      const center = c.tile(e.x, e.y, 0);
      faceToward(view, c.pos(e.unitId), center);
      view?.cast();
      c.spectre(e.unitId, C.spear.spectre);
      // alvo principal primeiro, depois os vizinhos (sem repetir), com o limite de alvos da vitrine
      const seen = new Set<string>();
      const targets: THREE.Vector3[] = [];
      for (const t of [{ x: e.x, y: e.y }, ...e.tiles]) {
        const key = `${t.x},${t.y}`;
        if (seen.has(key) || targets.length >= C.spear.maxTargets) continue;
        seen.add(key);
        targets.push(c.tile(t.x, t.y, 0));
      }
      c.add(new SpearRainFX(center, targets, e.hits, e.radius, c.kit));
      c.float('Cem Lanças!', center.clone().setY(C.spear.floatHeight), C.spear.floatColor, C.spear.floatSize, C.spear.floatLife);
      return true;
    }
    case 'windCutter': {
      const view = c.view(e.unitId);
      const center = c.pos(e.unitId) ?? c.tile(e.x, e.y, 0);
      view?.attack();
      c.spectre(e.unitId, C.wind.spectre);
      c.add(new WindCutterFX(center, e.radius, e.tiles.map((t) => c.tile(t.x, t.y, 0)), c.kit));
      c.float('Cortador de Vento!', center.clone().setY(C.wind.floatHeight), C.wind.floatColor, C.wind.floatSize, C.wind.floatLife);
      return true;
    }
    case 'damage': {
      // dano devolvido pelo Limite da Morte: chega sem sourceId; só o Guerreiro que apanhou ganha a faísca
      if (e.source !== 'reflect' || c.kindOf(e.unitId) !== 'warrior') return false;
      const base = c.pos(e.unitId);
      if (!base) return false;
      const chest = base.setY(C.reflect.height);
      const from = nearestMark(chest);
      // sem marca viva não há de onde sair a faísca: não inventa origem
      if (!from) return false;
      c.add(reflectSpark(c.kit, from.setY(C.reflect.height), chest));
      return true;
    }
    default:
      return false;
  }
}
