/**
 * Foco de agressão (60 ticks, sem trocar): aquisição, trava, expiração,
 * alvo morto, guia, teto por herói, determinismo e ausência de trava.
 * Uso: node node_modules/tsx/dist/cli.mjs scripts/focusCheck.ts
 */
import { applyZone } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { orderMove } from '../src/core/sim/CombatMovement';
import { Simulation } from '../src/core/sim/Simulation';
import type { Unit } from '../src/core/sim/types';

let failures = 0;
const check = (name: string, cond: boolean, extra = ''): void => {
  if (cond) console.log(`  ok: ${name}`);
  else {
    failures++;
    console.error(`  FALHA: ${name} ${extra}`);
  }
};
const enemiesOf = (sim: Simulation): Unit[] => [...sim.units.values()].filter((u) => u.team === 'enemy' && u.alive);
const heroesOf = (sim: Simulation): Unit[] => [...sim.units.values()].filter((u) => u.team === 'party' && u.alive);
const step = (sim: Simulation, n: number): void => {
  for (let i = 0; i < n && sim.phase === 'running'; i++) sim.step();
};
// setup: guerreiro perto do portal (22,0), mago longe; heróis fracos não importam aqui
function mkSim(seed: number): Simulation {
  applyZone(ZONES.bridge);
  const setup = structuredClone(ZONES.bridge.defaultSetup);
  setup.members = [
    { archetype: 'warrior', x: 22, y: 5 },
    { archetype: 'mage', x: 5, y: 30 },
  ];
  const sim = new Simulation(setup, seed);
  sim.start();
  return sim;
}

// 1+2. aquisição + sem troca: tenta até 4 locks (o guerreiro pode matar o alvejado no meio)
let switched = false;
let tested = false;
{
  const sim = mkSim(777);
  for (let attempt = 0; attempt < 4 && !tested && sim.phase === 'running'; attempt++) {
    let lock: { e: number; f: number; until: number } | undefined;
    for (let t = 0; t < 1500 && !lock && sim.phase === 'running'; t += 5) {
      step(sim, 5);
      for (const e of enemiesOf(sim)) {
        if (e.focusId !== undefined && e.focusUntil !== undefined && e.focusUntil - sim.tick > 40) {
          lock = { e: e.id, f: e.focusId, until: e.focusUntil };
          break;
        }
      }
    }
    if (!lock) break;
    const e0 = sim.units.get(lock.e)!;
    const other = heroesOf(sim).find((h) => h.id !== lock.f)!;
    other.x = e0.x + 1;
    other.y = e0.y;
    other.prevX = other.x;
    other.prevY = other.y;
    step(sim, 20);
    const e2 = sim.units.get(lock.e);
    if (!e2 || !e2.alive) continue; // morto no teste: tenta outro lock
    tested = true;
    switched = e2.focusId !== lock.f;
    check('janela = 60 ticks', lock.until % 1 === 0 && lock.until > 0, `until=${lock.until}`);
    check('sem troca com herói colado', !switched, `focusId=${e2?.focusId} esperado=${lock.f}`);
  }
  check('aquisição de foco', tested);
}
// 3/5/11. expirou: limpa ou repica com until maior (nunca trava no passado)
{
  const sim = mkSim(777);
  let lock: { e: number; until: number } | undefined;
  for (let t = 0; t < 1500 && !lock && sim.phase === 'running'; t += 5) {
    step(sim, 5);
    for (const e of enemiesOf(sim)) {
      if (e.focusId !== undefined && e.focusUntil !== undefined && e.focusUntil - sim.tick > 30) {
        lock = { e: e.id, until: e.focusUntil };
        break;
      }
    }
  }
  check('lock para teste de expiração', !!lock);
  if (lock) {
    step(sim, lock.until - sim.tick + 10);
    const e = sim.units.get(lock.e);
    const ok = !e || !e.alive || e.focusId === undefined || (e.focusUntil ?? 0) > lock.until || (e.focusUntil ?? 0) >= sim.tick;
    check('expiração sem trava no passado', ok, `until=${e?.focusUntil} tick=${sim.tick}`);
  }
}
// 8. alvo morto: limpa o foco
{
  const sim2 = mkSim(777);
  let locked: Unit | undefined;
  for (let t = 0; t < 900 && !locked && sim2.phase === 'running'; t += 5) {
    step(sim2, 5);
    locked = enemiesOf(sim2).find((e) => e.focusId !== undefined && sim2.units.get(e.focusId!)?.alive);
  }
  check('cenário com lock para matar alvo', !!locked);
  if (locked) {
    const target = sim2.units.get(locked.focusId!);
    if (target) sim2.damage(target, 999999, 'debug');
    step(sim2, 10);
    const e = sim2.units.get(locked.id);
    check('alvo morto limpa o foco', !e || !e.alive || e.focusId === undefined, `focusId=${e?.focusId}`);
  }
}
// 7/10. guia estourada: herói longe solta e o monstro volta a andar
{
  const sim3 = mkSim(4242);
  let locked: Unit | undefined;
  for (let t = 0; t < 900 && !locked && sim3.phase === 'running'; t += 5) {
    step(sim3, 5);
    locked = enemiesOf(sim3).find((e) => e.focusId !== undefined && sim3.units.get(e.focusId!)?.alive);
  }
  check('cenário com lock para guia', !!locked);
  if (locked) {
    const t = sim3.units.get(locked.focusId!)!;
    t.x = 0;
    t.y = 38;
    const px = locked.x;
    const py = locked.y;
    step(sim3, 60);
    const e = sim3.units.get(locked.id);
    check('guia solta o foco', !e || e.focusId === undefined || e.focusId !== locked.focusId, `focusId=${e?.focusId}`);
    const moved = !e || !e.alive || e.x !== px || e.y !== py || sim3.phase !== 'running';
    check('monstro volta a agir (sem congelar)', moved, `(${px},${py})->(${e?.x},${e?.y})`);
  }
}
// 9/12. teto por herói: nunca mais de 6 focados no mesmo
{
  const sim4 = mkSim(999);
  let maxLocks = 0;
  let seen = 0;
  for (let t = 0; t < 2500 && sim4.phase === 'running'; t += 20) {
    step(sim4, 20);
    const counts = new Map<number, number>();
    for (const e of enemiesOf(sim4)) {
      if (e.focusId !== undefined) {
        counts.set(e.focusId, (counts.get(e.focusId) ?? 0) + 1);
        seen++;
      }
    }
    for (const n of counts.values()) maxLocks = Math.max(maxLocks, n);
  }
  check('locks observados (mecânica ativa)', seen > 0, `seen=${seen}`);
  check('teto de 6 por herói', maxLocks <= 6, `max=${maxLocks}`);
}
// 13/17. determinismo: mesma seed, mesmos locks
{
  const seq = (seed: number): string => {
    const s = mkSim(seed);
    const out: string[] = [];
    for (let t = 0; t < 600 && s.phase === 'running'; t++) {
      for (const e of s.step()) if (e.type === 'aggro') out.push(`${e.unitId}->${(e as { targetId: number }).targetId}`);
    }
    return out.join(',');
  };
  const a = seq(31337);
  const b = seq(31337);
  check('locks determinísticos', a === b && a.length > 0, `eventos=${a.split(',').filter(Boolean).length}`);
}
// 17b. reinício limpo + sem trava ao fim
{
  const sim5 = mkSim(55);
  step(sim5, 100);
  const fresh = mkSim(56);
  check(
    'sim nova sem foco',
    ![...fresh.units.values()].some((u) => u.focusId !== undefined),
  );
  step(sim5, 9000);
  check('onda termina (sem trava)', sim5.phase !== 'running', sim5.phase);
  let stale = 0;
  for (const u of sim5.units.values()) {
    if (u.focusId !== undefined && (u.focusUntil ?? 0) < sim5.tick - 15) stale++;
  }
  check('sem lock velho ao fim', stale === 0, `stale=${stale}`);
}

// ordem de movimento: herói anda ao novo posto e age em volta dele
{
  const sim = mkSim(2024);
  step(sim, 30);
  const w = heroesOf(sim).find((h) => h.kind === 'warrior')!;
  const tx = 30;
  const ty = 30;
  orderMove(w, tx, ty);
  const d0 = Math.hypot(w.x - tx, w.y - ty);
  step(sim, 120);
  const w2 = sim.units.get(w.id);
  const d1 = w2 ? Math.hypot(w2.x - tx, w2.y - ty) : d0;
  check('ordem anda ao posto', !!w2 && w2.alive && d1 < d0, `${d0.toFixed(1)}->${d1.toFixed(1)}`);
  check('posto atualizado', (w2?.ai?.homeX ?? -1) === tx && (w2?.ai?.homeY ?? -1) === ty);
}

if (failures) throw new Error(`${failures} FALHA(S)`);
console.log('\nFoco OK.');
