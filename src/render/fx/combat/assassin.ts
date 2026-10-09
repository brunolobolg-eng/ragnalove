import * as THREE from 'three';
import { ASSASSIN_FX } from '../../../config/fx/assassin';
import { VISUAL_CONFIG } from '../../../config/visualConfig';
import type { SimEvent } from '../../../core/sim/types';
import { AssassinStrikeFX } from '../StrikeFX';
import { AssassinFlickFX, BladeFanFX, ExecutionFX } from './assassinFx';
import type { CombatVisualCtx } from './CombatVisualCtx';
import type { DemoEntry } from './demos';

/** Visual do Assassino: Golpe Furtivo (básico leve; crítico = golpe completo), Leque de Lâminas e Execução. */
export function handleAssassin(e: SimEvent, c: CombatVisualCtx): boolean {
  switch (e.type) {
    case 'bash': {
      // Golpe Furtivo: o básico é leve; o crítico usa o golpe completo (carga, investida, impacto)
      const from = c.pos(e.unitId);
      const to = c.tile(e.x, e.y);
      const v = c.view(e.unitId);
      if (from) {
        const dir = to.clone().sub(from).setY(0);
        if (v) {
          v.setFacing(dir.x, dir.z, true);
          v.attack();
        }
        c.add(e.crit ? new AssassinStrikeFX(from, to, dir, c.kit) : new AssassinFlickFX(from, to, dir, c.kit));
      }
      c.spectre(e.unitId, 0.6);
      return true;
    }
    case 'cleave': {
      // Leque de Lâminas (o mesmo evento de corte, do assassino)
      const v = c.view(e.unitId);
      const origin = c.pos(e.unitId);
      if (v) {
        v.setFacing(e.facing.x, e.facing.y, true);
        v.attack();
      }
      if (origin) {
        const hits = e.hitTiles.map((t) => c.tile(t.x, t.y, 1.0));
        c.add(new BladeFanFX(origin, new THREE.Vector3(e.facing.x, 0, e.facing.y), hits, c.kit));
      }
      c.spectre(e.unitId, 0.55);
      return true;
    }
    case 'execute': {
      // Execução: sombra até o alvo, lâmina que cai e impacto escuro
      const v = c.view(e.unitId);
      const from = c.pos(e.unitId);
      if (v) v.attack('heavy');
      if (from) c.add(new ExecutionFX(from, c.tile(e.x, e.y), c.kit));
      c.float('EXECUÇÃO!', c.tile(e.x, e.y, 1.8), '#ffd04a', 0.36, 1.1);
      return true;
    }
    default:
      return false;
  }
}

/** Cone de 12 tiles à frente (direção +x), com os três alvos das demonstrações. */
const CONE = [
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: 1, y: 1 },
  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
  { x: 1, y: -1 },
  { x: 2, y: -1 },
  { x: 3, y: -1 },
  { x: 4, y: -1 },
];

export const ASSASSIN_DEMOS: DemoEntry[] = [
  {
    cls: 'assassin',
    id: 'backstab',
    label: 'Golpe Furtivo (básico, leve)',
    span: 0.6,
    steps: ({ caster, t1 }) => [
      { at: 0, e: { type: 'bash', unitId: caster, targetId: t1, x: 3, y: 0, crit: false } },
      { at: ASSASSIN_FX.flick.impactAt, e: { type: 'damage', unitId: t1, amount: 14, source: 'blade', sourceId: caster, crit: false } },
    ],
  },
  {
    cls: 'assassin',
    id: 'backstabCrit',
    label: 'Golpe Furtivo crítico (completo)',
    span: 1.2,
    steps: ({ caster, t1 }) => [
      { at: 0, e: { type: 'bash', unitId: caster, targetId: t1, x: 3, y: 0, crit: true } },
      { at: VISUAL_CONFIG.strike.impactAt, e: { type: 'damage', unitId: t1, amount: 38, source: 'blade', sourceId: caster, crit: true } },
    ],
  },
  {
    cls: 'assassin',
    id: 'bladeFan',
    label: 'Leque de Lâminas',
    span: 0.7,
    steps: ({ caster, t1, t2, t3 }) => [
      {
        at: 0,
        e: { type: 'cleave', unitId: caster, facing: { x: 1, y: 0 }, tiles: CONE, hitTiles: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 4, y: -1 }], hits: 3 },
      },
      { at: 0.2, e: { type: 'damage', unitId: t1, amount: 9, source: 'blade', sourceId: caster } },
      { at: 0.2, e: { type: 'damage', unitId: t2, amount: 9, source: 'blade', sourceId: caster } },
      { at: 0.2, e: { type: 'damage', unitId: t3, amount: 9, source: 'blade', sourceId: caster } },
    ],
  },
  {
    cls: 'assassin',
    id: 'execute',
    label: 'Execução',
    span: 1.0,
    steps: ({ caster, t1 }) => [{ at: 0, e: { type: 'execute', unitId: caster, targetId: t1, x: 3, y: 0 } }],
  },
];
