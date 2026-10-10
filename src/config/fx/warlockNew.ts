/**
 * Visual de combate das seis magias novas da Bruxa: Cárcere Etéreo, Eco da Alma, Névoa Gélida, Geada Negra,
 * Lodaçal Abissal e Ápice Sombrio. Estilo anime com partículas: sombra violeta-preta em mistura normal, gelo
 * e ichor só como acento aditivo pequeno. Só apresentação: nenhum número aqui muda dano, recarga, alcance,
 * chance ou alvo (isso é da simulação). Os números do jogo chegam pelo evento (ticks, raio, amp, slowMult...).
 * Unidades: tempo em segundos; distância em unidades do mundo (1 tile = 1 unidade).
 * Cor: RGB linear. Brilho acima de 0,9 entra no bloom e tinge o traje escuro da Bruxa: o aditivo fica abaixo disso,
 * salvo núcleos pequenos (contas de luz).
 * Nomes: "...Size" = tamanho; "...SizeEnd" = tamanho final; "...Life" = duração; "...Alpha" = transparência;
 * "...Jitter" = aleatoriedade na posição; "...Vel" = velocidade; "...Drag" = freio do ar.
 */
import { WARLOCK_FX } from './warlock';

export const WARLOCK_NEW_FX = {
  /** Altura do solo das marcas no chão (decalques não afundam no piso). */
  groundLift: 0.03,
  /** Comprimento e escala mínimos (evita escala zero). */
  minLength: 0.001,
  /** Ritmo da simulação: 10 ticks por segundo (converte os ticks dos eventos em segundos). */
  ticksPerSecond: 10,
  /** Entrada padrão das decalques (s). */
  decalFadeIn: 0.01,
  /** Alturas do corpo (mesmas da Bruxa, para ancorar os efeitos no peito e na cabeça). */
  body: WARLOCK_FX.body,

  color: {
    /** cristal etéreo: violeta-escuro, mistura normal (o cristal é sólido, não brilha) */
    crystal: [0.14, 0.05, 0.24],
    /** aresta lilás do cristal (aditiva, fraca) */
    crystalEdge: [0.45, 0.25, 0.85],
    /** contas de luz nas arestas (aditivas, pequenas: podem passar de 0,9) */
    bead: [0.9, 0.7, 1.2],
    /** gelo: estrelas e cristais da névoa (aditivo, fraco) */
    frost: [0.3, 0.55, 0.8],
    /** gelo escuro do chão e do estilhaço (mistura normal) */
    frostDark: [0.05, 0.07, 0.14],
    /** nuvem roxo-gelo da névoa (mistura normal) */
    mist: [0.16, 0.1, 0.24],
    /** halo gelado (aditivo) */
    mistEdge: [0.4, 0.7, 1.0],
    /** luz azul-gelo da névoa e da geada (multiplicada pela intensidade, que nunca passa de 0,3) */
    iceLight: [0.4, 0.7, 1.0],
    /** núcleo da geada negra: azul-negro, mistura normal */
    blackCore: [0.02, 0.03, 0.08],
    /** brilho do núcleo da geada negra (aditivo, multiplicado por 0,3) */
    blackCoreGlow: [0.35, 0.6, 1.0],
    /** espinhos de gelo negro (mistura normal) */
    spike: [0.05, 0.08, 0.17],
    /** raízes do lodaçal, verde-escuras (mistura normal) */
    root: [0.05, 0.1, 0.04],
    /** ichor: fiapos pequenos do lodaçal (aditivo) */
    ichor: [0.12, 0.45, 0.1],
    /** vapor roxo do lodaçal (mistura normal) */
    vapor: [0.12, 0.04, 0.18],
    /** disco de lodo que segue o alvo (mistura normal) */
    bog: [0.05, 0.1, 0.04],
    /** silhueta fantasma do eco (mistura normal) */
    ghost: [0.1, 0.04, 0.16],
    /** estouro violeta-escuro das batidas do eco (mistura normal, um pouco mais claro que a silhueta) */
    echoBurst: [0.22, 0.08, 0.34],
    /** anel de luz do eco (aditivo) */
    echoRing: [0.5, 0.3, 0.8],
    /** flare do eco dobrado (aditivo, pequeno) */
    echoFlare: [0.8, 0.5, 1.0],
    /** cor do Ápice (HDR: acima de 1 brilha no bloom): espinhos, cristais e o brilho da poça */
    apex: [0.55, 0.18, 1.0],
    /** núcleo escuro embaixo da poça (mistura normal) */
    apexCore: [0.12, 0.02, 0.2],
    /** contorno de gelo do inimigo gelado (aditivo, multiplicado por 0,5) */
    chillGlow: [0.5, 0.9, 1.2],
  },

  /** Textos flutuantes (cor lilás da Bruxa, gelo para a névoa e a geada). */
  float: {
    cageColor: '#c8a2ff',
    cageFailColor: '#bfe6ff',
    echoColor: '#c8a2ff',
    mistColor: '#9fd8ff',
    blackFrostColor: '#8fb8ff',
    marshColor: '#a6e3a1',
    apexColor: '#c8a2ff',
    /** altura dos textos acima dos pés (acima da barra de vida) */
    height: 2.35,
    size: 0.28,
    life: 1.0,
    rise: 0.6,
  },

  /** Quando o GameView desenha o fiapo do espectro do conjurador (s), por magia. */
  spectre: { cage: 0.6, echo: 0.6, mist: 0.7, blackFrost: 0.7, marsh: 0.6, apex: 0.8 },

  /**
   * Cárcere Etéreo: quatro pilares de cristal em volta do alvo, contas de luz nas arestas e um decalque de gelo no
   * chão. Racha em `crackAt` da duração (fração) e, no fim, quebra em cacos. Se falhou (ok=false), os pilares
   * aparecem e somem sem quebrar.
   */
  cage: {
    pillars: 4,
    /** distância dos pilares até o centro do alvo, ângulo do primeiro e altura/largura dos pilares */
    pillarRadius: 0.42,
    pillarAngle: 0.785,
    pillarHeight: 1.7,
    pillarWidth: 0.3,
    /** tempo para os pilares crescerem (s) e para aparecerem (s) */
    growTime: 0.25,
    fadeIn: 0.2,
    /** aresta lilás: largura, transparência e cintilação (amplitude e velocidade) */
    edgeWidth: 0.08,
    edgeAlpha: 0.6,
    shimmer: 0.3,
    shimmerSpeed: 6,
    /** contas de luz: por pilar, tamanho, transparência */
    beadsPerPillar: 2,
    beadSize: 0.12,
    beadAlpha: 0.9,
    /** racha em esta fração da duração: aresta acende mais e sai um anel fraco e faíscas */
    crackAt: 0.8,
    crackFlash: 1.8,
    crackSparks: 6,
    crackRingSize: 0.9,
    crackRingLife: 0.4,
    crackDecalSize: 0.8,
    crackDecalLife: 0.8,
    /** decalque de gelo sob o alvo (fica a duração toda): tamanho e vida mínima */
    frostDecalSize: 0.9,
    /** quebra: cacos (partículas), velocidade, peso, vida e freio; pilares encolhem em `breakTime` (s) */
    shardCount: 14,
    shardSpeed: 2.2,
    shardGravity: 2,
    shardLife: 0.5,
    shardSize: 0.1,
    shardSizeEnd: 0.01,
    shardDrag: 2,
    breakTime: 0.25,
    breakShake: 0.05,
    /** falha (ok=false): tempo até sumir sem quebrar */
    failLife: 0.8,
    failFade: 0.5,
    /** se o alvo sumir (morreu ou saiu da tela) por este tempo (s), a caixa quebra cedo */
    missingBreakAfter: 0.2,
  },

  /**
   * Eco da Alma: duas silhuetas fantasmas com afterimage sobre o alvo (uma por batida), anel de luz e decalque da
   * área. Batidas em `blowAt` e `blowAt + blowGap` (o GameView adia o número do dano para `blowAt`).
   * Se `doubled`, os ecos saem maiores e com flare.
   */
  echo: {
    /** primeira batida (s): é quando o número do dano aparece */
    blowAt: 0.3,
    blowGap: 0.22,
    /** batidas por alvo (cada uma é um golpe de sombra no alvo e na área) */
    blows: 2,
    /** silhueta fantasma: altura, largura, cabeça, desvio para o lado, deriva para fora e vida (s) */
    ghostHeight: 1.4,
    ghostWidth: 0.45,
    headSize: 0.3,
    ghostOffset: 0.35,
    ghostDrift: 0.5,
    ghostLife: 0.4,
    ghostAlpha: 0.7,
    /** área: decalque escuro que fica até a segunda batida mais um pouco (s) */
    areaLife: 0.8,
    areaFade: 0.6,
    /** anel de luz (lu_ring) sobre o alvo: tamanho inicial e final, vida (s) */
    ringSize: 0.9,
    ringSizeEnd: 1.6,
    ringLife: 0.35,
    /** estouro escuro de cada batida no alvo e nos demais da área (tamanho e vida) */
    impactSize: 0.55,
    impactSizeEnd: 0.8,
    impactLife: 0.25,
    /** quantos alvos da área recebem estouro (limite do orçamento) */
    maxAreaImpacts: 6,
    /** dobrado (algum alvo estava preso): ecos maiores e flare (lu_flare) */
    doubledScale: 1.35,
    flareSize: 1.6,
    flareLife: 0.35,
  },

  /**
   * Névoa Gélida: área no chão que dura `ticks`. Nuvem roxo-gelo girando, cristais de gelo orbitando e flocos.
   * A cada segundo, um anel de gelo (o pulso do dano). Luz azul-gelo fraca (até 0,3), só aqui.
   */
  mist: {
    pulseEvery: 1,
    /** cristais orbitando: quantidade, tamanho, transparência, órbita (fração do raio), giro e balanço */
    haloCount: 6,
    haloSize: 0.5,
    haloAlpha: 0.8,
    haloOrbit: 0.6,
    haloSpin: 0.6,
    haloBob: 0.1,
    /** nuvem (smoke_atlas): partículas por segundo, tamanho inicial e final, vida, alfa, giro (rad/s) e freio */
    cloudRate: 14,
    cloudSize: 0.6,
    cloudSizeEnd: 1.4,
    cloudLife: 1.2,
    cloudAlpha: 0.55,
    cloudSpin: 1,
    cloudDrag: 0.8,
    /** flocos que caem na névoa: por segundo, tamanho, vida e peso */
    flakeRate: 8,
    flakeSize: 0.06,
    flakeLife: 0.8,
    flakeGravity: 0.8,
    /** anel de cada pulso: tamanho final como fração da área (começa na metade), vida (s) */
    pulseRingSize: 1,
    pulseRingLife: 0.5,
    /** borda gelada da área (aditiva): tamanho como fração da área (2×raio+1) */
    edgeRingSize: 1,
    /** altura dos cristais orbitando */
    haloHeight: 0.9,
    /** luz azul-gelo: intensidade máxima (teto 0,3), distância e altura */
    lightIntensity: 0.3,
    lightDistance: 4,
    lightHeight: 1.2,
    /** a névoa some nesta fração final (s) */
    fadeOut: 1,
    /** ondulação de gelo em cada alvo que toma um pulso */
    rippleSize: 0.5,
    rippleLife: 0.35,
    rippleFlakes: 6,
  },

  /**
   * Geada Negra: núcleo azul-negro que cresce, oito espinhos de gelo negro que saem do centro até a borda da área
   * (a batida), estouro em cada ponta e no alvo. Se havia alvo gelado (chilled > 0), mais quatro espinhos e um
   * flash azul-gelo. O dano dos alvos aparece em `spikeAt` (o GameView adia para esse instante).
   */
  blackFrost: {
    windUp: 0.25,
    coreSize: 0.55,
    coreGlowSize: 0.5,
    coreGlowAlpha: 0.3,
    spikes: 8,
    chilledSpikes: 4,
    spikeWidth: 0.22,
    spikeGrow: 0.22,
    spikeLife: 0.5,
    spikeAt: 0.47,
    /** estouro na ponta de cada espinho (× raio na escala do sprite) e no alvo */
    tipBurstSize: 0.55,
    tipBurstLife: 0.3,
    targetImpactSize: 0.5,
    targetImpactLife: 0.3,
    /** área: decalque escuro (vida e fade) e anel de gelo que se expande na batida (tamanho como fração da área) */
    areaLife: 0.8,
    areaFade: 0.6,
    ringSize: 0.5,
    ringSizeEnd: 1.1,
    ringLife: 0.4,
    /** flash azul-gelo quando havia alvo gelado (tamanho em tiles, vida) */
    flashSize: 2,
    flashLife: 0.2,
    /** cacos de gelo negro que voam da batida: quantidade, velocidade, vida, tamanho */
    shardCount: 10,
    shardSpeed: 2,
    shardLife: 0.45,
    shardSize: 0.08,
    shardSizeEnd: 0.01,
    /** a magia termina depois deste tempo (s) */
    doneAfter: 0.9,
  },

  /**
   * Lodaçal Abissal: de 3 a 4 raízes que sobem dos pés do alvo (zigue-zague), vapor roxo e um disco de lodo que
   * segue o alvo pelos ticks do evento. As raízes afundam no fim.
   */
  marsh: {
    roots: 4,
    /** raízes: raio do círculo de saída (em volta dos pés), altura máxima, segmentos, tremor, espessura */
    rootRadius: 0.35,
    rootHeight: 1.1,
    rootSegments: 4,
    rootJitter: 0.12,
    rootWidth: 0.1,
    /** raízes sobem em `rootGrow` s; afundam nos últimos `rootSink` s da duração */
    rootGrow: 0.6,
    rootSink: 1,
    /** disco de lodo: intervalo entre decalques que seguem o alvo (s), vida, tamanho e fade */
    discEvery: 0.12,
    discLife: 0.3,
    discSize: 0.9,
    discFade: 0.5,
    /** vapor roxo: partículas por segundo, tamanho inicial e final, vida, alfa */
    vaporRate: 8,
    vaporSize: 0.25,
    vaporSizeEnd: 0.8,
    vaporLife: 0.9,
    vaporAlpha: 0.6,
    /** fiapos de ichor que sobem das raízes (aditivos, poucos) */
    ichorRate: 3,
    ichorSize: 0.05,
    ichorLife: 0.6,
    ichorRise: 0.5,
  },

  /**
   * Ápice Sombrio (buff da própria Bruxa), tudo desenhado por código: poça de veneno com núcleo escuro, anel de runas
   * girando, espinhos de energia que sobem em volta e cristais violeta orbitando a cintura. Ao acabar (`ticks`), tudo
   * converge para o peito dela e some.
   */
  apex: {
    /** entrada da poça e do anel (s); largura final da poça (m), alfa, pulso (amplitude e velocidade) e giro (rad/s) */
    grow: 0.5,
    floorWidth: 4.2,
    floorAlpha: 0.75,
    floorPulse: 0.1,
    floorPulseSpeed: 2.2,
    floorSpin: 0.08,
    /** núcleo escuro (mistura normal) sob a poça: largura (m) e alfa */
    coreWidth: 2.6,
    coreAlpha: 0.95,
    /** anel de runas: largura (m), alfa e giro (rad/s, no sentido contrário à poça) */
    runeWidth: 2.7,
    runeAlpha: 0.95,
    runeSpin: 0.45,
    /** espinhos de energia: quantidade, raio, largura da base (m), altura máxima (m), período de pulsação (s), atraso (s) e intervalo entre eles (s) */
    spikes: 5,
    spikeRadius: 1.2,
    spikeWidth: 0.26,
    spikeHeight: 2.1,
    spikePeriod: 2.8,
    spikeDelay: 0.2,
    spikeStagger: 0.05,
    /** cristais violeta na cintura: quantidade, raio da órbita, tamanho, altura, órbita (rad/s), balanço (m e velocidade), atraso (s) e brilho */
    crystals: 4,
    crystalRadius: 0.95,
    crystalSize: 0.34,
    crystalHeight: 0.9,
    crystalOrbit: 0.6,
    crystalBob: 0.08,
    crystalBobSpeed: 1.7,
    crystalDelay: 0.4,
    crystalGlow: 0.8,
    /** convergência no fim: o corpo do efeito volta ao peito nos últimos `converge` s */
    converge: 0.8,
    /** fumaça violeta nos pés: partículas por segundo, tamanho, vida, alfa */
    vaporRate: 4,
    vaporSize: 0.2,
    vaporSizeEnd: 0.5,
    vaporLife: 0.8,
    vaporAlpha: 0.5,
  },

  /**
   * Contorno de gelo de cada inimigo gelado (Frio): cristais que giram na cintura e um anel no chão. Some
   * sozinho quando o Frio acaba; cada pulso de gelo renova a duração. No máximo `maxContours` ao mesmo tempo.
   */
  chill: {
    haloCount: 3,
    haloSize: 0.35,
    haloRadius: 0.3,
    haloHeight: 0.9,
    haloSpin: 1.5,
    haloAlpha: 0.8,
    feetRingSize: 0.6,
    feetRingLife: 0.4,
    fadeOut: 0.3,
    maxContours: 8,
  },
};
