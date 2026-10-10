/**
 * Visual do CAVALEIRO RÚNICO (Guerreiro): Lâmina Encantada, Onda Sônica, Limite da Morte, Cem Lanças e
 * Cortador de Vento. Só apresentação: nenhum número aqui muda dano, recarga, alcance ou alvo — isso é da simulação.
 *
 * Paleta (arte de referência "Cavaleiro Rúnico"), em HDR: valores acima de 1 viram brilho no bloom.
 *  - azul ~#4aa3ff · carmesim ~#e8245a · dourado ~#ffc23a · verde-água ~#3ff2c4 (+ branco-quente para o miolo).
 * Convenções: tempos em segundos; distâncias em unidades do mundo (1 tile = 1 unidade).
 * A duração da Lâmina Encantada e da marca vem do evento (`ticks`; 10 ticks por segundo, ver WARRIOR_FX.ticksPerSec).
 */
export const RUNIC_PALETTE = {
  blue: [0.6, 1.3, 2.0],
  crimson: [2.0, 0.3, 0.7],
  gold: [2.2, 1.7, 0.5],
  aqua: [0.55, 2.0, 1.7],
  white: [1.8, 2.0, 2.2],
} as const;

export const WARRIOR_RUNIC_FX = {
  /** Lâmina Encantada: ligada enquanto dura, com brilho azul na arma e runas leves no chão. */
  enchant: {
    /** ignição (ao ligar e ao religar): clarão, anel azul no chão e faíscas saindo da lâmina */
    flashSize: 1.2,
    flashLife: 0.25,
    ringSize: 0.4,
    ringEnd: 1.8,
    ringLife: 0.45,
    igniteSparks: 16,
    igniteSpeed: 2.2,
    /** faíscas que sobem da ponta da lâmina (taxa por segundo) */
    sparksPerSec: 14,
    sparkRise: 0.8,
    sparkLife: 0.35,
    sparkSize: 0.12,
    sparkSizeEnd: 0.02,
    /** brilho no corpo: halo que pulsa na altura do peito */
    haloSize: 1.3,
    haloHeight: 1.0,
    haloOpacity: 0.45,
    haloPulse: 0.18,
    haloSpeed: 3.0,
    /** runas azuis no chão: giram devagar e seguem o herói */
    runeSize: 1.5,
    runeOpacity: 0.4,
    runeSpin: 0.5,
    runeFadeIn: 0.4,
    /** esmaece no fim da duração (s) */
    fadeOut: 0.5,
    /** texto "Lâmina Encantada!" sobre a cabeça, ao ligar */
    floatSize: 0.32,
    floatLife: 1.0,
    floatHeight: 2.3,
    floatColor: '#6fb8ff',
  },

  /** Onda Sônica: rastro azul-claro do herói até o alvo; estilhaço no impacto. */
  sonic: {
    /** altura do rastro (unidades do mundo) */
    lift: 1.0,
    /** tempo de voo do rastro até o alvo (s); o estilhaço sai nesse instante */
    flight: 0.24,
    crescentSize: 0.9,
    crescentRot: 0,
    trailWidth: 0.3,
    trailLife: 0.2,
    /** o crescente some depois do impacto (s) */
    fadeOut: 0.15,
    /** estilhaço: lâminas curtas em leque, estrela de impacto e faíscas */
    shards: 7,
    shardDist: 0.9,
    shardSize: 0.5,
    shardLife: 0.3,
    starSize: 0.7,
    starLife: 0.18,
    sparks: 8,
    shake: 0.06,
    hitStop: 0.03,
    spectre: 0.5,
    /** duração total do efeito (s) */
    life: 0.6,
  },

  /** Limite da Morte: círculo de runas carmesim sob o inimigo marcado; a marca dura o tempo de `ticks`. */
  death: {
    runeSize: 1.4,
    runeOpacity: 0.7,
    runeSpin: -0.6,
    runeFadeIn: 0.3,
    /** esmaece no fim da marca (s) */
    fadeOut: 0.6,
    /** anel que sai do círculo a cada `pulseEvery` segundos */
    pulseEvery: 1.0,
    pulseSize: 0.4,
    pulseEnd: 1.4,
    pulseLife: 0.5,
    /** halo sobre a cabeça do alvo marcado (segue o alvo) */
    haloHeight: 2.0,
    haloSize: 0.5,
    haloOpacity: 0.8,
    haloPulse: 0.2,
    haloSpeed: 4.0,
    /** clarão e anel quando a marca entra */
    flashSize: 0.9,
    flashLife: 0.22,
    ringSize: 0.4,
    ringEnd: 1.2,
    ringLife: 0.4,
    shake: 0.03,
    floatSize: 0.3,
    floatLife: 1.0,
    floatHeight: 2.2,
    floatColor: '#ff4d7a',
  },

  /** Dano devolvido pelo Limite da Morte: faísca carmesim que sai do alvo marcado e volta ao herói. */
  reflect: {
    /** altura do peito (chegada no herói e partida do alvo) */
    height: 1.0,
    /** tempo de voo (s) */
    flight: 0.3,
    size: 0.34,
    arc: 0.5,
    trailWidth: 0.16,
    trailLife: 0.2,
    /** tempo que a cabeça fica depois de chegar (s) */
    linger: 0.12,
    /** brilho que espoca no herói ao chegar */
    arriveSparks: 10,
    arriveSpeed: 2.0,
    ringSize: 0.3,
    ringEnd: 1.0,
    ringLife: 0.3,
    shake: 0.03,
  },

  /** Cem Lanças: lanças douradas caindo em sequência sobre o alvo e os vizinhos, com um círculo dourado no chão. */
  spear: {
    /** no máximo esta quantidade de alvos recebe as lanças (o principal vai primeiro) */
    maxTargets: 5,
    /** intervalo entre golpes (s), tempo de queda de cada lança (s) e altura de onde caem */
    interval: 0.08,
    fall: 0.16,
    height: 4.2,
    /** tamanho do feixe da lança (largura, altura) */
    beamW: 0.16,
    beamH: 1.5,
    /** tempo extra depois do último golpe (s) */
    tail: 0.35,
    /** círculo dourado no chão: começa em `ringStart` × (raio + 0,5) e cresce até `ringEnd` */
    ringStart: 0.6,
    ringEnd: 1.2,
    /** cada lança que cai: estrela e faíscas; o alvo principal também marca o chão e treme a tela */
    starSize: 0.45,
    starLife: 0.16,
    landSparks: 6,
    landRing: 0.2,
    landRingEnd: 0.6,
    landRingLife: 0.22,
    shake: 0.02,
    spectre: 0.5,
    floatSize: 0.36,
    floatLife: 1.0,
    floatHeight: 2.3,
    floatColor: '#ffd25a',
  },

  /** Cortador de Vento: anel verde-água que gira em volta do herói e rajadas em cada inimigo atingido. */
  wind: {
    /** duração do giro (s) e altura do rastro */
    spin: 0.34,
    height: 0.9,
    /** raio visual = raio do jogo × ringScale (o anel passa por cima dos inimigos atingidos) */
    ringScale: 1.1,
    ringStart: 0.5,
    ringEnd: 1.2,
    ringLife: 0.4,
    ribbonWidth: 0.3,
    ribbonLife: 0.3,
    /** poeira de vento que acompanha a ponta do giro */
    swirlSpeed: 1.0,
    /** rajada em cada inimigo atingido: crescente de vento e faíscas */
    gustSize: 0.9,
    gustLife: 0.28,
    gustSparks: 6,
    gustSpeed: 1.2,
    shake: 0.02,
    spectre: 0.5,
    /** tempo extra depois do giro (s) */
    tail: 0.3,
    floatSize: 0.36,
    floatLife: 1.0,
    floatHeight: 2.3,
    floatColor: '#5ff5d2',
  },

  /** Duração de cada demonstração na vitrine (s) e `ticks` usados lá (a Lâmina e a marca duram menos na vitrine). */
  demo: {
    enchantTicks: 50,
    enchant: 6.0,
    sonic: 1.0,
    deathTicks: 60,
    death: 6.6,
    spear: 1.4,
    wind: 1.0,
  },
} as const;
