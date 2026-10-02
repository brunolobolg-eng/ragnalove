import { MENU_VISUAL as M } from '../../config/visualConfig';
import { DONATION_TIERS, SUPPORTERS } from '../../config/supporters';
import { ACTS } from '../../config/world';
import { totalPhases } from '../../core/run/run';
import type { Records } from '../../core/run/records';
import { MainMenuBackground } from './MainMenuBackground';

/**
 * Ranking da tela inicial. O painel (títulos, ícones, moldura) já está desenhado na arte;
 * aqui só entram os valores vivos por cima dos "???" e a lista real de apoiadores por cima
 * dos nomes de exemplo. Recorde que ainda não aconteceu continua "???" (nada inventado).
 * Ranking Donate mostra só nome + categoria — nunca valores.
 */
export type LegendId = 'difficulty' | 'longest' | 'fastest' | 'damage' | 'level' | 'runs';
export type LegendValues = Partial<Record<LegendId, string>>;

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
};

/** Recordes → textos do Ranking (ausente = fica o "???" da arte). `runs` = jornadas encerradas. */
export function legendsFrom(rec: Records, runs: number): LegendValues {
  return {
    difficulty: rec.actsCleared > 0 ? ACTS[Math.min(rec.actsCleared, ACTS.length) - 1].name.split(' — ')[0] : undefined,
    longest: rec.farthestPhase > 0 ? `Fase ${rec.farthestPhase}/${totalPhases()}` : undefined,
    fastest: rec.fastestMs ? clock(rec.fastestMs) : undefined,
    damage: rec.maxDamage > 0 ? rec.maxDamage.toLocaleString('pt-BR') : undefined,
    level: rec.maxLevel > 0 ? `Nv. ${rec.maxLevel}` : undefined,
    runs: runs > 0 ? String(runs) : undefined,
  };
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class HallOfLegends {
  private readonly values = new Map<LegendId, HTMLElement>();
  private readonly donors: HTMLElement;

  /** `stage` = peça direita da tela (painel de Ranking recortado da arte). */
  constructor(stage: HTMLElement) {
    const R = M.rankValues;
    const [px, py, pw] = M.pieces.right;
    for (const [id, cy] of Object.entries(R.rows) as [LegendId, number][]) {
      // ancorado pela direita: o fundo cobre só o texto do valor (o subtítulo da arte fica visível)
      const el = document.createElement('em');
      el.className = 'mm-val';
      el.style.right = `${px + pw - R.right}px`;
      el.style.top = `${cy - R.h / 2 - py}px`;
      el.style.height = `${R.h}px`;
      el.style.background = M.panelColor;
      el.hidden = true;
      stage.appendChild(el);
      this.values.set(id, el);
    }
    this.donors = MainMenuBackground.rect(document.createElement('div'), M.donors, M.pieces.right);
    this.donors.className = 'mm-donors-live';
    this.donors.style.background = M.panelColor;
    stage.appendChild(this.donors);
  }

  render(values: LegendValues): void {
    // sem recorde: fica o "???" da própria arte
    for (const [id, el] of this.values) {
      const v = values[id];
      el.hidden = !v;
      el.textContent = v ?? '';
    }
    const tier = Object.fromEntries(DONATION_TIERS.map((t) => [t.id, t]));
    this.donors.innerHTML = SUPPORTERS.length
      ? `<ol>${SUPPORTERS.map((s, i) => `<li><b>${i + 1}º</b> ${esc(s.name)} <span style="color:${tier[s.tier].color}">${tier[s.tier].label}</span></li>`).join('')}</ol>`
      : `<p>Nenhum apoiador ainda.<br><span>Seja o primeiro ♥</span></p>`;
  }
}
