import { barriersShield, type PartySetup } from '../../config/gameConfig';
import { HERO_INFO } from '../../config/heroes';
import { parseZone, type ZoneDef } from '../../config/zones';
import type { HeroKind } from '../progression/skills';

/** Tile ocupado por construção (Último Bastião): herói não entra nele. Sem predicado, nenhum tile está ocupado. */
export type Ocupado = (x: number, y: number) => boolean;

/** Muralha padrão: duas casas à frente do Guerreiro. */
export function muralhaPadrao(s: PartySetup): PartySetup['wall'] {
  const wm = s.members.find((mm) => mm.archetype === 'warrior');
  return wm ? { x: wm.x, y: wm.y - 2, orientation: 'H' } : undefined;
}

/** Coloca `kind` num tile livre perto do Mago (ou do primeiro herói). */
function comMembro(s: PartySetup, zone: ZoneDef, kind: HeroKind, ocupado: Ocupado): PartySetup {
  if (s.members.some((m) => m.archetype === kind)) return s;
  const pz = parseZone(zone);
  const free = (x: number, y: number) => pz.floor.some((f) => f.x === x && f.y === y) && !s.members.some((m) => m.x === x && m.y === y) && !ocupado(x, y);
  const m = s.members.find((mm) => mm.archetype === 'mage') ?? s.members[0];
  const tries: [number, number][] = [[2, 0], [-2, 0], [2, 1], [-2, 1], [1, 1], [-1, 1], [3, 0], [-3, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of tries)
    if (free(m.x + dx, m.y + dy)) {
      s.members.push({ archetype: kind, x: m.x + dx, y: m.y + dy });
      return s;
    }
  const f = pz.floor.filter((t) => t.y > pz.height / 2 && free(t.x, t.y))[0];
  if (f) s.members.push({ archetype: kind, x: f.x, y: f.y });
  return s;
}

/**
 * Heróis da party que não estão no setup padrão da zona entram em tiles livres perto do grupo. A classe inicial
 * ocupa o lugar padrão da classe-base da mesma família (ex.: Feiticeira no lugar do Mago).
 */
export function comPartyNaZona(s: PartySetup, zone: ZoneDef, party: readonly HeroKind[], ocupado: Ocupado = () => false): PartySetup {
  for (const k of party) {
    if (s.members.some((m) => m.archetype === k)) continue;
    const fam = HERO_INFO[k].family;
    const slot = s.members.find((m) => m.archetype === fam && !party.includes(fam));
    if (slot) slot.archetype = k;
  }
  for (const k of party) if (!s.members.some((m) => m.archetype === k)) s = comMembro(s, zone, k, ocupado);
  return s;
}

/**
 * Formação padrão de uma noite, sem a formação salva do jogador: o setup da zona com a party, a barreira de fogo
 * do Mago sozinho e a muralha. É a montagem que a campanha usa no começo de cada noite (main.ts → loadZone).
 */
export function formacaoPadraoDaNoite(zone: ZoneDef, party: readonly HeroKind[], ocupado?: Ocupado): PartySetup {
  const base = comPartyNaZona(structuredClone(zone.defaultSetup), zone, party, ocupado);
  if (party.length === 1 && party[0] === 'mage') {
    const m = base.members.find((mm) => mm.archetype === 'mage')!;
    base.barriers = barriersShield(m.x, m.y);
  }
  base.wall = muralhaPadrao(base);
  return base;
}
