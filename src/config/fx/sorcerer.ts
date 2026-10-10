/**
 * Visual de combate da Feiticeira (arcana): Orbe Arcano (ataque básico), Meteoro e Corrente Elétrica.
 * Só apresentação: nenhum número aqui muda dano, recarga, alcance ou alvo (isso é da simulação).
 * Unidades: tempo em segundos; distância em unidades do mundo (1 tile = 1 unidade);
 * cor em RGB linear (valores acima de 1 são brilho HDR e ficam só nos núcleos pequenos).
 * Identidade: magenta arcano (núcleo rosa-branco, corpo magenta, fundo violeta-escuro) com acento
 * esmeralda-azulado. Não usa gelo (Mago), nem violeta-elétrico (Mago), nem dourado (Clériga).
 * Nomes: "...Start" = tamanho inicial absoluto; "...Fade" = fração da vida em que a marca apaga;
 * "...Gain" = multiplicador da cor; "...Alpha" = opacidade.
 */
export const SORCERER_FX = {
  /** Altura do solo das marcas no chão (evita que os decalques afundem no piso). */
  groundLift: 0.03,
  /** Comprimento mínimo de um sprite alongado (evita escala zero). */
  minLength: 0.001,
  /** Decalques: entrada e saída padrão dos anéis (entrada em segundos; saída em fração da vida). */
  decal: { ringFadeIn: 0.01, ringFadeOut: 0.6 },
  /**
   * Lado do decalque por raio visual: o desenho do círculo rúnico fica a ~0,45 do lado, então um
   * decalque de lado 2,2 × R desenha um círculo de raio ~R.
   */
  decalPerRadius: 2.2,

  /** Alturas de referência do corpo, para ancorar os efeitos (unidades do mundo). */
  body: {
    /** peito: de onde a corrente nasce quando o cajado não existe */
    chest: 1.0,
    /** altura da ponta do cajado quando o osso não existe (igual ao GameView) */
    staff: 1.2,
    /** altura de mira do orbe no alvo (igual ao GameView: o impacto cai aqui) */
    targetLift: 0.6,
    /** altura de mira dos elos da corrente no alvo */
    linkLift: 0.9,
  },

  color: {
    /** magenta arcano: núcleo rosa-branco, corpo magenta, fundo violeta-escuro */
    arcaneCore: [2.4, 1.5, 2.3],
    arcaneBody: [1.4, 0.3, 1.0],
    arcaneDeep: [0.3, 0.04, 0.25],
    /** acento esmeralda-azulado: menos azul que o gelo do Mago, para não confundir */
    tealCore: [0.9, 2.1, 1.7],
    tealBody: [0.2, 1.0, 0.8],
    /** partículas que flutuam: rosa-branco desvanecendo em rosa escuro */
    mote: [1.8, 1.0, 2.0],
    moteEnd: [0.5, 0.1, 0.45],
    /** marca escura do cráter (mistura normal, sem brilho) */
    crater: [0.22, 0.08, 0.2],
    /** luzes de cenário (FlickerLight), em hexadecimal: rosa-magenta e esmeralda, nunca amarelas */
    lightArcane: 0xff7ad8,
    lightTeal: 0x8fffd6,
  },

  /** Quando o GameView desenha o fiapo do espectro do conjurador (s), por ação. */
  spectre: { bolt: 0.5, storm: 0.8, cast: 0.85 },

  /**
   * Orbe Arcano (ataque básico). O voo termina exatamente em FrostBoltFX.impactDelay: o acerto cai no
   * mesmo instante em que o GameView adia a reação do alvo. Sem luz própria: é o ataque básico.
   */
  orb: {
    /** carga na ponta do cajado (s): o crescente gira e os motes se juntam */
    chargeTime: 0.1,
    chargeStart: 0.12,
    chargeSize: 0.34,
    chargeSpin: 10,
    /** motes da carga: raio de onde nascem e velocidade com que entram na ponta do cajado */
    chargeSpread: 0.5,
    chargeInflow: 3,
    /** nascimento do orbe: tamanho inicial relativo (fração do tamanho cheio) e tempo de crescer (s) */
    birthFrom: 0.3,
    birth: 0.05,
    /** orbe rosa-branco, halo magenta e giro (unidades e rad/s) */
    orb: 0.4,
    orbSpin: 12,
    halo: 0.55,
    haloAlpha: 0.4,
    haloSpinRatio: 0.5,
    /** dois satélites teal orbitando o orbe, por fora do núcleo: raio da órbita, tamanho, velocidade (rad/s) */
    satellites: 2,
    satRadius: 0.36,
    satSize: 0.14,
    satSpeed: 9,
    /** fita de rastro magenta: largura e vida (s) */
    trailWidth: 0.1,
    trailLife: 0.16,
    /** motes que sobem do rastro: por quadro, vida, tamanhos, subida e posição */
    moteRate: 1,
    moteLife: 0.35,
    moteSize: 0.09,
    moteSizeEnd: 0.01,
    moteRise: 0.35,
    moteJitter: 0.05,
    /** tempo que o orbe leva para apagar depois de chegar (s) */
    linger: 0.12,
    /** impacto: estrela rosa-branca, anel magenta no chão, faíscas e flash discreto */
    starSize: 0.45,
    starLife: 0.18,
    starGrow0: 0.7,
    starGrow1: 0.5,
    shards: 6,
    shardSpeed: 1.8,
    shardRise: 0.5,
    shardLife: 0.3,
    shardSize: 0.08,
    shardSizeEnd: 0.01,
    shardDrag: 2.5,
    ringStart: 0.2,
    ringSize: 0.8,
    ringGain: 0.7,
    ringLife: 0.26,
    ringFadeOut: 0.7,
    /** flash magenta (não branco) no acerto: ganho da cor e tamanho; vida (s) */
    flashGain: 0.8,
    flashSize: 0.55,
    flashLife: 0.12,
    /** tremor mínimo: é o ataque básico, não pode competir com as habilidades */
    shake: 0.02,
  },

  /**
   * Meteoro (3×3 de raio 1 no alvo). Antecipação: círculo rúnico no chão que cresce; o meteoro aparece
   * no céu e cai acelerando (rastro em traço, fita e motes); no impacto (impactAt, igual ao atraso que o
   * GameView deve usar para os inimigos) há onda, anel teal, cratera e faíscas; depois motes sobem e a
   * runa fica até apagar.
   */
  meteor: {
    /** instante do acerto (s): é quando os inimigos atingidos devem reagir */
    impactAt: 0.55,
    /** instante em que o meteoro aparece no céu (s) e altura de onde cai (unidades) */
    skyAt: 0.1,
    skyHeight: 5.5,
    /** deslocamento do ponto de origem no céu (de onde ele vem, em tiles): fica dentro do enquadramento da câmera */
    skyOffsetX: 1.0,
    skyOffsetZ: -0.7,
    /** altura da cabeça quando toca o chão (unidades) */
    headGround: 0.6,
    /** cabeça: tamanho (unidades) e tamanho do halo magenta, com opacidade */
    headSize: 0.7,
    haloSize: 1.5,
    haloAlpha: 0.6,
    /** rastro em traço atrás da cabeça: largura e comprimento (unidades), opacidade */
    streakWidth: 0.3,
    streakLength: 2.0,
    streakAlpha: 0.85,
    /** fita de rastro magenta: largura e vida (s) */
    ribbonWidth: 0.28,
    ribbonLife: 0.3,
    /** motes que o meteoro solta: por quadro, vida, tamanhos e subida (negativa = flutuam para o alto) */
    moteRate: 2,
    moteLife: 0.5,
    moteSize: 0.14,
    moteSizeEnd: 0.03,
    /** dispersão dos motes do rastro (unidades) */
    moteJitter: 0.15,
    /** cabeça: giro (rad/s), entrada (s) e saída depois do impacto (s) */
    headSpin: 6,
    headFadeIn: 0.05,
    headFadeOut: 0.12,
    /** runa no chão: tamanho inicial (fração do lado final), ganho, vida (s), entrada, saída (fração), giro (rad/s) */
    runeStart: 0.55,
    runeGain: 0.7,
    runeLife: 1.6,
    runeFadeIn: 0.06,
    runeFadeOut: 0.5,
    runeSpin: 0.7,
    /** brilho esmeralda no centro da área, que aparece junto com a runa (tamanho em fração do lado, ganho, vida e opacidade) */
    centerGlowSize: 0.6,
    centerGlowGain: 0.5,
    centerGlowLife: 0.9,
    centerGlowAlpha: 0.7,
    centerGlowFadeIn: 0.1,
    centerGlowFadeOut: 0.6,
    /** flash no impacto: ganho (cor magenta), tamanho e vida (s) */
    flashGain: 0.35,
    flashSize: 1.6,
    flashLife: 0.22,
    /** onda magenta: tamanho inicial e final (fração do lado final da área), ganho, vida (s) e saída (fração) */
    waveStart: 0.6,
    waveEnd: 1.25,
    waveGain: 0.5,
    waveLife: 0.45,
    waveFade: 0.6,
    /** anel esmeralda fino (acento): tamanho inicial e final (fração), ganho, vida (s) e saída (fração) */
    accentStart: 0.4,
    accentEnd: 1.0,
    accentGain: 0.45,
    accentLife: 0.55,
    accentFade: 0.6,
    /** cratera escura: tamanho (fração do lado final), vida (s), entrada, saída (fração), opacidade e dissolução */
    craterScale: 1.0,
    craterLife: 4.0,
    craterFadeIn: 0.02,
    craterFadeOut: 0.3,
    craterOpacity: 0.85,
    /** faíscas do impacto: altura de saída (unidades), quantidade, velocidade para cima, dispersão, vida, tamanhos e gravidade */
    sparkLift: 0.3,
    sparks: 24,
    sparkSpeed: 3,
    sparkJitter: 5,
    sparkLife: 0.55,
    sparkSize: 0.12,
    sparkSizeEnd: 0.02,
    sparkGravity: 6,
    /** motes que sobem depois do impacto: quantidade total, tempo de emissão (s), vida, dispersão no chão (unidades), altura de saída, velocidade, dispersão de velocidade e tamanhos */
    riseCount: 14,
    riseTime: 0.7,
    riseLife: 1.0,
    riseSpread: 1.0,
    riseHeight: 0.2,
    riseSpeed: 1.4,
    riseJitter: 1.1,
    riseSize: 0.14,
    riseSizeEnd: 0.03,
    /** tremor, empurrão de câmera e pausa de impacto */
    shake: 0.22,
    kick: 0.12,
    hitStop: 0.05,
    /** luz magenta do impacto: intensidade (máx. 0,3), alcance, tremulação, altura e tempo de apagar (s) */
    light: { intensity: 0.28, distance: 4.5, flicker: 0.3, height: 1.2, time: 0.4 },
    /** duração das sprites do efeito (s); decalques e motes têm vida própria */
    life: 1.0,
  },

  /**
   * Corrente Elétrica (um só evento 'storm' com todos os elos): a corrente se prende a cada alvo em
   * sequência (arcos suaves com contas brilhantes, nada de zigue-zague); no instante da descarga
   * (impactAt, igual ao STORM_IMPACT do GameView) todos os alvos estouram juntos; depois os arcos apagam.
   */
  chain: {
    /** instante da descarga (s): é quando os inimigos reagem */
    impactAt: 0.3,
    /** carga na ponta do cajado (s): o crescente gira e os motes se juntam; a ligação começa depois dela */
    linkStart: 0.08,
    chargeSize: 0.3,
    chargeSpin: 12,
    /** fração inicial do tamanho da carga, quanto ela se espalha (unidades) e a velocidade com que os motes entram (unidades/s) */
    chargeStart: 0.3,
    chargeSpread: 0.6,
    chargeInflow: 4,
    chargeMoteSize: 0.1,
    chargeMoteSizeEnd: 0.02,
    /** a carga apaga em chargeFade (s) depois do início da ligação */
    chargeFade: 0.05,
    /** folga (s) antes da descarga para o último elo cair */
    linkMargin: 0.01,
    /** tempo máximo e mínimo de cada salto (s); o mínimo garante que o último elo caia antes da descarga */
    hopMax: 0.06,
    hopMin: 0.025,
    /** arco de cada salto: altura do meio do arco (unidades), segmentos por arco */
    arcHeight: 0.7,
    segments: 8,
    /** linha do arco: largura (unidades), esticamento para as pontas se sobreporem, opacidade */
    lineWidth: 0.11,
    lineStretch: 1.15,
    lineAlpha: 0.85,
    /** contas (estrelas de luz) a cada quantos segmentos, tamanho e pulso (fração do tamanho) e velocidade do pulso (rad/s) */
    beadEvery: 2,
    beadSize: 0.18,
    beadPulse: 0.2,
    beadSpeed: 14,
    /** defasagem entre as contas do pulso (rad) */
    beadPhase: 1.7,
    /** cabeça que viaja pelo arco: tamanho (unidades) */
    headSize: 0.3,
    /** depois da descarga: ganho do brilho dos arcos (cor HDR) que cai ao normal em flareTime (s) */
    flareGain: 1.2,
    flareTime: 0.15,
    /** os arcos apagam entre fadeAt e fadeAt + fadeTime (s) */
    fadeAt: 0.42,
    fadeTime: 0.4,
    /** descarga em cada alvo: flash magenta (ganho, tamanho, vida), anel magenta (inicial, final, vida, saída), runa esmeralda */
    flashGain: 0.6,
    flashSize: 0.6,
    flashLife: 0.16,
    ringStart: 0.3,
    ringSize: 1.1,
    ringGain: 0.6,
    ringLife: 0.4,
    ringFade: 0.7,
    /** runa esmeralda: tamanho inicial (fração do final), tamanho final, vida (s), entrada, saída (fração) e giro (rad/s) */
    runeStart: 0.6,
    runeSize: 1.2,
    runeGain: 0.6,
    runeLife: 0.9,
    runeFadeIn: 0.03,
    runeFadeOut: 0.5,
    runeSpin: 2.0,
    /** dispersão de posição dos motes da descarga (unidades) */
    dischargeSpread: 0.1,
    /** faíscas por alvo: quantidade, velocidade, dispersão, vida, tamanhos e gravidade */
    sparks: 8,
    sparkSpeed: 2.2,
    sparkJitter: 2.4,
    sparkLife: 0.45,
    sparkSize: 0.1,
    sparkSizeEnd: 0.02,
    sparkGravity: 5,
    /** tremor e aberração cromática na descarga */
    shake: 0.06,
    aberrate: 0.003,
    /** luz esmeralda da descarga: intensidade (máx. 0,3), alcance, tremulação, altura e tempo de apagar (s) */
    light: { intensity: 0.22, distance: 3.6, flicker: 0.35, height: 1.2, time: 0.35 },
    /** duração das sprites do efeito (s) */
    life: 0.9,
  },

  /**
   * Acerto crítico (dano com crit no Orbe ou na Corrente): anel magenta maior, flash e faíscas no alvo.
   * Só apresentação: o número de dano e o texto CRÍTICO! seguem o GameView.
   */
  crit: {
    /** duração das sprites (s) */
    life: 0.55,
    ringStart: 0.4,
    ringSize: 1.5,
    ringGain: 1.0,
    ringLife: 0.35,
    ringFade: 0.6,
    flashSize: 1.0,
    flashLife: 0.16,
    sparks: 12,
    sparkSpeed: 3,
    sparkJitter: 2.5,
    sparkLife: 0.45,
    sparkSize: 0.12,
    sparkSizeEnd: 0.02,
    sparkGravity: 4,
    /** altura do acerto (unidades), dispersão das faíscas (unidades) e tremor (pequeno: o crítico não pode competir com as habilidades) */
    hitLift: 0.9,
    sparkSpread: 0.2,
    shake: 0.03,
  },
} as const;
