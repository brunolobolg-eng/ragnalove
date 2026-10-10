/**
 * Cartas de monstro: progressão permanente entre runs (coleção no save de meta).
 *
 * Run (vitória) → pacote de 5 → coleção → fusão/equipar → próxima run mais forte.
 * Bônus entram nos atributos via `profile.heroes[k].cardAttrs`, somados no `heroStats`
 * (só acima da base, como o resto). Valores por raridade: Normal +3, Mini-Boss +8,
 * MVP +12/+6. Afinidade flexível: sem afinidade o bônus cai pela metade (arredonda p/ baixo).
 */
import type { HeroKind } from './skills';
import type { AttrKey, Attrs } from './attributes';
import { emptyAttrs } from './attributes';

export type CardRarity = 'normal' | 'miniboss' | 'mvp';

export interface CardDef {
  id: string;
  name: string;
  /** Arquivo em public/sprites/cards (sem extensão). */
  art: string;
  rarity: CardRarity;
  /** Atributo principal (+ secundário nas MVPs). */
  attr: AttrKey;
  second?: { attr: AttrKey; value: number };
  value: number;
  /** Classes com afinidade (bônus cheio; sem afinidade = metade). */
  affinity: HeroKind[];
}

export interface CardCollection {
  /** Quantas cópias de cada carta (id → qtd). */
  owned: Record<string, number>;
  /** Cartas equipadas por herói (ids, com repetição; respeita slots e posse). */
  equipped: Partial<Record<HeroKind, string[]>>;
}

export const emptyCollection = (): CardCollection => ({ owned: {}, equipped: {} });

/** Saves antigos: garante o formato da coleção. */
export function migrateCollection(c: unknown): CardCollection {
  const base = emptyCollection();
  if (!c || typeof c !== 'object') return base;
  const o = c as Partial<CardCollection>;
  return { owned: { ...(o.owned ?? {}) }, equipped: { ...(o.equipped ?? {}) } };
}

const affinityOf = (attr: AttrKey): HeroKind[] =>
  (({ str: ['warrior', 'assassin'], int: ['mage', 'sorcerer', 'warlock'], dex: ['archer', 'assassin'], vit: ['warrior', 'mage', 'archer', 'sorcerer', 'warlock', 'assassin'], luk: ['archer', 'assassin', 'warrior'] }) as Record<AttrKey, HeroKind[]>)[attr];

const N = (id: string, name: string, attr: AttrKey, art = id): CardDef => ({ id, name, art, rarity: 'normal', attr, value: 3, affinity: affinityOf(attr) });
const B = (id: string, name: string, attr: AttrKey, art = id): CardDef => ({ id, name, art, rarity: 'miniboss', attr, value: 8, affinity: affinityOf(attr) });
const V = (id: string, name: string, attr: AttrKey, second: { attr: AttrKey; value: number }, art = id): CardDef => ({ id, name, art, rarity: 'mvp', attr, value: 12, second, affinity: affinityOf(attr) });

/** Catálogo completo (112 artes). Valores e afinidades revisáveis aqui, sem tocar em código. */
export const CARD_CATALOG: CardDef[] = [
  // ---- cards2 (todas Normais) ----
  N('stalactic_golem', 'STALACTIC GOLEM', 'str'), N('gargoyle', 'GARGOYLE', 'dex'), N('high_orc', 'HIGH ORC', 'str'), N('requiem', 'REQUIEM', 'int'),
  N('incubus', 'INCUBUS', 'int'), N('succubus', 'SUCCUBUS', 'luk'), N('anolian', 'ANOLIAN', 'str'), N('rooween', 'ROOWEEN', 'dex'),
  N('cruiser', 'CRUISER', 'vit'), N('tamruan', 'TAMRUAN', 'int'), N('phendark', 'PHENDARK', 'int'), N('golems', 'GOLEMS', 'vit'),
  N('injustice', 'INJUSTICE', 'luk'), N('zipper_bear', 'ZIPPER BEAR', 'str'), N('grizzly', 'GRIZZLY', 'str'), N('orc_zombie', 'ORC ZOMBIE', 'str'),
  N('skeleton_prisoner', 'SKELETON PRISONER', 'dex'), N('hunter_fly', 'HUNTER FLY', 'dex'), N('deviace', 'DEVIACE', 'int'), N('mermand', 'MERMAND', 'dex'),
  N('spore', 'SPORE', 'vit'), N('poison_spore', 'POISON SPORE', 'int'), N('mandragora', 'MANDRAGORA', 'int'), N('fireblend', 'FIREBLEND', 'str'),
  N('bongun', 'BONGUN', 'str'), N('munak', 'MUNAK', 'vit'), N('soldier', 'SOLDIER', 'str'), N('gorgon', 'GORGON', 'dex'),
  N('noxious', 'NOXIOUS', 'int'), N('giant_whisper', 'GIANT WHISPER', 'vit'), N('miming', 'MIMING', 'luk'), N('memorial', 'MEMORIAL', 'luk'),
  // ---- cards3 ----
  N('angeling', 'ANGELING', 'vit'), N('deviling', 'DEVILING', 'str'), N('ghostring', 'GHOSTRING', 'int'), N('mastering', 'MASTERING', 'vit'),
  N('toad', 'TOAD', 'vit'), N('strouf', 'STROUF', 'dex'), N('dragon_tail', 'DRAGON TAIL', 'str'), N('mao_guai', 'MAO GUAI', 'str'),
  B('mutant_dragonoid', 'MUTANT DRAGONOID', 'str'), B('orc_hero', 'ORC HERO', 'str'), N('myomewnee', 'MYOMEWNEE', 'dex'), N('gryphon', 'GRYPHON', 'str'),
  B('mistress', 'MISTRESS', 'int'), B('maya_purple', 'MAYA PURPLE', 'int'), B('bloody_knight', 'BLOODY KNIGHT', 'str'), B('evil_snake_lord', 'EVIL SNAKE LORD', 'int'),
  N('owl_viscount', 'OWL VISCOUNT', 'int'), B('owl_duke', 'OWL DUKE', 'int'), B('garm', 'GARM', 'str'), N('stormy_knight', 'STORMY KNIGHT', 'str'),
  N('creamy', 'CREAMY', 'vit'), N('creamy_fear', 'CREAMY FEAR', 'int'), N('yoyo', 'YOYO', 'dex'), N('rocker', 'ROCKER', 'vit'),
  N('spore_2', 'SPORE', 'vit', 'spore_2'), N('poison_spore_2', 'POISON SPORE', 'int', 'poison_spore_2'), N('smokie', 'SMOKIE', 'dex'), N('green_ferus', 'GREEN FERUS', 'str'),
  N('verit', 'VERIT', 'vit'), N('matyr', 'MATYR', 'vit'), N('miming_2', 'MIMING', 'luk', 'miming_2'), N('sohee', 'SOHEE', 'int'),
  // ---- cards4 (todas Normais) ----
  N('drops', 'DROPS', 'luk'), N('fabre', 'FABRE', 'dex'), N('chonchon', 'CHONCHON', 'dex'), N('willow', 'WILLOW', 'vit'),
  N('mandragora_2', 'MANDRAGORA', 'int', 'mandragora_2'), N('peco_peco_egg', 'PECO PECO EGG', 'vit'), N('goblin', 'GOBLIN', 'dex'), N('kukre', 'KUKRE', 'str'),
  N('horong', 'HORONG', 'int'), N('marina', 'MARINA', 'int'), N('santa_poring', 'SANTA PORING', 'vit'), N('metaling', 'METALING', 'vit'),
  N('pupa', 'PUPA', 'vit'), N('femur', 'FEMUR', 'dex'), N('plankton', 'PLANKTON', 'int'), N('magnolia', 'MAGNOLIA', 'int'),
  N('skeleton', 'SKELETON', 'str'), N('wolf', 'WOLF', 'dex'), N('mummy', 'MUMMY', 'str'), N('hydra', 'HYDRA', 'int'),
  N('savage_babe', 'SAVAGE BABE', 'str'), N('hornet', 'HORNET', 'dex'), N('desert_wolf', 'DESERT WOLF', 'dex'), N('minorous', 'MINOROUS', 'str'),
  N('skeleton_worker', 'SKELETON WORKER', 'str'), N('abysmal_knight', 'ABYSMAL KNIGHT', 'str'), N('thara_frog', 'THARA FROG', 'vit'), N('hodremlin', 'HODREMLIN', 'str'),
  N('alice', 'ALICE', 'int'), N('bigfoot', 'BIGFOOT', 'str'), N('caramel', 'CARAMEL', 'dex'), N('rafflesia', 'RAFFLESIA', 'int'),
  // ---- cards5: MVPs + repetições ----
  V('baphomet', 'BAPHOMET', 'str', { attr: 'vit', value: 6 }), V('dark_lord', 'DARK LORD', 'int', { attr: 'vit', value: 6 }),
  V('doppelganger', 'DOPPELGANGER', 'dex', { attr: 'str', value: 6 }), V('dracula', 'DRACULA', 'int', { attr: 'luk', value: 6 }),
  V('eddga', 'EDDGA', 'str', { attr: 'vit', value: 6 }), V('golden_thief_bug', 'GOLDEN THIEF BUG', 'luk', { attr: 'vit', value: 6 }),
  V('maya', 'MAYA', 'int', { attr: 'vit', value: 6 }), V('moonlight_flower', 'MOONLIGHT FLOWER', 'dex', { attr: 'luk', value: 6 }),
  V('osiris', 'OSIRIS', 'int', { attr: 'vit', value: 6 }),
  N('angeling_2', 'ANGELING', 'vit', 'angeling_2'), N('deviling_2', 'DEVILING', 'str', 'deviling_2'), N('ghostring_2', 'GHOSTRING', 'int', 'ghostring_2'),
  B('orc_hero_2', 'ORC HERO', 'str', 'orc_hero_2'), B('bloody_knight_2', 'BLOODY KNIGHT', 'str', 'bloody_knight_2'), B('garm_2', 'GARM', 'str', 'garm_2'),
  N('poring', 'PORING', 'vit'),
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARD_CATALOG.map((c) => [c.id, c]));
export const NORMALS = CARD_CATALOG.filter((c) => c.rarity === 'normal');
export const MINIBOSSES = CARD_CATALOG.filter((c) => c.rarity === 'miniboss');
export const MVPS = CARD_CATALOG.filter((c) => c.rarity === 'mvp');
export const cardArt = (id: string): string => `sprites/cards/${CARD_BY_ID[id]?.art ?? id}.jpg`;
/**
 * Recorte da arte (fração da imagem original de 192×256). A arte traz pintados a moldura e a faixa do nome;
 * a interface corta isso e desenha a moldura e o nome iguais em todas as cartas. Dado, não número mágico:
 * ajuste aqui se uma arte nova tiver outra margem.
 */
export const CARD_ART_WINDOW = { x: 0.085, y: 0.05, w: 0.83, h: 0.74 } as const;

const RARITY_RANK: Record<CardRarity, number> = { normal: 0, miniboss: 1, mvp: 2 };

/**
 * Ordem de revelação do pacote: Normais primeiro e a MVP por último (o suspense cresce até a raridade).
 * Estável dentro da mesma raridade (mantém a ordem em que saíram).
 */
export const revealOrder = (ids: string[]): string[] =>
  ids
    .map((id, i) => ({ id, i, rank: RARITY_RANK[CARD_BY_ID[id]?.rarity ?? 'normal'] }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.id);

/** Slots por runs vencidas: 2/run até 20 (run 10), +1/run até 30 (run 20+). */
export function cardSlots(runsWon: number): number {
  if (runsWon <= 0) return 0;
  if (runsWon <= 10) return runsWon * 2;
  return Math.min(30, 20 + (runsWon - 10));
}

/** Pacote de fim de run (só vitória): 3 Normais + 2 rolagens 90/5/5. */
export function rollPack(rand: () => number = Math.random): string[] {
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
  const out = [pick(NORMALS).id, pick(NORMALS).id, pick(NORMALS).id];
  for (let i = 0; i < 2; i++) {
    const r = rand();
    out.push(r < 0.9 ? pick(NORMALS).id : r < 0.95 ? pick(MINIBOSSES).id : pick(MVPS).id);
  }
  return out;
}

export function addCards(c: CardCollection, ids: string[]): void {
  for (const id of ids) if (CARD_BY_ID[id]) c.owned[id] = (c.owned[id] ?? 0) + 1;
}

/** Cópias livres (fora das builds): total − equipadas em todos os heróis. */
export function freeCopies(c: CardCollection, id: string): number {
  let used = 0;
  for (const list of Object.values(c.equipped)) for (const x of list ?? []) if (x === id) used++;
  return (c.owned[id] ?? 0) - used;
}

export function equipCard(c: CardCollection, hero: HeroKind, id: string, slots: number): string | undefined {
  if (!CARD_BY_ID[id]) return 'Carta inválida.';
  const list = (c.equipped[hero] ??= []);
  if (list.length >= slots) return 'Sem slots livres.';
  if (freeCopies(c, id) <= 0) return 'Sem cópias livres.';
  list.push(id);
  return undefined;
}

export function unequipCard(c: CardCollection, hero: HeroKind, index: number): void {
  c.equipped[hero]?.splice(index, 1);
}

/**
 * Fusão 3 iguais → 1 Normal aleatória (nunca a mesma). Só usa cópias livres.
 * Devolve o id criado (ou o motivo da falha).
 */
export function fuseTriple(c: CardCollection, id: string, rand: () => number = Math.random): { made?: string; err?: string } {
  const d = CARD_BY_ID[id];
  if (!d || d.rarity !== 'normal') return { err: 'Só Normais fundem 3×.' };
  if (freeCopies(c, id) < 3) return { err: 'Precisa de 3 cópias livres.' };
  const pool = NORMALS.filter((x) => x.id !== id);
  const made = pool[Math.floor(rand() * pool.length)].id;
  c.owned[id]! -= 3;
  addCards(c, [made]);
  return { made };
}

/**
 * Fusão 10 Normais quaisquer → 1 Mini-Boss aleatória. Preserva 1 cópia de cada
 * carta quando dá (pega primeiro dos excedentes), e nunca toca em equipadas.
 */
export function fuseBulk(c: CardCollection, rand: () => number = Math.random): { made?: string; err?: string } {
  const avail = NORMALS.filter((x) => freeCopies(c, x.id) > 0).sort((a, b) => freeCopies(c, b.id) - freeCopies(c, a.id));
  const total = avail.reduce((s, x) => s + freeCopies(c, x.id), 0);
  if (total < 10) return { err: `Faltam ${10 - total} Normais livres.` };
  let need = 10;
  // 1ª passada: só excedentes (mantém 1 de cada)
  for (const x of avail) {
    if (need <= 0) break;
    const extra = freeCopies(c, x.id) - 1;
    const take = Math.min(Math.max(0, extra), need);
    c.owned[x.id]! -= take;
    need -= take;
  }
  // 2ª passada: últimas cópias, das menos repetidas (preserva diversidade)
  for (const x of [...avail].reverse()) {
    if (need <= 0) break;
    const take = Math.min(freeCopies(c, x.id), need);
    c.owned[x.id]! -= take;
    need -= take;
  }
  const made = MINIBOSSES[Math.floor(rand() * MINIBOSSES.length)].id;
  addCards(c, [made]);
  return { made };
}

/** Bônus de atributos das cartas equipadas (afinidade cheia, sem afinidade metade). */
export function cardBonusFor(hero: HeroKind, c: CardCollection): Attrs {
  const out = emptyAttrs();
  for (const id of c.equipped[hero] ?? []) {
    const d = CARD_BY_ID[id];
    if (!d) continue;
    const full = d.affinity.includes(hero);
    const v = (n: number): number => (full ? n : Math.floor(n / 2));
    out[d.attr] += v(d.value);
    if (d.second) out[d.second.attr] += v(d.second.value);
  }
  return out;
}

/** Aplica a build de cartas no profile (toda nova run; vale para os 6 heróis). */
export function applyCardLoadout(profile: { heroes: Record<string, { cardAttrs?: Attrs }> }, c: CardCollection): void {
  for (const [hero, h] of Object.entries(profile.heroes)) h.cardAttrs = cardBonusFor(hero as HeroKind, c);
}
