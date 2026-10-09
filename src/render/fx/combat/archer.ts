import * as THREE from 'three';
import { ARCHER_FX as F } from '../../../config/fx/archer';
import type { SimEvent, Trap, TrapKind } from '../../../core/sim/types';
import { ArrowFX, RainFX } from '../SkillFX';
import { groundCircle } from '../kit/Shapes';
import { ArcherArrowFX, ArcherFocusFX, ArcherPierceFX, ArcherRainFX, ArcherTrapFX } from './archerFx';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry, DemoIds, DemoStep } from './demos';

/** Dono de cada armadilha armada: a claymore usa a direção da arqueira para a armadilha. Limpo ao disparar. */
const trapOwner = new Map<number, number>();
const TRAP_OWNER_MAX = 64;

const toColor = (a: readonly number[]): THREE.Color => new THREE.Color(a[0], a[1], a[2]);

/**
 * Visual da Arqueira: flechas (básica e crítica), Chuva de Flechas (e Incendiária), Flecha Perfurante, Foco do
 * Caçador e armadilhas. Retorna true quando assume o evento (o GameView então pula o caso padrão, e este
 * repete o que importa dele: ataque, virada, espectro e textos). Para `trapSet` retorna false: o GameView cria a malha.
 */
export function handleArcher(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'arrow': {
      // o caso padrão: ataque, virada para o alvo e disparo (o alvo reage no impacto, adiado pelo GameView)
      const v = c.view(e.unitId);
      if (v) {
        v.attack();
        v.setFacing(Math.sign(e.to.x - e.from.x), Math.sign(e.to.y - e.from.y));
      }
      const tip = c.bowTip(e.unitId, e.from);
      const hit = c.tile(e.to.x, e.to.y, 0.6);
      // o texto CRÍTICO! aparece no impacto, junto com o número do dano
      const toTile = { x: e.to.x, y: e.to.y };
      const onImpact = e.crit
        ? () => {
            c.float('CRÍTICO!', c.tile(toTile.x, toTile.y, F.crit.textLift), '#ffd84a', 0.3);
            c.shake(F.crit.shake);
          }
        : undefined;
      c.add(new ArcherArrowFX(c.kit, c.kit.stage.camera, tip, hit, e.crit, onImpact));
      c.spectre(e.unitId, F.arrow.spectreSec);
      return true;
    }
    case 'rain': {
      // o caso padrão: gesto de disparo e espectro
      c.view(e.unitId)?.cast();
      c.spectre(e.unitId, F.rain.spectreSec);
      c.add(new ArcherRainFX(c.kit, c.kit.stage.camera, c.tile(e.x, e.y), e.radius, !!e.fire, () => c.shake(F.rain.shake)));
      return true;
    }
    case 'pierce': {
      // o caso padrão: ataque pesado
      c.view(e.unitId)?.attack('heavy');
      c.add(new ArcherPierceFX(c.kit, c.kit.stage.camera, c.bowTip(e.unitId, e.from), c.tile(e.to.x, e.to.y, 0.9), () => c.kick(F.pierce.kick)));
      return true;
    }
    case 'focus': {
      // o caso padrão: gesto, texto FOCO! e o efeito do foco (o aura dura o buff: ticks / 10 segundos)
      const v = c.view(e.unitId);
      if (v) {
        v.cast();
        c.float('FOCO!', v.root.position.clone().setY(2.3), '#8aff8a', 0.4, 1.2);
        c.add(new ArcherFocusFX(c.kit, v.root, Math.max(0.5, e.ticks / 10)));
      }
      return true;
    }
    case 'trapSet': {
      // armada: marca fraca no chão (o GameView cria a malha da armadilha, por isso retorna false)
      if (trapOwner.size >= TRAP_OWNER_MAX) trapOwner.clear();
      trapOwner.set(e.trap.id, e.trap.ownerId);
      const kind: TrapKind = e.trap.kind ?? 'snare';
      const radius = F.trap.markBase + F.trap.markPerRadius * (e.trap.radius ?? 1);
      groundCircle(c.kit, c.tile(e.trap.x, e.trap.y), { radius, color: toColor(F.trap.markColor[kind]), life: F.trap.markLife, kind: 'ring', grow: 0.5 });
      return false;
    }
    case 'trapTrigger': {
      // disparada: a malha sai (o GameView não faz isso quando o evento é assumido) e o efeito do tipo toma o lugar
      c.trapGone(e.trapId);
      const kind: TrapKind = e.kind ?? 'snare';
      const owner = trapOwner.get(e.trapId);
      trapOwner.delete(e.trapId);
      const center = c.tile(e.x, e.y, 0.02);
      const dir = new THREE.Vector3(1, 0, 0);
      let ownerDist: number | undefined;
      const ownerPos = owner !== undefined ? c.pos(owner) : undefined;
      if (ownerPos) {
        const away = center.clone().sub(ownerPos).setY(0);
        ownerDist = away.length();
        if (ownerDist > 1e-4) dir.copy(away).divideScalar(ownerDist);
      }
      c.add(new ArcherTrapFX(c.kit, { kind, center, radius: e.radius ?? 1, dir, ownerDist, cam: c.kit.stage.camera, shake: (a) => c.shake(a) }));
      const txt = F.trap.text[kind];
      c.float(txt.text, c.tile(e.x, e.y, 0.4).setY(F.trap.textLift), txt.color, txt.size);
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Demonstrações da vitrine (mesmos eventos que a simulação emite). Conjuradora em (0,0); alvos em (3,0), (3,1), (4,-1).
// ---------------------------------------------------------------------------------------------------------------

/** Quando o alvo da flecha reage: o mesmo cálculo que o GameView usa para adiar o dano (aprox., a ponta do arco). */
const ARROW_IMPACT = ArrowFX.impactDelay(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(3, 0.6, 0));
const TRAP_ID = 1;
const TRAP_TRIGGER_AT = 0.6;

/** Armadilha de teste: armada em (3,0), disparada pelo alvo t1 (o mesmo tile). */
function trapDemo(extra: Partial<Trap>, damage: number): (ids: DemoIds) => DemoStep[] {
  return (ids) => {
    const trap: Trap = { id: TRAP_ID, x: 3, y: 0, ownerId: ids.caster, damage, slowTicks: 40, slowMult: 2.2, ...extra };
    const trigger: SimEvent = { type: 'trapTrigger', trapId: TRAP_ID, x: 3, y: 0, targetId: ids.t1, ...(extra.kind ? { kind: extra.kind, radius: extra.radius ?? 1 } : {}) };
    return [
      { at: 0, e: { type: 'trapSet', trap } },
      { at: TRAP_TRIGGER_AT, e: trigger },
      { at: TRAP_TRIGGER_AT, e: { type: 'damage', unitId: ids.t1, amount: damage, source: 'trap', sourceId: ids.caster } },
    ];
  };
}

export const ARCHER_DEMOS: DemoEntry[] = [
  {
    cls: 'archer',
    id: 'arrow',
    label: 'Flecha básica (leve)',
    span: 0.9,
    steps: (ids) => [
      { at: 0, e: { type: 'arrow', unitId: ids.caster, targetId: ids.t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, crit: false } },
      { at: ARROW_IMPACT, e: { type: 'damage', unitId: ids.t1, amount: 8, source: 'arrow', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'archer',
    id: 'arrowCrit',
    label: 'Flecha crítica (dourada)',
    span: 0.9,
    steps: (ids) => [
      { at: 0, e: { type: 'arrow', unitId: ids.caster, targetId: ids.t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, crit: true } },
      { at: ARROW_IMPACT, e: { type: 'damage', unitId: ids.t1, amount: 12, source: 'arrow', sourceId: ids.caster, crit: true } },
    ],
  },
  {
    cls: 'archer',
    id: 'rain',
    label: 'Chuva de Flechas',
    span: 1.2,
    steps: (ids) => [
      { at: 0, e: { type: 'rain', unitId: ids.caster, x: 3, y: 0, radius: 1, fire: false } },
      ...[ids.t1, ids.t2, ids.t3].map((id): DemoStep => ({ at: RainFX.IMPACT, e: { type: 'damage', unitId: id, amount: 9, source: 'rain', sourceId: ids.caster } })),
    ],
  },
  {
    cls: 'archer',
    id: 'rainFire',
    label: 'Chuva Incendiária',
    span: 2.7,
    steps: (ids) => [
      { at: 0, e: { type: 'rain', unitId: ids.caster, x: 3, y: 0, radius: 1, fire: true } },
      ...[ids.t1, ids.t2, ids.t3].map((id): DemoStep => ({ at: RainFX.IMPACT, e: { type: 'damage', unitId: id, amount: 9, source: 'rain', sourceId: ids.caster } })),
    ],
  },
  {
    cls: 'archer',
    id: 'pierce',
    label: 'Flecha Perfurante',
    span: 1.0,
    steps: (ids) => [
      { at: 0, e: { type: 'pierce', unitId: ids.caster, from: { x: 0, y: 0 }, to: { x: 6, y: 0 } } },
      { at: F.pierce.impactSec, e: { type: 'damage', unitId: ids.t1, amount: 12, source: 'pierce', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'archer',
    id: 'focus',
    label: 'Foco do Caçador',
    span: 4.4,
    steps: (ids) => [{ at: 0, e: { type: 'focus', unitId: ids.caster, ticks: 40 } }],
  },
  { cls: 'archer', id: 'snare', label: 'Armadilha', span: 1.6, steps: trapDemo({}, 38) },
  { cls: 'archer', id: 'mine', label: 'Mina Terrestre', span: 1.6, steps: trapDemo({ kind: 'mine', radius: 1, stunTicks: 30 }, 30) },
  { cls: 'archer', id: 'freeze', label: 'Armadilha Congelante', span: 1.6, steps: trapDemo({ kind: 'freeze', radius: 1, freezeTicks: 30 }, 12) },
  { cls: 'archer', id: 'claymore', label: 'Armadilha Claymore', span: 1.6, steps: trapDemo({ kind: 'claymore', radius: 2 }, 40) },
];
