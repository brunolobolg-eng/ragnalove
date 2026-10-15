import type { FamiliaId, NoTipo } from './arvoreGlobal';

/**
 * Visual da Árvore de Aurenthal (roda). Só apresentação: nenhuma regra de jogo mora aqui.
 * Medidas em pixels da tela com zoom 1. Cores e setores vêm da arte da roda (public/ui/arvore, base 15.webp).
 * Para trocar uma arte, rode `python3 scripts/recortarArvore.py <imagem>` e ajuste as caixas ali.
 */

/** Tamanho de cada tipo de nó no zoom 1 (px, diâmetro da forma). O núcleo é a área de clique; a arte dele é maior. */
export const TAMANHO_NO: Record<NoTipo, number> = { raiz: 64, comum: 34, notavel: 44, caminho: 30, mastery: 46 };

export const ARVORE_VISUAL = {
  /** Diâmetro da arte do emblema ROGUARD no centro (px). Decorativa: o nó do núcleo fica no meio dela. */
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
  /** Folga mínima entre dois nós ou entre nó e rótulo (px). */
  folga: 4,
  zoom: {
    padrao: 1,
    minimo: 0.5,
    maximo: 3,
    /** A partir deste zoom, os nomes dos notáveis e das Masteries aparecem. */
    rotulosDestaque: 0.75,
    /** A partir deste zoom, todos os nomes aparecem. */
    rotulosTodos: 1.2,
  },
  rotulo: {
    fonte: 13,
    /** Altura de uma linha do rótulo (px). */
    linha: 15,
    /** Largura média de um caractere na fonte do rótulo (px). */
    caractere: 6.0,
    /** Máximo de caracteres por linha antes de quebrar o nome. */
    maxCaracteres: 11,
    /** Meia-largura e meia-altura da área em que um nome pode ficar (px): o canvas, que passa um pouco do aro. */
    limiteX: 430,
    limiteY: 392,
  },
  cor: {
    /** Nós sem setor próprio (núcleo e caminhos de ligação): dourado neutro. As demais cores vêm de FAMILIA_VISUAL. */
    neutra: '#d9b45a',
  },
} as const;

/**
 * Setor de cada família, com a cor e a arte de `public/ui/arvore` (amostradas da 15.webp).
 * `grau`: ângulo do centro do setor na tela (0 = direita, −90 = cima, 90 = baixo).
 */
export const FAMILIA_VISUAL: Record<FamiliaId, { grau: number; cor: string; emblema: string }> = {
  destruicao: { grau: -90, cor: '#ec6a44', emblema: 'ui/arvore/emblema-destruicao.webp' },
  controle: { grau: -150, cor: '#5aa8ff', emblema: 'ui/arvore/emblema-controle.webp' },
  protecao: { grau: -30, cor: '#8fd05e', emblema: 'ui/arvore/emblema-protecao.webp' },
  execucao: { grau: 150, cor: '#a86ae6', emblema: 'ui/arvore/emblema-execucao.webp' },
  mobilidade: { grau: 90, cor: '#f0b84a', emblema: 'ui/arvore/emblema-mobilidade.webp' },
  sinergia: { grau: 30, cor: '#4fd0e6', emblema: 'ui/arvore/emblema-sinergia.webp' },
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
