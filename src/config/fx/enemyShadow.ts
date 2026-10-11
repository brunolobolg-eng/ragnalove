/**
 * Projétil do Necromante (inimigo): orbe de sombra grande, com halo pulsando, anel rúnico girando,
 * rastro em fita e impacto com onda de choque roxa. Só apresentação: nenhum número aqui muda dano,
 * alcance, recarga ou alvo (isso é da simulação). O orbe menor da Bruxa da party não usa estes números.
 * Unidades: tempo em segundos; distância em unidades do mundo (1 tile = 1 unidade);
 * cor em RGB linear (valores acima de 1 são brilho HDR, só nos núcleos e no anel).
 * Identidade: violeta-sombra (núcleo quase preto, borda violeta-elétrica, fumaça escura).
 * Nomes: "...Size" = diâmetro visual; "...Pulse" = fração da variação do halo.
 */
export const ENEMY_SHADOW_FX = {
  /** Velocidade de voo (tiles por segundo). O GameView adia o dano do alvo até a batida, com este mesmo ritmo. */
  speed: 7,
  /** Antecipação: a runa se fecha e a fumaça converge antes do orbe sair. */
  anticipation: 0.22,
  /** Núcleo: raio da esfera escura (diâmetro 0,8 tile). */
  coreRadius: 0.4,
  /** Halo aditivo em volta do núcleo, em tiles, e a pulsação dele. */
  haloSize: 2.4,
  haloPulse: 0.08,
  /** Anel rúnico que gira em volta do núcleo: raio e espessura do tubo. */
  ringRadius: 0.62,
  ringTube: 0.035,
  /** Rastro em fita: largura e tempo de vida da cauda. */
  ribbon: { width: 0.7, life: 0.45 },
  /** Curva de voo: altura máxima acima da linha reta (o orbe não rasteja no chão). */
  arc: 0.35,
  /** Impacto: flash, onda de choque no chão e tempo de rescaldo (luz apagando). */
  impact: { flashSize: 2.6, shockwaveStart: 0.4, shockwaveEnd: 2.6, linger: 0.35 },
  /** Cores (RGB linear). */
  colors: {
    core: [0.12, 0.02, 0.22],
    halo: [1.0, 0.25, 2.2],
    ring: [1.6, 0.5, 2.6],
    smoke: [0.25, 0.08, 0.38],
    mote: [1.4, 0.45, 2.4],
    moteEnd: [0.15, 0.02, 0.4],
    flash: [2.2, 0.8, 3.2],
  },
  /** Impacto no GameView: tremor, empurrão da câmera e congelamento curto do quadro. */
  shake: 0.08,
  kick: 0.1,
  hitStop: 0.04,
  /** Número de dano que a magia do inimigo causa em heróis: preenchimento claro e base roxa (contorno escuro do FloatText). */
  damageColors: { fill: '#e6c8ff', deep: '#7a2bd6' },
};
