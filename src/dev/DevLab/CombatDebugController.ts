/**
 * Aba MOVEMENT / COMBAT AI + depuração visual do combate.
 *
 * Controles: ligar/desligar o movimento de combate, multiplicador de alcance dos heróis à
 * distância, raio máximo de movimento e o que desenhar. Tudo vai para `api.mods`
 * (modificadores temporários que a simulação lê); nenhum valor base muda.
 *
 * O desenho é uma camada 2D por cima do jogo (só apresentação): círculos no chão
 * (projetados da grade), posto e raio máximo, linha até o alvo e o estado acima do herói.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { combatProfile } from '../../core/sim/RangeSystem';
import type { CombatAIStateName, Unit } from '../../core/sim/types';
import { DEV_CONFIG } from '../devConfig';
import { heroLabel, type DevLabApi } from './DevLab';

export interface OverlayFlags {
  attack: boolean;
  detection: boolean;
  preferred: boolean;
  position: boolean;
  debug: boolean;
}

const STATE_TEXT: Record<CombatAIStateName, string> = {
  IDLE: 'IDLE',
  ATTACK: 'ATTACKING',
  MOVE_TO_ATTACK_RANGE: 'MOVING',
  RETURN_TO_POSITION: 'RETURNING',
  DEAD: 'DEAD',
};
const COLOR = { attack: '#ff4a3a', detection: '#ffd23a', preferred: '#3ad8ff', home: '#ffffff', target: '#ff9a2a', text: '#ffffff' };

export class CombatDebugController {
  readonly flags: OverlayFlags = { attack: false, detection: false, preferred: false, position: false, debug: false };
  /** Multiplicador escolhido no slider e se está ligado (desligado = 1x na simulação). */
  rangedMult: number = DEV_CONFIG.rangedMultDefault;
  rangedOn = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  /** Posição desenhada (suavizada) e último lugar conhecido de cada herói (para o DEAD). */
  private readonly drawn = new Map<string, { x: number; y: number; id: number }>();
  private tab?: HTMLElement;

  constructor(root: HTMLElement, private readonly api: DevLabApi) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40';
    root.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Aplica o estado do multiplicador nos modificadores da simulação. */
  applyRanged(): void {
    this.api.mods.rangedRangeMult = this.rangedOn ? this.rangedMult : 1;
  }

  setFlags(f: Partial<OverlayFlags>): void {
    Object.assign(this.flags, f);
    this.syncTab();
  }

  buildTab(el: HTMLElement): { refresh(): void } {
    this.tab = el;
    const { api } = this;
    const S = DEV_CONFIG.maxMoveSlider;
    const opts = DEV_CONFIG.rangedMultOptions;
    el.innerHTML = `
      <div class="dl-sec"><h4>Combat Movement</h4>
        <div class="dl-row"><button class="dl-btn" data-move="on">Enable Combat Movement</button><button class="dl-btn" data-move="off">Disable Combat Movement</button>
          <button class="dl-btn" data-move="default">Padrão do jogo</button></div>
        <div class="dl-note" data-moveline></div>
      </div>
      <div class="dl-sec"><h4>Ranged Attack Range Multiplier</h4>
        <div class="dl-row"><label><input type="checkbox" data-rangedon> Ativar</label>
          <input type="range" min="0" max="${opts.length - 1}" step="1" value="${opts.indexOf(this.rangedMult)}" data-ranged><b data-rangedval></b></div>
        <div class="dl-note">Só para os heróis à distância (${GAME_CONFIG.combatAI.rangedKinds.map(heroLabel).join(', ')}). O alcance base não muda: efetivo = base × multiplicador.</div>
      </div>
      <div class="dl-sec"><h4>Max Combat Move Distance</h4>
        <div class="dl-row"><label><input type="checkbox" data-maxon> Usar valor de teste</label>
          <input type="range" min="${S.min}" max="${S.max}" step="${S.step}" value="2" data-max><b data-maxval></b></div>
        <div class="dl-note">Desligado = o valor de cada herói (GAME_CONFIG.combatAI).</div>
      </div>
      <div class="dl-sec"><h4>Visualização</h4>
        <div class="dl-row"><label><input type="checkbox" data-flag="attack"> Show Attack Range</label><label><input type="checkbox" data-flag="detection"> Show Detection Range</label></div>
        <div class="dl-row"><label><input type="checkbox" data-flag="preferred"> Show Preferred Range</label><label><input type="checkbox" data-flag="position"> Show Combat Position</label></div>
        <div class="dl-row"><label><input type="checkbox" data-flag="debug"> <b>DEBUG COMBAT AI</b></label></div>
        <div class="dl-note">Vermelho = ataque · amarelo = detecção · azul = distância preferida · branco = posto e raio máximo · laranja = alvo.</div>
      </div>
      <div class="dl-sec"><h4>Heróis agora</h4>
        <table class="dl-tbl"><thead><tr><th>Herói</th><th>Estado</th><th>Alvo</th><th>Dist.</th><th>Do posto</th></tr></thead><tbody data-live></tbody></table>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-move]');
      if (!b) return;
      api.mods.combatMovement = b.dataset.move === 'default' ? undefined : b.dataset.move === 'on';
      this.syncTab();
    });
    el.addEventListener('input', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.type !== 'range') return; // caixas de marcar são tratadas no 'change'
      if (i.dataset.ranged !== undefined) {
        this.rangedMult = opts[Number(i.value)];
        this.applyRanged();
      }
      if (i.dataset.max !== undefined && q<HTMLInputElement>('[data-maxon]').checked) api.mods.maxCombatMoveDistance = Number(i.value);
      this.syncTab();
    });
    el.addEventListener('change', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.dataset.rangedon !== undefined) {
        this.rangedOn = i.checked;
        this.applyRanged();
      }
      if (i.dataset.maxon !== undefined) api.mods.maxCombatMoveDistance = i.checked ? Number(q<HTMLInputElement>('[data-max]').value) : undefined;
      if (i.dataset.flag) this.flags[i.dataset.flag as keyof OverlayFlags] = i.checked;
      this.syncTab();
    });
    this.syncTab();
    return { refresh: () => this.refreshLive() };
  }

  /** Reflete o estado atual nos controles da aba. */
  syncTab(): void {
    const el = this.tab;
    if (!el) return;
    const { api } = this;
    const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const on = api.sim().combatMovementOn;
    q('[data-moveline]').textContent = `Agora: ${on ? 'LIGADO' : 'DESLIGADO'}${api.mods.combatMovement === undefined ? ' (padrão do jogo)' : ' (teste)'}`;
    el.querySelectorAll<HTMLElement>('[data-move]').forEach((b) => b.classList.toggle('on', (b.dataset.move === 'default' && api.mods.combatMovement === undefined) || (b.dataset.move === 'on' && api.mods.combatMovement === true) || (b.dataset.move === 'off' && api.mods.combatMovement === false)));
    q<HTMLInputElement>('[data-rangedon]').checked = this.rangedOn;
    q<HTMLInputElement>('[data-ranged]').value = String(DEV_CONFIG.rangedMultOptions.indexOf(this.rangedMult));
    q('[data-rangedval]').textContent = `${this.rangedMult}x${this.rangedOn ? '' : ' (desligado)'}`;
    const maxOn = api.mods.maxCombatMoveDistance !== undefined;
    q<HTMLInputElement>('[data-maxon]').checked = maxOn;
    if (maxOn) q<HTMLInputElement>('[data-max]').value = String(api.mods.maxCombatMoveDistance);
    q('[data-maxval]').textContent = `${q<HTMLInputElement>('[data-max]').value} tiles${maxOn ? '' : ' (desligado)'}`;
    el.querySelectorAll<HTMLInputElement>('[data-flag]').forEach((c) => (c.checked = this.flags[c.dataset.flag as keyof OverlayFlags]));
  }

  private heroes(): Unit[] {
    return [...this.api.sim().units.values()].filter((u) => u.team === 'party' && u.alive).sort((a, b) => a.id - b.id);
  }

  private refreshLive(): void {
    const body = this.tab?.querySelector('[data-live]');
    if (!body) return;
    const sim = this.api.sim();
    body.innerHTML = this.heroes()
      .map((u) => {
        const t = u.ai?.targetId !== undefined ? sim.units.get(u.ai.targetId) : undefined;
        const d = t ? Math.hypot(t.x - u.x, t.y - u.y).toFixed(1) : '—';
        const off = u.ai ? Math.hypot(u.x - u.ai.homeX, u.y - u.ai.homeY).toFixed(1) : '0.0';
        const st = u.ai ? STATE_TEXT[u.ai.state] + (u.ai.reason ? ` (${u.ai.reason})` : '') : 'IDLE';
        return `<tr><td>${heroLabel(u.kind)}</td><td>${st}</td><td>${t ? t.kind : '—'}</td><td class="n">${d}</td><td class="n">${off}</td></tr>`;
      })
      .join('');
  }

  // ---------------------------------------------------------------- desenho

  private draw(): void {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== innerWidth * dpr || c.height !== innerHeight * dpr) {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const f = this.flags;
    const any = f.attack || f.detection || f.preferred || f.position || f.debug;
    if (!any || this.api.mode() !== 'battle') return;
    const sim = this.api.sim();
    const alive = new Set<string>();
    for (const u of this.heroes()) {
      alive.add(u.kind);
      // posição suavizada (o herói anda de tile em tile; o desenho acompanha sem saltos)
      const prev = this.drawn.get(u.kind);
      const p = prev && prev.id === u.id ? { x: prev.x + (u.x - prev.x) * 0.25, y: prev.y + (u.y - prev.y) * 0.25, id: u.id } : { x: u.x, y: u.y, id: u.id };
      this.drawn.set(u.kind, p);
      const prof = combatProfile(u, this.api.mods, sim.rangeMult);
      if (f.detection || f.debug) this.circle(p, prof.detectionRange, COLOR.detection, [6, 5], 1.2);
      if (f.attack || f.debug) this.circle(p, prof.attackRange, COLOR.attack, [], 2);
      if ((f.preferred || f.debug) && prof.ranged) this.circle(p, prof.preferredRange, COLOR.preferred, [3, 4], 1.6);
      const ai = u.ai;
      if ((f.position || f.debug) && ai) {
        const home = { x: ai.homeX, y: ai.homeY };
        this.circle(home, prof.maxCombatMoveDistance, COLOR.home, [4, 4], 1.4);
        const a = this.screen(home);
        const b = this.screen(p);
        if (a && b) {
          g.strokeStyle = COLOR.home;
          g.lineWidth = 1.5;
          g.setLineDash([2, 3]);
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.lineTo(b.x, b.y);
          g.stroke();
          g.setLineDash([]);
          g.strokeRect(a.x - 6, a.y - 4, 12, 8);
          g.fillStyle = COLOR.home;
          g.beginPath();
          g.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
          g.fill();
        }
      }
      if (f.debug) {
        const t = ai?.targetId !== undefined ? sim.units.get(ai.targetId) : undefined;
        const b = this.screen(p);
        if (t && b) {
          const tp = this.screen(t);
          if (tp) {
            g.strokeStyle = COLOR.target;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(b.x, b.y);
            g.lineTo(tp.x, tp.y);
            g.stroke();
            g.strokeRect(tp.x - 8, tp.y - 8, 16, 16);
          }
        }
        if (b) this.label(b, ai ? STATE_TEXT[ai.state] + (ai.reason ? ` · ${ai.reason}` : '') : 'IDLE');
      }
    }
    // heróis que caíram nesta onda: DEAD onde estavam
    if (f.debug && sim.phase !== 'setup')
      for (const [kind, p] of this.drawn) {
        if (alive.has(kind)) continue;
        const b = this.screen(p);
        if (b) this.label(b, 'DEAD');
      }
    if (sim.phase === 'setup') for (const k of [...this.drawn.keys()]) if (!alive.has(k)) this.drawn.delete(k);
  }

  private screen(p: { x: number; y: number }): { x: number; y: number } | undefined {
    const s = this.api.base.tileToScreen(p.x, p.y);
    return s.visible ? s : undefined;
  }

  /** Círculo no chão (raio em tiles) projetado da grade para a tela. */
  private circle(c: { x: number; y: number }, r: number, color: string, dash: number[], width: number): void {
    if (!(r > 0)) return;
    const g = this.g;
    const n = DEV_CONFIG.circleSegments;
    g.strokeStyle = color;
    g.lineWidth = width;
    g.setLineDash(dash);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = this.api.base.tileToScreen(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
      if (i === 0) g.moveTo(s.x, s.y);
      else g.lineTo(s.x, s.y);
    }
    g.stroke();
    g.setLineDash([]);
  }

  private label(p: { x: number; y: number }, text: string): void {
    const g = this.g;
    g.font = 'bold 11px Tahoma, Verdana, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';
    const w = g.measureText(text).width + 8;
    const y = p.y - 46;
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(p.x - w / 2, y - 14, w, 15);
    g.fillStyle = COLOR.text;
    g.fillText(text, p.x, y);
  }
}
