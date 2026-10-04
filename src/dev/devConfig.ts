/**
 * Configuração do Dev Lab (ferramenta interna de testes e balanceamento).
 *
 * O Dev Lab roda no client desktop (executável Electron), como o Game Editor.
 * DEV_MODE segue o build: true em desenvolvimento (`npm run dev` / `desktop:dev`),
 * false na build de produção/Steam (o Vite elimina o código junto com o import).
 */
export const DEV_MODE: boolean = import.meta.env.DEV;

/** Números do Dev Lab (só da ferramenta — os de gameplay continuam no GAME_CONFIG). */
export const DEV_CONFIG = {
  hotkey: 'F8',
  /** Velocidades do jogo oferecidas no painel. */
  speeds: [0.25, 0.5, 1, 2, 4],
  /** Quantidade máxima por clique de spawn. */
  maxSpawn: 500,
  /** A fila de spawn tenta colocar inimigos nos portais a cada N ms (entra conforme abre espaço). */
  spawnQueueIntervalMs: 150,
  /** Atualização da linha de status do painel (ms). */
  statusIntervalMs: 250,
  /** Economia: botões rápidos e o valor do "MAX". */
  currencySteps: [100, 1000, 10000],
  maxCurrency: 9_999_999,
  maxLevel: 99,
  /** Movimento: opções do multiplicador de alcance dos heróis à distância e o valor inicial. */
  rangedMultOptions: [0.5, 1, 1.5, 2, 3],
  rangedMultDefault: 2,
  /** Slider do raio máximo de movimento de combate (tiles). */
  maxMoveSlider: { min: 0, max: 6, step: 0.5 },
  /** Wave Tester: limite de simulações e de ticks por onda (trava de segurança). */
  maxSimulations: 50,
  headlessMaxTicks: 20000,
  /** Cada simulação usa a semente da fase + i × este passo (hordas diferentes). */
  headlessSeedStep: 7919,
  /** Loot Tester: limite de abates simulados (rolls × inimigos). */
  maxLootKills: 1_000_000,
  /** Debug visual: pontos por círculo desenhado no chão. */
  circleSegments: 48,
};
