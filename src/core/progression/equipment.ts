import type { Rng } from '../sim/rng';
import { ATTRIBUTES_CONFIG, ATTR_KEYS, ATTR_LABEL, emptyGear, type AttrKey, type GearBonus } from './attributes';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
export type Slot = 'weapon' | 'offhand' | 'head' | 'armor' | 'cloak' | 'boots' | 'earring' | 'amulet' | 'ring' | 'belt';
export const SLOTS: Slot[] = ['weapon', 'offhand', 'head', 'armor', 'cloak', 'boots', 'earring', 'amulet', 'ring', 'belt'];
/** Grupo do slot: define o efeito do refino e o filtro da bolsa. */
export type SlotGroup = 'weapon' | 'armor' | 'accessory';
export const SLOT_GROUP: Record<Slot, SlotGroup> = {
  weapon: 'weapon',
  offhand: 'armor', head: 'armor', armor: 'armor', cloak: 'armor', boots: 'armor',
  earring: 'accessory', amulet: 'accessory', ring: 'accessory', belt: 'accessory',
};
/** Peso de cada slot nos drops (armas e armaduras saem mais). */
export const SLOT_WEIGHT: Record<Slot, number> = { weapon: 3, offhand: 1, head: 1.2, armor: 1.6, cloak: 1, boots: 1.2, earring: 0.8, amulet: 0.8, ring: 1, belt: 0.8 };

export const RARITY_INFO: Record<Rarity, { label: string; color: string; rolls: number }> = {
  common: { label: 'Comum', color: '#b8bcc4', rolls: 1 },
  uncommon: { label: 'Incomum', color: '#3fcf5a', rolls: 1 },
  rare: { label: 'Raro', color: '#3f8fff', rolls: 2 },
  epic: { label: 'Épico', color: '#b55cff', rolls: 3 },
  legendary: { label: 'Lendário', color: '#ffd23f', rolls: 4 },
  mythic: { label: 'Mítico', color: '#ff5e3a', rolls: 5 },
};
export const SLOT_LABEL: Record<Slot, string> = {
  weapon: 'Arma', offhand: 'Escudo', head: 'Capacete', armor: 'Armadura', cloak: 'Capa',
  boots: 'Botas', earring: 'Brincos', amulet: 'Colar', ring: 'Anel', belt: 'Cinto',
};

/**
 * Chance base de um monstro dropar equipamento (Sorte soma em cima). Calibrada para ~1,9 item
 * por fase: em 10 fases, na média, 10 Comuns, 5 Incomuns, 3 Raros e 1 Lendário.
 */
export const EQUIPMENT_DROP_CHANCE = 0.045;

/** Pesos de raridade dos drops comuns (Mítico só cai de chefes e da Sobrevivência). */
export const RARITY_WEIGHTS: Record<Rarity, number> = { common: 10, uncommon: 5, rare: 3, epic: 0.5, legendary: 1, mythic: 0 };

export type RollKind = 'hpRegen' | 'manaRegen' | 'attackSpeed' | 'block' | 'dodge' | 'oneAttr' | 'allAttr';

/** Pool de rolagens de atributo de equipamento (valor sorteado entre min e max). */
export const ATTRIBUTE_ROLL_POOL: { kind: RollKind; weight: number; min: number; max: number }[] = [
  { kind: 'hpRegen', weight: 20, min: 1, max: 3 }, // HP/s
  { kind: 'manaRegen', weight: 15, min: 3, max: 8 }, // % de recarga (o jogo não tem mana: acelera habilidades)
  { kind: 'attackSpeed', weight: 18, min: 4, max: 10 }, // %
  { kind: 'block', weight: 15, min: 3, max: 8 }, // %
  { kind: 'dodge', weight: 15, min: 3, max: 8 }, // %
  { kind: 'oneAttr', weight: 14, min: 2, max: 2 }, // +2 em um atributo sorteado
  { kind: 'allAttr', weight: 3, min: 2, max: 2 }, // +2 em TODOS (raro)
];

export interface ItemRoll {
  kind: RollKind;
  value: number;
  attr?: AttrKey; // para oneAttr
}

export interface Item {
  id: string;
  slot: Slot;
  rarity: Rarity;
  rolls: ItemRoll[];
  /** Nível de refino (+1, +2...). */
  refine?: number;
  /** Lendário/Mítico despertado com almas (atributos ×1,5). */
  awakened?: boolean;
  /** Tipo (espada, cajado, peitoral...). Itens antigos sem tipo usam o sorteio pelo id. */
  kind?: string;
  /** Ataque da arma física (define o dano de Guerreiro e Arqueira). */
  atk?: number;
  /** Ataque mágico do cajado (soma ao dano do Mago, junto da Inteligência). */
  matk?: number;
}

/** Efeito de cada nível de refino por slot (e onde a aura cosmética começa). */
export const REFINE = {
  max: 10,
  auraFrom: 5,
  weaponDamagePerLevel: 0.06,
  armorHpPerLevel: 0.025,
  accessoryLuckPerLevel: 1,
  accessoryDodgePerLevel: 0.005,
  /** Chance de sucesso ao ir PARA o nível (índice = nível alvo). Até +4 é seguro. */
  chance: [1, 1, 1, 1, 1, 0.8, 0.65, 0.5, 0.35, 0.25, 0.15],
};

/** Multiplicador dos atributos do item despertado. */
export const AWAKEN_MULT = 1.5;

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const WEAPON_KINDS = ['sword', 'axe', 'staff', 'bow', 'mace', 'dagger'] as const;
/** Listas antigas (3 slots) — só para reconhecer itens de saves anteriores. */
export const ARMOR_KINDS = ['plate', 'robe', 'vest', 'helm', 'shield'] as const;
export const ACC_KINDS = ['ring', 'amulet', 'bracelet', 'earring', 'belt', 'orb'] as const;
/** Tipos de item por slot. */
export const SLOT_KINDS: Record<Slot, readonly string[]> = {
  weapon: WEAPON_KINDS,
  offhand: ['shield', 'orb'],
  head: ['helm', 'hat'],
  armor: ['plate', 'robe', 'vest'],
  cloak: ['cloak'],
  boots: ['boots'],
  earring: ['earring'],
  amulet: ['amulet'],
  ring: ['ring', 'bracelet'],
  belt: ['belt'],
};
/** Slot de cada tipo (migração de itens antigos). */
export const KIND_SLOT: Record<string, Slot> = Object.fromEntries(
  (Object.entries(SLOT_KINDS) as [Slot, readonly string[]][]).flatMap(([slot, ks]) => ks.map((k) => [k, slot])),
) as Record<string, Slot>;
export const ITEM_KIND_LABEL: Record<string, string> = {
  sword: 'Espada', axe: 'Machado', staff: 'Cajado', bow: 'Arco', mace: 'Maça', dagger: 'Adaga',
  plate: 'Peitoral', robe: 'Túnica', vest: 'Colete', helm: 'Elmo', hat: 'Chapéu', shield: 'Escudo',
  cloak: 'Capa', boots: 'Botas',
  ring: 'Anel', amulet: 'Colar', bracelet: 'Bracelete', earring: 'Brincos', belt: 'Cinto', orb: 'Talismã',
};
/** Armas mágicas (conjuradores) × físicas (dependem do Ataque). */
export const MAGIC_WEAPONS = ['staff'];
export const isMagicWeapon = (kind: string) => MAGIC_WEAPONS.includes(kind);
/** Quais armas cada classe empunha. Armaduras e acessórios servem em todos. */
export const WEAPON_USERS: Record<string, string[]> = {
  warrior: ['sword', 'axe', 'mace', 'dagger'],
  archer: ['bow', 'dagger'],
  mage: ['staff'],
};
/** Ataque base por raridade (±12% no sorteio) e peso de cada tipo de arma. */
export const WEAPON_ATK: Record<Rarity, number> = { common: 12, uncommon: 18, rare: 26, epic: 36, legendary: 50, mythic: 68 };
const KIND_ATK: Record<string, number> = { sword: 1, axe: 1.14, mace: 1.08, dagger: 0.84, bow: 1, staff: 0.9 };

/** Variante do item: tipo gravado nele ou, em itens antigos, sorteado de forma estável pelo id. */
export function itemKind(it: Pick<Item, 'id' | 'slot'> & { kind?: string }): string {
  if (it.kind) return it.kind;
  const slot = it.slot as string;
  const list = slot === 'weapon' ? WEAPON_KINDS : slot === 'armor' ? ARMOR_KINDS : slot === 'accessory' ? ACC_KINDS : SLOT_KINDS[it.slot] ?? ACC_KINDS;
  return list[strHash(it.id) % list.length];
}

/** A classe pode usar o item? (só armas têm restrição) */
export function canUse(hero: string, it: Item): boolean {
  return it.slot !== 'weapon' || (WEAPON_USERS[hero] ?? []).includes(itemKind(it));
}

/** Ataque (físico ou mágico) de uma arma com a raridade e o tipo dados — valor "médio" (usado na migração). */
export function weaponPower(rarity: Rarity, kind: string, k = 1): { atk?: number; matk?: number } {
  const v = Math.round(WEAPON_ATK[rarity] * (KIND_ATK[kind] ?? 1) * k);
  return isMagicWeapon(kind) ? { matk: v } : { atk: v };
}

export function itemName(it: Item): string {
  return `${ITEM_KIND_LABEL[itemKind(it)] ?? SLOT_LABEL[it.slot]}${it.refine ? ` +${it.refine}` : ''} · ${RARITY_INFO[it.rarity].label}${it.awakened ? ' ✦' : ''}`;
}

/** Valor efetivo de uma rolagem (despertar aumenta). */
export function rollValue(it: Item, r: ItemRoll): number {
  return it.awakened ? Math.round(r.value * AWAKEN_MULT) : r.value;
}

function weighted<T>(rng: Rng, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r < 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** Sorte desloca os pesos para raridades melhores (tier 0 não ganha, tier 3 ganha mais). */
export function rarityWeights(luck: number): [Rarity, number][] {
  const shift = luck * ATTRIBUTES_CONFIG.luk.rarityShiftPerPoint;
  return RARITIES.map((r, tier) => [r, RARITY_WEIGHTS[r] * (1 + shift * tier)]);
}

export function dropChance(luck: number): number {
  return Math.min(0.3, EQUIPMENT_DROP_CHANCE + luck * ATTRIBUTES_CONFIG.luk.dropChancePerPoint);
}

/**
 * Sorteia um item. `force` fixa raridade, slot e/ou tipo. `users` = classes da party:
 * as armas tendem a sair de um tipo que alguém da party usa.
 */
export function rollItem(rng: Rng, luck: number, id: string, force: { rarity?: Rarity; slot?: Slot; kind?: string } = {}, users: string[] = []): Item {
  const rarity = force.rarity ?? weighted(rng, rarityWeights(luck));
  const slot = force.slot ?? (force.kind ? KIND_SLOT[force.kind] : weighted(rng, SLOTS.map((sl) => [sl, SLOT_WEIGHT[sl]] as [Slot, number])));
  let kind = force.kind;
  if (!kind) {
    if (slot === 'weapon') {
      const pool = users.length && rng.next() < 0.75 ? WEAPON_USERS[users[rng.int(users.length)]] ?? [...WEAPON_KINDS] : [...WEAPON_KINDS];
      kind = pool[rng.int(pool.length)];
    } else {
      const list = SLOT_KINDS[slot];
      kind = list[rng.int(list.length)];
    }
  }
  const magic = slot === 'weapon' && isMagicWeapon(kind);
  // armas mágicas rolam atributos de conjurador (Inteligência/Destreza, recarga); físicas, de combate
  const attrPool: [AttrKey, number][] =
    slot !== 'weapon' ? ATTR_KEYS.map((k) => [k, 1] as [AttrKey, number])
    : magic ? [['int', 5], ['dex', 3], ['luk', 1], ['vit', 1]]
    : kind === 'bow' ? [['dex', 5], ['luk', 2], ['str', 2], ['vit', 1]]
    : kind === 'dagger' ? [['dex', 3], ['luk', 3], ['str', 3], ['vit', 1]]
    : [['str', 5], ['vit', 3], ['dex', 2]];
  const rollPool = ATTRIBUTE_ROLL_POOL.map((e) => {
    let w = e.weight;
    if (slot === 'weapon' && e.kind === 'oneAttr') w *= 2.2; // armas puxam mais para atributos
    if (magic && e.kind === 'manaRegen') w *= 1.8;
    if (magic && (e.kind === 'block' || e.kind === 'attackSpeed')) w *= 0.4;
    return [e, w] as [typeof e, number];
  });
  const rolls: ItemRoll[] = [];
  for (let i = 0; i < RARITY_INFO[rarity].rolls; i++) {
    // cada slot de atributo é independente (repetições são permitidas)
    const p = weighted(rng, rollPool);
    let value = p.min + rng.int(p.max - p.min + 1);
    if (rarity === 'common') value = Math.max(1, Math.round(value / 2)); // Comum: rolagem mais fraca
    const roll: ItemRoll = { kind: p.kind, value };
    if (p.kind === 'oneAttr') roll.attr = weighted(rng, attrPool);
    rolls.push(roll);
  }
  const item: Item = { id, slot, rarity, rolls, kind };
  if (slot === 'weapon') Object.assign(item, weaponPower(rarity, kind, 0.88 + rng.next() * 0.24));
  return item;
}

/** Linha do valor base do item (Ataque da arma). */
export function describeBase(it: Item): string | undefined {
  if (it.atk) return `Ataque ${it.atk}`;
  if (it.matk) return `Ataque mágico ${it.matk}`;
  return undefined;
}

/** Todas as linhas de descrição do item, na ordem da interface. */
export function itemLines(it: Item): string[] {
  return [describeBase(it), ...it.rolls.map((r) => describeRoll(r, it)), describeRefine(it)].filter(Boolean) as string[];
}

export function describeRoll(r: ItemRoll, it?: Item): string {
  const v = it ? rollValue(it, r) : r.value;
  switch (r.kind) {
    case 'hpRegen':
      return `Regeneração de vida +${v}/s`;
    case 'manaRegen':
      return `Regeneração de mana: recarga −${v}%`;
    case 'attackSpeed':
      return `Velocidade de ataque +${v}%`;
    case 'block':
      return `Chance de bloqueio +${v}%`;
    case 'dodge':
      return `Chance de esquiva +${v}%`;
    case 'oneAttr':
      return `+${v} ${ATTR_LABEL[r.attr!]}`;
    case 'allAttr':
      return `+${v} em TODOS os atributos`;
  }
}

/** Soma os bônus de todos os itens equipados (atributos + refino). */
export function gearBonus(items: (Item | undefined)[]): GearBonus {
  const g = emptyGear();
  for (const it of items) {
    if (!it) continue;
    g.atk += it.atk ?? 0;
    g.matk += it.matk ?? 0;
    for (const r of it.rolls) {
      const v = rollValue(it, r);
      if (r.kind === 'hpRegen') g.hpRegen += v;
      else if (r.kind === 'manaRegen') g.cooldownReduction += v / 100;
      else if (r.kind === 'attackSpeed') g.attackSpeed += v / 100;
      else if (r.kind === 'block') g.block += v / 100;
      else if (r.kind === 'dodge') g.dodge += v / 100;
      else if (r.kind === 'oneAttr' && r.attr) g.attrs[r.attr] += v;
      else if (r.kind === 'allAttr') for (const k of ATTR_KEYS) g.attrs[k] += v;
    }
    const rf = it.refine ?? 0;
    if (rf > 0) {
      if (it.slot === 'weapon') g.damageMult += rf * REFINE.weaponDamagePerLevel;
      else if (SLOT_GROUP[it.slot] === 'armor') g.hpMult += rf * REFINE.armorHpPerLevel;
      else {
        g.attrs.luk += rf * REFINE.accessoryLuckPerLevel;
        g.dodge += rf * REFINE.accessoryDodgePerLevel;
      }
    }
  }
  return g;
}

/** Maior refino entre os itens equipados (define a aura cosmética). */
export function maxRefine(items: (Item | undefined)[]): number {
  return items.reduce((m, it) => Math.max(m, it?.refine ?? 0), 0);
}

export function describeRefine(it: Item): string | undefined {
  const rf = it.refine ?? 0;
  if (!rf) return undefined;
  if (it.slot === 'weapon') return `Refino: dano +${Math.round(rf * REFINE.weaponDamagePerLevel * 100)}%`;
  if (SLOT_GROUP[it.slot] === 'armor') return `Refino: HP +${Math.round(rf * REFINE.armorHpPerLevel * 100)}%`;
  return `Refino: Sorte +${rf * REFINE.accessoryLuckPerLevel}, esquiva +${Math.round(rf * REFINE.accessoryDodgePerLevel * 100)}%`;
}
