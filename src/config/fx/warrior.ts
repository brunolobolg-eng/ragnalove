/**
 * Visual de combate do GUERREIRO: Investida (ataque básico), Golpe em Área, Onda de Choque, Fúria,
 * Provocar e Muralha. Só apresentação: nenhum número aqui muda dano, recarga, alcance ou alvo — isso é da simulação.
 *
 * Convenções:
 *  - tempos em segundos; distâncias em unidades do mundo (1 tile = 1 unidade);
 *  - cores são [r, g, b] em HDR: valores acima de 1 só nos miolos brilhantes (o bloom transforma em brilho);
 *  - os impactos seguem o instante em que o alvo reage (o GameView adia o dano até lá). Os de Investida e Golpe
 *    em Área vêm das constantes exportadas por BashFX.ts e CleaveFX.ts; o da Onda vem de `impactAt` abaixo.
 */
export const WARRIOR_FX = {
  /** Ticks por segundo da simulação (1 tick = 0,1 s). Converte a duração da Fúria (em ticks) para segundos. */
  ticksPerSec: 10,
  /** Altura dos decalques de chão (evita que pisquem com o próprio chão). */
  groundY: 0.03,

  /** Investida (ataque básico): golpe LEVE, ~0,4 s, uma camada (lâmina) + um impacto pequeno. */
  bash: {
    /** a lâmina começa a descer (s). O impacto é BASH_IMPACT (BashFX.ts). */
    sweepFrom: 0.09,
    /** início da lâmina: à frente do peito, na altura da espada do modelo (m e unidades à frente) */
    startHeight: 1.25,
    startForward: 0.45,
    /** ponto de controle do arco da queda (fica um pouco acima e à frente) */
    ctrlHeight: 1.6,
    ctrlForward: 0.9,
    /** ponto do impacto: altura do peito do alvo e recuo para dentro do alvo */
    hitHeight: 0.6,
    hitBack: 0.15,
    /** comprimento da fita: só os últimos trechos da queda, até o impacto (unidades do mundo) */
    ribbonLen: 0.9,
    /** passo (fração da queda) usado para medir a direção do crescente na tela */
    tangentStep: 0.12,
    /** fita do fio da lâmina (rastro curto) */
    trailWidth: 0.26,
    trailLife: 0.18,
    trailColor: [1.1, 1.5, 1.7],
    /** crescente na ponta da lâmina (aço azul-claro) */
    crescentSize: 0.75,
    crescentColor: [1.6, 2.0, 2.2],
    /** ajuste de giro do crescente em relação à direção da queda (rad) */
    crescentRot: 0,
    /** tempo que o crescente leva para sumir depois do impacto (s) */
    crescentFade: 0.12,
    /** estrela de impacto pequena, sobre o alvo */
    starSize: 0.6,
    starColor: [1.3, 1.6, 1.8],
    starLife: 0.16,
    /** faíscas de aço (branco-quente que esfria) e poeira no impacto */
    sparks: 8,
    sparkColor: [2.6, 2.4, 2.0],
    sparkColorEnd: [1.0, 0.4, 0.1],
    dust: 3,
    dustColor: [0.5, 0.46, 0.4],
    /** anel minúsculo no chão do alvo */
    ringColor: [1.4, 1.6, 1.8],
    ringSize: 0.25,
    ringEnd: 0.9,
    ringLife: 0.22,
    /** tremor, empurrão e congelamento curto (ataque comum: leve) */
    shake: 0.06,
    kick: 0.05,
    hitStop: 0.05,
    /** golpe crítico (campo opcional `crit` do evento): crescente e estrela maiores */
    critScale: 1.3,
    /** duração total do efeito (s) */
    life: 0.5,
    /** Aura de espectro (fiapos do herói) durante o golpe (s), igual ao caso padrão do GameView */
    spectre: 0.6,
  },

  /** Golpe em Área: arco largo de um lado ao outro do cone, onda de poeira pelos tiles, faíscas nos atingidos. */
  cleave: {
    /** a lâmina começa a varrer o cone (s). O fim da varredura é o impacto: CLEAVE_IMPACT (CleaveFX.ts). */
    sweepFrom: 0.1,
    /** altura da lâmina na varredura (m) */
    bladeHeight: 0.95,
    /** raio em que a lâmina começa (perto do corpo) */
    innerRadius: 0.55,
    /** abertura mínima do arco (rad, cada lado): um cone estreito ainda varre um arco legível */
    minHalfSpan: 0.45,
    /** fita da lâmina (rastro) e fita larga e mais fraca logo abaixo (a esteira) */
    bladeWidth: 0.34,
    bladeLife: 0.34,
    bladeColor: [0.9, 1.7, 1.9],
    wakeWidth: 0.9,
    wakeLife: 0.34,
    wakeColor: [0.12, 0.45, 0.5],
    /** quanto a esteira fica abaixo da lâmina (m) */
    wakeDrop: 0.3,
    /** crescente na ponta da lâmina */
    tipSize: 1.1,
    tipColor: [1.6, 2.1, 2.3],
    tipRot: 0,
    /** onda de poeira que sai de cada tile do cone quando a lâmina passa por ele */
    waveDust: 2,
    waveSpeed: 1.5,
    waveColor: [0.5, 0.45, 0.38],
    waveLife: 0.8,
    /** impacto em cada tile atingido: faíscas, poeira e estrela pequena */
    sparksPerHit: 6,
    sparkColor: [2.6, 2.4, 2.0],
    sparkColorEnd: [0.9, 0.3, 0.06],
    dustPerHit: 2,
    starSize: 0.55,
    starColor: [1.3, 1.7, 1.9],
    starLife: 0.16,
    /** anel sob o guerreiro, do tamanho do arco (multiplicador do raio) */
    ringColor: [0.25, 0.5, 0.55],
    ringSize: 0.4,
    ringEndScale: 1.4,
    ringLife: 0.22,
    /** tremor e congelamento crescem com o número de acertos (com limite) */
    shakePerHit: 0.025,
    shakeMax: 0.14,
    hitStopBase: 0.03,
    hitStopPerHit: 0.01,
    hitStopMax: 0.07,
    /** duração total do efeito (s) */
    life: 0.62,
    /** Aura de espectro durante o golpe (s), igual ao caso padrão do GameView */
    spectre: 0.55,
  },

  /** Onda de Choque: pancada no chão — anel de choque, anel de poeira, rachadura de pedra e lascas. */
  shockwave: {
    /** instante do impacto (s). Igual ao SHOCKWAVE_IMPACT do GameView (que adia a reação dos inimigos; não exportado). */
    impactAt: 0.22,
    /** antecipação: poeira e brilhos convergindo para os pés (instantes, s) */
    gatherAt: [0.04, 0.1, 0.16],
    gatherDust: 2,
    gatherSparks: 2,
    gatherRadius: 1.1,
    gatherColor: [1.4, 1.8, 2.0],
    gatherDustColor: [0.45, 0.4, 0.34],
    /** anel de choque (frente, claro); tamanhos em lado de decalque: o fim é o raio × frontEnd */
    frontColor: [0.8, 1.05, 1.15],
    frontSize: 0.6,
    frontEnd: 2.2,
    frontLife: 0.5,
    /** anel de poeira (rastro, mistura normal, escuro) que vem atrás do choque */
    dustRingColor: [0.55, 0.47, 0.38],
    dustRingSize: 0.4,
    dustRingEnd: 2.0,
    dustRingLife: 0.75,
    /** rachadura de pedra no chão (decalque escuro que fica um tempo) */
    crackScale: 0.7,
    crackLife: 1.6,
    crackOpacity: 0.4,
    /** poeira saindo em anel (velocidade = raio × dustSpeed) */
    dustBurst: 14,
    dustSpeed: 2.0,
    dustColor: [0.45, 0.4, 0.34],
    dustLife: 0.9,
    /** lascas de pedra (faíscas quentes que caem) */
    rubble: 10,
    rubbleSpeed: 2.2,
    rubbleLift: 2.4,
    rubbleColor: [1.2, 0.9, 0.6],
    rubbleColorEnd: [0.4, 0.22, 0.08],
    /** poeira assentando depois do impacto (instantes após o impacto, s) */
    settleAt: [0.2, 0.42],
    settleDust: 3,
    /** tremor, aberração e congelamento do impacto (choque forte) */
    shake: 0.2,
    kick: 0.16,
    aberrate: 0.004,
    hitStop: 0.06,
    /** duração total do efeito (s) */
    life: 1.0,
    /** Aura de espectro durante o golpe (s), igual ao caso padrão do GameView */
    spectre: 0.8,
  },

  /** Fúria: rajada de chamas, círculo de runas que segue o guerreiro e chamas em espiral subindo em volta do corpo. */
  fury: {
    /** rajada inicial: chamas nos pés, anel vermelho e flash no peito */
    burstFire: 14,
    burstLift: 2.2,
    ringColor: [2.4, 0.7, 0.25],
    ringSize: 0.4,
    ringEnd: 2.2,
    ringLife: 0.35,
    flashColor: [3.0, 0.8, 0.3],
    flashSize: 1.6,
    flashLife: 0.22,
    /** chamas em espiral: taxa por segundo, raio em volta dos pés, subida e vida */
    flamesPerSec: 32,
    flameRadius: 0.55,
    flameRise: 1.9,
    flameLife: 0.5,
    flameSize: 0.22,
    flameSizeEnd: 0.06,
    flameColor: [3.0, 0.8, 0.3],
    flameColorEnd: [0.6, 0.05, 0.02],
    /** velocidade de giro da espiral (rad/s) */
    spiralSpeed: 4.0,
    /** círculo de runas no chão, seguindo o guerreiro enquanto a Fúria dura */
    runeSize: 1.7,
    runeColor: [2.0, 0.6, 0.2],
    runeOpacity: 0.9,
    runeSpin: 0.6,
    runeFadeIn: 0.25,
    runeFadeOut: 0.5,
    /** tempo extra depois do fim da Fúria para o efeito encerrar (s) */
    tail: 0.3,
    shake: 0.05,
    kick: 0.08,
    /** texto flutuante "FÚRIA!" sobre a cabeça (o GameView desenha o texto pelo despachante) */
    floatSize: 0.4,
    floatLife: 1.2,
    floatHeight: 2.3,
    floatColor: '#ff5a3a',
  },

  /** Provocar: pulso de desafio no chão, dois clarões de grito na cabeça, puxão de brilhos e marca em cada alvo. */
  taunt: {
    /** pulso do desafio (anel de chão, vermelho-alaranjado) */
    ring1Color: [1.1, 0.45, 0.22],
    ring1Size: 0.6,
    ring1EndScale: 1.7,
    ring1Life: 0.6,
    /** eco do pulso, mais tarde e mais fraco (s) */
    ring2Delay: 0.14,
    ring2Color: [0.8, 0.35, 0.18],
    ring2Size: 0.5,
    ring2EndScale: 1.2,
    ring2Life: 0.5,
    /** grito: dois clarões (billboards) na altura da cabeça, que crescem e somem */
    roarColor: [1.2, 0.5, 0.22],
    roarHeight: 2.5,
    roarSize0: 0.5,
    roarSize1: 1.3,
    roarLife: 0.45,
    roarDelay: 0.12,
    /** partículas que convergem para o peito do guerreiro (puxão de atenção) */
    pullCount: 14,
    pullLife: 0.45,
    pullSize: 0.1,
    pullSizeEnd: 0.03,
    pullColor: [2.2, 0.5, 0.25],
    pullColorEnd: [0.5, 0.05, 0.02],
    /** clarão de peito no início (flash) */
    flashColor: [2.8, 0.9, 0.4],
    flashSize: 1.2,
    flashLife: 0.2,
    /** marca de provocação em cada alvo puxado: halo vermelho sobre a cabeça (segue o alvo), clarão e anel no chão */
    markColor: [2.2, 0.35, 0.2],
    markHeight: 2.0,
    markSize: 0.6,
    markLife: 0.5,
    markFlashSize: 0.7,
    markFlashLife: 0.2,
    markRingSize: 0.3,
    markRingEnd: 0.9,
    markRingLife: 0.3,
    shake: 0.07,
    /** texto flutuante "Provocar!" sobre a cabeça (mesmo texto e cor do caso padrão do GameView) */
    floatSize: 0.32,
    floatHeight: 2.2,
    floatColor: '#ff7a5a',
    /** duração total do efeito (s) */
    life: 0.9,
  },

  /** Muralha: em cada bloco, pedras saindo do chão pela borda, poeira e anel de poeira. O bloco em si é do ObjectView. */
  wall: {
    /** pedras por bloco e atraso entre elas (s) */
    slabs: 3,
    slabStagger: 0.03,
    /** tamanho das pedras (w, h, d) — faixas de sorteio */
    slabW: [0.2, 0.32],
    slabH: [0.14, 0.24],
    slabD: [0.14, 0.24],
    /** altura final (centro da pedra acima do chão) — faixa de sorteio */
    slabTop: [0.12, 0.3],
    /** distância do centro do bloco até a borda onde as pedras saem (lado do bloco) */
    edge: 0.42,
    /** tempo de subida, pausa no topo e tempo de encolher/afundar (s) */
    slabRise: 0.3,
    slabHold: 0.15,
    slabShrink: 0.2,
    slabColor: [0.55, 0.46, 0.36],
    /** poeira na base e anel de poeira */
    dust: 5,
    dustColor: [0.5, 0.45, 0.38],
    ringColor: [0.5, 0.42, 0.32],
    ringSize: 0.3,
    ringEnd: 1.0,
    ringLife: 0.5,
    /** duração total do efeito (s) */
    life: 0.7,
  },

  /** Duração de cada demonstração na vitrine de efeitos (s): só para o botão de tempo da vitrine. */
  demo: {
    bash: 0.9,
    cleave: 1.0,
    shockwave: 1.2,
    fury: 5.4,
    taunt: 1.2,
    wall: 1.0,
  },
} as const;
