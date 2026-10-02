/**
 * Janela do Dev Lab: barra de título, abas e corpo rolável. Só apresentação —
 * os comandos ficam nos controladores (SpawnController, ...).
 */

export interface DevTab {
  id: string;
  label: string;
  /** Abas das próximas etapas aparecem desligadas. */
  enabled: boolean;
  hint?: string;
}

const CSS = `
.dl-win {
  position: fixed; right: 12px; top: 130px; z-index: 55; width: 390px; max-width: calc(100vw - 24px);
  max-height: calc(100vh - 120px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, rgba(232, 237, 247, 0.97), rgba(208, 217, 234, 0.97));
  border: 1px solid #5f6f96; border-radius: 4px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  font: 11px Tahoma, Verdana, 'Segoe UI', sans-serif; color: #1d2540; pointer-events: auto; user-select: none;
}
.dl-win[hidden] { display: none; }
.dl-title {
  display: flex; align-items: center; gap: 8px; height: 22px; padding: 0 6px 0 10px; cursor: move;
  background: linear-gradient(180deg, #7a5a9e, #4a3470); color: #fff; font-weight: bold; letter-spacing: 1px;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
}
.dl-badge { padding: 0 4px; border-radius: 2px; background: #ffcf4a; color: #3a2400; font-size: 9px; letter-spacing: 0; text-shadow: none; }
.dl-fix { margin-left: auto; height: 17px; padding: 0 7px; font: inherit; font-size: 10px; font-weight: bold; letter-spacing: 0; color: #08281a; cursor: pointer;
  background: linear-gradient(180deg, #a6f0c4, #4e9e78); border: 1px solid #2d6b4c; border-radius: 3px; text-shadow: none; }
.dl-fix:disabled { opacity: 0.5; cursor: wait; }
.dl-fix + .dl-x { margin-left: 0; }
.dl-msg { padding: 4px 8px; border-top: 1px solid rgba(95, 111, 150, 0.35); background: #e4f7ec; color: #1f5a3c; font-size: 10px; cursor: pointer; }
.dl-msg.dl-bad { background: #fbe4e0; }
.dl-x { margin-left: auto; width: 18px; height: 16px; border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 2px; background: rgba(0, 0, 0, 0.15); color: #fff; cursor: pointer; line-height: 12px; }
.dl-tabs { display: flex; flex-wrap: wrap; gap: 2px; padding: 5px 6px 0; border-bottom: 1px solid #8391b5; }
.dl-tab {
  padding: 3px 6px; font: inherit; font-size: 10px; font-weight: bold; color: #4a5577; cursor: pointer;
  background: rgba(255, 255, 255, 0.45); border: 1px solid #8391b5; border-bottom: none; border-radius: 3px 3px 0 0;
}
.dl-tab.on { background: #f4f7fd; color: #1d2540; position: relative; top: 1px; }
.dl-tab:disabled { opacity: 0.4; cursor: default; }
.dl-body { flex: 1; overflow-y: auto; padding: 4px 8px 8px; background: rgba(244, 247, 253, 0.85); }
.dl-body[hidden] { display: none; }
.dl-sec { margin-top: 6px; }
.dl-sec h4 { margin: 0 0 3px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: #5a4a80; }
.dl-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 4px; }
.dl-row label { display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
.dl-btn {
  padding: 2px 7px; font: inherit; color: #1d2540; cursor: pointer;
  background: linear-gradient(180deg, #fbfcff, #d4dbea); border: 1px solid #8391b5; border-radius: 3px;
}
.dl-btn:hover:not(:disabled) { background: linear-gradient(180deg, #fff, #e3e9f5); }
.dl-btn:disabled { opacity: 0.45; cursor: default; }
.dl-btn.on { background: linear-gradient(180deg, #c9b6ef, #9b7fd4); border-color: #6a4fa8; color: #1b0f38; font-weight: bold; }
.dl-primary { background: linear-gradient(180deg, #8fd6b0, #4e9e78); color: #08281a; border-color: #3d7a5c; font-weight: bold; }
.dl-danger { color: #8a1f14; }
.dl-win select, .dl-win input[type=number] { font: inherit; padding: 1px 2px; border: 1px solid #8391b5; border-radius: 2px; background: #fff; color: #1d2540; }
.dl-win input[type=number] { width: 56px; }
.dl-note { color: #4a5577; font-size: 10px; font-style: italic; }
.dl-win input[type=text] { font: inherit; padding: 1px 3px; border: 1px solid #8391b5; border-radius: 2px; background: #fff; color: #1d2540; width: 100%; box-sizing: border-box; }
.dl-win input[type=range] { width: 120px; }
.dl-tbl { width: 100%; border-collapse: collapse; margin: 2px 0 4px; }
.dl-tbl th, .dl-tbl td { padding: 1px 4px; border-bottom: 1px solid rgba(95, 111, 150, 0.2); text-align: left; vertical-align: middle; }
.dl-tbl th { font-size: 10px; color: #5a4a80; font-weight: bold; }
.dl-tbl td.n { text-align: right; font-family: Consolas, monospace; }
.dl-tbl input[type=number] { width: 52px; }
.dl-chg { background: #fff3b0 !important; }
.dl-skill { display: grid; grid-template-columns: 34px 1fr auto; gap: 6px; align-items: start; padding: 4px 0; border-bottom: 1px solid rgba(95, 111, 150, 0.2); }
.dl-skill img { width: 32px; height: 32px; border-radius: 3px; border: 1px solid #5f6f96; background: #222; }
.dl-skill .ph { width: 32px; height: 32px; border-radius: 3px; border: 1px dashed #8391b5; }
.dl-skill b { font-size: 11px; }
.dl-skill small { display: block; color: #4a5577; }
.dl-pass { color: #6a6a8a; font-style: italic; }
.dl-out { font-family: Consolas, monospace; font-size: 10px; white-space: pre-wrap; background: rgba(255, 255, 255, 0.55); border: 1px solid rgba(95, 111, 150, 0.3); padding: 3px 5px; max-height: 260px; overflow: auto; }
.dl-list { width: 100%; font: inherit; }
.dl-grid2 { display: grid; grid-template-columns: 92px 1fr; gap: 3px 6px; align-items: center; }
.dl-ok { color: #1f7a45; font-weight: bold; }
.dl-bad { color: #9a2a1a; font-weight: bold; }
.dl-status { padding: 3px 8px; border-top: 1px solid rgba(95, 111, 150, 0.35); color: #2b3558; font-family: Consolas, monospace; font-size: 10px; background: rgba(255, 255, 255, 0.4); }
`;

export class DevPanel {
  readonly el: HTMLElement;
  readonly status: HTMLElement;
  private readonly bodies = new Map<string, HTMLElement>();

  constructor(root: HTMLElement, title: string, tabs: DevTab[], onToggle: () => void) {
    if (!document.getElementById('dl-style')) {
      const st = document.createElement('style');
      st.id = 'dl-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'dl-win';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="dl-title"><span>${title}</span><span class="dl-badge">DEV</span><button class="dl-x" data-close>×</button></div>
      <div class="dl-tabs">${tabs.map((t) => `<button class="dl-tab" data-tab="${t.id}" ${t.enabled ? '' : 'disabled'} title="${t.hint ?? ''}">${t.label}</button>`).join('')}</div>
      ${tabs.map((t) => `<div class="dl-body" data-body="${t.id}" hidden></div>`).join('')}
      <div class="dl-status"></div>`;
    root.appendChild(this.el);
    for (const t of tabs) this.bodies.set(t.id, this.el.querySelector<HTMLElement>(`[data-body="${t.id}"]`)!);
    this.status = this.el.querySelector<HTMLElement>('.dl-status')!;
    this.el.querySelector('[data-close]')!.addEventListener('click', onToggle);
    this.el.querySelector('.dl-tabs')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tab]');
      if (b && !b.disabled) this.select(b.dataset.tab!);
    });
    // arrastar pela barra de título (não cobrir a HUD que estiver por baixo)
    const bar = this.el.querySelector<HTMLElement>('.dl-title')!;
    bar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const move = (ev: MouseEvent) => {
        this.el.style.left = `${Math.max(0, Math.min(innerWidth - r.width, ev.clientX - dx))}px`;
        this.el.style.top = `${Math.max(0, Math.min(innerHeight - 24, ev.clientY - dy))}px`;
        this.el.style.right = 'auto';
      };
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      e.preventDefault();
    });
    // teclas digitadas no painel não vão para o jogo (Espaço, R, K, 1–4...)
    this.el.addEventListener('keydown', (e) => e.stopPropagation());
    const first = tabs.find((t) => t.enabled);
    if (first) this.select(first.id);
  }

  body(id: string): HTMLElement {
    return this.bodies.get(id)!;
  }

  /** Aba aberta. */
  current = '';

  select(id: string): void {
    this.current = id;
    for (const [k, b] of this.bodies) b.hidden = k !== id;
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === id));
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }
}
