import type { HeroKind } from '../core/progression/skills';
import { heroUnlocked, type MetaStats } from './heroes';

/**
 * Auras de monstro (dados). Um monstro comum pode nascer PORTADOR de uma aura: os monstros aliados
 * a até `raio` dele (não ele mesmo) recebem o efeito, e cada unidade recebe cada aura no máximo uma vez.
 * O sorteio (quem é portador e qual aura) usa o RNG próprio da simulação, com a chance da onda
 * (`GAME_CONFIG.wave.auraChance`). Heróis não têm aura; só a queimação atinge heróis, como efeito hostil.
 */
export const AURA_KINDS = ['velocidade', 'critico', 'mitigacao', 'regeneracao', 'queimacao'] as const;
export type AuraKind = (typeof AURA_KINDS)[number];

export const AURA = {
  /** Chance de cada monstro comum nascer portador, por noite do Bastião e por fase da campanha. */
  chanceBastion: 0.12,
  chanceCampanha: 0.08,
  /** Bastião: as auras só começam a partir desta noite (a noite da horda = nights + 1). */
  minNoiteBastiao: 20,
  /** Alcance em tiles (distância de Chebyshev) a partir do portador. */
  raio: 2,
  /** Velocidade: os passos dos aliados em alcance custam `passo` vezes o tempo. */
  velocidade: { passo: 0.75 },
  /** Crítico: os golpes dos aliados em alcance ganham `chanceExtra` de chance de crítico e `dano` vezes o dano. */
  critico: { chanceExtra: 0.2, dano: 1.5 },
  /** Mitigação: os aliados em alcance levam `reducao` a menos de dano da party. */
  mitigacao: { reducao: 0.25 },
  /** Regeneração: os aliados em alcance recuperam esta fração da vida máxima por segundo. */
  regeneracao: { porSegundo: 0.02 },
  /** Queimação: o portador queima os heróis em alcance a cada `pulsoSeg` segundos; cada pulso é `fracaoDoDano` do dano dele. */
  queimacao: { pulsoSeg: 1, fracaoDoDano: 0.5 },
};

/** Cor e nome de cada aura (o render lê; a regra não usa). */
export const AURA_VISUAL: Record<AuraKind, { nome: string; cor: string; corClara: string }> = {
  velocidade: { nome: 'Aura de velocidade', cor: '#00B8FF', corClara: '#7FEBFF' },
  critico: { nome: 'Aura de crítico', cor: '#FFE000', corClara: '#FFFBD0' },
  mitigacao: { nome: 'Aura de mitigação', cor: '#3E63C9', corClara: '#9DB8FF' },
  regeneracao: { nome: 'Aura de regeneração', cor: '#0FB261', corClara: '#BDFFAD' },
  queimacao: { nome: 'Aura de queimação', cor: '#FF3808', corClara: '#FFB847' },
};

/** Heróis que se liberam jogando (conquistas): com os três, a campanha passa a sortear auras. */
export const AURA_HEROES_CAMPANHA: HeroKind[] = ['sorcerer', 'warlock', 'assassin'];

/** A campanha já sorteia auras? Só com os três heróis que se liberam jogando desbloqueados. */
export function auraCampanhaLiberada(meta: MetaStats): boolean {
  return AURA_HEROES_CAMPANHA.every((k) => heroUnlocked(k, meta));
}
