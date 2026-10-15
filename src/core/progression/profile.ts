import { GAME_CONFIG } from '../../config/gameConfig';
import { ATTRIBUTES_CONFIG, ATTR_KEYS, computeStats, type AttrKey, type Attrs, type HeroStats } from './attributes';
import { KIND_SLOT, SLOTS, canUse, gearBonus, itemKind, weaponPower, type Item, type Slot } from './equipment';
import { inHeroTree, lvOf, startingSkills, startingVocationSkills, vocationPassive, type HeroKind, type SkillId, type SkillLevels } from './skills';
import { equippedSkills, lockedSkillKeys, manaToNextSlot, slotCount, usesSlot } from './skillSlots';
import { HERO_NAME, HERO_ORDER, familyOf, isHeroKind } from '../../config/heroes';
import { VOCATIONS, VOCATIONS_CONFIG, type VocationDef } from '../../config/vocations';
import type { VocationPassiveBonus } from '../../config/vocationSkills';
import type { CardRuntime } from './cards';
import { arvoreVazia, bonusDoHeroi, normalizarArvore, type ArvoreState } from './arvore';

/**
 * Progressão persistente entre ondas (o "save" do jogador). A simulação recebe um
 * snapshot dos status derivados e devolve o resultado da onda (EXP, níveis, almas,
 * drops), que é aplicado aqui.
 */
export interface HeroProgress {
  level: number;
  exp: number;
  attrs: Attrs;
  points: number; // pontos de atributo livres
  /** Pontos de atributo já comprados com Zen (o preço sobe a cada compra). */
  zeniPoints?: number;
  /** Níveis na árvore de habilidades. */
  skills: SkillLevels;
  /** Pontos de habilidade livres (1 por nível). */
  skillPoints: number;
  equipment: Partial<Record<Slot, Item>>;
  /** Vida máxima e Mana extras compradas com poções (opcionais: saves antigos não têm). */
  bonusHp?: number;
  bonusMana?: number;
  /** Habilidades nos slots, em ordem (undefined = escolha automática). Ver skillSlots.ts. */
  equippedSkills?: SkillId[];
  /** Bônus de atributos das cartas equipadas (coleção permanente; aplicado a cada nova run). */
  /** Regras das cartas equipadas neste herói (derivadas da coleção no início da run; ver cards.ts). */
  cards?: CardRuntime[];
  /** Vocação escolhida nesta jornada (id em config/vocations.ts). Ausente = ainda é a classe base. */
  vocation?: string;
}

/**
 * Versão do Profile (formato salvo). 1 = antes da árvore global; 2 = com `arvore`.
 * Saves v1 são migrados ao carregar (migrateProfile): nada do jogador se perde.
 */
export const PROFILE_VERSION = 2;

export interface Profile {
  version: 1 | 2;
  souls: number; // almas no banco (moeda de crescimento: EXP, despertar)
  /** Zen: moeda de gasto (atributos, respec, lojas, refino). */
  zeni: number;
  /** Quantas vezes os atributos foram redistribuídos (o custo sobe a cada uso). */
  respecs?: number;
  heroes: Record<string, HeroProgress>;
  inventory: Item[];
  /** Ondas vencidas (só informativo). */
  wavesWon?: number;
  /** Árvore global de progressão e Masteries táticas desta jornada (ver core/progression/arvore.ts). */
  arvore?: ArvoreState;
}

export const PROGRESSION = GAME_CONFIG.progression;

export function expToNext(level: number): number {
  const c = PROGRESSION.expCurve;
  return Math.round(c.base * Math.pow(level, c.growth));
}

export function createProfile(): Profile {
  const hero = (k: string): HeroProgress => ({
    level: 1,
    exp: 0,
    attrs: { ...ATTRIBUTES_CONFIG.base[k] },
    points: 0,
    skills: startingSkills(k as HeroKind),
    skillPoints: 0,
    equipment: { weapon: starterWeapon(k) },
    cards: [],
  });
  return { version: PROFILE_VERSION, souls: 0, zeni: 0, heroes: Object.fromEntries(HERO_ORDER.map((k) => [k, hero(k)])), inventory: [], arvore: arvoreVazia() };
}

/** Arma inicial de cada classe (Comum, sem atributos extras). */
export function starterWeapon(k: string): Item {
  const kind = k === 'assassin' ? 'dagger' : familyOf(k) === 'mage' ? 'staff' : k === 'archer' ? 'bow' : 'sword';
  return { id: `starter-${k}`, slot: 'weapon', rarity: 'common', rolls: [], kind, ...weaponPower('common', kind) };
}

/** "Poder" do herói para comparar equipamentos: dano por segundo das habilidades + sobrevivência. */
export function heroPower(kind: string, st: HeroStats): number {
  const per = (dmg: number, cd: number) => (dmg * 10) / Math.max(1, cd);
  const fam = familyOf(kind);
  if (kind === 'sorcerer' || kind === 'warlock' || kind === 'assassin') {
    // classes avançadas: o dano vem do multiplicador da classe (atributo principal + arma)
    const off = st.classPower * 30 * (1 + st.crit) / Math.max(0.3, st.cooldownMult);
    const def = st.maxHp * (1 + st.dodge + st.block) / Math.max(0.4, st.damageTakenMult) + st.hpRegenPerSec * 20;
    return off * 1.3 + def * (fam === 'archer' ? 0.09 : 0.06);
  }
  const off =
    kind === 'mage'
      ? per(st.boltDamage, st.boltCooldownTicks) + per(st.burnDamage * st.barrierLength * 2, st.barrierCooldownTicks) * 0.6
      : kind === 'archer'
        ? per(st.arrowDamage * (1 + st.crit), st.arrowCooldownTicks) + per(st.rainDamage * 4, st.rainCooldownTicks) * 0.7
        : per(st.cleaveDamage * 2.5, st.cleaveCooldownTicks) + per(st.bashDamage, st.bashCooldownTicks);
  const def = st.maxHp * (1 + st.dodge + st.block) / Math.max(0.4, st.damageTakenMult) + st.hpRegenPerSec * 20;
  return off * (kind === 'warrior' ? 1 : 1.3) + def * (kind === 'warrior' ? 0.12 : 0.06);
}

/**
 * Equipa automaticamente os itens NOVOS (candidatos) que deixam algum herói da party mais forte.
 * Devolve o que foi trocado, para a interface avisar.
 */
export function autoEquip(p: Profile, party: string[], candidates: Item[]): { hero: string; item: Item }[] {
  const done: { hero: string; item: Item }[] = [];
  for (const cand of candidates) {
    if (!p.inventory.includes(cand)) continue;
    let best: { hero: string; gain: number } | undefined;
    for (const hero of party) {
      if (!canUse(hero, cand)) continue;
      const h = p.heroes[hero];
      const cur = h.equipment[cand.slot];
      const before = heroPower(hero, heroStats(p, hero));
      h.equipment[cand.slot] = cand;
      const after = heroPower(hero, heroStats(p, hero));
      if (cur) h.equipment[cand.slot] = cur;
      else delete h.equipment[cand.slot];
      const gain = after / Math.max(1e-6, before) - 1;
      if (gain > 0.005 && (!best || gain > best.gain)) best = { hero, gain };
    }
    if (best) {
      equip(p, best.hero, cand.id);
      done.push({ hero: best.hero, item: cand });
    }
  }
  return done;
}

/** Vocação escolhida pelo herói, se ela existe nesta classe (id desconhecido não quebra o save). */
export function vocationOf(kind: string, h: HeroProgress | undefined): VocationDef | undefined {
  if (!h?.vocation || !isHeroKind(kind)) return undefined;
  return VOCATIONS[kind].find((v) => v?.id === h.vocation) ?? undefined;
}

export function heroStats(profile: Profile, kind: string): HeroStats {
  const h = profile.heroes[kind];
  const attrs = { ...h.attrs };
  // a vocação soma atributos como o equipamento: entra antes do cálculo (dano e vida acompanham)
  const vocation = vocationOf(kind, h)?.bonus ?? {};
  // passivas de atributo das habilidades da vocação (Crusado, Hypnomancer): somam como o equipamento
  const passive = vocationPassive(h.vocation, h.skills);
  // nós abertos da árvore global que servem a este herói (soma com a vocação, não substitui)
  const nos = isHeroKind(kind) ? bonusDoHeroi(profile, kind) : { attrs: {}, passiva: {} };
  return computeStats(kind, attrs, gearBonus(SLOTS.map((s) => h.equipment[s])), h.skills, {
    hp: h.bonusHp,
    mana: h.bonusMana,
    attrs: somaAtributos(vocation, nos.attrs),
    passive: somaPassiva(passive, nos.passiva),
  });
}

/** Soma dois conjuntos de atributos bônus (chave a chave). */
function somaAtributos(a: Partial<Record<AttrKey, number>>, b: Partial<Record<AttrKey, number>>): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = { ...a };
  for (const k of ATTR_KEYS) if (b[k] !== undefined) out[k] = (out[k] ?? 0) + b[k]!;
  return out;
}

/** Soma duas passivas derivadas (vocação + árvore global), chave a chave. */
function somaPassiva(a: Partial<VocationPassiveBonus>, b: Partial<VocationPassiveBonus>): Partial<VocationPassiveBonus> {
  const out: Partial<VocationPassiveBonus> = { ...a };
  for (const k of Object.keys(b) as (keyof VocationPassiveBonus)[]) out[k] = (out[k] ?? 0) + (b[k] ?? 0);
  return out;
}

/** Habilidades ativas nos slots do herói (limitadas pela Mana). */
export function heroEquipped(profile: Profile, kind: string): SkillId[] {
  const h = profile.heroes[kind];
  return equippedSkills(kind as HeroKind, h.skills, heroStats(profile, kind).mana, h.equippedSkills, h.vocation);
}

/** Chaves de recarga bloqueadas na luta (habilidades fora dos slots). */
export function heroLockedKeys(profile: Profile, kind: string): string[] {
  const h = profile.heroes[kind];
  return lockedSkillKeys(kind as HeroKind, h.skills, heroStats(profile, kind).mana, h.equippedSkills, h.vocation);
}

/**
 * Equipa/remove uma habilidade dos slots. Devolve o erro em texto (ou undefined se deu certo).
 * A primeira troca do jogador congela a escolha automática atual como ponto de partida.
 */
export function toggleSkillSlot(profile: Profile, kind: string, id: SkillId): string | undefined {
  const h = profile.heroes[kind];
  if (!usesSlot(id)) return 'Esta habilidade não usa slot.';
  if (!inHeroTree(kind as HeroKind, h.vocation, id)) return 'Esta habilidade não é da árvore do herói.';
  const cur = heroEquipped(profile, kind);
  if (cur.includes(id)) {
    h.equippedSkills = cur.filter((x) => x !== id);
    return undefined;
  }
  if (lvOf(h.skills, id) <= 0) return 'Aprenda a habilidade primeiro.';
  const st = heroStats(profile, kind);
  if (cur.length >= slotCount(kind, st.mana)) {
    const need = manaToNextSlot(kind, st.mana);
    return need ? `Sem slot livre: precisa de +${need} de Mana (Inteligência) ou tire outra habilidade.` : 'Os 5 slots estão cheios: tire outra habilidade.';
  }
  h.equippedSkills = [...cur, id];
  return undefined;
}

/** Pontos já distribuídos acima da base (podem ser redistribuídos livremente). */
export function spentPoints(h: HeroProgress, kind: string): number {
  const base = ATTRIBUTES_CONFIG.base[kind];
  return ATTR_KEYS.reduce((s, k) => s + (h.attrs[k] - base[k]), 0);
}

export function addPoint(p: Profile, kind: string, k: AttrKey): boolean {
  const h = p.heroes[kind];
  if (h.points <= 0) return false;
  h.attrs[k]++;
  h.points--;
  return true;
}

export function removePoint(p: Profile, kind: string, k: AttrKey): boolean {
  const h = p.heroes[kind];
  if (h.attrs[k] <= ATTRIBUTES_CONFIG.base[kind][k]) return false;
  h.attrs[k]--;
  h.points++;
  return true;
}

export const ZENI = GAME_CONFIG.zeni;

/** Preço do próximo ponto de atributo comprado com Zen para esse herói. */
export function attrPointCost(p: Profile, kind: string): number {
  return ZENI.attrPointBase + ZENI.attrPointStep * (p.heroes[kind].zeniPoints ?? 0);
}

/** Zen compra pontos de atributo extras (preço crescente por herói). */
export function buyPointWithZeni(p: Profile, kind: string): boolean {
  const cost = attrPointCost(p, kind);
  if (p.zeni < cost) return false;
  p.zeni -= cost;
  const h = p.heroes[kind];
  h.points++;
  h.zeniPoints = (h.zeniPoints ?? 0) + 1;
  return true;
}

/** Preço de redistribuir os atributos (sobe a cada uso). */
export function respecCost(p: Profile): number {
  return ZENI.respecBase * (1 + (p.respecs ?? 0));
}

/** Redistribuir: devolve todos os pontos gastos desse herói, pagando Zen. */
export function respecWithZeni(p: Profile, kind: string): boolean {
  const cost = respecCost(p);
  if (p.zeni < cost || spentPoints(p.heroes[kind], kind) <= 0) return false;
  p.zeni -= cost;
  p.respecs = (p.respecs ?? 0) + 1;
  resetAttributes(p, kind);
  return true;
}

/** Absorver almas: converte almas do banco em EXP para um herói (escala pequena). Devolve níveis ganhos. */
export function absorbSouls(p: Profile, kind: string): number | undefined {
  const a = PROGRESSION.soulAbsorb;
  if (p.souls < a.souls) return undefined;
  p.souls -= a.souls;
  return addExperience(p, kind, a.exp);
}

export function equip(p: Profile, kind: string, itemId: string): void {
  const i = p.inventory.findIndex((it) => it.id === itemId);
  if (i < 0) return;
  const item = p.inventory[i];
  if (!canUse(kind, item)) return;
  const h = p.heroes[kind];
  const old = h.equipment[item.slot];
  h.equipment[item.slot] = item;
  p.inventory.splice(i, 1);
  if (old) p.inventory.push(old);
}

export function unequip(p: Profile, kind: string, slot: Slot): void {
  const h = p.heroes[kind];
  const it = h.equipment[slot];
  if (!it) return;
  delete h.equipment[slot];
  p.inventory.push(it);
}

/** Motivo para o herói não poder escolher essa vocação agora (ausente = pode). */
export function evolveBlocker(p: Profile, kind: string, id: string): string | undefined {
  const h = p.heroes[kind];
  if (!h || !isHeroKind(kind)) return 'Herói desconhecido.';
  if (h.vocation) return 'Este herói já escolheu uma vocação nesta jornada.';
  if (h.level < VOCATIONS_CONFIG.level) return `Chega ao nível ${VOCATIONS_CONFIG.level} para evoluir.`;
  if (!VOCATIONS[kind].some((v) => v?.id === id)) return 'Esta vocação não é da classe ou ainda não foi desenhada.';
  return undefined;
}

/** Escolhe a vocação (uma vez por jornada). Devolve o motivo do erro, ou undefined se deu certo. */
export function evolve(p: Profile, kind: string, id: string): string | undefined {
  const err = evolveBlocker(p, kind, id);
  if (err) return err;
  const h = p.heroes[kind];
  h.vocation = id;
  // o básico da árvore da vocação entra aprendido (aditivo: nada que já estava aprendido sai)
  for (const [sid, lv] of Object.entries(startingVocationSkills(id))) h.skills[sid as SkillId] ??= lv;
  return undefined;
}

/** Nome do herói na interface: a vocação escolhida, ou a classe base. */
export function heroDisplayName(p: Profile, kind: string): string {
  return vocationOf(kind, p.heroes[kind])?.nome ?? HERO_NAME[kind as keyof typeof HERO_NAME] ?? kind;
}

export interface WaveResult {
  souls: number;
  zeni: number;
  heroes: Record<string, { level: number; exp: number }>;
  drops: Item[];
}

/** Leva o herói a um nível/EXP; níveis ganhos viram pontos de atributo. */
function setProgress(h: HeroProgress, level: number, exp: number): void {
  const gained = level - h.level;
  if (gained > 0) {
    h.points += gained * PROGRESSION.pointsPerLevel;
    h.skillPoints = (h.skillPoints ?? 0) + gained * PROGRESSION.skillPointsPerLevel;
  }
  h.level = level;
  h.exp = exp;
}

/** Aplica o resultado de uma onda: níveis viram pontos de atributo, drops vão ao inventário. */
export function applyWaveResult(p: Profile, r: WaveResult): void {
  addSouls(p, r.souls);
  addZeni(p, r.zeni);
  for (const [k, res] of Object.entries(r.heroes)) {
    const h = p.heroes[k];
    if (h) setProgress(h, res.level, res.exp);
  }
  p.inventory.push(...r.drops);
}

/** Soma EXP a um herói, subindo de nível pela mesma curva da onda. Devolve níveis ganhos. */
export function addExperience(p: Profile, kind: string, amount: number): number {
  const h = p.heroes[kind];
  let level = h.level;
  let exp = h.exp + Math.max(0, amount);
  while (exp >= expToNext(level)) {
    exp -= expToNext(level);
    level++;
  }
  const gained = level - h.level;
  setProgress(h, level, exp);
  return gained;
}

/** Define o nível. Subir dá os pontos normais; descer devolve a distribuição e tira os pontos excedentes. */
export function setLevel(p: Profile, kind: string, level: number): void {
  const h = p.heroes[kind];
  level = Math.max(1, Math.floor(level));
  if (level >= h.level) return setProgress(h, level, 0);
  resetAttributes(p, kind);
  h.points = Math.max(0, h.points - (h.level - level) * PROGRESSION.pointsPerLevel);
  h.skillPoints = Math.max(0, (h.skillPoints ?? 0) - (h.level - level) * PROGRESSION.skillPointsPerLevel);
  h.level = level;
  h.exp = 0;
}

/** Nível 1, sem EXP, sem pontos. */
export function resetLevel(p: Profile, kind: string): void {
  resetAttributes(p, kind);
  const h = p.heroes[kind];
  h.level = 1;
  h.exp = 0;
  h.points = 0;
}

/** Devolve todos os pontos distribuídos (atributos voltam à base da classe). */
export function resetAttributes(p: Profile, kind: string): void {
  const h = p.heroes[kind];
  h.points += spentPoints(h, kind);
  h.attrs = { ...ATTRIBUTES_CONFIG.base[kind] };
}

export function addAttributePoints(p: Profile, kind: string, n: number): void {
  p.heroes[kind].points = Math.max(0, p.heroes[kind].points + Math.floor(n));
}

/** Define um atributo diretamente (nunca abaixo da base da classe; não mexe em pontos livres). */
export function setAttribute(p: Profile, kind: string, k: AttrKey, value: number): void {
  p.heroes[kind].attrs[k] = Math.max(ATTRIBUTES_CONFIG.base[kind][k], Math.floor(value));
}

export function addSouls(p: Profile, n: number): void {
  p.souls = Math.max(0, p.souls + Math.floor(n));
}

export function addZeni(p: Profile, n: number): void {
  p.zeni = Math.max(0, (p.zeni ?? 0) + Math.floor(n));
}

export function clearSouls(p: Profile): void {
  p.souls = 0;
}

export function addItem(p: Profile, item: Item): void {
  p.inventory.push(item);
}

export function clearInventory(p: Profile): void {
  p.inventory.length = 0;
}

/** Saves antigos: preenche campos novos (habilidades, Zen). */
export function migrateProfile(p: Profile): Profile {
  // v1 -> v2: a árvore global entra. Save antigo não tem o campo: abre com a árvore vazia (nenhum efeito novo).
  // Save v2 é só conferido (nós e Masteries inconsistentes saem; o resto fica como está).
  p.arvore = normalizarArvore(p.arvore);
  p.version = PROFILE_VERSION;
  p.zeni ??= 0;
  p.souls ??= 0;
  p.inventory ??= [];
  const fresh = createProfile();
  if (!p.heroes || typeof p.heroes !== 'object') p.heroes = fresh.heroes;
  for (const k of HERO_ORDER) if (!p.heroes[k]) p.heroes[k] = fresh.heroes[k];
  // itens antigos: ganham tipo, o slot novo (capacete, capa, botas...) e o Ataque da arma
  const fixWeapon = (it: Item) => {
    it.kind ??= itemKind(it);
    const slot = KIND_SLOT[it.kind];
    if (slot) it.slot = slot;
    if (it.slot === 'weapon' && it.atk === undefined && it.matk === undefined) Object.assign(it, weaponPower(it.rarity, it.kind));
  };
  p.inventory.forEach(fixWeapon);
  for (const [k, h] of Object.entries(p.heroes)) {
    h.level ??= 1;
    h.exp ??= 0;
    h.points ??= 0;
    h.attrs ??= { ...fresh.heroes[k as HeroKind].attrs };
    h.equipment ??= {};
    // cartas: o formato antigo (bônus de atributo) sai; as regras são derivadas da coleção no início da run
    delete (h as { cardAttrs?: unknown }).cardAttrs;
    h.cards ??= [];
    h.skills ??= startingSkills(k as HeroKind);
    // habilidades iniciais novas (ex.: Muralha, Armadilha) entram aprendidas no nível 1
    for (const [id, lv] of Object.entries(startingSkills(k as HeroKind))) h.skills[id as keyof SkillLevels] ??= lv;
    h.skillPoints ??= (h.level - 1) * PROGRESSION.skillPointsPerLevel;
    // vocação que não existe nesta classe (save antigo ou editado) sai: o herói volta à classe base
    if (h.vocation && !vocationOf(k, h)) delete h.vocation;
    // árvore da vocação: habilidades iniciais dela (básico) entram se faltarem (aditivo)
    if (h.vocation) for (const [id, lv] of Object.entries(startingVocationSkills(h.vocation))) h.skills[id as SkillId] ??= lv;
    const eq = h.equipment as Record<string, Item | undefined>;
    const worn = Object.entries(eq).filter(([, it]) => it) as [string, Item][];
    for (const [key] of worn) delete eq[key];
    for (const [, it] of worn) {
      fixWeapon(it);
      if (eq[it.slot]) p.inventory.push(it);
      else eq[it.slot] = it;
    }
    // arma que a classe não usa volta para o inventário; sem arma, recebe a inicial
    const w = h.equipment.weapon;
    if (w && !canUse(k, w)) {
      delete h.equipment.weapon;
      p.inventory.push(w);
    }
    if (!h.equipment.weapon) {
      const alt = p.inventory.filter((it) => it.slot === 'weapon' && canUse(k, it)).sort((a, b) => (b.atk ?? b.matk ?? 0) - (a.atk ?? a.matk ?? 0))[0];
      if (alt) equip(p, k, alt.id);
      else h.equipment.weapon = starterWeapon(k);
    }
  }
  return p;
}
