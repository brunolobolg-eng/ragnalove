import type { Vec2 } from '../grid/types';
import type { AggroType } from '../../config/gameConfig';
import type { MapObjectType } from '../../config/zones';
import type { HeroStats } from '../progression/attributes';
import type { Item } from '../progression/equipment';

export type Team = 'party' | 'enemy';

export interface Unit {
  id: number;
  team: Team;
  kind: string; // 'mage' | 'warrior' | 'grunt' | ...
  x: number;
  y: number;
  /** Tile anterior + início/duração do movimento (para interpolação no render). */
  prevX: number;
  prevY: number;
  moveStartTick: number;
  moveTicks: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  facing: Vec2;
  nextActTick: number;
  cooldowns: Record<string, number>; // habilidade -> tick em que fica pronta
  /** Só party: chaves de recarga de habilidades fora dos slots (Mana) — nunca são usadas. */
  locked?: string[];
  /** Almas roubadas por esta unidade (só party). */
  souls: number;
  /** Só party: status derivados de atributos + equipamento, nível e EXP. */
  stats?: HeroStats;
  level: number;
  exp: number;
  /** Congelado (Nova Congelante) até este tick. */
  frozenUntil?: number;
  /** Fúria ativa até este tick. */
  furyUntil?: number;
  /** Escudo Sagrado: dano que ainda absorve e até quando dura. */
  shield?: number;
  shieldUntil?: number;
  /** Bênção: dano extra (0,1 = +10%) até o tick. */
  blessAmp?: number;
  blessUntil?: number;
  /** Multiplicador de dano próprio (estágios da Sobrevivência). */
  dmgScale?: number;
  /** Só inimigos: comportamento de aggro (ENEMY_CONFIG.aggroType). */
  aggro?: AggroType;
  /** Provocado: persegue esta unidade até `tauntUntil` (ignorando a cidade). */
  tauntedBy?: number;
  tauntUntil?: number;
  /** Foco de agressão: persegue esta unidade até `focusUntil` (60 ticks, sem trocar). */
  focusId?: number;
  focusUntil?: number;
  /** Nasceu em qual spawn (0 ou 1) — só apresentação/estatística. */
  spawnIndex?: number;
  /** Horda orgânica: lado para onde o monstro tende a andar (vetor; 0 = reto) e até quando. */
  drift?: Vec2;
  driftUntil?: number;
  /** Lento (armadilha) até este tick: passos custam `slowMult` vezes mais. */
  slowUntil?: number;
  slowMult?: number;
  /** Amaldiçoado (Bruxa) até este tick: recebe `curseAmp` a mais de dano. */
  cursedUntil?: number;
  curseAmp?: number;
  /** Danos contínuos ativos (veneno, maldição, enxame). */
  dots?: { perPulse: number; until: number; source: DamageSource; ownerId: number }[];
  /** Só party: estado do movimento de combate (CombatMovement). */
  ai?: CombatAIState;
}

export type CombatAIStateName = 'IDLE' | 'ATTACK' | 'MOVE_TO_ATTACK_RANGE' | 'RETURN_TO_POSITION' | 'DEAD';

export interface CombatAIState {
  /** Posição planejada (posto) do herói. */
  homeX: number;
  homeY: number;
  state: CombatAIStateName;
  targetId?: number;
  /** Por que está parado (ex.: 'limite' = alvo fora do raio máximo). */
  reason?: string;
  /** Ticks seguidos sem alvo (histerese do retorno). */
  idleTicks: number;
  lastRetreatTick: number;
}

/** Métricas do movimento de combate por herói (relatórios do Dev Lab). */
export interface CombatMoveStats {
  tilesMoved: number;
  repositions: number;
  ticksMoving: number;
  ticksAttacking: number;
}

/** Armadilha armada no chão (Arqueira): dispara no primeiro inimigo que pisar. */
export type TrapKind = 'snare' | 'mine' | 'freeze' | 'claymore';

export interface Trap {
  id: number;
  x: number;
  y: number;
  ownerId: number;
  damage: number;
  slowTicks: number;
  slowMult: number;
  /** Tipo (ausente = armadilha comum que prende). */
  kind?: TrapKind;
  /** Área da explosão/congelamento (raio em tiles) e efeitos extras. */
  radius?: number;
  stunTicks?: number;
  freezeTicks?: number;
}

/** Santuário: chão sagrado que cura aliados dentro a cada segundo. */
export interface Sanctuary {
  x: number;
  y: number;
  radius: number;
  perSec: number;
  until: number;
  ownerId: number;
}

/** Estado de um objeto interativo do mapa (autoritativo; o render só lê). */
export interface MapObject {
  id: number;
  type: MapObjectType;
  x: number;
  y: number;
  w: number;
  h: number;
  tiles: Vec2[];
  hp: number;
  maxHp: number;
  /** idle → used/lit/spilled/burning/broken/collapsed/muddy (depende do tipo). */
  state: 'idle' | 'used' | 'lit' | 'spilled' | 'burning' | 'broken' | 'collapsed' | 'muddy';
  /** Tiles de efeito (óleo derramado, lama, área clareada). */
  area: Vec2[];
}

export type DamageSource = 'burn' | 'cleave' | 'melee' | 'bolt' | 'bash' | 'debug' | 'nova' | 'storm' | 'shock' | 'combust' | 'arrow' | 'rain' | 'pierce' | 'spell' | 'meteor' | 'oil' | 'ruin' | 'trap' | 'arcane' | 'shadow' | 'blade' | 'poison' | 'curse' | 'execute';

export interface AreaEffect {
  id: number;
  /** fireBarrier = barreira do Mago / chuva incendiária; oilFire = óleo em chamas. */
  kind: 'fireBarrier' | 'oilFire';
  ownerId: number;
  tiles: Vec2[];
  startTick: number;
  endTick: number;
  hostileTo: 'enemy' | 'party';
}

export type SimPhase = 'setup' | 'running' | 'victory' | 'defeat';

export type SimEvent =
  | { type: 'spawn'; unitId: number }
  | { type: 'move'; unitId: number }
  | { type: 'damage'; unitId: number; amount: number; source: DamageSource; sourceId?: number; crit?: boolean }
  | { type: 'death'; unitId: number }
  | { type: 'soul'; fromId: number; toId: number; amount: number; x: number; y: number }
  | { type: 'effectStart'; effect: AreaEffect }
  | { type: 'effectEnd'; effectId: number }
  | { type: 'cast'; unitId: number; ability: string }
  | { type: 'cleave'; unitId: number; facing: Vec2; tiles: Vec2[]; hitTiles: Vec2[]; hits: number }
  | { type: 'melee'; unitId: number; targetId: number }
  | { type: 'bolt'; unitId: number; targetId: number; from: Vec2; to: Vec2 }
  | { type: 'bash'; unitId: number; targetId: number; x: number; y: number }
  | { type: 'avoid'; unitId: number; how: 'dodge' | 'block' | 'deflect' | 'shield' }
  | { type: 'exp'; x: number; y: number; amount: number }
  | { type: 'zeni'; x: number; y: number; amount: number }
  | { type: 'levelup'; unitId: number; level: number }
  | { type: 'drop'; item: Item; x: number; y: number }
  | { type: 'phase'; phase: SimPhase }
  | { type: 'freeze'; unitId: number; ticks: number }
  | { type: 'nova'; unitId: number; x: number; y: number; radius: number }
  | { type: 'storm'; unitId: number; strikes: Vec2[] }
  | { type: 'taunt'; unitId: number; radius: number; pulled: number[] }
  | { type: 'shockwave'; unitId: number; x: number; y: number; radius: number }
  | { type: 'fury'; unitId: number; ticks: number }
  | { type: 'heal'; unitId: number; amount: number }
  | { type: 'combust'; x: number; y: number }
  | { type: 'arrow'; unitId: number; targetId: number; from: Vec2; to: Vec2; crit: boolean }
  | { type: 'rain'; unitId: number; x: number; y: number; radius: number }
  | { type: 'pierce'; unitId: number; from: Vec2; to: Vec2 }
  | { type: 'focus'; unitId: number; ticks: number }
  | { type: 'shadowBolt'; unitId: number; targetId: number; from: Vec2; to: Vec2 }
  | { type: 'stomp'; unitId: number; x: number; y: number; radius: number }
  | { type: 'telegraph'; unitId: number; x: number; y: number; radius: number; ticks: number }
  | { type: 'meteor'; x: number; y: number; radius: number }
  /** Inimigo alcançou o portão: invadiu a cidade (sai do campo) e descontou `damage` da vida dela. */
  | { type: 'cityHit'; unitId: number; x: number; y: number; damage: number; cityHp: number; cityMaxHp: number }
  /** Objeto do mapa mudou de estado (aceso, derramado, quebrado...) ou levou dano. */
  | { type: 'objectState'; objectId: number; state: MapObject['state'] }
  | { type: 'objectHit'; objectId: number; unitId: number; amount: number }
  | { type: 'ruinCollapse'; objectId: number; x: number; y: number; radius: number }
  | { type: 'oilIgnite'; objectId: number; tiles: Vec2[] }
  | { type: 'mud'; objectId: number; tiles: Vec2[] }
  /** Tempestade de areia: aviso antes, começo e fim. */
  | { type: 'sandWarn'; ticks: number }
  | { type: 'sandstorm'; on: boolean }
  /** Objeto criado durante a onda (Muralha do Guerreiro). */
  | { type: 'objectSpawn'; object: MapObject }
  /** Armadilha armada / disparada. */
  | { type: 'trapSet'; trap: Trap }
  | { type: 'trapTrigger'; trapId: number; x: number; y: number; targetId: number; kind?: TrapKind; radius?: number }
  | { type: 'holyShield'; unitId: number; targetId: number; ticks: number }
  | { type: 'blessing'; unitId: number; targets: number[]; ticks: number }
  | { type: 'sanctuary'; unitId: number; x: number; y: number; radius: number; ticks: number }
  | { type: 'divineHeal'; unitId: number; targetId: number }
  /** Maldição lançada numa área. */
  | { type: 'curse'; unitId: number; x: number; y: number; radius: number }
  /** Execução do Assassino. */
  | { type: 'execute'; unitId: number; targetId: number; x: number; y: number }
  /** Unidade provocada (aggro trocou para `targetId`). */
  | { type: 'aggro'; unitId: number; targetId: number; ticks: number };

/**
 * WAVE_RESULT: relatório da noite montado pela simulação (camada autoritativa).
 * O cliente só renderiza — nunca calcula.
 */
export interface WaveReport {
  night: number;
  victory: boolean;
  /** A derrota veio da cidade (vida chegou a zero)? */
  cityFallen: boolean;
  damageDealtByUnit: { kind: string; amount: number }[];
  damageTakenByUnit: { kind: string; amount: number }[];
  skillsUsedByUnit: { kind: string; count: number }[];
  enemiesKilled: number;
  enemiesReachedCity: number;
  /** Quantos de cada tipo invadiram (pesados descontam mais). */
  reachedByKind: Record<string, number>;
  cityDamageTaken: number;
  cityHpRemaining: number;
  cityMaxHp: number;
  cityThreatPercent: number;
  soulsCollected: number;
  zeniEarned: number;
  expEarned: number;
  itemsDropped: { name: string; rarity: string }[];
}
