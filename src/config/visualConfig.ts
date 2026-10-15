import type { AuraKind } from './auras';

/** Constantes puramente visuais (não afetam a simulação). */
export const VISUAL_CONFIG = {
  background: 0x000000, // vazio preto além do mapa (referências: sem céu)
  fog: { near: 26, far: 48 },
  exposure: 1.0,
  envIntensity: 0.12,
  hemiIntensity: 1.35,
  moonIntensity: 1.5,
  light: { sky: 0xfff6e6, ground: 0x8f8466, sun: 0xfff0d2 },
  camera: { fov: 32, height: 21, distance: 14.5, lookZ: -0.3 }, // ~55° de inclinação, quase ortográfica
  bloom: { strength: 0.45, radius: 0.4, threshold: 0.9 },
  fire: {
    lightIntensity: 3.2,
    tilesPerLight: 2,
    flameEmitPerTilePerSec: 16,
    emberEmitPerTilePerSec: 5,
    smokeEmitPerTilePerSec: 4,
    fadeIn: 0.35,
    fadeOut: 0.6,
  },
  cleave: { sweepTime: 0.14, fadeTime: 0.28, shakePerHit: 0.05 },
  /** Investida: tremor sutil, menor que um Golpe em Área cheio. */
  bash: { shake: 0.09 },
  /**
   * Arcos de ataque corpo a corpo (ArcFX): tufão do Guerreiro e rastro do Assassino.
   * half = meia abertura (rad), radius = alcance visual, sweep/delay = tempo (s), height = altura da fita (m).
   */
  /** Golpe Furtivo do Assassino: carga → investida → impacto → dissipação (tempos em s, tamanhos em unidades do mundo). */
  strike: {
    /** carga: a energia converge para a mão com a adaga */
    charge: 0.12,
    /** instante do golpe (o alvo reage aqui; a investida dura o intervalo entre carga e golpe, ~0,18 s) */
    impactAt: 0.3,
    /** duração total do efeito (s) */
    life: 1.1,
    /** largura do arco de corte no impacto */
    slashSize: 3.2,
    /** tremor, empurrão de câmera, aberração e hit-stop no impacto */
    shake: 0.16,
    kick: 0.16,
    aberrate: 0.005,
    hitStop: 0.09,
  },
  arc: {
    windCleave: { half: 1.15, radius: 2.6, sweep: 0.3, delay: 0.12, height: 0.9, width: 0.3, color: [0.8, 1.5, 1.7], swirl: true },
    windBash: { half: 0.55, radius: 1.6, sweep: 0.2, delay: 0.14, height: 1.1, width: 0.22, color: [0.9, 1.6, 1.8], swirl: true },
    stab: { half: 0.9, radius: 1.3, sweep: 0.16, delay: 0.08, height: 1.0, width: 0.14, color: [1.5, 0.6, 2.0], swirl: false, smoke: true },
    /** Leque de Lâminas do Assassino: arco roxo largo com fumaça de sombra. */
    shadowFan: { half: 0.75, radius: 2.4, sweep: 0.22, delay: 0.1, height: 1.0, width: 0.26, color: [1.3, 0.45, 2.1], swirl: true, smoke: true },
    /** Névoa de veneno: intervalo (s) entre as baforadas sobre um inimigo envenenado. */
    poisonMist: { every: 0.3 },
  },
  /**
   * hitFlashTime: clarão ao levar dano. deathTime: tempo do corpo até sumir (a morte espera o clipe de morte, se for mais longo).
   * walkStepRef: passo (s) em que o andar tem a velocidade-base do modelo; passo mais lento anda mais devagar, passo mais rápido, mais depressa.
   * walkHold / walkHoldEnemy: tempo (s) que o andar segue depois do último passo, para o parado não piscar entre passos (inimigos esperam mais na fila).
   * heavyHitFrac: fração da vida máxima que faz um golpe ser "forte" (usa a reação forte, se o modelo tiver).
   * fadeAction: mistura (s) ao entrar num golpe, magia ou reação (0,06 dava tranco). fadeBack: mistura (s) ao voltar ao parado/andar.
   */
  unit: { hitFlashTime: 0.22, deathTime: 1.1, walkStepRef: 0.5, walkHold: 0.18, walkHoldEnemy: 0.45, heavyHitFrac: 0.2, fadeAction: 0.1, fadeBack: 0.22 },
  /** Planejamento: heróis passeiam em volta do posto (raio em tiles, velocidades em tiles/s, esperas em s). */
  idleWander: { radius: 0.85, speed: 0.9, orderSpeed: 3.2, waitMin: 1.5, waitMax: 4.5, lookAtCameraAfter: 1.2 },
  /** Ordem de posição: marca no chão (duração em s). */
  orders: { markerTime: 0.7 },
  /**
   * Prévia do Último Bastião: a construção translúcida sob o cursor (verde = dá, vermelho = não), com contorno
   * vetorial brilhante, o contorno do tile e, na torre, o anel do alcance. Só visual; a decisão é do núcleo.
   */
  bastionGhost: {
    validFill: 0x4dff8a, // corpo translúcido quando dá para construir ou mover
    validEdge: 0xd2ffe0, // contorno vetorial (mais claro que o corpo)
    invalidFill: 0xff4a4a, // corpo translúcido quando não dá
    invalidEdge: 0xffd0c8, // contorno vetorial da recusa
    fillOpacity: 0.26, // cópia translúcida do modelo
    edgeOpacity: 0.95, // contorno brilhante
    tileFill: 0.16, // mancha do tile sob a prévia
    tileEdgeOpacity: 0.9, // contorno do tile
    rangeFill: 0.07, // leve preenchimento dentro do alcance da torre
    rangeEdgeOpacity: 0.7, // anel do alcance da torre
    rangeSegments: 64, // pontos do anel (suavidade)
    lift: 0.03, // altura do contorno sobre o chão (evita z-fighting)
    tileSize: 0.96, // lado da mancha do tile (1 = o tile inteiro)
    edgeAngle: 25, // graus: arestas mais abruptas que isto viram contorno vetorial
  },
  /**
   * Câmera tática nos mapas grandes: segue a ação na onda e deixa o jogador inspecionar o mapa
   * (WASD/setas ou arrastar com o botão do meio/direito, roda = zoom, F = centralizar/seguir).
   */
  cameraControl: {
    panSpeed: 16, // tiles/s com teclado
    edgePan: 0, // px da borda para arrastar a câmera com o mouse (0 = desligado)
    zoomMin: 0.62,
    /** Limite de afastamento da câmera na campanha (zoom alto = mais longe: a câmera fica em foco + offset × zoom). */
    zoomMax: 1.9,
    /** Último Bastião: limite de afastamento próprio (o campo de defesa fica mais perto). Só o máximo muda. */
    bastion: { zoomMax: 1.5 },
    /** Mapas pintados (arte do dono): sem névoa, zoom maior e a câmera presa dentro da pintura. */
    painted: { zoomStart: 1.3, zoomMin: 0.7, zoomMax: 1.75 },
    zoomStep: 0.1,
    follow: 2.4, // suavização do seguir
    manualHold: 1.5, // s sem seguir depois que o jogador mexe na câmera
    shadowHalf: 17, // meia-largura da área de sombras em volta do foco (tiles)
  },
  /** Emperium: veios de energia dentro do cristal (shader), pulso lento e brilho controlado. Só visual. */
  emperium: {
    veinScale: 2.8, // densidade dos veios (quanto maior, mais veios)
    veinSharpness: 8, // quanto maior, veios mais finos (8 deixa a linha legível na tela)
    veinFlow: 0.12, // velocidade com que a energia sobe pelo cristal
    veinBrightness: 1.5, // brilho do veio (acima de 1, só o pico entra no bloom)
    pulseDepth: 0.22, // variação do pulso lento (0 = sem pulso)
    veinMid: 0x3fd9ff, // cor do meio do degradê (ciano)
  },
  /** Água das camadas (rio, lago e poças): ondulação discreta, reflexo do céu e brilho nas cristas. Só visual. */
  agua: {
    escala: 0.9, // tamanho da ondulação (quanto maior, ondas mais curtas)
    velocidade: 0.12, // velocidade com que a ondulação desliza
    ondulacao: 0.8, // quanto a superfície inclina a luz (0 = água lisa)
    reflexo: 0.07, // reflexo do céu nas bordas de visão (fresnel); com 0.14 o fosso clareava demais
    brilho: 0.18, // brilho nas cristas da ondulação
    corCeu: 0xcfeeff, // cor do céu refletido
  },
  /** Muralhas: peça `muros.glb` do dono (módulo de 1 m com torres e ameias). `glb: false` volta às caixas antigas. Alturas em tiles. */
  muralha: { glb: true, alturaCidade: 1.3, alturaCastelo: 1.4, alturaVila: 0.9 },
  /** Direção do sol (de onde a luz vem) — o deserto usa sol baixo de fim de tarde (sombras longas). */
  sun: [-7, 18, 9] as [number, number, number],
};

/** Iluminação/atmosfera por tema de zona (sobrescreve o VISUAL_CONFIG). */
export const VISUAL_THEMES = {
  /** Vila ao entardecer: sol baixo e alaranjado, sombras longas, lanternas quentes. */
  town: {
    sun: [-14, 8, 7] as [number, number, number],
    hemiIntensity: 1.2,
    moonIntensity: 2.2,
    light: { sky: 0xffe0b8, ground: 0x5a4a30, sun: 0xffc890 },
  },
  /** Noite de lua: azul frio no ambiente, fogo quente nos braseiros. */
  bridge: {
    background: 0x05070e,
    fog: { near: 24, far: 44 },
    exposure: 1.18,
    envIntensity: 0.08,
    hemiIntensity: 1.3,
    moonIntensity: 1.35,
    light: { sky: 0x8c9cd8, ground: 0x3a3428, sun: 0xc4d2ff },
    sun: [-10, 9, 8] as [number, number, number],
    bloom: { strength: 0.6, radius: 0.45, threshold: 0.82 },
    // mesma inclinação da câmera padrão, deslocada ~1,5 tile para o sul: mostra a muralha atrás da party
    camera: { fov: 32, height: 21, distance: 16.2, lookZ: 1.4 },
  },
  /** Floresta de dia: verde vivo e saturado, sol quente filtrado, névoa esverdeada no horizonte. */
  forest: {
    background: 0x2e4a36,
    fog: { near: 24, far: 50 },
    exposure: 1.12,
    envIntensity: 0.12,
    hemiIntensity: 1.0,
    moonIntensity: 2.6,
    // sol verde-dourado filtrado pelas copas: sombras de folhagem e o céu tingido de verde
    light: { sky: 0xd8f2e0, ground: 0x3e5a2c, sun: 0xffe6b0 },
    sun: [-12, 10, 7] as [number, number, number],
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Campos abertos ensolarados (verde-dourado). */
  plains: {
    background: 0x3c5236,
    fog: { near: 26, far: 52 },
    exposure: 1.04,
    envIntensity: 0.12,
    hemiIntensity: 1.1,
    moonIntensity: 2.5,
    // campos abertos no fim da tarde: sol baixo e dourado, sombras compridas das pedras e dos carrinhos
    light: { sky: 0xf2eedb, ground: 0x6b6a3a, sun: 0xffdc9a },
    sun: [-16, 6.5, 9] as [number, number, number],
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Deserto no fim da tarde: sol baixo e quente, sombras longas e duras. */
  desert: {
    background: 0x6a4a30,
    fog: { near: 26, far: 52 },
    exposure: 0.98,
    envIntensity: 0.12,
    hemiIntensity: 0.9,
    moonIntensity: 2.6,
    light: { sky: 0xf0dcc0, ground: 0x8a6a40, sun: 0xffd08a },
    sun: [-16, 7.5, 5] as [number, number, number],
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /**
   * Montanha gelada: sol frio e BAIXO (sombras longas que desenham o relevo da neve), céu azul-prata
   * e luz de preenchimento mais fraca para o contraste de luz e sombra aparecer.
   */
  mountain: {
    background: 0x3a4a66,
    fog: { near: 26, far: 52 },
    exposure: 1.12,
    envIntensity: 0.14,
    hemiIntensity: 0.72,
    moonIntensity: 2.9,
    light: { sky: 0x9fbbe8, ground: 0x3b4862, sun: 0xe2edff },
    sun: [-15, 8.5, 6] as [number, number, number],
    bloom: { strength: 0.48, radius: 0.5, threshold: 0.88 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Cume das Cinzas: céu vermelho-escuro, brasas. */
  ash: {
    background: 0x1c0a07,
    fog: { near: 22, far: 42 },
    exposure: 1.25,
    envIntensity: 0.1,
    hemiIntensity: 1.2,
    moonIntensity: 1.9,
    // cinzas e fumaça: luz de trás, atravessando a fumaça, com o céu avermelhado
    light: { sky: 0xc8705a, ground: 0x3a1e16, sun: 0xff9a60 },
    sun: [4, 7, -14] as [number, number, number],
    bloom: { strength: 0.6, radius: 0.55, threshold: 0.82 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
} as const;

/**
 * Monstros importados (GLB com esqueleto padrão de 26 ossos + 7 clipes, em public/models).
 * `height` = altura no mundo; `aura` = casco brilhante permanente (RGB, >1 brilha no bloom).
 */
export interface MonsterModelVisual {
  file: string;
  height: number;
  walkRate: number;
  aura?: [number, number, number];
  /** Heróis: cor do espectro ao usar habilidade. */
  ghost?: [number, number, number];
  /**
   * Usa as animações do personagem do jogo (o GLB traz só malha + esqueleto com os mesmos nomes de ossos).
   * `warriorUAL` = captura UAL (descanso, andar, dano, morte) com os golpes do Guerreiro.
   * `barbarianUAL` = a mesma captura, com socos (UAL) no lugar da espada.
   * `monsterRig` = `warriorRig` com a morte própria dos monstros de rig Mixamo (goblin, dino, raydric; monsterRigAnims.ts).
   */
  clips?: 'warrior' | 'mage' | 'archer' | 'zombie' | 'zombieRunner' | 'zombieBrute' | 'brute' | 'cultist' | 'warriorRig' | 'monsterRig' | 'goblinBossRig' | 'krexxWarlord' | 'warriorUAL' | 'barbarianUAL';
  /** `auto` = GLB sem esqueleto (malha estática): o jogo põe o esqueleto humanoide (auto-rig) e usa os `clips`. */
  rig?: 'auto';
  /** Juntas medidas para o auto-rig (com `rig: 'auto'`); sem elas, a detecção automática decide. */
  juntas?: RigJointsVisual;
  /** Flutuação: o corpo fica elevado este tanto (unidades do modelo) e não usa o passo de caminhada. */
  hover?: number;
  /**
   * Monstro de rig Mixamo, morte: quanto o quadril sobe quando o corpo está deitado (unidades do modelo). A malha
   * skinada desce 0,16 a 0,50 abaixo das juntas no chão; este valor leva o ponto mais baixo ao nível do corpo de pé
   * (medido na malha: fim da queda = pé). Ver liftLying em monsterRigAnims.ts.
   */
  deathLift?: number;
  /**
   * Morte com elevação por tempo (em vez de `deathLift`): [[segundos, elevação], ...] em unidades do modelo, somada ao `hover`.
   * Usada pelo cultista (bongun), onde a elevação constante deixava o corpo afundado no impacto e alto no repouso. Ver liftCurve.
   */
  deathLiftCurve?: ReadonlyArray<readonly [number, number]>;
  /**
   * Cauda do dino (quadril): vértices atrás do quadril (z de `from` a `to`, unidades do modelo) sobem `amount` em degrau suave
   * no bind. Corrige a ponta que a inclinação do quadril (idle) puxava 0,2 a 0,4 abaixo do chão. Ver raiseTail.
   */
  tailLift?: { from: number; to: number; amount: number };
  /** Respiração no ar: o corpo sobe e desce `amp` metros em `period` segundos; a sombra de contato acompanha. */
  float?: { amp: number; period: number };
  /** Pose de descanso: 'ibm' = a do próprio arquivo (matrizes de bind); padrão = a dos nós do GLB. */
  bind?: 'ibm';
  /** Variantes de cor: texturas alternativas no mesmo atlas do GLB (cada inimigo sorteia uma, ou a original). */
  skins?: string[];
  /** Nome de cada variante de `skins`, na mesma ordem (ex.: 'gelo'). */
  skinNames?: string[];
  /**
   * Cores que o monstro pode ter por zona: chave = id da zona ou tema (id vence). Com entrada, nunca sai cor de
   * fora da zona em jogo ('azul' = o original do modelo). Sem entrada, sorteia entre todas (zumbis).
   */
  themeColors?: Record<string, string[]>;
  /** Armas presas nos ossos da mão (para modelos que vêm de mãos vazias); accent = cor do brilho. */
  weapons?: { type: 'bow' | 'dagger' | 'axe' | 'sword' | 'greatsword' | 'shield'; bone: string; accent?: number; tilt?: number; rot?: [number, number, number]; scale?: number; pos?: [number, number, number] }[];
}

/**
 * Juntas de um GLB sem esqueleto (auto-rig), em unidades do modelo: pés em y = 0, frente em +Z, lado esquerdo
 * em +X (o direito é espelhado). `armX` = |x| a partir do qual o corpo vira braço; `crotchY` = altura da
 * entreperna. Opcionais: `armZ` (só vira braço o vértice com |z| menor), `armMinY` e `armMaxY` (faixa de
 * altura do braço): capa, cabelo e tiras de quadril seguem o tronco, não o braço.
 */
export interface RigJointsVisual {
  root: [number, number, number];
  hips: [number, number, number];
  spine: [number, number, number];
  chest: [number, number, number];
  neck: [number, number, number];
  head: [number, number, number];
  shoulder: [number, number, number];
  upperArm: [number, number, number];
  foreArm: [number, number, number];
  hand: [number, number, number];
  thigh: [number, number, number];
  shin: [number, number, number];
  foot: [number, number, number];
  armX: number;
  crotchY: number;
  armZ?: number;
  armMinY?: number;
  armMaxY?: number;
  armOverLeg?: boolean;
  armOverLegX?: number;
}

/**
 * Bárbaro (versão otimizada de 1,5 MB do barbaridade.glb do dono): juntas medidas no corte da malha. É um chibi de
 * pernas curtas e braços abertos; a detecção automática punha o quadril nos joelhos e a capa e as tiras do quadril
 * no braço (a pele se rasgava no golpe). Medido com o giro de -90° do otimizador (frente em +Z).
 */
const BARBARIAN_JOINTS: RigJointsVisual = {
  root: [0, 0, 0],
  hips: [0, 0.36, 0],
  spine: [0, 0.46, 0],
  chest: [0, 0.6, 0],
  neck: [0, 0.71, 0],
  head: [0, 0.76, 0],
  shoulder: [0.1, 0.62, 0],
  upperArm: [0.15, 0.56, 0],
  foreArm: [0.19, 0.43, 0],
  hand: [0.22, 0.31, 0],
  thigh: [0.09, 0.33, 0],
  shin: [0.11, 0.13, 0],
  foot: [0.12, 0.04, 0.02],
  armX: 0.15,
  crotchY: 0.19,
  armZ: 0.07,
  armMinY: 0.36,
  armMaxY: 0.66,
};

/** Heróis avançados (GLB com o mesmo esqueleto padrão). Até carregar, usam o modelo de uma classe parecida. */
export const HERO_MODELS: Record<string, MonsterModelVisual> = {
  // Guerreiro (modelo 3D do dono, 2,4 MB): espada e escudo presos nas mãos; animações pelo bind do arquivo
  warrior: {
    file: 'models/guerreiro.glb', height: 1.9, walkRate: 1, ghost: [0.35, 1.25, 1.0], clips: 'warriorUAL', bind: 'ibm',
    // espada na mão direita: punho no centro da palma, lâmina inclinada para a frente (-120°); escudo na esquerda
    weapons: [{ type: 'sword', bone: 'RightHand', accent: 0xffd67a, tilt: -120, pos: [0, 0.07, 0] }, { type: 'shield', bone: 'LeftHand', accent: 0xffd67a }],
  },
  // Crusado (2ª vocação do Guerreiro): mesmo esqueleto e a mesma espada e escudo do guerreiro; modelo do dono otimizado.
  // O descanso da mão deste GLB é outro: sem ajuste, a face do escudo ficava 63° fora da do guerreiro (ponta para cima) e a
  // lâmina 25° a 35° fora. As rotações abaixo alinham escudo e espada à pegada do guerreiro no parado, no andar, no golpe e
  // na investida (cosseno da face/lâmina em relação ao guerreiro: de 0,46 e 0,85 para 1,00 e 0,99; medido no bind dos dois GLB).
  crusado: { file: 'models/crusado.glb', height: 1.95, walkRate: 1, ghost: [0.35, 1.25, 1.0], clips: 'warriorUAL', bind: 'ibm',
    weapons: [{ type: 'sword', bone: 'RightHand', accent: 0xffd67a, rot: [-130, -30, 40], pos: [0, 0.07, 0] }, { type: 'shield', bone: 'LeftHand', accent: 0xffd67a, rot: [-40, -50, -30] }],
  },
  // Cléria (arte do jogador → 3D): cajado com cristal e livro; animações da Maga
  mage: { file: 'models/cleria.glb', height: 1.9, walkRate: 1, ghost: [0.55, 0.8, 1.6], clips: 'mage' },
  // Líria (modelo do V2Fun no esqueleto padrão): animações da Arqueira
  archer: { file: 'models/liria.glb', height: 1.9, walkRate: 1, ghost: [0.5, 1.4, 0.6], clips: 'archer', weapons: [{ type: 'bow', bone: 'hand.L', accent: 0x9aff7a }] },
  // Feiticeira: modelo da maga (2,3 MB, 47 mil vértices, textura 1024 px). Sem animações próprias: usa o conjunto do
  // guerreiro (mesmo esqueleto Mixamo de 61 ossos) com a pose de descanso do arquivo. O conjunto do cultista deixa a figura achatada.
  sorcerer: { file: 'models/sorcerer.glb', height: 1.75, walkRate: 1, ghost: [1.2, 0.55, 1.8], clips: 'warriorRig', bind: 'ibm' },
  // Bruxa: modelo novo (2,3 MB, 47 mil vértices, textura WebP de 1024 px, sem redistribuir pesos). Sem animações próprias:
  // usa o conjunto do guerreiro com a pose de descanso do arquivo (o conjunto do cultista deixa a figura achatada).
  warlock: { file: 'models/warlock.glb', height: 1.75, walkRate: 1, ghost: [1.6, 0.25, 0.6], clips: 'warriorRig', bind: 'ibm' },
  // Hypnomancer (2ª forma da Bruxa, a vocação de nível 10): modelo do dono, mais alto que a bruxa (proporção de adulto).
  hypnomancer: { file: 'models/hypnomancer.glb', height: 1.9, walkRate: 1, ghost: [1.6, 0.25, 0.6], clips: 'warriorRig', bind: 'ibm' },
  // Cavaleiro sombrio (modelo do V2Fun no esqueleto padrão): animações de golpe do Guerreiro (corpo a corpo)
  assassin: { file: 'models/assassin_dk.glb', height: 1.9, walkRate: 1.05, ghost: [1.6, 1.3, 0.3], clips: 'warrior', weapons: [{ type: 'dagger', bone: 'hand.R', accent: 0xc070ff }, { type: 'dagger', bone: 'hand.L', accent: 0xc070ff }] },
  // Bárbaro (vocação do Guerreiro): modelo do dono sem esqueleto → auto-rig com as juntas medidas acima. Animações:
  // captura UAL no descanso, andar, dano e morte; socos no golpe (soco rápido) e na investida (soco cruzado). Sem arma: o arquivo vem sem ela.
  barbarian: { file: 'models/barbarian.glb', height: 1.9, walkRate: 1, ghost: [0.35, 1.25, 1.0], clips: 'barbarianUAL', rig: 'auto', juntas: BARBARIAN_JOINTS },
};
/** Zumbi do Ato III: coveiro, afogado, pesteado, luto e cinzas (além da cor original do modelo). */
const ZOMBIE_SKINS = ['coveiro', 'afogado', 'pesteado', 'luto', 'cinzas'].map((n) => `models/zombie_${n}.jpg`);
/** Dino: cores além do azul original (o corpo azul). Cada arquivo é uma textura alternativa do mesmo GLB. */
const DINO_SKIN_NAMES = ['gelo', 'deserto', 'grama', 'sombra'];
const DINO_SKINS = DINO_SKIN_NAMES.map((n) => `models/dino_${n}.webp`);
/**
 * Cor do dino por zona: cada zona só mostra as próprias cores (nada de dino verde no gelo nem azul no deserto).
 * A chave é o id da zona (ex.: 'frostPass') ou o tema (ex.: 'desert'); o id vence o tema.
 * 'azul' = o original do modelo. Ponte e cidade seguem o verde da grama.
 */
const DINO_THEME_COLORS: Record<string, string[]> = {
  frostPass: ['azul', 'gelo'], // Passo da Geada: azul e branco
  rustGorge: ['sombra'], // Garganta de Ferrugem (montanha, mas não é gelo): violeta escuro
  desert: ['deserto'], // deserto: amarelo e vermelho
  forest: ['grama'], // floresta: verde
  plains: ['grama'], // campos: verde
  bridge: ['grama'],
  town: ['grama'],
  ash: ['sombra'], // cinzas: violeta escuro
};
/** Campos comuns de todo modelo de dino (mesmo arquivo, mesmas cores por tema). */
const DINO_COLORS = { skins: DINO_SKINS, skinNames: DINO_SKIN_NAMES, themeColors: DINO_THEME_COLORS };
/** Raydric (pedra animada): mesmas 4 cores do dino, com o original bege fora (o levantamento não o indicou para zona nenhuma). */
const RAYDRIC_SKIN_NAMES = ['gelo', 'deserto', 'grama', 'sombra'];
const RAYDRIC_SKINS = RAYDRIC_SKIN_NAMES.map((n) => `models/raydric_${n}.webp`);
/** Cor do raydric por zona (id vence tema). Mesma regra do dino: cada zona só mostra as próprias cores. */
const RAYDRIC_THEME_COLORS: Record<string, string[]> = {
  frostPass: ['gelo'], // Passo da Geada
  rustGorge: ['sombra'], // Garganta de Ferrugem
  desert: ['deserto'], // deserto (redDunes, solarRuins)
  forest: ['grama'], // floresta
  plains: ['grama'], // campos
  bridge: ['grama'],
  town: ['grama'],
  ash: ['sombra'], // cinzas (ashPeak)
};
/**
 * Detarderus (malha de 1,89 unidades, pés em 0, frente em +Z): esqueleto novo, com as juntas medidas no corte da malha
 * (a detecção automática punha a virilha em 14% da altura, e ela fica em 27%). Pernas de 0 a 27%, quadril em 31%,
 * peito em 51%, pescoço em 62%, cabeça em 72%. Os braços saem dos ombros, em torno de 61%. Cauda do lado +X: não tem osso
 * próprio, segue o quadril.
 */
const DETARDERUS_JOINTS: RigJointsVisual = {
  root: [0, 0, 0],
  hips: [0, 0.586, 0],
  spine: [0, 0.74, 0],
  chest: [0, 0.97, 0],
  neck: [0, 1.17, 0],
  head: [0, 1.36, 0],
  shoulder: [0.5, 1.15, 0],
  upperArm: [0.7, 0.97, 0],
  foreArm: [0.85, 0.72, 0],
  hand: [0.9, 0.5, 0],
  thigh: [0.12, 0.45, 0],
  shin: [0.12, 0.227, 0],
  foot: [0.12, 0.05, 0.1],
  armX: 0.7,
  crotchY: 0.51,
  // mãos chegam quase à virilha: o braço ganha da perna nessa faixa (sem isso a mão ficava presa à coxa e esticava)
  armMinY: 0.2,
  armMaxY: 1.15,
  armOverLeg: true,
  armOverLegX: 0.45,
};
/**
 * Palhaço (malha de 0,98 unidades, pés em 0): juntas medidas no corte da malha. Pernas curtas (virilha em 15% da altura),
 * cintura em 20%, peito em 46%, cabeça em 70%, braços pendidos ao longo do tronco.
 */
const PALHACO_JOINTS: RigJointsVisual = {
  root: [0, 0, 0],
  hips: [0, 0.24, 0],
  spine: [0, 0.32, 0],
  chest: [0, 0.45, 0],
  neck: [0, 0.548, 0],
  head: [0, 0.685, 0],
  shoulder: [0.12, 0.49, 0],
  upperArm: [0.2, 0.44, 0],
  foreArm: [0.22, 0.3, 0],
  hand: [0.22, 0.2, 0],
  thigh: [0.08, 0.25, 0],
  shin: [0.08, 0.12, 0],
  foot: [0.08, 0.03, 0.04],
  armX: 0.22,
  crotchY: 0.147,
  armMinY: 0.2,
  armMaxY: 0.55,
};
/** Boneco de treino (espantalho de manto, sem pernas visíveis): juntas aproximadas, só para a pele não rasgar no golpe. */
const DUMMY_JOINTS: RigJointsVisual = {
  root: [0, 0, 0],
  hips: [0, 0.24, 0],
  spine: [0, 0.38, 0],
  chest: [0, 0.55, 0],
  neck: [0, 0.72, 0],
  head: [0, 0.84, 0],
  shoulder: [0.12, 0.62, 0],
  upperArm: [0.16, 0.56, 0],
  foreArm: [0.16, 0.42, 0],
  hand: [0.15, 0.3, 0],
  thigh: [0.06, 0.12, 0],
  shin: [0.06, 0.06, 0],
  foot: [0.07, 0.01, 0.03],
  armX: 0.16,
  crotchY: 0.16,
  armMinY: 0.3,
  armMaxY: 0.62,
};
/** Machado de batalha do orc: mão direita, cabo inclinado 35° para baixo, brilho do gume avermelhado. */
const ORC_AXE = { type: 'axe' as const, bone: 'hand.R', accent: 0xff7040, tilt: 35, scale: 1.35 };
/** Machado do Krexx: o arquivo do goblin usa os nomes do rig Mixamo (RightHand). */
const KREXX_AXE = { type: 'axe' as const, bone: 'RightHand', accent: 0xff7040, tilt: 35, scale: 1.2 };
/** Cauda do dino (bind, unidades do modelo): z de -0,2 (começa a subir) a -0,8 (ponta), 0,35 de altura. Medido em fluidez (idle). */
const DINO_TAIL = { from: -0.2, to: -0.8, amount: 0.35 };
/**
 * Morte do Bongun (cultista, rig Mixamo): elevação extra do quadril por tempo (segundos; unidades do modelo), somada ao
 * `hover`. Medida na pose do clipe com o próprio modelo (varredura do clipe congelado, medição em browser): sem elevação,
 * o ponto mais baixo da malha chega a -0,69 unidade de mundo no impacto (~1,05 s). A curva sobe só o que falta para ele
 * ficar na folga de 0,08 unidade de mundo, e fica em 0,16 no repouso. Antes do impacto vale 0 (a queda começa de pé).
 */
const BONGUN_DEATH_LIFT: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [0.8, 0], [0.85, 0.002], [0.875, 0.057], [0.9, 0.111], [0.925, 0.152], [0.95, 0.193], [0.975, 0.231], [1, 0.27],
  [1.025, 0.3], [1.05, 0.331], [1.075, 0.324], [1.1, 0.317], [1.125, 0.287], [1.15, 0.258], [1.175, 0.232], [1.2, 0.206],
  [1.3, 0.167], [1.4, 0.16], [2.4, 0.159],
];
export const MONSTER_MODELS: Record<string, MonsterModelVisual> = {
  // Ato I — ratos
  rat: { file: 'models/rato.glb', height: 1.45, walkRate: 1.3, },
  ratRunner: { file: 'models/rato.glb', height: 1.15, walkRate: 2.4, },
  ratBrute: { file: 'models/rato.glb', height: 1.95, walkRate: 0.85, },
  ratNecro: { file: 'models/rato.glb', height: 1.5, walkRate: 1.2, aura: [0.7, 0.2, 1.6] },
  ratElite: { file: 'models/ratochefe.glb', height: 2.4, walkRate: 0.85, aura: [0.9, 0.3, 1.8] },
  ratBoss: { file: 'models/ratochefe.glb', height: 3.1, walkRate: 0.9, aura: [1.6, 0.15, 0.4] },
  // Ato II — goblins: um modelo só (goblin.glb, com textura e esqueleto Mixamo de 21 ossos) para todos os tipos comuns.
  // Os tipos mudam tamanho, velocidade e aura, não o modelo. Clipes do guerreiro (warriorRig, por direção de membro) + pose de descanso = bind do arquivo. O retarget UAL do cultista deixava as pernas viradas nestes rigs (pés no ar).
  goblin: { file: 'models/goblin.glb', height: 1.6, walkRate: 1.3, clips: 'monsterRig', bind: 'ibm', deathLift: 0.4 },
  goblinRunner: { file: 'models/goblin.glb', height: 1.3, walkRate: 2.4, clips: 'monsterRig', bind: 'ibm', deathLift: 0.4 },
  goblinBrute: { file: 'models/goblin.glb', height: 2.0, walkRate: 0.85, clips: 'monsterRig', bind: 'ibm', deathLift: 0.4 },
  goblinNecro: { file: 'models/goblin.glb', height: 1.65, walkRate: 1.2, clips: 'monsterRig', bind: 'ibm', aura: [0.7, 0.2, 1.6], deathLift: 0.4 },
  goblinElite: { file: 'models/goblin.glb', height: 2.5, walkRate: 0.85, clips: 'monsterRig', bind: 'ibm', aura: [0.9, 0.3, 1.8], deathLift: 0.4 },
  goblinBoss: { file: 'models/goblinboss.glb', height: 3.4, walkRate: 0.9, aura: [2.0, 1.4, 0.3] },
  // Ato III — zumbi chibi (V2Fun no esqueleto padrão), animações de zumbi do jogo; 5 variantes fúnebres de cor
  zombie: { file: 'models/zombie.glb', height: 1.6, walkRate: 1.3, clips: 'zombie', skins: ZOMBIE_SKINS },
  zombieRunner: { file: 'models/zombie.glb', height: 1.35, walkRate: 2.4, clips: 'zombieRunner', skins: ZOMBIE_SKINS },
  zombieBrute: { file: 'models/zombie.glb', height: 2.0, walkRate: 0.85, clips: 'zombieBrute', skins: ZOMBIE_SKINS },
  // Bongun (necromante): não anda, flutua. `hover` = altura-base do corpo (unidades do modelo); `float` = sobe e desce
  // 9 cm em torno dela a cada 2,6 s (os pés ficam ~32 cm do chão, então há folga), com a sombra de contato respirando junto.
  zombieNecro: { file: 'models/bongun.glb', height: 1.7, walkRate: 1.2, clips: 'cultist', hover: 0.08, float: { amp: 0.09, period: 2.6 }, aura: [0.7, 0.2, 1.6], deathLiftCurve: BONGUN_DEATH_LIFT },
  // Ato III — orc guerreiro chibi (V2Fun): golpe de machado por cima vem do próprio GLB, o resto é do brutamonte
  orcWarrior: { file: 'models/orc.glb', height: 2.3, walkRate: 0.85, clips: 'brute', aura: [0.9, 0.3, 1.8], weapons: [ORC_AXE] },
  orcLord: { file: 'models/orc.glb', height: 3.3, walkRate: 0.9, clips: 'brute', aura: [1.6, 0.15, 0.4], weapons: [ORC_AXE] },
  // Dino (família do Ato II): esqueleto de 57 ossos no padrão do cultista; pose de descanso = bind do arquivo;
  // movimentos do guerreiro (warriorRig, por direção de membro). Grunt/corredor/brutamonte/necromante e mini-chefe (dinoBoss).
  dino: { file: 'models/dino.glb', height: 1.8, walkRate: 1.2, clips: 'monsterRig', bind: 'ibm', ...DINO_COLORS, tailLift: DINO_TAIL },
  dinoRunner: { file: 'models/dino.glb', height: 1.5, walkRate: 2.2, clips: 'monsterRig', bind: 'ibm', ...DINO_COLORS, tailLift: DINO_TAIL },
  dinoBrute: { file: 'models/dino.glb', height: 2.3, walkRate: 0.85, clips: 'monsterRig', bind: 'ibm', ...DINO_COLORS, tailLift: DINO_TAIL },
  dinoNecro: { file: 'models/dino.glb', height: 1.7, walkRate: 1.2, clips: 'monsterRig', bind: 'ibm', aura: [0.7, 0.2, 1.6], ...DINO_COLORS, tailLift: DINO_TAIL },
  // Mini-chefe (tipo próprio de inimigo, como o Krexx): dino maior, com aura âmbar; mesma regra de cor por tema
  dinoBoss: { file: 'models/dino.glb', height: 2.6, walkRate: 0.9, clips: 'monsterRig', bind: 'ibm', aura: [1.2, 0.8, 0.2], ...DINO_COLORS, tailLift: DINO_TAIL },
  // Raydric (tipo 'raydric' da simulação, pesado comum): modelo de pedra com 57 ossos; clipes do guerreiro (o do cultista achata a figura); pose de descanso =
  // bind do arquivo. Altura 2,3 m (malha de 1,87 unidades, escala 1,23×). walkRate 0,75 = 0,85 do brutamonte × 10/12 ticks.
  raydric: { file: 'models/raydric.glb', height: 2.3, walkRate: 0.75, clips: 'monsterRig', bind: 'ibm', skins: RAYDRIC_SKINS, skinNames: RAYDRIC_SKIN_NAMES, themeColors: RAYDRIC_THEME_COLORS },
  // Mini-chefe goblin (líder da tribo, tipo próprio 'goblinLeader'): modelo do dono de 67 MB otimizado para 2,5 MB, sem recolor.
  // Clipes do guerreiro: o do cultista achata a figura (testado na vitrine). Pose de descanso = bind do arquivo; aura âmbar como o dino-chefe.
  goblinLeader: { file: 'models/goblin_leader.glb', height: 2.8, walkRate: 0.9, clips: 'goblinBossRig', bind: 'ibm', aura: [1.2, 0.8, 0.2] },
  // Krexx retorcido (mini-chefe do Passo Gélido): mesmo arquivo do Krexx pequeno, pelo caminho do líder goblin (esqueleto do arquivo)
  // walkRate 1,75 com a passada de krexxAnims.ts (PASSADA 2,5): deriva média do pé apoiado +0,27 m/s (era +1,18); ver krexxWarlordClips.
  goblinWarlord: { file: 'models/goblin_warlord.glb', height: 2.9, walkRate: 1.75, clips: 'krexxWarlord', bind: 'ibm', aura: [1.6, 0.15, 0.4], weapons: [KREXX_AXE] },
  // Chefe lendário do Bastião (a cada 100 noites): modelo do dono (satanmorroc.glb), esqueleto Mixamo de 61 ossos.
  satanMorroc: { file: 'models/satanmorroc.glb', height: 3.2, walkRate: 0.9, clips: 'warriorRig', bind: 'ibm', aura: [1.6, 0.15, 0.4] },
  // Boneco de treino (Arena do Dev Lab, tipo 'trainingDummy'): só dev, não anda nem ataca. Malha sem esqueleto e de manto
  // (sem pernas visíveis): auto-rig com juntas aproximadas e o conjunto do bárbaro (idle e reação ao golpe).
  trainingDummy: { file: 'models/dummy_de_treino.glb', height: 1.8, walkRate: 1, rig: 'auto', clips: 'barbarianUAL', juntas: DUMMY_JOINTS },
  // Palhaço (tipo 'palhaco', Ato III): malha sem esqueleto; auto-rig com juntas medidas (a detecção automática punha a
  // virilha nos pés) e o conjunto do bárbaro (andar, golpe, dano, morte).
  palhaco: { file: 'models/palhaco.glb', height: 1.4, walkRate: 2, rig: 'auto', clips: 'barbarianUAL', juntas: PALHACO_JOINTS },
  // Detarderus (mini-chefe do Passo da Geada, Ato III, tipo 'detarderus'): modelo do dono otimizado (2,5 MB, bordas travadas
  // na simplificação para não abrir buracos). Esqueleto do jogo (auto-rig com as juntas acima) e clipes do bárbaro.
  detarderus: { file: 'models/detarderuspai.glb', height: 2.9, walkRate: 0.8, rig: 'auto', clips: 'barbarianUAL', juntas: DETARDERUS_JOINTS, aura: [1.2, 0.8, 0.2] },
};

/**
 * Visual dos inimigos por ato (índice = act do world.ts). Só troca o MODELO — a simulação
 * continua usando o tipo original (grunt, runner...), então stats, drops e aggro não mudam.
 * Ato III: zumbi chibi em várias cores; elite e Senhor Orc = orc guerreiro chibi com machado.
 */
export const ACT_MONSTERS: Record<number, Record<string, string>> = {
  0: { grunt: 'rat', runner: 'ratRunner', brute: 'ratBrute', necro: 'ratNecro', elite: 'ratElite', boss: 'ratBoss', boss2: 'ratBoss' },
  1: { grunt: 'goblin', runner: 'goblinRunner', brute: 'goblinBrute', necro: 'goblinNecro', elite: 'goblinElite', boss: 'goblinBoss', boss2: 'goblinBoss' },
  // elite = orc guerreiro; Senhor Orc (chefe final) = o mesmo orc, maior e com aura vermelha
  2: { grunt: 'zombie', runner: 'zombieRunner', brute: 'zombieBrute', necro: 'zombieNecro', elite: 'orcWarrior', orcboss: 'orcLord' },
};

/**
 * Visual dos inimigos do Último Bastião (só o modelo; a simulação e os números não mudam). A horda não tem ato,
 * então não usa ACT_MONSTERS: cada tipo sai com o seu GLB de alta qualidade do dono, nunca com a forma procedural.
 * Comuns = zumbis (a horda chama Zumbi, Corredor e Pesado); necromante = Bongun; elite = orc com machado.
 * Mini-chefes e chefes = os modelos dedicados. `goblinImp` (Krexx pequeno) é registrado pelo main.ts, com o GLB do Krexx.
 */
export const BASTION_MONSTERS: Record<string, string> = {
  grunt: 'zombie',
  runner: 'zombieRunner',
  brute: 'zombieBrute',
  raydric: 'raydric',
  necro: 'zombieNecro',
  elite: 'orcWarrior',
  goblinImp: 'goblinImp',
  goblinWarlord: 'goblinWarlord',
  dinoBoss: 'dinoBoss',
  goblinLeader: 'goblinLeader',
  boss: 'ratBoss',
  boss2: 'goblinBoss',
  orcboss: 'orcLord',
};

/** Setas discretas no chão mostrando o caminho que a horda tende a seguir (spawn → alvo). */
export const PATH_ARROWS = {
  enabled: true,
  spacing: 3, // tiles entre setas
  skipStart: 2, // tiles livres perto do portal
  skipEnd: 2, // tiles livres perto do alvo
  size: 0.72,
  opacity: 0.13,
  pulse: 0.3, // variação da opacidade (fração)
  pulseSpeed: 1.1,
  color: 0xfff0d0,
  height: 0.016,
  maxSteps: 400,
};

/**
 * Peças do acampamento dos monstros: GLB com textura (public/models/props: arte do dono e `camp/`, procedural).
 * `base` = altura da parte mais baixa do modelo (sem escala); o cenário a encosta no chão (y = 0).
 */
const ACT_PECAS = {
  // procedurais (scripts/gerarPropsAcampamento.py): buraco, ossos, queimado, totem e estandarte não existiam na biblioteca
  buraco: { path: 'camp/buraco_toca', escala: 0.85, base: 0 },
  montinho: { path: 'survival/rock-a', escala: 1.5, base: 0 },
  montao: { path: 'survival/rock-c', escala: 1.8, base: 0 },
  cama: { path: 'survival/bedroll', escala: 2.0, base: -0.05 },
  saco: { path: 'survival/box', escala: 2.0, base: 0 },
  sacoAberto: { path: 'survival/box-large-open', escala: 2.0, base: 0 },
  barrica: { path: 'survival/barrel-open', escala: 2.2, base: 0 },
  troncos: { path: 'survival/tree-log', escala: 1.1, base: -0.11 },
  fogueiraQueimada: { path: 'survival/campfire-pit', escala: 2.4, base: 0 },
  balde: { path: 'survival/bucket', escala: 2.2, base: 0 },
  tabuas: { path: 'survival/resource-planks', escala: 2.2, base: 0 },
  ossos: { path: 'camp/pilha_ossos', escala: 1.6, base: 0 },
  queimado: { path: 'camp/marca_queimado', escala: 0.95, base: 0 },
  totem: { path: 'camp/totem_caveira', escala: 1.2, base: 0 },
  cerca: { path: 'survival/fence-fortified', escala: 2.2, base: 0 },
  estandarte: { path: 'camp/estandarte_orc', escala: 1.2, base: 0 },
} as const;

export type ActPeca = keyof typeof ACT_PECAS;

/**
 * Cenário temático dos monstros do ato, espalhado em volta de cada portal de spawn (só visual).
 * `escala` 1 = 1 tile; a base de cada modelo fica em y = 0 (nada flutua nem afunda).
 */
export const ACT_DRESSING = {
  radiusMin: 1.6,
  radiusMax: 5.5,
  flatPerSpawn: 7, // peças baixas (tocas, fogueiras, caixas) — podem ficar no chão andável
  tallPerSpawn: 4, // peças altas (totens, estandartes, cercas) — só em tiles bloqueados
  pecas: ACT_PECAS,
  /** Kit de cada ato (0 = Ato I, 1 = Ato II, 2 = Ato III). `baixas` ficam no chão; `altas` só em tiles bloqueados. */
  atos: {
    // Ato I — toca de ratos
    0: { baixas: ['buraco', 'buraco', 'cama', 'saco', 'montinho'], altas: ['sacoAberto', 'montao', 'barrica'] },
    // Ato II — acampamento goblin
    1: { baixas: ['troncos', 'balde', 'tabuas', 'ossos'], altas: ['totem', 'cerca', 'totem'] },
    // Ato III — acampamento orc
    2: { baixas: ['queimado', 'fogueiraQueimada', 'ossos', 'tabuas'], altas: ['estandarte', 'cerca', 'estandarte'] },
  } as Record<number, { baixas: ActPeca[]; altas: ActPeca[] }>,
};

/**
 * Ato III — Tempestade no Cume das Cinzas (protótipo; só visual: a grade e a simulação não mudam).
 * `ativo: false` volta ao cenário de antes (lava, névoa quente, sem chuva, sem raios nem ruínas).
 * `zonas`: quais zonas recebem o clima. O Covil do Detarderus (também do Ato III) fica de fora por enquanto.
 * O céu (public/textures/cenario/ceu_tempestade.webp, de scripts/gerarCeuTempestade.py) usa o mesmo `horizonte`
 * desta config: mude os dois juntos.
 */
export const ATO3_TEMPESTADE = {
  ativo: true,
  zonas: ['ashPeak'] as readonly string[],
  /** Névoa e fundo frios. `horizonte` é a cor da névoa e a do horizonte do céu (tem que bater com o WebP). */
  horizonte: 0x2a3340,
  fundo: 0x161c26,
  /** Névoa mais densa e fria: `near`/`far` em tiles (escalam com o zoom, como a névoa comum); placas = nevoeiro baixo à deriva. */
  nevoa: { near: 14, far: 34, cor: 0x7d8ea6, opacidade: 0.2, placas: 14 },
  /** Luz mais fria: céu azul-acinzentado no ambiente, luar pálido. A direção do sol continua a da zona. */
  luz: { sky: 0x9fb6d4, ground: 0x2a3140, sun: 0xbcd0ec, hemi: 0.95, lua: 1.25, exposicao: 1.08 },
  /** Gradiente da pós-produção (topo, meio, base): cinza-azulado frio no lugar do brasa. */
  gradiente: ['#A9BED8', '#3E4B5E', '#121722'] as readonly string[],
  /** Chuva leve: linhas finas que caem em loop. `velocidade` em tiles/s (sorteada por gota); `area` = meia-largura em X e Z. */
  chuva: { gotas: 260, altura: 14, comprimento: 0.9, velocidade: [11, 16] as readonly number[], inclinacao: 0.18, cor: 0x9fb4cc, opacidade: 0.32, area: [24, 22] as readonly number[] },
  /**
   * Relâmpagos: intervalo sorteado entre dois raios (s), duração do clarão (s), força do clarão no chão (0..1; baixa,
   * para não piscar), brilho extra do céu no raio e a cor. `raio` = o traço visível nas laterais (vida em s e opacidade).
   */
  relampago: { intervalo: [7, 16] as readonly number[], duracao: 0.7, clarao: 0.09, cor: 0xcfe0ff, brilhoCeu: 0.15, raio: { vida: 0.35, opacidade: 0.9 } },
  /**
   * Ruínas flutuando fora da grade: distância (tiles) além da borda do tabuleiro, altura do chão (m), escala e o balanço
   * (amplitude em m, velocidade em rad/s, giro em rad). `sombra` = tamanho (tiles) da mancha de contato no chão.
   */
  ruinas: {
    quantidade: 8,
    distancia: [2.5, 7] as readonly number[],
    altura: [2.2, 4.6] as readonly number[],
    escala: [1.1, 1.7] as readonly number[],
    balancoAltura: 0.2,
    balancoVelocidade: 0.45,
    balancoGiro: 0.03,
    sombra: 2.4,
    /** Cor que as peças puxam (multiplica a textura do pacote): pedra fria e escura. */
    tom: 0x9aa4b4,
    pecas: ['castle/tower-square-mid-windows', 'castle/tower-hexagon-mid', 'castle/rocks-large', 'castle/rocks-small', 'town/pillar-stone', 'survival/rock-b'] as readonly string[],
  },
  /** Céu: textura gerada e raio da esfera (fica além da borda do mapa; a câmera só a vê com zoom aberto). */
  ceu: { textura: 'ceu_tempestade.webp', raio: 120 },
} as const;

/**
 * Ato IV — Ilhas e nuvens (protótipo, só visual; a flag e os números estão aqui). A arena vira uma ilha flutuante
 * sobre um mar de nuvens, com ilhas e peças em volta (ceuIlhas.ts). Texturas e peças são as do dono (public/textures/ato4).
 * Com `ativo: false` o cenário volta exatamente ao de antes. O cenário da zona (obstáculos da grade e decoração dentro do
 * tabuleiro) continua; sai só o chão de terra/neve e a decoração externa (buildBiomeScenery, opção `ceuIlhas`).
 * Coordenadas das ilhas e peças: mundo, com o centro do tabuleiro em (0, 0) (o tabuleiro vai de -W/2 a W/2 em X e -H/2 a H/2 em Z).
 */
export const ATO4_CEU_ILHAS = {
  ativo: true,
  /** Zona de prévia (ato ainda não existe no jogo): uma zona do Ato III, sem a tempestade. */
  zonas: ['frostPass'] as readonly string[],
  /** Pasta das texturas do Ato IV (chão, mar, brilho) e das peças recortadas (`pecas/`, com alfa). */
  dir: 'textures/ato4/',
  /** Névoa e fundo na cor do horizonte (tem que bater com o degradê do céu). */
  horizonte: 0xc7e0f5,
  fundo: 0xa9cfef,
  /** Névoa em tiles (escala com o zoom, como a comum): as ilhas do fundo somem no céu. */
  nevoa: { near: 24, far: 70 },
  /** Luz do dia claro: céu azul no ambiente, sol quente. A direção do sol continua a da zona. */
  luz: { sky: 0xeaf4ff, ground: 0xcdbb8a, sun: 0xfff2cf, hemi: 1.0, lua: 1.15, exposicao: 1.12 },
  /** Gradiente da pós-produção (topo, meio, base): azul claro no alto, dourado no horizonte. */
  gradiente: ['#79A9E0', '#CFE5F8', '#F7EBC9'] as readonly string[],
  /** Céu: esfera por dentro com degradê de três cores (topo, meio e base). `raio` além da borda do mapa. */
  ceu: { raio: 150, topo: 0x5a8ccc, meio: 0xc3ddf4, base: 0xf6ebc8 },
  /**
   * Chão da arena: pedra clara (chão), azulejo dourado (portão e praça), grama (raízes) e a borda da ilha: uma faixa
   * de grama de `borda` tiles além da grade e um flanco de rocha de `flanco` tiles de altura. `porTextura` = tiles por imagem.
   */
  chao: { pedra: 'pedra_clara.webp', azulejo: 'azulejo_dourado.webp', grama: 'grama_ilha.webp', rocha: 'rocha_ilha.webp', porTextura: 4, borda: 3, flanco: 4 },
  /**
   * Mar de nuvens sob a ilha: duas camadas (altura Y, tiles por imagem, deriva em tiles/s e opacidade). A extensão cobre
   * o horizonte (a névoa apaga a borda). A sombra das ilhas cai nele; `sombra` = textura, cor, opacidade e a escala da mancha.
   */
  mar: {
    textura: 'nuvem.webp',
    extensao: 320,
    camadas: [
      { y: -6.5, tilesPorImagem: 14, velocidade: 0.12, opacidade: 0.96 },
      { y: -10, tilesPorImagem: 9, velocidade: -0.07, opacidade: 0.6 },
    ] as readonly { y: number; tilesPorImagem: number; velocidade: number; opacidade: number }[],
    sombra: { textura: 'textures/cenario/sombra_contato.webp', cor: 0x2b4670, opacidade: 0.28, escala: 1.25 },
  },
  /** Sombra de contato sob as peças da borda (no chão da ilha): opacidade e cor. */
  contato: { textura: 'textures/cenario/sombra_contato.webp', cor: 0x2a2014, opacidade: 0.5 },
  /** Brilho azul (arte do dono) atrás dos cristais: cor multiplicada (aditiva), tamanho em tiles. */
  brilho: { textura: 'brilho_azul.webp', cor: [0.5, 0.8, 1.3] as readonly number[], tamanho: 3.2 },
  /**
   * Ilhas flutuantes em volta. `x`, `z` = centro; `y` = base da arte (sobe e desce com `balanco`, em tiles, a `velocidade`
   * em rad/s); `altura` = altura da arte em tiles (a largura sai da proporção da imagem). O topo da grama fica perto de
   * 0,65 × `altura` acima da base: as ilhas ligadas por ponte têm esse topo no nível da arena (y = 0). A faixa do norte
   * aparece acima da arena na visão aberta; as laterais só aparecem com a câmera mais afastada.
   */
  ilhas: {
    balanco: 0.22,
    velocidade: 0.35,
    lista: [
      { peca: 'ilha_arvore', x: 31, z: -14, y: -4.6, altura: 7.5 },
      { peca: 'ilha_grama', x: -30.5, z: -12, y: -3.9, altura: 6 },
      { peca: 'ilha_cachoeira', x: 2, z: -38, y: -1.5, altura: 9 },
      { peca: 'ilha_rocha', x: -18, z: -30, y: -3, altura: 6.5 },
      { peca: 'ilha_nuvem', x: 20, z: -32, y: -2.5, altura: 5.5 },
      { peca: 'ilha_pequena', x: -29, z: 15, y: -1, altura: 3.8 },
      { peca: 'ilha_ruina_1', x: 32, z: 18, y: -2, altura: 5.2 },
      { peca: 'ilha_ruina_2', x: -6, z: -50, y: -1, altura: 5 },
    ] as readonly { peca: string; x: number; z: number; y: number; altura: number }[],
  },
  /**
   * Pontes que ligam a borda da arena às ilhas vizinhas. Billboard: a largura sai da proporção da arte, e a base (`y`)
   * fica abaixo do nível da arena (cerca de 0,6 × `altura`), porque o tabuleiro da ponte é a parte de cima da arte: assim
   * o tabuleiro cai no nível da grama da arena e da ilha ligada (y = 0 no topo).
   */
  pontes: [
    { peca: 'ponte_reta', x: 26.8, z: -14, y: -2.2, altura: 3.6 },
    { peca: 'ponte_arco', x: -27, z: -12, y: -2.3, altura: 3.8 },
  ] as readonly { peca: string; x: number; z: number; y: number; altura: number }[],
  /**
   * Peças na borda de grama da arena (base no chão da ilha, sombra de contato). Ficam fora da grade, nas laterais
   * e atrás (o norte, de onde a horda vem, tem o arco de entrada); a frente (sul) fica livre para a câmera.
   * `brilho`: a peça tem o brilho azul atrás (cristais).
   */
  borda: [
    { peca: 'arco_dourado', x: 0, z: -21.2, y: 0, altura: 5.2 },
    { peca: 'pilar_dourado', x: -11, z: -21, y: 0, altura: 3.6 },
    { peca: 'pilar_dourado', x: 11, z: -21, y: 0, altura: 3.6 },
    { peca: 'altar_cristal', x: -16.5, z: -21.4, y: 0, altura: 2.6, brilho: true },
    { peca: 'tocheiro', x: -23.6, z: -12.5, y: 0, altura: 3 },
    { peca: 'tocheiro', x: 23.6, z: -12.5, y: 0, altura: 3 },
    { peca: 'tocheiro_baixo', x: -23.8, z: -19, y: 0, altura: 1.8 },
    { peca: 'estatua_anjo', x: -23.4, z: 5, y: 0, altura: 4.2 },
    { peca: 'cristal_azul', x: 23.6, z: 6, y: 0, altura: 3.6, brilho: true },
    { peca: 'pilar_ruina', x: -23.5, z: -2.5, y: 0, altura: 3.6 },
    { peca: 'arco_ruina_2', x: 23.2, z: -1.5, y: 0, altura: 3.8 },
    { peca: 'escada_pedra_4', x: -24, z: 10.5, y: 0, altura: 2.4 },
    { peca: 'cristal_pequeno', x: -21, z: 17.5, y: 0, altura: 2.2, brilho: true },
    { peca: 'fonte_cristal', x: 22, z: 19, y: 0, altura: 2.4 },
    { peca: 'cerca_dourada_1', x: -8, z: 21.6, y: 0, altura: 1.4 },
    { peca: 'cerca_dourada_2', x: 8, z: 21.6, y: 0, altura: 1.4 },
  ] as readonly { peca: string; x: number; z: number; y: number; altura: number; brilho?: boolean }[],
  /** Nuvens soltas no alto, à deriva (a `balanco` em tiles e a `velocidade` em rad/s). */
  nuvens: {
    balanco: 1.5,
    velocidade: 0.05,
    opacidade: 0.92,
    lista: [
      { peca: 'nuvem_pecas_1', x: -44, z: -14, y: 7, altura: 6 },
      { peca: 'nuvem_pecas_2', x: 46, z: -18, y: 9, altura: 7 },
      { peca: 'nuvem_espiral_1', x: -18, z: -62, y: 12, altura: 7 },
      { peca: 'nuvem_espiral_3', x: 26, z: -58, y: 10, altura: 6 },
      { peca: 'nuvem_pecas_3', x: -6, z: -64, y: 15, altura: 6 },
    ] as readonly { peca: string; x: number; z: number; y: number; altura: number }[],
  },
} as const;

/**
 * Menu principal (tela de título): a arte da temporada vigente (`temporadas.ts`) enche a tela; por cima, os botões,
 * o painel de Ranking e o slogan recortados da mesma arte, com as áreas clicáveis e os valores vivos. Coordenadas em
 * pixels da arte de referência (x, y, largura, altura): toda arte de temporada usa esta composição.
 */
export const MENU_VISUAL = {
  // Versão exibida no canto inferior da tela de entrada. Esquema do dono:
  // 0.5a, 0.5b, ... 0.5z, depois 0.6a e assim por diante (bump a cada update).
  version: 'v0.8c',
  /** Tamanho da arte de referência (as artes de temporada têm esta mesma proporção). */
  width: 1752,
  height: 897,
  /**
   * Peças recortadas da arte que ficam sempre inteiras na tela: quando a tela não é 16:9 e o
   * fundo é cortado, elas são empurradas para dentro (cobrindo a parte cortada da arte de fundo).
   */
  pieces: {
    left: [0, 225, 440, 520],
    right: [1330, 25, 410, 640],
    title: [0, 0, 600, 135], // slogan do canto superior esquerdo
  } as Record<'left' | 'right' | 'title', [number, number, number, number]>,
  /** Esfumado das bordas das peças (px da imagem), para se misturarem ao fundo. */
  feather: 24,
  /** Áreas clicáveis sobre os botões pintados na arte. A Torre do Infinito aparece, mas está desativada. */
  buttons: {
    start: [30, 240, 378, 92],
    bastion: [30, 343, 390, 88],
    tower: [35, 445, 370, 84],
    info: [30, 540, 378, 66],
    donate: [30, 620, 378, 70],
  } as Record<'start' | 'bastion' | 'tower' | 'info' | 'donate', [number, number, number, number]>,
  /** Linha "jornada em andamento" logo abaixo do botão Donate. */
  continueLabel: [40, 700, 340, 26] as [number, number, number, number],
  /**
   * Valores do Ranking (cobrem os valores de exemplo da arte). `right`: borda direita da capa. Por linha: `y` = centro
   * vertical e `x` = borda esquerda da capa, que tem de passar do valor pintado sem encostar na legenda da mesma linha.
   */
  rankValues: {
    right: 1704,
    h: 28,
    rows: {
      difficulty: { y: 117, x: 1636 },
      longest: { y: 177, x: 1600 },
      fastest: { y: 238, x: 1636 },
      damage: { y: 299, x: 1636 },
      level: { y: 361, x: 1636 },
      runs: { y: 422, x: 1636 },
    },
  },
  /** Lista de apoiadores (cobre o aviso de exemplo "Nenhum apoiador ainda" da arte). */
  donors: [1360, 522, 330, 62] as [number, number, number, number],
  /** Cor do fundo do painel na arte (os valores vivos usam a mesma, para não aparecer emenda). */
  panelColor: 'rgb(1, 9, 22)',
  /**
   * Rodapé com a versão do jogo: caixa escura por cima da versão antiga pintada na arte (à direita da legenda).
   * Estreita de propósito: em 16:9 só sobra esse trecho entre a legenda e a borda da tela.
   */
  versionBox: [1505, 848, 170, 24] as [number, number, number, number],
};

/** Cidade (Valnor): arte de fundo e posição de cada serviço na arte (pixels da imagem; o clique vira % na tela). */
export const CITY_ART = {
  file: 'sprites/city_valnor_chibi.jpg',
  width: 1536,
  height: 1024,
  /** centro e tamanho da área clicável (ícone + placa) de cada serviço */
  spots: {
    priestess: { x: 935, y: 125, w: 180, h: 110 },
    master: { x: 578, y: 262, w: 200, h: 100 },
    smith: { x: 226, y: 338, w: 160, h: 100 },
    merchant: { x: 558, y: 612, w: 150, h: 100 },
    oracle: { x: 1190, y: 535, w: 150, h: 100 },
  } as Record<string, { x: number; y: number; w: number; h: number }>,
};

/** Mapa-múndi (Aurenthal): arte, ponto de cada região na arte (pixels) e névoa do que ainda não foi explorado. */
export const MAP_ART = {
  file: 'sprites/world_aurenthal.jpg',
  width: 1536,
  height: 1024,
  anchors: {
    ashPeak: [485, 180], frostPass: [767, 183], rustGorge: [1076, 215],
    whisperWood: [206, 357], crookedWood: [478, 347], valdrec: [608, 453], ashenFields: [861, 362],
    saltCove: [1068, 399], saltreach: [1240, 505], ravenIsle: [1452, 299],
    ravenGlade: [194, 540], rootVale: [425, 578], dryCrossing: [585, 600], redDunes: [737, 652], selmara: [1072, 572],
    duneSea: [455, 831], dunehold: [785, 825], solarRuins: [1068, 807],
  } as Record<string, [number, number]>,
  fog: {
    /** raio (px da arte) da área revelada em volta de cada região visitada */
    revealRadius: 175,
    /** borda suave da revelação (fração do raio) */
    softEdge: 0.45,
    /** desfoque e cor da névoa sobre o que não foi explorado (o bioma ainda dá para adivinhar) */
    blurPx: 16,
    tint: 'rgba(214,222,236,0.55)',
    /** velocidade da animação de revelação (por segundo) */
    revealSpeed: 0.7,
    /** raio revelado em volta da party durante a viagem */
    travelRadius: 120,
    /** distância máxima (px da arte) para um clique escolher a região mais próxima */
    clickRadius: 140,
  },
};

/** Seleção de personagem: arte das cartas, chibis, frases e som ao passar o mouse. */
export const CHARSELECT_ART = {
  background: 'sprites/city_valnor_chibi.jpg',
  cards: {
    warrior: 'sprites/cs/card_warrior.jpg', mage: 'sprites/cs/card_mage.jpg', archer: 'sprites/cs/card_archer.jpg',
    sorcerer: 'sprites/cs/card_sorcerer.jpg', warlock: 'sprites/cs/card_warlock.jpg', assassin: 'sprites/cs/card_assassin.jpg',
  } as Record<string, string>,
  /**
   * Mini clipe em loop no lugar do chibi (painel de detalhes). Aparece por cima da imagem quando carrega;
   * sem o arquivo, segue a imagem parada. Formato: webm/mp4 em public/clips/.
   */
  clips: {
    warrior: 'clips/guerreiro_golpe.webm',
  } as Record<string, string>,
  /** chibi de corpo inteiro no painel de detalhes (vazio = usa a arte da carta) */
  chibis: {
    warrior: 'sprites/cs/chibi_warrior.png', mage: 'sprites/cs/chibi_mage.png', archer: 'sprites/cs/chibi_archer.png',
    sorcerer: 'sprites/cs/chibi_sorcerer.png', warlock: '', assassin: 'sprites/cs/chibi_assassin.png',
  } as Record<string, string>,
  /**
   * Arte ilustrada de corpo inteiro (ficha + janelinha do herói). Quando preenchido,
   * vence o render 3D. Ex.: assassin: 'sprites/fullbody_assassin.jpg'.
   */
  fullbody: {} as Partial<Record<string, string>>,
  quotes: {
    warrior: 'Honra guia meu caminho.',
    mage: 'Mesmo na escuridão, a luz sempre encontra um caminho.',
    archer: 'A floresta me guia, e eu nunca me perco.',
    sorcerer: 'O conhecimento é luz na escuridão.',
    warlock: 'Toda maldição cobra o seu preço.',
    assassin: 'Um passo... e já é tarde.',
  } as Record<string, string>,
  /** som ao passar o mouse sobre uma carta (sorteia uma das variações) */
  hoverSounds: ['audio/cs_hover0.mp3', 'audio/cs_hover1.mp3', 'audio/cs_hover2.mp3', 'audio/cs_hover3.mp3'],
  hoverVolume: 0.8,
  /** variação aleatória da velocidade do som (±) */
  hoverPitch: 0.05,
  /** faíscas: por segundo com o mouse em cima, e a explosão ao escolher */
  sparksPerSecond: 38,
  selectBurst: 70,
};

/** Ícones dos tipos de fase (escolha do caminho no mapa). Vazio = desenho em canvas. */
/**
 * Título do cartão de vitória de cada mapa (um por zona de batalha; a região aparece embaixo).
 * Cada mapa tem o seu nome: é o que a defesa "chama" quando vence.
 */
export const VICTORY_TITLES: Record<string, string> = {
  bridge: 'Portões Defendidos',
  town: 'Muralha Intacta',
  serene: 'Floresta Preservada',
  crookedWood: 'Bosque Retomado',
  whisperWood: 'Sussurros Calados',
  ravenGlade: 'Clareira Vigiada',
  rootVale: 'Raízes Firmes',
  dryCrossing: 'Encruzilhada Mantida',
  redDunes: 'Areias Contidas',
  solarRuins: 'Sol Reacendido',
  ashenFields: 'Campos Protegidos',
  rustGorge: 'Garganta Selada',
  frostPass: 'Passo Aquecido',
  ashPeak: 'Cume Inabalável',
};

/** Música de fundo de cada tela (arquivos em public/audio). */
export const MUSIC = {
  /** tela inicial (login/menu) */
  menu: 'audio/menu.mp3',
  /** mapa-múndi, cidade, eventos, escolha de herói e fim de jornada */
  city: 'audio/cidade.mp3',
  /** mapas de horda (horda, elite, chefe, sobrevivência) */
  battle: 'audio/batalha.mp3',
  /** duração do crossfade ao trocar de faixa (ms) */
  fadeMs: 1000,
};

export const NODE_ICONS: Record<string, string> = {
  horde: 'sprites/nodes/horde.png',
  elite: 'sprites/nodes/elite.png',
  event: 'sprites/nodes/event.png',
  city: 'sprites/nodes/city.png',
  boss: 'sprites/nodes/boss.png',
  survival: 'sprites/nodes/survival.png',
};

/**
 * AURENTHAL POST FX — acabamento cinematográfico da cena 3D (só visual).
 * Ordem: Color Grading → Gradient Overlay → Bloom (camada emissiva: cores > 1) → Vinheta → Grão → Nitidez.
 * Regra de ouro: sutil. Números pequenos; o objetivo é "arte finalizada", não um filtro chamativo.
 */
export interface PostFxLook {
  /** Saturação e contraste (1 = neutro). */
  saturation: number;
  contrast: number;
  /** Brilho geral (1 = neutro). */
  brightness: number;
  /** Temperatura: + quente (dourado), − frio (azulado). */
  warmth: number;
  /** Sombras levemente azuladas/arroxeadas e luzes levemente douradas (multiplicadores RGB). */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  /** Força do gradiente da região (0 = desligado). */
  gradient: number;
  /** Multiplica o bloom do tema da zona. */
  bloom: number;
  vignette: number;
  /** Grão de filme (0.015 = quase imperceptível). */
  noise: number;
  /** Nitidez (unsharp mask). */
  sharpen: number;
  /** Pulso de tela (chefe): 0 = desligado. */
  pulse: number;
}

export type PostFxPreset = 'day' | 'sunset' | 'night' | 'battle' | 'boss';

export const POSTFX: {
  presets: Record<PostFxPreset, PostFxLook>;
  /** Clima de cada tema de zona (planejamento); em combate entra o preset `battle`, com chefe o `boss`. */
  mood: Record<string, PostFxPreset>;
  /** Gradiente vertical por tema: topo → meio → base (cores em hex). Dá identidade a cada região. */
  gradients: Record<string, [string, string, string]>;
  /** Segundos para mudar de um preset para outro (transição suave). */
  blendSeconds: number;
  /** Inimigos que ligam o preset `boss` enquanto estiverem vivos em campo. */
  bossKinds: string[];
} = {
  presets: {
    day: { saturation: 1.08, contrast: 1.03, brightness: 1.02, warmth: 0.05, shadowTint: [0.96, 0.97, 1.08], highlightTint: [1.05, 1.02, 0.95], gradient: 0.16, bloom: 1, vignette: 0.04, noise: 0.012, sharpen: 0.18, pulse: 0 },
    sunset: { saturation: 1.1, contrast: 1.04, brightness: 1.0, warmth: 0.15, shadowTint: [0.97, 0.94, 1.1], highlightTint: [1.08, 1.0, 0.9], gradient: 0.24, bloom: 1.15, vignette: 0.08, noise: 0.014, sharpen: 0.18, pulse: 0 },
    night: { saturation: 0.95, contrast: 1.08, brightness: 0.98, warmth: -0.06, shadowTint: [0.93, 0.95, 1.14], highlightTint: [1.04, 1.02, 0.97], gradient: 0.22, bloom: 1.1, vignette: 0.15, noise: 0.016, sharpen: 0.16, pulse: 0 },
    battle: { saturation: 1.1, contrast: 1.08, brightness: 1.0, warmth: 0.04, shadowTint: [0.95, 0.96, 1.1], highlightTint: [1.06, 1.02, 0.94], gradient: 0.2, bloom: 1, vignette: 0.12, noise: 0.014, sharpen: 0.2, pulse: 0 },
    boss: { saturation: 1.15, contrast: 1.12, brightness: 0.99, warmth: 0.06, shadowTint: [0.97, 0.92, 1.1], highlightTint: [1.08, 1.0, 0.92], gradient: 0.26, bloom: 1.25, vignette: 0.2, noise: 0.016, sharpen: 0.2, pulse: 1 },
  },
  mood: { bridge: 'night', town: 'sunset', forest: 'day', plains: 'sunset', desert: 'day', mountain: 'night', ash: 'night' },
  gradients: {
    bridge: ['#FFD98A', '#E88A3A', '#17233D'], // Valdrec: ouro → laranja → azul escuro
    town: ['#FFD98A', '#E88A3A', '#17233D'],
    forest: ['#C8F0A0', '#2F7A3A', '#152A4A'], // verde claro → verde profundo → azul
    plains: ['#FFE2A0', '#C8803A', '#2A2440'],
    desert: ['#FFE07A', '#F08A30', '#4A1418'], // amarelo → laranja → vermelho escuro
    mountain: ['#E8F2FF', '#4A7AD0', '#2A1A4A'], // branco azulado → azul → roxo
    ash: ['#FFB070', '#7A3A2A', '#1A1024'], // brasa → cinza-vermelho → roxo escuro
  },
  blendSeconds: 1.2,
  bossKinds: ['boss', 'boss2', 'orcboss'],
};


/**
 * Aura de chefes e monstros de elite: halo animado na silhueta + anel de energia no chão (só chefes).
 * `intensity` = força do halo (0–1); `pulse` = quanto o anel respira; `ringWidth` em metros.
 */
/**
 * Lago e poças da floresta (render/scenery/forestGround.ts), com as texturas de água e terra da folha do dono.
 * Cor multiplica a textura; opacidade é a transparência; `flow` é o deslizamento das ondas (partes da textura por segundo).
 */
export const POND_VISUAL = {
  /** tiles que uma imagem de água cobre (menor = ondas maiores) */
  waterTiles: 2.5,
  /** cor que a água funda e a rasa multiplicam (tom verde-azulado de floresta) */
  deepColor: 0xb8e4da,
  rimColor: 0xd6fff0,
  deepOpacity: 0.92,
  rimOpacity: 0.85,
  /** lama do leito, da margem molhada e das poças */
  bedColor: 0x4a3b2a,
  bankColor: 0x8a7050,
  mudColor: 0x5c4a34,
  flowRim: [0.012, 0.004] as const,
  flowDeep: [-0.008, 0.006] as const,
} as const;

export const AURA_VISUAL = {
  intensity: 0.6,
  pulse: 0.2,
  pulseSpeed: 2.4,
  ringWidth: 2.6,
  ringAlpha: 0.5,
  ringSpin: 0.4,
} as const;

/** Como cada aura aparece na faixa do portador (o shader do pacote, AURA_FRAG). Só visual: a regra está em config/auras.ts. */
export interface AuraMonstroTipo {
  /** Brilho da faixa (multiplica a cor). */
  emissao: number;
  /** Velocidade de escorrer da faixa (x, y): quanto maior, mais "rápido" o tipo parece. */
  rolagem: readonly [number, number];
  /** Torção da faixa (0 = faixa reta, como placa; 1 = espiral). */
  torcao: number;
  /** Ondulação da borda. */
  ondulacao: number;
  /** Tremulação do brilho (0 = sem tremular) e a velocidade dela. */
  pisca: number;
  piscaVel: number;
}

const AURA_MONSTRO_TIPOS: Record<AuraKind, AuraMonstroTipo> = {
  velocidade: { emissao: 1.5, rolagem: [0.5, 1.6], torcao: 1, ondulacao: 0.5, pisca: 0, piscaVel: 0 },
  critico: { emissao: 1.3, rolagem: [0.25, 0.9], torcao: 1, ondulacao: 0.3, pisca: 0.25, piscaVel: 9 },
  mitigacao: { emissao: 1.1, rolagem: [0.05, 0.15], torcao: 0.3, ondulacao: 0.1, pisca: 0, piscaVel: 0 },
  regeneracao: { emissao: 1.1, rolagem: [0.1, 0.6], torcao: 1, ondulacao: 0.2, pisca: 0, piscaVel: 0 },
  queimacao: { emissao: 1.4, rolagem: [0.1, 1.2], torcao: 1, ondulacao: 0.4, pisca: 0.15, piscaVel: 13 },
};

/**
 * Auras dos monstros portadores: anel no chão, faixa colorida (por tipo) e brasas da queimação, que caem
 * nos heróis em alcance. Só visual; a cor de cada tipo está em config/auras.ts (AURA_VISUAL).
 */
export const AURA_MONSTRO_VISUAL = {
  /** Anel no chão do portador: diâmetro (tiles), opacidade base, giro (rad/s) e altura acima do chão (m). */
  anelLargura: 1.5,
  anelAlfa: 0.6,
  anelGiro: 0.5,
  anelAltura: 0.03,
  /** Pulso do anel: variação da opacidade (fração) e velocidade (rad/s). */
  anelPulso: 0.2,
  anelPulsoVel: 2.4,
  /** Faixa cilíndrica: raio e altura (m), e o tempo (s) que ela leva para crescer quando o portador nasce. */
  faixaRaio: 0.55,
  faixaAltura: 1.8,
  faixaEntrada: 0.4,
  /** Faixas desenhadas: só as mais perto da câmera. Os demais portadores ficam só com o anel. */
  faixasMax: 12,
  /** Brasas por segundo de cada portador de queimação (sorteadas entre os heróis em alcance) e a vida de cada uma (s). */
  brasasPorSeg: 3,
  brasaVida: 0.7,
  /** Realce das cores da brasa (acima de 1 o bloom pega). */
  brasaBrilho: 1.4,
  tipos: AURA_MONSTRO_TIPOS,
};
