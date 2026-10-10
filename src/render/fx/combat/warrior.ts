import type { DamageSource, SimEvent } from '../../../core/sim/types';
import type { Vec2 } from '../../../core/grid/types';
import { makeObject } from '../../../core/sim/objects';
import { WARRIOR_FX } from '../../../config/fx/warrior';
import { WARRIOR_RUNIC_FX as R } from '../../../config/fx/warriorRunic';
import { BASH_IMPACT } from '../BashFX';
import { CLEAVE_IMPACT } from '../CleaveFX';
import type { CombatVisualCtx, VisualUnit } from './CombatVisualCtx';
import type { DemoEntry, DemoStep } from './demos';
import { handleWarriorRunic } from './warriorRunic';
import { WallRiseFX, WarriorBashFX, WarriorCleaveFX, WarriorFuryFX, WarriorShockFX, WarriorTauntFX } from './warriorFx';

const C = WARRIOR_FX;

/**
 * Direção de um passo, em tiles, de `from` para `to` (cada eixo: -1, 0 ou 1). Usa o mesmo sentido que a simulação
 * dá ao guerreiro ao virar para o alvo; a tolerância de meio tile cobre a unidade ainda deslizando na tela.
 */
function stepTowards(from: { x: number; z: number }, to: { x: number; z: number }): { x: number; y: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return { x: Math.abs(dx) < 0.5 ? 0 : Math.sign(dx), y: Math.abs(dz) < 0.5 ? 0 : Math.sign(dz) };
}

/**
 * Visual do Guerreiro: Investida (ataque básico), Golpe em Área, Onda de Choque, Fúria, Provocar e Muralha,
 * além do Cavaleiro Rúnico (ver warriorRunic.ts). Retorna true quando assume o evento (o GameView então não desenha
 * o caso padrão). Replica o que importava do caso padrão: virar para o alvo, animação (golpe pesado ou corte),
 * espectro e texto flutuante.
 */
export function handleWarrior(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'bash': {
      const from = c.pos(e.unitId);
      if (!from) return true;
      const target = c.tile(e.x, e.y);
      const f = stepTowards(from, target);
      const view = c.view(e.unitId);
      view?.setFacing(f.x, f.y, true);
      view?.attack('heavy');
      c.add(new WarriorBashFX(from, target, c.kit, e.crit === true));
      c.spectre(e.unitId, C.bash.spectre);
      return true;
    }
    case 'cleave': {
      const origin = c.pos(e.unitId);
      if (!origin) return true;
      const view = c.view(e.unitId);
      view?.setFacing(e.facing.x, e.facing.y, true);
      view?.attack();
      c.add(new WarriorCleaveFX(origin, e.facing, e.tiles, e.hitTiles, c.kit));
      c.spectre(e.unitId, C.cleave.spectre);
      return true;
    }
    case 'shockwave': {
      c.view(e.unitId)?.attack('heavy');
      c.spectre(e.unitId, C.shockwave.spectre);
      const origin = c.pos(e.unitId) ?? c.tile(e.x, e.y);
      c.add(new WarriorShockFX(origin, e.radius, c.kit));
      return true;
    }
    case 'fury': {
      const view = c.view(e.unitId);
      if (view) {
        view.cast();
        c.float('FÚRIA!', view.root.position.clone().setY(C.fury.floatHeight), C.fury.floatColor, C.fury.floatSize, C.fury.floatLife);
        // a duração vem da simulação em ticks: a aura dura o mesmo tempo que a Fúria
        c.add(new WarriorFuryFX(view, e.ticks / C.ticksPerSec, c.kit));
      }
      return true;
    }
    case 'taunt': {
      const view = c.view(e.unitId);
      if (!view) return true;
      view.cast();
      c.float('Provocar!', view.root.position.clone().setY(C.taunt.floatHeight), C.taunt.floatColor, C.taunt.floatSize);
      const marks = e.pulled.map((id) => c.view(id)).filter((v): v is VisualUnit => v !== undefined);
      c.add(new WarriorTauntFX(view.root.position.clone(), e.radius, marks, c.kit));
      return true;
    }
    case 'objectSpawn': {
      // Muralha: pedras saindo do chão em cada bloco. Retorna false de propósito: o caso padrão do GameView é que
      // desenha o bloco (ObjectView) e a poeira base, então este efeito se soma a ele, não o substitui.
      if (e.object.type === 'shieldWall') c.add(new WallRiseFX(c.tile(e.object.x, e.object.y), c.kit));
      return false;
    }
    // Cavaleiro Rúnico (habilidades do Guerreiro) e o dano devolvido pelo Limite da Morte
    case 'enchantBlade':
    case 'sonicWave':
    case 'deathBound':
    case 'hundredSpear':
    case 'windCutter':
    case 'damage':
      return handleWarriorRunic(e, c);
    default:
      return false;
  }
}

// ---------------------------------------------------------------- vitrine (demonstrações)

/** Cone do Golpe em Área virado para +x a partir de (0,0): cobre t1 (3,0), t2 (3,1) e t3 (4,-1) da vitrine. */
const CONE: Vec2[] = [];
for (let x = 1; x <= 4; x++) {
  const half = Math.round(x * 0.55 + 0.5);
  for (let y = -half; y <= half; y++) CONE.push({ x, y });
}

/** Dano de demonstração: a vitrine usa o evento de dano para o recuo do alvo, como o GameView faz. */
const hurt = (unitId: number, amount: number, source: DamageSource, sourceId: number): SimEvent => ({
  type: 'damage',
  unitId,
  amount,
  source,
  sourceId,
});

export const WARRIOR_DEMOS: DemoEntry[] = [
  {
    cls: 'warrior',
    id: 'bash',
    label: 'Investida (ataque básico): lâmina leve e impacto pequeno',
    span: C.demo.bash,
    steps: (ids) => [
      { at: 0, e: { type: 'bash', unitId: ids.caster, targetId: ids.t1, x: 3, y: 0 } },
      { at: BASH_IMPACT, e: hurt(ids.t1, 14, 'bash', ids.caster) },
    ],
  },
  {
    cls: 'warrior',
    id: 'cleave',
    label: 'Golpe em Área: varredura do cone e onda de poeira',
    span: C.demo.cleave,
    steps: (ids) => [
      {
        at: 0,
        e: {
          type: 'cleave',
          unitId: ids.caster,
          facing: { x: 1, y: 0 },
          tiles: CONE,
          hitTiles: [
            { x: 3, y: 0 },
            { x: 3, y: 1 },
            { x: 4, y: -1 },
          ],
          hits: 3,
        },
      },
      { at: CLEAVE_IMPACT, e: hurt(ids.t1, 10, 'cleave', ids.caster) },
      { at: CLEAVE_IMPACT, e: hurt(ids.t2, 10, 'cleave', ids.caster) },
      { at: CLEAVE_IMPACT, e: hurt(ids.t3, 10, 'cleave', ids.caster) },
    ],
  },
  {
    cls: 'warrior',
    id: 'shockwave',
    label: 'Onda de Choque: anel no chão, rachadura e lascas',
    span: C.demo.shockwave,
    steps: (ids) => [
      { at: 0, e: { type: 'shockwave', unitId: ids.caster, x: 0, y: 0, radius: 3 } },
      { at: C.shockwave.impactAt, e: hurt(ids.t1, 20, 'shock', ids.caster) },
      { at: C.shockwave.impactAt, e: hurt(ids.t2, 20, 'shock', ids.caster) },
    ],
  },
  {
    cls: 'warrior',
    id: 'fury',
    label: 'Fúria: chamas em espiral e círculo de runas que segue o guerreiro',
    span: C.demo.fury,
    // 48 ticks = 4,8 s (nível 1 da Fúria)
    steps: (ids) => [{ at: 0, e: { type: 'fury', unitId: ids.caster, ticks: 48 } }],
  },
  {
    cls: 'warrior',
    id: 'taunt',
    label: 'Provocar: pulso, grito e marca vermelha nos alvos puxados',
    span: C.demo.taunt,
    steps: (ids) => [{ at: 0, e: { type: 'taunt', unitId: ids.caster, radius: 3, pulled: [ids.t1, ids.t2] } }],
  },
  {
    cls: 'warrior',
    id: 'wall',
    label: 'Muralha do Guerreiro: pedras saindo do chão em cada bloco',
    span: C.demo.wall,
    // quatro blocos na frente do guerreiro, criados no mesmo instante (como a simulação faz)
    steps: () =>
      [0, 1, 2, 3].map(
        (i): DemoStep => ({
          at: 0,
          e: { type: 'objectSpawn', object: makeObject(900 + i, { type: 'shieldWall', x: 2, y: -2 + i }) },
        }),
      ),
  },
  // ----- Cavaleiro Rúnico. Os danos entram no mesmo instante que o jogo os aplica (o GameView não os adia para estes
  // efeitos), então a vitrine mostra o que o jogo mostra hoje.
  {
    cls: 'warrior',
    id: 'enchant',
    label: 'Lâmina Encantada: brilho azul na arma e runas no chão enquanto dura (ignição ao ligar)',
    span: R.demo.enchant,
    steps: (ids) => [{ at: 0, e: { type: 'enchantBlade', unitId: ids.caster, ticks: R.demo.enchantTicks } }],
  },
  {
    cls: 'warrior',
    id: 'sonic',
    label: 'Onda Sônica: crescente azul até o alvo e estilhaço no impacto',
    span: R.demo.sonic,
    steps: (ids) => [
      { at: 0, e: { type: 'sonicWave', unitId: ids.caster, targetId: ids.t1, fromX: 0, fromY: 0, x: 3, y: 0 } },
      { at: 0, e: hurt(ids.t1, 17, 'wave', ids.caster) },
    ],
  },
  {
    cls: 'warrior',
    id: 'deathbound',
    label: 'Limite da Morte: runas carmesim sob o alvo marcado; o dano devolvido volta ao herói como faísca',
    span: R.demo.death,
    steps: (ids) => [
      { at: 0, e: { type: 'deathBound', unitId: ids.caster, targetId: ids.t1, x: 3, y: 0, ticks: R.demo.deathTicks } },
      // na simulação, o dano devolvido sai antes do golpe no alvo marcado
      { at: 1.2, e: { type: 'damage', unitId: ids.caster, amount: 3, source: 'reflect' } },
      { at: 1.2, e: hurt(ids.t1, 24, 'bash', ids.caster) },
    ],
  },
  {
    cls: 'warrior',
    id: 'spear',
    label: 'Cem Lanças: lanças douradas caindo em sequência sobre o alvo e os vizinhos',
    span: R.demo.spear,
    steps: (ids) => {
      const hits = 4;
      const steps: DemoStep[] = [
        {
          at: 0,
          e: {
            type: 'hundredSpear',
            unitId: ids.caster,
            targetId: ids.t1,
            x: 3,
            y: 0,
            hits,
            radius: 1,
            tiles: [
              { x: 3, y: 0 },
              { x: 3, y: 1 },
            ],
          },
        },
      ];
      for (let k = 0; k < hits; k++) {
        steps.push({ at: 0, e: hurt(ids.t1, 8, 'spear', ids.caster) }, { at: 0, e: hurt(ids.t2, 8, 'spear', ids.caster) });
      }
      return steps;
    },
  },
  {
    cls: 'warrior',
    id: 'wind',
    label: 'Cortador de Vento: anel verde-água girando em volta do herói e rajadas em cada inimigo (raio 4 só na vitrine)',
    span: R.demo.wind,
    steps: (ids) => [
      {
        at: 0,
        e: {
          type: 'windCutter',
          unitId: ids.caster,
          x: 0,
          y: 0,
          radius: 4,
          tiles: [
            { x: 3, y: 0 },
            { x: 3, y: 1 },
            { x: 4, y: -1 },
          ],
          hits: 3,
        },
      },
      { at: 0, e: hurt(ids.t1, 10, 'wind', ids.caster) },
      { at: 0, e: hurt(ids.t2, 10, 'wind', ids.caster) },
      { at: 0, e: hurt(ids.t3, 10, 'wind', ids.caster) },
    ],
  },
];
