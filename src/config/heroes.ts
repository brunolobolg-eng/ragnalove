import type { HeroKind, SkillId } from '../core/progression/skills';

/**
 * Heróis jogáveis (dados centrais). As classes base vêm liberadas; as avançadas são
 * desbloqueadas por conquistas que valem entre jornadas (contadas no save do jogador).
 * `family` diz de onde vêm os status/armas (atributo principal, arma inicial, crítico).
 */
export type HeroFamily = 'warrior' | 'mage' | 'archer';

/** Estatísticas acumuladas entre jornadas que liberam heróis. */
export interface MetaStats {
  kills: number;
  perfectNights: number;
  bossesKilled: Record<string, number>;
  runsWon: number;
}

export interface HeroInfo {
  name: string;
  role: string;
  line: string;
  family: HeroFamily;
  /** Cor de destaque (pedestal, aura). */
  color: number;
  /** Habilidade de área (atalho F1) e ataque básico (F2). */
  area: SkillId;
  basic: SkillId;
  /** Cor do espectro (aura ao usar habilidade). */
  ghost: [number, number, number];
  /** Sem condição = liberado desde o início. */
  unlock?: { text: string; progress(m: MetaStats): [number, number] };
}

export const HERO_UNLOCKS = {
  sorcererKills: 1000,
  warlockBoss: 'boss2',
  assassinPerfectNights: 10,
};

export const HERO_INFO: Record<HeroKind, HeroInfo> = {
  warrior: {
    name: 'Guerreiro',
    role: 'Linha de frente',
    line: 'Segura o funil com escudo e espada. Ergue muralhas que a horda precisa quebrar.',
    family: 'warrior',
    color: 0xff6a4a,
    area: 'cleave',
    basic: 'bash',
    ghost: [0.35, 1.25, 1.0],
  },
  mage: {
    name: 'Mago',
    role: 'Maga divina',
    line: 'Barreiras de fogo e raios gélidos. Especialize em Cura (santuário, escudo, bênção) ou em Dano (nova, tempestade, julgamento).',
    family: 'mage',
    color: 0x6aa8ff,
    area: 'fireBarrier',
    basic: 'frostBolt',
    ghost: [0.55, 0.8, 1.6],
  },
  archer: {
    name: 'Arqueira',
    role: 'Dano à distância',
    line: 'Flechas de longo alcance, chuva de flechas e armadilhas que prendem o mais forte.',
    family: 'archer',
    color: 0x7aff6a,
    area: 'arrowRain',
    basic: 'preciseShot',
    ghost: [0.6, 1.5, 0.5],
  },
  sorcerer: {
    name: 'Feiticeira',
    role: 'Dano arcano',
    line: 'Orbes arcanos certeiros e meteoros sobre os grupos mais densos.',
    family: 'mage',
    color: 0xc07aff,
    area: 'meteorStrike',
    basic: 'arcaneOrb',
    ghost: [1.2, 0.55, 1.8],
    unlock: { text: `Derrote ${HERO_UNLOCKS.sorcererKills} monstros (somando as jornadas)`, progress: (m) => [Math.min(m.kills, HERO_UNLOCKS.sorcererKills), HERO_UNLOCKS.sorcererKills] },
  },
  warlock: {
    name: 'Bruxa',
    role: 'Maldições',
    line: 'Drena a vida dos inimigos e amaldiçoa grupos: amaldiçoados sofrem mais dano.',
    family: 'mage',
    color: 0xff4a7a,
    area: 'curse',
    basic: 'lifeDrain',
    ghost: [1.6, 0.25, 0.6],
    unlock: { text: 'Derrote o chefe do Ato II', progress: (m) => [Math.min(1, m.bossesKilled[HERO_UNLOCKS.warlockBoss] ?? 0), 1] },
  },
  assassin: {
    name: 'Assassino',
    role: 'Corpo a corpo letal',
    line: 'Golpes furtivos com muito crítico e leques de lâminas envenenadas.',
    family: 'archer',
    color: 0xffd04a,
    area: 'bladeFan',
    basic: 'backstab',
    ghost: [1.6, 1.3, 0.3],
    unlock: {
      text: `Vença ${HERO_UNLOCKS.assassinPerfectNights} ondas sem a cidade levar dano`,
      progress: (m) => [Math.min(m.perfectNights, HERO_UNLOCKS.assassinPerfectNights), HERO_UNLOCKS.assassinPerfectNights],
    },
  },
};

/** Ordem de exibição (seleção, HUD, ficha). */
export const HERO_ORDER: HeroKind[] = ['warrior', 'mage', 'archer', 'sorcerer', 'warlock', 'assassin'];
export const HERO_NAME = Object.fromEntries(HERO_ORDER.map((k) => [k, HERO_INFO[k].name])) as Record<HeroKind, string>;
export const isHeroKind = (k: string): k is HeroKind => k in HERO_INFO;
export const familyOf = (k: string): HeroFamily => (isHeroKind(k) ? HERO_INFO[k].family : 'warrior');

export const emptyMeta = (): MetaStats => ({ kills: 0, perfectNights: 0, bossesKilled: {}, runsWon: 0 });

/** O herói está liberado para esta conta? */
export function heroUnlocked(k: HeroKind, m: MetaStats): boolean {
  const u = HERO_INFO[k].unlock;
  if (!u) return true;
  const [a, b] = u.progress(m);
  return a >= b;
}
