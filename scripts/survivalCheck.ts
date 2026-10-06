// Checagem headless do Survival (cerco): caça à party, governador de densidade e recordes.
// 1) endless: todos caçam a party (incluindo tipos "bypass"), cidade intacta, estágio avança.
// 2) governador: teto de vivos segura o spawn sem travar a onda.
// 3) recordes: survivalBest grava, não regride, preservado pelo updateRecords, save antigo compatível.
import { GAME_CONFIG, applyZone, type PartySetup } from '../src/config/gameConfig';
import { ZONES, parseZone } from '../src/config/zones';
import { Simulation } from '../src/core/sim/Simulation';
import { emptyRecords, updateRecords, updateSurvivalBest } from '../src/core/run/records';
import { battleFor, newRun } from '../src/core/run/run';
import { createProfile, heroStats } from '../src/core/progression/profile';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// ---------- 1) cerco: resistência real, cidade intacta ----------
const run = newRun('warrior', 777);
run.party = ['warrior', 'mage'];
const { zone, wave } = battleFor(run, 'survival');
applyZone(zone, wave);
check('onda do cerco é endless sem chefe', GAME_CONFIG.wave.endless && !GAME_CONFIG.wave.boss, `count=${GAME_CONFIG.wave.count}`);
// party no centro do mapa (como o jogo posiciona): chão livre perto do centro, fora da cidade
const pz = parseZone(zone);
const city = new Set(pz.city.map((c) => `${c.x},${c.y}`));
const cx = Math.floor(pz.width / 2);
const cy = Math.floor(pz.height / 2);
const near = pz.floor.filter((f) => !city.has(`${f.x},${f.y}`)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
const setup: PartySetup = { members: [{ archetype: 'warrior', x: near[0].x, y: near[0].y }, { archetype: 'mage', x: near[1].x, y: near[1].y }], barriers: [] };
const startDist = Math.hypot(near[0].x - cx, near[0].y - cy);
check('party começa no centro', startDist <= 3, `desvio=${startDist.toFixed(1)}`);
const p = createProfile();
for (const k of run.party) p.heroes[k].level = 12;
const lo = Object.fromEntries(run.party.map((k) => [k, { stats: heroStats(p, k), level: 12, exp: 0 }]));
const sim = new Simulation(setup, wave.seed, lo, {});
sim.cheats.invincible = true; // mede o cerco (spawn/estágio/teto), não a morte da party
sim.start();
let maxAlive = 0;
while (sim.phase === 'running' && sim.tick < 6000) {
  sim.step();
  const n = sim.enemies().length;
  if (n > maxAlive) maxAlive = n;
}
check('cerco dura os 10 min simulados', sim.phase === 'running', `t=${sim.tick} kills=${sim.killed}`);
check('estágio do cerco avança', sim.stage >= 2, `stage=${sim.stage}`);
check('cidade intacta no cerco', sim.cityDamage === 0 && sim.cityHp === sim.cityMaxHp, `dano=${sim.cityDamage}`);
check('teto de vivos respeitado no cerco', maxAlive <= GAME_CONFIG.wave.maxAlive, `max=${maxAlive} teto=${GAME_CONFIG.wave.maxAlive}`);
check('portal não é objetivo no cerco', sim.reachedCity === 0, `invadiram=${sim.reachedCity}`);
// recuo coleta o resultado (caminho do "Recuar" da HUD)
sim.endSurvival();
check('recuo do cerco encerra em vitória', sim.phase === 'victory');

// ---------- 2) caça: infiltrador (bypass) vai atrás da party, não do portão ----------
applyZone(ZONES.bridge, { endless: true, boss: null, count: 99999, seed: 42 });
const probe = new Simulation({ members: [{ archetype: 'warrior', x: 22, y: 35 }], barriers: [] }, 42, {}, {});
probe.cheats.invincible = true;
probe.start();
const scout = probe.spawnEnemy('runner');
if (!scout) {
  check('spawn do batedor', false);
} else {
  const sx = scout.x;
  const sy = scout.y;
  const d0 = Math.hypot(sx - 22, sy - 35);
  let minD = d0;
  for (let i = 0; i < 400 && scout.alive; i++) {
    probe.step();
    if (scout.alive) minD = Math.min(minD, Math.hypot(scout.x - 22, scout.y - 35));
  }
  // chegou colado na party (atacando ou morto ao lado dela): caçou em vez de ir ao portão
  check('infiltrador caça a party no cerco', minD <= 2, `${d0.toFixed(1)} → min ${minD.toFixed(1)}`);
  check('caçador não invade a cidade', (probe.reachedByKind.runner ?? 0) === 0, `invadiram=${probe.reachedByKind.runner ?? 0}`);
}

// ---------- 3) governador com teto baixo: segura sem travar ----------
const CAP = GAME_CONFIG.wave.maxAlive;
GAME_CONFIG.wave.maxAlive = 6;
applyZone(ZONES.crookedWood, { boss: null, count: 60, seed: 7 });
const gov = new Simulation(ZONES.crookedWood.defaultSetup, 7, {}, {});
gov.cheats.invincible = true;
gov.start();
let govMax = 0;
while (gov.phase === 'running' && gov.tick < 4000) {
  gov.step();
  const n = gov.enemies().length;
  if (n > govMax) govMax = n;
}
GAME_CONFIG.wave.maxAlive = CAP;
check('teto baixo segura o spawn', govMax <= 6, `max=${govMax}`);
check('onda progride sob o teto', gov.spawned > 50, `spawned=${gov.spawned}`);

// ---------- 4) recordes do cerco ----------
const r0 = emptyRecords();
const r1 = updateSurvivalBest(r0, 300, 4, 50);
check('recorde de cerco gravado', r1.survivalBest?.seconds === 300 && r1.survivalBest?.stage === 4 && r1.survivalBest?.kills === 50);
const r2 = updateSurvivalBest(r1, 200, 9, 200);
check('recorde menor não apaga o melhor', r2.survivalBest?.seconds === 300);
const r2b = updateSurvivalBest(r1, 300, 5, 51);
check('desempate por abates no mesmo tempo', r2b.survivalBest?.kills === 51);
// save antigo (sem survivalBest) continua válido e o update geral preserva o cerco
const oldSave = { actsCleared: 1, farthestPhase: 3, maxDamage: 99, maxLevel: 5 };
const merged = { ...emptyRecords(), ...oldSave };
check('save antigo compatível', merged.survivalBest === undefined && merged.maxLevel === 5);
const r3 = updateRecords(r1, newRun('warrior', 1));
check('updateRecords preserva o melhor cerco', r3.survivalBest?.seconds === 300);

if (failures) {
  console.error(`survivalCheck: ${failures} FALHA(S)`);
  throw new Error('survivalCheck falhou');
}
console.log('survivalCheck: tudo certo');
