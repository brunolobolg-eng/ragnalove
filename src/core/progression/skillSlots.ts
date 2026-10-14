import { GAME_CONFIG } from '../../config/gameConfig';
import { HERO_INFO } from '../../config/heroes';
import { SKILL_BY_ID, heroSkills, lvOf, vocationTreeId, type HeroKind, type SkillDef, type SkillId, type SkillLevels } from './skills';
import { VOCATION_TREES } from '../../config/vocationSkills';

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

/** Ataque básico do herói: o da vocação (se ela tem árvore) ou o da classe. */
export const basicOf = (kind: HeroKind, vocation?: string): SkillId => {
  const tree = vocationTreeId(kind, vocation);
  return tree ? (VOCATION_TREES[tree].basic as SkillId) : HERO_INFO[kind].basic;
};

/** Habilidades que ocupam slot: as ativas da árvore em uso, menos o ataque básico. */
export const slotSkills = (kind: HeroKind, vocation?: string): SkillDef[] => {
  const basic = basicOf(kind, vocation);
  return heroSkills(kind, vocation).filter((d) => d.kind === 'active' && d.id !== basic);
};

export const usesSlot = (id: SkillId): boolean => {
  const d = SKILL_BY_ID[id];
  const basic = d.vocation ? VOCATION_TREES[d.vocation].basic : HERO_INFO[d.hero].basic;
  return d.kind === 'active' && basic !== id;
};

/**
 * Habilidades equipadas, na ordem dos slots. `chosen` = escolha do jogador. Automático (undefined) = na
 * ordem em que foram aprendidas: o perfil já começa com as habilidades iniciais, e as novas entram no fim.
 * Não é prioridade de magia: quem decide o disparo é a recarga, não o número do slot. Só as aprendidas
 * contam e o que passar do número de slots fica de fora.
 */
export function equippedSkills(kind: HeroKind, skills: SkillLevels, mana: number, chosen?: SkillId[], vocation?: string): SkillId[] {
  const learned = slotSkills(kind, vocation).filter((d) => lvOf(skills, d.id) > 0);
  const order = chosen
    ? chosen.filter((id) => learned.some((d) => d.id === id))
    : (Object.keys(skills) as SkillId[]).filter((id) => learned.some((d) => d.id === id));
  return [...new Set(order)].slice(0, slotCount(kind, mana));
}

/** Chaves de recarga que a simulação bloqueia (habilidades fora dos slots). */
export function lockedSkillKeys(kind: HeroKind, skills: SkillLevels, mana: number, chosen?: SkillId[], vocation?: string): string[] {
  const on = new Set(equippedSkills(kind, skills, mana, chosen, vocation));
  return slotSkills(kind, vocation)
    .filter((d) => !on.has(d.id))
    .flatMap((d) => (d.id === 'fireBarrier' ? ['fireBarrier', 'fireBarrier2', 'fireBarrier3'] : [d.id]));
}
