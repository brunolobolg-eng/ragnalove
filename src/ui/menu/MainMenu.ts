import { MENU_VISUAL as M } from '../../config/visualConfig';
import { HallOfLegends, type LegendValues } from './HallOfLegends';
import { MainMenuBackground } from './MainMenuBackground';
import { MainMenuNavigation } from './MainMenuNavigation';

/**
 * Menu principal (jogo 100% offline: sem login, sem contas, sem salvar/carregar manual).
 * A tela é a arte `tela-entrada.png`: COMEÇAR JORNADA, OPÇÕES, INFO e DONATE ♥ já estão
 * desenhados nela — o menu põe por cima as áreas clicáveis (com brilho ao passar/focar),
 * os valores do Ranking e a lista de apoiadores.
 * Só interface: quem decide o que acontece são os ganchos recebidos do main.
 */
export interface MenuState {
  /** Run em andamento ("Ato I · fase 3/15"); ausente = começa uma nova. */
  continueLabel?: string;
  /** Recordes do Ranking (ausente = "???"). */
  legends: LegendValues;
}

export interface MainMenuHooks {
  onStart(): void;
  onOptions(panel: 'audio' | 'video'): void;
  onCloseOptions(): void;
  onUi(): void;
  state(): MenuState;
}

const LABEL: Record<keyof typeof M.buttons, string> = { start: 'Começar jornada', options: 'Opções', info: 'Info', donate: 'Donate' };

export class MainMenu {
  private readonly el: HTMLElement;
  readonly background: MainMenuBackground;
  private readonly hall: HallOfLegends;
  private readonly nav: MainMenuNavigation;
  private readonly cont: HTMLElement;
  private closed = false;
  private hideTimer = 0;
  private card: string | undefined;

  constructor(private readonly hooks: MainMenuHooks) {
    this.el = document.createElement('div');
    this.el.id = 'mainmenu';
    document.body.appendChild(this.el);
    this.background = new MainMenuBackground(this.el);
    const left = this.background.pieces.left;

    const buttons = (Object.keys(M.buttons) as (keyof typeof M.buttons)[]).map((id) => {
      const b = MainMenuBackground.rect(document.createElement('button'), M.buttons[id], M.pieces.left) as HTMLButtonElement;
      b.className = `mm-hot mm-hot-${id}`;
      b.dataset.id = id;
      b.setAttribute('aria-label', LABEL[id]);
      left.appendChild(b);
      return b;
    });
    this.cont = MainMenuBackground.rect(document.createElement('div'), M.continueLabel, M.pieces.left);
    this.cont.className = 'mm-continue';
    left.appendChild(this.cont);
    this.hall = new HallOfLegends(this.background.pieces.right);

    this.el.insertAdjacentHTML(
      'beforeend',
      `<section class="mm-card" hidden role="dialog"></section>
      <footer class="mm-foot">${M.version} · jogo offline · salvamento automático</footer>`,
    );
    this.nav = new MainMenuNavigation(buttons, (id) => this.activate(id), () => this.hooks.onUi());
    this.el.querySelector('.mm-card')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (!b) return;
      this.hooks.onUi();
      if (b.dataset.card === 'close') this.closeCard();
      else this.hooks.onOptions(b.dataset.card as 'audio' | 'video');
    });
    window.addEventListener('keydown', this.keyHandler, true);
    this.refresh();
    this.background.start();
  }

  get active(): boolean {
    return !this.closed;
  }

  /** Volta para o menu (ESC → confirmar no jogo, fim de jornada). */
  open(): void {
    if (!this.closed) return;
    this.closed = false;
    clearTimeout(this.hideTimer);
    this.el.hidden = false;
    this.el.classList.add('leaving');
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('leaving')));
    window.addEventListener('keydown', this.keyHandler, true);
    this.refresh();
    this.nav.reset();
    this.background.start();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCard();
    window.removeEventListener('keydown', this.keyHandler, true);
    this.el.classList.add('leaving');
    this.hideTimer = window.setTimeout(() => {
      this.background.stop();
      this.el.hidden = true;
    }, 900);
  }

  /** Lê o estado do jogo (run em andamento, recordes). */
  refresh(): void {
    const s = this.hooks.state();
    this.cont.hidden = !s.continueLabel;
    this.cont.textContent = s.continueLabel ? `Jornada em andamento · ${s.continueLabel}` : '';
    this.hall.render(s.legends);
  }

  private activate(id: string): void {
    this.hooks.onUi();
    if (id === 'start') {
      this.close();
      this.hooks.onStart();
    } else this.openCard(id);
  }

  // ---------------------------------------------------------------- cartões (Opções / Info / Donate)

  private openCard(id: string): void {
    const card = this.el.querySelector<HTMLElement>('.mm-card')!;
    if (this.card === 'options' && id !== 'options') this.hooks.onCloseOptions();
    this.card = id;
    card.className = `mm-card mm-card-${id}`;
    card.innerHTML = `<button class="mm-x" data-card="close" title="Fechar (Esc)">×</button>${CARDS[id] ?? ''}`;
    card.hidden = false;
  }

  private closeCard(): void {
    if (this.card === 'options') this.hooks.onCloseOptions();
    this.card = undefined;
    this.el.querySelector<HTMLElement>('.mm-card')!.hidden = true;
  }

  /** O menu "engole" as teclas para o jogo não reagir por baixo dele. */
  private readonly keyHandler = (e: KeyboardEvent): void => {
    e.stopImmediatePropagation();
    if (e.key === 'Escape') {
      if (this.card) this.closeCard();
      e.preventDefault();
      return;
    }
    if (this.card) return;
    if (this.nav.key(e)) e.preventDefault();
  };
}

const CARDS: Record<string, string> = {
  options: `<h2>Opções</h2>
    <p class="mm-dim">As mesmas configurações de dentro do jogo.</p>
    <div class="mm-card-actions"><button class="mm-btn" data-card="audio">Áudio</button><button class="mm-btn" data-card="video">Vídeo e efeitos</button></div>
    <p class="mm-dim">Tela cheia: <b>F11</b>.</p>`,
  info: `<h2>ROguard</h2>
    <p>RPG tático de hordas. Posicione a party, monte o funil com barreiras e muralhas e segure a horda antes que ela invada a cidade.
    Três atos, chefes, cidades e uma jornada que recomeça do zero a cada derrota.</p>
    <h3>Controles</h3>
    <ul class="mm-keys">
      <li><kbd>Espaço</kbd> iniciar a horda</li><li><kbd>R</kbd> girar a barreira</li>
      <li><kbd>C</kbd> personagem</li><li><kbd>K</kbd> habilidades</li>
      <li><kbd>1</kbd>–<kbd>4</kbd> velocidade</li><li><kbd>Esc</kbd> menu</li><li><kbd>F11</kbd> tela cheia</li>
    </ul>
    <h3>Salvamento</h3>
    <p class="mm-dim">O jogo salva sozinho. Não existe salvar/carregar manual: cada jornada é para valer.</p>
    <h3>Créditos</h3>
    <p class="mm-dim">Electron/Chromium · three.js (MIT) · three.quarks (MIT) · fonte Cinzel (SIL OFL).</p>`,
  donate: `<h2>Apoie o ROguard <span class="mm-heart-t">♥</span></h2>
    <p>O ROguard é feito de forma independente. Apoiar ajuda a trazer novos atos, heróis e monstros.</p>
    <p>Quem apoia entra no <b>Ranking Donate</b> da tela inicial.</p>
    <p class="mm-dim">As formas de apoio chegam em breve.</p>`,
};
