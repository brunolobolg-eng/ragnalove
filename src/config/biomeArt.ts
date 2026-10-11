/**
 * Arte dos mapas de gelo (Passo da Geada e Garganta de Ferrugem, bioma de montanha) e de lava (Cume das
 * Cinzas, bioma de cinzas). Só visual: a grade, o dano e as regras vêm do mapa da zona.
 * Unidades: `tiles` = tiles do mundo por repetição da textura; `opacity` de 0 a 1; `flow` = tiles por segundo;
 * cor em hexadecimal. Nomes: "...Tiles" escala a textura; "...Opacity" controla a transparência da camada.
 * `treeScale` = multiplicador do tamanho dos pinheiros de neve.
 */

/** Gelo: neve e gelo no chão, fendas, névoa e neve soprando; pedras e colunas de gelo nas bordas. */
export const ICE_ART = {
  tiles: { base: 3, drift: 4, crack: 2.5, rocky: 2, frost: 3, shade: 3, trail: 2, plaza: 2, lake: 2, mist: 9, streak: 6, web: 10 },
  opacity: { crack: 0.8, rocky: 0.75, frost: 0.6, shade: 0.45, trail: 0.85, mist: 0.22, streak: 0.14, web: 0.2 },
  color: { shade: 0x6f86a6, trail: 0xd3dfeb, lake: 0x8fd0ee },
  flow: { mist: [0.03, 0.01], streak: [0.12, 0.02] },
  treeScale: 1.3,
} as const;

/** Lava: basalto escuro com placas e veias incandescentes, rios de lava animados, fumaça e brasas. */
export const LAVA_ART = {
  tiles: { base: 3, plates: 4, crack: 2.5, vein: 2, trail: 2, plaza: 2, shade: 3, bank: 2, rim: 3, lava: 3, lavaFlow: 5, smoke: 10, embers: 6 },
  opacity: { plates: 0.4, crack: 0.7, vein: 0.6, trail: 0.85, shade: 0.6, rim: 0.6, lavaFlow: 0.75, smoke: 0.2, embers: 0.22 },
  color: { trail: 0x9d8f88, plaza: 0x8a7a70, shade: 0x050303, bank: 0x3d2a22 },
  flow: { lava: [0.12, 0.05], lavaFlow: [0.06, 0.09], rim: [0.02, 0.01], smoke: [0.02, 0.035], embers: [0.05, 0.08] },
} as const;
