/**
 * Subida de nível: explosão divina com um anjo branco que aparece, se mostra e some em luz (inspirado no efeito de
 * nível do Ragnarok). Tempos em segundos; tamanhos em unidades do mundo; cores HDR (acima de 1 vira brilho).
 * Só apresentação: não mexe em nível, EXP ou atributos.
 */
export const LEVELUP_FX = {
  /** duração total do efeito (s) */
  life: 2.4,
  /** consagração: anel de luz no chão que se fecha sobre o herói */
  consecration: { radius: 1.3, grow: 0.6, life: 0.4, color: [1.1, 1.0, 0.8] },
  /** coluna de luz branca-dourada que sobe do herói */
  column: { height: 3.2, width: 0.7, life: 1.4, color: [0.7, 0.62, 0.45] },
  /** anjo branco: textura procedural (asas, auréola, túnica, braços abertos) */
  angel: {
    /** resolução da textura desenhada em canvas (gerada uma vez) */
    textureSize: 384,
    /** penas de cada asa */
    feathers: 9,
    /** tamanho na tela (unidades do mundo) e cor da luz */
    size: 2.2,
    /** cor abaixo do limiar do bloom: o anjo fica branco sem virar nuvem */
    color: [0.88, 0.86, 0.78],
    /** brilho externo das penas e do centro da textura (menor = menos halo) */
    glowBlur: 0.012,
    centerGlow: 0.12,
    /** entrada: começa em inAt e leva inTime para ficar inteiro */
    inAt: 0.3,
    inTime: 0.22,
    /** altura do centro do anjo: sobe de y0 até y1 */
    y0: 1.5,
    y1: 2.3,
    /** até quando ele fica se mostrando, e quanto tempo leva para sumir subindo */
    holdUntil: 1.45,
    fadeTime: 0.7,
    /** bater de asas: frequência (ciclos/s) e amplitude da largura */
    flapRate: 1.6,
    flapAmp: 0.04,
  },
  /** explosão divina: acontece quando o anjo está se mostrando */
  burst: {
    at: 0.55,
    ring: { radius: 3.2, color: [1.0, 0.95, 0.75], life: 0.6 },
    halo: { size0: 0.5, size1: 1.7, life: 0.5, color: [0.6, 0.56, 0.46], height: 1.6 },
    /** raios de luz saindo do centro em todas as direções */
    rays: { count: 10, reach: 2.4, life: 0.45, width: 0.08, length: 0.9, color: [1.0, 0.95, 0.8] },
    /** faíscas radiais */
    sparks: { count: 24, speed: 3.0, color: [1.1, 1.0, 0.85], colorEnd: [1.0, 0.7, 0.3] },
    /** clarão pequeno (não pode lavar a arena nem o herói) */
    flash: { size: 1.2, life: 0.16, color: [0.3, 0.27, 0.2] },
    /** tremor e empurrão de câmera leves */
    shake: 0.06,
    kick: 0.05,
  },
  /** penas douradas caindo sobre o herói */
  feathers: {
    start: 0.6,
    end: 2.0,
    perSec: 18,
    height: 3.3,
    spread: 1.6,
    life: 1.6,
    size: 0.12,
    gravity: 0.7,
    color: [1.0, 0.97, 0.9],
    colorEnd: [1.0, 0.8, 0.45],
  },
  /** texto do nível (o mesmo que o caso padrão do GameView usava) */
  text: { color: '#ffd84a', size: 0.46, life: 1.6, rise: 0.9, height: 3.8 },
} as const;
