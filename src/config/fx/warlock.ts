/**
 * Visual de combate da Bruxa: Dreno de Vida (ataque básico), Maldição e Enxame de Sombras.
 * Identidade: sombra violeta-preta (fumaça e runas escuras, mistura normal), ichor verde-doentio em núcleos
 * pequenos (aditivos) e almas pálidas que voltam ao conjurador. Só apresentação: nenhum número aqui muda dano,
 * alcance, recarga ou alvo (isso é da simulação).
 * Unidades: tempo em segundos; distância em unidades do mundo (1 tile = 1 unidade).
 * Cor: RGB linear (o motor converte para tela, então estes valores aparecem bem mais claros do que o número).
 * Brilho acima de 0,9 entra no bloom e tinge o traje escuro da Bruxa: por isso o verde fica abaixo disso.
 * Nomes: "...Size" = tamanho; "...SizeEnd" = tamanho final; "...Life" = duração; "...Rate" = partículas por segundo;
 * "...Jitter" = aleatoriedade na posição; "...Vel" = velocidade; "...Drag" = freio do ar; "...Fade..." = fração da vida.
 */
export const WARLOCK_FX = {
  /** Altura do solo das marcas no chão (evita que as decalques afundem no piso). */
  groundLift: 0.03,
  /** Comprimento e escala mínimos (evita escala zero). */
  minLength: 0.001,
  /** Ritmo da simulação: 10 ticks por segundo (converte ticks do evento em segundos). */
  ticksPerSecond: 10,
  /** Fade de entrada padrão das decalques (fração de 1 segundo, em segundos). */
  decalFadeIn: 0.01,

  /** Alturas de referência do corpo (unidades do mundo), para ancorar os efeitos. */
  body: {
    /** peito: onde as almas voltam e as fitas de sombra prendem */
    chest: 1.1,
    /** mão, quando o osso da mão não existe (reserva) */
    hand: 1.1,
    /** cabeça: onde sobem os textos flutuantes */
    head: 1.9,
  },

  color: {
    /** fumaça e véu violeta-preto (mistura normal): escurecem o chão e não brilham */
    shade: [0.07, 0.02, 0.1],
    /** fumaça quase preta: fim das partículas e bordas */
    shadeDeep: [0.025, 0.008, 0.035],
    /** fumaça violeta média da maldição (sobre o chão escuro precisa de mais contraste que a fumaça do dreno) */
    smokeMid: [0.12, 0.04, 0.18],
    /** tinta escura das runas (mistura normal) */
    sigil: [0.06, 0.015, 0.1],
    /** brilho violeta das runas (aditivo, fraco): só o contorno, para não estourar em rosa */
    sigilGlow: [0.1, 0.04, 0.18],
    /** ichor verde-doentio: núcleos pequenos e aditivos (abaixo do bloom) */
    ichor: [0.18, 0.8, 0.12],
    /** ichor fundo: rastros, halos e fim das faíscas */
    ichorDeep: [0.05, 0.22, 0.06],
    /** borda de luz fraca das runas (aditiva) */
    rim: [0.05, 0.14, 0.05],
    /** estouro escuro do impacto: violeta-preto um pouco mais claro que a fumaça, para aparecer sobre o corpo claro dos inimigos */
    burst: [0.16, 0.05, 0.24],
    /** alma pálida: a que volta ao conjurador e a que sobe dos inimigos amaldiçoados */
    soul: [0.45, 0.8, 0.55],
  },

  /** Textos flutuantes que acompanham as habilidades (cor lilás, leitura sobre a arena). */
  float: {
    color: '#c8a2ff',
    /** altura dos textos acima dos pés (acima da barra de vida) */
    height: 2.35,
    curseSize: 0.3,
    curseLife: 1.0,
    curseRise: 0.7,
    swarmSize: 0.26,
    swarmLife: 1.0,
    swarmRise: 0.6,
  },

  /** Quando o GameView desenha o fiapo do espectro do conjurador (s), por habilidade. */
  spectre: { bolt: 0.5, curse: 0.7, swarm: 0.85 },

  /**
   * Dreno de Vida (ataque básico, o mais leve): a mão junta a sombra, ela voa em arco deixando fumaça escura e
   * estoura no alvo. Uma alma pálida volta ao peito do conjurador. A viagem termina no atraso de acerto que o
   * GameView usa para a reação do alvo (ShadowBoltFX.impactDelay, com as alturas fromLift e targetLift).
   */
  drain: {
    /** altura da origem e do alvo usadas pelo GameView para o atraso do acerto (não mudar sem mudar o GameView) */
    fromLift: 1.0,
    targetLift: 0.9,
    /** antecipação (s): mesma fase de preparo do ShadowBoltFX */
    windUp: 0.25,
    /** cabeça da sombra (mistura normal), halo ichor atrás dela (aditivo) e núcleo ichor */
    headSize: 0.4,
    /** fração do tamanho da cabeça no início da antecipação */
    headStart: 0.25,
    headSpin: 5,
    haloSize: 0.85,
    haloAlpha: 0.7,
    coreSize: 0.2,
    coreSpin: 7.5,
    /** altura do arco no meio do voo */
    arc: 0.25,
    /** antecipação: fumaça que se fecha sobre a mão */
    gatherRate: 30,
    gatherJitter: 0.3,
    gatherLife: 0.35,
    gatherSize: 0.1,
    gatherSizeEnd: 0.2,
    gatherAlpha: 0.7,
    /** rastro de fumaça escura: partículas por segundo, posição, tamanhos, vida, alfa e freio */
    trailRate: 60,
    trailJitter: 0.04,
    trailSize: 0.12,
    trailSizeEnd: 0.34,
    trailLife: 0.5,
    trailAlpha: 0.85,
    trailDrag: 0.5,
    /** fiapos de ichor que ficam para trás (aditivos, poucos) */
    fleckRate: 24,
    fleckJitter: 0.05,
    fleckVel: 0.4,
    fleckLife: 0.3,
    fleckSize: 0.05,
    fleckSizeEnd: 0.01,
    fleckDrag: 1.5,
    /** menor tempo de voo (s), mesmo quando o atraso do acerto for curto */
    minFlight: 0.05,
    /** a cabeça some logo depois do acerto (s) */
    headFade: 0.12,
    /** acerto: estouro escuro que cresce, clarão curto de ichor (aditivo) */
    burstSize: 1.0,
    burstSizeEnd: 1.5,
    burstLife: 0.3,
    /** fumaça que sai do alvo */
    puffCount: 8,
    puffJitter: 0.12,
    puffVel: 1.1,
    puffLife: 0.6,
    puffSize: 0.22,
    puffSizeEnd: 0.6,
    puffAlpha: 0.85,
    puffDrag: 1.2,
    puffSpin: 0.8,
    /** respingos de ichor (aditivos): quantidade, posição, velocidade, peso e freio */
    splashCount: 6,
    splashJitter: 0.1,
    splashVel: 1.8,
    splashLife: 0.35,
    splashSize: 0.08,
    splashSizeEnd: 0.01,
    splashGravity: 2,
    splashDrag: 1.4,
    /** anel escuro no chão do alvo */
    ringSize: 0.5,
    ringSizeEnd: 0.85,
    ringLife: 0.35,
    ringFadeOut: 0.5,
    /** alma que volta ao conjurador: tempo de voo (s), arco, tamanho, giro e rastro */
    soulTime: 0.45,
    soulArc: 0.4,
    soulSize: 0.26,
    soulSpin: 2,
    soulTrailRate: 30,
    soulTrailJitter: 0.03,
    soulTrailLife: 0.3,
    soulTrailSize: 0.06,
    soulTrailSizeEnd: 0.01,
    /** a alma aparece em soulFadeInSpeed×tempo e some a partir de soulFadeOutFrom do voo */
    soulFadeInSpeed: 6,
    soulFadeOutFrom: 0.8,
    /** o efeito termina `doneAfter` segundos depois que a alma chega */
    doneAfter: 0.15,
    /** fumaça escura que engole a alma no peito: quantidade, posição, subida, vida, tamanho e alfa */
    absorbCount: 2,
    absorbJitter: 0.15,
    absorbVel: 0.3,
    absorbLife: 0.5,
    absorbSize: 0.14,
    absorbSizeEnd: 0.36,
    absorbAlpha: 0.5,
  },

  /**
   * Maldição (área): um fio de sombra liga a mão ao chão; as runas começam maiores e fecham sobre a área em
   * `closeTime` (o trancamento: clarão, anel escuro, estouro e faíscas); depois ficam acesas, com fumaça subindo
   * e colunas de sombra na borda, e apagam. O raio vem do evento (em tiles); a área tem 2×raio+1 de lado.
   */
  curse: {
    /** fio de sombra da mão ao chão (s), espessura e altura do ponto no chão */
    handTime: 0.3,
    handWidth: 0.12,
    tendrilY: 0.3,
    /** runas: tamanho inicial (× área), tempo até fechar na área (s) e entrada da decalque */
    openScale: 1.5,
    closeTime: 0.5,
    openFadeIn: 0.02,
    /** runas depois de fechadas: duração (s), fração final em que apagam e giro (rad/s) */
    holdTime: 1.6,
    holdFade: 0.4,
    spinRate: 0.5,
    runeFadeIn: 0.01,
    /** runas luminosas por cima das escuras (mesma área) e borda de luz (fração da área) */
    glowSize: 1.0,
    rimSize: 0.98,
    /** trancamento: anel escuro que se expande (fração da área) e tempo (s) */
    shockSize: 0.6,
    shockSizeEnd: 1.25,
    shockLife: 0.4,
    shockFadeOut: 0.6,
    /** trancamento: estouro escuro no centro (× área), altura, e clarão de ichor (× área) */
    burstSize: 0.9,
    burstSizeEnd: 1.1,
    burstLife: 0.35,
    burstHeight: 0.5,
    flashFrac: 0.8,
    /** ganho do clarão do lacre (ichor fundo, fraco: só dá um pulso verde) */
    flashGain: 2,
    flashLife: 0.2,
    /** trancamento: faíscas radiais de ichor */
    sparkCount: 12,
    sparkSpeed: 2.2,
    sparkLife: 0.45,
    sparkSize: 0.09,
    sparkSizeEnd: 0.01,
    sparkDrag: 2.4,
    sparkJitter: 0.1,
    sparkHeight: 0.2,
    /** tremor da câmera no trancamento (quantidade) */
    lockShake: 0.04,
    /** fumaça que sobe da área enquanto as runas estão acesas */
    smokeRate: 40,
    smokeJitterFrac: 0.4,
    smokeVelJitter: 0.3,
    smokeHeight: 0.15,
    smokeSize: 0.3,
    smokeSizeEnd: 0.9,
    smokeRise: 0.8,
    smokeAlpha: 0.7,
    smokeLife: 1.3,
    smokeDrag: 0.4,
    /** para de criar fumaça esta fração de segundo antes do fim */
    smokeStop: 0.4,
    /** colunas de sombra na borda: quantidade, ângulo inicial, espaçamento de fase, largura, altura máxima, subida e oscilação */
    strands: 6,
    strandAngle: 0.3,
    strandPhase: 1.7,
    strandWidth: 0.36,
    strandHeight: 1.4,
    strandGrow: 0.35,
    strandWobble: 0.15,
    strandWobbleSpeed: 4,
    /** vida das colunas e tempo de sumiço no fim delas (s) */
    strandLife: 1.6,
    strandFade: 0.8,
    strandAlpha: 0.8,
    /** raio das colunas e da fumaça, como fração da área (0,5 = na borda) */
    rimFraction: 0.5,
  },

  /** Marca de cada pulso da maldição no inimigo amaldiçoado (um pulso por segundo). */
  curseMark: {
    /** anel escuro que se fecha nos pés do inimigo */
    ringSize: 0.85,
    ringSizeEnd: 0.35,
    ringLife: 0.45,
    ringFadeOut: 0.5,
    /** anel violeta luminoso (aditivo, fraco) que se fecha junto: é ele que marca o inimigo sobre o chão escuro */
    glowRingSize: 0.9,
    glowRingSizeEnd: 0.45,
    glowRingLife: 0.5,
    glowRingFadeOut: 0.6,
    /** fumaça que sobe dos pés */
    smokeCount: 2,
    smokeJitter: 0.2,
    smokeVelJitter: 0.3,
    smokeRise: 0.7,
    smokeHeight: 0.2,
    smokeSize: 0.2,
    smokeSizeEnd: 0.5,
    smokeLife: 0.7,
    smokeAlpha: 0.7,
    smokeDrag: 0.5,
    /** alma pálida que escapa do inimigo */
    soulCount: 1,
    soulJitter: 0.25,
    soulVelJitter: 0.3,
    soulRise: 0.9,
    soulHeight: 0.6,
    soulSize: 0.07,
    soulSizeEnd: 0.02,
    soulLife: 0.6,
    soulDrag: 0.6,
  },

  /**
   * Enxame de Sombras: sombras pequenas surgem do chão, sobem e giram em volta do conjurador (muitas partículas em
   * movimento). Cada pulso de dano de um alvo (um por segundo) faz uma bola pesada e lenta mergulhar nele, e uma fita
   * de ligação fica até ele enquanto os pulsos continuam. O evento não diz quem são os alvos: eles aparecem nos pulsos.
   */
  swarm: {
    /** sombras orbitando: quantidade, tamanho, transparência e entrada */
    motes: 11,
    moteSize: 0.26,
    moteAlpha: 0.9,
    moteFadeIn: 0.15,
    /** giro das sombras (rad/s), desvio de fase inicial e velocidade relativa mínima + variação */
    moteSpin: 1.5,
    moteAngleJitter: 0.5,
    moteSpeedMin: 0.85,
    moteSpeedRange: 0.3,
    /** antecipação: as sombras sobem do chão (altura inicial) até a órbita (s), a partir de um raio maior */
    gatherTime: 0.5,
    gatherRadius: 1.8,
    groundY: 0.15,
    /** órbita: raio, altura, balanço vertical, frequência do balanço e velocidade angular (rad/s) */
    orbitRadius: 0.95,
    orbitHeight: 1.25,
    orbitBob: 0.12,
    bobSpeed: 2.6,
    spin: 4.5,
    /** fagulhas de ichor que cada sombra solta: partículas por segundo, posição, vida, tamanho e freio */
    flakeRate: 14,
    flakeJitter: 0.04,
    flakeLife: 0.3,
    flakeSize: 0.05,
    flakeSizeEnd: 0.01,
    flakeDrag: 1.2,
    /** rastro de fumaça de cada sombra */
    trailRate: 6,
    trailJitter: 0.05,
    trailSize: 0.1,
    trailSizeEnd: 0.25,
    trailLife: 0.6,
    trailAlpha: 0.6,
    trailDrag: 0.8,
    /** tempo de espera pelo primeiro pulso (s); órbita que dura `linger` s depois do último pulso */
    firstWait: 1.7,
    linger: 1.2,
    /** dissipação: tempo para as sombras e as fitas sumirem (s) e tempo máximo de vida (s) */
    dissolveTime: 0.5,
    maxLife: 9,
    /** fitas de ligação até cada alvo: largura, alfa, tempo depois de cada pulso e quantas podem existir */
    tetherWidth: 0.1,
    tetherAlpha: 0.55,
    tetherLife: 1.0,
    tetherSlots: 10,
    /** mergulho de cada pulso: voo (s), arco, tamanho da cabeça, núcleo, giro e rastro */
    diveFlight: 0.42,
    diveArc: 0.6,
    diveSize: 0.46,
    diveCoreSize: 0.22,
    diveSpin: 2,
    diveTrailRate: 40,
    diveTrailJitter: 0.05,
    diveTrailSize: 0.14,
    diveTrailSizeEnd: 0.32,
    diveTrailAlpha: 0.8,
    diveTrailDrag: 0.6,
    diveTrailLife: 0.5,
    /** o mergulho desaparece em diveFadeTime (s) depois de acertar */
    diveFadeTime: 0.25,
    /** acerto do mergulho: estouro escuro (× tamanho), sua vida, fumaça e anel no chão */
    diveBurstSize: 0.6,
    diveBurstSizeEnd: 0.9,
    diveBurstLife: 0.3,
    divePuffCount: 4,
    diveLandJitter: 0.15,
    diveLandVel: 0.9,
    diveLandLife: 0.5,
    diveLandSize: 0.18,
    diveLandSizeEnd: 0.5,
    diveLandAlpha: 0.8,
    diveLandDrag: 1.4,
    diveLandSpin: 0.6,
    diveRingSize: 0.4,
    diveRingSizeEnd: 0.7,
    diveRingLife: 0.3,
    diveRingFadeOut: 0.5,
  },
};
