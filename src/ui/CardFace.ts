/**
 * Marcação das cartas de monstro (frente e verso). A arte vem recortada (CARD_ART_WINDOW) e a moldura,
 * a faixa do nome e a raridade são desenhadas aqui, iguais em todas as cartas.
 */
import { CARD_ART_WINDOW, CARD_BY_ID, cardArt, type CardRarity } from '../core/progression/cards';

export const RARITY_LABEL: Record<CardRarity, string> = { normal: 'Normal', miniboss: 'Mini-Boss', mvp: 'MVP' };
export const RARITY_COLOR: Record<CardRarity, string> = { normal: '#b8c4dc', miniboss: '#c77dff', mvp: '#ffd700' };

/** Estilo da imagem para mostrar só a área da ilustração (a imagem continua proporcional). */
function artStyle(): string {
  const { x, y, w, h } = CARD_ART_WINDOW;
  return `width:${(100 / w).toFixed(3)}%;height:${(100 / h).toFixed(3)}%;left:${((-x / w) * 100).toFixed(3)}%;top:${((-y / h) * 100).toFixed(3)}%`;
}

/** Só a ilustração recortada, dentro de um contêiner com a classe dada (miniaturas e frente da carta). */
export function cardArtHtml(id: string, cls = 'cf-art'): string {
  return `<span class="${cls}"><img src="${cardArt(id)}" alt="" style="${artStyle()}" draggable="false"></span>`;
}

/** Frente da carta: arte recortada, moldura e faixa com o nome e a raridade. */
export function cardFaceHtml(id: string): string {
  const d = CARD_BY_ID[id];
  if (!d) return '';
  const long = d.name.length > 14 ? ' class="long"' : '';
  return `${cardArtHtml(id)}
    <span class="cf-band"><b${long}>${d.name}</b><em>${RARITY_LABEL[d.rarity]}</em></span>`;
}

/** Verso da carta: navy com filigrana dourada e o emblema do jogo no centro. */
export function cardBackHtml(): string {
  return `<img class="cf-emb" src="emblem.png" alt="" draggable="false">`;
}
