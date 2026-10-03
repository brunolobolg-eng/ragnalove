import { MENU_VISUAL as M } from '../../config/visualConfig';

export type MenuPiece = keyof typeof M.pieces;
const PIECES = Object.keys(M.pieces) as MenuPiece[];

/**
 * Fundo do menu principal: a arte `tela-entrada.jpg` enche a tela toda (sem bordas vazias;
 * corta um pouco da arte quando a tela não é 16:9). Por cima, peças recortadas da mesma arte —
 * botões (esquerda), Ranking (direita) e slogan — que ficam sempre inteiras na tela: se o corte
 * as pegaria, são empurradas para dentro. As áreas clicáveis e os valores vivos moram dentro
 * dessas peças, então acompanham elas.
 */
export class MainMenuBackground {
  private readonly stage: HTMLElement;
  readonly pieces: Record<MenuPiece, HTMLElement>;
  private running = false;

  constructor(parent: HTMLElement) {
    const img = new URL(M.image, document.baseURI).href;
    this.stage = document.createElement('div');
    this.stage.className = 'mm-stage';
    this.stage.style.width = `${M.width}px`;
    this.stage.style.height = `${M.height}px`;
    this.stage.innerHTML = `<img class="mm-art" src="${img}" alt="" draggable="false">`;
    parent.appendChild(this.stage);

    const make = (id: MenuPiece): HTMLElement => {
      const [x, y, w, h] = M.pieces[id];
      const f = M.feather;
      const el = document.createElement('div');
      el.className = `mm-piece mm-piece-${id}`;
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const art = document.createElement('div');
      art.className = 'mm-piece-art';
      art.style.backgroundImage = `url("${img}")`;
      art.style.backgroundSize = `${M.width}px ${M.height}px`;
      art.style.backgroundPosition = `${-x}px ${-y}px`;
      // esfuma só os lados que não encostam na borda da arte
      const fade = (dir: string, a: boolean, b: boolean) =>
        `linear-gradient(${dir}, ${a ? 'transparent' : '#000'}, #000 ${f}px, #000 calc(100% - ${f}px), ${b ? 'transparent' : '#000'})`;
      art.style.setProperty('mask-image', `${fade('to right', x > 0, x + w < M.width)}, ${fade('to bottom', y > 0, y + h < M.height)}`);
      art.style.setProperty('mask-composite', 'intersect');
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
    }
  }
}
