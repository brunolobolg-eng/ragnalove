/**
 * Aba SKILL ARENA: arena de teste de skills e balanceamento.
 *
 * Reutiliza tudo da produção: a mesma Simulation, as mesmas skills (CAST e IA),
 * o mesmo dano (via tap de eventos, sem cálculo paralelo) e os mesmos painéis de
 * personagem/economia/skills. Novo aqui: mapa de teste isolado, bonecos
 * configuráveis, estatísticas de dano e presets de um clique.
 *
 * Segurança: perfil e run são fotografados ao abrir e restaurados ao sair
 * (main.ts); boneco de treino dá 0 almas/EXP/Zen; remoção é sem recompensa.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { lvOf, type SkillId } from '../../core/progression/skills';
import type { DamageSource, SimEvent } from '../../core/sim/types';
import { DEV_CONFIG } from '../devConfig';
import { enemyLabel, heroLabel, type DevCtx } from './DevLab';
import { skillCooldownTicks } from './SkillTester';
import { SOURCE_LABEL, summarizeHits, type HitSample } from './skillArenaZone';

const TICK_S = (t: number) => `${(t / 10).toFixed(1)} s`;
const MAX_HITS = 600;
const SHOW_HISTORY = 12;

const DUMMY_FIRST = ['trainingDummy', ...Object.keys(GAME_CONFIG.enemies).filter((k) => k !== 'trainingDummy')];

/** Posição do herói vivo (alvo central dos bonecos) ou centro do mapa. */
function anchorOf(ctx: DevCtx): { x: number; y: number } {
  const sim = ctx.api.sim();
  const u = [...sim.units.values()].find((v) => v.team === 'party' && v.alive);
  if (u) return { x: u.x, y: u.y };
  return { x: Math.floor(sim.board.width / 2), y: Math.floor(sim.board.height / 2) };
}

export function buildSkillArena(el: HTMLElement, ctx: DevCtx): { refresh(): void; onHero(): void } {
  const { api } = ctx;
  let hits: HitSample[] = [];
  let status: Record<string, number> = {};
  let unsub: (() => void) | undefined;
  let seenSim: unknown;

  const onEvent = (e: SimEvent) => {
    if (e.type === 'damage') {
      const sim = api.sim();
      const src = e.sourceId !== undefined ? sim.units.get(e.sourceId) : undefined;
      const tgt = sim.units.get(e.unitId);
      if (src?.team !== 'party' || !tgt) return;
      hits.push({ tick: sim.tick, hero: src.kind, source: e.source, amount: Math.round(e.amount * 10) / 10, crit: !!e.crit, target: tgt.id, targetKind: tgt.kind });
      if (hits.length > MAX_HITS) hits.splice(0, hits.length - MAX_HITS);
    } else if (e.type === 'freeze' || e.type === 'curse') status[e.type] = (status[e.type] ?? 0) + 1;
  };
  const watch = () => {
    const sim = api.sim();
    if (sim !== seenSim) {
      seenSim = sim;
      unsub?.();
      unsub = sim.onEvent(onEvent);
      hits = [];
      status = {};
    }
  };
  watch();

  el.innerHTML = `
    <div class="dl-sec"><h4>Mapa de teste (isolado da campanha)</h4>
      <div class="dl-row"><button class="dl-btn dl-primary" data-cmd="open">Abrir arena</button>
        <button class="dl-btn" data-cmd="close">Voltar à batalha</button><span class="dl-note" data-arena></span></div>
      <div class="dl-note">Fotografa perfil/run ao abrir e restaura tudo ao sair (sem tocar no save). Só abre entre ondas. Sala 40×30 com 4 pilares.</div>
    </div>
    <div class="dl-sec"><h4>Bonecos</h4>
      <div class="dl-row"><select data-kind>${DUMMY_FIRST.map((k) => `<option value="${k}"${k === 'trainingDummy' ? ' selected' : ''}>${enemyLabel(k)}</option>`).join('')}</select>
        <label title="0 = vida padrão do tipo">HP <input type="number" min="0" value="0" data-hp style="width:90px"></label>
        <label title="Posiciona em volta do herói">Qtd <input type="number" min="1" max="${DEV_CONFIG.maxSpawn}" value="1" data-qty style="width:64px"></label></div>
      <div class="dl-row"><button class="dl-btn" data-n="1">1</button><button class="dl-btn" data-n="3">3</button><button class="dl-btn" data-n="5">5</button><button class="dl-btn" data-n="10">10</button>
        <button class="dl-btn dl-primary" data-cmd="spawn">Spawnar em volta do herói</button>
        <button class="dl-btn dl-danger" data-cmd="clear">Remover todos (sem recompensa)</button></div>
      <div class="dl-note">Boneco de treino: parado, nunca ataca, HP alto, 0 almas/EXP/Zen. Outros tipos lutam de verdade (para comparar comportamento).</div>
    </div>
    <div class="dl-sec"><h4>Dano (tempo real)</h4>
      <div class="dl-row"><button class="dl-btn" data-cmd="wipe">Limpar estatísticas</button><span class="dl-note" data-tot></span></div>
      <div data-stats></div>
      <div data-hist></div>
    </div>
    <div class="dl-sec"><h4>Presets (entre ondas)</h4>
      <div class="dl-row"><button class="dl-btn" data-preset="warrior">Cavaleiro Nv 20</button>
        <button class="dl-btn" data-preset="mage">Mago Fogo Nv 20</button>
        <button class="dl-btn" data-preset="archer">Arqueira Crítica Nv 20</button>
        <button class="dl-btn" data-preset="aoe">Teste AoE (5 bonecos)</button></div>
      <div class="dl-note">Preset = equipe + nível 20 + equipamento máximo + árvore no máximo. Atributos: painel Debug (F9).</div>
    </div>
    <div class="dl-sec"><h4>Balanço temporário (só teste)</h4>
      <div class="dl-row"><span class="dl-note">Dano do herói selecionado ×</span>
        <input type="number" min="0" step="0.25" value="1" data-dmg style="width:70px">
        <button class="dl-btn" data-cmd="dmg">Aplicar</button><button class="dl-btn" data-cmd="dmgReset">↺ Base</button></div>
      <div class="dl-note">Vive só na simulação em memória (nunca salvo, nunca fixado). Alcance/velocidade: abas CHARACTERS e SKILLS.</div>
    </div>
    <div class="dl-sec"><h4>Reset</h4>
      <div class="dl-row"><button class="dl-btn dl-danger" data-cmd="reset">Reset total (bonecos, HP, recargas, status, log)</button></div>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;

  const spawnRing = (kind: string, n: number, hp: number): number => {
    const sim = api.sim();
    const c = anchorOf(ctx);
    let placed = 0;
    let radius = 3;
    const want = Math.max(1, Math.min(DEV_CONFIG.maxSpawn, Math.round(n) || 1));
    outer: for (; radius <= 9 && placed < want; radius++) {
      for (let a = 0; a < 12 && placed < want; a++) {
        const x = Math.round(c.x + radius * Math.cos((a / 12) * Math.PI * 2));
        const y = Math.round(c.y + radius * Math.sin((a / 12) * Math.PI * 2));
        const u = sim.spawnEnemyAt(kind, x, y, hp > 0 ? hp : undefined);
        if (u) placed++;
        else {
          // tenta o tile livre mais próximo (não insiste no anel exato)
          for (let r = 0; r <= 2 && placed < want; r++)
            for (let dy = -r; dy <= r && placed < want; dy++)
              for (let dx = -r; dx <= r && placed < want; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                if (sim.spawnEnemyAt(kind, x + dx, y + dy, hp > 0 ? hp : undefined)) {
                  placed++;
                  continue outer;
                }
              }
        }
      }
    }
    api.flush();
    return placed;
  };

  const fullReset = () => {
    const sim = api.sim();
    for (const u of [...sim.units.values()]) if (u.team === 'enemy') sim.debugRemove(u.id);
    for (const u of [...sim.units.values()]) {
      if (u.team !== 'party') continue;
      sim.heal(u, u.maxHp);
      u.cooldowns = {};
      u.dots = [];
      u.frozenUntil = 0;
      u.slowUntil = 0;
      u.slowMult = 1;
    }
    hits = [];
    status = {};
    api.flush();
  };

  const renderStats = () => {
    const sim = api.sim();
    q('[data-arena]').textContent = api.arenaActive() ? 'ARENA ATIVA (progressão congelada em foto)' : '';
    const { groups, targets, total } = summarizeHits(hits, sim.tick);
    q('[data-tot]').textContent = hits.length ? `Total ${Math.round(total)} em ${hits.length} golpes` : 'Sem golpes ainda — inicie a onda e use skills (aba SKILLS tem CAST).';
    const cdOf = (hero: string, source: DamageSource): string => {
      // referência de recarga: mesma função que a aba SKILLS mostra
      const u = [...sim.units.values()].find((v) => v.team === 'party' && v.kind === hero);
      const lv = api.heroLevel(hero).skills;
      const ids = skillIdsFor(hero, source);
      const cds = ids.map((id) => skillCooldownTicks(id, Math.max(1, lvOf(lv, id as SkillId)), u)).filter((c) => c !== undefined) as number[];
      return cds.length ? TICK_S(Math.min(...cds)) : '—';
    };
    q('[data-stats]').innerHTML =
      (groups.length
        ? `<table class="dl-tbl"><thead><tr><th>Habilidade</th><th>Golpes</th><th>Total</th><th>Média</th><th>Máx</th><th>Críticos</th><th>DPS 10s</th><th>Recarga</th></tr></thead><tbody>${groups
            .map((g) => `<tr><td>${heroLabel(g.hero)} · ${SOURCE_LABEL[g.source]}</td><td class="n">${g.count}</td><td class="n">${Math.round(g.total)}</td><td class="n">${g.avg.toFixed(1)}</td><td class="n">${Math.round(g.max)}</td><td class="n">${g.crits}</td><td class="n">${g.dps.toFixed(0)}</td><td class="n">${cdOf(g.hero, g.source)}</td></tr>`)
            .join('')}</tbody></table>`
        : '') +
      (targets.length > 1
        ? `<table class="dl-tbl"><thead><tr><th>Alvo</th><th>Golpes</th><th>Total</th></tr></thead><tbody>${targets.map((t) => `<tr><td>#${t.id} (${enemyLabel(t.kind)})</td><td class="n">${t.count}</td><td class="n">${Math.round(t.total)}</td></tr>`).join('')}</tbody></table>`
        : '') +
      ((status.freeze || status.curse) ? `<div class="dl-note">Efeitos aplicados: ${status.freeze ? `❄ ${status.freeze}` : ''} ${status.curse ? `☠ ${status.curse}` : ''}</div>` : '');
    q('[data-hist]').innerHTML = hits.length
      ? `<div class="dl-note">Últimos golpes (<button class="dl-btn" data-cmd="wipe">limpar</button>):</div><ol class="dl-hist">${hits
          .slice(-SHOW_HISTORY)
          .reverse()
          .map((h) => `<li>${heroLabel(h.hero)} · ${SOURCE_LABEL[h.source]} · <b>${h.amount}</b>${h.crit ? ' <em>CRIT</em>' : ''} → #${h.target} (${enemyLabel(h.targetKind)})</li>`)
          .join('')}</ol>`
      : '';
  };

  /** Fonte de dano → habilidades candidatas do herói (para a coluna de recarga). */
  function skillIdsFor(_hero: string, source: DamageSource): string[] {
    return (
      {
        cleave: ['cleave'], bash: ['bash'], arrow: ['preciseShot'], rain: ['arrowRain'], pierce: ['piercing'],
        bolt: ['frostBolt'], nova: ['frostNova'], storm: ['thunderstorm'], trap: ['snareTrap'],
        meteor: ['meteorStrike'], curse: ['curse'], blade: ['bladeFan', 'backstab'], poison: ['poisonBlades'],
        shock: ['shockwave'], execute: ['execute'], arcane: ['arcaneOrb'], shadow: ['shadowBolt'],
      } as Partial<Record<DamageSource, string[]>>
    )[source] ?? [];
  }

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.n !== undefined) {
      q<HTMLInputElement>('[data-qty]').value = b.dataset.n;
      return;
    }
    if (b.dataset.preset) {
      if (!api.base.canEditProgression()) return ctx.log('Preset só entre ondas (pause/planejamento).');
      const k = b.dataset.preset;
      if (k === 'aoe') {
        const n = spawnRing('trainingDummy', 5, 0);
        ctx.log(`Teste AoE: ${n} boneco(s) em volta do herói.`);
      } else {
        const msg = api.setPartyMember(k, true);
        api.base.setLevel(k, 20);
        api.maxGear(k);
        api.base.run.unlockTree(k);
        if (api.mode() === 'battle') {
          // recarrega a arena com a nova equipe (setup atual)
          api.base.restartWave();
        }
        ctx.setHero(k);
        ctx.log(msg ?? `${heroLabel(k)} Nv 20, Mítico, árvore máxima.`);
      }
      renderStats();
      return;
    }
    switch (b.dataset.cmd) {
      case 'open': {
        const err = api.openTestArena();
        ctx.log(err ?? 'Arena aberta: progressão fotografada. Teste à vontade; "Voltar à batalha" restaura tudo.');
        watch();
        break;
      }
      case 'close':
        api.closeTestArena();
        ctx.log('Arena fechada: perfil/run restaurados, batalha recarregada.');
        watch();
        break;
      case 'spawn': {
        const kind = q<HTMLSelectElement>('[data-kind]').value;
        const n = spawnRing(kind, Number(q<HTMLInputElement>('[data-qty]').value) || 1, Number(q<HTMLInputElement>('[data-hp]').value) || 0);
        ctx.log(`${n} × ${enemyLabel(kind)} posicionado(s).`);
        break;
      }
      case 'clear': {
        const sim = api.sim();
        let n = 0;
        for (const u of [...sim.units.values()]) if (u.team === 'enemy' && sim.debugRemove(u.id)) n++;
        api.flush();
        ctx.log(`${n} inimigo(s) removido(s) sem recompensa.`);
        break;
      }
      case 'wipe':
        hits = [];
        status = {};
        break;
      case 'dmg': {
        const v = Number(q<HTMLInputElement>('[data-dmg]').value);
        if (!Number.isFinite(v) || v < 0) break;
        (api.mods.heroes[ctx.hero] ??= {}).damageMult = v === 1 ? undefined : v;
        ctx.log(v === 1 ? 'Dano base restaurado.' : `Dano de ${heroLabel(ctx.hero)} ×${v} (temporário).`);
        break;
      }
      case 'dmgReset':
        if (api.mods.heroes[ctx.hero]) delete api.mods.heroes[ctx.hero].damageMult;
        q<HTMLInputElement>('[data-dmg]').value = '1';
        break;
      case 'reset':
        fullReset();
        ctx.log('Reset total: bonecos fora, party cheia, recargas zeradas, log limpo.');
        break;
    }
    renderStats();
  });

  const refresh = () => {
    watch();
    renderStats();
  };
  const onHero = () => renderStats();
  refresh();
  return { refresh, onHero };
}
