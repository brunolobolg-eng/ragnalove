/**
 * Temporadas do ROguard: cada temporada troca a arte de fundo do menu principal. O layout do menu (áreas
 * clicáveis, Ranking e rótulos, em `MENU_VISUAL`) é o mesmo para todas, então a arte nova precisa ter a mesma
 * composição e a mesma proporção da arte de referência.
 *
 * Temporada nova: colocar a arte em `public/menu/` e acrescentar uma linha aqui, com a data de início.
 */
export interface Temporada {
  id: string;
  /** Nome da temporada (exibido em telas e no registro). */
  nome: string;
  /** Arte de fundo do menu, relativa a `public/`. */
  arte: string;
  /** Primeiro dia da temporada (AAAA-MM-DD, horário local). Vale até a próxima começar. */
  inicio: string;
}

/** Em ordem crescente de `inicio`. A primeira vale antes de qualquer data. */
export const TEMPORADAS: Temporada[] = [
  { id: 'temporada-1', nome: 'Temporada 1', arte: 'menu/temporada1.webp', inicio: '2026-10-01' },
];

/** Temporada vigente na data dada: a última cujo início já passou (datas AAAA-MM-DD ordenam como texto). */
export function temporadaAtual(hoje: Date = new Date(), lista: Temporada[] = TEMPORADAS): Temporada {
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  let atual = lista[0];
  for (const t of lista) if (t.inicio <= dia) atual = t;
  return atual;
}
