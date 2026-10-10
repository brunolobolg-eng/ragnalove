/**
 * Subida de nível, no estilo da arte de referência "LEVEL UP": feixe de luz com a base em anel, asas que se abrem
 * atrás do herói, círculo de runas no chão, auréola sobre a cabeça, explosão com clarão e penas caindo.
 * Os sprites vêm de `public/fx/levelup/` (scripts/build_levelup_fx.py). A cor é a da classe do herói.
 * Tempos em segundos; tamanhos em unidades do mundo. Só apresentação: não mexe em nível, EXP ou atributos.
 */
export const LEVELUP_FX = {
  /** duração total do efeito (s) */
  life: 2.6,
  /** cor de um herói sem cor de classe (nunca acontece hoje, mas o efeito não pode quebrar) */
  defaultColor: 0xffd04a,
  /** miolo quase branco: quanto da cor da classe se mistura com branco (0 = só a cor, 1 = branco) */
  hotMix: 0.7,
  /** círculo de runas no chão: começa menor, cresce, gira e some */
  ground: { size: 2.6, start: 0.5, inTime: 0.35, spin: 0.9, holdUntil: 1.7, fadeTime: 0.7 },
  /** feixe de luz do chão ao alto (a base em anel fica no chão) */
  beam: { height: 3.4, width: 1.5, inTime: 0.45, holdUntil: 1.5, fadeTime: 0.7 },
  /** asas: abrem a partir do centro do herói, batem devagar e somem */
  wings: {
    /** altura do centro das asas e tamanho do sprite */
    y: 1.9,
    width: 1.9,
    height: 2.7,
    /** distância do centro do herói até o centro de cada asa */
    offset: 0.55,
    openAt: 0.2,
    openTime: 0.45,
    holdUntil: 1.6,
    fadeTime: 0.6,
    flapRate: 1.4,
    flapAmp: 0.035,
  },
  /** auréola inclinada sobre a cabeça */
  halo: { y: 2.9, rise: 0.2, width: 1.7, inAt: 0.4, inTime: 0.3, holdUntil: 1.7, fadeTime: 0.6 },
  /** explosão: acontece quando o feixe e as asas já estão de pé */
  burst: {
    at: 0.55,
    /** anel de choque no chão */
    ring: { radius: 2.6, life: 0.6 },
    /** estrela de clarão no centro do herói */
    flare: { y: 1.4, size0: 0.4, size1: 1.3, life: 0.35 },
    /** risco horizontal de lente */
    streak: { width: 3.0, height: 0.4, life: 0.4 },
    /** raios de luz saindo do centro em todas as direções */
    rays: { count: 10, reach: 2.4, life: 0.45, width: 0.08, length: 0.9 },
    /** faíscas radiais */
    sparks: { count: 24, speed: 3.0 },
    /** clarão pequeno (não pode lavar a arena nem o herói) */
    /** cor do clarão = cor da classe × tint (pequeno: não pode apagar o herói) */
    flash: { size: 1.2, life: 0.16, y: 1.4, tint: 0.2 },
    /** tremor e empurrão de câmera leves */
    shake: 0.06,
    kick: 0.05,
  },
  /** penas que caem sobre o herói (reaproveitadas de um pool de sprites) */
  feathers: {
    start: 0.6,
    end: 1.9,
    perSec: 8,
    pool: 16,
    height: 3.2,
    spread: 1.0,
    life: 1.5,
    size: 0.42,
    fall: 0.6,
    sway: 0.15,
    spin: 1.2,
  },
  /** brilhos de estrela ao redor do feixe, um por vez, em instantes fixos */
  glints: { times: [0.9, 1.2, 1.55, 1.9], height: [1.2, 2.2, 1.7, 2.6], size: 0.55, life: 0.5, offsetX: 0.9 },
  /** texto do nível (a cor do texto é a da classe) */
  text: { size: 0.46, life: 1.6, rise: 0.9, height: 3.8 },
} as const;
