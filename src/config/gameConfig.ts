import type { Orientation, Vec2 } from '../core/grid/types';
import { ACTIVE_ZONE, parseZone, type MapObjectDef, type ZoneDef, type WaveMix } from './zones';

/** Mapa da zona ativa (ver zones.ts). */
const ZONE_MAP = parseZone(ACTIVE_ZONE);

/** Todas as constantes de gameplay ficam aqui. Nada de números mágicos no resto do código. */
export const GAME_CONFIG = {
  sim: {
    tickRate: 10, // ticks por segundo (simulação determinística de passo fixo)
  },
  /**
   * MANA = capacidade de SLOTS DE HABILIDADE (não é MP: não gasta ao usar e não regenera).
   * Cada habilidade ativa equipada ocupa 1 slot; o ataque básico da classe não ocupa slot.
   * Slots = Mana ÷ custo do slot da classe, no MÁXIMO 5. A Mana vem da INTELIGÊNCIA (cada ponto dá
   * `perInt`), da Poção de Mana e de itens Épicos+ — investir em Inteligência é uma decisão de build.
   */
  mana: {
    /** Mana de todo herói antes da Inteligência. */
    base: 18,
    /** + Mana por ponto de Inteligência (o total, com equipamento). */
    perInt: 2,
    /** Teto de slots de habilidade por herói. */
    maxSlots: 5,
    /** Mana por slot. Mago (e Feiticeira/Bruxa) 1×, Arqueira e Assassino 1,5×, Guerreiro 2×. */
    slotCost: { mage: 10, sorcerer: 10, warlock: 10, archer: 15, assassin: 15, warrior: 20 } as Record<string, number>,
  },
  /** Crítico: chance e dano (dano crítico base 150%). */
  crit: { baseChance: 0.05, baseDamage: 1.5, maxChance: 0.6 },
  /** Loot fora da simulação (recompensas da jornada). */
  loot: {
    /** 1ª vitória da jornada: 1 item (às vezes 2) de raridade sorteada — nada é garantido. */
    starterGift: { secondChance: 0.35, weights: { common: 50, uncommon: 30, rare: 15, epic: 5 } as Record<string, number> },
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
    /**
     * Custo extra por tile de fogo: maior que qualquer caminho livre do mapa — enquanto existir
     * caminho sem obstrução, a horda sempre contorna; só atravessa o fogo se não houver outra rota.
     */
    hazardCost: 100000,
    /** Custo extra para os pesados atravessarem um obstáculo destrutível (eles quebram no caminho). */
    breakCost: 60,
  },
  /**
   * Zumbis. Todos seguem a mesma IA (campo de fluxo + ataque adjacente); o que muda são os números,
   * para dar leitura tática: o rápido fura a linha, o pesado segura e bate forte, o chefe fecha a onda.
   */
  enemies: {
    grunt: { hp: 30, moveTicks: 5, attackTicks: 10, damage: 6 }, // comum (pressiona mais que antes)
    runner: { hp: 16, moveTicks: 3, attackTicks: 8, damage: 4 }, // rápido
    brute: { hp: 85, moveTicks: 10, attackTicks: 14, damage: 11 }, // pesado
    raydric: { hp: 110, moveTicks: 12, attackTicks: 15, damage: 12 }, // pesado comum (Raydric): +29% vida, 20% mais lento, bate 1 tick mais devagar e +1 de dano; não é chefe
    boss: { hp: 220, moveTicks: 9, attackTicks: 15, damage: 9 }, // Colosso (chefe do Ato I)
    /** Boneco de treino (Arena de Skills): parado, não ataca, HP alto. Recompensas zeradas abaixo. */
    trainingDummy: { hp: 999999, moveTicks: 1000000000, attackTicks: 1000000000, damage: 0 },
    elite: { hp: 150, moveTicks: 8, attackTicks: 13, damage: 11 }, // mini-chefe (nó de Elite)
    necro: { hp: 26, moveTicks: 7, attackTicks: 12, damage: 4 }, // Necromante: conjurador à distância
    goblinImp: { hp: 110, moveTicks: 7, attackTicks: 12, damage: 9 }, // Krexx pequeno (mini-chefe, 1ª forma)
    goblinWarlord: { hp: 150, moveTicks: 6, attackTicks: 12, damage: 13 }, // Krexx retorcido (mini-chefe, retorno maior e agressivo)
    dinoBoss: { hp: 140, moveTicks: 7, attackTicks: 12, damage: 10 }, // Dino (mini-chefe do Ato II): rápido, um pouco mais duro que o Krexx pequeno
    boss2: { hp: 300, moveTicks: 9, attackTicks: 14, damage: 12 }, // Colosso Solar (chefe do Ato II)
    orcboss: { hp: 380, moveTicks: 10, attackTicks: 15, damage: 14 }, // Senhor Orc (chefe final)
  } as Record<string, { hp: number; moveTicks: number; attackTicks: number; damage: number }>,
  /**
   * Roubo de alma: cada monstro morto rende almas ao herói que o abateu.
   * Almas são a moeda de progressão (atributos hoje; habilidades/upgrades no futuro).
   */
  souls: {
    dropPerKill: { grunt: 1, runner: 1, brute: 2, raydric: 3, necro: 1, elite: 8, boss: 18, boss2: 25, orcboss: 35, goblinImp: 7, goblinWarlord: 21, dinoBoss: 9, trainingDummy: 0 } as Record<string, number>,
    defaultDrop: 1,
  },
  /**
   * Zen: moeda de GASTO da run (atributos, respec, lojas, refino). Cai de todo monstro abatido
   * e vai para a bolsa da party. Almas continuam sendo a moeda de CRESCIMENTO (EXP, despertar).
   */
  zeni: {
    dropPerKill: { grunt: 3, runner: 2, brute: 8, raydric: 10, necro: 6, elite: 56, boss: 105, boss2: 154, orcboss: 280, goblinImp: 42, goblinWarlord: 140, dinoBoss: 50, trainingDummy: 0 } as Record<string, number>,
    defaultDrop: 2,
    /** Bônus ao vencer a onda. */
    waveClearBonus: 42,
    /** Ponto de atributo comprado com Zen: base + passo × pontos já comprados por esse herói. */
    attrPointBase: 40,
    attrPointStep: 20,
    /** Redistribuir atributos: base × (1 + usos anteriores). */
    respecBase: 80,
  },
  /** EXP e níveis: cada abate dá EXP a toda a party viva; cada nível dá pontos de atributo. */
  progression: {
    expPerKill: { grunt: 2, runner: 2, brute: 4, raydric: 5, necro: 3, elite: 14, boss: 28, boss2: 42, orcboss: 70, goblinImp: 10, goblinWarlord: 38, dinoBoss: 14, trainingDummy: 0 } as Record<string, number>,
    defaultExp: 2,
    expCurve: { base: 20, growth: 1.6 }, // EXP para passar do nível L = base * L^growth
    pointsPerLevel: 3,
    /** Almas absorvidas viram EXP (escala bem menor que as poções de EXP da cidade). */
    soulAbsorb: { souls: 10, exp: 12 },
    /** Ao derrotar um chefe/mini-chefe, TODOS os heróis ganham este número de níveis. */
    levelsPerBoss: 1,
    /** Cada nível dá pontos de habilidade (árvore). */
    skillPointsPerLevel: 1,
  },
  /** Serviços das cidades (preços em Zen, exceto onde indicado). */
  city: {
    potions: [
      { id: 'expS', name: 'Poção de EXP pequena', exp: 40, price: 60 },
      { id: 'expM', name: 'Poção de EXP média', exp: 150, price: 200 },
      { id: 'expL', name: 'Poção de EXP grande', exp: 500, price: 600 },
    ],
    /**
     * Poções permanentes do herói escolhido (a loja tem estoque infinito). `soon` = em breve
     * (aparece escurecida). `hp`/`mana` somam à vida/mana máxima para sempre nesta jornada.
     */
    consumables: [
      { id: 'life', name: 'Poção de Vida', text: 'Aumenta a vida máxima do herói.', price: 320, hp: 15, color: '#e8384a' },
      { id: 'mana', name: 'Poção de Mana', text: 'Mais Mana = mais slots de habilidade. Rara e cara.', price: 800, mana: 5, color: '#3a7aff' },
      { id: 'resist', name: 'Poção de Resistência', text: 'Aumenta a defesa por um tempo.', price: 50, soon: true, color: '#3ac44a' },
      { id: 'luck', name: 'Elixir de Sorte', text: 'Mais chance de itens raros por um tempo.', price: 120, soon: true, color: '#9a4ae8' },
    ] as { id: string; name: string; text: string; price: number; hp?: number; mana?: number; soon?: boolean; color: string }[],
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
    /** Reviver um herói caído custa esta fração do Zen atual. */
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
    /** Os pontos de spawn fixos da zona (MAP_CONFIG; N portais, não só 2). */
    spawnPoints: ACTIVE_ZONE.spawnPoints.map((p) => ({ ...p })) as Vec2[],
    /** Fração da horda que sai do 1º spawn (o resto se divide entre os demais). A zona pode sobrescrever. */
    spawnSplit: ACTIVE_ZONE.spawnSplit ?? 0.5,
    /** Padrão quando a zona não define `spawnSplit`. */
    defaultSpawnSplit: 0.5,
    /** Se o tile do spawn está ocupado, o inimigo nasce num tile livre até esta distância. */
    spawnSpread: 2,
    /**
     * GOVERNADOR DE DENSIDADE: teto de inimigos vivos simultâneos. Ao atingir,
     * o spawn recua `spawnBackoffTicks` em vez de empilhar entidades (pressão sem entulho).
     */
    maxAlive: 120,
    spawnBackoffTicks: 20,
    /**
     * Ritmo dinâmico: acima deste nº de vivos, o spawn respira (`softBackoffTicks`)
     * até a party limpar — a pressão acompanha o DPS real sem espiral de morte.
     */
    softAlive: 35,
    softBackoffTicks: 12,
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
    /** Planejamento: a horda começa sozinha depois destes segundos (contagem na tela). */
    autoStartSeconds: 10,
    /**
     * Horda orgânica: os monstros chegam em LEVAS de tamanho e ritmo sorteados (pela seed da fase),
     * nascem espalhados em volta do portal e cada um "deriva" para um lado do caminho.
     * O ritmo MÉDIO continua o de `spawnIntervalTicks` (o balanceamento da zona não muda).
     */
    organic: {
      /** monstros por leva (sorteado entre min e max; a leva inteira sai do mesmo portal) */
      packMin: 1,
      packMax: 10,
      /** ticks entre monstros da mesma leva */
      packGapMin: 2,
      packGapMax: 6,
      /** pausa até a próxima leva = tamanho × intervalo da zona × fator sorteado entre min e max */
      pauseMin: 0.45,
      pauseMax: 1.25,
      /** nascem num tile livre sorteado até esta distância do portal */
      spawnScatter: 3,
      /** quanto um passo pode ser "pior" (custo) que o melhor para seguir a deriva do monstro */
      wanderSlack: 8,
      /** força da deriva na escolha do passo */
      wanderWeight: 6,
      /** chance de um monstro ir reto (sem deriva) a cada sorteio */
      straightChance: 0.25,
      /** ticks até o monstro sortear uma nova deriva */
      driftMin: 15,
      driftMax: 60,
      /** variação na quantidade de monstros da fase (±20%) */
      countJitter: 0.2,
    },
  },
  /**
   * Vida da cidade (CITY_HP / CITY_THREAT_CONFIG). Funciona como zona de ameaça: cada inimigo que
   * alcança o portão invade a cidade, sai do campo e desconta `threat[tipo]` da vida dela.
   * A cidade não regenera sozinha (reparo na cidade com Zen ou por eventos). Zero = fim da run.
   */
  cityDefense: {
    maxHp: 1000,
    threat: { grunt: 3, runner: 2, brute: 8, raydric: 9, necro: 4, elite: 24, boss: 48, boss2: 60, orcboss: 80, goblinImp: 20, goblinWarlord: 60, dinoBoss: 22 } as Record<string, number>,
    defaultThreat: 3,
    /** Peso da ameaça por ato (o Ato I começa com um herói só). */
    threatActMult: [0.6, 0.9, 1.2],
    /** Na Sobrevivência a cidade não sofre dano (cair lá não custa nada). */
    survivalThreatMult: 0,
    /** Reparo no Templo: HP por compra e Zen por HP (multiplicado pelo preço do ato). */
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
    byKind: { grunt: 'tauntable', runner: 'bypass', brute: 'heavy', raydric: 'heavy', necro: 'city', elite: 'hunter', boss: 'hunter', boss2: 'hunter', orcboss: 'hunter', goblinImp: 'heavy', goblinWarlord: 'hunter', dinoBoss: 'hunter' } as Record<string, AggroType>,
    defaultType: 'tauntable' as AggroType,
    /** Tipos que trocam de alvo com Provocar. */
    tauntAffects: ['tauntable', 'heavy'] as AggroType[],
    /** Provocar (TAUNT_RANGE / TAUNT_DURATION / TAUNT_MAX_ENEMIES): valores no nível 1; a árvore soma por nível. */
    taunt: { range: 4, rangePerLevel: 0.5, durationTicks: 40, durationPerLevel: 6, maxEnemies: 6, maxPerLevel: 1, cooldownTicks: 85, cooldownPerLevel: -5, minTargets: 2 },
  },
  /**
   * FOCO DE AGRESSÃO: o monstro que detecta um herói trava nele por `durationTicks`
   * (6 s) sem trocar — depois solta e reavalia (outro herói ou o portão).
   * Regra de contenção (§12): no máximo `maxPerHero` monstros por herói; o resto
   * continua para o portão. Sem timers próprios: usa o relógio de ticks da sim.
   */
  focus: {
    /** Janela de foco em ticks (60 = 6 segundos). */
    durationTicks: 60,
    /** Além do alcance, o alvo pode se afastar isto antes de quebrar o foco. */
    leashBonus: 6,
    /** Máximo de monstros focados no mesmo herói. */
    maxPerHero: 6,
    /** Reavalia aquisição a cada N ticks (escalonado pelo id, sem pico). */
    checkEveryTicks: 5,
    /** Alcance de aquisição por tipo (0 = nunca tranca: conjurador e infiltrador ignoram heróis por desenho). Perto = reage; longe = segue a horda. */
    range: { grunt: 3, runner: 0, brute: 3, raydric: 3, necro: 0, elite: 5, boss: 6, boss2: 6, orcboss: 6, goblinImp: 4, goblinWarlord: 6, dinoBoss: 5 } as Record<string, number>,
    defaultRange: 5,
  },
  /** Objetos interativos dos mapas (regras em core/sim/objects.ts). */
  objects: {
    /** Carroça tombada: cobertura (bloqueia andar e visão); vasculhar dá Zen ou almas (1× por fase). */
    cart: { zeni: [70, 150] as [number, number], soulChance: 0.35, souls: [8, 16] as [number, number] },
    /** Barril de óleo: derrama no tile e vizinhos; fogo do Mago em cima (ou ao lado) incendeia. */
    oilBarrel: { radius: 1, burnTicks: 90, burnDamage: 9, burnIntervalTicks: 4 },
    /** Tocha caída: acesa, clareia a neblina em volta (revela quem vem por ali mais cedo). */
    torch: { radius: 7 },
    /** Raízes antigas: seguram os comuns; elites e chefes passam por cima; os pesados quebram. */
    roots: { hp: 120 },
    /** Altar da floresta: bênção de cura durante a fase (custa Zen OU almas). */
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
    goblinWarlord: [{ id: 'stomp', radius: 1, damage: 12, cooldownTicks: 50 }],
  } as Record<string, EnemySpell[]>,
  /** Herói sozinho na party (Ato I): mais vida e dano para aguentar a horda. */
  soloBonus: {
    warrior: { hp: 0.3, damage: 0.2, cooldown: 0.9 },
    mage: { hp: 1.5, damage: 0.7, cooldown: 0.7 },
    archer: { hp: 0.8, damage: 0.5, cooldown: 0.75 },
    sorcerer: { hp: 1.4, damage: 0.6, cooldown: 0.75 },
    warlock: { hp: 1.2, damage: 0.6, cooldown: 0.75 },
    assassin: { hp: 0.6, damage: 0.4, cooldown: 0.85 },
  } as Record<string, { hp: number; damage: number; cooldown: number }>,
  /** Dano contínuo (veneno, maldição, enxame): intervalo entre os pulsos. */
  dot: { intervalTicks: 10 },
  /**
   * Movimento de combate dos heróis (COMBAT_AI): na onda, passos curtos e automáticos para entrar no
   * alcance, manter a distância e voltar ao posto. Distâncias em tiles (euclidiana); tempos em ticks.
   * O alcance de ataque dos heróis à distância é o da própria arma (GAME_CONFIG.archetypes);
   * `attackRange` aqui vale para os de corpo a corpo.
   */
  combatAI: {
    enabled: true,
    rangedKinds: ['mage', 'archer', 'sorcerer', 'warlock'] as string[],
    heroes: {
      warrior: { detectionRange: 8, attackRange: 1.5, preferredRange: 1, maxCombatMoveDistance: 2, moveTicks: 5 },
      assassin: { detectionRange: 8, attackRange: 1.5, preferredRange: 1, maxCombatMoveDistance: 2, moveTicks: 4 },
      archer: { detectionRange: 15, preferredRange: 6, maxCombatMoveDistance: 2, moveTicks: 5 },
      mage: { detectionRange: 12, preferredRange: 5, maxCombatMoveDistance: 2, moveTicks: 6 },
      sorcerer: { detectionRange: 12, preferredRange: 5, maxCombatMoveDistance: 2, moveTicks: 6 },
      warlock: { detectionRange: 12, preferredRange: 4, maxCombatMoveDistance: 2, moveTicks: 6 },
    } as Record<string, { detectionRange: number; attackRange?: number; preferredRange: number; maxCombatMoveDistance: number; moveTicks: number }>,
    /** Herói à distância recua um passo se um inimigo chegar a esta distância (dentro do raio máximo). */
    retreatDistance: 1.5,
    /** Intervalo mínimo entre recuos (sem "kite" infinito). */
    retreatCooldownTicks: 20,
    /** Sem alvo por este tempo: volta ao posto (evita anda-para-anda). */
    returnDelayTicks: 15,
    /** Um passo só acontece se melhorar a distância ao objetivo pelo menos isto (evita tremer). */
    minStepGain: 0.25,
    /** Passo diagonal custa este múltiplo do tempo do passo reto. */
    diagonalMult: 1.4,
  },
  /** Tipos que contam como chefe/mini-chefe: derrotá-los dá +1 nível a toda a party e drop garantido. */
  bossKinds: ['elite', 'boss', 'boss2', 'orcboss', 'goblinImp', 'goblinWarlord', 'dinoBoss'] as string[],
  archetypes: {
    mage: {
      hp: 75,
      /** 3 barreiras curtas; cada uma tem sua recarga (maior que a duração: o fogo pisca). */
      fireBarrier: {
        count: 3,
        length: 5,
        durationTicks: 90,
        cooldownTicks: 125,
        burnDamage: 5,
        burnIntervalTicks: 5,
      },
      /** Raio Gélido: ataque básico à distância, alvo único (inspirado nos "Bolts" clássicos). */
      frostBolt: {
        range: 6, // tiles (distância euclidiana), exige linha de visão
        damage: 8,
        cooldownTicks: 16,
        chillTicks: 4, // o gelo atrasa o alvo
      },
    },
    /** Arqueira: dano à distância com alcance longo e área em chuva de flechas. */
    archer: {
      hp: 95,
      /** Flecha Precisa: alvo único, alcance longo, exige linha de visão. */
      arrow: { range: 7, damage: 8, cooldownTicks: 16 },
      /** Chuva de Flechas: área 3×3 no grupo mais denso ao alcance. */
      rain: { range: 7, radius: 1, damage: 9, cooldownTicks: 70, minTargets: 3 },
      /** Armadilha: dano alto em 1 alvo + lentidão. Armada no caminho, `ahead` passos à frente do inimigo. */
      trap: { range: 7, ahead: 3, damage: 38, damagePerLevel: 9, slowTicks: 40, slowMult: 2.2, maxTraps: 2, cooldownTicks: 60 },
    },
    warrior: {
      hp: 180,
      cleave: {
        range: 2,
        halfAngleDeg: 46,
        damage: 24,
        cooldownTicks: 15,
      },
      /** Investida: golpe corpo a corpo pesado em um único inimigo adjacente. */
      bash: {
        damage: 16,
        cooldownTicks: 11,
      },
      /** Muralha: blocos intransponíveis que a horda precisa quebrar. Vida escala com a Vitalidade. */
      shieldWall: { length: 5, hp: 90, hpPerLevel: 20, hpPerVit: 4, cooldownTicks: 120, cooldownPerLevel: 6 },
    },
    /** Feiticeira: dano arcano (Inteligência). */
    sorcerer: {
      hp: 70,
      orb: { range: 6, damage: 10, cooldownTicks: 17 },
      meteor: { range: 7, radius: 1, damage: 26, cooldownTicks: 85, minTargets: 3 },
    },
    /** Bruxa: dreno e maldições (Inteligência). */
    warlock: {
      hp: 85,
      drain: { range: 5, damage: 8, cooldownTicks: 17 },
      curse: { range: 6, radius: 1, damage: 4, durationTicks: 60, cooldownTicks: 90, minTargets: 2 },
      /** Frio (Névoa Gélida): inimigo gelado anda mais devagar, ataca/conjura mais devagar e recebe mais dano. */
      chill: { moveMult: 1.6, attackMult: 1.3, dmgTakenAmp: 0.1, durationTicks: 20 },
    },
    /** Assassino: corpo a corpo letal (Destreza). */
    assassin: {
      hp: 110,
      backstab: { damage: 14, cooldownTicks: 10, critBonus: 0.15 },
      fan: { range: 3, halfAngleDeg: 40, damage: 13, cooldownTicks: 40, minTargets: 2 },
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

export type ArchetypeId = 'mage' | 'warrior' | 'archer' | 'sorcerer' | 'warlock' | 'assassin';

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
  /** Muralha do Guerreiro (centro + orientação); sem valor = na frente do Guerreiro. */
  wall?: BarrierSetup;
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
