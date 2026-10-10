/**
 * Números visuais do Assassino (segundos e unidades do mundo). Só apresentação: não mudam dano, recarga nem alcance.
 * O golpe básico tem que ser leve (uma camada e um pequeno impacto); o crítico usa o Golpe Furtivo completo
 * (StrikeFX.ts, configurado em VISUAL_CONFIG.strike).
 */
export const ASSASSIN_FX = {
  /** Golpe Furtivo básico (sem crítico): risco rápido de adaga, arco pequeno e faíscas */
  flick: {
    /** instante do golpe: o alvo reage aqui (igual a VISUAL_CONFIG.strike.impactAt) */
    impactAt: 0.3,
    /** duração total do efeito */
    life: 0.46,
    /** tamanho do arco de corte no impacto (menor que o crítico: o básico é leve) */
    slashSize: 1.1,
    /** faíscas no impacto */
    sparks: 5,
    /** tremor leve */
    shake: 0.035,
  },
  /** Leque de Lâminas: lâminas saem em leque na direção do cone */
  fan: {
    /** número de lâminas no leque */
    blades: 5,
    /** abertura do leque, para cada lado do centro (rad) */
    spread: 0.5,
    /** alcance das lâminas (unidades do mundo) */
    reach: 2.6,
    /** tempo que uma lâmina leva para cruzar o alcance (s) */
    travel: 0.22,
    /** duração total */
    life: 0.52,
    /** faíscas e fumaça em cada alvo atingido */
    sparksPerHit: 6,
    smokePerHit: 2,
    /** tremor leve */
    shake: 0.05,
  },
  /** Execução: lâmina que cai de cima sobre o alvo fraco */
  execute: {
    /** sombra correndo do assassino até o alvo (s) */
    dashTime: 0.16,
    /** a lâmina começa a cair neste instante e leva `dropTime` para chegar */
    dropAt: 0.16,
    dropTime: 0.1,
    /** impacto no alvo */
    impactAt: 0.26,
    /** duração total */
    life: 0.8,
    /** altura e larguras da lâmina que cai (unidades do mundo); a sombra atrás é mais larga */
    bladeHeight: 2.6,
    bladeWidth: 0.3,
    bladeDarkWidth: 0.6,
    /** raio do selo no chão */
    sigilRadius: 1.2,
    /** faíscas subindo e fumaça escura do impacto */
    sparks: 16,
    smoke: 9,
    /** tremor, empurrão de câmera e hit-stop no impacto */
    shake: 0.1,
    kick: 0.1,
    hitStop: 0.06,
  },
} as const;
