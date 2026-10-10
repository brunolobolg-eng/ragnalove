/**
 * Números visuais da Arqueira (Liria): flecha básica e crítica, Chuva de Flechas (e Incendiária), Flecha Perfurante,
 * Foco do Caçador e as armadilhas (armadilha, mina, congelante, claymore).
 * Só apresentação: nenhum número aqui muda dano, recarga, alcance ou alvo.
 * Tempos em segundos; tamanhos em unidades do mundo (1 tile = 1 unidade). Cores em HDR (acima de 1 só nos núcleos
 * brilhantes, que o bloom transforma em luz); flashes pequenos, para não virar névoa sobre a arena.
 */
export const ARCHER_FX = {
  /** Flecha básica (leve): risco de luz do arco até o alvo, um brilho na corda e uma faísca no impacto. */
  arrow: {
    /** tempo da puxada até a soltura; igual ao atraso que ArrowFX.impactDelay usa (SkillFX.ts) */
    drawSec: 0.18,
    /** altura do arco da trajetória (no meio do voo) */
    arc: 0.12,
    /** núcleo do risco: verde-amarelado quase branco */
    core: [1.1, 1.5, 0.8],
    /** cabeça luminosa da flecha */
    head: [1.0, 1.4, 0.7],
    /** rastro em fita (fino, curto) */
    trail: [0.6, 1.0, 0.5],
    /** espessura e comprimento do risco */
    width: 0.1,
    length: 0.55,
    /** tamanho da cabeça luminosa */
    headSize: 0.12,
    /** fita de rastro: largura e vida */
    trailWidth: 0.06,
    trailLife: 0.14,
    /** faíscas no impacto */
    sparks: 5,
    /** tempo que o risco leva para sumir depois do impacto (s) */
    fadeSec: 0.12,
    /** tempo total depois do impacto (faíscas assentam) */
    tailSec: 0.3,
    /** animação de disparo que o personagem mostra (s), como no caso padrão */
    spectreSec: 0.4,
  },
  /** Flecha crítica: a mesma flecha, dourada, com estrela e flash curtos no impacto e o texto CRÍTICO!. */
  crit: {
    core: [3.0, 2.3, 0.7],
    head: [3.0, 2.2, 0.6],
    trail: [2.0, 1.5, 0.35],
    width: 0.13,
    length: 0.75,
    headSize: 0.17,
    trailWidth: 0.08,
    trailLife: 0.18,
    /** faíscas douradas no impacto */
    sparks: 12,
    /** flash curto no alvo (pequeno: um flash grande vira névoa) */
    flashColor: [2.2, 1.7, 0.5],
    flashSize: 0.75,
    flashLife: 0.13,
    /** estrela de impacto: cresce e some */
    starColor: [2.4, 1.8, 0.5],
    starSize: 0.5,
    starSizeEnd: 0.9,
    starLife: 0.22,
    /** tremor no impacto */
    shake: 0.04,
    /** altura (lift) do texto CRÍTICO! sobre o alvo */
    textLift: 1.5,
  },
  /**
   * Chuva de Flechas: marca de área no chão, flechas caindo do céu sobre ela (reaproveitadas), faíscas e poeira no
   * impacto. A Chuva Incendiária troca as flechas por flechas em chamas e deixa uma poça de brasas no chão.
   * O dano cai em RainFX.IMPACT (SkillFX.ts): o impacto visual é nesse mesmo instante.
   */
  rain: {
    /** quantas flechas caem (teto: cada uma é um sprite reaproveitado) */
    arrows: 12,
    /** tempo de queda, do topo até o chão (s) */
    dropSec: 0.3,
    /** altura de onde as flechas partem (unidades do mundo) */
    height: 5,
    /** deslocamento lateral do topo em relação ao ponto de impacto (vento) */
    windX: -0.9,
    windZ: -0.7,
    /** espessura e comprimento de cada flecha caindo */
    width: 0.09,
    length: 0.9,
    /** cores das flechas e das faíscas */
    core: [1.8, 2.4, 1.2],
    sparkEnd: [0.6, 0.9, 0.4],
    /** marca de área no chão (anel rúnico): cor, opacidade (baixa: é só uma marca) e duração */
    marker: [0.35, 0.8, 0.35],
    /** na Chuva Incendiária, a marca fica em brasa */
    markerFire: [1.4, 0.7, 0.25],
    markerOpacity: 0.6,
    markerLife: 1.0,
    /** estrela de impacto em cada ponto de queda (pequena) */
    starSize: 0.35,
    starSizeEnd: 0.7,
    starLife: 0.22,
    /** anel de choque no impacto (relativo ao raio da área) */
    ringColor: [1.2, 1.8, 0.8],
    ringLife: 0.4,
    /** poeira do impacto: quantidade e cor */
    dust: 5,
    dustColor: [0.42, 0.42, 0.36],
    /** tremor no impacto */
    shake: 0.05,
    /** animação de disparo que o personagem mostra (s) */
    spectreSec: 0.6,
    /** Chuva Incendiária: cor das flechas em chamas, chance de brasa por flecha e tempo das brasas */
    fireCore: [2.8, 1.3, 0.35],
    fireSpawnPerSec: 20,
    emberColor: [2.4, 0.9, 0.2],
    emberRate: 10,
    emberSec: 2,
    /** poça de brasas no chão (groundCircle com runesFire): duração (o tamanho acompanha a área) */
    patchLife: 2.4,
    /** tempo que a cena fica depois do impacto, sem brasas (s) */
    tailSec: 0.5,
  },
  /**
   * Flecha Perfurante: a flecha risca a linha inteira (fita e risco de luz), deixa 2 a 3 cópias esmaecendo atrás,
   * faíscas ao longo do caminho e, no impacto, um risco de luz cobre a linha toda (todos os inimigos dela são atingidos).
   */
  pierce: {
    /** puxada no arco (s) */
    drawSec: 0.05,
    /** instante em que a linha é atingida (s). Igual ao PIERCE_IMPACT do GameView.ts (acertos da linha). */
    impactSec: 0.15,
    /** distância do arco até onde o risco começa (fora do corpo da arqueira) */
    startOffset: 0.6,
    /** comprimento do risco em movimento (atrás da cabeça) */
    beamLen: 1.8,
    /** espessura do risco */
    width: 0.16,
    /** núcleo do risco: ciano-branco */
    core: [1.5, 2.6, 2.9],
    /** borda escura (mistura normal) que dá contraste ao núcleo */
    dark: [0.05, 0.22, 0.28],
    /** fita de rastro */
    trail: [0.7, 1.4, 1.7],
    trailWidth: 0.14,
    trailLife: 0.2,
    /** cópias que ficam para trás: intensidade de cada uma, e quanto atrasam (fração do percurso) */
    ghostOpacity: [0.5, 0.3, 0.15],
    ghostLag: [0.12, 0.24, 0.36],
    ghostColor: [0.9, 1.8, 2.2],
    /** faíscas em pontos do caminho, durante o voo (fração do percurso) */
    sweepBursts: [0.35, 0.7],
    /** risco de luz que cobre a linha no impacto: cor, espessura e tempo para apagar */
    lineColor: [1.5, 2.5, 2.9],
    lineWidth: 0.22,
    lineFadeSec: 0.45,
    /** flash pequeno na ponta da flecha */
    endFlashSize: 1.0,
    endFlashLife: 0.16,
    /** faíscas ao longo da linha no impacto (pontos e quantidade por ponto) */
    lineSparkPoints: 5,
    lineSparks: 3,
    /** empurrão de câmera no impacto */
    kick: 0.06,
    /** tempo total depois do impacto (s) */
    tailSec: 0.7,
    /** animação de ataque pesado do personagem (igual ao caso padrão) */
    spectreSec: 0,
  },
  /**
   * Foco do Caçador: um círculo rúnico verde gira sob a arqueira, três marcas de mira orbitam em volta dela, anéis
   * pulsam no chão e brilhos sobem. Dura o tempo do buff (ticks / 10 segundos), com fade no fim.
   */
  focus: {
    /** cor verde-limão do foco (HDR) */
    color: [0.8, 2.4, 0.9],
    /** diâmetro do círculo rúnico no chão (unidades) e velocidade de giro (rad/s) */
    glyphSize: 1.7,
    glyphSpin: 0.8,
    /** marcas de mira: quantidade, raio da órbita, altura, tamanho e velocidade (rad/s) */
    ticks: 3,
    tickRadius: 0.75,
    tickHeight: 1.05,
    tickSize: 0.15,
    tickColor: [1.2, 2.6, 1.2],
    tickSpin: 2.0,
    /** anel de mira no chão que pulsa a cada intervalo (s) */
    pulseSec: 0.9,
    pulseColor: [0.5, 1.4, 0.5],
    pulseLife: 0.5,
    /** brilhos que sobem: intervalo entre eles (s) */
    moteSec: 0.12,
    /** anel e flash do início (o instante em que o foco é ativado) */
    startRing: 2.2,
    startFlashSize: 1.3,
    startFlashLife: 0.2,
    /** último trecho em que tudo esmaece (s) */
    fadeSec: 0.6,
  },
  /**
   * Armadilhas: marca no chão ao armar e um disparo próprio por tipo, com forma e movimento diferentes.
   * Os textos flutuantes são os mesmos do caso padrão do GameView.ts.
   */
  trap: {
    /** cor da marca no chão ao armar (HDR, esmaecida), por tipo */
    markColor: {
      snare: [0.9, 0.7, 0.35],
      mine: [1.3, 0.45, 0.2],
      freeze: [0.55, 1.2, 1.9],
      claymore: [1.4, 0.75, 0.25],
    } as Record<string, number[]>,
    /** raio da marca = base + fator × raio da armadilha (tiles) */
    markBase: 0.35,
    markPerRadius: 0.25,
    markLife: 1.0,
    /** texto flutuante e tamanho, por tipo (igual ao GameView.ts) */
    text: {
      snare: { text: 'Armadilha!', color: '#ffd08a', size: 0.28 },
      mine: { text: 'BOOM!', color: '#ffb04a', size: 0.3 },
      freeze: { text: 'Congelados!', color: '#9ad8ff', size: 0.3 },
      claymore: { text: 'CLAYMORE!', color: '#ffb04a', size: 0.3 },
    } as Record<string, { text: string; color: string; size: number }>,
    /** altura do texto sobre o chão */
    textLift: 1.7,
    /** Armadilha comum: pontas de aço que saltam do chão em volta do centro, e faíscas metálicas */
    snare: {
      spikes: 8,
      spikeRadius: 0.26,
      spikeHeight: 0.5,
      spikeWidth: 0.05,
      /** tempo para as pontas saltarem; tempo que ficam; tempo para sumirem (s) */
      popSec: 0.07,
      holdSec: 0.18,
      lifeSec: 0.42,
      sparkColor: [2.2, 1.9, 1.1],
      sparks: 8,
      ringColor: [2.0, 1.6, 0.8],
      ringSize: 0.7,
      dust: 3,
      shake: 0.05,
    },
    /** Mina Terrestre: bola de fogo, anel de choque, estilhaços e marca de queimado */
    mine: {
      flashColor: [2.2, 1.4, 0.6],
      flashSize: 0.7,
      flashSizePerRadius: 0.4,
      flashLife: 0.16,
      fire: 18,
      fireColor: [3.0, 1.4, 0.3],
      fireEnd: [0.5, 0.08, 0.0],
      fireUp: 2.4,
      ringColor: [2.0, 1.0, 0.3],
      ringGrow: 2.4,
      /** segundo anel, atrasado (s), menor */
      ring2Sec: 0.12,
      ring2Grow: 1.6,
      debris: 16,
      debrisColor: [2.4, 1.5, 0.5],
      debrisEnd: [0.5, 0.15, 0.05],
      smoke: 7,
      smokeColor: [0.18, 0.15, 0.13],
      scorchLife: 5,
      shake: 0.1,
      lifeSec: 1.3,
    },
    /** Armadilha Congelante: gelo que sobe em anel, névoa de geada e brilhos */
    freeze: {
      /** marca de geada no chão (decalque que se desfaz) */
      frostLife: 3,
      frostOpacity: 0.5,
      ringColor: [0.9, 1.6, 2.4],
      ringGrow: 2.2,
      /** cristais em anel: quantidade, raio, altura (mínima e máxima) e espessura */
      shards: 8,
      shardRadius: 0.85,
      shardMinH: 0.55,
      shardMaxH: 0.85,
      shardWidth: 0.07,
      shardColor: [1.3, 2.3, 3.2],
      shardDark: [0.1, 0.25, 0.5],
      /** névoa de geada: quantidade e cor */
      mist: 8,
      mistColor: [0.7, 0.85, 1.0],
      sparks: 14,
      sparkColor: [1.6, 2.6, 3.4],
      sparkEnd: [0.4, 0.8, 1.6],
      shake: 0.06,
      lifeSec: 1.25,
    },
    /** Claymore: leque de fogo na direção de quem vem pela trilha (da arqueira para a armadilha) e explosão grande */
    claymore: {
      /** leque: quantos jatos, abertura (rad, para cada lado), velocidade e quantidade por jato */
      fanRays: 5,
      fanSpread: 0.56,
      fanSpeed: 5.4,
      fanPerRay: 6,
      fanColor: [3.0, 1.5, 0.3],
      fanEnd: [0.5, 0.1, 0.0],
      /** faíscas do leque: quantidade por jato e velocidade */
      fanSparksPerRay: 4,
      fanSparkSpeed: 7,
      fanSparkColor: [3.0, 2.6, 1.6],
      /** crescente de chama na frente do leque: tamanho (× raio) e cor */
      crescentSize: 1.4,
      crescentGrow: 2.4,
      crescentColor: [3.0, 1.4, 0.35],
      crescentFadeSec: 0.4,
      flashColor: [1.5, 1.0, 0.5],
      flashSize: 0.5,
      flashSizePerRadius: 0.3,
      flashLife: 0.2,
      ringColor: [2.2, 1.0, 0.3],
      ringGrow: 1.8,
      /** coluna de fogo para cima: quantidade, cor, tamanho inicial e final e vida */
      fire: 26,
      fireColor: [3.0, 1.5, 0.3],
      fireEnd: [0.5, 0.1, 0.0],
      fireSize: 0.45,
      fireSizeEnd: 0.1,
      fireLife: 0.65,
      smoke: 10,
      smokeColor: [0.18, 0.15, 0.13],
      scorchLife: 5,
      shake: 0.2,
      hitStop: 0.04,
      lifeSec: 1.2,
      /** luz de apoio (só se a explosão ficar longe da arqueira: a luz estoura o traje dela) */
      lightColor: 0xff7a2a,
      lightIntensity: 0.1,
      lightDistance: 2.4,
      lightMinDist: 2.5,
    },
  },
};
