/**
 * Aba ECONOMY: moedas do jogo (Zeni = gold, Almas) e EXP, pelas mesmas funções do perfil.
 * O jogo não tem Gems: as moedas listadas são as que existem.
 */
import { DEV_CONFIG } from '../devConfig';
import { heroLabel, type DevCtx } from './DevLab';

export function buildEconomy(el: HTMLElement, ctx: DevCtx): { refresh(): void; onHero(): void } {
  const { api } = ctx;
  const steps = DEV_CONFIG.currencySteps;
  const btns = (which: string) => `${steps.map((n) => `<button class="dl-btn" data-add="${which}" data-n="${n}">+${n.toLocaleString('pt-BR')}</button>`).join('')}<button class="dl-btn" data-add="${which}" data-n="max">MAX</button>`;
  el.innerHTML = `
    <div class="dl-sec"><h4>Moedas</h4>
      <table class="dl-tbl"><tbody>
        <tr><td>Zeni (gold)</td><td class="n" data-val="zeni"></td><td>${btns('zeni')}</td></tr>
        <tr><td>Almas</td><td class="n" data-val="souls"></td><td>${btns('souls')}</td></tr>
        <tr><td>EXP · <span data-hero></span></td><td class="n" data-val="exp"></td><td>${btns('exp')}</td></tr>
      </tbody></table>
      <div class="dl-note">EXP vai para o herói selecionado em CHARACTERS (MAX = nível ${DEV_CONFIG.maxLevel}); só muda entre ondas. O jogo não tem Gems.</div>
    </div>
    <div class="dl-sec"><h4>Opções</h4>
      <div class="dl-row"><label><input type="checkbox" data-infinite> Infinite Gold (mantém o Zeni no MAX)</label></div>
      <div class="dl-row"><button class="dl-btn dl-danger" data-reset>Reset Economy (Zeni e Almas = 0)</button></div>
    </div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;

  const refresh = () => {
    if (infinite.on && api.currencies().zeni < DEV_CONFIG.maxCurrency) api.setCurrency('zeni', DEV_CONFIG.maxCurrency);
    const c = api.currencies();
    const lv = api.heroLevel(ctx.hero);
    q('[data-val="zeni"]').textContent = c.zeni.toLocaleString('pt-BR');
    q('[data-val="souls"]').textContent = c.souls.toLocaleString('pt-BR');
    q('[data-val="exp"]').textContent = `Nv. ${lv.level} · ${lv.exp}/${lv.next}`;
    q('[data-hero]').textContent = heroLabel(ctx.hero);
    q<HTMLInputElement>('[data-infinite]').checked = infinite.on;
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.reset !== undefined) {
      infinite.on = false;
      api.setCurrency('zeni', 0);
      api.setCurrency('souls', 0);
      ctx.log('Economia zerada.');
    } else if (b.dataset.add === 'exp') {
      if (!api.base.canEditProgression()) ctx.log('EXP só muda entre ondas.');
      else if (b.dataset.n === 'max') api.base.setLevel(ctx.hero, DEV_CONFIG.maxLevel);
      else api.base.addExperience(ctx.hero, Number(b.dataset.n));
    } else if (b.dataset.add) {
      const which = b.dataset.add as 'zeni' | 'souls';
      const cur = api.currencies()[which];
      api.setCurrency(which, b.dataset.n === 'max' ? DEV_CONFIG.maxCurrency : Math.min(DEV_CONFIG.maxCurrency, cur + Number(b.dataset.n)));
    }
    refresh();
  });
  el.addEventListener('change', (e) => {
    const i = e.target as HTMLInputElement;
    if (i.dataset.infinite === undefined) return;
    infinite.on = i.checked;
    refresh();
  });
  // o Infinite Gold continua valendo com a aba fechada
  window.setInterval(() => {
    if (infinite.on && api.currencies().zeni < DEV_CONFIG.maxCurrency) api.setCurrency('zeni', DEV_CONFIG.maxCurrency);
  }, DEV_CONFIG.statusIntervalMs * 4);

  refresh();
  return { refresh, onHero: refresh };
}

/** Infinite Gold compartilhado (a aba WAVES também liga). */
export const infinite = { on: false };
