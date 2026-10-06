/**
 * Aba CHARACTERS: escolher herói, equipe, nível/EXP, HP, recargas, equipamento máximo
 * e os parâmetros de combate (editados como modificadores TEMPORÁRIOS — o GAME_CONFIG
 * não muda; ao fechar o jogo ou clicar ↺ volta ao valor base).
 */
import { HERO_ORDER } from '../../config/heroes';
import { combatProfile, neutralMods, type HeroMods } from '../../core/sim/RangeSystem';
import type { Unit } from '../../core/sim/types';
import { DEV_CONFIG } from '../devConfig';
import { heroLabel, type DevCtx } from './DevLab';

type ParamKey = keyof HeroMods;
const PARAMS: { key: ParamKey; label: string; step: number; hint: string }[] = [
  { key: 'attackRange', label: 'Attack Range', step: 0.5, hint: 'tiles' },
  { key: 'detectionRange', label: 'Detection Range', step: 0.5, hint: 'tiles' },
  { key: 'preferredRange', label: 'Preferred Range', step: 0.5, hint: 'tiles' },
  { key: 'maxCombatMoveDistance', label: 'Max Combat Move', step: 0.5, hint: 'tiles do posto' },
  { key: 'moveTicks', label: 'Movement Speed', step: 1, hint: 'ticks por passo (menor = mais rápido)' },
  { key: 'attackSpeed', label: 'Attack Speed', step: 0.25, hint: '× (2 = recargas pela metade)' },
];

/** Herói vivo na arena, ou um "molde" só com o tipo (para mostrar os valores base). */
function heroUnit(ctx: DevCtx, kind: string): Unit | undefined {
  return [...ctx.api.sim().units.values()].find((u) => u.team === 'party' && u.kind === kind && u.alive);
}
const mold = (kind: string) => ({ kind }) as Unit;

function values(u: Unit, mods = neutralMods()): Record<ParamKey, number> {
  const p = combatProfile(u, mods, 1);
  return { attackRange: p.attackRange, detectionRange: p.detectionRange, preferredRange: p.preferredRange, maxCombatMoveDistance: p.maxCombatMoveDistance, moveTicks: p.moveTicks, attackSpeed: p.attackSpeed, damageMult: 1 };
}
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

export function buildCharacters(el: HTMLElement, ctx: DevCtx): { refresh(): void; onHero(): void } {
  const { api } = ctx;
  el.innerHTML = `
    <div class="dl-sec"><h4>Personagem</h4>
      <div class="dl-row"><select data-hero>${HERO_ORDER.map((k) => `<option value="${k}">${heroLabel(k)}</option>`).join('')}</select>
        <button class="dl-btn" data-cmd="add">Adicionar à equipe</button><button class="dl-btn dl-danger" data-cmd="remove">Remover da equipe</button></div>
      <div class="dl-row"><span class="dl-note" data-line></span></div>
    </div>
    <div class="dl-sec"><h4>Progressão</h4>
      <div class="dl-row">Nível <input type="number" min="1" max="${DEV_CONFIG.maxLevel}" value="10" data-level><button class="dl-btn" data-cmd="level">Definir</button>
        EXP <input type="number" min="1" value="500" data-exp><button class="dl-btn" data-cmd="exp">Adicionar</button></div>
      <div class="dl-row"><button class="dl-btn" data-cmd="gear">Equipamento máximo (Mítico, refino máximo)</button></div>
      <div class="dl-note" data-lock hidden>Nível, EXP, equipe e equipamento só mudam entre ondas (Limpar/resetar arena).</div>
    </div>
    <div class="dl-sec"><h4>Na arena</h4>
      <div class="dl-row"><button class="dl-btn" data-cmd="hp">Restaurar HP</button><button class="dl-btn" data-cmd="cd">Resetar cooldowns</button>
        <button class="dl-btn" data-cmd="cd">Restaurar energia/mana</button></div>
      <div class="dl-note">O jogo não usa mana: "energia" são as recargas.</div>
    </div>
    <div class="dl-sec"><h4>Parâmetros de combate (temporários)</h4>
      <table class="dl-tbl"><thead><tr><th>Parâmetro</th><th>Base</th><th>Teste</th><th></th></tr></thead><tbody data-params></tbody></table>
      <div class="dl-note">Valem só nesta sessão do Dev Lab; o valor base (GAME_CONFIG) não muda. Alcance dos heróis à distância = alcance da arma.</div>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const sel = q<HTMLSelectElement>('[data-hero]');
  sel.value = ctx.hero;
  const body = q('[data-params]');

  const buildParams = () => {
    const k = ctx.hero;
    const u = heroUnit(ctx, k) ?? mold(k);
    const base = values(u);
    const m = api.mods.heroes[k] ?? {};
    body.innerHTML = PARAMS.map((p) => {
      const set = m[p.key] !== undefined;
      return `<tr title="${p.hint}"><td>${p.label}</td><td class="n">${fmt(base[p.key])}</td>
        <td><input type="number" step="${p.step}" min="0" data-param="${p.key}" value="${fmt(set ? m[p.key]! : base[p.key])}" class="${set ? 'dl-chg' : ''}"></td>
        <td><button class="dl-btn" data-reset="${p.key}" title="Voltar ao base">↺</button></td></tr>`;
    }).join('');
  };

  const refresh = () => {
    const k = ctx.hero;
    const lv = api.heroLevel(k);
    const inParty = api.party().includes(k);
    const u = heroUnit(ctx, k);
    const live = u ? `HP ${Math.ceil(u.hp)}/${u.maxHp} · tile ${u.x},${u.y} · ${u.ai?.state ?? 'IDLE'}` : inParty ? (api.dead().includes(k) ? 'caído' : 'fora da arena') : 'fora da equipe';
    q('[data-line]').textContent = `Nv. ${lv.level} · EXP ${lv.exp}/${lv.next} · ${inParty ? 'na equipe' : 'fora da equipe'} · ${live}`;
    q('[data-lock]').hidden = api.base.canEditProgression();
    // atualiza o "Teste" efetivo só onde não há edição em andamento
    const eff = values(u ?? mold(k), api.mods);
    el.querySelectorAll<HTMLInputElement>('[data-param]').forEach((i) => {
      if (document.activeElement === i) return;
      const key = i.dataset.param as ParamKey;
      if (api.mods.heroes[k]?.[key] === undefined) i.value = fmt(eff[key]);
    });
  };

  const onHero = () => {
    sel.value = ctx.hero;
    buildParams();
    refresh();
  };
  sel.addEventListener('change', () => ctx.setHero(sel.value));

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    const k = ctx.hero;
    const u = heroUnit(ctx, k);
    if (b.dataset.reset) {
      const m = api.mods.heroes[k];
      if (m) delete m[b.dataset.reset as ParamKey];
      buildParams();
      return;
    }
    let msg: string | undefined;
    switch (b.dataset.cmd) {
      case 'add':
        msg = api.setPartyMember(k, true) ?? `${heroLabel(k)} entrou na equipe.`;
        break;
      case 'remove':
        msg = api.setPartyMember(k, false) ?? `${heroLabel(k)} saiu da equipe.`;
        break;
      case 'level':
        if (!api.base.canEditProgression()) msg = 'Nível só muda entre ondas.';
        else api.base.setLevel(k, Math.max(1, Math.min(DEV_CONFIG.maxLevel, Number(q<HTMLInputElement>('[data-level]').value) || 1)));
        break;
      case 'exp':
        if (!api.base.canEditProgression()) msg = 'EXP só muda entre ondas.';
        else api.base.addExperience(k, Math.max(1, Number(q<HTMLInputElement>('[data-exp]').value) || 1));
        break;
      case 'gear':
        msg = api.maxGear(k) ?? `${heroLabel(k)} com equipamento máximo.`;
        break;
      case 'hp':
        if (!u) msg = 'O herói não está na arena.';
        else {
          api.sim().heal(u, u.maxHp);
          api.flush();
        }
        break;
      case 'cd':
        if (!u) msg = 'O herói não está na arena.';
        else u.cooldowns = {};
        break;
    }
    if (msg) ctx.log(msg);
    buildParams();
    refresh();
  });

  el.addEventListener('change', (e) => {
    const i = e.target as HTMLInputElement;
    if (!i.dataset.param) return;
    const k = ctx.hero;
    const v = Number(i.value);
    if (!Number.isFinite(v) || v < 0) return;
    (api.mods.heroes[k] ??= {})[i.dataset.param as ParamKey] = v;
    i.classList.add('dl-chg');
  });

  buildParams();
  refresh();
  return { refresh, onHero };
}
