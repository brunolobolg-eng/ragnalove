import { GAME_CONFIG } from '../../config/gameConfig';
import { HERO_INFO } from '../../config/heroes';
import { SKILL_BY_ID, heroSkills, lvOf, type HeroKind, type SkillDef, type SkillId, type SkillLevels } from './skills';

/**
 * SLOTS DE HABILIDADE (Mana). Mana não é MP: não gasta e não regenera — ela só define
 * quantas habilidades ativas o herói leva para a luta. Slots = Mana ÷ custo do slot da classe.
 * O ataque básico da classe é sempre usado e não ocupa slot. Habilidades passivas também não.
 */
export const slotCost = (kind: string): number => GAME_CONFIG.mana.slotCost[kind] ?? 10;

export const slotCount = (kind: string, mana: number): number => Math.min(GAME_CONFIG.mana.maxSlots, Math.floor(Math.max(0, mana) / slotCost(kind)));

/** Já tem o máximo de slots (5)? */
export const slotsMaxed = (kind: string, mana: number): boolean => slotCount(kind, mana) >= GAME_CONFIG.mana.maxSlots;

/** Mana que falta para o próximo slot (0 = já está no máximo). */
export const manaToNextSlot = (kind: string, mana: number): number => (slotsMaxed(kind, mana) ? 0 : (slotCount(kind, mana) + 1) * slotCost(kind) - mana);

/** Habilidades que ocupam slot: as ativas da classe, menos o ataque básico. */
export const slotSkills = (kind: HeroKind): SkillDef[] =>
  heroSkills(kind).filter((d) => d.kind === 'active' && d.id !== HERO_INFO[kind].basic);

export const usesSlot = (id: SkillId): boolean => {
  const d = SKILL_BY_ID[id];
  return d.kind === 'active' && HERO_INFO[d.hero].basic !== id;
};

/**
 * Habilidades equipadas, na ordem dos slots. `chosen` = escolha do jogador (undefined = automático:
 * primeiro as que o herói já começa sabendo, depois na ordem da árvore). Só as aprendidas contam
 * e o que passar do número de slots fica de fora.
 */
export function equippedSkills(kind: HeroKind, skills: SkillLevels, mana: number, chosen?: SkillId[]): SkillId[] {
  const learned = slotSkills(kind).filter((d) => lvOf(skills, d.id) > 0);
  const order = chosen
    ? chosen.filter((id) => learned.some((d) => d.id === id))
    : [...learned].sort((a, b) => b.start - a.start).map((d) => d.id);
  return [...new Set(order)].slice(0, slotCount(kind, mana));
}

/** Chaves de recarga que a simulação bloqueia (habilidades fora dos slots). */
export function lockedSkillKeys(kind: HeroKind, skills: SkillLevels, mana: number, chosen?: SkillId[]): string[] {
  const on = new Set(equippedSkills(kind, skills, mana, chosen));
  return slotSkills(kind)
    .filter((d) => !on.has(d.id))
    .flatMap((d) => (d.id === 'fireBarrier' ? ['fireBarrier', 'fireBarrier2', 'fireBarrier3'] : [d.id]));
}
