import { GAME_CONFIG } from './gameConfig';
import type { HeroKind } from '../core/progression/skills';

/**
 * O Último Bastião: dados do modo de defesa persistente (número é dado — CLAUDE.md, regra 2).
 *
 * Ancoragem (investigada no Vanguarda, não inventada):
 *  - Núcleo: vida máxima e Zen por HP do reparo vêm de GAME_CONFIG.cityDefense (a mesma cidade da jornada).
 *  - Ameaça de cada inimigo que chega ao portão: GAME_CONFIG.cityDefense.threat (sem tabela própria).
 *  - Recompensas: Zen dos abates (GAME_CONFIG.zeni.dropPerKill) e bônus de onda limpa (waveClearBonus).
 *  - Custos de estruturas: muralha 5 Zen (dobra a cada muralha da cidade, teto de 999); torre 120 Zen (inicial).
 * Os números de estrutura, projeto e socorro são INICIAIS: calibrar com o dono antes de fechar o balanceamento.
 */

/** Tipos de estrutura. Muralha bloqueia (a horda quebra); torre bloqueia e atira sozinha. */
export type StructureKind = 'wall' | 'tower';

export interface StructureDef {
  name: string;
  desc: string;
  /** Projeto que libera a construção (ver PROJECTS). */
  project: string;
  /** Zen para construir o nível 1 (a primeira construção deste tipo na cidade). */
  cost: number;
  /** Quanto o preço da próxima construção do tipo multiplica por cada uma que já está na cidade (1 = preço fixo). */
  costGrowth: number;
  /** Teto do preço da construção e do aprimoramento (sem teto se ausente). Reparo e reconstrução não têm teto. */
  priceCap?: number;
  /** Vida do nível 1 e acréscimo por nível. */
  hp: number;
  hpPerLevel: number;
  maxLevel: number;
  /** Só torres: tiro automático. O dano sobe `damagePerLevel` por nível; alcance em tiles; recarga em ticks. */
  shot?: { damage: number; damagePerLevel: number; range: number; cooldownTicks: number };
}

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  wall: {
    name: 'Muralha de pedra',
    desc: 'Bloqueia a passagem: a horda precisa quebrá-la para seguir. Não atira. Cada muralha que já está na cidade dobra o preço da próxima, até 999 Zen.',
    project: 'castle',
    cost: 5,
    costGrowth: 2,
    priceCap: 999,
    hp: 120,
    hpPerLevel: 60,
    maxLevel: 3,
  },
  tower: {
    name: 'Torre de tiro',
    desc: 'Atira sozinha no inimigo visível mais próximo, dentro do alcance. Ocupa um tile e bloqueia a passagem.',
    project: 'towers',
    cost: 120,
    costGrowth: 1,
    hp: 100,
    hpPerLevel: 40,
    maxLevel: 3,
    shot: { damage: 14, damagePerLevel: 4, range: 6, cooldownTicks: 12 },
  },
};

export interface ProjectDef {
  name: string;
  desc: string;
  /** Zen para desbloquear (uma vez; continua desbloqueado depois de derrotas). */
  cost: number;
  /** Projetos que precisam estar desbloqueados antes. */
  requires: string[];
  /** Ondas vencidas (no total da cidade) para liberar. */
  minNights?: number;
  /** Herói que precisa estar na party para liberar (as torres são da Arqueira). */
  hero?: HeroKind;
  /** Bônus permanente: a vida das estruturas deste tipo é multiplicada por `hpMult`. */
  bonus?: { kind: StructureKind; hpMult: number };
}

/** Projetos da cidade. `castle` começa desbloqueado. */
export const PROJECTS: Record<string, ProjectDef> = {
  castle: { name: 'Castelo básico', desc: 'Muralhas de pedra para segurar a horda.', cost: 0, requires: [] },
  towers: { name: 'Torres de tiro', desc: 'Torres que atiram sozinhas. Liberam-se com a Arqueira na party.', cost: 200, requires: ['castle'], hero: 'archer' },
  reinforce: { name: 'Reforços estruturais', desc: 'Muralhas com mais vida (+25%), permanente.', cost: 150, requires: ['castle'], minNights: 2, bonus: { kind: 'wall', hpMult: 1.25 } },
};

export const PROJECT_IDS = Object.keys(PROJECTS);

/** Mapa do Último Bastião (zona em src/config/zones.ts): grade, lotes de construção e portais. */
export const BASTION_ZONE_ID = 'bastionKeep';

/** Economia do modo (Zen é a moeda da própria carteira do Bastião: ver core/bastion). */
export const BASTION = {
  /** Vida máxima do núcleo: a mesma cidade da jornada. */
  coreMaxHp: GAME_CONFIG.cityDefense.maxHp,
  /** Reparo de estrutura danificada: Zen = quanto ela custou (investido) × fração perdida × repairRate. */
  repairRate: 0.5,
  /** Reconstruir estrutura destruída: Zen = investido × rebuildRate. Tem de ser sempre mais que reparar. */
  rebuildRate: 0.8,
  /** Piso de qualquer reparo: 1 Zen (as muralhas custam 5, então o piso precisa ser baixo). */
  minRepair: 1,
  /** Remover estrutura: devolve esta fração do investido, na proporção da vida que resta. Destruída não devolve nada. */
  refundRate: 0.5,
  /** Aprimorar do nível L para L+1 custa Zen base × upgradeFactor × L. */
  upgradeFactor: 1,
  /** Pacote de cartas a cada N ondas vencidas no Bastião (total, nunca zera). */
  packEvery: 100,
  /**
   * Socorro: sem Zen nem para o reparo mínimo do núcleo (coreMinFraction da vida), a cidade ganha Zen.
   * No máximo uma vez a cada `everyAttempts` tentativas — garante que a derrota severa não trava o modo.
   */
  rescue: { zeni: 150, everyAttempts: 2, coreMinFraction: 0.1 },
};
