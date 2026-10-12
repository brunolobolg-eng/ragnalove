import { temporadaAtual } from '../../config/temporadas';
import { MENU_VISUAL as M } from '../../config/visualConfig';

export type MenuPiece = keyof typeof M.pieces;
const PIECES = Object.keys(M.pieces) as MenuPiece[];

/**
 * Máscara que esfuma só as bordas da peça que dão para dentro da arte. A borda que encosta na tela (peça empurrada)
 * fica firme: além dela não há arte, e esfumar deixaria aparecer a arte de trás, fora do lugar.
 */
function esfumado(f: number, [x, y, w, h]: readonly number[], encostada: Record<'esq' | 'dir' | 'cima' | 'baixo', boolean>): string {
  const faixa = (dir: string, a: boolean, b: boolean) =>
    `linear-gradient(${dir}, ${a ? 'transparent' : '#000'}, #000 ${f}px, #000 calc(100% - ${f}px), ${b ? 'transparent' : '#000'})`;
  return `${faixa('to right', x > 0 && !encostada.esq, x + w < M.width && !encostada.dir)}, ${faixa('to bottom', y > 0 && !encostada.cima, y + h < M.height && !encostada.baixo)}`;
}

/**
 * Fundo do menu principal: a arte da temporada vigente enche a tela toda (sem bordas vazias;
 * corta um pouco da arte quando a tela não é 16:9). Por cima, peças recortadas da mesma arte —
 * botões (esquerda), Ranking (direita) e slogan — que ficam sempre inteiras na tela: se o corte
 * as pegaria, são empurradas para dentro. As áreas clicáveis e os valores vivos moram dentro
 * dessas peças, então acompanham elas.
 */
export class MainMenuBackground {
  private readonly stage: HTMLElement;
  readonly pieces: Record<MenuPiece, HTMLElement>;
  private running = false;
  private readonly parent: HTMLElement;
  /** Elementos avulsos por cima da arte (ex.: rodapé), presos a um canto da tela como as peças. */
  private readonly floats: { el: HTMLElement; rect: readonly number[] }[] = [];
  /** Camada de arte de cada peça (a máscara de esfumado muda com a tela: ver `resize`). */
  private readonly arts = {} as Record<MenuPiece, HTMLElement>;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    const img = new URL(temporadaAtual().arte, document.baseURI).href;
    this.stage = document.createElement('div');
    this.stage.className = 'mm-stage';
    this.stage.style.width = `${M.width}px`;
    this.stage.style.height = `${M.height}px`;
    this.stage.innerHTML = `<img class="mm-art" src="${img}" alt="" draggable="false">`;
    parent.appendChild(this.stage);

    const make = (id: MenuPiece): HTMLElement => {
      const [x, y, w, h] = M.pieces[id];
      const el = document.createElement('div');
      el.className = `mm-piece mm-piece-${id}`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const art = document.createElement('div');
      art.className = 'mm-piece-art';
      art.style.backgroundImage = `url("${img}")`;
      art.style.backgroundSize = `${M.width}px ${M.height}px`;
      art.style.backgroundPosition = `${-x}px ${-y}px`;
      art.style.setProperty('mask-composite', 'intersect');
      this.arts[id] = art;
      el.appendChild(art);
      parent.appendChild(el);
      return el;
    };
    this.pieces = Object.fromEntries(PIECES.map((id) => [id, make(id)])) as Record<MenuPiece, HTMLElement>;
    window.addEventListener('resize', () => this.running && this.resize());
  }

  /** Posição na arte (px da imagem) → estilo absoluto dentro de uma peça que começa em `origin`. */
  static rect(el: HTMLElement, [x, y, w, h]: readonly number[], origin: readonly number[] = [0, 0]): HTMLElement {
    el.style.left = `${x - origin[0]}px`;
    el.style.top = `${y - origin[1]}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    return el;
  }

  /** Põe um elemento por cima da arte, nas coordenadas da arte. Acompanha a escala e é empurrado para dentro da tela. */
  place(el: HTMLElement, rect: readonly number[]): HTMLElement {
    el.style.width = `${rect[2]}px`;
    el.style.height = `${rect[3]}px`;
    el.style.transformOrigin = '0 0';
    this.parent.appendChild(el);
    this.floats.push({ el, rect });
    return el;
  }

  start(): void {
    this.running = true;
    this.resize();
  }

  stop(): void {
    this.running = false;
  }

  private resize(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const s = Math.max(W / M.width, H / M.height); // enche a tela (cover)
    const ox = (W - M.width * s) / 2;
    const oy = (H - M.height * s) / 2;
    this.stage.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
    // cada peça fica no lugar da arte; se a tela cortar a arte, ela é empurrada para dentro
    for (const id of PIECES) {
      const [x, y, w, h] = M.pieces[id];
      const px = Math.min(Math.max(ox + x * s, 0), W - w * s);
      const py = Math.min(Math.max(oy + y * s, 0), H - h * s);
      this.pieces[id].style.transform = `translate(${px}px, ${py}px) scale(${s})`;
      const encostada = { esq: px <= 0.5, dir: px >= W - w * s - 0.5, cima: py <= 0.5, baixo: py >= H - h * s - 0.5 };
      this.arts[id].style.setProperty('mask-image', esfumado(M.feather, M.pieces[id], encostada));
    }
    // elementos avulsos por cima da arte (ex.: rodapé): a mesma regra das peças
    for (const f of this.floats) {
      const [x, y, w, h] = f.rect;
      const px = Math.min(Math.max(ox + x * s, 0), W - w * s);
      const py = Math.min(Math.max(oy + y * s, 0), H - h * s);
      f.el.style.transform = `translate(${px}px, ${py}px) scale(${s})`;
    }
  }
}
