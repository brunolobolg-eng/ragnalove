import { UI_KIT } from '../config/uiKit';

/**
 * Caminho de uma peça do kit, relativo como os demais arquivos de public/ (funciona no modo dev
 * e no executável, que abre por file://).
 */
export function kitIcon(id: string): string {
  return `ui/kit/${id}.webp`;
}

/**
 * Põe a arte do kit em variáveis CSS na raiz: --kit-<id> (imagem), --kit-<id>-s (corte da moldura)
 * e --kit-<id>-t / -b (cores do miolo, usadas no preenchimento de botões e barras).
 * Chamado uma vez no início; o style.css lê essas variáveis.
 */
export function applyKit(root: HTMLElement = document.documentElement): void {
  for (const [id, a] of Object.entries(UI_KIT)) {
    root.style.setProperty(`--kit-${id}`, `url("${a.file}")`);
    if (a.slice) root.style.setProperty(`--kit-${id}-s`, a.slice.join(' '));
    if (a.fill) {
      root.style.setProperty(`--kit-${id}-t`, a.fill.top);
      root.style.setProperty(`--kit-${id}-b`, a.fill.bottom);
    }
  }
}
