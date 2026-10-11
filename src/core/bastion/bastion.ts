import { BASTION, PROJECTS, STRUCTURES, type StructureKind } from '../../config/bastion';
import { createProfile, migrateProfile, type Profile } from '../progression/profile';
import { applyCardLoadout, type CardCollection } from '../progression/cards';
import type { HeroKind } from '../progression/skills';

/**
 * Estado do Último Bastião (salvo à parte, na chave 'bastion'). A cidade persiste entre tentativas:
 * estruturas, dano, projetos desbloqueados, vida do núcleo, carteira (Zen) e heróis do modo ficam aqui.
 * Nada é compartilhado com a jornada da campanha, exceto as CARTAS: a coleção mora no save de meta e
 * entra aqui só como cópia dos bônus, tirada no início de cada tentativa (igual à jornada).
 * Regras de colocação, custo e reparo ficam em rules.ts; este arquivo só guarda, cria e migra.
 */

export interface Structure {
  id: number;
  kind: StructureKind;
  x: number;
  y: number;
  level: number;
  /** Vida atual. 0 = destruída: continua assim (não bloqueia nem atira) até ser reconstruída. */
  hp: number;
  /** Zen gasto nela (construção + aprimoramentos). Base do reparo, da reconstrução e do reembolso. */
  invested: number;
}

export type StructureStatus = 'intact' | 'damaged' | 'destroyed';

export interface BastionState {
  version: 1;
  /** Semente da cidade: cada onda deriva a sua (determinismo). */
  seed: number;
  /** Número da tentativa atual (começa em 1; sobe a cada nova preparação depois de uma derrota). */
  attempt: number;
  /** Ondas vencidas no total (numera a horda e libera projetos por tempo). */
  nights: number;
  /** Ondas vencidas na tentativa atual. Zera ao começar outra tentativa. */
  nightsInAttempt: number;
  /** A tentativa acabou (derrota): só volta a rodar depois de `startAttempt`. */
  attemptEnded?: boolean;
  coreHp: number;
  coreMaxHp: number;
  /**
   * Carteira e progressão dos heróis do modo (Zen, EXP, equipamentos, almas): tudo próprio do Bastião.
   * Os bônus de carta (`heroes[k].cardAttrs`) são uma cópia da coleção compartilhada, tirada no início da tentativa.
   */
  profile: Profile;
  /** Heróis que defendem a cidade. */
  party: HeroKind[];
  structures: Structure[];
  /** Projetos desbloqueados (permanentes). */
  projects: string[];
  nextId: number;
  /** Chave da última onda aplicada: aplicar a mesma de novo não paga nem desconta nada duas vezes. */
  paidKey?: string;
  /** Tentativa em que o socorro foi concedido (ver BASTION.rescue). */
  rescuedAttempt?: number;
  records: { bestNights: number; attempts: number };
}

/**
 * Cidade nova: só o castelo básico desbloqueado, núcleo cheio e a party inicial. `cards` é a coleção
 * compartilhada com a campanha (save de meta): só os bônus dela são copiados para os heróis do modo.
 */
export function newBastion(seed: number, cards: CardCollection, party: HeroKind[] = ['warrior', 'mage']): BastionState {
  const b: BastionState = {
    version: 1,
    seed: seed >>> 0,
    attempt: 1,
    nights: 0,
    nightsInAttempt: 0,
    coreHp: BASTION.coreMaxHp,
    coreMaxHp: BASTION.coreMaxHp,
    profile: createProfile(),
    party: [...party],
    structures: [],
    projects: ['castle'],
    nextId: 1,
    records: { bestNights: 0, attempts: 1 },
  };
  applyCardLoadout(b.profile, cards);
  return b;
}

/** Completa campos que faltam (save antigo ou editado à mão) sem perder nada. Pode rodar mais de uma vez. */
export function migrateBastion(b: BastionState): BastionState {
  b.profile = migrateProfile(b.profile);
  b.party ??= ['warrior', 'mage'];
  b.structures ??= [];
  b.projects ??= ['castle'];
  if (!b.projects.includes('castle')) b.projects.unshift('castle');
  b.attempt = Number.isFinite(b.attempt) && b.attempt >= 1 ? b.attempt : 1;
  b.nights = Number.isFinite(b.nights) && b.nights >= 0 ? b.nights : 0;
  b.nightsInAttempt = Number.isFinite(b.nightsInAttempt) && b.nightsInAttempt >= 0 ? b.nightsInAttempt : 0;
  b.coreMaxHp = Number.isFinite(b.coreMaxHp) && b.coreMaxHp > 0 ? b.coreMaxHp : BASTION.coreMaxHp;
  b.coreHp = Number.isFinite(b.coreHp) ? Math.min(b.coreMaxHp, Math.max(0, b.coreHp)) : b.coreMaxHp;
  b.seed = (b.seed ?? 1) >>> 0;
  b.nextId = Math.max(b.nextId ?? 1, ...b.structures.map((s) => s.id + 1));
  b.records ??= { bestNights: 0, attempts: b.attempt };
  b.records.bestNights ??= 0;
  b.records.attempts ??= b.attempt;
  return b;
}

/** Vida máxima de uma estrutura: nível + bônus permanentes dos projetos desbloqueados. */
export function structureMaxHp(b: BastionState, s: Pick<Structure, 'kind' | 'level'>): number {
  const def = STRUCTURES[s.kind];
  let hp = def.hp + def.hpPerLevel * (s.level - 1);
  for (const id of b.projects) {
    const bonus = PROJECTS[id]?.bonus;
    if (bonus && bonus.kind === s.kind) hp *= bonus.hpMult;
  }
  return Math.round(hp);
}

export function structureStatus(b: BastionState, s: Structure): StructureStatus {
  if (s.hp <= 0) return 'destroyed';
  return s.hp >= structureMaxHp(b, s) ? 'intact' : 'damaged';
}

export const findStructure = (b: BastionState, id: number): Structure | undefined => b.structures.find((s) => s.id === id);
