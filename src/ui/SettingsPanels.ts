import { QUALITY_LABEL, type FpsCap, type QualityPreset, type SettingsStore } from '../settings/Settings';

/** Ícones originais em SVG, no mesmo tom dourado/azulado do HUD. */
const ICON_AUDIO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_VIDEO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z" fill="currentColor"/><circle cx="18.5" cy="17.5" r="2" fill="currentColor"/><circle cx="6" cy="18.5" r="1.3" fill="currentColor"/></svg>`;

type PanelId = 'audio' | 'video';

/**
 * Painéis de Configurações (Áudio / Efeitos visuais) com ícones na HUD.
 * Só lê e escreve no SettingsStore; quem aplica os valores são os ouvintes do store.
 */
export class SettingsPanels {
  readonly bar: HTMLElement;
  private readonly panels = new Map<PanelId, HTMLElement>();
  private readonly fps: HTMLElement;
  private open: PanelId | undefined;

  constructor(
    root: HTMLElement,
    private readonly store: SettingsStore,
    private readonly onUiSound: () => void = () => {},
  ) {
    this.bar = document.createElement('div');
    this.bar.className = 'sysbar';
    this.bar.innerHTML = `
      <button class="sys-ico" data-open="audio" title="Áudio">${ICON_AUDIO}</button>
      <button class="sys-ico" data-open="video" title="Efeitos visuais">${ICON_VIDEO}</button>`;
    root.appendChild(this.bar);

    this.panels.set('audio', this.buildAudio());
    this.panels.set('video', this.buildVideo());
    for (const p of this.panels.values()) root.appendChild(p);

    this.fps = document.createElement('div');
    this.fps.className = 'fps-readout';
    root.appendChild(this.fps);

    this.bar.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open]');
      if (!b) return;
      this.toggle(b.dataset.open as PanelId);
      this.onUiSound();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        this.toggle(this.open);
        e.stopImmediatePropagation(); // ESC fecha o painel; não abre o "voltar ao menu"
      }
    });
    store.onChange(() => this.sync());
  }

  /** Botão extra no canto (ex.: debug em build de desenvolvimento). */
  addButton(html: string, title: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'sys-ico';
    b.title = title;
    b.innerHTML = html;
    b.addEventListener('click', onClick);
    this.bar.appendChild(b);
    return b;
  }

  closeAll(): void {
    if (this.open) this.toggle(this.open);
  }

  toggle(id: PanelId): void {
    this.open = this.open === id ? undefined : id;
    for (const [k, p] of this.panels) p.hidden = k !== this.open;
    this.bar.querySelectorAll<HTMLElement>('[data-open]').forEach((b) => b.classList.toggle('on', b.dataset.open === this.open));
  }

  /** Chamado a cada frame com o FPS medido. */
  setFps(fps: number): void {
    if (this.store.value.video.showFps) this.fps.textContent = `${Math.round(fps)} FPS`;
  }

  private win(id: PanelId, title: string, body: string): HTMLElement {
    const w = document.createElement('div');
    w.className = 'win settings-win';
    w.hidden = true;
    w.innerHTML = `<div class="win-title"><span>${title}</span><button class="x" data-close title="Fechar (Esc)">×</button></div><div class="win-body">${body}</div>`;
    w.querySelector('[data-close]')!.addEventListener('click', () => this.toggle(id));
    return w;
  }

  private buildAudio(): HTMLElement {
    const slider = (key: string, label: string) =>
      `<label class="set-row"><span>${label}</span><input type="range" min="0" max="100" step="1" data-audio="${key}"><b data-val="${key}"></b></label>`;
    const w = this.win(
      'audio',
      'Áudio',
      `${slider('master', 'Volume mestre')}${slider('music', 'Música')}${slider('sfx', 'Efeitos')}${slider('ambient', 'Ambiente')}
       <label class="set-row check"><input type="checkbox" data-audio="muted"><span>Mudo</span></label>
       <small class="set-note">Sons provisórios gerados pelo jogo; os áudios finais entram nos mesmos canais.</small>`,
    );
    w.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.audio as 'master' | 'music' | 'sfx' | 'ambient' | 'muted' | undefined;
      if (!k) return;
      this.store.update((s) => {
        if (k === 'muted') s.audio.muted = el.checked;
        else s.audio[k] = Number(el.value) / 100;
      });
    });
    return w;
  }

  private buildVideo(): HTMLElement {
    const presets = (Object.keys(QUALITY_LABEL) as QualityPreset[])
      .map((p) => `<button class="seg" data-preset="${p}">${QUALITY_LABEL[p]}</button>`)
      .join('');
    const w = this.win(
      'video',
      'Efeitos visuais',
      `<div class="set-row"><span>Personagens</span><div class="segs"><button class="seg" data-chars="3d">3D</button><button class="seg" data-chars="sprites">Sprites 2D</button></div></div>
       <div class="set-row"><span>Qualidade</span><div class="segs">${presets}</div></div>
       <label class="set-row"><span>Partículas</span><input type="range" min="10" max="100" step="5" data-video="particles"><b data-val="particles"></b></label>
       <label class="set-row"><span>Tremor de tela</span><input type="range" min="0" max="100" step="5" data-video="shake"><b data-val="shake"></b></label>
       <label class="set-row check"><input type="checkbox" data-video="bloom"><span>Brilho (bloom)</span></label>
       <label class="set-row check"><input type="checkbox" data-video="reduceFlashes"><span>Reduzir flashes (acessibilidade)</span></label>
       <div class="set-row"><span>Limite de FPS</span><div class="segs">
         <button class="seg" data-fps="30">30</button><button class="seg" data-fps="60">60</button><button class="seg" data-fps="0">Sem limite</button></div></div>
       <label class="set-row check"><input type="checkbox" data-video="vsync"><span>V-Sync</span></label>
       <label class="set-row check"><input type="checkbox" data-video="showFps"><span>Mostrar FPS</span></label>
       <small class="set-note">${window.vanguardaDesktop ? 'V-Sync: a mudança vale ao reabrir o jogo.' : 'V-Sync: no navegador fica sempre ligado; vale na versão desktop.'}</small>
       <button class="set-reset" data-reset>Restaurar padrões</button>`,
    );
    w.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const k = el.dataset.video;
      if (!k) return;
      this.store.update((s) => {
        if (k === 'particles' || k === 'shake') s.video[k] = Number(el.value) / 100;
        else if (k === 'bloom' || k === 'reduceFlashes' || k === 'vsync' || k === 'showFps') s.video[k] = el.checked;
      });
    });
    w.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset],[data-fps],[data-reset],[data-chars]');
      if (!b) return;
      this.onUiSound();
      if (b.dataset.reset !== undefined) return this.store.reset();
      this.store.update((s) => {
        if (b.dataset.preset) s.video.preset = b.dataset.preset as QualityPreset;
        if (b.dataset.fps) s.video.fpsCap = Number(b.dataset.fps) as FpsCap;
        if (b.dataset.chars) s.video.characters = b.dataset.chars as '3d' | 'sprites';
      });
    });
    return w;
  }

  /** Reflete o store nos controles (ao abrir, ao restaurar padrões). */
  private sync(): void {
    const s = this.store.value;
    const a = this.panels.get('audio')!;
    for (const k of ['master', 'music', 'sfx', 'ambient'] as const) {
      a.querySelector<HTMLInputElement>(`[data-audio="${k}"]`)!.value = String(Math.round(s.audio[k] * 100));
      a.querySelector(`[data-val="${k}"]`)!.textContent = `${Math.round(s.audio[k] * 100)}`;
    }
    a.querySelector<HTMLInputElement>('[data-audio="muted"]')!.checked = s.audio.muted;
    this.bar.querySelector('[data-open="audio"]')!.classList.toggle('muted', s.audio.muted);

    const v = this.panels.get('video')!;
    for (const k of ['particles', 'shake'] as const) {
      v.querySelector<HTMLInputElement>(`[data-video="${k}"]`)!.value = String(Math.round(s.video[k] * 100));
      v.querySelector(`[data-val="${k}"]`)!.textContent = `${Math.round(s.video[k] * 100)}%`;
    }
    for (const k of ['bloom', 'reduceFlashes', 'vsync', 'showFps'] as const) v.querySelector<HTMLInputElement>(`[data-video="${k}"]`)!.checked = s.video[k];
    v.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === s.video.preset));
    v.querySelectorAll<HTMLElement>('[data-chars]').forEach((b) => b.classList.toggle('on', b.dataset.chars === s.video.characters));
    v.querySelectorAll<HTMLElement>('[data-fps]').forEach((b) => b.classList.toggle('on', Number(b.dataset.fps) === s.video.fpsCap));
    this.fps.hidden = !s.video.showFps;
  }
}
