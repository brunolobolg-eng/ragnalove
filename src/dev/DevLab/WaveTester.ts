/**
 * Aba WAVES: escolher a wave inicial e final, jogar uma wave no jogo ou simular várias
 * sem render (SimulationRunner, mesma Simulation do jogo), e ver as estatísticas.
 */
import { GAME_CONFIG } from '../../config/gameConfig';
import { DEV_CONFIG } from '../devConfig';
import { combatPhases, phaseLabel, type DevCtx } from './DevLab';
import { infinite } from './EconomyController';
import { runWaves, type WaveStats } from './SimulationRunner';

export function buildWaves(el: HTMLElement, ctx: DevCtx): { refresh(): void } {
  const { api } = ctx;
  const phases = combatPhases();
  const opts = phases.map((p, i) => `<option value="${i}">${i + 1}. ${phaseLabel(p)}</option>`).join('');
  el.innerHTML = `
    <div class="dl-sec"><h4>Waves</h4>
      <div class="dl-grid2">
        <span>Wave inicial</span><select data-from>${opts}</select>
        <span>Wave final</span><select data-to>${opts}</select>
        <span>Simulações</span><input type="number" min="1" max="${DEV_CONFIG.maxSimulations}" value="5" data-n>
      </div>
      <div class="dl-row" style="margin-top:4px"><label><input type="checkbox" data-o="autoplay" checked> Auto-play (inicial → final)</label>
        <label><input type="checkbox" data-o="god"> God Mode</label><label><input type="checkbox" data-o="gold"> Infinite Gold</label></div>
      <div class="dl-row"><label><input type="checkbox" data-o="energy"> Infinite Energy</label><label><input type="checkbox" data-o="nocd"> No Cooldowns</label>
        <label><input type="checkbox" data-o="move" checked> Combat Movement ON</label></div>
      <div class="dl-row"><button class="dl-btn" data-play>Jogar a wave inicial no jogo</button>
        <button class="dl-btn dl-primary" data-run>Simular</button><button class="dl-btn dl-danger" data-stop disabled>Parar</button></div>
      <div class="dl-note">Simular roda sem render, com a equipe, níveis e equipamento atuais (a vida da cidade começa cheia em cada wave). Sem Auto-play, só a wave inicial é simulada. "Jogar no jogo" muda a fase atual da run.</div>
      <div class="dl-note" data-prog></div>
    </div>
    <div class="dl-sec"><h4>Estatísticas (média por simulação)</h4><div data-out class="dl-note">—</div></div>`;
  const q = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const opt = (k: string) => q<HTMLInputElement>(`[data-o="${k}"]`).checked;
  q<HTMLSelectElement>('[data-to]').value = String(Math.min(phases.length - 1, 2));
  let stop = false;
  let running = false;

  const range = () => {
    const a = Number(q<HTMLSelectElement>('[data-from]').value);
    const b = Math.max(a, Number(q<HTMLSelectElement>('[data-to]').value));
    return phases.slice(a, b + 1);
  };

  const render = (list: typeof phases, perPhase: WaveStats[], reached: number[]) => {
    const f1 = (n: number) => n.toFixed(1);
    const f0 = (n: number) => Math.round(n).toLocaleString('pt-BR');
    const avg = (s: WaveStats, v: number) => v / Math.max(1, s.runs);
    const rows = perPhase
      .map((s, i) => {
        if (!s.runs) return '';
        const sec = avg(s, s.seconds);
        return `<tr><td>${i + 1}. ${phaseLabel(list[i])}</td><td class="n">${s.victories}/${s.runs}</td><td class="n">${f0(avg(s, s.kills))}</td><td class="n">${f1(sec)}s</td>
          <td class="n">${f0(avg(s, s.zeni))}</td><td class="n">${f0(avg(s, s.exp))}</td><td class="n">${f0(avg(s, s.dealt))}</td><td class="n">${f0(avg(s, s.taken))}</td>
          <td class="n">${f1(avg(s, s.deaths))}</td><td class="n">${f1(avg(s, s.dealt) / Math.max(1, sec))}</td><td class="n">${f1(avg(s, s.moved))}</td>
          <td class="n">${f1(avg(s, s.repositions))}</td><td class="n">${f1(avg(s, s.secondsMoving))}s</td><td class="n">${f1(avg(s, s.secondsAttacking))}s</td></tr>`;
      })
      .join('');
    const meanReached = reached.reduce((a, b) => a + b, 0) / Math.max(1, reached.length);
    q('[data-out]').innerHTML = `
      <div>Wave alcançada (vencidas em sequência): média <b>${meanReached.toFixed(2)}</b> · melhor ${Math.max(0, ...reached)} · pior ${reached.length ? Math.min(...reached) : 0} de ${list.length}</div>
      <div style="overflow-x:auto"><table class="dl-tbl"><thead><tr><th>Wave</th><th>Vitórias</th><th>Mortos</th><th>Tempo</th><th>Gold</th><th>XP</th><th>Dano causado</th><th>Dano recebido</th>
        <th>Mortes</th><th>DPS</th><th>Dist. média/herói</th><th>Reposic.</th><th>Em movimento</th><th>Atacando</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.stop !== undefined) {
      stop = true;
      return;
    }
    if (b.dataset.play !== undefined) {
      if (api.sim().phase === 'running') return ctx.log('Termine ou resete a onda atual antes.');
      const p = range()[0];
      api.playPhase(p.act, p.node, p.type);
      return;
    }
    if (b.dataset.run === undefined || running) return;
    const list = range();
    const n = Math.max(1, Math.min(DEV_CONFIG.maxSimulations, Math.round(Number(q<HTMLInputElement>('[data-n]').value) || 1)));
    if (opt('gold')) infinite.on = true;
    running = true;
    stop = false;
    q<HTMLButtonElement>('[data-stop]').disabled = false;
    b.disabled = true;
    const speed = api.getSpeed();
    api.setSpeed(0); // a arena espera enquanto as simulações rodam
    const t0 = performance.now();
    try {
      const r = await runWaves(
        api,
        { phases: list, simulations: n, autoplay: opt('autoplay'), god: opt('god'), noCooldowns: opt('nocd') || opt('energy'), combatMovement: opt('move') },
        (m) => (q('[data-prog]').textContent = m),
        () => stop,
      );
      render(opt('autoplay') ? list : list.slice(0, 1), r.perPhase, r.reached);
      q('[data-prog]').textContent = `${stop ? 'Interrompido' : 'Pronto'} em ${((performance.now() - t0) / 1000).toFixed(1)} s (${GAME_CONFIG.sim.tickRate} ticks = 1 s de jogo).`;
    } catch (err) {
      q('[data-prog]').textContent = `Erro: ${(err as Error).message}`;
    } finally {
      api.setSpeed(speed);
      running = false;
      b.disabled = false;
      q<HTMLButtonElement>('[data-stop]').disabled = true;
    }
  });

  return { refresh: () => undefined };
}
