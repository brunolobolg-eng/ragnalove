// Checagem headless da Arena de Skills: mapa de teste, boneco parado,
// recompensa zero, remoção limpa, tap de eventos e agregação de dano.
// Nada aqui toca em perfil, run ou save.
import { applyZone } from '../src/config/gameConfig';
import { parseZone } from '../src/config/zones';
import { killRewards } from '../src/core/sim/Simulation';
import { Simulation } from '../src/core/sim/Simulation';
import { TEST_ZONE, TEST_ZONE_ID, summarizeHits, type HitSample } from '../src/dev/DevLab/skillArenaZone';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// ---------- 1) mapa de teste válido e fora da campanha ----------
{
  const pz = parseZone(TEST_ZONE);
  check('mapa 40×30 parseia', pz.width === 40 && pz.height === 30);
  check('sem portão (arena pura)', pz.city.length === 0);
  check('2 spawns + setup no chão', pz.spawnPoints.length === 2);
  const floor = new Set(pz.floor.map((f) => `${f.x},${f.y}`));
  check('setup padrão cabe no mapa', TEST_ZONE.defaultSetup.members.every((m) => floor.has(`${m.x},${m.y}`)));
  check('id isolado', TEST_ZONE_ID === 'testArena');
}

// ---------- 2) boneco: parado, não ataca, recompensa zero ----------
{
  applyZone(TEST_ZONE, { count: 0, boss: null, seed: 4242 });
  const sim = new Simulation(TEST_ZONE.defaultSetup, 4242, {}, {});
  const dummy = sim.spawnEnemyAt('trainingDummy', 20, 14)!;
  check('boneco spawnado', !!dummy && dummy.kind === 'trainingDummy');
  const x0 = dummy.x;
  const y0 = dummy.y;
  sim.start();
  let acted = 0;
  let tapped = 0;
  const unsub = sim.onEvent((e) => {
    tapped++;
    if ((e.type === 'move' || e.type === 'melee') && 'unitId' in e && e.unitId === dummy.id) acted++;
  });
  let t = 0;
  while (sim.phase === 'running' && t++ < 1500) sim.step();
  unsub();
  check('onda de teste não termina sozinha', sim.phase === 'running', `t=${sim.tick}`);
  check('boneco nunca anda nem ataca', acted === 0 && dummy.x === x0 && dummy.y === y0, `eventos=${tapped}`);
  check('tap recebeu eventos reais', tapped > 0, `${tapped} eventos`);
  const rw = killRewards('trainingDummy');
  check('recompensa zero (sem almas/EXP/Zen)', rw.souls === 0 && rw.exp === 0 && rw.zeni === 0);
  const killedBefore = sim.killed;
  const soulsBefore = sim.souls;
  check('remoção limpa sem contador', sim.debugRemove(dummy.id) && !sim.units.has(dummy.id) && sim.killed === killedBefore && sim.souls === soulsBefore);
}

// ---------- 3) agregação de dano (comparação de skills) ----------
{
  const hits: HitSample[] = [
    { tick: 90, hero: 'mage', source: 'bolt', amount: 124, crit: false, target: 7, targetKind: 'trainingDummy' },
    { tick: 95, hero: 'mage', source: 'bolt', amount: 131, crit: false, target: 7, targetKind: 'trainingDummy' },
    { tick: 100, hero: 'mage', source: 'bolt', amount: 248, crit: true, target: 7, targetKind: 'trainingDummy' },
    { tick: 100, hero: 'warrior', source: 'cleave', amount: 60, crit: false, target: 7, targetKind: 'trainingDummy' },
    { tick: 100, hero: 'warrior', source: 'cleave', amount: 60, crit: false, target: 8, targetKind: 'trainingDummy' },
  ];
  const { groups, targets, total } = summarizeHits(hits, 100);
  const bolt = groups.find((g) => g.source === 'bolt')!;
  check('total/média/máx/críticos', total === 623 && bolt.avg === 503 / 3 && bolt.max === 248 && bolt.crits === 1, `total=${total} média=${bolt.avg.toFixed(1)}`);
  check('DPS na janela de 10s', Math.abs(bolt.dps - 50.3) < 0.01, `dps=${bolt.dps.toFixed(1)}`);
  check('dano por alvo separado', targets.length === 2 && targets[0].total === 563, targets.map((t) => `#${t.id}=${t.total}`).join(' '));
  check('ordenado por total', groups[0].source === 'bolt');
}

if (failures) {
  console.error(`skillArenaCheck: ${failures} FALHA(S)`);
  throw new Error('skillArenaCheck falhou');
}
console.log('skillArenaCheck: tudo certo');
