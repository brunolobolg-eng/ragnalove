import { GAME_CONFIG } from './gameConfig';
import type { WaveMix } from './zones';
import type { HeroKind } from '../core/progression/skills';

/**
 * O Último Bastião: dados do modo de defesa persistente (número é dado — CLAUDE.md, regra 2).
 *
 * Ancoragem (investigada no Vanguarda, não inventada):
 *  - Núcleo: vida máxima e Zen por HP do reparo vêm de GAME_CONFIG.cityDefense (a mesma cidade da jornada).
 *  - Ameaça de cada inimigo que chega ao portão: GAME_CONFIG.cityDefense.threat (sem tabela própria).
 *  - Recompensas: Zen dos abates (GAME_CONFIG.zeni.dropPerKill) e bônus de onda limpa (waveClearBonus).
 *  - Custos de estruturas: muralha 5 Zen (dobra a cada muralha da cidade, teto de 999); torre 120 Zen (inicial).
 * Os números de estrutura e projeto são INICIAIS: calibrar com o dono antes de fechar o balanceamento.
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
  /** Pode ser erguida fora dos lotes de construção (qualquer tile andável). Sem isto, só nos lotes. */
  anywhere?: boolean;
  /** Pode ser movida no turno em que foi construída (ver isMovable em core/bastion/rules.ts). */
  movable?: boolean;
}

export const STRUCTURES: Record<StructureKind, StructureDef> = {
  wall: {
    name: 'Muralha de pedra',
    desc: 'Bloqueia a passagem: a horda só a quebra quando não tem outro caminho. Pode ser erguida em qualquer ponto do mapa e movida no turno em que foi construída. Não atira. Cada muralha da cidade dobra o preço da próxima, até 999 Zen.',
    project: 'castle',
    cost: 5,
    costGrowth: 2,
    priceCap: 999,
    hp: 120,
    hpPerLevel: 60,
    maxLevel: 3,
    anywhere: true,
    movable: true,
  },
  tower: {
    name: 'Torre de tiro',
    desc: 'Só nos lotes de construção. Atira sozinha no inimigo visível mais próximo, dentro do alcance. Ocupa um tile e bloqueia a passagem.',
    project: 'towers',
    cost: 120,
    costGrowth: 1,
    hp: 100,
    hpPerLevel: 40,
    maxLevel: 3,
    shot: { damage: 14, damagePerLevel: 4, range: 6, cooldownTicks: 12 },
    anywhere: false,
    movable: false,
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
  /** Zen com que a cidade nova começa (para as primeiras muralhas, antes da primeira onda). PROVISÓRIO: calibrar com o dono. */
  startZeni: 20,
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
   * Emperium (o minério no centro do castelo): quem toca o tile morre na hora e desconta vida atual × força do tipo
   * ÷ contactDivisor. Com 30 (a vida de um comum), um comum cheio causa 3, como na campanha; um pesado
   * (85 de vida, força 8) causa 23. Vida da cidade: GAME_CONFIG.cityDefense.maxHp.
   */
  emperium: { contactDivisor: 30 },
};

/** Definição da horda por noite (ver core/bastion/horde.ts). Os números e a ordem dos ciclos são dados. */
export interface BastionHordeDef {
  /** Tropa comum de cada noite. */
  count: number;
  /** Mistura da tropa comum (pesos somam 100). Mini-chefes e MVPs entram por cima, pelo mecanismo de chefe da onda. */
  regular: WaveMix[];
  /** Mini-chefe a cada N noites (as noites de MVP são puladas). Exige mvpEvery múltiplo deste (checado em scripts/bastionCheck.ts). */
  miniEvery: number;
  /** MVP a cada N noites. */
  mvpEvery: number;
  /** Ciclo dos mini-chefes, em ordem: a k-ésima noite de mini-chefe (as de MVP não contam) pega minis[(k − 1) mod tamanho do ciclo]. */
  minis: string[];
  /** Ciclo dos MVPs, em ordem: noite de MVP (n / mvpEvery − 1) mod tamanho do ciclo. */
  mvps: string[];
  /** Nome em pt-BR de cada inimigo de combate (tudo de GAME_CONFIG.enemies, menos o boneco de treino). */
  names: Record<string, string>;
}

export const BASTION_HORDE: BastionHordeDef = {
  count: 60,
  regular: [
    { kind: 'grunt', weight: 40 },
    { kind: 'runner', weight: 24 },
    { kind: 'brute', weight: 14 },
    { kind: 'raydric', weight: 12 },
    { kind: 'necro', weight: 10 },
  ],
  miniEvery: 5,
  mvpEvery: 10,
  minis: ['elite', 'goblinImp', 'goblinWarlord', 'dinoBoss', 'goblinLeader'],
  mvps: ['boss', 'boss2', 'orcboss'],
  names: {
    grunt: 'Zumbi',
    runner: 'Corredor',
    brute: 'Pesado',
    raydric: 'Raydric',
    necro: 'Necromante',
    elite: 'Elite',
    goblinImp: 'Krexx pequeno',
    goblinWarlord: 'Krexx retorcido',
    dinoBoss: 'Dino',
    goblinLeader: 'Líder goblin',
    boss: 'Colosso da Clareira',
    boss2: 'Colosso Solar',
    orcboss: 'Senhor Orc das Cinzas',
  },
};
