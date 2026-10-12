/**
 * Marcação das cartas de monstro (frente e verso). A arte vem recortada (CARD_ART_WINDOW); a moldura, a faixa do
 * nome e a cor são iguais em todas as cartas (não há raridade). Textos vindos dos dados passam por escTxt.
 */
import { CARD_ART_WINDOW, CARD_BY_ID, CARD_CATEGORY_LABEL, CARD_MAX_LEVEL, cardArt, cardLevelLabel, describeBonus, type CardDef } from '../core/progression/cards';

/** Dourado da moldura: borda, brilho e nome de todas as cartas. */
export const CARD_GOLD = '#d4a84f';

/** Texto seguro para atributo e HTML. */
export const escTxt = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Etiqueta do desbloqueio: só a carta no nível máximo tem a regra extra. */
export const NIVEL_MAX_TAG = `<i class="cd-nv5">Nível ${CARD_MAX_LEVEL}</i>`;

/** Categoria em pt-BR ('Sustentação', 'Ofensiva'...). */
export const categoriaTexto = (d: CardDef): string => CARD_CATEGORY_LABEL[d.category];

/**
 * 'Onde vai' para a tela: '?' (a tabela não diz) vira 'a definir'; o '?' final (dúvida da tabela) vira
 * 'a confirmar'. Ex.: 'arma?' → 'arma (a confirmar)'.
 */
export function origemTexto(d: CardDef): string {
  const o = d.origin.trim();
  if (o === '' || o === '?') return 'a definir';
  return o.endsWith('?') ? `${o.slice(0, -1).trim()} (a confirmar)` : o;
}

/** Estilo da imagem para mostrar só a área da ilustração (a imagem continua proporcional). */
function artStyle(): string {
  const { x, y, w, h } = CARD_ART_WINDOW;
  return `width:${(100 / w).toFixed(3)}%;height:${(100 / h).toFixed(3)}%;left:${((-x / w) * 100).toFixed(3)}%;top:${((-y / h) * 100).toFixed(3)}%`;
}

/** Só a ilustração recortada, dentro de um contêiner com a classe dada (miniaturas e frente da carta). */
export function cardArtHtml(id: string, cls = 'cf-art'): string {
  return `<span class="${cls}"><img src="${cardArt(id)}" alt="" style="${artStyle()}" draggable="false"></span>`;
}

/**
 * Ornamentos da moldura (cantos em filigrana, pontas e gemas): traçado dourado, gemas na cor da moldura.
 * A frente só leva a parte de cima (a faixa do nome cobre a de baixo); o verso leva o conjunto completo.
 */
const ORN_TOP = 'M7 16 Q7 7 16 7 L24 7 M7 16 L7 24 M93 16 Q93 7 84 7 L76 7 M93 16 L93 24 M50 1 L55 9 L50 17 L45 9 Z';
const ORN_BOTTOM = 'M7 124 Q7 133 16 133 L24 133 M7 124 L7 116 M93 124 Q93 133 84 133 L76 133 M93 124 L93 116 M50 123 L55 131 L50 139 L45 131 Z';
const ORN_GEMS = '<path class="gem" d="M3.5 70 L7.5 66 L11.5 70 L7.5 74 Z M88.5 70 L92.5 66 L96.5 70 L92.5 74 Z" />';
const ornament = (full: boolean): string =>
  `<svg class="cf-orn" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><path d="${full ? `${ORN_TOP} ${ORN_BOTTOM}` : ORN_TOP}" />${ORN_GEMS}</svg>`;

/** Frente da carta: arte recortada, moldura ornamental e faixa com o nome (nível 1) e a categoria. */
export function cardFaceHtml(id: string): string {
  const d = CARD_BY_ID[id];
  if (!d) return '';
  const nome = escTxt(cardLevelLabel(d, 1));
  const long = nome.length > 14 ? ' class="long"' : '';
  return `${cardArtHtml(id)}
    ${ornament(false)}
    <span class="cf-band"><b${long}>${nome}</b><em>${categoriaTexto(d)}</em></span>`;
}

/** Verso da carta: navy com a moldura dourada (já visível antes de revelar) e o logo do ROguard no centro. */
export function cardBackHtml(): string {
  return `${ornament(true)}<img class="cf-emb" src="emblem.png" alt="" draggable="false">`;
}

/** Bônus no nível dado (o número já vem escalado pelo nível): nome do efeito e o que ele faz. */
export function cardBonusText(id: string, level: number): string {
  const d = CARD_BY_ID[id];
  return d ? `<b>${escTxt(d.bonus.name)}</b> — ${escTxt(describeBonus(d, level))}` : '';
}

/** Desbloqueio (só no nível máximo): nome e descrição. A etiqueta 'Nível 5' vem de NIVEL_MAX_TAG. */
export function cardUnlockText(id: string): string {
  const d = CARD_BY_ID[id];
  return d ? `<b>${escTxt(d.unlock.name)}</b> — ${escTxt(d.unlock.desc)}` : '';
}
