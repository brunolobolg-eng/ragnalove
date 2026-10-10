import type { SimEvent } from '../../../core/sim/types';
import { SORCERER_FX as K } from '../../../config/fx/sorcerer';
import { tileToWorld } from '../../coords';
import { FrostBoltFX } from '../FrostBoltFX';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { ArcaneChainFx, ArcaneCritFx, ArcaneMeteorFx, ArcaneOrbFx } from './sorcererFx';

/** Evento da simulação de um tipo específico. */
type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
/** Meteoro com o autor: a Feiticeira envia o próprio id (meteoros do campo não têm autor e seguem o padrão). */
type MeteorEv = Ev<'meteor'> & { unitId?: number };

/**
 * Visual da Feiticeira (arcana): Orbe Arcano (ataque básico), Meteoro, Corrente Elétrica e acerto crítico.
 * Retorna true quando assume o evento. O caso padrão do GameView (animação de conjuração e espectro) é
 * repetido aqui quando o evento é assumido; o `cast` do Meteoro segue o padrão. Nos danos o retorno é ignorado.
 */
export function handleSorcerer(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'bolt':
      return orb(e, c);
    case 'storm':
      return chain(e, c);
    case 'meteor':
      return meteor(e as MeteorEv, c);
    case 'damage':
      crit(e, c);
      return false;
    default:
      return false;
  }
}

/** Orbe Arcano: ataque e virada (o sinal do deslocamento, igual à simulação), orbe até o alvo. */
function orb(e: Ev<'bolt'>, c: CombatVisualCtx): boolean {
  const v = c.view(e.unitId);
  if (v) {
    v.attack();
    v.setFacing(Math.sign(e.to.x - e.from.x), Math.sign(e.to.y - e.from.y));
  }
  const from = c.staffTip(e.unitId) ?? c.tile(e.from.x, e.from.y, K.body.staff);
  const to = c.tile(e.to.x, e.to.y, K.body.targetLift);
  // o voo dura exatamente o tempo em que o GameView adia a reação do alvo
  c.add(new ArcaneOrbFx(c, from, to, FrostBoltFX.impactDelay(from, to)));
  c.spectre(e.unitId, K.spectre.bolt);
  return true;
}

/** Corrente Elétrica: conjuração e espectro do padrão; a corrente liga a origem a cada alvo, em sequência. */
function chain(e: Ev<'storm'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.storm);
  const origin = c.staffTip(e.unitId) ?? c.pos(e.unitId)?.clone().setY(K.body.chest);
  if (origin && e.strikes.length > 0) {
    const targets = e.strikes.map((s) => c.tile(s.x, s.y, K.body.linkLift));
    c.add(new ArcaneChainFx(c, origin, targets));
  }
  return true;
}

/** Meteoro: runa no chão, cristal que cai e impacto no tile do alvo, com o raio do evento. */
function meteor(e: MeteorEv, c: CombatVisualCtx): boolean {
  // sem autor, o meteoro é do campo (chefe ou armadilha): segue o visual padrão
  if (e.unitId === undefined) return false;
  c.add(new ArcaneMeteorFx(c, c.tile(e.x, e.y), e.radius));
  return true;
}

/** Acerto crítico de um arcano (Orbe ou Corrente): burst extra no alvo. O número e o texto CRÍTICO! seguem o GameView. */
function crit(e: Ev<'damage'>, c: CombatVisualCtx): void {
  if (!e.crit || (e.source !== 'arcane' && e.source !== 'storm')) return;
  const at = c.pos(e.unitId);
  if (at) c.add(new ArcaneCritFx(c, at));
}

/** Voo do orbe na vitrine: o mesmo cálculo do jogo (o alvo reage quando o orbe chega). */
const ORB_FLIGHT = FrostBoltFX.impactDelay(tileToWorld(0, 0, undefined, K.body.staff), tileToWorld(3, 0, undefined, K.body.targetLift));

/**
 * Demonstrações da vitrine: conjuradora em (0,0); inimigos em (3,0), (3,1) e (4,-1). Só a conjuradora é aliada.
 * O Meteoro leva o id da conjuradora (ver `meteor`): sem ele o jogo usa o visual padrão.
 */
export const SORCERER_DEMOS: DemoEntry[] = [
  {
    cls: 'sorcerer',
    id: 'orb',
    label: 'Orbe Arcano (ataque básico)',
    span: 0.8,
    steps: (ids) => [
      { at: 0, e: { type: 'bolt', unitId: ids.caster, targetId: ids.t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } } },
      { at: ORB_FLIGHT, e: { type: 'damage', unitId: ids.t1, amount: 10, source: 'arcane', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'sorcerer',
    id: 'orbCrit',
    label: 'Orbe Arcano (acerto crítico)',
    span: 0.8,
    steps: (ids) => [
      { at: 0, e: { type: 'bolt', unitId: ids.caster, targetId: ids.t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } } },
      { at: ORB_FLIGHT, e: { type: 'damage', unitId: ids.t1, amount: 22, source: 'arcane', sourceId: ids.caster, crit: true } },
    ],
  },
  {
    cls: 'sorcerer',
    id: 'meteor',
    label: 'Meteoro (raio 1)',
    span: 2.2,
    steps: (ids) => [
      { at: 0, e: { type: 'cast', unitId: ids.caster, ability: 'meteorStrike' } },
      { at: 0, e: { type: 'meteor', unitId: ids.caster, x: 3, y: 0, radius: 1 } as SimEvent },
      { at: K.meteor.impactAt, e: { type: 'damage', unitId: ids.t1, amount: 26, source: 'meteor', sourceId: ids.caster } },
      { at: K.meteor.impactAt, e: { type: 'damage', unitId: ids.t2, amount: 26, source: 'meteor', sourceId: ids.caster } },
      { at: K.meteor.impactAt, e: { type: 'damage', unitId: ids.t3, amount: 26, source: 'meteor', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'sorcerer',
    id: 'chain',
    label: 'Corrente Elétrica (3 elos)',
    span: 1.0,
    steps: (ids) => [
      {
        at: 0,
        e: {
          type: 'storm',
          unitId: ids.caster,
          strikes: [
            { x: 3, y: 0 },
            { x: 3, y: 1 },
            { x: 4, y: -1 },
          ],
        },
      },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t1, amount: 17, source: 'storm', sourceId: ids.caster } },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t2, amount: 17, source: 'storm', sourceId: ids.caster } },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t3, amount: 17, source: 'storm', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'sorcerer',
    id: 'chainMax',
    label: 'Corrente Elétrica (nível 5: 7 elos)',
    span: 1.0,
    steps: (ids) => [
      {
        at: 0,
        e: {
          type: 'storm',
          unitId: ids.caster,
          strikes: [
            { x: 3, y: 0 },
            { x: 3, y: 1 },
            { x: 4, y: -1 },
            { x: 2, y: -1 },
            { x: 2, y: 1 },
            { x: 5, y: 0 },
            { x: 5, y: 1 },
          ],
        },
      },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t1, amount: 37, source: 'storm', sourceId: ids.caster } },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t2, amount: 37, source: 'storm', sourceId: ids.caster } },
      { at: K.chain.impactAt, e: { type: 'damage', unitId: ids.t3, amount: 37, source: 'storm', sourceId: ids.caster } },
    ],
  },
];
