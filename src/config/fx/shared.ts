/**
 * Efeitos sem autor de classe (combustão do Mago, etc.). Tempos em segundos; cores HDR (acima de 1 vira brilho).
 * Só apresentação.
 */
export const SHARED_FX = {
  /** combustão: o fogo estoura no tile atingido e deixa brasas (passivo "Combustão" do Mago) */
  combust: {
    /** anel de runas de fogo no chão */
    ringRadius: 1.3,
    ringColor: [1.2, 0.55, 0.2],
    ringLife: 0.5,
    /** chamas subindo */
    fire: [2.0, 0.9, 0.3],
    fireEnd: [0.6, 0.12, 0.02],
    fireCount: 14,
    fireSpread: 0.5,
    /** faíscas radiais */
    sparks: 10,
    sparkColor: [1.5, 0.85, 0.35],
    sparkEnd: [0.6, 0.1, 0.02],
    /** fumaça escura que sobe */
    smokeColor: [0.12, 0.06, 0.04],
    smokeCount: 5,
    /** clarão pequeno */
    flashColor: [0.45, 0.22, 0.09],
    flashSize: 1.2,
    flashLife: 0.14,
    /** tremor leve */
    shake: 0.04,
  },
} as const;
