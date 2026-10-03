import { GAME_CONFIG } from '../config/gameConfig';
import { ZONES } from '../config/zones';
import { ACTS } from '../config/world';
import { ATTRIBUTES_CONFIG } from '../core/progression/attributes';
import { ATTRIBUTE_ROLL_POOL, LOOT_CONFIG, RARITY_WEIGHTS, REFINE, SLOT_WEIGHT, WEAPON_ATK } from '../core/progression/equipment';

/**
 * Objetos de configuração editáveis (todos são mutáveis e lidos pelo jogo na hora).
 * Um caminho é "raiz/chave/chave/..." — índices de lista são números.
 * Este módulo entra no build: é ele que aplica o balance.ts salvo pelo editor.
 */
export const ROOTS: Record<string, unknown> = {
  game: GAME_CONFIG,
  zones: ZONES,
  acts: ACTS,
  attributes: ATTRIBUTES_CONFIG,
  loot: LOOT_CONFIG,
  rarityWeights: RARITY_WEIGHTS,
  slotWeight: SLOT_WEIGHT,
  weaponAtk: WEAPON_ATK,
  refine: REFINE,
  rollPool: ATTRIBUTE_ROLL_POOL,
};

export const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));
export const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Cópia dos valores do código, tirada antes de qualquer override (base do "Resetar"). */
export const DEFAULTS: Record<string, unknown> = Object.fromEntries(Object.entries(ROOTS).map(([k, v]) => [k, clone(v)]));

const split = (path: string) => path.split('/');

function walk(root: unknown, keys: string[]): unknown {
  let o = root as Record<string, unknown> | undefined;
  for (const k of keys) {
    if (o === undefined || o === null || typeof o !== 'object') return undefined;
    o = o[k] as Record<string, unknown> | undefined;
  }
  return o;
}

/** Valor atual (vivo) no caminho. */
export function getPath(path: string): unknown {
  const [r, ...keys] = split(path);
  return walk(ROOTS[r], keys);
}

/** Valor original do código no caminho. */
export function getDefault(path: string): unknown {
  const [r, ...keys] = split(path);
  return walk(DEFAULTS[r], keys);
}

/** Escreve no objeto vivo. Devolve false se o caminho não existe (pai ausente). */
export function setPath(path: string, value: unknown): boolean {
  const [r, ...keys] = split(path);
  const last = keys.pop();
  const parent = walk(ROOTS[r], keys) as Record<string, unknown> | undefined;
  if (last === undefined || parent === undefined || parent === null || typeof parent !== 'object') return false;
  parent[last] = clone(value);
  return true;
}

/** Aplica um conjunto de overrides (o balance.ts salvo ou um arquivo carregado). Caminhos inválidos são ignorados. */
export function applyOverrides(o: Record<string, unknown>): string[] {
  const bad: string[] = [];
  for (const [path, v] of Object.entries(o)) if (!setPath(path, v)) bad.push(path);
  if (bad.length) console.warn('Balanceamento: caminhos ignorados (não existem mais no código):', bad);
  return bad;
}
