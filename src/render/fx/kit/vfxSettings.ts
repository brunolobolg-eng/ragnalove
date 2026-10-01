/**
 * Ajustes globais dos efeitos, definidos pelas Configurações (preset + acessibilidade).
 * Todos os efeitos leem daqui — nada disso afeta a simulação.
 */
export const VFX = {
  /** Multiplica flashes/brilhos de impacto (reduzir flashes → ~0.4). */
  flash: 1,
  /** Aberração cromática breve em impactos fortes. */
  aberration: true,
  /** Distorção de calor perto do fogo. */
  heat: true,
  /** Congelamento de poucos frames no impacto. */
  hitStop: true,
  /** Marcas no chão (queimado, gelo, rachaduras). */
  decals: true,
  /** Rastros em fita dos projéteis e golpes. */
  ribbons: true,
};
