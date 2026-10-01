import type { Orientation, Vec2 } from '../core/grid/types';
import { ACTIVE_ZONE, parseZone, type MapObjectDef, type ZoneDef, type WaveMix } from './zones';

/** Mapa da zona ativa (ver zones.ts). */
const ZONE_MAP = parseZone(ACTIVE_ZONE);

/** Todas as constantes de gameplay ficam aqui. Nada de números mágicos no resto do código. */
export const GAME_CONFIG = {
  sim: {
    tickRate: 10, // ticks por segundo (simulação determinística de passo fixo)
  },
  /** Grade da zona ativa: paredes bloqueiam andar e visão; vazio (água) só bloqueia andar. O tamanho vem do MAP_CONFIG da zona. */
  board: {
    width: ZONE_MAP.width,
    height: ZONE_MAP.height,
    walls: ZONE_MAP.walls as Vec2[],
    voids: ZONE_MAP.voids as Vec2[],
    /** Portão da cidade (zona de ameaça), neblina e chão lento da zona ativa. */
    city: ZONE_MAP.city as Vec2[],
    fog: ZONE_MAP.fog as Vec2[],
    slow: ZONE_MAP.slow as Vec2[],
    objects: ZONE_MAP.objects as MapObjectDef[],
    theme: ACTIVE_ZONE.theme as string,
  },
  pathing: {
    stepCost: 10,
    diagonalCost: 14,
    /** Custo extra por tile de efeito hostil: alto, mas não é bloqueio absoluto. */
    hazardCost: 150,
    /** Custo extra para os pesados atravessarem um obstáculo destrutível (eles quebram no caminho). */
    breakCost: 60,
  },
  /**
   * Zumbis. Todos seguem a mesma IA (campo de fluxo + ataque adjacente); o que muda são os números,
   * para dar leitura tática: o rápido fura a linha, o pesado segura e bate forte, o chefe fecha a onda.
   */
  enemies: {
    grunt: { hp: 30, moveTicks: 6, attackTicks: 10, damage: 6 }, // comum
    runner: { hp: 16, moveTicks: 3, attackTicks: 8, damage: 4 }, // rápido
    brute: { hp: 85, moveTicks: 10, attackTicks: 14, damage: 11 }, // pesado
    boss: { hp: 220, moveTicks: 9, attackTicks: 15, damage: 9 }, // Colosso (chefe do Ato I)
    elite: { hp: 150, moveTicks: 9, attackTicks: 13, damage: 11 }, // mini-chefe (nó de Elite)
    necro: { hp: 26, moveTicks: 7, attackTicks: 12, damage: 4 }, // Necromante: conjurador à distância
    boss2: { hp: 300, moveTicks: 9, attackTicks: 14, damage: 12 }, // Colosso Solar (chefe do Ato II)
    orcboss: { hp: 380, moveTicks: 10, attackTicks: 15, damage: 14 }, // Senhor Orc (chefe final)
  } as Record<string, { hp: number; moveTicks: number; attackTicks: number; damage: number }>,
  /**
   * Roubo de alma: cada monstro morto rende almas ao herói que o abateu.
   * Almas são a moeda de progressão (atributos hoje; habilidades/upgrades no futuro).
   */
  souls: {
    dropPerKill: { grunt: 1, runner: 1, brute: 3, necro: 2, elite: 12, boss: 25, boss2: 35, orcboss: 50 } as Record<string, number>,
    defaultDrop: 1,
  },
  /**
   * Zeni: moeda de GASTO da run (atributos, respec, lojas, refino). Cai de todo monstro abatido
   * e vai para a bolsa da party. Almas continuam sendo a moeda de CRESCIMENTO (EXP, despertar).
   */
  zeni: {
    dropPerKill: { grunt: 4, runner: 3, brute: 12, necro: 8, elite: 80, boss: 150, boss2: 220, orcboss: 400 } as Record<string, number>,
    defaultDrop: 3,
    /** Bônus ao vencer a onda. */
    waveClearBonus: 60,
    /** Ponto de atributo comprado com Zeni: base + passo × pontos já comprados por esse herói. */
    attrPointBase: 40,
    attrPointStep: 20,
    /** Redistribuir atributos: base × (1 + usos anteriores). */
    respecBase: 80,
  },
  /** EXP e níveis: cada abate dá EXP a toda a party viva; cada nível dá pontos de atributo. */
  progression: {
    expPerKill: { grunt: 5, runner: 4, brute: 12, necro: 8, elite: 40, boss: 80, boss2: 120, orcboss: 200 } as Record<string, number>,
    defaultExp: 5,
    expCurve: { base: 20, growth: 1.35 }, // EXP para passar do nível L = base * L^growth
    pointsPerLevel: 3,
    /** Almas absorvidas viram EXP (escala bem menor que as poções de EXP da cidade). */
    soulAbsorb: { souls: 10, exp: 12 },
    /** Ao derrotar um chefe/mini-chefe, TODOS os heróis ganham este número de níveis. */
    levelsPerBoss: 1,
    /** Cada nível dá pontos de habilidade (árvore). */
    skillPointsPerLevel: 1,
  },
  /** Serviços das cidades (preços em Zeni, exceto onde indicado). */
  city: {
    potions: [
      { id: 'expS', name: 'Poção de EXP pequena', exp: 40, price: 60 },
      { id: 'expM', name: 'Poção de EXP média', exp: 150, price: 200 },
      { id: 'expL', name: 'Poção de EXP grande', exp: 500, price: 600 },
    ],
    /** Itens básicos à venda (a loja sorteia ao entrar na cidade). */
    shopStock: 4,
    itemPrice: { common: 50, uncommon: 120, rare: 320, epic: 900, legendary: 2500, mythic: 6000 } as Record<string, number>,
    sellPrice: { common: 10, uncommon: 30, rare: 80, epic: 220, legendary: 600, mythic: 1500 } as Record<string, number>,
    rerollPrice: { common: 30, uncommon: 60, rare: 120, epic: 260, legendary: 520, mythic: 900 } as Record<string, number>,
    /** Minérios de refino (nomes originais): um por tentativa. */
    orePrice: 150,
    refineFeePerLevel: 40,
    /** Almas para despertar. */
    awakenSouls: { legendary: 60, mythic: 120 } as Record<string, number>,
    /** Reviver um herói caído custa esta fração do Zeni atual. */
    reviveFraction: 0.5,
    /** Preço sobe por ato (índice = ato 0..2). */
    actPriceMult: [1, 1.6, 2.4],
  },
  /** Orçamento de efeitos (teto absoluto; o preset de qualidade escala a densidade abaixo disso). */
  vfx: {
    /** Teto de partículas simultâneas por sistema (o preset só reduz a densidade abaixo disso). */
    particleBudget: { glow: 5000, spark: 1500, fire: 2500, smoke: 2500 },
    /** Luzes pontuais reais para efeitos (o resto é simulado com brilho aditivo). */
    maxDynamicLights: 6,
    /** Fitas (rastros) e decalques de chão simultâneos (pools pré-alocados). */
    maxRibbons: 24,
    maxDecals: 64,
    /**
     * VFXManager (three.quarks). `poolMax` = instâncias pré-montadas por efeito (reusadas);
     * `maxActive` = quantas cópias do mesmo efeito tocam juntas — o excedente é ignorado
     * (as partículas básicas daquele evento continuam), é o que segura as hordas.
     */
    manager: {
      poolMax: 16,
      defaultMaxActive: 4,
      maxActive: { hitSpark: 14, hitSparkFrost: 10, hitSparkFire: 10, enemyDeath: 12, levelUp: 3, bossSpawn: 1, cityBreach: 4, objectBreakWood: 3, objectBreakStone: 3, ruinDebris: 2, oilBurst: 3, sandstorm: 1 } as Record<string, number>,
    },
  },
  /** Onda da zona ativa (WAVE_CONFIG): `count` inimigos sorteados pelo `mix` e, no fim, o chefe. */
  wave: {
    count: ACTIVE_ZONE.wave.count,
    spawnIntervalTicks: ACTIVE_ZONE.wave.spawnIntervalTicks,
    /** Os 2 pontos de spawn fixos da zona (MAP_CONFIG). */
    spawnPoints: ACTIVE_ZONE.spawnPoints.map((p) => ({ ...p })) as Vec2[],
    /** Fração da horda que sai do 1º spawn (o resto sai do 2º). A zona pode sobrescrever. */
    spawnSplit: ACTIVE_ZONE.spawnSplit ?? 0.5,
    /** Padrão quando a zona não define `spawnSplit`. */
    defaultSpawnSplit: 0.5,
    /** Se o tile do spawn está ocupado, o inimigo nasce num tile livre até esta distância. */
    spawnSpread: 2,
    /** Heróis não podem ser posicionados a menos disso de um spawn. */
    spawnSafeRadius: 3,
    seed: ACTIVE_ZONE.wave.seed,
    mix: ACTIVE_ZONE.wave.mix as WaveMix[],
    boss: ACTIVE_ZONE.wave.boss as string | undefined,
    bossDelayTicks: ACTIVE_ZONE.wave.bossDelayTicks,
    /** Escala dos inimigos (ato e posição na rota). */
    hpMult: 1,
    dmgMult: 1,
    /** Multiplicador da ameaça à cidade (por ato). */
    threatMult: 1,
    endless: false,
  },
  /**
   * Vida da cidade (CITY_HP / CITY_THREAT_CONFIG). Funciona como zona de ameaça: cada inimigo que
   * alcança o portão invade a cidade, sai do campo e desconta `threat[tipo]` da vida dela.
   * A cidade não regenera sozinha (reparo na cidade com Zeni ou por eventos). Zero = fim da run.
   */
  cityDefense: {
    maxHp: 1000,
    threat: { grunt: 8, runner: 5, brute: 20, necro: 10, elite: 60, boss: 120, boss2: 150, orcboss: 200 } as Record<string, number>,
    defaultThreat: 8,
    /** Peso da ameaça por ato (o Ato I começa com um herói só). */
    threatActMult: [0.6, 0.9, 1.2],
    /** Na Sobrevivência a cidade não sofre dano (cair lá não custa nada). */
    survivalThreatMult: 0,
    /** Reparo no Templo: HP por compra e Zeni por HP (multiplicado pelo preço do ato). */
    repairStep: 100,
    repairZeniPerHp: 1.1,
    /** Faixas de estado mostradas no relatório (fração da vida máxima). */
    states: { safe: 0.7, pressure: 0.4, critical: 0.2 },
  },
  /**
   * Aggro (ENEMY_CONFIG.aggroType). Por padrão a horda vai para a cidade:
   *  - city: foca a cidade, só bate num herói que esteja no caminho (não persegue); ignora Provocar.
   *  - tauntable: igual a "city", mas responde ao Provocar.
   *  - bypass: ignora heróis mesmo no caminho (contorna ou espera) e ignora Provocar.
   *  - heavy: foca a cidade, quebra obstáculos destrutíveis no caminho e responde ao Provocar.
   *  - hunter: chefes e elites — caçam a party (comportamento antigo) e não ligam para Provocar.
   *    Se um deles alcançar o portão, invade a cidade do mesmo jeito.
   */
  aggro: {
    byKind: { grunt: 'tauntable', runner: 'bypass', brute: 'heavy', necro: 'city', elite: 'hunter', boss: 'hunter', boss2: 'hunter', orcboss: 'hunter' } as Record<string, AggroType>,
    defaultType: 'tauntable' as AggroType,
    /** Tipos que trocam de alvo com Provocar. */
    tauntAffects: ['tauntable', 'heavy'] as AggroType[],
    /** Provocar (TAUNT_RANGE / TAUNT_DURATION / TAUNT_MAX_ENEMIES): valores no nível 1; a árvore soma por nível. */
    taunt: { range: 4, rangePerLevel: 0.5, durationTicks: 40, durationPerLevel: 6, maxEnemies: 6, maxPerLevel: 1, cooldownTicks: 85, cooldownPerLevel: -5, minTargets: 2 },
  },
  /** Objetos interativos dos mapas (regras em core/sim/objects.ts). */
  objects: {
    /** Carroça tombada: cobertura (bloqueia andar e visão); vasculhar dá Zeni ou almas (1× por fase). */
    cart: { zeni: [70, 150] as [number, number], soulChance: 0.35, souls: [8, 16] as [number, number] },
    /** Barril de óleo: derrama no tile e vizinhos; fogo do Mago em cima (ou ao lado) incendeia. */
    oilBarrel: { radius: 1, burnTicks: 90, burnDamage: 9, burnIntervalTicks: 4 },
    /** Tocha caída: acesa, clareia a neblina em volta (revela quem vem por ali mais cedo). */
    torch: { radius: 7 },
    /** Raízes antigas: seguram os comuns; elites e chefes passam por cima; os pesados quebram. */
    roots: { hp: 120 },
    /** Altar da floresta: bênção de cura durante a fase (custa Zeni OU almas). */
    altar: { zeniCost: 60, soulCost: 14, regenPerSec: 4 },
    /** Coluna de areia: cobertura; desmorona com dano em área ou golpes dos pesados. */
    sandColumn: { hp: 90, areaHit: 25 },
    /** Ruína instável: Golpe em Área/Onda de Choque do Guerreiro por perto derruba tudo em cima da horda. */
    unstableRuin: { triggerRadius: 2, radius: 2, damage: 45 },
    /** Oásis seco: gelo (Raio Gélido / Nova Congelante) perto vira lama que atrasa a horda. */
    dryOasis: { triggerRadius: 3, mudRadius: 2, slowMult: 1.8, pathCost: 12 },
    /** Fogueira: descanso antes da horda — cura contínua e recargas mais curtas ("mana"). */
    campfire: { regenPerSec: 3, cooldownCut: 0.15 },
  },
  /** Biomas: neblina da floresta, raízes expostas e tempestade de areia do deserto. */
  biome: {
    fog: { revealRange: 3.5 },
    roots: { slowMult: 1.5, pathCost: 8 },
    sandstorm: { themes: ['desert'] as string[], intervalTicks: 320, warnTicks: 35, durationTicks: 90, rangeMult: 0.6, deflectChance: 0.3 },
  },
  /** Relatório da Noite (WAVE_RESULT): quantos relatórios guardar para uma tela de estatísticas futura. */
  waveReport: { historySize: 10 },
  /** Sobrevivência: estágio sobe a cada N abates; cada estágio fortalece os monstros. */
  survival: { stageKills: 15, hpGrowth: 1.13, dmgGrowth: 1.08, intervalMin: 2, eliteEvery: 4 },
  /**
   * Magias dos monstros (dados): cada tipo pode ter várias; o monstro conjura em vez de andar/atacar
   * quando a magia está pronta e a condição é satisfeita. Dano escala com a onda (dmgMult).
   */
  enemySpells: {
    necro: [{ id: 'shadowBolt', range: 5, damage: 7, cooldownTicks: 28 }],
    elite: [{ id: 'stomp', radius: 1, damage: 10, cooldownTicks: 45 }],
    boss: [
      { id: 'stomp', radius: 1, damage: 12, cooldownTicks: 50 },
      { id: 'meteor', radius: 1, range: 9, damage: 14, cooldownTicks: 75, telegraphTicks: 14, count: 1 },
    ],
    boss2: [
      { id: 'stomp', radius: 1, damage: 13, cooldownTicks: 48 },
      { id: 'meteor', radius: 1, range: 9, damage: 15, cooldownTicks: 70, telegraphTicks: 14, count: 2 },
    ],
    orcboss: [
      { id: 'stomp', radius: 2, damage: 11, cooldownTicks: 55 },
      { id: 'meteor', radius: 1, range: 9, damage: 13, cooldownTicks: 70, telegraphTicks: 14, count: 3 },
    ],
  } as Record<string, EnemySpell[]>,
  /** Herói sozinho na party (Ato I): mais vida e dano para aguentar a horda. */
  soloBonus: {
    warrior: { hp: 0.3, damage: 0.2, cooldown: 0.9 },
    mage: { hp: 1.5, damage: 0.7, cooldown: 0.7 },
    archer: { hp: 0.8, damage: 0.5, cooldown: 0.75 },
  } as Record<string, { hp: number; damage: number; cooldown: number }>,
  /** Tipos que contam como chefe/mini-chefe: derrotá-los dá +1 nível a toda a party e drop garantido. */
  bossKinds: ['elite', 'boss', 'boss2', 'orcboss'] as string[],
  archetypes: {
    mage: {
      hp: 75,
      /** 3 barreiras curtas; cada uma tem sua recarga (maior que a duração: o fogo pisca). */
      fireBarrier: {
        count: 3,
        length: 3,
        durationTicks: 90,
        cooldownTicks: 125,
        burnDamage: 5,
        burnIntervalTicks: 5,
      },
      /** Raio Gélido: ataque básico à distância, alvo único (inspirado nos "Bolts" clássicos). */
      frostBolt: {
        range: 6, // tiles (distância euclidiana), exige linha de visão
        damage: 8,
        cooldownTicks: 13,
        chillTicks: 4, // o gelo atrasa o alvo
      },
    },
    /** Arqueira: dano à distância com alcance longo e área em chuva de flechas. */
    archer: {
      hp: 95,
      /** Flecha Precisa: alvo único, alcance longo, exige linha de visão. */
      arrow: { range: 7, damage: 8, cooldownTicks: 13 },
      /** Chuva de Flechas: área 3×3 no grupo mais denso ao alcance. */
      rain: { range: 7, radius: 1, damage: 9, cooldownTicks: 70, minTargets: 3 },
    },
    warrior: {
      hp: 180,
      cleave: {
        range: 2,
        halfAngleDeg: 46,
        damage: 24,
        cooldownTicks: 12,
      },
      /** Investida: golpe corpo a corpo pesado em um único inimigo adjacente. */
      bash: {
        damage: 16,
        cooldownTicks: 9,
      },
    },
  },
};

export type AggroType = 'city' | 'tauntable' | 'bypass' | 'heavy' | 'hunter';

export interface EnemySpell {
  id: 'shadowBolt' | 'stomp' | 'meteor';
  damage: number;
  cooldownTicks: number;
  range?: number;
  radius?: number;
  telegraphTicks?: number;
  count?: number;
}

/** Opções da onda de um nó da run (sobre a onda-base da zona). */
export interface WaveOptions {
  count?: number;
  boss?: string | null;
  seed?: number;
  hpMult?: number;
  dmgMult?: number;
  mix?: WaveMix[];
  /** Sobrevivência: a horda não acaba e fica mais forte a cada estágio. */
  endless?: boolean;
  /** Peso da ameaça à cidade (GAME_CONFIG.cityDefense.threatActMult). */
  threatMult?: number;
}

/**
 * Troca a zona ativa (grade + onda) sem recriar o jogo: a simulação, o cenário e as
 * coordenadas leem daqui. Cada zona tem seu próprio tamanho (MAP_CONFIG).
 */
export function applyZone(zone: ZoneDef, o: WaveOptions = {}): void {
  const z = parseZone(zone);
  const b = GAME_CONFIG.board;
  b.width = z.width;
  b.height = z.height;
  b.walls = z.walls;
  b.voids = z.voids;
  b.city = z.city;
  b.fog = z.fog;
  b.slow = z.slow;
  b.objects = z.objects;
  b.theme = zone.theme;
  const w = GAME_CONFIG.wave;
  w.count = o.count ?? zone.wave.count;
  w.spawnIntervalTicks = zone.wave.spawnIntervalTicks;
  w.spawnPoints = zone.spawnPoints.map((p) => ({ ...p }));
  w.spawnSplit = zone.spawnSplit ?? w.defaultSpawnSplit;
  w.seed = o.seed ?? zone.wave.seed;
  w.mix = o.mix ?? zone.wave.mix;
  w.boss = o.boss === null ? undefined : (o.boss ?? zone.wave.boss);
  w.bossDelayTicks = zone.wave.bossDelayTicks;
  w.hpMult = o.hpMult ?? 1;
  w.dmgMult = o.dmgMult ?? 1;
  w.threatMult = o.threatMult ?? 1;
  w.endless = !!o.endless;
  ZONE_STATE.current = zone;
}

/** Zona em jogo (muda quando a run entra numa região). */
export const ZONE_STATE: { current: ZoneDef } = { current: ACTIVE_ZONE };

export type ArchetypeId = 'mage' | 'warrior' | 'archer';

export interface MemberSetup {
  archetype: ArchetypeId;
  x: number;
  y: number;
}

export interface BarrierSetup extends Vec2 {
  orientation: Orientation;
}

export interface PartySetup {
  members: MemberSetup[];
  /** As 3 Barreiras de Fogo do Mago (curtas; o jogador posiciona cada uma). */
  barriers: BarrierSetup[];
}

/** Mago sozinho: as 3 barreiras formam um "U" de proteção em volta dele. */
export function barriersShield(x: number, y: number): BarrierSetup[] {
  return [
    { x, y: y - 2, orientation: 'H' },
    { x: x - 2, y: y - 1, orientation: 'V' },
    { x: x + 2, y: y - 1, orientation: 'V' },
  ];
}

/** Três barreiras curtas a partir de um centro: duas lado a lado e uma à frente. */
export function barriersAround(x: number, y: number, o: Orientation = 'H'): BarrierSetup[] {
  if (o !== 'H') return [{ x, y, orientation: o }, { x: x - 2, y: y - 2, orientation: o }, { x: x + 2, y: y - 2, orientation: o }];
  return [
    { x: x - 1, y, orientation: 'H' },
    { x: x + 2, y, orientation: 'H' },
    { x, y: y - 3, orientation: 'H' },
  ];
}

/** Layout padrão da zona (já demonstra o funil). */
export const DEFAULT_SETUP: PartySetup = ACTIVE_ZONE.defaultSetup;
