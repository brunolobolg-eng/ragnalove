/**
 * Visual de combate do Mago (Cléria): ataque básico (Raio Gélido) e habilidades.
 * Só apresentação: nenhum número aqui muda dano, recarga, alcance ou alvo (isso é da simulação).
 * Unidades: tempo em segundos; distância em unidades do mundo (1 tile = 1 unidade);
 * cor em RGB linear (valores acima de 1 são brilho HDR e ficam só nos núcleos).
 * Nomes: "...Start" = tamanho inicial absoluto; "...Fade" = fração da vida em que a marca apaga;
 * "...Gain" = multiplicador da cor; "...Alpha" = opacidade.
 */
export const MAGE_FX = {
  /** Altura do solo das marcas no chão (evita que as decalques afundem no piso). */
  groundLift: 0.03,
  /** Comprimento mínimo de um sprite alongado (evita escala zero). */
  minLength: 0.001,
  /** Ritmo da simulação: 10 ticks por segundo (converte ticks do evento em segundos). */
  ticksPerSecond: 10,
  /** Ordem de desenho dos sprites aditivos (acima das fitas e do chão). */
  renderOrder: { additive: 9 },
  /** Decalques: entrada e saída padrão dos anéis (entrada em segundos; saída em fração da vida). */
  decal: { ringFadeIn: 0.01, ringFadeOut: 0.6 },

  /** Altura de referência do corpo, para ancorar os efeitos (unidades do mundo). */
  body: {
    /** peito: onde o escudo, as partículas e o raio de cura miram */
    chest: 1.0,
    /** cabeça: onde a graça da Bênção cai */
    head: 1.9,
    /** altura da mão do cajado quando o osso não existe (fallback) */
    staff: 1.2,
  },

  color: {
    /** gelo: núcleo quase branco, meio ciano, fundo azul-profundo */
    iceCore: [1.8, 2.8, 3.4],
    iceMid: [0.45, 1.25, 2.3],
    iceDeep: [0.1, 0.35, 0.9],
    iceWhite: [1, 1, 1],
    /** névoa fria (fumaça clara) */
    mist: [0.7, 0.88, 1.0],
    /** sagrado: núcleo branco-quente e ouro suave (nada de amarelo chapado: o traje escuro vira amarelo) */
    holyCore: [2.5, 2.4, 2.1],
    holyGold: [1.35, 1.05, 0.55],
    holyEnd: [0.5, 0.36, 0.14],
    /** escudo: azul-branco e azul mais fundo */
    shield: [1.1, 1.6, 2.6],
    shieldDeep: [0.2, 0.4, 1.0],
    /** cor da cúpula: sem HDR no miolo (o brilho vem da borda), para não estourar a arena */
    domeTint: [0.45, 0.72, 1.15],
    /** raio: núcleo branco-violeta, halo violeta, fundo violeta-escuro */
    boltCore: [2.6, 2.4, 3.4],
    boltGlow: [0.9, 0.4, 1.9],
    boltDeep: [0.35, 0.12, 0.9],
    /** marca de queimado do raio */
    scorch: [0.6, 0.55, 0.8],
    /** julgamento: branco frio e ouro-claro */
    judgeCore: [2.7, 2.7, 2.6],
    judgeGold: [1.3, 1.15, 0.8],
    /** poeira do impacto do Julgamento (fumaça de cor neutra) */
    dust: [0.62, 0.58, 0.5],
    /** contraste: anel escuro por baixo dos anéis claros (mistura normal) */
    darkRing: [0.05, 0.05, 0.08],
    /** luzes de cenário (FlickerLight), em hexadecimal: frias ou brancas, nunca amarelas */
    lightIce: 0x9fdcff,
    lightHoly: 0xf0f4ff,
    lightBolt: 0xc8b8ff,
  },

  /** Cúpula do Escudo Sagrado (sombreador): segmentos da esfera e parâmetros do brilho. */
  dome: {
    segments: 24,
    rings: 16,
    /** expoente e ganho da borda (fresnel) */
    rimPow: 2.2,
    /** faixas de energia que sobem pela cúpula: frequência e velocidade */
    bandFreq: 11,
    bandSpeed: 5,
    /** opacidade do miolo, da borda e das faixas */
    baseAlpha: 0.03,
    rimAlpha: 0.55,
    bandAlpha: 0.2,
    /** ganho do núcleo de cor, da borda e do flash do estouro (baixos: a cúpula não pode cobrir a arena) */
    coreGain: 0.22,
    rimGain: 0.9,
    flashGain: 0.3,
  },

  /** Textos flutuantes que acompanham cada habilidade (mesmas cores e tamanhos de antes). */
  float: {
    shieldColor: '#9ac8ff',
    holyColor: '#ffe08a',
    shieldSize: 0.26,
    sanctuarySize: 0.3,
    blessingSize: 0.32,
    /** alturas dos textos acima do solo */
    shieldHeight: 1.9,
    sanctuaryHeight: 1.6,
    blessingHeight: 2.0,
  },

  /** Quando o GameView desenha o fiapo do espectro do conjurador (s), por habilidade. */
  spectre: { bolt: 0.5, blessing: 0.7, nova: 0.7, storm: 0.8 },

  /**
   * Raio Gélido (ataque básico). O voo dura exatamente FrostBoltFX.impactDelay: o acerto cai
   * no mesmo instante em que o GameView adia a reação do alvo.
   */
  bolt: {
    /** altura do alvo onde o orbe acerta (igual ao GameView) */
    targetLift: 0.6,
    /** nascimento do orbe na ponta do cajado (s): cresce antes de sair */
    birth: 0.05,
    birthFrom: 0.3,
    /** tamanho do orbe e do halo de gelo (unidades) */
    orb: 0.42,
    halo: 0.8,
    haloAlpha: 0.7,
    /** giro do orbe e do halo (rad/s) */
    spin: 14,
    haloSpinRatio: 0.5,
    /** fita de rastro ciano: largura e vida (s) */
    trailWidth: 0.12,
    trailLife: 0.16,
    /** cristais que se soltam do rastro: partículas por quadro, vida, tamanho e física */
    flakes: 1,
    flakeLife: 0.3,
    flakeSize: 0.08,
    flakeSizeEnd: 0.01,
    flakeVelY: -0.2,
    flakeVelJitter: 0.5,
    flakeGravity: 0.6,
    flakeDrag: 1.5,
    flakePosJitter: 0.05,
    /** tempo que o orbe leva para apagar depois de chegar (s) */
    linger: 0.12,
    /** impacto: estrela de gelo, anel no chão, estilhaços e flash discreto */
    starSize: 0.7,
    starLife: 0.16,
    starGrow0: 0.7,
    starGrow1: 0.5,
    shards: 6,
    shardVelY: 0.6,
    shardSpeed: 2.6,
    shardLife: 0.3,
    shardSize: 0.1,
    shardSizeEnd: 0.01,
    shardDrag: 2.5,
    ringStart: 0.25,
    ringSize: 0.9,
    ringGain: 0.8,
    ringLife: 0.22,
    ringFadeOut: 0.7,
    flashSize: 0.7,
    flashLife: 0.12,
    /** tremor mínimo: é o ataque básico, não pode competir com as habilidades */
    shake: 0.02,
  },

  /** Cura Divina: fita de luz do cajado ao aliado, coluna de luz nascendo dos pés dele e partículas que sobem. */
  heal: {
    /** a coluna nasce logo depois da fita (s) */
    columnAt: 0.08,
    /** fita de luz: ganho, largura, vida e tempo em que ela se estende do cajado ao peito do aliado */
    tetherGain: 0.8,
    tetherWidth: 0.08,
    tetherLife: 0.3,
    tetherTime: 0.14,
    /** coluna dourada externa e núcleo branco (ganho, largura, altura e vida) */
    outerGain: 0.5,
    outerWidth: 0.7,
    outerHeight: 2.4,
    outerLife: 0.9,
    coreGain: 0.7,
    coreWidth: 0.22,
    coreHeight: 2.2,
    coreLife: 0.7,
    /** anel no chão */
    ringStart: 0.3,
    ringSize: 1.4,
    ringLife: 0.5,
    /** flash no peito */
    flashSize: 1.1,
    flashLife: 0.2,
    /** partículas que sobem: por quadro, duração da emissão, dispersão, subida e vida (s) */
    moteRate: 2,
    moteTime: 0.4,
    moteSpread: 0.35,
    moteRise: 1.3,
    moteRiseJitter: 0.3,
    moteLife: 0.8,
    moteSize: 0.12,
    moteSizeEnd: 0.03,
    /** duração total (s) */
    life: 1.0,
  },

  /** Escudo Sagrado: partículas convergem ao peito, anel no chão, cúpula que cresce, estoura e apaga. */
  holyShield: {
    /** convergência das partículas (s), quantas por quadro, raio de origem e tamanhos */
    gatherTime: 0.2,
    gatherRate: 2,
    gatherRadius: 1.4,
    gatherSize: 0.14,
    gatherSizeEnd: 0.03,
    /** anel no chão ao começar */
    ringStart: 0.5,
    ringSize: 1.6,
    ringLife: 0.5,
    /** cúpula: raio final (unidades), fração inicial, instante em que cresce, tempo de crescer e de aparecer */
    domeRadius: 0.95,
    domeMin: 0.15,
    domeAt: 0.12,
    domeGrow: 0.25,
    domeFadeIn: 0.12,
    /** opacidade máxima da cúpula */
    domeAlpha: 0.55,
    /** instante do estouro (s) e o flash que ele solta */
    popAt: 0.3,
    popFlashSize: 1.2,
    popFlashLife: 0.2,
    /** faíscas do estouro: dispersão, subida, velocidade, vida, tamanhos, arrasto e quantidade */
    popJitter: 0.1,
    popRiseY: 0.4,
    popSpeed: 2.2,
    popSparkLife: 0.4,
    popSparkSize: 0.12,
    popSparkSizeEnd: 0.02,
    popDrag: 2,
    popSparks: 6,
    /** anel pequeno do estouro */
    popRingStart: 0.3,
    popRingSize: 1.1,
    popRingGain: 0.8,
    popRingLife: 0.25,
    /** tempo de flash da cúpula depois do estouro (s) */
    flashTime: 0.2,
    /** a cúpula apaga entre fadeAt e fadeAt + fadeTime (s) */
    fadeAt: 0.45,
    fadeTime: 0.8,
    /** duração total (s) */
    life: 1.3,
  },

  /**
   * Santuário: a coluna marca o centro, um anel desenha a área, depois as runas ficam no chão
   * pelo tempo do Santuário (ticks / 10) com partículas subindo e pulsos de anel.
   */
  sanctuary: {
    /** coluna de luz do centro */
    columnGain: 0.8,
    columnWidth: 0.7,
    columnHeight: 2.6,
    columnLife: 0.7,
    /** anel que desenha a área: tamanho inicial, fator do tamanho final (lado da área), ganho e vida (s) */
    drawStart: 0.3,
    drawScale: 1.1,
    drawGain: 0.9,
    drawLife: 0.5,
    /** instante em que as runas aparecem (s) e o tamanho delas (lado da área) */
    runeAt: 0.3,
    runeScale: 1.05,
    runeSpin: 0.15,
    /** tempo de aparecer e de apagar das runas (s) */
    runeFadeIn: 0.3,
    runeFadeOut: 0.6,
    /** halo difuso sob as runas */
    glowScale: 1.25,
    glowGain: 0.5,
    /** partículas que sobem dentro da área: intervalo (s), quantas por emissão, dispersão (fração do lado), subida e vida */
    moteEvery: 0.1,
    moteCount: 2,
    moteSpread: 0.95,
    moteRise: 0.8,
    moteJitter: 0.05,
    moteLife: 1.1,
    moteSize: 0.13,
    moteSizeEnd: 0.03,
    /** pulso: anel que se abre a cada intervalo (s) (início e fim: fração do lado da área) */
    pulseEvery: 1.6,
    pulseStart: 0.5,
    pulseEnd: 1.05,
    pulseGain: 0.6,
    pulseLife: 0.7,
    /** tempo extra depois de acabar o santuário (s) */
    tail: 0.5,
  },

  /**
   * Bênção: anel dourado no conjurador que alcança o aliado mais longe; em cada aliado, uma
   * estrela de luz, um giro dourado e graça caindo do alto; depois uma aura leve.
   */
  blessing: {
    /** duração total (s) */
    life: 2.4,
    /** raio mínimo (tiles) e folga além do aliado mais longe para o anel do conjurador */
    minReach: 2.5,
    reachPad: 0.8,
    /** anel no conjurador: tamanho inicial absoluto, ganho e vida (s) */
    casterRingStart: 0.4,
    ringGain: 0.9,
    ringLife: 0.6,
    /** anel no chão de cada aliado: tamanho inicial (absoluto), final e vida (s) */
    ringStart: 0.3,
    ringSize: 1.3,
    groundRingLife: 0.5,
    /** instante do disparo em cada aliado (s) */
    burstAt: 0.15,
    /** estrela de luz no peito: ganho, tamanhos inicial e final, vida (s), giro (rad/s) e opacidade */
    starGain: 0.6,
    starSize0: 0.8,
    starSize1: 1.8,
    starLife: 0.5,
    starSpin: 2.5,
    starAlpha: 0.75,
    /** giro dourado em volta do peito: ganho, tamanhos, vida, giro e opacidade */
    swirlGain: 0.9,
    swirlSize0: 0.9,
    swirlSize1: 1.5,
    swirlLife: 0.6,
    swirlSpin: 4,
    swirlAlpha: 0.9,
    /** flash pequeno no peito de cada aliado */
    flashSize: 0.9,
    flashLife: 0.16,
    /** graça que cai do alto: altura acima da cabeça, dispersão, velocidade, vida, tamanhos, aceleração e quantidade */
    graceHeight: 0.8,
    gracePosJitter: 0.5,
    graceVelY: -0.4,
    graceVelJitter: 0.3,
    graceLife: 0.8,
    graceSize: 0.12,
    graceSizeEnd: 0.03,
    graceFall: 1.4,
    graceCount: 6,
    /** aura: início (s), duração (s), intervalo (s), dispersão, subida, vida e tamanhos das partículas */
    auraAt: 0.3,
    auraTime: 2.0,
    auraEvery: 0.2,
    auraSpread: 0.6,
    auraRise: 0.7,
    auraLife: 0.8,
    auraSize: 0.1,
    auraSizeEnd: 0.02,
  },

  /**
   * Julgamento Divino: colunas de luz caem do céu sobre cada tile da cruz; o acerto (impactAt) é
   * igual ao STORM_IMPACT do GameView (0,3 s), quando os inimigos reagem. Mais pesado que o raio:
   * colunas largas, queda acelerada, anéis e poeira, tremor e pausa de impacto.
   */
  judgment: {
    /** instante do acerto (s): igual ao STORM_IMPACT do GameView */
    impactAt: 0.3,
    /** altura de onde a coluna cai (unidades), e quando começa a cair (s) */
    fallHeight: 6,
    fallStart: 0.04,
    /** comprimento da coluna (unidades), quanto tempo ela fica de pé depois do acerto (s) e a entrada dela */
    beamLength: 12,
    beamAfter: 0.25,
    beamFadeIn: 0.06,
    /** largura da coluna externa (dourada) e do núcleo (branco); ganho e opacidade da externa */
    outerWidth: 0.9,
    coreWidth: 0.32,
    outerGain: 0.75,
    coreGain: 0.55,
    outerAlpha: 0.9,
    /** aviso no chão: anel escuro (contraste) e anel dourado que se fecham até o ponto do acerto */
    sigilDarkStart: 2.1,
    sigilStart: 1.9,
    sigilSize1: 0.9,
    sigilLife: 0.42,
    sigilDarkFade: 0.5,
    sigilFade: 0.6,
    /** runa no centro da cruz: tamanho, vida (s), entrada (s), saída (fração), giro (rad/s) */
    runeSize: 2.6,
    runeLife: 1.0,
    runeFadeIn: 0.1,
    runeFadeOut: 0.5,
    runeSpin: 0.6,
    /** luz do centro: intensidade (máx. 0,3), alcance, tremulação, altura e tempo de apagar (s) */
    light: { intensity: 0.25, distance: 4, flicker: 0.2, height: 1.8, time: 0.45 },
    /** estrela de impacto no centro: tamanho, ganho, altura, vida (s), crescimento e giro */
    starSize: 1.0,
    starGain: 0.3,
    starHeight: 1.0,
    starLife: 0.3,
    starGrow0: 0.8,
    starGrow1: 0.4,
    starSpin: 2.5,
    /** anéis de choque por tile: tamanho inicial, final, vida (s) e saída (fração) */
    ringStart: 0.5,
    ringSize: 2.0,
    ringLife: 0.5,
    ringFadeOut: 0.7,
    /** anel do centro da cruz: tamanho inicial, final, ganho, vida (s) e saída (fração) */
    centerRingStart: 0.6,
    centerRingSize: 3.0,
    centerRingGain: 0.6,
    centerRingLife: 0.6,
    centerRingFade: 0.6,
    /** flashes por tile e no centro (tamanho e vida, s) */
    flashSize: 0.6,
    flashLife: 0.16,
    strikeLift: 0.4,
    centerFlashSize: 1.2,
    centerFlashLife: 0.22,
    /** faíscas por tile: altura de saída, velocidade, dispersão, vida, tamanhos, gravidade, arrasto e quantidade */
    sparkLift: 0.3,
    sparkSpeed: 1.0,
    sparkJitter: 3.2,
    sparkLife: 0.55,
    sparkSize: 0.14,
    sparkSizeEnd: 0.03,
    sparkGravity: 9,
    sparkDrag: 1.0,
    sparks: 8,
    /** poeira por tile: altura, dispersão, subida, dispersão de velocidade, vida, tamanhos, opacidade, giro e quantidade */
    dustLift: 0.3,
    dustPosJitter: 0.4,
    dustRise: 0.5,
    dustJitter: 0.5,
    dustLife: 0.9,
    dustSize: 0.4,
    dustSizeEnd: 0.9,
    dustAlpha: 0.35,
    dustSpin: 0.8,
    dust: 3,
    /** partículas que sobem depois do acerto: intervalo (s), tempo de emissão (s), dispersão, subida, vida e tamanhos */
    moteEvery: 0.05,
    moteTime: 0.5,
    moteSpread: 0.4,
    moteRise: 1.6,
    moteJitter: 0.3,
    moteLife: 0.9,
    moteSize: 0.12,
    moteSizeEnd: 0.03,
    /** tremor, empurrão de câmera, aberração e pausa de impacto */
    shake: 0.22,
    kick: 0.22,
    aberrate: 0.005,
    hitStop: 0.06,
    /** duração total (s) */
    life: 1.25,
  },

  /**
   * Tempestade Elétrica: raios em zigue-zague do céu até cada tile, com re-sorteio do caminho
   * (cintilação) e impacto com flash, faíscas e marca no chão. O impacto é o STORM_IMPACT do GameView.
   */
  thunderstorm: {
    /** instante do impacto (s): igual ao STORM_IMPACT do GameView */
    impactAt: 0.3,
    /** altura do céu (unidades) e desvio horizontal aleatório do ponto de origem */
    skyHeight: 7,
    skyJitter: 0.8,
    /** segmentos do raio e desvio lateral de cada ponto */
    segments: 7,
    jitter: 0.45,
    /** cada segmento é um pouco mais longo que o trecho, para se sobrepor (as pontas da textura são macias) */
    segmentStretch: 1.3,
    /** largura do núcleo branco e do halo violeta (unidades) e opacidade do halo */
    coreWidth: 0.08,
    glowWidth: 0.34,
    glowAlpha: 0.8,
    /** instantes (s) em que o caminho é sorteado de novo (cintilação) */
    flickers: [0.12, 0.18, 0.24],
    /** cintilação extra depois do impacto: instante (s), brilho do quadro e tempo de queda do brilho (s) */
    afterFlicker: 0.36,
    afterAlpha: 0.5,
    flickerDecay: 0.06,
    /** quanto o brilho cai logo depois de cada sorteio (fração) */
    flickerDrop: 0.6,
    /** apagar do raio: começa em fadeAt e leva fadeTime (s) */
    fadeAt: 0.42,
    fadeTime: 0.12,
    /** aviso: tempo de carga (s), brilho na nuvem (tamanho, ganho e opacidade) */
    chargeTime: 0.12,
    chargeSize: 0.9,
    chargeGain: 0.9,
    chargeAlpha: 0.8,
    /** aviso no chão: anel violeta (tamanho inicial, final e vida, s) */
    warnRingStart: 0.25,
    warnRingSize: 0.9,
    warnRingLife: 0.3,
    /** flash no impacto (altura, tamanho e vida, s) */
    flashLift: 0.4,
    flashSize: 0.5,
    flashLife: 0.16,
    /** cor do flash do impacto: violeta (o núcleo branco fica só no raio) */
    flashGain: 0.6,
    /** anel de impacto: tamanho inicial, final, vida (s) e saída (fração) */
    impactRingStart: 0.3,
    impactRingSize: 2.0,
    impactRingLife: 0.35,
    impactRingFade: 0.7,
    /** faíscas do impacto: altura, velocidade, dispersão de velocidade, vida, tamanhos, gravidade e quantidade */
    sparkLift: 0.2,
    sparkSpeed: 2.4,
    sparkJitter: 3.2,
    sparkLife: 0.45,
    sparkSize: 0.12,
    sparkSizeEnd: 0.02,
    sparkGravity: 6,
    sparks: 10,
    /** marca de queimado no chão (só com decalques ligados): tamanho, vida, entrada e saída, opacidade */
    scorchSize: 1.0,
    scorchLife: 2.5,
    scorchFadeIn: 0.02,
    scorchFadeOut: 0.3,
    scorchOpacity: 0.7,
    /** tremor e aberração no impacto (um só por habilidade) */
    shake: 0.06,
    aberrate: 0.003,
    /** luz violeta do impacto: intensidade (máx. 0,3), alcance, tremulação, altura e tempo de apagar (s) */
    light: { intensity: 0.2, distance: 3.2, flicker: 0.5, height: 1.4, time: 0.35 },
    /** duração total (s) */
    life: 0.7,
  },

  /**
   * Nova Congelante: cristais se juntam ao peito, runa no chão; no acerto uma onda de gelo
   * varre o raio (NOVA_IMPACT do GameView, 0,25 s), pontas de gelo brotam no anel interno e a névoa fica rente ao chão.
   */
  frostNova: {
    /** duração total (s) */
    life: 1.15,
    /** cristais que se juntam ao peito antes da onda: quantidade, raio de órbita, tamanho, opacidade, giro e encolhimento */
    gatherTime: 0.1,
    crystals: 5,
    crystalOrbit: 0.9,
    crystalSize: 0.36,
    crystalAlpha: 0.9,
    crystalSpin: 12,
    crystalShrink: 0.5,
    /** runa de gelo no chão: tamanho por tile de raio, vida (s), entrada (s), saída (fração) e giro (rad/s) */
    runeScale: 2.3,
    runeGain: 0.55,
    runeLife: 0.55,
    runeFadeIn: 0.05,
    runeFadeOut: 0.5,
    runeSpin: -2.5,
    /** instante da onda e do acerto (s) */
    waveAt: 0.1,
    impactAt: 0.25,
    /** anel de onda: tamanho por tile de raio, tamanho inicial absoluto, vida (s), ganho e saídas (fração) */
    waveScale: 2.9,
    waveStart: 0.6,
    waveLife: 0.16,
    waveGain: 0.45,
    waveFade: 0.5,
    waveDarkFade: 0.5,
    /** estilhaços que voam até a borda no acerto: quantidade, tamanhos */
    shards: 14,
    shardSize: 0.1,
    shardSizeEnd: 0.02,
    /** pontas de gelo: quantidade, raio relativo, altura mín./máx. (tiles), dispersão angular (rad), largura e lados do cone */
    spikes: 12,
    spikeRadius: 0.8,
    spikeMin: 0.7,
    spikeMax: 1.05,
    spikeJitter: 0.2,
    spikeWidth: 0.14,
    spikeSides: 5,
    /** brotar (instante e duração da subida), afundar (instante, duração e fração afundada) e opacidade */
    spikeAt: 0.12,
    spikeRise: 0.14,
    sinkAt: 0.7,
    sinkTime: 0.5,
    spikeSink: 0.85,
    spikeOpacity: 0.85,
    spikeGain: 0.9,
    /** névoa rente ao chão: partículas por quadro, instantes (s), fração de raio mínimo, velocidade, vida, tamanhos, opacidade e giro */
    mistRate: 3,
    mistFrom: 0.12,
    mistTo: 0.4,
    mistInner: 0.5,
    mistSpeed: 0.6,
    mistLife: 1.4,
    mistSize0: 0.5,
    mistSize1: 1.5,
    mistAlpha: 0.3,
    mistSpin: 1.0,
    /** flash no peito no acerto */
    flashSize: 0.9,
    flashLife: 0.2,
    /** gelo no chão depois do acerto: tamanho por tile de raio, vida (s), entrada, saída (fração) e opacidade */
    frostScale: 1.6,
    frostGain: 0.6,
    frostLife: 3.2,
    frostFadeIn: 0.05,
    frostFadeOut: 0.4,
    frostOpacity: 0.45,
    /** luz azul-gelo no chão: intensidade (máx. 0,3), alcance, tremulação, altura e tempo de apagar (s) */
    light: { intensity: 0.2, distance: 2.6, flicker: 0.15, height: 0.15, time: 0.3 },
    /** tremor e empurrão de câmera no acerto */
    shake: 0.08,
    kick: 0.08,
  },
} as const;
