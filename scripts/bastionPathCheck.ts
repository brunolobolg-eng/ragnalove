/**
 * Checagem headless do caminho da horda com as estruturas da cidade (Bastião). Rode: npm run bastion:path
 * 1) Linha com brecha: a horda passa pela brecha e nenhuma estrutura perde vida.
 * 2) Caminhos todos fechados: a horda ataca a muralha, a vida cai e ela quebra.
 * 3) Bolsão fechado: o monstro preso dentro ataca a parede.
 * 4) Sem estrutura de pé: o mesmo resultado de antes (campanha intacta).
 * 5) Determinismo: a mesma montagem duas vezes dá o mesmo resultado.
 * 6) Custo: tempo por tick com e sem estruturas (só informa a razão).
 */
import { DEFAULT_SETUP, applyZone } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { Simulation, type Fortification } from '../src/core/sim/Simulation';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// Mapa da ponte: a cidade fica na linha 38 (x 20 a 24). Só a linha 37 dá acesso a ela (x 20 a 24).
const CITY_ROW = 37;
const GATE_XS = [20, 21, 22, 23, 24];
const WALL_HP = 120;
const BREAK_HP = 30;

applyZone(ZONES.bridge);

interface Run {
  sim: Simulation;
  /** Golpes de inimigos em objetos (quem bateu e o objeto atingido). */
  blows: { unitId: number; objectId: number }[];
  /** Tiles em que algum inimigo esteve ao menos uma vez. */
  stood: Set<string>;
  /** Assinatura determinística de todas as posições e vidas, tick a tick. */
  sig: number;
}

const isBastion = (sim: Simulation, objectId: number) => {
  const o = sim.objects.get(objectId);
  return !!o && (o.type === 'bastionWall' || o.type === 'bastionTower');
};

/** Roda a onda com as estruturas dadas. `prepare` roda logo após a largada (ex.: pôr um monstro num tile). */
function fight(fort: Fortification[], ticks: number, prepare: (sim: Simulation) => void = () => {}): Run {
  const sim = new Simulation(DEFAULT_SETUP, undefined, {}, { fortifications: fort });
  sim.start();
  prepare(sim);
  const run: Run = { sim, blows: [], stood: new Set(), sig: 2166136261 };
  const mix = (h: number, n: number) => Math.imul(h ^ (n | 0), 16777619) >>> 0;
  for (let i = 0; i < ticks && sim.phase === 'running'; i++) {
    for (const e of sim.step()) {
      if (e.type === 'melee' && e.targetId < 0) run.blows.push({ unitId: e.unitId, objectId: -e.targetId });
    }
    for (const u of sim.units.values()) {
      if (u.alive && u.team === 'enemy') run.stood.add(`${u.x},${u.y}`);
      run.sig = mix(mix(mix(mix(run.sig, u.id), u.x), u.y), u.hp);
    }
    run.sig = mix(run.sig, sim.cityHp);
  }
  return run;
}

const states = (r: Run) => JSON.stringify(r.sim.fortificationStates());
/** Mesma batalha: posições e vidas tick a tick, tempo, abates e vida da cidade. */
const sameBattle = (a: Run, b: Run) => a.sig === b.sig && a.sim.tick === b.sim.tick && a.sim.killed === b.sim.killed && a.sim.cityHp === b.sim.cityHp;
const sameRun = (a: Run, b: Run) => sameBattle(a, b) && states(a) === states(b);

// Brecha: a linha de 5 blocos com o tile x=24 livre (o único caminho até o portão)
const gap: Fortification[] = GATE_XS.slice(0, 4).map((x, i) => ({ id: 10 + i, kind: 'wall', x, y: CITY_ROW, hp: WALL_HP, maxHp: WALL_HP }));
// Cerco: os 5 blocos fecham o único acesso à cidade (todo caminho bloqueado)
const seal: Fortification[] = GATE_XS.map((x, i) => ({ id: 20 + i, kind: 'wall', x, y: CITY_ROW, hp: BREAK_HP, maxHp: BREAK_HP }));
// Bolsão: 8 blocos em volta do tile (10, 33); o monstro nasce dentro
const pocketTiles = [
  { x: 9, y: 32 },
  { x: 10, y: 32 },
  { x: 11, y: 32 },
  { x: 9, y: 33 },
  { x: 11, y: 33 },
  { x: 9, y: 34 },
  { x: 10, y: 34 },
  { x: 11, y: 34 },
];
const ring: Fortification[] = pocketTiles.map((t, i) => ({ id: 30 + i, kind: 'wall', x: t.x, y: t.y, hp: BREAK_HP, maxHp: BREAK_HP }));
const deadWalls: Fortification[] = GATE_XS.map((x, i) => ({ id: 40 + i, kind: 'wall', x, y: CITY_ROW, hp: 0, maxHp: WALL_HP }));

console.log('\n# 1) Linha com brecha');
const A = fight(gap, 1500);
const sA = A.sim.fortificationStates();
check('a horda passa pela brecha (tile 24,37)', A.stood.has('24,37'));
check('a horda chega à cidade pela brecha', A.sim.reachedCity > 0, `${A.sim.reachedCity} invasões`);
check('nenhuma estrutura perde vida com caminho livre', A.blows.length === 0 && sA.every((s) => s.hp === WALL_HP), `${A.blows.length} golpes`);

console.log('\n# 2) Caminhos todos fechados');
const B = fight(seal, 1500);
const sB = B.sim.fortificationStates();
const quebradas = sB.filter((s) => s.hp === 0).length;
check('sem caminho livre, a horda ataca a muralha', B.blows.length > 0 && B.blows.every((b) => isBastion(B.sim, b.objectId)), `${B.blows.length} golpes em estruturas`);
check('a vida da muralha cai e ela quebra', sB.some((s) => s.hp < BREAK_HP) && quebradas > 0, `${quebradas} de ${sB.length} quebraram`);
check('depois da quebra, a horda passa e chega à cidade', B.sim.reachedCity > 0, `${B.sim.reachedCity} invasões`);

console.log('\n# 3) Bolsão fechado');
let pocketId = -1;
const C = fight(ring, 400, (sim) => {
  pocketId = sim.spawnEnemyAt('grunt', 10, 33, 1e6)?.id ?? -1;
});
const golpesDoBolsao = C.blows.filter((b) => b.unitId === pocketId);
check('monstro preso dentro do bolsão ataca a parede', pocketId > 0 && golpesDoBolsao.length > 0, `${golpesDoBolsao.length} golpes`);
check('o golpe do bolsão cai numa estrutura do Bastião', golpesDoBolsao.every((b) => isBastion(C.sim, b.objectId)));

console.log('\n# 4) Sem estrutura de pé');
const semNada = fight([], 600);
const semPe = fight(deadWalls, 600);
check('estruturas destruídas não mudam a onda (mesmo resultado que sem estrutura)', sameBattle(semNada, semPe), `t=${semNada.sim.tick} abatidos ${semNada.sim.killed}`);
check('sem estrutura de pé, nenhum golpe em objeto', semNada.blows.length === 0 && semPe.blows.length === 0);

console.log('\n# 5) Determinismo');
check('brecha: duas execuções idênticas', sameRun(A, fight(gap, 1500)));
check('cerco: duas execuções idênticas', sameRun(B, fight(seal, 1500)));
check('bolsão: duas execuções idênticas', sameRun(C, fight(ring, 400, (sim) => sim.spawnEnemyAt('grunt', 10, 33, 1e6))));

console.log('\n# 6) Custo (informativo)');
/** Tempo médio por tick (mediana de 5 execuções, depois de um aquecimento). */
function msPerTick(fort: Fortification[], ticks: number): number {
  const times: number[] = [];
  for (let k = 0; k < 6; k++) {
    const sim = new Simulation(DEFAULT_SETUP, undefined, {}, { fortifications: fort });
    sim.start();
    const t0 = performance.now();
    let n = 0;
    while (n < ticks && sim.phase === 'running') {
      sim.step();
      n++;
    }
    if (k > 0) times.push((performance.now() - t0) / Math.max(1, n));
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)];
}
const TICKS = 400;
const base = msPerTick([], TICKS);
const withGap = msPerTick(gap, TICKS);
const withSeal = msPerTick(seal, TICKS);
const fmt = (x: number) => `${x.toFixed(3)} ms/tick`;
console.log(`info  sem estruturas ${fmt(base)} · com brecha ${fmt(withGap)} (×${(withGap / base).toFixed(2)}) · com cerco ${fmt(withSeal)} (×${(withSeal / base).toFixed(2)})`);

console.log(failures ? `\n${failures} checagem(ns) falharam.` : '\nTodas as checagens do caminho da horda passaram.');
if (failures) throw new Error(`bastionPathCheck: ${failures} falha(s)`);
