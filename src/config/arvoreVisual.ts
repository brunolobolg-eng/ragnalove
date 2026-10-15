import type { BonusKey, Categoria, FamiliaId, NoTipo } from './arvoreGlobal';

/**
 * Visual da Árvore de Aurenthal (roda). Só apresentação: nenhuma regra de jogo mora aqui.
 * Medidas em pixels da tela com zoom 1. Cores e setores vêm da arte da roda (public/ui/arvore, base 15.webp).
 * Os nomes dos nós não ficam na roda: aparecem no painel de detalhes e no tooltip. Na roda, cada nó é uma forma
 * (tipo) com um ícone (bônus) da arte do kit (public/ui/kit).
 * Para trocar uma arte da roda, rode `python3 scripts/recortarArvore.py <imagem>` e ajuste as caixas ali.
 */

/** Tamanho de cada tipo de nó no zoom 1 (px, diâmetro da forma). O núcleo é a área de clique; a arte dele é maior. */
export const TAMANHO_NO: Record<NoTipo, number> = { raiz: 64, comum: 34, notavel: 44, caminho: 30, mastery: 46 };

export const ARVORE_VISUAL = {
  /** Diâmetro da arte do emblema de Aurenthal no centro (px). Decorativa: o nó do núcleo fica no meio dela. */
  nucleoArte: 118,
  /** Anéis da roda: raio do primeiro anel (px), passo entre anéis (profundidade por BFS) e folga para o nó sair do anel. */
  anel: { primeiro: 92, passo: 33, banda: 10 },
  /** Setores: meia-largura de cada família (graus) e o máximo que um nó pode se afastar do centro do setor. */
  setorMeioGrau: 30,
  setorMeioGrauMax: 46,
  /** Medalhão de cada setor: distância do centro (px), diâmetro (px) e folga que os nós mantêm dele. */
  emblema: { raio: 214, diametro: 64, folga: 2 },
  /** Aro da moldura (raio externo, px). Os nós ficam dentro dele. */
  aroRaio: 402,
  /** Miolo escuro da roda (raio, px). */
  mioloRaio: 380,
  /** Folga mínima entre dois nós ou entre nó e medalhão (px). */
  folga: 4,
  zoom: {
    padrao: 1,
    minimo: 0.5,
    maximo: 3,
  },
  /** Ícone dentro de cada tipo de nó (px, zoom 1). O caminho alternativo não tem ícone: é a forma e a linha. */
  icone: { comum: 22, notavel: 27, mastery: 34 },
  /** Textura de pedra do fundo da roda (caminho em public/, usado pelo CSS do canvas). */
  textura: { pedra: 'textures/pedras/pedra_escura.webp' },
  /** Escala do nó em destaque (cursor ou seleção) e tempo das transições (s). */
  destaque: { escala: 1.12, transicao: 0.18 },
  cor: {
    /** Nós sem setor próprio (núcleo e caminhos de ligação): dourado neutro. As demais cores vêm de FAMILIA_VISUAL. */
    neutra: '#d9b45a',
  },
} as const;

/**
 * Setor de cada família, com a cor e a arte de `public/ui/arvore` (amostradas da 15.webp).
 * `grau`: ângulo do centro do setor na tela (0 = direita, −90 = cima, 90 = baixo).
 * As cores são um pouco dessaturadas em relação à arte, para a roda não virar arco-íris.
 */
export const FAMILIA_VISUAL: Record<FamiliaId, { grau: number; cor: string; emblema: string }> = {
  destruicao: { grau: -90, cor: '#e07050', emblema: 'ui/arvore/emblema-destruicao.webp' },
  controle: { grau: -150, cor: '#5b9ee0', emblema: 'ui/arvore/emblema-controle.webp' },
  protecao: { grau: -30, cor: '#8cc46a', emblema: 'ui/arvore/emblema-protecao.webp' },
  execucao: { grau: 150, cor: '#9b6fd6', emblema: 'ui/arvore/emblema-execucao.webp' },
  mobilidade: { grau: 90, cor: '#e3b256', emblema: 'ui/arvore/emblema-mobilidade.webp' },
  sinergia: { grau: 30, cor: '#51bfd6', emblema: 'ui/arvore/emblema-sinergia.webp' },
};

/**
 * Setor de cada região (nós que não são Mastery). Região sem setor (núcleo, fronteira) herda o setor do nó
 * de onde a rede chega até ela. Mudar aqui muda só a posição e a cor dos nós, não a regra.
 */
export const SETOR_DA_REGIAO: Partial<Record<string, FamiliaId>> = {
  chamas: 'destruicao',
  ermos: 'controle',
  muralha: 'protecao',
  sombra: 'execucao',
  cidades: 'mobilidade',
  bastiao: 'sinergia',
};

/**
 * Ícone de cada nó, pelo primeiro bônus dele que está nesta lista (arte do kit em public/ui/kit, do dono).
 * Bônus sem ícone caem no ícone da categoria. Nó sem bônus (notável de Mastery) usa o emblema do setor.
 */
export const ICONE_POR_BONUS: Partial<Record<BonusKey, string>> = {
  vit: 'ui/kit/sp_heart.webp',
  hp: 'ui/kit/sp_heart.webp',
  block: 'ui/kit/ico_shield.webp',
  reduce: 'ui/kit/ico_shield.webp',
  dmg: 'ui/kit/ico_swords.webp',
  str: 'ui/kit/ico_swords.webp',
  critDano: 'ui/kit/sp_sword.webp',
  crit: 'ui/kit/ico_star.webp',
  dodge: 'ui/kit/sp_paw.webp',
  dex: 'ui/kit/sp_leaf.webp',
  haste: 'ui/kit/ico_calendar.webp',
  int: 'ui/kit/orb_blue.webp',
  luk: 'ui/kit/ico_gift.webp',
  expCombate: 'ui/kit/ico_scroll.webp',
  almasCombate: 'ui/kit/orb_red.webp',
  zeniHorda: 'ui/kit/ico_coin.webp',
  zeniElite: 'ui/kit/ico_coin.webp',
  zeniChefe: 'ui/kit/ico_coin.webp',
  zeniSobrevivencia: 'ui/kit/ico_coin.webp',
  zeniEvento: 'ui/kit/ico_bell.webp',
  zenNoite: 'ui/kit/ico_coin.webp',
  descontoCidade: 'ui/kit/ico_bag.webp',
  custoConstrucao: 'ui/kit/ico_bag.webp',
  reparoCidade: 'ui/kit/ico_pin.webp',
  reparoBastiao: 'ui/kit/ico_gear.webp',
  muralhaVida: 'ui/kit/ico_door.webp',
  pontosHabilidade: 'ui/kit/ico_compass.webp',
  recrutas: 'ui/kit/ico_group.webp',
  sorteLoja: 'ui/kit/ico_gift.webp',
};

/** Ícone da categoria, usado quando o nó não tem bônus com ícone. */
export const ICONE_POR_CATEGORIA: Record<Categoria, string> = {
  progressao: 'ui/kit/ico_compass.webp',
  campanha: 'ui/kit/ico_pin.webp',
  bastiao: 'ui/kit/ico_door.webp',
  combate: 'ui/kit/ico_swords.webp',
  masteries: 'ui/kit/sp_emblem.webp',
  ligacao: 'ui/kit/ico_handshake.webp',
};
