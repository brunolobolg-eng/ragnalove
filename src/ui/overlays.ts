/**
 * Registro das janelas abertas (menus, painéis, confirmações, relatórios).
 * A tecla Esc chama `closeOpenOverlays()` uma vez e fecha todas as janelas abertas de uma vez.
 * Cada janela registra o próprio `isOpen` (aberta e fechável pelo Esc) e `close` (fecha como o ×).
 * Janela que não pode ser fechada assim (ex.: fim da jornada, que pede uma escolha) não se registra.
 */
export interface Overlay {
  /** Está aberta agora (e o Esc consegue fechá-la). */
  isOpen(): boolean;
  /** Fecha, como o botão × ou a resposta "não". */
  close(): void;
}

const overlays = new Set<Overlay>();

/** Registra uma janela. Cada janela registra uma vez, na construção. */
export function registerOverlay(o: Overlay): void {
  overlays.add(o);
}

/**
 * Fecha todas as janelas abertas. O estado é lido antes de fechar: uma janela que reabre outra ao
 * fechar (a coleção devolve ao menu do Bastião) não é fechada de novo na mesma tecla.
 * Devolve true se havia pelo menos uma janela aberta.
 */
export function closeOpenOverlays(): boolean {
  const abertas = [...overlays].filter((o) => o.isOpen());
  for (const o of abertas) o.close();
  return abertas.length > 0;
}

/** Tipos de <input> onde se digita: o Esc é do campo e não fecha janelas. */
const TEXTO = new Set(['text', 'search', 'email', 'number', 'password', 'tel', 'url']);

/** Foco num campo de texto (ou área de texto): Esc não fecha janelas. */
export function isTextEntry(alvo: EventTarget | null): boolean {
  if (alvo instanceof HTMLTextAreaElement) return true;
  if (alvo instanceof HTMLInputElement) return TEXTO.has(alvo.type);
  return alvo instanceof HTMLElement && alvo.isContentEditable;
}
