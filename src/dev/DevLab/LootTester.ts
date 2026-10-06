/**
 * Aba LOOT: simula abates de um tipo de monstro com o MESMO sistema de loot da onda
 * (`killRewards` + `rollLoot`, as funções que a Simulation chama quando um inimigo morre).
 * No jogo cada tipo de monstro é a sua "tabela de loot": Zen/Almas/EXP fixos por tipo,
 * chance de item (com a Sorte do herói) e raridade garantida dos chefes.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { RARITIES, RARITY_INFO, SLOT_LABEL, dropChance, type Rarity, type Slot } from '../../core/progression/equipment';
import { killRewards, rollLoot } from '../../core/sim/Simulation';
import { Rng } from '../../core/sim/rng';
import { DEV_CONFIG } from '../devConfig';
import { enemyLabel, heroLabel, type DevCtx } from './DevLab';

export function buildLoot(el: HTMLElement, ctx: DevCtx): { onHero(): void } {
  const { api } = ctx;
  const kinds = Object.keys(GAME_CONFIG.enemies);
  el.innerHTML = `
    <div class="dl-sec"><h4>Loot Table</h4>
      <div class="dl-grid2">
        <span>Monstro</span><select data-kind>${kinds.map((k) => `<option value="${k}">${enemyLabel(k)}</option>`).join('')}</select>
        <span>Rolls</span><input type="number" min="1" value="100" data-rolls>
        <span>Inimigos/roll</span><input type="number" min="1" value="30" data-kills>
        <span>Sorte</span><span><input type="number" min="0" value="0" data-luck> <button class="dl-btn" data-hero-luck>Sorte do herói</button></span>
      </div>
      <div class="dl-row" style="margin-top:4px"><button class="dl-btn dl-primary" data-run>SIMULATE LOOT</button></div>
      <div class="dl-note">Rolls = repetições; cada roll mata "Inimigos/roll" monstros. Itens sorteados com as classes da equipe atual.</div>
    </div>
    <div class="dl-sec"><h4>Resultado</h4><div data-out class="dl-note">—</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;

  const run = () => {
    const kind = q<HTMLSelectElement>('[data-kind]').value;
    const rolls = Math.max(1, Math.round(Number(q<HTMLInputElement>('[data-rolls]').value) || 1));
    const per = Math.max(1, Math.round(Number(q<HTMLInputElement>('[data-kills]').value) || 1));
    const luck = Math.max(0, Number(q<HTMLInputElement>('[data-luck]').value) || 0);
    if (rolls * per > DEV_CONFIG.maxLootKills) return ctx.log(`Limite: ${DEV_CONFIG.maxLootKills.toLocaleString('pt-BR')} abates por simulação.`);
    const users = api.party();
    const rng = new Rng(Date.now() >>> 0);
    const rw = killRewards(kind);
    const byRarity: Record<string, number> = {};
    const bySlot: Record<string, number> = {};
    let items = 0;
    let rollsWithItem = 0;
    for (let r = 0; r < rolls; r++) {
      let got = 0;
      for (let i = 0; i < per; i++) {
        const it = rollLoot(rng, kind, luck, users, (n) => `sim-${n}`);
        if (!it) continue;
        got++;
        byRarity[it.rarity] = (byRarity[it.rarity] ?? 0) + 1;
        bySlot[it.slot] = (bySlot[it.slot] ?? 0) + 1;
      }
      items += got;
      if (got) rollsWithItem++;
    }
    const kills = rolls * per;
    const boss = GAME_CONFIG.bossKinds.includes(kind);
    const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(2)}%`;
    const fmt = (n: number) => n.toLocaleString('pt-BR');
    q('[data-out]').innerHTML = `
      <table class="dl-tbl"><tbody>
        <tr><td>Abates simulados</td><td class="n">${fmt(kills)}</td><td></td></tr>
        <tr><td>Gold (Zen)</td><td class="n">${fmt(rw.zeni * kills)}</td><td class="n">${fmt(rw.zeni * per)}/roll</td></tr>
        <tr><td>XP</td><td class="n">${fmt(rw.exp * kills)}</td><td class="n">${fmt(rw.exp * per)}/roll</td></tr>
        <tr><td>Almas</td><td class="n">${fmt(rw.souls * kills)}</td><td class="n">${fmt(rw.souls * per)}/roll</td></tr>
        <tr><td>Itens</td><td class="n">${fmt(items)}</td><td class="n">${(items / rolls).toFixed(2)}/roll</td></tr>
        <tr><td>Chance de item por abate</td><td class="n">${pct(items, kills)}</td><td class="n">esperado ${boss ? '100%' : pct(dropChance(luck), 1)}</td></tr>
        <tr><td>Rolls com pelo menos 1 item</td><td class="n">${pct(rollsWithItem, rolls)}</td><td></td></tr>
      </tbody></table>
      <table class="dl-tbl"><thead><tr><th>Raridade</th><th>Qtd.</th><th>% dos itens</th><th>Ocorrência/abate</th></tr></thead><tbody>
        ${RARITIES.map((r: Rarity) => `<tr><td style="color:${RARITY_INFO[r].color};font-weight:bold">${RARITY_INFO[r].label}</td><td class="n">${fmt(byRarity[r] ?? 0)}</td><td class="n">${pct(byRarity[r] ?? 0, items)}</td><td class="n">${pct(byRarity[r] ?? 0, kills)}</td></tr>`).join('')}
      </tbody></table>
      <table class="dl-tbl"><thead><tr><th>Slot</th><th>Qtd.</th><th>% dos itens</th></tr></thead><tbody>
        ${Object.entries(bySlot)
          .sort((a, b) => b[1] - a[1])
          .map(([s, n]) => `<tr><td>${SLOT_LABEL[s as Slot] ?? s}</td><td class="n">${fmt(n)}</td><td class="n">${pct(n, items)}</td></tr>`)
          .join('')}
      </tbody></table>`;
  };

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.run !== undefined) run();
    if (b.dataset.heroLuck !== undefined) {
      const u = [...api.sim().units.values()].find((x) => x.team === 'party' && x.kind === ctx.hero);
      q<HTMLInputElement>('[data-luck]').value = String(u?.stats?.luck ?? 0);
      ctx.log(`Sorte de ${heroLabel(ctx.hero)}: ${u?.stats?.luck ?? 0}${u ? '' : ' (herói fora da arena)'}.`);
    }
  });
  return { onHero: () => undefined };
}
