/**
 * Aba SKILLS: todas as habilidades do herói selecionado, com ícone, recarga, custo e
 * descrição. CAST chama `Simulation.castSkill`, que roda exatamente a mesma função de
 * habilidade que a IA usa na onda (ignorando só recarga, nível mínimo e mínimo de alvos).
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { HERO_ORDER } from '../../config/heroes';
import { ARCHETYPES } from '../../core/archetypes/registry';
import { SKILLS, SKILL_NUM } from '../../core/progression/skills';
import type { Unit } from '../../core/sim/types';
import { SKILL_ICONS } from '../../ui/icons';
import { SHARED_EDITOR } from '../../editor/EditorStore';
import { getDefault, getPath, setPath } from '../../editor/overrides';
import { heroLabel, type DevCtx, type DevLabApi } from './DevLab';

const TICK_S = (t: number) => `${(t / GAME_CONFIG.sim.tickRate).toFixed(1)} s`;

/** Recarga base (ticks) da habilidade no nível dado. */
function cooldownTicks(id: string, lv: number, u?: Unit): number | undefined {
  const A = GAME_CONFIG.archetypes;
  const s = u?.stats;
  const basic: Record<string, number> = {
    preciseShot: s?.arrowCooldownTicks ?? A.archer.arrow.cooldownTicks,
    arrowRain: s?.rainCooldownTicks ?? A.archer.rain.cooldownTicks,
    frostBolt: s?.boltCooldownTicks ?? A.mage.frostBolt.cooldownTicks,
    fireBarrier: s?.barrierCooldownTicks ?? A.mage.fireBarrier.cooldownTicks,
    bash: s?.bashCooldownTicks ?? A.warrior.bash.cooldownTicks,
    cleave: s?.cleaveCooldownTicks ?? A.warrior.cleave.cooldownTicks,
    arcaneOrb: A.sorcerer.orb.cooldownTicks,
    meteorStrike: A.sorcerer.meteor.cooldownTicks,
    lifeDrain: A.warlock.drain.cooldownTicks,
    curse: A.warlock.curse.cooldownTicks,
    backstab: A.assassin.backstab.cooldownTicks,
    bladeFan: A.assassin.fan.cooldownTicks,
  };
  if (basic[id] !== undefined) return basic[id];
  const num = (SKILL_NUM as unknown as Record<string, ((lv: number) => Record<string, number>) | undefined>)[id]?.(Math.max(1, lv));
  return num?.cooldown;
}

const iconCache: Record<string, string> = {};
const iconOf = (id: string) => (iconCache[id] ??= SKILL_ICONS[id]?.() ?? '');

/** Habilidade → bloco de números no GAME_CONFIG (o que o ajuste edita). As da árvore são fórmulas por nível no código. */
const TUNE: Record<string, string> = {
  frostBolt: 'mage/frostBolt', fireBarrier: 'mage/fireBarrier',
  preciseShot: 'archer/arrow', arrowRain: 'archer/rain', snareTrap: 'archer/trap',
  cleave: 'warrior/cleave', bash: 'warrior/bash', shieldWall: 'warrior/shieldWall',
  arcaneOrb: 'sorcerer/orb', meteorStrike: 'sorcerer/meteor', lifeDrain: 'warlock/drain', curse: 'warlock/curse',
  backstab: 'assassin/backstab', bladeFan: 'assassin/fan',
};
const LABEL: Record<string, string> = {
  damage: 'Dano', range: 'Alcance (tiles)', radius: 'Área: raio (tiles)', halfAngleDeg: 'Área: abertura do cone (°)',
  length: 'Área: comprimento (tiles)', count: 'Quantidade', cooldownTicks: 'Velocidade: recarga (ticks)',
  durationTicks: 'Duração (ticks)', burnDamage: 'Dano da queimadura', burnIntervalTicks: 'Intervalo da queimadura (ticks)',
  chillTicks: 'Lentidão do gelo (ticks)', minTargets: 'Mín. de alvos para usar', ahead: 'Armar à frente (passos)',
  damagePerLevel: 'Dano por nível', slowTicks: 'Lentidão (ticks)', slowMult: 'Força da lentidão (×)', maxTraps: 'Máx. de armadilhas',
  hp: 'Vida', hpPerLevel: 'Vida por nível', hpPerVit: 'Vida por Vitalidade', cooldownPerLevel: 'Recarga a menos por nível', critBonus: 'Bônus de crítico',
};
const tunePath = (id: string) => (TUNE[id] ? `game/archetypes/${TUNE[id]}` : undefined);
/** Escreve pelo store do Game Editor (salvável/desfazível); sem ele, só na memória. */
const tuneSet = (path: string, v: unknown) => (SHARED_EDITOR.store ? SHARED_EDITOR.store.set(path, v) : setPath(path, v));

function tuneHtml(id: string): string {
  const base = tunePath(id);
  const block = base ? (getPath(base) as Record<string, unknown> | undefined) : undefined;
  if (!base || !block) return `<div class="dl-note" style="grid-column:1/-1">Valores desta habilidade são fórmulas por nível no código (não ajustáveis aqui).</div>`;
  const fields = Object.entries(block).filter(([, v]) => typeof v === 'number');
  return `<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;padding:2px 0 4px 40px">
    ${fields
      .map(([k, v]) => {
        const path = `${base}/${k}`;
        const changed = v !== getDefault(path);
        const sec = k.endsWith('Ticks') ? ` <span class="dl-note">${TICK_S(v as number)}</span>` : '';
        return `<label title="padrão: ${getDefault(path)}">${LABEL[k] ?? k} <input type="number" step="any" data-tune="${path}" value="${v}"${changed ? ' style="background:#fff3c4"' : ''}>${sec}</label>`;
      })
      .join('')}
    <button class="dl-btn" data-tune-reset="${base}" title="Volta aos valores do código">Padrão</button></div>`;
}

export function buildSkills(el: HTMLElement, ctx: DevCtx): { refresh(): void; onHero(): void } {
  const { api } = ctx;
  el.innerHTML = `
    <div class="dl-sec">
      <div class="dl-row"><select data-hero>${HERO_ORDER.map((k) => `<option value="${k}">${heroLabel(k)}</option>`).join('')}</select>
        <span class="dl-note" data-line></span></div>
      <div class="dl-row"><label><input type="checkbox" data-cheat="noCooldowns"> Infinite Mana/Energy</label>
        <label><input type="checkbox" data-cheat="noCooldowns"> No Cooldown</label>
        <label><input type="checkbox" data-cheat="invincible"> God Mode</label></div>
      <div class="dl-row"><button class="dl-btn dl-primary" data-tune-apply title="Status e habilidades são calculados no começo da onda">Aplicar ajustes (reinicia a onda)</button>
        <button class="dl-btn" data-tune-save title="Grava no mesmo balanceamento do Game Editor (F10)">Salvar ajustes</button>
        <span class="dl-note" data-tune-msg></span></div>
      <div class="dl-note">CAST usa o mesmo código da IA. Precisa de um alvo válido e o herói na arena (onda iniciada para habilidades que dependem do caminho da horda, como a Armadilha).</div>
    </div>
    <div class="dl-sec" data-list></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const sel = q<HTMLSelectElement>('[data-hero]');
  const list = q('[data-list]');

  const unitOf = (k: string) => [...api.sim().units.values()].find((u) => u.team === 'party' && u.kind === k && u.alive);

  const build = () => {
    const k = ctx.hero;
    sel.value = k;
    const lv = api.heroLevel(k).skills;
    const castable = new Set(ARCHETYPES[k]?.skills.map((s) => s.id) ?? []);
    const u = unitOf(k);
    list.innerHTML = SKILLS.filter((d) => d.hero === k)
      .map((d) => {
        const l = lv[d.id] ?? 0;
        const cd = d.kind === 'active' ? cooldownTicks(d.id, l, u) : undefined;
        const ico = iconOf(d.id);
        return `<div class="dl-skill">
          ${ico ? `<img src="${ico}" alt="">` : '<div class="ph"></div>'}
          <div><b>${d.name}</b> <span class="dl-note">${d.kind === 'active' ? 'ativa' : 'passiva'} · nível ${l}/${d.maxLevel}</span>
            <small>Recarga: ${cd !== undefined ? TICK_S(cd) : '—'} · Custo: — (sem mana; usa recarga) · <span data-left="${d.id}"></span></small>
            <small>${d.desc}</small><small>${d.effect(Math.max(1, l))}</small></div>
          ${castable.has(d.id) ? `<button class="dl-btn dl-primary" data-cast="${d.id}">CAST</button>` : '<span class="dl-pass">passiva</span>'}
          ${d.kind === 'active' ? tuneHtml(d.id) : ''}
        </div>`;
      })
      .join('');
  };

  const refresh = () => {
    const k = ctx.hero;
    const u = unitOf(k);
    const sim = api.sim();
    q('[data-line]').textContent = u ? `HP ${Math.ceil(u.hp)}/${u.maxHp}` : 'herói fora da arena';
    el.querySelectorAll<HTMLElement>('[data-left]').forEach((s) => {
      const id = s.dataset.left!;
      const keys = id === 'fireBarrier' ? ['fireBarrier', 'fireBarrier2', 'fireBarrier3'] : [id];
      const left = u ? Math.min(...keys.map((key) => Math.max(0, (u.cooldowns[key] ?? 0) - sim.tick))) : 0;
      s.textContent = left > 0 ? `pronta em ${TICK_S(left)}` : 'pronta';
    });
    syncCheats(el, api);
  };

  sel.addEventListener('change', () => ctx.setHero(sel.value));
  const msg = (t: string) => (q('[data-tune-msg]').textContent = t);
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const rst = t.closest<HTMLElement>('[data-tune-reset]');
    if (rst) {
      const base = rst.dataset.tuneReset!;
      if (SHARED_EDITOR.store) SHARED_EDITOR.store.reset([base]);
      else setPath(base, getDefault(base));
      build();
      return msg('Valores do código restaurados (aplique para valer na onda).');
    }
    if (t.closest('[data-tune-apply]')) {
      api.base.restartWave();
      return msg('Onda reiniciada com os ajustes.');
    }
    if (t.closest('[data-tune-save]')) {
      if (!SHARED_EDITOR.store) return msg('Game Editor ainda não carregou; tente de novo.');
      void SHARED_EDITOR.store.save().then((w) => msg(`Salvo em ${w}`), (err) => msg(`Falha ao salvar: ${err}`));
      return;
    }
    const b = t.closest<HTMLButtonElement>('[data-cast]');
    if (!b) return;
    const k = ctx.hero;
    if (!unitOf(k)) return ctx.log(`${heroLabel(k)} não está na arena.`);
    const ok = api.castSkill(k, b.dataset.cast!);
    ctx.log(ok ? `CAST ${b.dataset.cast} (${heroLabel(k)}).` : `CAST ${b.dataset.cast}: sem alvo válido agora.`);
    refresh();
  });
  el.addEventListener('change', (e) => {
    const c = e.target as HTMLInputElement;
    if (c.dataset.tune) {
      const v = Number(c.value);
      if (!Number.isFinite(v)) return;
      tuneSet(c.dataset.tune, v);
      c.style.background = v !== getDefault(c.dataset.tune) ? '#fff3c4' : '';
      return msg('Ajuste guardado — "Aplicar" reinicia a onda com ele; "Salvar" grava no arquivo.');
    }
    if (!c.dataset.cheat) return;
    api.cheats[c.dataset.cheat as keyof DevLabApi['cheats']] = c.checked;
    api.base.applyCheats();
    syncCheats(el, api);
  });

  build();
  refresh();
  return {
    refresh,
    onHero: () => {
      build();
      refresh();
    },
  };
}

function syncCheats(el: HTMLElement, api: DevLabApi): void {
  el.querySelectorAll<HTMLInputElement>('[data-cheat]').forEach((c) => (c.checked = api.cheats[c.dataset.cheat as keyof DevLabApi['cheats']]));
}
