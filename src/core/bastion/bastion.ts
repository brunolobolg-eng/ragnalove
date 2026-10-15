import { BASTION, PROJECTS, STRUCTURES, type StructureKind } from '../../config/bastion';
import { createProfile, migrateProfile, type Profile } from '../progression/profile';
import { economiaDoPerfil } from '../progression/arvore';
import { applyCardLoadout, type CardCollection } from '../progression/cards';
import type { HeroKind } from '../progression/skills';

/**
 * Estado do Último Bastião (salvo à parte, na chave 'bastion'). A cidade dura uma tentativa: estruturas, dano,
 * projetos desbloqueados, vida do núcleo, carteira (Zen) e heróis do modo ficam aqui. A derrota zera tudo isso
 * ao recomeçar do zero (startAttempt); recordes, tentativas, total de vitórias, semente e cartas ficam.
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
  /** Turno (BastionState.turn) em que foi construída. Mover não muda. -1 = construção de antes do turno existir (save antigo). */
  placedTurn: number;
}

export type StructureStatus = 'intact' | 'damaged' | 'destroyed';

export interface BastionState {
  version: 1;
  /** Semente da cidade: cada onda deriva a sua (determinismo). */
  seed: number;
  /** Número da tentativa atual (começa em 1; sobe a cada nova preparação depois de uma derrota). */
  attempt: number;
  /** Ondas vencidas nesta tentativa (numera a horda e libera projetos por tempo). Zera ao recomeçar do zero. */
  nights: number;
  /** Ondas vencidas na tentativa atual. Zera ao recomeçar do zero (hoje é igual a `nights`). */
  nightsInAttempt: number;
  /**
   * Turno de planejamento: sobe 1 a cada noite vencida (ver applyNight); a derrota não avança. Só as muralhas
   * construídas no turno atual podem ser movidas: depois da noite vencida, elas ficam no lugar.
   */
  turn: number;
  /** A tentativa acabou (derrota): só volta a rodar depois de `startAttempt`. */
  attemptEnded?: boolean;
  coreHp: number;
  coreMaxHp: number;
  /**
   * Carteira e progressão dos heróis do modo (Zen, EXP, equipamentos, almas): tudo próprio do Bastião.
   * As regras de carta (`heroes[k].cards`) são uma cópia da coleção compartilhada, tirada no início da tentativa.
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
  /**
   * Contagens que sobrevivem à derrota: melhor sequência, número de tentativas e `totalNights` (vitórias de todas
   * as tentativas). O total numera os pacotes de carta e libera os slots; nunca zera.
   */
  records: { bestNights: number; attempts: number; totalNights: number };
  /** Pacotes de cartas já entregues: um a cada BASTION.packEvery vitórias (records.totalNights). */
  packsGiven: number;
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
    turn: 0,
    coreHp: BASTION.coreMaxHp,
    coreMaxHp: BASTION.coreMaxHp,
    profile: createProfile(),
    party: [...party],
    structures: [],
    projects: ['castle'],
    nextId: 1,
    records: { bestNights: 0, attempts: 1, totalNights: 0 },
    packsGiven: 0,
  };
  b.profile.zeni = BASTION.startZeni;
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
  b.records ??= { bestNights: 0, attempts: b.attempt, totalNights: b.nights };
  b.records.bestNights ??= 0;
  b.records.attempts ??= b.attempt;
  // Save antigo não tem o total de vitórias: começa nas ondas vencidas (a tentativa única de antes). Inteiro não negativo.
  b.records.totalNights = Number.isInteger(b.records.totalNights) && b.records.totalNights >= 0 ? b.records.totalNights : b.nights;
  b.packsGiven = Number.isFinite(b.packsGiven) && b.packsGiven >= 0 ? b.packsGiven : 0;
  // Save sem turno (antes do movimento de muralhas): começa no turno 0. Turno é inteiro não negativo.
  b.turn = Number.isInteger(b.turn) && b.turn >= 0 ? b.turn : 0;
  // Construção sem turno é "antiga": placedTurn -1, que nunca bate com o turno, então não se move.
  // Qualquer valor que não seja um turno inteiro (≥ 0) nem o -1 vira -1.
  for (const s of b.structures) s.placedTurn = Number.isInteger(s.placedTurn) && s.placedTurn >= -1 ? s.placedTurn : -1;
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
  // muralhas: bônus de vida da Árvore Global do Bastião
  if (s.kind === 'wall') hp *= 1 + economiaDoPerfil(b.profile).muralhaVida;
  return Math.round(hp);
}

export function structureStatus(b: BastionState, s: Structure): StructureStatus {
  if (s.hp <= 0) return 'destroyed';
  return s.hp >= structureMaxHp(b, s) ? 'intact' : 'damaged';
}

export const findStructure = (b: BastionState, id: number): Structure | undefined => b.structures.find((s) => s.id === id);
