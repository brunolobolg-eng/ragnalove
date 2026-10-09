/**
 * Kits de cenário por ambientação: quais peças dos pacotes (public/models/props) aparecem em cada bioma,
 * com que cor, e a cor da sombra de contato, da luz quente e da névoa. Só visual: a grade e as regras
 * vêm do mapa da zona. Cada bioma tem o seu: nada de geleira no mapa de grama.
 */

export type KitBiome = 'forest' | 'plains' | 'desert' | 'mountain' | 'ash';

export interface Tint {
  /** Cor que a peça puxa (ex.: geada azulada, areia, musgo). */
  color: number;
  /** Quanto da cor entra na peça: 0 = cor original do pacote. */
  amount: number;
}

export interface CampKit {
  tent: string;
  fire: string;
  barrel: string;
  crate: string;
  bed: string;
  cart: string;
  flag: string;
  sign: string;
}

export interface BiomeKit {
  /** Pedras do tabuleiro e paredes '#': pedras da ambientação. */
  rock: string[];
  rockTint: Tint;
  /** Serra/crista do fundo e das laterais (árvores, colinas, mesas, montanhas). */
  ridge: string[];
  ridgeTint: Tint;
  /** Picos do fundo: as peças maiores. */
  peak: string[];
  /** Torres ou ruínas nos picos do fundo (opcional). */
  towers: string[];
  /** Árvores em GLB no tabuleiro (null = usa as árvores procedurais do bioma). */
  trees: string[] | null;
  /** Árvores/plantas procedurais da decoração solta (vazio = a decoração usa só GLB). */
  ringTree: string[];
  /** Toco procedural/GLB (null = toco procedural do bioma). */
  stump: string | null;
  camp: CampKit;
  campTint: Tint;
  /** Cor da sombra de contato sob cada peça. */
  contact: number;
  /** Cor da luz quente das fogueiras, tochas e lanternas. */
  warm: number;
  /** Névoa baixa (null = sem névoa). */
  mist: { color: number; opacity: number } | null;
}

const NONE: Tint = { color: 0xffffff, amount: 0 };

export const KITS: Record<KitBiome, BiomeKit> = {
  forest: {
    rock: ['survival/rock-a', 'survival/rock-b', 'survival/rock-c', 'town/rock-small'],
    rockTint: { color: 0x4f6e34, amount: 0.3 }, // musgo
    ridge: ['survival/tree-tall', 'castle/tree-large', 'town/tree-high-round', 'castle/tree-small'],
    ridgeTint: NONE,
    peak: ['castle/tree-large', 'survival/tree-tall'],
    towers: [],
    trees: null,
    ringTree: ['pine', 'oak'],
    stump: 'nature/stump_old',
    camp: { tent: 'nature/tent_smallClosed', fire: 'nature/campfire_logs', barrel: 'survival/barrel', crate: 'survival/box', bed: 'survival/bedroll', cart: 'nature/log_stack', flag: 'town/banner-green', sign: 'survival/signpost' },
    campTint: NONE,
    contact: 0x0a1a08,
    warm: 0xffa050,
    mist: { color: 0x7f9c74, opacity: 0.09 },
  },
  plains: {
    rock: ['town/rock-large', 'town/rock-small', 'town/rock-wide'],
    rockTint: { color: 0xb8a888, amount: 0.25 }, // pedra de campo
    ridge: ['town/rock-wide', 'town/rock-large', 'survival/rock-b'],
    ridgeTint: { color: 0x7d9b52, amount: 0.4 }, // colinas verdes
    peak: ['town/rock-wide', 'castle/rocks-large'],
    towers: [],
    trees: null,
    ringTree: ['oak'],
    stump: 'nature/stump_old',
    camp: { tent: 'survival/tent-canvas', fire: 'survival/campfire-pit', barrel: 'survival/barrel-open', crate: 'survival/box-large', bed: 'nature/log_stack', cart: 'town/cart-high', flag: 'town/banner-green', sign: 'survival/signpost' },
    campTint: NONE,
    contact: 0x1d2a10,
    warm: 0xffc070,
    mist: { color: 0xd8c9a0, opacity: 0.08 },
  },
  desert: {
    rock: ['survival/rock-b', 'survival/rock-c', 'survival/rock-a'],
    rockTint: { color: 0xd6a872, amount: 0.5 }, // arenito
    ridge: ['castle/rocks-large', 'town/rock-wide', 'survival/rock-b'],
    ridgeTint: { color: 0xcf9f68, amount: 0.55 }, // mesas
    peak: ['castle/rocks-large', 'town/rock-wide'],
    towers: ['castle/tower-hexagon-base', 'castle/tower-square-base'],
    trees: null,
    ringTree: ['cactus'],
    stump: null,
    camp: { tent: 'nature/tent_detailedOpen', fire: 'survival/campfire-pit', barrel: 'survival/barrel', crate: 'survival/box-large-open', bed: 'survival/bedroll', cart: 'town/cart', flag: 'town/banner-red', sign: 'town/pillar-stone' },
    campTint: NONE,
    contact: 0x3b2810,
    warm: 0xffa040,
    mist: { color: 0xc9a070, opacity: 0.1 },
  },
  mountain: {
    rock: ['town/rock-large', 'town/rock-wide', 'town/rock-large', 'castle/rocks-large'],
    rockTint: { color: 0xe4edf8, amount: 0.5 }, // geada
    ridge: ['town/rock-wide', 'town/rock-large', 'castle/rocks-large'],
    ridgeTint: { color: 0xe4edf8, amount: 0.5 },
    peak: ['town/rock-wide', 'castle/rocks-large'],
    towers: ['castle/tower-square-top-roof-high', 'castle/tower-hexagon-mid'],
    trees: ['castle/tree-large', 'castle/tree-small', 'survival/tree-tall', 'town/tree-high-round'],
    ringTree: [],
    stump: 'nature/stump_old',
    camp: { tent: 'nature/tent_smallClosed', fire: 'nature/campfire_logs', barrel: 'survival/barrel', crate: 'survival/box', bed: 'survival/bedroll', cart: 'town/cart', flag: 'town/banner-red', sign: 'survival/signpost' },
    campTint: { color: 0xe4edf8, amount: 0.35 },
    contact: 0x0b1a33,
    warm: 0xffa050,
    mist: { color: 0xdfe9f7, opacity: 0.14 },
  },
  ash: {
    rock: ['castle/rocks-small', 'castle/rocks-large', 'survival/rock-c'],
    rockTint: { color: 0x2c2522, amount: 0.55 }, // basalto
    ridge: ['castle/rocks-large', 'survival/rock-b', 'castle/rocks-small'],
    ridgeTint: { color: 0x352b27, amount: 0.6 },
    peak: ['castle/rocks-large', 'survival/rock-b'],
    towers: ['castle/tower-square-mid-windows'],
    trees: null,
    ringTree: ['deadTree'],
    stump: null,
    camp: { tent: 'survival/tent-canvas', fire: 'survival/campfire-pit', barrel: 'survival/barrel', crate: 'survival/box-large-open', bed: 'survival/bedroll', cart: 'town/cart', flag: 'town/banner-red', sign: 'town/pillar-stone' },
    campTint: { color: 0x2c2420, amount: 0.35 }, // fuligem
    contact: 0x070303,
    warm: 0xff5a20,
    mist: { color: 0x5a4a44, opacity: 0.15 },
  },
};
