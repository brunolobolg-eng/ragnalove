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
  unit: { hitFlashTime: 0.15, deathTime: 1.1 },
  /**
   * Câmera tática nos mapas grandes: segue a ação na onda e deixa o jogador inspecionar o mapa
   * (WASD/setas ou arrastar com o botão do meio/direito, roda = zoom, F = centralizar/seguir).
   */
  cameraControl: {
    panSpeed: 16, // tiles/s com teclado
    edgePan: 0, // px da borda para arrastar a câmera com o mouse (0 = desligado)
    zoomMin: 0.62,
    zoomMax: 1.9,
    zoomStep: 0.1,
    follow: 2.4, // suavização do seguir
    manualHold: 4, // s sem seguir depois que o jogador mexe na câmera
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
