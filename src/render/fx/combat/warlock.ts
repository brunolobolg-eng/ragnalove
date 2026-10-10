import * as THREE from 'three';
import { WARLOCK_FX as K } from '../../../config/fx/warlock';
import type { SimEvent } from '../../../core/sim/types';
import { ShadowBoltFX } from '../SkillFX';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry, DemoIds, DemoStep } from './demos';
import { CurseFX, curseMark, LifeDrainFX, SwarmFX } from './warlockFx';

/** Evento da simulação de um tipo específico. */
type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** Enxame vivo de cada bruxa (um por vez: um novo enxame dissipa o anterior). */
const swarms = new Map<number, SwarmFX>();
/** Golpes do Dreno de Vida ainda não aplicados ("conjurador>alvo"): o dano deles tem visual próprio. */
const drainPending = new Set<string>();

/**
 * Visual da Bruxa: Dreno de Vida (ataque básico), Maldição e Enxame de Sombras. Retorna true quando assume
 * o evento (o GameView então não desenha o caso padrão, por isso repetimos aqui a animação e o espectro).
 * Dano: só acrescenta impacto (o caso padrão do dano continua, então retorna false).
 */
export function handleWarlock(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'shadowBolt':
      return drain(e, c);
    // a cura do Dreno é a alma que volta ao conjurador; o caso padrão pintaria um brilho verde no corpo dela
    case 'heal':
      return true;
    case 'curse':
      return curse(e, c);
    case 'cast':
      return e.ability === 'shadowSwarm' ? swarm(e, c) : false;
    case 'damage':
      damage(e, c);
      return false;
    default:
      return false;
  }
}

/** Dreno de Vida: a mão junta a sombra, ela voa em arco até o alvo e estoura; a alma volta ao conjurador. */
function drain(e: Ev<'shadowBolt'>, c: CombatVisualCtx): boolean {
  const v = c.view(e.unitId);
  if (v) {
    v.setFacing(Math.sign(e.to.x - e.from.x), Math.sign(e.to.y - e.from.y));
    v.attack();
  }
  const base = c.pos(e.unitId);
  const from = c.staffTip(e.unitId) ?? (base ? base.clone().setY(K.body.hand) : c.tile(e.from.x, e.from.y, K.body.hand));
  const to = c.tile(e.to.x, e.to.y, K.drain.targetLift);
  const back = base ? base.clone().setY(K.body.chest) : c.tile(e.from.x, e.from.y, K.body.chest);
  // o voo termina no instante em que o GameView adia a reação do alvo (mesma conta de deferImpacts)
  const delay = ShadowBoltFX.impactDelay(c.tile(e.from.x, e.from.y, K.drain.fromLift), c.tile(e.to.x, e.to.y, K.drain.targetLift));
  c.add(new LifeDrainFX(c.kit, from, to, back, delay));
  drainPending.add(`${e.unitId}>${e.targetId}`);
  c.spectre(e.unitId, K.spectre.bolt);
  return true;
}

/** Maldição: fio de sombra da mão ao chão, runas que fecham sobre a área, fumaça e colunas de sombra. */
function curse(e: Ev<'curse'>, c: CombatVisualCtx): boolean {
  const center = c.tile(e.x, e.y);
  const base = c.pos(e.unitId);
  const v = c.view(e.unitId);
  if (v && base) {
    const d = center.clone().sub(base);
    v.setFacing(d.x, d.z);
  }
  v?.cast();
  const hand = c.staffTip(e.unitId) ?? (base ? base.clone().setY(K.body.hand) : center.clone().setY(K.body.hand));
  c.add(new CurseFX(c.kit, hand, center, e.radius));
  if (base) c.float('Maldição!', base.clone().setY(K.float.height), K.float.color, K.float.curseSize, K.float.curseLife, K.float.curseRise);
  c.spectre(e.unitId, K.spectre.curse);
  return true;
}

/** Enxame de Sombras: as sombras surgem do chão, giram em volta da bruxa e mergulham a cada pulso de dano. */
function swarm(e: Ev<'cast'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  swarms.get(e.unitId)?.dissolve();
  const fx = new SwarmFX(c, e.unitId, c.kit);
  c.add(fx);
  swarms.set(e.unitId, fx);
  const base = c.pos(e.unitId);
  if (base) c.float('Enxame de Sombras', base.clone().setY(K.float.height), K.float.color, K.float.swarmSize, K.float.swarmLife, K.float.swarmRise);
  c.spectre(e.unitId, K.spectre.swarm);
  return true;
}

/** Dano de uma bruxa: pulso da maldição (marca no inimigo) ou pulso do enxame (mergulho no alvo). */
function damage(e: Ev<'damage'>, c: CombatVisualCtx): void {
  const caster = e.sourceId;
  if (caster === undefined) return;
  if (e.source === 'curse') {
    const feet = c.pos(e.unitId);
    if (feet) curseMark(c.kit, feet);
    return;
  }
  if (e.source !== 'shadow') return;
  // o golpe do Dreno já tem visual próprio (no acerto): não conta como pulso do enxame
  if (drainPending.delete(`${caster}>${e.unitId}`)) return;
  const fx = swarms.get(caster);
  if (fx && !fx.done) fx.pulse(e.unitId);
}

/** Pulsos de dano de uma fonte da bruxa num grupo de alvos, no mesmo instante. */
function pulses(at: number, ids: number[], source: 'curse' | 'shadow', caster: number, amount: number): DemoStep[] {
  return ids.map((id): DemoStep => ({ at, e: { type: 'damage', unitId: id, amount, source, sourceId: caster } }));
}

/**
 * Atraso do acerto do Dreno na demonstração (tile (0,0) a (3,0)), com as mesmas alturas que o GameView usa.
 */
const DRAIN_IMPACT = ShadowBoltFX.impactDelay(new THREE.Vector3(0, K.drain.fromLift, 0), new THREE.Vector3(3, K.drain.targetLift, 0));

/** Os três alvos da vitrine são todos alcançados pela área da maldição (raio 1 em torno de (3,0)). */
export const WARLOCK_DEMOS: DemoEntry[] = [
  {
    cls: 'warlock',
    id: 'lifeDrain',
    label: 'Dreno de Vida (ataque básico, leve)',
    span: DRAIN_IMPACT + K.drain.soulTime + 0.3,
    steps: ({ caster, t1 }: DemoIds) => [
      { at: 0, e: { type: 'shadowBolt', unitId: caster, targetId: t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } } },
      { at: 0, e: { type: 'heal', unitId: caster, amount: 4 } },
      { at: DRAIN_IMPACT, e: { type: 'damage', unitId: t1, amount: 8, source: 'shadow', sourceId: caster } },
    ],
  },
  {
    cls: 'warlock',
    id: 'curse',
    label: 'Maldição (área de raio 1)',
    span: 2.6,
    steps: ({ caster, t1, t2, t3 }: DemoIds) => [
      { at: 0, e: { type: 'curse', unitId: caster, x: 3, y: 0, radius: 1 } },
      ...pulses(0.9, [t1, t2, t3], 'curse', caster, 4),
      ...pulses(1.9, [t1, t2, t3], 'curse', caster, 4),
    ],
  },
  {
    cls: 'warlock',
    id: 'swarm',
    label: 'Enxame de Sombras (3 alvos)',
    span: 4.4,
    steps: ({ caster, t1, t2, t3 }: DemoIds) => [
      { at: 0, e: { type: 'cast', unitId: caster, ability: 'shadowSwarm' } },
      ...pulses(0.6, [t1, t2, t3], 'shadow', caster, 5),
      ...pulses(1.6, [t1, t2, t3], 'shadow', caster, 5),
      ...pulses(2.6, [t1, t2, t3], 'shadow', caster, 5),
    ],
  },
];
