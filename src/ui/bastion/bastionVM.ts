import type { StructureKind } from '../../config/bastion';
import type { HordeTier } from '../../core/bastion/horde';
import type { HeroKind } from '../../core/progression/skills';

/**
 * Contrato entre o Último Bastião (núcleo + main) e as telas do modo. As telas só mostram estes dados e
 * chamam estes ganchos: não calculam custo, não decidem colocação nem recompensa (regras em core/bastion).
 */

export interface BastionStructureRow {
  id: number;
  kind: StructureKind;
  name: string;
  level: number;
  maxLevel: number;
  hp: number;
  maxHp: number;
  status: 'intact' | 'damaged' | 'destroyed';
  /** Zen para reparar (ou reconstruir, se destruída). 0 = inteira. */
  repairCost: number;
  /** Zen para subir um nível (undefined = nível máximo ou destruída). */
  upgradeCost?: number;
  /** Zen devolvido se a construção for removida agora. */
  refund: number;
}

/** Texto do botão de conserto: Reconstruir (destruída) ou Reparar (danificada). Mesmo nome em todas as telas. */
export const repairVerb = (status: BastionStructureRow['status']): string => (status === 'destroyed' ? 'Reconstruir' : 'Reparar');

export interface BastionProjectRow {
  id: string;
  name: string;
  desc: string;
  cost: number;
  owned: boolean;
  /** Motivo de estar travado (pré-requisito, ondas, herói na party). Ausente = pode desbloquear. */
  lockReason?: string;
}

export interface BastionHeroRow {
  kind: HeroKind;
  name: string;
  selected: boolean;
  /** Ainda não liberado (só se libera no templo): não entra na party. */
  locked: boolean;
}

/** Um herói no templo: custo em almas e Zen e se dá para liberar agora (o motivo, se não der). */
export interface BastionTempleHeroRow {
  kind: HeroKind;
  name: string;
  unlocked: boolean;
  souls: number;
  zeni: number;
  canUnlock: boolean;
  /** Por que não dá para liberar agora (pré-verificado pelo núcleo; ausente = pode). */
  why?: string;
}

/** Seção do templo no hub: o templo fica numa construção da cidade (4×4). */
export interface BastionTempleVM {
  /** Há um templo na cidade. */
  exists: boolean;
  /** O templo está de pé (vida acima de zero): só ele libera heróis. */
  standing: boolean;
  heroes: BastionTempleHeroRow[];
  /** Almas da cidade (o que se sacrifica). */
  souls: number;
}

/** Próxima horda (de hordeOf): o que a tela mostra. O tipo (tier) define a marca de mini-chefe e MVP. */
export interface BastionHordeRow {
  /** Número da noite que vem. */
  wave: number;
  /** Ex.: "Noite 5 · mini-chefe". */
  title: string;
  /** Chefe da noite, ou a lista da tropa comum. */
  detail: string;
  tier: HordeTier;
  /** Tropa comum da noite (o chefe entra por cima). */
  count: number;
}

export interface BastionHubVM {
  attempt: number;
  /** Ondas vencidas na tentativa atual (zera ao recomeçar); melhor sequência de ondas numa tentativa. */
  nights: number;
  nightsInAttempt: number;
  bestNights: number;
  zeni: number;
  coreHp: number;
  coreMaxHp: number;
  /** Zen para reparar o núcleo inteiro (0 = já está inteiro). */
  coreRepairCost: number;
  /** A tentativa está rodando e o núcleo de pé: dá para lutar a próxima onda. */
  canStartNight: boolean;
  /** A tentativa acabou (derrota ou núcleo caído): o botão "Recomeçar do zero" zera a cidade e volta à noite 1. */
  attemptEnded: boolean;
  canNewAttempt: boolean;
  party: BastionHeroRow[];
  /** Templo da cidade: libera heróis com almas + Zen. */
  templo: BastionTempleVM;
  structures: BastionStructureRow[];
  projects: BastionProjectRow[];
  /** A horda da próxima noite (hordeOf de nights + 1). */
  nextHorde: BastionHordeRow;
  /** Mensagem da última ação (sucesso ou motivo da recusa). */
  message?: string;
}

/** Por que a construção pode ou não ser movida (a tela escreve o texto; a regra é isMovable no core). */
export type BastionMoveWhy = 'recent' | 'old' | 'destroyed' | 'fixed';

export interface BastionPaletteRow {
  kind: StructureKind;
  name: string;
  desc: string;
  cost: number;
  hp: number;
  /** Lado do quadrado em tiles (1 para muralha e torre; 4 para as construções da cidade). */
  size: number;
  /** Só torres: dano e alcance do tiro no nível 1. */
  shot?: { damage: number; range: number };
  unlocked: boolean;
  lockReason?: string;
  selected: boolean;
}

export interface BastionBuildVM {
  attempt: number;
  nights: number;
  zeni: number;
  coreHp: number;
  coreMaxHp: number;
  canStartNight: boolean;
  palette: BastionPaletteRow[];
  /** Estrutura escolhida no campo (clique numa construção). */
  selected?: BastionStructureRow & {
    invested: number;
    /** Pode mover agora (isMovable no core). */
    movable: boolean;
    moveWhy: BastionMoveWhy;
    /** Modo de mover ativo para esta construção. */
    moving: boolean;
  };
  message?: string;
}

export interface BastionReportVM {
  victory: boolean;
  title: string;
  coreBefore: number;
  coreAfter: number;
  coreMaxHp: number;
  kills: number;
  invaded: number;
  structuresLost: number;
  structuresDamaged: number;
  zeniEarned: number;
  /** Pacotes de cartas entregues nesta onda. */
  packs: number;
  /** A tentativa acabou com esta onda (o botão "Recomeçar do zero" começa de novo). */
  attemptEnded: boolean;
}

/** Ganchos da tela principal do modo (Montar Defesa). */
export interface BastionHubHooks {
  onBuild(): void;
  onNight(): void;
  onRepairCore(): void;
  onNewAttempt(): void;
  onUnlock(id: string): void;
  onParty(party: HeroKind[]): void;
  /** Libera um herói no templo (sacrifica almas e Zen). */
  onUnlockHero(kind: HeroKind): void;
  onRepairStructure(id: number): void;
  onUpgradeStructure(id: number): void;
  /** Abre a coleção de cartas (os slots do modo contam as ondas vencidas no Bastião). */
  onCards(): void;
  /** Árvore Global com os nós e as Masteries do Bastião. */
  onTree(): void;
  onExit(): void;
}

/** Ganchos da barra de construção, durante o planejamento no mapa do Bastião. */
export interface BastionBuildHooks {
  /** Escolhe o tipo a colocar (undefined = nenhum: clique só seleciona). */
  onPick(kind: StructureKind | undefined): void;
  onRepair(id: number): void;
  onUpgrade(id: number): void;
  onRemove(id: number): void;
  /** Entra (ou sai, se já estiver) no modo de mover a muralha recente. */
  onMove(id: number): void;
  onNight(): void;
  onBackToHub(): void;
}
