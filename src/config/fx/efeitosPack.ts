/**
 * Efeitos do pacote de VFX (Godot → Three.js), ajustados ao jogo: cores e formas de cada elemento, tempos e
 * orçamentos. Só visual: nada daqui muda dano, alcance, recarga ou a simulação.
 *
 * Origem (licenças em public/fx/efeitos/CREDITOS.txt):
 * - Magic Circles 3D Free (heyheythere): círculo mágico, ondulação e faíscas. CC BY 4.0.
 * - Free Hit VFX (Slash Crimson): golpe em fatia com a textura do pacote e o flash. Uso livre.
 * - Stylized Hit FX e Stylized Status FX (Binbun3D): impacto e status. CC0.
 * - Buff Pickup VFX Lite (Sean Elovirta): anel e brilho de buff. MIT.
 */

/** Elementos: cada magia escolhe um deles para cor e forma do efeito. */
export type PackElement = 'fire' | 'frost' | 'poison' | 'holy' | 'shadow' | 'arcane' | 'nature' | 'blood';

/** Forma das partículas (spark.gdshader): 0 brilho, 1 cintilação, 2 floco, 3 bolha, 4 brasa, 5 fio, 6 folha, 7 gota. */
export interface ElementVisual {
  /** Cor do miolo e da borda, em valores de cena (passam de 1 para brilhar com o bloom). */
  core: [number, number, number];
  edge: [number, number, number];
  /** Pontas da estrela do círculo (3 a 8) e quanto ele se contorce (0 a 1). */
  sides: number;
  turbulence: number;
  /** Forma e tamanho (metros) das partículas, subida (positivo sobe) e empuxo (positivo sobe, negativo cai). */
  sparkShape: number;
  sparkSize: number;
  rise: number;
  lift: number;
  /** Tremulação da luz do elemento (0 a 1). */
  flicker: number;
  /** Cores do golpe em fatia: núcleo quente, cor principal e acento (HDR; a textura usa essas três). */
  slashCore: [number, number, number];
  slashMain: [number, number, number];
  slashAccent: [number, number, number];
}

export const PACK_ELEMENTS: Record<PackElement, ElementVisual> = {
  fire: {
    core: [1.0, 0.72, 0.28], edge: [1.0, 0.22, 0.03], sides: 3, turbulence: 0.8,
    sparkShape: 4, sparkSize: 0.07, rise: 1.3, lift: 1.2, flicker: 0.35,
    slashCore: [3.0, 1.7, 1.1], slashMain: [2.4, 0.4, 0.28], slashAccent: [1.6, 0.12, 0.35],
  },
  frost: {
    core: [0.82, 0.97, 1.0], edge: [0.22, 0.52, 1.0], sides: 6, turbulence: 0.1,
    sparkShape: 2, sparkSize: 0.12, rise: 0.6, lift: -0.35, flicker: 0.04,
    slashCore: [1.6, 2.4, 3.0], slashMain: [0.5, 1.2, 2.4], slashAccent: [0.3, 0.8, 2.0],
  },
  poison: {
    core: [0.78, 1.0, 0.32], edge: [0.22, 0.62, 0.06], sides: 4, turbulence: 0.5,
    sparkShape: 3, sparkSize: 0.11, rise: 0.55, lift: 0.1, flicker: 0.12,
    slashCore: [1.8, 2.6, 0.9], slashMain: [0.9, 1.9, 0.3], slashAccent: [0.5, 1.2, 0.1],
  },
  holy: {
    core: [1.0, 0.97, 0.82], edge: [1.0, 0.72, 0.26], sides: 8, turbulence: 0.05,
    sparkShape: 1, sparkSize: 0.16, rise: 0.8, lift: 0.2, flicker: 0.03,
    slashCore: [3.0, 2.9, 2.5], slashMain: [2.4, 2.0, 1.0], slashAccent: [1.8, 1.2, 0.4],
  },
  shadow: {
    core: [0.07, 0.0, 0.11], edge: [0.58, 0.14, 0.98], sides: 5, turbulence: 0.6,
    sparkShape: 5, sparkSize: 0.45, rise: 0.45, lift: 0.1, flicker: 0.2,
    slashCore: [1.4, 0.5, 2.6], slashMain: [0.5, 0.1, 1.6], slashAccent: [0.3, 0.05, 1.0],
  },
  arcane: {
    core: [0.86, 0.78, 1.0], edge: [0.42, 0.3, 1.0], sides: 7, turbulence: 0.2,
    sparkShape: 0, sparkSize: 0.1, rise: 0.75, lift: 0.15, flicker: 0.08,
    slashCore: [2.6, 2.2, 3.0], slashMain: [1.4, 0.9, 2.6], slashAccent: [0.8, 0.5, 2.2],
  },
  nature: {
    core: [0.74, 1.0, 0.68], edge: [0.06, 0.7, 0.38], sides: 6, turbulence: 0.3,
    sparkShape: 6, sparkSize: 0.13, rise: 0.6, lift: -0.12, flicker: 0.06,
    slashCore: [2.2, 3.0, 1.8], slashMain: [0.8, 2.0, 0.9], slashAccent: [0.2, 1.4, 0.6],
  },
  blood: {
    core: [1.0, 0.36, 0.3], edge: [0.62, 0.0, 0.06], sides: 5, turbulence: 0.45,
    sparkShape: 7, sparkSize: 0.09, rise: 1.0, lift: -0.6, flicker: 0.15,
    slashCore: [3.0, 1.0, 0.8], slashMain: [2.2, 0.2, 0.2], slashAccent: [1.4, 0.05, 0.1],
  },
};

/** Círculo mágico no chão: tempos (segundos) e faíscas que sobem da borda. */
export const PACK_CIRCLE = {
  /** Tempo para se formar (o desenho gira até fechar), manter e apagar. */
  appear: 0.6,
  hold: 1.5,
  fade: 0.6,
  /** Velocidade da animação interna (1 = normal). */
  speed: 1.0,
  /** Faíscas por ciclo de vida e anel de onde saem (fração do raio). */
  sparkAmount: 24,
  sparkRing: 0.83,
  sparkLife: 2.0,
  /** Subida inicial das faíscas (multiplica o `rise` do elemento; 1 = o do Godot). */
  rise: 1.0,
  /** Altura acima do chão para não brigar com as manchas do cenário. */
  lift: 0.03,
};

/** Golpe em fatia (textura do pacote) com flash no centro e faíscas. Números do preset Slash Crimson. */
export const PACK_SLASH = {
  /** Duração da fatia (segundos), tamanho em metros e o salto do crescimento (de `popFrom` até 1). */
  life: 0.42,
  size: 1.8,
  popFrom: 0.4,
  overshoot: 2.2,
  /** Giro (rad por progresso), esticamento e distorção da textura. */
  spin: -0.3,
  stretch: [1.25, 0.85] as const,
  distortion: 0.06,
  /** Brilho da fatia (multiplica as cores HDR do elemento). */
  emission: 0.754,
  /** Flash curto no centro: duração, tamanho em metros e brilho. */
  flashLife: 0.11,
  flashSize: 0.59,
  flashEmission: 0.9,
  /** Faíscas do impacto: quantidade, velocidade (m/s) e vida (s). */
  sparkAmount: 6,
  sparkSpeed: 5.0,
  sparkLife: 0.6,
  sparkSize: 0.12,
};

/** Anel de choque que se expande (impacto em área). */
export const PACK_RING = {
  life: 0.45,
  width: 0.12,
  emission: 2.6,
};

/** Aura em volta da unidade (escudo, buff, debuff): cilindro aberto com ruído que escorre para cima. */
export const PACK_AURA = {
  radius: 0.62,
  height: 1.9,
  /** Brilho (multiplica as cores HDR do elemento) e tempo de entrada e saída (segundos). */
  emission: 2.0,
  fadeIn: 0.25,
  fadeOut: 0.5,
  /** Torção da faixa, velocidade do ruído e ondulação (valores do Stylized Status FX). */
  twist: 1.0,
  scroll: [0.1, 0.4] as const,
  waviness: 0.2,
};

/** Emissor contínuo em volta da unidade: cruzes de cura e cristais de gelo (faíscas do kit). */
export const PACK_STREAM = {
  /** Partículas por segundo, raio em volta da unidade e altura da área em que elas aparecem. */
  rate: 9,
  radius: 0.55,
  height: 1.5,
  /** Vida e tamanho (metros) de cada partícula. */
  life: 0.9,
  size: 0.16,
};

/** Forma das faíscas de status: cruz de cura e cristal de gelo (índices do spark.gdshader estendido). */
export const PACK_STATUS_SHAPE = { cross: 8, crystal: 9 } as const;

/** Brilho de buff: sprite com a textura do pacote (levelup, sparkglint ou smokepuff) que cresce e some. */
export const PACK_SPRITE = {
  /** Tamanho inicial relativo ao pedido (cresce até 1), brilho e entrada (segundos). */
  growFrom: 0.55,
  fadeIn: 0.12,
  emission: 1.4,
};

/** Orçamentos simultâneos: passam disso, o efeito novo é ignorado (a batalha segue leve). */
export const PACK_BUDGET = {
  circles: 10,
  slashes: 24,
  auras: 16,
  sprites: 18,
  sparks: 900,
};
