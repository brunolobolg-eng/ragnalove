/**
 * Roda ondas SEM render com a mesma `Simulation` do jogo (como o scripts/simCheck.ts).
 *
 * A zona ativa é global (GAME_CONFIG.board/wave), então cada simulação: guarda a zona do
 * jogo → aplica a zona da fase → roda a onda inteira de uma vez (síncrono) → devolve a
 * zona do jogo. Só depois disso cede a vez ao navegador, então a arena nunca vê a troca.
 */
import { GAME_CONFIG, ZONE_STATE, applyZone } from '../../config/gameConfig';
import { Simulation } from '../../core/sim/Simulation';
import type { SimMods } from '../../core/sim/RangeSystem';
import { DEV_CONFIG } from '../devConfig';
import type { DevLabApi, PhaseRef } from './DevLab';

export interface RunOptions {
  phases: PhaseRef[];
  simulations: number;
  /** Encadeia as fases (para na 1ª derrota); desligado = só a primeira fase. */
  autoplay: boolean;
  god: boolean;
  noCooldowns: boolean;
  combatMovement: boolean;
}

export interface WaveStats {
  runs: number;
  victories: number;
  kills: number;
  seconds: number;
  zeni: number;
  exp: number;
  dealt: number;
  taken: number;
  deaths: number;
  /** Tiles andados por herói (média por herói). */
  moved: number;
  repositions: number;
  secondsMoving: number;
  secondsAttacking: number;
}

export interface RunResult {
  /** Por fase (índice em `phases`). */
  perPhase: WaveStats[];
  /** Fase alcançada em cada simulação (índice + 1). */
  reached: number[];
}

const empty = (): WaveStats => ({ runs: 0, victories: 0, kills: 0, seconds: 0, zeni: 0, exp: 0, dealt: 0, taken: 0, deaths: 0, moved: 0, repositions: 0, secondsMoving: 0, secondsAttacking: 0 });
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export async function runWaves(api: DevLabApi, o: RunOptions, progress: (msg: string) => void, stopped: () => boolean): Promise<RunResult> {
  const phases = o.autoplay ? o.phases : o.phases.slice(0, 1);
  const out: RunResult = { perPhase: phases.map(empty), reached: [] };
  const tps = GAME_CONFIG.sim.tickRate;
  for (let i = 0; i < o.simulations && !stopped(); i++) {
    let reached = 0;
    for (let pi = 0; pi < phases.length && !stopped(); pi++) {
      progress(`Simulação ${i + 1}/${o.simulations} · fase ${pi + 1}/${phases.length}...`);
      const p = phases[pi];
      const snap = { zone: ZONE_STATE.current, board: structuredClone(GAME_CONFIG.board), wave: structuredClone(GAME_CONFIG.wave) };
      let won = false;
      try {
        const { zone, wave } = api.headless.zoneFor(p.act, p.node, p.type);
        applyZone(zone, { ...wave, seed: ((wave.seed ?? zone.wave.seed) + i * DEV_CONFIG.headlessSeedStep) >>> 0 });
        const setup = api.headless.setupFor(zone);
        const max = api.headless.cityMaxHp();
        const sim = new Simulation(setup, GAME_CONFIG.wave.seed, api.headless.loadout(), { cityHp: max, cityMaxHp: max });
        Object.assign(sim.cheats, { invincible: o.god, noCooldowns: o.noCooldowns, oneHit: api.cheats.oneHit });
        const mods: SimMods = { ...api.mods, heroes: api.mods.heroes, combatMovement: o.combatMovement };
        sim.mods = mods;
        sim.start();
        while (sim.phase === 'running' && sim.tick < DEV_CONFIG.headlessMaxTicks) sim.step();
        const r = sim.report(pi + 1);
        const st = out.perPhase[pi];
        const heroes = setup.members.length || 1;
        const cs = Object.values(sim.combatStats);
        won = sim.phase === 'victory';
        st.runs++;
        st.victories += won ? 1 : 0;
        st.kills += r.enemiesKilled;
        st.seconds += sim.tick / tps;
        st.zeni += r.zeniEarned;
        st.exp += r.expEarned;
        st.dealt += r.damageDealtByUnit.reduce((s, x) => s + x.amount, 0);
        st.taken += r.damageTakenByUnit.reduce((s, x) => s + x.amount, 0);
        st.deaths += setup.members.length - [...sim.units.values()].filter((u) => u.team === 'party' && u.alive).length;
        st.moved += cs.reduce((s, x) => s + x.tilesMoved, 0) / heroes;
        st.repositions += cs.reduce((s, x) => s + x.repositions, 0);
        st.secondsMoving += cs.reduce((s, x) => s + x.ticksMoving, 0) / tps;
        st.secondsAttacking += cs.reduce((s, x) => s + x.ticksAttacking, 0) / tps;
      } finally {
        Object.assign(GAME_CONFIG.board, snap.board);
        Object.assign(GAME_CONFIG.wave, snap.wave);
        ZONE_STATE.current = snap.zone;
      }
      if (won) reached = pi + 1;
      await nextFrame();
      if (!won) break;
    }
    out.reached.push(reached);
  }
  return out;
}
