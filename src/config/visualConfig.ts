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
  unit: { hitFlashTime: 0.22, deathTime: 1.1 },
  /** Planejamento: heróis passeiam em volta do posto (raio em tiles, velocidades em tiles/s, esperas em s). */
  idleWander: { radius: 0.85, speed: 0.9, orderSpeed: 3.2, waitMin: 1.5, waitMax: 4.5, lookAtCameraAfter: 1.2 },
  /** Ordem de posição: marca no chão (duração em s). */
  orders: { markerTime: 0.7 },
  /**
   * Câmera tática nos mapas grandes: segue a ação na onda e deixa o jogador inspecionar o mapa
   * (WASD/setas ou arrastar com o botão do meio/direito, roda = zoom, F = centralizar/seguir).
   */
  cameraControl: {
    panSpeed: 16, // tiles/s com teclado
    edgePan: 0, // px da borda para arrastar a câmera com o mouse (0 = desligado)
    zoomMin: 0.62,
    zoomMax: 1.9,
    /** Mapas pintados (arte do dono): sem névoa, zoom maior e a câmera presa dentro da pintura. */
    painted: { zoomStart: 1.3, zoomMin: 0.7, zoomMax: 1.75 },
    zoomStep: 0.1,
    follow: 2.4, // suavização do seguir
    manualHold: 1.5, // s sem seguir depois que o jogador mexe na câmera
    shadowHalf: 17, // meia-largura da área de sombras em volta do foco (tiles)
  },
  /** Direção do sol (de onde a luz vem) — o deserto usa sol baixo de fim de tarde (sombras longas). */
  sun: [-7, 18, 9] as [number, number, number],
};

/** Iluminação/atmosfera por tema de zona (sobrescreve o VISUAL_CONFIG). */
export const VISUAL_THEMES = {
  town: {},
  /** Noite de lua: azul frio no ambiente, fogo quente nos braseiros. */
  bridge: {
    background: 0x05070e,
    fog: { near: 24, far: 44 },
    exposure: 1.18,
    envIntensity: 0.08,
    hemiIntensity: 1.3,
    moonIntensity: 1.35,
    light: { sky: 0x8c9cd8, ground: 0x3a3428, sun: 0xc4d2ff },
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
    hemiIntensity: 1.25,
    moonIntensity: 2.1,
    light: { sky: 0xe4f4ff, ground: 0x4e5a30, sun: 0xfff0c8 },
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Campos abertos ensolarados (verde-dourado). */
  plains: {
    background: 0x3c5236,
    fog: { near: 26, far: 52 },
    exposure: 1.04,
    envIntensity: 0.12,
    hemiIntensity: 1.3,
    moonIntensity: 2.0,
    light: { sky: 0xe8f2ff, ground: 0x5a5a36, sun: 0xfff2d0 },
    bloom: { strength: 0.4, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Deserto no fim da tarde: sol baixo e quente, sombras longas e duras. */
  desert: {
    background: 0x6a4a30,
    fog: { near: 26, far: 52 },
    exposure: 0.98,
    envIntensity: 0.12,
    hemiIntensity: 1.0,
    moonIntensity: 2.3,
    light: { sky: 0xe8dcc8, ground: 0x7a5a3a, sun: 0xffc98a },
    sun: [-16, 7.5, 5] as [number, number, number],
    bloom: { strength: 0.42, radius: 0.5, threshold: 0.9 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Montanha gelada: luz fria e clara. */
  mountain: {
    background: 0x44546a,
    fog: { near: 24, far: 50 },
    exposure: 1.1,
    envIntensity: 0.12,
    hemiIntensity: 1.3,
    moonIntensity: 1.9,
    light: { sky: 0xe0ecff, ground: 0x5a6070, sun: 0xfff6ea },
    bloom: { strength: 0.48, radius: 0.5, threshold: 0.88 },
    camera: { fov: 32, height: 18.5, distance: 17.5, lookZ: 0.4 },
  },
  /** Cume das Cinzas: céu vermelho-escuro, brasas. */
  ash: {
    background: 0x1c0a07,
    fog: { near: 22, far: 42 },
    exposure: 1.25,
    envIntensity: 0.1,
    hemiIntensity: 1.45,
    moonIntensity: 1.7,
    light: { sky: 0xd08070, ground: 0x3a1c14, sun: 0xffc090 },
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
  outline: number;
  aura?: [number, number, number];
  /** Heróis: cor do espectro ao usar habilidade. */
  ghost?: [number, number, number];
  /** Usa as animações do personagem do jogo (o GLB traz só malha + esqueleto com os mesmos nomes de ossos). */
  clips?: 'warrior' | 'mage' | 'archer' | 'zombie' | 'zombieRunner' | 'zombieBrute' | 'brute' | 'cultist';
  /** Variantes de cor: texturas alternativas no mesmo atlas do GLB (cada inimigo sorteia uma, ou a original). */
  skins?: string[];
  /** Armas presas nos ossos da mão (para modelos que vêm de mãos vazias); accent = cor do brilho. */
  weapons?: { type: 'bow' | 'dagger' | 'axe'; bone: string; accent?: number; tilt?: number; scale?: number }[];
}

/** Heróis avançados (GLB com o mesmo esqueleto padrão). Até carregar, usam o modelo de uma classe parecida. */
export const HERO_MODELS: Record<string, MonsterModelVisual> = {
  // Eliana (arte do jogador → 3D): textura + espada e escudo; animações do Guerreiro
  warrior: { file: 'models/eliana.glb', height: 2.0, walkRate: 1, outline: 0.012, ghost: [0.35, 1.25, 1.0], clips: 'warrior' },
  // Cléria (arte do jogador → 3D): cajado com cristal e livro; animações da Maga
  mage: { file: 'models/cleria.glb', height: 1.9, walkRate: 1, outline: 0.012, ghost: [0.55, 0.8, 1.6], clips: 'mage' },
  // Líria (modelo do V2Fun no esqueleto padrão): animações da Arqueira
  archer: { file: 'models/liria.glb', height: 1.9, walkRate: 1, outline: 0.012, ghost: [0.5, 1.4, 0.6], clips: 'archer', weapons: [{ type: 'bow', bone: 'hand.L', accent: 0x9aff7a }] },
  sorcerer: { file: 'models/sorcerer.glb', height: 1.75, walkRate: 1, outline: 0.012, ghost: [1.2, 0.55, 1.8] },
  warlock: { file: 'models/warlock.glb', height: 1.75, walkRate: 1, outline: 0.012, ghost: [1.6, 0.25, 0.6] },
  // Cavaleiro sombrio (modelo do V2Fun no esqueleto padrão): animações de golpe do Guerreiro (corpo a corpo)
  assassin: { file: 'models/assassin_dk.glb', height: 1.9, walkRate: 1.05, outline: 0.012, ghost: [1.6, 1.3, 0.3], clips: 'warrior', weapons: [{ type: 'dagger', bone: 'hand.R', accent: 0xc070ff }, { type: 'dagger', bone: 'hand.L', accent: 0xc070ff }] },
};
/** Zumbi do Ato III: coveiro, afogado, pesteado, luto e cinzas (além da cor original do modelo). */
const ZOMBIE_SKINS = ['coveiro', 'afogado', 'pesteado', 'luto', 'cinzas'].map((n) => `models/zombie_${n}.jpg`);
/** Machado de batalha do orc: mão direita, cabo inclinado 35° para baixo, brilho do gume avermelhado. */
const ORC_AXE = { type: 'axe' as const, bone: 'hand.R', accent: 0xff7040, tilt: 35, scale: 1.35 };
export const MONSTER_MODELS: Record<string, MonsterModelVisual> = {
  // Ato I — ratos
  rat: { file: 'models/rato.glb', height: 1.45, walkRate: 1.3, outline: 0.013 },
  ratRunner: { file: 'models/rato.glb', height: 1.15, walkRate: 2.4, outline: 0.013 },
  ratBrute: { file: 'models/rato.glb', height: 1.95, walkRate: 0.85, outline: 0.012 },
  ratNecro: { file: 'models/rato.glb', height: 1.5, walkRate: 1.2, outline: 0.013, aura: [0.7, 0.2, 1.6] },
  ratElite: { file: 'models/ratochefe.glb', height: 2.4, walkRate: 0.85, outline: 0.011, aura: [0.9, 0.3, 1.8] },
  ratBoss: { file: 'models/ratochefe.glb', height: 3.1, walkRate: 0.9, outline: 0.009, aura: [1.6, 0.15, 0.4] },
  // Ato II — goblins (o chefe é o goblin grande repintado, maior e com aura dourada)
  goblin: { file: 'models/goblin2.glb', height: 1.6, walkRate: 1.3, outline: 0.013 },
  goblinRunner: { file: 'models/goblin2.glb', height: 1.3, walkRate: 2.4, outline: 0.013 },
  goblinBrute: { file: 'models/goblin1.glb', height: 2.0, walkRate: 0.85, outline: 0.012 },
  goblinNecro: { file: 'models/goblin2.glb', height: 1.65, walkRate: 1.2, outline: 0.013, aura: [0.7, 0.2, 1.6] },
  goblinElite: { file: 'models/goblin1.glb', height: 2.5, walkRate: 0.85, outline: 0.011, aura: [0.9, 0.3, 1.8] },
  goblinBoss: { file: 'models/goblinboss.glb', height: 3.4, walkRate: 0.9, outline: 0.009, aura: [2.0, 1.4, 0.3] },
  // Ato III — zumbi chibi (V2Fun no esqueleto padrão), animações de zumbi do jogo; 5 variantes fúnebres de cor
  zombie: { file: 'models/zombie.glb', height: 1.6, walkRate: 1.3, outline: 0.013, clips: 'zombie', skins: ZOMBIE_SKINS },
  zombieRunner: { file: 'models/zombie.glb', height: 1.35, walkRate: 2.4, outline: 0.013, clips: 'zombieRunner', skins: ZOMBIE_SKINS },
  zombieBrute: { file: 'models/zombie.glb', height: 2.0, walkRate: 0.85, outline: 0.012, clips: 'zombieBrute', skins: ZOMBIE_SKINS },
  zombieNecro: { file: 'models/cultist.glb', height: 1.7, walkRate: 1.2, outline: 0.013, clips: 'cultist', aura: [0.7, 0.2, 1.6] },
  // Ato III — orc guerreiro chibi (V2Fun): golpe de machado por cima vem do próprio GLB, o resto é do brutamonte
  orcWarrior: { file: 'models/orc.glb', height: 2.3, walkRate: 0.85, outline: 0.011, clips: 'brute', aura: [0.9, 0.3, 1.8], weapons: [ORC_AXE] },
  orcLord: { file: 'models/orc.glb', height: 3.3, walkRate: 0.9, outline: 0.009, clips: 'brute', aura: [1.6, 0.15, 0.4], weapons: [ORC_AXE] },
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

/** Cenário temático dos monstros do ato, espalhado em volta de cada portal de spawn. */
export const ACT_DRESSING = {
  radiusMin: 1.6,
  radiusMax: 5.5,
  flatPerSpawn: 7, // peças baixas (tocas, ossos, cinzas) — podem ficar no chão andável
  tallPerSpawn: 4, // peças altas (totens, estandartes, estacas) — só em tiles bloqueados
};

/**
 * Menu principal (tela de título): a arte `tela-entrada.jpg` enche a tela; por cima, os botões, o
 * painel de Ranking e o slogan recortados da mesma arte, com as áreas clicáveis e os valores vivos. Coordenadas em pixels da imagem original (x, y, largura, altura).
 */
export const MENU_VISUAL = {
  // Versão exibida no canto inferior da tela de entrada. Esquema do dono:
  // 0.5a, 0.5b, ... 0.5z, depois 0.6a e assim por diante (bump a cada update).
  version: 'v0.5t',
  image: 'tela-entrada.jpg',
  width: 1672,
  height: 941,
  /**
   * Peças recortadas da arte que ficam sempre inteiras na tela: quando a tela não é 16:9 e o
   * fundo é cortado, elas são empurradas para dentro (cobrindo a parte cortada da arte de fundo).
   */
  pieces: {
    left: [0, 355, 425, 415],
    right: [1250, 0, 422, 620],
    title: [0, 0, 580, 140], // slogan do canto superior esquerdo
  } as Record<'left' | 'right' | 'title', [number, number, number, number]>,
  /** Esfumado das bordas das peças (px da imagem), para se misturarem ao fundo. */
  feather: 24,
  /** Áreas clicáveis sobre os botões desenhados na arte. */
  buttons: {
    start: [41, 403, 350, 90],
    options: [41, 507, 350, 63],
    info: [41, 583, 350, 64],
    donate: [41, 660, 350, 64],
  } as Record<'start' | 'options' | 'info' | 'donate', [number, number, number, number]>,
  /** Linha "jornada em andamento" logo abaixo do botão Donate. */
  continueLabel: [41, 736, 350, 26] as [number, number, number, number],
  /** Valores do Ranking (cobrem os "???" da arte quando o recorde existe): borda direita e centro vertical de cada linha. */
  rankValues: { right: 1634, h: 28, rows: { difficulty: 115, longest: 164, fastest: 213, damage: 264, level: 314, runs: 366 } },
  /** Lista de apoiadores (cobre os nomes de exemplo da arte). */
  donors: [1306, 438, 328, 106] as [number, number, number, number],
  /** Cor do fundo do painel na arte (os valores vivos usam a mesma, para não aparecer emenda). */
  panelColor: 'rgb(5, 14, 28)',
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
