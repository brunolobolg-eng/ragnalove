import type { StructureKind } from '../../config/bastion';
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
}

export interface BastionHubVM {
  attempt: number;
  /** Ondas vencidas no total e na tentativa atual; melhor sequência de ondas numa tentativa. */
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
  /** A tentativa acabou (derrota ou núcleo caído): a próxima começa por "Nova tentativa". */
  attemptEnded: boolean;
  canNewAttempt: boolean;
  party: BastionHeroRow[];
  structures: BastionStructureRow[];
  projects: BastionProjectRow[];
  /** Mensagem da última ação (sucesso ou motivo da recusa). */
  message?: string;
}

export interface BastionPaletteRow {
  kind: StructureKind;
  name: string;
  desc: string;
  cost: number;
  hp: number;
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
  selected?: BastionStructureRow & { invested: number };
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
  /** A tentativa acabou com esta onda (a próxima começa por "Nova tentativa"). */
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
  onRepairStructure(id: number): void;
  onUpgradeStructure(id: number): void;
  /** Abre a coleção de cartas (os slots do modo contam as ondas vencidas no Bastião). */
  onCards(): void;
  onExit(): void;
}

/** Ganchos da barra de construção, durante o planejamento no mapa do Bastião. */
export interface BastionBuildHooks {
  /** Escolhe o tipo a colocar (undefined = nenhum: clique só seleciona). */
  onPick(kind: StructureKind | undefined): void;
  onRepair(id: number): void;
  onUpgrade(id: number): void;
  onRemove(id: number): void;
  onNight(): void;
  onBackToHub(): void;
}
