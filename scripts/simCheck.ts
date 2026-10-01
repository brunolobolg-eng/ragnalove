/**
 * Validação headless (sem renderização).
 * 1) Ponte: a mesma onda com a defesa padrão, sem barreiras e com a party longe do portão.
 * 2) Toda zona: a onda termina (sem trava), e quantos inimigos invadiram a cidade.
 * 3) Determinismo: duas execuções idênticas precisam bater.
 */
import { DEFAULT_SETUP, applyZone, type PartySetup } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { Simulation } from '../src/core/sim/Simulation';

function run(label: string, setup: PartySetup): void {
  const sim = new Simulation(setup);
  sim.start();
  let cleaves = 0;
  let cleaveHits = 0;
  let burnSteps = 0;
  let taunts = 0;
  while (sim.phase === 'running' && sim.tick < 8000) {
    for (const e of sim.step()) {
      if (e.type === 'cleave') {
        cleaves++;
        cleaveHits += e.hits;
      }
      if (e.type === 'taunt') taunts++;
      if (e.type === 'move') {
        const u = sim.units.get(e.unitId);
        if (u) for (const ef of sim.effects.values()) if (ef.tiles.some((t) => t.x === u.x && t.y === u.y)) burnSteps++;
      }
    }
  }
  const r = sim.report(1);
  const party = [...sim.units.values()].filter((u) => u.team === 'party').map((u) => `${u.kind}:${u.hp}hp`);
  console.log(
    `[${label}] ${sim.phase} em ${sim.tick} ticks | abatidos ${r.enemiesKilled} · invadiram ${r.enemiesReachedCity} (${JSON.stringify(r.reachedByKind)}) · cidade −${r.cityDamageTaken} (${Math.round(r.cityThreatPercent * 100)}%) | party ${party.join(' ')}\n` +
      `   golpes ${cleaves}, média ${(cleaveHits / Math.max(1, cleaves)).toFixed(2)} inimigos/golpe | passos no fogo ${burnSteps} | provocações ${taunts}`,
  );
}

applyZone(ZONES.bridge);
run('ponte · defesa padrão', DEFAULT_SETUP);
run('ponte · sem barreiras', { ...DEFAULT_SETUP, barriers: DEFAULT_SETUP.barriers.map((b) => ({ ...b, x: 0, y: 0 })) });
run('ponte · party no meio da ponte', { ...DEFAULT_SETUP, members: [{ archetype: 'warrior', x: 22, y: 12 }, { archetype: 'mage', x: 22, y: 16 }] });

// Toda zona termina a onda (ninguém fica preso sem caminho)
for (const id of Object.keys(ZONES)) {
  if (id === 'town') continue;
  const z = ZONES[id];
  applyZone(z);
  const sim = new Simulation(z.defaultSetup, z.wave.seed);
  sim.start();
  while (sim.phase === 'running' && sim.tick < 9000) sim.step();
  const r = sim.report(1);
  const ok = sim.phase !== 'running';
  console.log(`${ok ? 'ok  ' : 'TRAVOU'} ${id.padEnd(12)} ${sim.phase.padEnd(8)} t=${sim.tick} abatidos ${r.enemiesKilled} invadiram ${r.enemiesReachedCity} cidade −${r.cityDamageTaken}`);
}

// Determinismo: duas execuções idênticas precisam bater.
applyZone(ZONES.bridge);
const a = new Simulation(DEFAULT_SETUP);
const b = new Simulation(DEFAULT_SETUP);
a.start();
b.start();
for (let i = 0; i < 900; i++) {
  a.step();
  b.step();
}
const sig = (s: Simulation) => [...s.units.values()].map((u) => `${u.id}:${u.x},${u.y},${u.hp}`).join('|') + `#${s.cityHp}`;
console.log('determinístico:', sig(a) === sig(b));
