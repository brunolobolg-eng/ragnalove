import * as THREE from 'three';
import type { SimEvent } from '../../../core/sim/types';
import { MAGE_FX as K } from '../../../config/fx/mage';
import { FrostBoltFX } from '../FrostBoltFX';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';
import { BlessingFx, DivineHealFx, FrostNovaFx, FrostOrbFx, HolyShieldFx, JudgmentFx, SanctuaryFx, ThunderstormFx } from './mageFx';

/** Evento da simulação de um tipo específico. */
type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/**
 * Visual do Mago (Cléria): ataque básico e habilidades. Retorna true quando assume o evento (o GameView
 * então não desenha o caso padrão, por isso cada ação de animação e texto que importa é repetida aqui).
 */
export function handleMage(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'bolt':
      return bolt(e, c);
    case 'divineHeal':
      return heal(e, c);
    case 'holyShield':
      return shield(e, c);
    case 'sanctuary':
      return sanctuary(e, c);
    case 'blessing':
      return blessing(e, c);
    case 'storm':
      return storm(e, c);
    case 'nova':
      return nova(e, c);
    default:
      return false;
  }
}

/** Raio Gélido: ataque e virada (a direção é o sinal do deslocamento, igual à simulação), orbe até o alvo. */
function bolt(e: Ev<'bolt'>, c: CombatVisualCtx): boolean {
  const v = c.view(e.unitId);
  if (v) {
    v.attack();
    v.setFacing(Math.sign(e.to.x - e.from.x), Math.sign(e.to.y - e.from.y));
  }
  const from = c.staffTip(e.unitId) ?? c.tile(e.from.x, e.from.y, K.body.staff);
  const to = c.tile(e.to.x, e.to.y, K.bolt.targetLift);
  // o voo dura exatamente o tempo em que o GameView adia a reação do alvo
  c.add(new FrostOrbFx(c, from, to, FrostBoltFX.impactDelay(from, to)));
  c.spectre(e.unitId, K.spectre.bolt);
  return true;
}

/** Cura Divina: fita de luz, coluna no aliado e partículas que sobem. */
function heal(e: Ev<'divineHeal'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  const feet = c.pos(e.targetId);
  if (feet) c.add(new DivineHealFx(c, c.staffTip(e.unitId) ?? feet.clone().setY(K.body.staff), feet));
  return true;
}

/** Escudo Sagrado: cúpula no aliado e o texto de sempre. */
function shield(e: Ev<'holyShield'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  const feet = c.pos(e.targetId);
  if (feet) {
    c.add(new HolyShieldFx(c, feet));
    c.float('Escudo Sagrado', feet.clone().setY(K.float.shieldHeight), K.float.shieldColor, K.float.shieldSize);
  }
  return true;
}

/** Santuário: runas no chão pelo tempo do efeito, com o texto de sempre. */
function sanctuary(e: Ev<'sanctuary'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  const p = c.tile(e.x, e.y);
  c.add(new SanctuaryFx(c, p, e.radius, e.ticks / K.ticksPerSecond));
  c.float('Santuário', p.clone().setY(K.float.sanctuaryHeight), K.float.holyColor, K.float.sanctuarySize);
  return true;
}

/** Bênção: estrela e graça em cada aliado; no conjurador, o anel e o texto de sempre. */
function blessing(e: Ev<'blessing'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.blessing);
  const caster = c.pos(e.unitId);
  if (caster) {
    const feet: THREE.Vector3[] = [];
    for (const id of e.targets) {
      const f = c.pos(id);
      if (f) feet.push(f);
    }
    c.add(new BlessingFx(c, caster, feet));
    c.float('Bênção!', caster.clone().setY(K.float.blessingHeight), K.float.holyColor, K.float.blessingSize);
  }
  return true;
}

/** Julgamento (cruz de colunas de luz) ou Tempestade (raios): o evento diz qual é. */
function storm(e: Ev<'storm'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.storm);
  const grounds = e.strikes.map((s) => c.tile(s.x, s.y));
  if (grounds.length > 0) c.add(e.ability === 'judgment' ? new JudgmentFx(c, grounds) : new ThunderstormFx(c, grounds));
  return true;
}

/** Nova Congelante: onda de gelo centrada no conjurador, com o raio do evento. */
function nova(e: Ev<'nova'>, c: CombatVisualCtx): boolean {
  c.view(e.unitId)?.cast();
  c.spectre(e.unitId, K.spectre.nova);
  c.add(new FrostNovaFx(c, c.pos(e.unitId) ?? c.tile(e.x, e.y), e.radius));
  return true;
}

/**
 * Demonstrações da vitrine: conjurador em (0,0); inimigos em (3,0), (3,1) e (4,-1). Só o conjurador é aliado,
 * então as curas e bênçãos miram nele (é também o caso mais difícil de ler: o efeito sobre o próprio corpo).
 */
export const MAGE_DEMOS: DemoEntry[] = [
  {
    cls: 'mage',
    id: 'bolt',
    label: 'Raio Gélido (ataque básico)',
    span: 0.6,
    steps: (ids) => [
      { at: 0, e: { type: 'bolt', unitId: ids.caster, targetId: ids.t1, from: { x: 0, y: 0 }, to: { x: 3, y: 0 } } },
      { at: 0.2, e: { type: 'damage', unitId: ids.t1, amount: 12, source: 'bolt', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'mage',
    id: 'heal',
    label: 'Cura Divina (no próprio aliado)',
    span: 1.2,
    steps: (ids) => [{ at: 0, e: { type: 'divineHeal', unitId: ids.caster, targetId: ids.caster } }],
  },
  {
    cls: 'mage',
    id: 'holyShield',
    label: 'Escudo Sagrado',
    span: 1.5,
    steps: (ids) => [{ at: 0, e: { type: 'holyShield', unitId: ids.caster, targetId: ids.caster, ticks: 90 } }],
  },
  {
    cls: 'mage',
    id: 'sanctuary',
    label: 'Santuário (raio 1)',
    span: 6,
    steps: (ids) => [{ at: 0, e: { type: 'sanctuary', unitId: ids.caster, x: 1, y: 0, radius: 1, ticks: 50 } }],
  },
  {
    cls: 'mage',
    id: 'blessing',
    label: 'Bênção',
    span: 2.6,
    steps: (ids) => [{ at: 0, e: { type: 'blessing', unitId: ids.caster, targets: [ids.caster], ticks: 90 } }],
  },
  {
    cls: 'mage',
    id: 'judgment',
    label: 'Julgamento Divino (cruz)',
    span: 1.6,
    steps: (ids) => [
      {
        at: 0,
        e: {
          type: 'storm',
          unitId: ids.caster,
          strikes: [
            { x: 3, y: 0 },
            { x: 4, y: 0 },
            { x: 2, y: 0 },
            { x: 3, y: 1 },
            { x: 3, y: -1 },
          ],
          ability: 'judgment',
        },
      },
      { at: 0.3, e: { type: 'damage', unitId: ids.t1, amount: 40, source: 'spell', sourceId: ids.caster } },
      { at: 0.3, e: { type: 'damage', unitId: ids.t2, amount: 40, source: 'spell', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'mage',
    id: 'thunderstorm',
    label: 'Tempestade Elétrica',
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
          ability: 'thunderstorm',
        },
      },
      { at: 0.3, e: { type: 'damage', unitId: ids.t1, amount: 20, source: 'storm', sourceId: ids.caster } },
      { at: 0.3, e: { type: 'damage', unitId: ids.t2, amount: 20, source: 'storm', sourceId: ids.caster } },
      { at: 0.3, e: { type: 'damage', unitId: ids.t3, amount: 20, source: 'storm', sourceId: ids.caster } },
    ],
  },
  {
    cls: 'mage',
    id: 'frostNova',
    label: 'Nova Congelante (raio 3)',
    span: 1.4,
    steps: (ids) => [
      { at: 0, e: { type: 'nova', unitId: ids.caster, x: 0, y: 0, radius: 3 } },
      { at: 0.25, e: { type: 'damage', unitId: ids.t1, amount: 14, source: 'nova', sourceId: ids.caster } },
      { at: 0.25, e: { type: 'damage', unitId: ids.t2, amount: 14, source: 'nova', sourceId: ids.caster } },
    ],
  },
];
