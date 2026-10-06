import { GAME_CONFIG } from '../../config/gameConfig';
import type { MapObjectDef, MapObjectType } from '../../config/zones';
import { chebyshev, type Vec2 } from '../grid/types';
import type { Simulation } from './Simulation';
import type { MapObject, SimEvent } from './types';

/**
 * Objetos interativos dos mapas — regras autoritativas (a simulação chama; o render só lê).
 * Para criar um tipo novo: adicione o id em `MapObjectType` (zones.ts), os números em
 * GAME_CONFIG.objects e uma entrada em OBJECT_RULES. Nada no mapa ou no pathfinding muda.
 */
export interface ObjectRule {
  label: string;
  /** O que o objeto faz (dica no planejamento). */
  desc: string;
  blocksWalk(o: MapObject): boolean;
  blocksSight(o: MapObject): boolean;
  /** Vida (objetos destrutíveis). */
  hp?: number;
  /** Os inimigos pesados quebram no caminho. */
  breakable?: boolean;
  /** Chefes e elites passam por cima, arrebentando na hora. */
  trampledByBosses?: boolean;
  /** Ação do jogador entre as ondas (planejamento). Uma vez por fase. */
  action?: string;
  /** Reaplica o efeito de uma ação já feita (a simulação é recriada durante o planejamento). */
  applyUsed?(o: MapObject, sim: Simulation): void;
  /** Reage a eventos do combate (fogo, golpes, gelo...). */
  onEvent?(o: MapObject, sim: Simulation, e: SimEvent): void;
}

const O = GAME_CONFIG.objects;
const always = () => true;
const never = () => false;
const standing = (o: MapObject) => o.state !== 'broken' && o.state !== 'collapsed';

/** Tiles andáveis a até `r` (Chebyshev) do objeto, fora dele. */
function around(o: MapObject, sim: Simulation, r: number): Vec2[] {
  const out: Vec2[] = [];
  for (let y = o.y - r; y < o.y + o.h + r; y++)
    for (let x = o.x - r; x < o.x + o.w + r; x++) {
      if (o.tiles.some((t) => t.x === x && t.y === y)) continue;
      if (sim.board.isWalkable(x, y)) out.push({ x, y });
    }
  return out;
}

const nearObject = (o: MapObject, p: Vec2, r: number) => o.tiles.some((t) => chebyshev(t, p) <= r);

export const OBJECT_RULES: Record<MapObjectType, ObjectRule> = {
  shieldWall: {
    label: 'Muralha do Guerreiro',
    desc: 'Bloco intransponível: a horda precisa quebrá-lo para passar.',
    blocksWalk: standing,
    blocksSight: never,
    hp: GAME_CONFIG.archetypes.warrior.shieldWall.hp,
    breakable: true,
  },
  cart: {
    label: 'Carroça tombada',
    desc: 'Cobertura: bloqueia passagem e visão. Vasculhe antes da horda por Zen ou almas.',
    blocksWalk: always,
    blocksSight: always,
    action: 'Vasculhar a carga',
    applyUsed: (o) => void (o.state = 'used'),
  },
  oilBarrel: {
    label: 'Barril de óleo',
    desc: 'Derrame o óleo no chão; a Barreira de Fogo em cima (ou ao lado) incendeia tudo.',
    blocksWalk: always,
    blocksSight: never,
    action: 'Derramar o óleo',
    applyUsed(o, sim) {
      o.state = 'spilled';
      o.area = around(o, sim, O.oilBarrel.radius);
    },
    onEvent(o, sim, e) {
      if (o.state !== 'spilled' || e.type !== 'effectStart' || e.effect.kind !== 'fireBarrier' || e.effect.hostileTo !== 'enemy') return;
      if (!e.effect.tiles.some((t) => o.area.some((a) => chebyshev(a, t) <= 1))) return;
      o.state = 'burning';
      sim.emit({ type: 'oilIgnite', objectId: o.id, tiles: o.area });
      sim.emit({ type: 'objectState', objectId: o.id, state: o.state });
      sim.addEffect({ kind: 'oilFire', ownerId: e.effect.ownerId, tiles: o.area, durationTicks: O.oilBarrel.burnTicks, hostileTo: 'enemy' });
    },
  },
  torch: {
    label: 'Tocha caída',
    desc: 'Acesa, clareia a neblina em volta: os inimigos daquele corredor aparecem mais cedo.',
    blocksWalk: always,
    blocksSight: never,
    action: 'Acender a tocha',
    applyUsed(o, sim) {
      o.state = 'lit';
      const r = O.torch.radius;
      o.area = [];
      for (let y = o.y - r; y <= o.y + r; y++)
        for (let x = o.x - r; x <= o.x + r; x++)
          if (Math.hypot(x - o.x, y - o.y) <= r && sim.board.hasFog(x, y)) {
            sim.board.lightFog(x, y);
            o.area.push({ x, y });
          }
    },
  },
  roots: {
    label: 'Raízes antigas',
    desc: 'Seguram os inimigos comuns. Elites e chefes passam por cima; os pesados quebram.',
    blocksWalk: standing,
    blocksSight: never,
    hp: O.roots.hp,
    breakable: true,
    trampledByBosses: true,
  },
  altar: {
    label: 'Altar da floresta',
    desc: `Bênção de cura durante a fase (+${O.altar.regenPerSec} HP/s para a party). Custa Zen ou almas.`,
    blocksWalk: always,
    blocksSight: never,
    action: 'Orar no altar',
    applyUsed(o, sim) {
      o.state = 'used';
      sim.blessRegen += O.altar.regenPerSec;
    },
  },
  sandColumn: {
    label: 'Coluna de areia',
    desc: 'Cobertura natural (bloqueia a visão). Desmorona com dano em área ou golpes dos pesados.',
    blocksWalk: standing,
    blocksSight: standing,
    hp: O.sandColumn.hp,
    breakable: true,
    onEvent(o, sim, e) {
      if (!standing(o)) return;
      const hit = (p: Vec2, r: number) => nearObject(o, p, r);
      let n = 0;
      if (e.type === 'meteor' || e.type === 'stomp' || e.type === 'shockwave' || e.type === 'nova' || e.type === 'rain') n = hit(e, e.radius) ? 1 : 0;
      else if (e.type === 'storm') n = e.strikes.filter((s) => hit(s, 1)).length;
      if (n) sim.damageObject(o, O.sandColumn.areaHit * n, e.type === 'meteor' || e.type === 'stomp' ? -1 : (e as { unitId?: number }).unitId ?? -1);
    },
  },
  unstableRuin: {
    label: 'Ruína instável',
    desc: 'Um Golpe em Área (ou Onda de Choque) do Guerreiro por perto derruba a ruína em cima da horda.',
    blocksWalk: standing,
    blocksSight: standing,
    onEvent(o, sim, e) {
      if (!standing(o) || (e.type !== 'cleave' && e.type !== 'shockwave')) return;
      const w = sim.units.get(e.unitId);
      if (!w || !nearObject(o, w, O.unstableRuin.triggerRadius)) return;
      sim.collapseRuin(o, e.unitId);
    },
  },
  dryOasis: {
    label: 'Oásis seco',
    desc: 'Gelo por perto (Raio Gélido ou Nova Congelante) vira lama que atrasa a horda.',
    blocksWalk: never,
    blocksSight: never,
    onEvent(o, sim, e) {
      if (o.state !== 'idle') return;
      const r = O.dryOasis.triggerRadius;
      const iced = (e.type === 'nova' && nearObject(o, e, r + e.radius)) || (e.type === 'bolt' && nearObject(o, e.to, r));
      if (!iced) return;
      o.state = 'muddy';
      o.area = [...o.tiles, ...around(o, sim, O.dryOasis.mudRadius)];
      for (const t of o.area) sim.board.setSlow(t.x, t.y, O.dryOasis.slowMult, O.dryOasis.pathCost);
      sim.emit({ type: 'mud', objectId: o.id, tiles: o.area });
      sim.emit({ type: 'objectState', objectId: o.id, state: o.state });
    },
  },
  campfire: {
    label: 'Fogueira de acampamento',
    desc: `Descanso antes da horda: +${O.campfire.regenPerSec} HP/s e recargas ${Math.round(O.campfire.cooldownCut * 100)}% mais curtas nesta fase.`,
    blocksWalk: always,
    blocksSight: never,
    action: 'Descansar na fogueira',
    applyUsed(o, sim) {
      o.state = 'used';
      sim.blessRegen += O.campfire.regenPerSec;
      sim.blessCooldown(O.campfire.cooldownCut);
    },
  },
};

/** Cria o estado inicial de um objeto a partir do MAP_CONFIG. */
export function makeObject(id: number, d: MapObjectDef): MapObject {
  const w = d.w ?? 1;
  const h = d.h ?? 1;
  const tiles: Vec2[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push({ x: d.x + x, y: d.y + y });
  const hp = OBJECT_RULES[d.type].hp ?? 0;
  return { id, type: d.type, x: d.x, y: d.y, w, h, tiles, hp, maxHp: hp, state: 'idle', area: [] };
}
