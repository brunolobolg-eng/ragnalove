/**
 * Checagem headless do Último Bastião (sem renderização). Rode: npm run bastion:check
 * 1) Dados · 2) Estado e migração · 3) Colocação · 4) Custos, reparo e reembolso · 5) Projetos ·
 * 6) Ondas (idempotência, derrota e recomeço do zero) · 7) Simulação (muralhas quebráveis, torres, destruídas) ·
 * 8) Cartas compartilhadas · 9) Preço, teto, classes, pacotes e slots · 10) Mapa do Último Bastião (bastionKeep) ·
 * 11) Emperium: dano de contato (vida × força ÷ 30) e a campanha segue pela ameaça por tipo ·
 * 12) Turnos e muralhas recentes (mover no turno) · 13) Horda por noite (comum, mini-chefe e MVP) ·
 * 14) Recomeçar do zero (derrota zera a cidade e os heróis; o total de vitórias, pacotes e slots não zeram).
 */
import { BASTION, BASTION_HORDE, BASTION_ZONE_ID, PROJECTS, PROJECT_IDS, STRUCTURES } from '../src/config/bastion';
import { hordeOf } from '../src/core/bastion/horde';
import { CARD_SLOT_WINS, addCards, cardRuntimeFor, cardSlots, cardSlotsPool, emptyCollection, equipCard, type CardCollection } from '../src/core/progression/cards';
import { createProfile, heroStats } from '../src/core/progression/profile';
import { DEFAULT_SETUP, GAME_CONFIG, applyZone } from '../src/config/gameConfig';
import { ZONES, parseZone } from '../src/config/zones';
import type { WaveResult } from '../src/core/progression/profile';
import { findStructure, migrateBastion, newBastion, structureMaxHp, structureStatus, type BastionState, type Structure } from '../src/core/bastion/bastion';
import {
  BUILD_MSG,
  applyNight,
  bastionCardSlots,
  buildCostOf,
  checkMove,
  isMovable,
  moveStructure,
  setParty,
  fortificationsOf,
  placeStructure,
  refundOf,
  removeStructure,
  repairCore,
  repairCostOf,
  repairStructure,
  startAttempt,
  unlockProject,
  upgradeStructure,
  waveSeed,
  type BuildEnv,
  type NightOutcome,
  type Result,
} from '../src/core/bastion/rules';
import { bastionBuildEnv, routeOpen, staticBoard } from '../src/core/bastion/route';
import { emperiumDamage } from '../src/core/bastion/emperium';
import type { Unit } from '../src/core/sim/types';
import { Board } from '../src/core/grid/Board';
import { chebyshev, type Vec2 } from '../src/core/grid/types';
import { Simulation, type Fortification } from '../src/core/sim/Simulation';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};
const errOf = (r: Result) => (r.ok ? undefined : r.error);

// Mapa de teste: a ponte (zona da campanha). A grade estática vem do mesmo montador que a simulação usa.
const zone = ZONES.bridge;
applyZone(zone);
const board = staticBoard(zone);
const spawns = zone.spawnPoints;
const heroes: Vec2[] = DEFAULT_SETUP.members.map((m) => ({ x: m.x, y: m.y }));
const inArea = (x: number, y: number) => x >= 6 && x <= 38 && y >= 22 && y <= 33;
const env = (buildable: (x: number, y: number) => boolean = inArea, b: Board = board): BuildEnv => ({
  board: b,
  buildable,
  spawns,
  spawnSafeRadius: GAME_CONFIG.wave.spawnSafeRadius,
  heroes,
});
const nearSpawn = (p: Vec2) => spawns.some((s) => chebyshev(s, p) <= GAME_CONFIG.wave.spawnSafeRadius);
const free: Vec2[] = [];
for (let y = 22; y <= 33; y++)
  for (let x = 6; x <= 38; x++) {
    const p = { x, y };
    if (board.isWalkable(x, y) && !board.isCity(x, y) && !nearSpawn(p) && !heroes.some((h) => h.x === x && h.y === y)) free.push(p);
  }

console.log('\n# 1) Dados');
check('torre exige a Arqueira (projeto)', PROJECTS.towers.hero === 'archer');
check('projeto inicial é grátis e sem pré-requisito', PROJECTS.castle.cost === 0 && PROJECTS.castle.requires.length === 0);
check(
  'todo pré-requisito e todo projeto de estrutura existem',
  PROJECT_IDS.length === 3 && Object.values(PROJECTS).every((p) => p.requires.every((r) => PROJECT_IDS.includes(r))) && Object.values(STRUCTURES).every((d) => PROJECT_IDS.includes(d.project)),
);
check('reconstruir custa mais que reparar (taxas)', BASTION.rebuildRate > BASTION.repairRate);
check('torre atira; muralha não', !!STRUCTURES.tower.shot && !STRUCTURES.wall.shot);
check('muralha custa 5, dobra e tem teto de 999; torre tem preço fixo', STRUCTURES.wall.cost === 5 && STRUCTURES.wall.costGrowth === 2 && STRUCTURES.wall.priceCap === 999 && STRUCTURES.tower.costGrowth === 1);
check('muralha pode ser erguida fora dos lotes e movida; torre não faz nem uma coisa nem outra', STRUCTURES.wall.anywhere === true && STRUCTURES.wall.movable === true && !STRUCTURES.tower.anywhere && !STRUCTURES.tower.movable);
check('há terreno livre suficiente para os testes', free.length >= 4, `${free.length} tiles`);

console.log('\n# 2) Estado e migração');
const b0 = newBastion(7, emptyCollection());
check('cidade nova: só o castelo, núcleo cheio, party inicial', b0.projects.join() === 'castle' && b0.coreHp === BASTION.coreMaxHp && b0.party.join() === 'warrior,mage' && b0.attempt === 1);
const j0 = JSON.stringify(b0);
check('save vai e volta pelo JSON sem perda', JSON.stringify(migrateBastion(JSON.parse(j0))) === j0);
const legacy = JSON.parse(j0) as Partial<BastionState>;
delete legacy.projects;
delete legacy.party;
delete legacy.records;
delete legacy.nextId;
delete legacy.structures;
const m1 = JSON.stringify(migrateBastion(legacy as BastionState));
check('save incompleto ganha os campos que faltam', m1.includes('"projects":["castle"]') && m1.includes('"party"') && m1.includes('"records"'));
check('migração é idempotente', JSON.stringify(migrateBastion(JSON.parse(m1) as BastionState)) === m1);
check('cidade nova começa no turno 0', b0.turn === 0);
const antigo = JSON.parse(j0) as Record<string, unknown>;
delete antigo.turn;
antigo.structures = [{ id: 1, kind: 'wall', x: free[0].x, y: free[0].y, level: 1, hp: 120, invested: 5 }];
antigo.nextId = 2;
const migrado = migrateBastion(antigo as unknown as BastionState);
check('save antigo (sem turno e sem placedTurn): turno 0 e construção com placedTurn -1', migrado.turn === 0 && migrado.structures[0].placedTurn === -1);
check('construção de save antigo não se move (não é recente)', !isMovable(migrado, migrado.structures[0]) && checkMove(migrado, env(), 1, free[1]) === 'notRecent');
check('turno inválido (NaN) vira 0 sem quebrar o save', migrateBastion({ ...(JSON.parse(j0) as BastionState), turn: Number.NaN }).turn === 0);
const migradoDeNovo = JSON.stringify(migrateBastion(JSON.parse(JSON.stringify(migrado)) as BastionState));
check('migração do turno e do placedTurn é idempotente', migradoDeNovo === JSON.stringify(migrado));
for (const t of [2.5, -3, Number.POSITIVE_INFINITY]) {
  check(`turno ${t} (fracionado, negativo ou infinito) vira 0`, migrateBastion({ ...(JSON.parse(j0) as BastionState), turn: t }).turn === 0);
}
// Total de vitórias (records.totalNights): save antigo sem o campo começa nas ondas vencidas; valor válido fica.
const semTotal = JSON.parse(j0) as BastionState;
semTotal.nights = 42;
semTotal.nightsInAttempt = 42;
delete (semTotal.records as { totalNights?: number }).totalNights;
check('save antigo sem totalNights: o total começa nas ondas vencidas (42)', migrateBastion(semTotal).records.totalNights === 42);
const comTotal = JSON.parse(j0) as BastionState;
comTotal.nights = 42;
comTotal.records.totalNights = 77;
check('save com totalNights válido: fica como está (77, mesmo com 42 ondas na tentativa)', migrateBastion(comTotal).records.totalNights === 77);
for (const t of [-1, 2.5, Number.NaN]) {
  const x = JSON.parse(j0) as BastionState;
  x.nights = 42;
  x.records.totalNights = t;
  check(`totalNights ${t} (negativo, fracionado ou NaN) vira as ondas vencidas (42)`, migrateBastion(x).records.totalNights === 42);
}
// Construções com placedTurn variado: o valor válido fica, o inválido vira -1.
const comPlacedTurn = (valores: unknown[]) => {
  const x = JSON.parse(j0) as BastionState;
  x.structures = valores.map((placedTurn, i) => ({ id: i + 1, kind: 'wall', x: free[i].x, y: free[i].y, level: 1, hp: 120, invested: 5, placedTurn })) as unknown as Structure[];
  x.nextId = valores.length + 1;
  return migrateBastion(x).structures.map((s) => s.placedTurn);
};
const validos = comPlacedTurn([0, 3, -1]);
check('placedTurn válido (0, 3 e -1) fica como está', validos.join() === '0,3,-1', validos.join());
const invalidos = comPlacedTurn([1.5, -7, Number.NaN, '3', undefined]);
check('placedTurn fracionado, negativo (além do -1), NaN, texto ou ausente vira -1', invalidos.every((t) => t === -1), invalidos.join());
// Save com construções variadas (nível 2, vida parcial, destruída e turnos de construção diferentes).
const fotoEstruturas = (b: BastionState) => b.structures.map((s) => ({ id: s.id, kind: s.kind, level: s.level, hp: s.hp, invested: s.invested, placedTurn: s.placedTurn }));
const bsv = newBastion(7, emptyCollection());
bsv.profile.zeni = 1000;
bsv.projects.push('towers');
bsv.turn = 4;
const rv1 = placeStructure(bsv, env(), 'wall', free[0]);
const rv2 = placeStructure(bsv, env(), 'wall', free[1]);
const rv3 = placeStructure(bsv, env(), 'tower', free[2]);
placeStructure(bsv, env(), 'wall', free[3]);
upgradeStructure(bsv, rv1.ok ? rv1.id : -1);
findStructure(bsv, rv2.ok ? rv2.id : -1)!.hp = 0;
findStructure(bsv, rv3.ok ? rv3.id : -1)!.hp = 40;
bsv.turn = 5;
placeStructure(bsv, env(), 'wall', free[4]);
const fotoAntesDoSave = fotoEstruturas(bsv);
const voltouSave = migrateBastion(JSON.parse(JSON.stringify(bsv)) as BastionState);
check(
  'save e carregar mantém, em cada construção, id, nível, vida, investido e turno de construção',
  JSON.stringify(fotoEstruturas(voltouSave)) === JSON.stringify(fotoAntesDoSave) && voltouSave.turn === 5 && fotoAntesDoSave.length === 5 && fotoAntesDoSave.some((s) => s.level === 2) && fotoAntesDoSave.some((s) => s.hp === 0) && new Set(fotoAntesDoSave.map((s) => s.placedTurn)).size >= 2,
  JSON.stringify(fotoAntesDoSave.map((s) => [s.level, s.hp, s.invested, s.placedTurn])),
);

console.log('\n# 3) Colocação');
const bp = newBastion(7, emptyCollection());
bp.profile.zeni = 1000;
const r1 = placeStructure(bp, env(), 'wall', free[0]);
check('muralha no tile livre: cobra 5 Zen e nasce com vida cheia', r1.ok && bp.profile.zeni === 995 && findStructure(bp, r1.ok ? r1.id : -1)?.hp === 120, r1.ok ? '' : BUILD_MSG[r1.error]);
check('mesmo tile de novo: recusado (ocupado)', errOf(placeStructure(bp, env(), 'wall', free[0])) === 'occupied');
check('torre sem o projeto: recusada (bloqueada)', errOf(placeStructure(bp, env(), 'tower', free[1])) === 'locked');
const bt = newBastion(7, emptyCollection());
bt.profile.zeni = 1000;
bt.projects.push('towers');
check('torre fora da área liberada: recusada (torres só nos lotes)', errOf(placeStructure(bt, env(() => false), 'tower', free[1])) === 'outside');
check('muralha fora da área liberada: aceita (muralhas em qualquer região)', placeStructure(bp, env(() => false), 'wall', free[1]).ok === true);
check('torre no lote: aceita (o lote segue valendo para torre)', placeStructure(bt, env(), 'tower', free[1]).ok === true);
let wallTile: Vec2 | undefined;
for (let y = 0; y < board.height && !wallTile; y++)
  for (let x = 0; x < board.width && !wallTile; x++) if (!board.isWalkable(x, y) && !board.isCity(x, y)) wallTile = { x, y };
check('parede do mapa: recusada (terreno)', !!wallTile && errOf(placeStructure(bp, env(() => true), 'wall', wallTile)) === 'terrain');
const gate = board.cityTiles()[0];
check('portão da cidade: recusado', errOf(placeStructure(bp, env(() => true), 'wall', gate)) === 'city');
check('portal da horda: recusado (raio de segurança)', errOf(placeStructure(bp, env(() => true), 'wall', spawns[0])) === 'spawn');
check('tile com herói: recusado', errOf(placeStructure(bp, env(() => true), 'wall', heroes[0])) === 'hero');
check('muralha fora dos lotes: portão, portal e herói continuam recusados', errOf(placeStructure(bp, env(() => false), 'wall', gate)) === 'city' && errOf(placeStructure(bp, env(() => false), 'wall', spawns[0])) === 'spawn' && errOf(placeStructure(bp, env(() => false), 'wall', heroes[0])) === 'hero');
const bz = newBastion(7, emptyCollection());
bz.profile.zeni = 4;
check('sem Zen para a muralha: recusada e nada é gasto', errOf(placeStructure(bz, env(), 'wall', free[0])) === 'zeni' && bz.profile.zeni === 4 && bz.structures.length === 0);
const sealed = new Board(7, 5);
for (let x = 0; x < 7; x++) sealed.setWall(x, 2);
sealed.setCity(3, 4);
const sealedEnv: BuildEnv = { board: sealed, buildable: () => true, spawns: [{ x: 3, y: 0 }], spawnSafeRadius: 0, heroes: [] };
const bs = newBastion(7, emptyCollection());
bs.profile.zeni = 500;
check('mapa já sem rota dos portais: a muralha ainda é aceita (a colocação não checa rota)', placeStructure(bs, sealedEnv, 'wall', { x: 1, y: 1 }).ok === true);
const fecha = new Board(7, 5);
fecha.setCity(3, 4);
const trancaEnv: BuildEnv = { board: fecha, buildable: () => true, spawns: [{ x: 3, y: 0 }], spawnSafeRadius: 0, heroes: [] };
const bf = newBastion(7, emptyCollection());
bf.profile.zeni = 2000;
const trancou = [0, 1, 2, 3, 4, 5, 6].map((x) => placeStructure(bf, trancaEnv, 'wall', { x, y: 2 }));
const primeiraRecusa = trancou.find((r) => !r.ok);
check('muralhas podem fechar todos os caminhos: a linha inteira (7 muralhas) é aceita', trancou.every((r) => r.ok) && bf.structures.length === 7, primeiraRecusa && !primeiraRecusa.ok ? BUILD_MSG[primeiraRecusa.error] : '');
check('a grade estática segue com rota (muralha não entra na grade)', routeOpen(fecha, [{ x: 3, y: 0 }]));
check('o mapa do Bastião (ponte) tem rota dos portais ao portão', routeOpen(board, spawns));

console.log('\n# 4) Custos, reparo e reembolso');
const bc = newBastion(7, emptyCollection());
bc.profile.zeni = 1000;
const rc = placeStructure(bc, env(), 'wall', free[2]);
const w = findStructure(bc, rc.ok ? rc.id : -1) as Structure;
check('primeira muralha custa 5 Zen (fica registrado no investido)', rc.ok && rc.cost === 5 && w.invested === 5 && bc.profile.zeni === 995);
w.hp = 96; // 20% de perda
check('reparo de 20% custa 1 Zen (piso de 1, arredonda para cima)', repairCostOf(bc, w) === 1);
w.hp = 6; // 95% de perda
const quaseDestruida = repairCostOf(bc, w);
w.hp = 0;
const destruida = repairCostOf(bc, w);
check('quase destruída custa 3 (mais que os 1 de 20% perdidos)', quaseDestruida === 3);
check('destruída: reconstruir (4) custa mais que reparar a quase destruída', destruida === 4 && destruida > quaseDestruida);
let cresce = true;
let nuncaPassaReconstrucao = true;
let anterior = 0;
for (let hp = 120; hp >= 1; hp--) {
  w.hp = hp;
  const c = repairCostOf(bc, w);
  if (c < anterior) cresce = false;
  if (c > destruida) nuncaPassaReconstrucao = false;
  anterior = c;
}
w.hp = 120;
check('muralha intacta não tem reparo (0)', repairCostOf(bc, w) === 0);
check('reparo cresce com o dano e nunca passa da reconstrução', cresce && nuncaPassaReconstrucao);
check('reembolso: muralha inteira devolve metade do investido (3 de 5)', refundOf(bc, w) === 3);
w.hp = 60;
check('reembolso: metade da vida devolve 1 Zen', refundOf(bc, w) === 1);
w.hp = 0;
check('reembolso: destruída não devolve nada', refundOf(bc, w) === 0);
w.hp = 96;
const zeniAntes = bc.profile.zeni;
const rr = repairStructure(bc, w.id);
check('reparo cobra 1 e restaura a vida toda', rr.ok && rr.cost === 1 && bc.profile.zeni === zeniAntes - 1 && w.hp === 120 && !rr.rebuilt, rr.ok ? '' : BUILD_MSG[rr.error]);
check('reparar uma inteira é recusado', errOf(repairStructure(bc, w.id)) === 'intact');
const up = upgradeStructure(bc, w.id);
check('aprimorar 1→2 custa 10 (preço da próxima muralha, com esta contando, × nível 1); vida máxima 180', up.ok && up.cost === 10 && w.level === 2 && w.hp === 180 && w.invested === 15, up.ok ? '' : BUILD_MSG[up.error]);
const up2 = upgradeStructure(bc, w.id);
check('aprimorar 2→3 custa o dobro (20 = preço × nível 2)', up2.ok && up2.cost === 20 && w.level === 3 && w.invested === 35, up2.ok ? '' : BUILD_MSG[up2.error]);
w.hp = 0;
check('aprimorar destruída: recusado', errOf(upgradeStructure(bc, w.id)) === 'destroyed');
w.hp = structureMaxHp(bc, w);
check('nível máximo: recusado', errOf(upgradeStructure(bc, w.id)) === 'maxLevel');
const rm = removeStructure(bc, w.id);
check('remover devolve metade do investido (35 → 18) e tira a construção', rm.ok && rm.refund === 18 && bc.structures.length === 0);

console.log('\n# 5) Projetos');
const bj = newBastion(7, emptyCollection());
bj.profile.zeni = 2000;
check('torres: sem a Arqueira na party, não liberam', errOf(unlockProject(bj, 'towers')) === 'heroNeeded');
bj.party.push('archer');
const ut = unlockProject(bj, 'towers');
check('torres: com a Arqueira, liberam por 200 Zen (permanente)', ut.ok && ut.cost === 200 && bj.profile.zeni === 1800 && bj.projects.includes('towers'));
check('projeto já liberado: recusado', errOf(unlockProject(bj, 'towers')) === 'owned');
check('reforço: exige 2 ondas vencidas', errOf(unlockProject(bj, 'reinforce')) === 'nights');
bj.nights = 2;
check('reforço: libera com 2 ondas e dá +25% de vida à muralha (120 → 150)', unlockProject(bj, 'reinforce').ok && structureMaxHp(bj, { kind: 'wall', level: 1 }) === 150);
check('torre não ganha o bônus da muralha (100)', structureMaxHp(bj, { kind: 'tower', level: 1 }) === 100);
check('projeto que não existe: recusado', errOf(unlockProject(bj, 'forja')) === 'unknownProject');
check('nome herdado do JavaScript (constructor): recusado sem quebrar', errOf(unlockProject(bj, 'constructor')) === 'unknownProject');
const bq = newBastion(7, emptyCollection());
bq.projects = [];
bq.party.push('archer');
bq.profile.zeni = 999;
check('torres sem o castelo: o pré-requisito bloqueia', errOf(unlockProject(bq, 'towers')) === 'requires');

console.log('\n# 6) Ondas, derrota e recomeço do zero');
const bw = newBastion(7, emptyCollection());
bw.profile.zeni = 500;
const wr = placeStructure(bw, env(), 'wall', free[3]);
const wall = findStructure(bw, wr.ok ? wr.id : -1) as Structure;
const waveOf = (zeni: number): WaveResult => ({ souls: 0, zeni, heroes: {}, drops: [] });
const zeniAntesOnda = bw.profile.zeni;
const win: NightOutcome = { victory: true, coreHp: 900, structures: [{ id: wall.id, hp: 40 }], wave: waveOf(60) };
check('onda vencida: recompensa = Zen da onda + bônus de onda limpa', applyNight(bw, win, 'night:1:1', emptyCollection()) !== undefined && bw.profile.zeni === zeniAntesOnda + 60 + GAME_CONFIG.zeni.waveClearBonus);
check('dano da muralha fica registrado (40 de 120)', wall.hp === 40);
check('núcleo perdeu vida (900) e a onda conta', bw.coreHp === 900 && bw.nights === 1 && bw.nightsInAttempt === 1);
const zeniDepois = bw.profile.zeni;
check('mesma chave: não paga nem desconta de novo', applyNight(bw, win, 'night:1:1', emptyCollection()) === undefined && bw.profile.zeni === zeniDepois && bw.coreHp === 900);
const lose: NightOutcome = { victory: false, coreHp: 0, structures: [{ id: wall.id, hp: 0 }], wave: waveOf(20) };
applyNight(bw, lose, 'night:1:2', emptyCollection());
check('derrota: encerra a tentativa e registra o recorde', bw.attemptEnded === true && bw.records.bestNights === 1);
check('derrota: projetos e muralha destruída continuam', bw.projects.includes('castle') && structureStatus(bw, wall) === 'destroyed');
const copiaCaida = JSON.parse(JSON.stringify(bw)) as BastionState;
check('núcleo caído: a derrota também deixa recomeçar do zero (o núcleo volta cheio)', copiaCaida.coreHp === 0 && startAttempt(copiaCaida, emptyCollection()).ok === true && copiaCaida.coreHp === copiaCaida.coreMaxHp);
bw.profile.zeni = 200;
const rcore = repairCore(bw, 100);
check('núcleo: repara 100 de vida por 110 Zen', rcore.ok && rcore.cost === 110 && bw.coreHp === 100);
check('derrota severa: recomeçar abre a tentativa 2 com as noites zeradas', startAttempt(bw, emptyCollection()).ok === true && bw.attempt === 2 && bw.nights === 0 && bw.nightsInAttempt === 0);
check('recomeçar tira a muralha destruída: a cidade volta sem construções', bw.structures.length === 0 && fortificationsOf(bw).length === 0);
check('semente da onda: mesma cidade, mesma semente; muda com a onda', waveSeed(bw) === waveSeed(JSON.parse(JSON.stringify(bw)) as BastionState) && waveSeed(bw) !== waveSeed({ ...bw, nights: bw.nights + 1 }));

console.log('\n# 7) Simulação com as estruturas da cidade');
type Run = { sim: Simulation; hits: number; crits: number; shots: { from: Vec2; to: Vec2 }[] };
function fight(fort: Fortification[]): Run {
  const sim = new Simulation(DEFAULT_SETUP, undefined, {}, { fortifications: fort });
  sim.start();
  const run: Run = { sim, hits: 0, crits: 0, shots: [] };
  while (sim.phase === 'running' && sim.tick < 8000) {
    for (const e of sim.step()) {
      if (e.type === 'objectHit' && e.objectId >= 1000000) run.hits++;
      if (e.type === 'towerShot') run.shots.push({ from: e.from, to: e.to });
      if (e.type === 'damage' && e.source === 'tower' && e.crit) run.crits++;
    }
  }
  return run;
}
const row: Vec2[] = [];
for (let x = 0; x < board.width; x++) if (board.isWalkable(x, 30)) row.push({ x, y: 30 });
const wallLine = row.map((t, i): Fortification => ({ id: 100 + i, kind: 'wall', x: t.x, y: t.y, hp: 120, maxHp: 120 }));
const A = fight(wallLine);
const B = fight(wallLine);
const sA = A.sim.fortificationStates();
const quebradas = sA.filter((s) => s.hp < 120).length;
check('a horda ataca a linha de muralhas (golpes em estruturas)', A.hits > 0 && quebradas > 0, `${A.hits} golpes · ${quebradas} de ${sA.length} blocos perderam vida`);
check('vida das muralhas fica entre 0 e o máximo (destruída = 0)', sA.every((s) => s.hp >= 0 && s.hp <= 120));
check('muralhas da cidade não contam como as do Guerreiro', A.sim.wallsStanding() === 0);
check('mesma cidade e mesma onda: resultado idêntico (determinismo)', JSON.stringify(sA) === JSON.stringify(B.sim.fortificationStates()) && A.sim.tick === B.sim.tick && A.sim.killed === B.sim.killed);

const tiles: Vec2[] = [];
for (let x = 6; x <= 38 && tiles.length < 4; x += 4) if (board.isWalkable(x, 27)) tiles.push({ x, y: 27 });
const towers = tiles.map((t, i): Fortification => ({ id: 200 + i, kind: 'tower', x: t.x, y: t.y, hp: 100, maxHp: 100, shot: { damage: 14, range: 6, cooldownTicks: 12 } }));
const T = fight(towers);
const T2 = fight(towers);
check('torres atiram sozinhas no inimigo', T.shots.length > 0, `${T.shots.length} tiros`);
check('todo tiro cabe no alcance da torre (6 tiles)', T.shots.every((s) => Math.hypot(s.to.x - s.from.x, s.to.y - s.from.y) <= 6 + 1e-6));
check('dano de torre entra no relatório (fonte "tower")', T.sim.report(1).damageDealtByUnit.some((x) => x.kind === 'tower' && x.amount > 0));
check('torre não critica (fonte sem crítico)', T.crits === 0);
check('torres: resultado determinístico', T.shots.length === T2.shots.length && T.sim.tick === T2.sim.tick && T.sim.killed === T2.sim.killed);

const t0 = tiles[0] ?? { x: 10, y: 27 };
const deadTower: Fortification = { id: 300, kind: 'tower', x: t0.x, y: t0.y, hp: 0, maxHp: 100, shot: { damage: 14, range: 6, cooldownTicks: 12 } };
const deadWall: Fortification = { id: 301, kind: 'wall', x: row[0].x, y: row[0].y, hp: 0, maxHp: 120 };
const D = fight([deadTower, deadWall]);
check('destruída não bloqueia o tile e não atira', D.sim.board.isWalkable(deadWall.x, deadWall.y) && D.sim.board.isWalkable(deadTower.x, deadTower.y) && D.shots.length === 0);
check('destruída continua com vida 0 ao fim da onda', D.sim.fortificationStates().every((s) => s.hp === 0));

console.log('\n# 8) Cartas compartilhadas com a campanha');
const cartas = emptyCollection();
addCards(cartas, ['high_orc', 'high_orc', 'requiem']);
const equipou = equipCard(cartas, 'warrior', 'high_orc', 1, 3);
const regrasGuerreiro = cardRuntimeFor('warrior', cartas);
check('carta equipada no guerreiro gera regras de batalha', equipou === undefined && regrasGuerreiro.length >= 1, `${regrasGuerreiro.length} regra(s)`);
const comCartas = newBastion(7, cartas);
const semCartas = newBastion(7, emptyCollection());
check('Bastião: o guerreiro começa com as regras da carta', comCartas.profile.heroes.warrior.cards?.length === regrasGuerreiro.length);
check('sem cartas na coleção, não há regras', semCartas.profile.heroes.warrior.cards?.length === 0);
check('cartas não mexem mais nos atributos (efeito é regra de batalha)', heroStats(comCartas.profile, 'warrior').attrs.str === heroStats(semCartas.profile, 'warrior').attrs.str);
// as regras derivadas trazem o id e o nome da carta (chave e texto); o que não pode ir ao save é o mapa da coleção
check('o save do Bastião guarda só as regras derivadas, não o mapa da coleção', !JSON.stringify(comCartas).includes('"owned"'));
const antesDaDerrota = JSON.stringify(cartas);
const derrota: NightOutcome = { victory: false, coreHp: 900, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } };
applyNight(comCartas, derrota, 'night:1:1', cartas);
check('a derrota no Bastião não mexe na coleção compartilhada', JSON.stringify(cartas) === antesDaDerrota);
equipCard(cartas, 'mage', 'high_orc', 1, 3);
check('equipar no meio da tentativa não muda o Bastião (vale na próxima)', (comCartas.profile.heroes.mage.cards?.length ?? 0) === 0);
const nova = startAttempt(comCartas, cartas);
check('a próxima tentativa copia a coleção nova para o mago', nova.ok && (comCartas.profile.heroes.mage.cards?.length ?? 0) === cardRuntimeFor('mage', cartas).length && comCartas.attempt === 2);
check('a cópia do Bastião bate com o cálculo da campanha', JSON.stringify(comCartas.profile.heroes.mage.cards) === JSON.stringify(cardRuntimeFor('mage', cartas)));

console.log('\n# 9) Preço que dobra com teto, classes, pacotes e slots');
const bx = newBastion(7, emptyCollection());
bx.profile.zeni = 20000;
const precos: number[] = [];
for (let i = 0; i < 4; i++) {
  const antes = bx.profile.zeni;
  const r = placeStructure(bx, env(), 'wall', free[i + 10]);
  precos.push(r.ok ? antes - bx.profile.zeni : -1);
}
check('muralhas custam 5, 10, 20 e 40 (cada uma dobra a próxima)', precos.join(',') === '5,10,20,40', precos.join(','));
check('a próxima muralha custa 80', buildCostOf(bx, 'wall') === 80);
const primeira = bx.structures[0];
primeira.hp = 0;
check('muralha destruída continua contando no preço (80)', buildCostOf(bx, 'wall') === 80);
removeStructure(bx, primeira.id);
check('remover uma muralha faz o preço cair (40)', buildCostOf(bx, 'wall') === 40);
check('torre tem preço fixo (120), mesmo com muralhas na cidade', buildCostOf(bx, 'tower') === 120);
for (let i = 0; i < 5; i++) placeStructure(bx, env(), 'wall', free[i + 20]);
check('com 8 muralhas na cidade, a próxima (1.280) para no teto de 999', buildCostOf(bx, 'wall') === 999);
placeStructure(bx, env(), 'wall', free[25]);
check('o teto segura: com 9 muralhas, a próxima ainda custa 999', buildCostOf(bx, 'wall') === 999);
const alvo = bx.structures[1];
const upAlvo = upgradeStructure(bx, alvo.id);
check('aprimorar 1→2 também tem teto: custa 999', upAlvo.ok && upAlvo.cost === 999, upAlvo.ok ? '' : BUILD_MSG[upAlvo.error]);
const upAlvo2 = upgradeStructure(bx, alvo.id);
check('aprimorar 2→3 também para no teto (999, e não 1.998)', upAlvo2.ok && upAlvo2.cost === 999, upAlvo2.ok ? '' : BUILD_MSG[upAlvo2.error]);

const bh = newBastion(7, emptyCollection());
check('as seis classes entram na party do Bastião', setParty(bh, ['archer', 'sorcerer', 'warlock', 'assassin', 'warrior', 'mage']).ok === true && bh.party.length === 6);
check('party com herói repetido: recusada', errOf(setParty(bh, ['warrior', 'warrior'])) === 'partyDuplicate');
check('party vazia: recusada', errOf(setParty(bh, [])) === 'partySize');
check('party com 7 heróis: recusada', errOf(setParty(bh, ['warrior', 'mage', 'archer', 'sorcerer', 'warlock', 'assassin', 'warrior'])) === 'partySize');

const ondaVencida = (): NightOutcome => ({ victory: true, coreHp: 1000, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } });
const totalCartas = (c: CardCollection) => Object.values(c.owned).reduce((soma, n) => soma + n.reduce((s, x) => s + x, 0), 0);
const bpk = newBastion(7, emptyCollection());
bpk.nights = 98;
bpk.records.totalNights = 98;
const colecaoPacote = emptyCollection();
const q1 = applyNight(bpk, ondaVencida(), 'night:1:1', colecaoPacote);
check('99 ondas vencidas ainda não dão pacote', q1 !== undefined && q1.packs.length === 0 && bpk.nights === 99);
const q2 = applyNight(bpk, ondaVencida(), 'night:1:2', colecaoPacote);
check('a 100ª onda vencida dá um pacote de 5 cartas na coleção compartilhada', q2 !== undefined && q2.packs.length === 1 && q2.packs[0].length === 5 && totalCartas(colecaoPacote) === 5 && bpk.packsGiven === 1);
const q3 = applyNight(bpk, ondaVencida(), 'night:1:2', colecaoPacote);
check('a mesma onda não entrega o pacote de novo', q3 === undefined && totalCartas(colecaoPacote) === 5);
const bderrota = newBastion(7, emptyCollection());
bderrota.nights = 99;
bderrota.records.totalNights = 99;
const q4 = applyNight(bderrota, { victory: false, coreHp: 1000, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } }, 'night:1:3', emptyCollection());
check('derrota não conta para o pacote (continua em 99)', q4 !== undefined && q4.packs.length === 0 && bderrota.nights === 99);
const pacoteDaSemente = (): string => {
  const x = newBastion(99, emptyCollection());
  x.nights = 99;
  x.records.totalNights = 99;
  const c = emptyCollection();
  applyNight(x, ondaVencida(), 'k1', c);
  return JSON.stringify(c.owned);
};
check('mesma semente e mesmo estado: o pacote sai igual (determinismo)', pacoteDaSemente() === pacoteDaSemente());

check('a curva tem 30 degraus (o último é o teto)', CARD_SLOT_WINS.length === 30);
check('as cinco primeiras são fáceis: 5º slot com 6 vitórias', cardSlots(5) === 4 && cardSlots(6) === 5);
check('depois fica bem mais difícil: 10º com 31 vitórias, 30º com 381', cardSlots(30) === 9 && cardSlots(31) === 10 && cardSlots(380) === 29 && cardSlots(381) === 30);
check('Bastião sem ondas vencidas não solta slot', bastionCardSlots(bh) === 0);
bh.nights = 5;
check('ondas da tentativa atual não contam para os slots (só o total de vitórias)', bastionCardSlots(bh) === 0);
bh.records.totalNights = 5;
check('5 vitórias somadas soltam 4 slots', bastionCardSlots(bh) === 4);
check('campanha com 3 vitórias e Bastião com 5 ondas: 3 + 4 = 7 slots (soma)', cardSlotsPool(3, 5) === 7);
check('sem Bastião, o total é o da campanha (3 vitórias = 3 slots)', cardSlotsPool(3) === cardSlots(3) && cardSlots(3) === 3);
check('o total para em 30 slots', cardSlotsPool(400, 400) === 30);

console.log('\n# 10) Mapa do Último Bastião (zona bastionKeep)');
const zonaB = ZONES[BASTION_ZONE_ID];
check('a zona do Bastião existe e tem a camada de construção', zonaB !== undefined && zonaB.lots !== undefined);
const pB = parseZone(zonaB);
check('o mapa tem 61×53 e a camada de construção tem o mesmo tamanho', pB.width === 61 && pB.height === 53 && zonaB.lots!.length === 53 && zonaB.lots!.every((r) => r.length === 61));
const boardB = staticBoard(zonaB);
const partyB: Vec2[] = zonaB.defaultSetup.members.map((m) => ({ x: m.x, y: m.y }));
const envB = bastionBuildEnv(zonaB, partyB, GAME_CONFIG.wave.spawnSafeRadius);
check('todo portal alcança o Emperium sozinho', zonaB.spawnPoints.every((s) => routeOpen(boardB, [s])));
const tatica = pB.lots.filter((l) => l.lot === 'b').length;
check(`área tática para construir: ${tatica} tiles (mínimo 800)`, tatica >= 800);
check('todo tile de construção é andável (sem parede, água nem portão)', pB.lots.every((l) => boardB.isWalkable(l.x, l.y)));
check('quatro lotes especiais (1 a 4) de 9 tiles cada', ['1', '2', '3', '4'].every((d) => pB.lots.filter((l) => l.lot === d).length === 9));
check('a party começa em chão construível', partyB.every((p) => envB.buildable(p.x, p.y) && boardB.isWalkable(p.x, p.y)));
check('estrada e fosso ficam fora da área de construção', !envB.buildable(30, 8) && !envB.buildable(25, 15));
const emperio: Vec2[] = [];
zonaB.map.forEach((linha, y) => [...linha].forEach((ch, x) => { if (ch === 'E') emperio.push({ x, y }); }));
check('o Emperium tem 9 tiles de alvo e nenhum é construível', emperio.length === 9 && emperio.every((t) => !envB.buildable(t.x, t.y)));
check('zonas da campanha não têm camada de construção', parseZone(ZONES.bridge).lots.length === 0);
let erroTamanho = false;
try { parseZone({ ...zonaB, lots: zonaB.lots!.slice(1) }); } catch { erroTamanho = true; }
check('camada com tamanho errado é recusada', erroTamanho);
let erroLetra = false;
try { parseZone({ ...zonaB, lots: zonaB.lots!.map((r, i) => (i === 5 ? `x${r.slice(1)}` : r)) }); } catch { erroLetra = true; }
check('caractere desconhecido na camada é recusado', erroLetra);

const bm = newBastion(11, emptyCollection());
bm.profile.zeni = 500;
check('muralha no lote tático do castelo: aceita', placeStructure(bm, envB, 'wall', { x: 26, y: 22 }).ok === true);
check('muralha no lote especial 1: aceita', placeStructure(bm, envB, 'wall', { x: 24, y: 20 }).ok === true);
check('muralha na estrada colada ao portal (30,8): recusada (raio de segurança)', errOf(placeStructure(bm, envB, 'wall', { x: 30, y: 8 })) === 'spawn');
check('muralha na estrada (30,10), fora dos lotes: aceita', placeStructure(bm, envB, 'wall', { x: 30, y: 10 }).ok === true);
check('muralha na água do fosso: recusada (terreno)', errOf(placeStructure(bm, envB, 'wall', { x: 25, y: 15 })) === 'terrain');
const bmT = newBastion(11, emptyCollection());
bmT.profile.zeni = 500;
bmT.projects.push('towers');
check('torre na estrada (30,10), fora dos lotes: recusada', errOf(placeStructure(bmT, envB, 'tower', { x: 30, y: 10 })) === 'outside');

// Teste de fumaça: a horda nasce nos portais, anda pelas estradas e chega ao portão ou morre (o mapa não trava).
applyZone(zonaB, { count: 40, boss: null, seed: 4242 });
const simB = new Simulation(zonaB.defaultSetup, 4242);
simB.start();
let nasceram = 0;
let andaram = 0;
let mortes = 0;
for (let i = 0; i < 2400 && simB.phase === 'running'; i++) {
  for (const e of simB.step()) {
    if (e.type === 'spawn') nasceram++;
    if (e.type === 'move') andaram++;
    if (e.type === 'death') mortes++;
  }
}
const chegadas = Object.values(simB.reachedByKind).reduce((soma, n) => soma + n, 0);
check('a horda nasce nos portais e anda pelas estradas', nasceram > 0 && andaram > 0, `${nasceram} nascimentos · ${andaram} passos`);
check('a horda interage com a defesa (mortes ou chegadas ao portão)', mortes + chegadas > 0, `${mortes} mortes · ${chegadas} chegadas`);

console.log('\n# 11) Emperium: dano de contato (vida atual × força ÷ 30) e campanha sem mudança');
check('comum cheio (30 de vida, força 3) causa 3, como na campanha', emperiumDamage('grunt', 30) === 3);
check('comum ferido (15 de vida) causa 2 (arredonda)', emperiumDamage('grunt', 15) === 2);
check('pesado (85 de vida, força 8) causa 23', emperiumDamage('brute', 85) === 23);
check('raydric (110 de vida, força 9) causa 33', emperiumDamage('raydric', 110) === 33);
check('mais vida, mais dano: o mesmo tipo com 60 de vida causa mais que com 30', emperiumDamage('grunt', 60) > emperiumDamage('grunt', 30));
check('mais força, mais dano: com a mesma vida, um pesado causa mais que um comum', emperiumDamage('brute', 30) > emperiumDamage('grunt', 30));
check('criatura quase morta ainda causa 1 (mínimo)', emperiumDamage('runner', 1) === 1);
check('tipo fora da tabela usa a ameaça padrão (3)', emperiumDamage('desconhecido', 30) === 3);

type Invasao = { unitId: number; damage: number };
function rodarCidade(sim: Simulation): { vistos: Map<number, Unit>; invasoes: Invasao[]; r: ReturnType<Simulation['report']> } {
  const vistos = new Map<number, Unit>();
  const invasoes: Invasao[] = [];
  sim.start();
  while (sim.phase === 'running' && sim.tick < 8000) {
    for (const u of sim.units.values()) if (u.team !== 'party') vistos.set(u.id, u);
    for (const e of sim.step()) if (e.type === 'cityHit' && e.unitId >= 0) invasoes.push({ unitId: e.unitId, damage: e.damage });
  }
  return { vistos, invasoes, r: sim.report(1) };
}
applyZone(zonaB, { count: 40, boss: null, seed: 4242 });
const cidadeB = rodarCidade(new Simulation(zonaB.defaultSetup, 4242, {}, { contactDamage: (u) => emperiumDamage(u.kind, u.hp) }));
const confereB = cidadeB.invasoes.every((e) => {
  const u = cidadeB.vistos.get(e.unitId);
  return u !== undefined && !u.alive && e.damage === emperiumDamage(u.kind, u.hp);
});
check('Emperium: cada invasor morre ao tocar e desconta vida × força ÷ 30', cidadeB.invasoes.length > 0 && confereB, `${cidadeB.invasoes.length} toques`);
check('Emperium: a vida da cidade cai exatamente pelo dano de contato', cidadeB.r.cityHpRemaining === Math.max(0, GAME_CONFIG.cityDefense.maxHp - cidadeB.r.cityDamageTaken));
applyZone(ZONES.bridge);
const cidadeP = rodarCidade(new Simulation(DEFAULT_SETUP));
const confereP = cidadeP.invasoes.every((e) => {
  const u = cidadeP.vistos.get(e.unitId);
  return u !== undefined && e.damage === (GAME_CONFIG.cityDefense.threat[u.kind] ?? GAME_CONFIG.cityDefense.defaultThreat);
});
check('campanha: o invasor segue descontando a ameaça por tipo (sem a regra do Emperium)', cidadeP.invasoes.length > 0 && confereP, `${cidadeP.invasoes.length} invasões`);

console.log('\n# 12) Turnos e muralhas recentes (mover no turno)');
const bt12 = newBastion(7, emptyCollection());
bt12.profile.zeni = 1000;
bt12.projects.push('towers');
const longe: Vec2[] = [];
for (let y = 0; y < board.height; y++)
  for (let x = 0; x < board.width; x++) {
    const p = { x, y };
    if (board.isWalkable(x, y) && !board.isCity(x, y) && !nearSpawn(p) && !inArea(x, y) && !heroes.some((h) => h.x === x && h.y === y)) longe.push(p);
  }
const dentro = placeStructure(bt12, env(), 'wall', free[0]);
const foraDosLotes = placeStructure(bt12, env(), 'wall', longe[0]);
const wD = dentro.ok ? dentro.id : -1;
const wF = foraDosLotes.ok ? foraDosLotes.id : -1;
const sD = findStructure(bt12, wD) as Structure;
const sF = findStructure(bt12, wF) as Structure;
check('muralhas no lote e fora dos lotes nascem no turno 0 (placedTurn = turno atual)', sD?.placedTurn === 0 && sF?.placedTurn === 0 && bt12.turn === 0);
check('muralha recém-construída pode ser movida', isMovable(bt12, sD));
// Muralha com nível 2 e vida parcial antes de mover: mover não pode mexer em id, vida, nível, investido nem turno.
const upD = upgradeStructure(bt12, wD);
sD.hp = 50;
const antesDeMover = { id: sD.id, hp: sD.hp, level: sD.level, invested: sD.invested, placedTurn: sD.placedTurn };
check('muralha de teste fica com nível 2 e vida parcial antes de mover', upD.ok && antesDeMover.level === 2 && antesDeMover.hp === 50, upD.ok ? '' : BUILD_MSG[upD.error]);
const zeniMov = bt12.profile.zeni;
bt12.profile.zeni = 0;
const mv1 = moveStructure(bt12, env(), wD, free[5]);
bt12.profile.zeni = zeniMov;
check('mover é de graça: sem Zen nenhum, a muralha recente se move', mv1.ok && mv1.from.x === free[0].x && mv1.from.y === free[0].y && sD.x === free[5].x && sD.y === free[5].y, mv1.ok ? '' : BUILD_MSG[mv1.error]);
const mv2 = moveStructure(bt12, env(), wD, free[6]);
check('repetir o movimento no mesmo turno vale, e a muralha mantém o turno de construção', mv2.ok && sD.placedTurn === 0 && isMovable(bt12, sD), mv2.ok ? '' : BUILD_MSG[mv2.error]);
const depoisDeMover = { id: sD.id, hp: sD.hp, level: sD.level, invested: sD.invested, placedTurn: sD.placedTurn };
check('mover (duas vezes) mantém id, vida, nível, investido e turno de construção', JSON.stringify(depoisDeMover) === JSON.stringify(antesDeMover), `${JSON.stringify(antesDeMover)} → ${JSON.stringify(depoisDeMover)}`);
check('mover para o próprio tile: recusado (mesmo tile)', errOf(moveStructure(bt12, env(), wD, free[6])) === 'sameTile');
check('mover para tile com outra construção: recusado (ocupado)', errOf(moveStructure(bt12, env(), wD, longe[0])) === 'occupied');
check('mover para cima de herói: recusado', errOf(moveStructure(bt12, env(), wD, heroes[0])) === 'hero');
check('mover para o portal: recusado (raio de segurança)', errOf(moveStructure(bt12, env(), wD, spawns[0])) === 'spawn');
check('mover para o portão: recusado', errOf(moveStructure(bt12, env(), wD, gate)) === 'city');
check('mover para parede do mapa: recusado (terreno)', errOf(moveStructure(bt12, env(), wD, wallTile as Vec2)) === 'terrain');
check('mover para fora dos lotes: aceito (muralha vale em qualquer região)', moveStructure(bt12, env(), wD, longe[2]).ok === true);
check('mover de volta para dentro de um lote: aceito', moveStructure(bt12, env(), wD, free[7]).ok === true);
check('mover muralha que está fora dos lotes para dentro: aceito', moveStructure(bt12, env(), wF, free[8]).ok === true);
check('construção inexistente: recusada (ausente)', errOf(moveStructure(bt12, env(), 99999, free[9])) === 'missing');
const tor = placeStructure(bt12, env(), 'tower', free[12]);
const wT = tor.ok ? tor.id : -1;
check('torre não se move, nem no turno em que foi construída', !isMovable(bt12, findStructure(bt12, wT) as Structure) && errOf(moveStructure(bt12, env(), wT, free[13])) === 'notMovable', tor.ok ? '' : BUILD_MSG[tor.error]);
const dest = placeStructure(bt12, env(), 'wall', free[15]);
const wX = dest.ok ? dest.id : -1;
const sX = findStructure(bt12, wX) as Structure;
sX.hp = 0;
check('muralha destruída não se move (vida 0)', !isMovable(bt12, sX) && errOf(moveStructure(bt12, env(), wX, free[16])) === 'notMovable');
check('mover não avança o turno', bt12.turn === 0);
check('noite aplicada avança o turno (0 → 1)', applyNight(bt12, ondaVencida(), 'noite:1', emptyCollection()) !== undefined && bt12.turn === 1);
check('a muralha do turno anterior não se move mais e fica no lugar', errOf(moveStructure(bt12, env(), wD, free[18])) === 'notRecent' && !isMovable(bt12, sD) && sD.x === free[7].x && sD.y === free[7].y);
const novaT1 = placeStructure(bt12, env(), 'wall', free[19]);
const wN = novaT1.ok ? novaT1.id : -1;
check('muralha construída no turno 1 é recente e se move no próprio turno', novaT1.ok && isMovable(bt12, findStructure(bt12, wN) as Structure) && moveStructure(bt12, env(), wN, free[20]).ok === true);
check('mesma chave de noite: não avança o turno de novo', applyNight(bt12, ondaVencida(), 'noite:1', emptyCollection()) === undefined && bt12.turn === 1);
check('outra noite vencida: turno 2', applyNight(bt12, ondaVencida(), 'noite:2', emptyCollection()) !== undefined && bt12.turn === 2);
check('a muralha do turno 1 virou antiga no turno 2', errOf(moveStructure(bt12, env(), wN, free[21])) === 'notRecent');
const derrotaT = applyNight(bt12, { victory: false, coreHp: 900, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } }, 'noite:3', emptyCollection());
check('derrota não avança o turno (continua 2) e encerra a tentativa', derrotaT !== undefined && bt12.turn === 2 && bt12.attemptEnded === true);
const salvoBt12 = migrateBastion(JSON.parse(JSON.stringify(bt12)) as BastionState);
check('o turno sobrevive ao salvar e carregar', salvoBt12.turn === 2);
check(
  'save e carregar da cidade da seção 12 mantém, em cada construção, id, nível, vida, investido e turno de construção',
  JSON.stringify(fotoEstruturas(salvoBt12)) === JSON.stringify(fotoEstruturas(bt12)) && bt12.structures.some((s) => s.hp === 0) && bt12.structures.some((s) => s.placedTurn !== bt12.turn),
  `${bt12.structures.length} construções`,
);

console.log('\n# 13) Horda por noite (comum, mini-chefe e MVP)');
// Tipos só da campanha: não entram na horda do Bastião (o palhaço vive nos Campos Cinzentos, Ato III).
const SO_CAMPANHA = ['palhaco', 'detarderus'];
const SO_LENDARIO = ['satanMorroc'];
const INIMIGOS = Object.keys(GAME_CONFIG.enemies).filter((k) => k !== 'trainingDummy' && !SO_CAMPANHA.includes(k) && !SO_LENDARIO.includes(k));
check('são 13 inimigos de combate do Bastião (tudo menos o boneco de treino, os tipos só da campanha e o chefe lendário)', INIMIGOS.length === 13 && !INIMIGOS.includes('trainingDummy'), `${INIMIGOS.length}`);
check(
  'o palhaço é só da campanha: está na mistura dos Campos Cinzentos e fora da horda do Bastião',
  ZONES.ashenFields.wave.mix.some((m) => m.kind === 'palhaco') && !JSON.stringify(BASTION_HORDE).includes('palhaco') && SO_CAMPANHA.every((k) => k in GAME_CONFIG.enemies),
);
check('todo inimigo de combate tem nome em pt-BR no Bastião', INIMIGOS.every((k) => !!BASTION_HORDE.names[k]));
check('mini-chefes e MVPs existem na tabela de inimigos', [...BASTION_HORDE.minis, ...BASTION_HORDE.mvps].every((k) => k in GAME_CONFIG.enemies));
check('cadência: mini a cada 5, MVP a cada 10, tropa comum de 60', BASTION_HORDE.miniEvery === 5 && BASTION_HORDE.mvpEvery === 10 && BASTION_HORDE.count === 60);
check('noites 5, 15 e 25 são mini-chefe; 10, 20 e 30 são MVP', [5, 15, 25].every((n) => hordeOf(n).tier === 'mini') && [10, 20, 30].every((n) => hordeOf(n).tier === 'mvp'));
const ateTrinta = Array.from({ length: 30 }, (_, i) => i + 1);
check('as outras noites até 30 são comuns, sem chefe', ateTrinta.filter((n) => n % 5 !== 0).every((n) => hordeOf(n).tier === 'comum' && hordeOf(n).boss === undefined));
check('até a noite 30: 3 mini-chefes e 3 MVPs', ateTrinta.filter((n) => hordeOf(n).tier === 'mini').length === 3 && ateTrinta.filter((n) => hordeOf(n).tier === 'mvp').length === 3);
check('ciclo dos mini-chefes na ordem declarada: 5 Elite, 15 Krexx pequeno, 25 Krexx retorcido', hordeOf(5).boss === 'elite' && hordeOf(15).boss === 'goblinImp' && hordeOf(25).boss === 'goblinWarlord');
check('ciclo dos mini-chefes segue: 35 Dino, 45 Líder goblin, 55 volta ao Elite', hordeOf(35).boss === 'dinoBoss' && hordeOf(45).boss === 'goblinLeader' && hordeOf(55).boss === 'elite');
// Sequência completa das noites 5 a 55 (as de MVP ficam de fora), contra a lista declarada em BASTION_HORDE.minis.
const noites5a55 = Array.from({ length: 55 }, (_, i) => i + 1).filter((n) => hordeOf(n).tier === 'mini');
const esperadoMini5a55 = ['elite', 'goblinImp', 'goblinWarlord', 'dinoBoss', 'goblinLeader', 'elite'];
const sequencia5a55 = noites5a55.map((n) => `${n} ${BASTION_HORDE.names[hordeOf(n).boss ?? '']}`);
check(
  'sequência dos mini-chefes nas noites 5 a 55 segue a ordem declarada (MVP fora)',
  noites5a55.join() === '5,15,25,35,45,55' && noites5a55.map((n) => hordeOf(n).boss).join() === esperadoMini5a55.join() && esperadoMini5a55.every((k, i) => k === BASTION_HORDE.minis[i % BASTION_HORDE.minis.length]),
  sequencia5a55.join(' · '),
);
// Os dois ciclos seguem em ordem por 500 noites: mini k pega minis[(k − 1) mod], MVP m pega mvps[(m − 1) mod].
let minisEmOrdem = true;
let mvpsEmOrdem = true;
let nMini = 0;
let nMvp = 0;
let nLenda = 0;
let lendasEmOrdem = true;
for (let n = 1; n <= 500; n++) {
  const h = hordeOf(n);
  if (h.tier === 'mini') {
    nMini++;
    if (h.boss !== BASTION_HORDE.minis[(nMini - 1) % BASTION_HORDE.minis.length]) minisEmOrdem = false;
  }
  if (h.tier === 'mvp') {
    nMvp++;
    // o MVP pega pelo número da noite (n / mvpEvery − 1): as noites de lenda não entram nesse ciclo
    if (h.boss !== BASTION_HORDE.mvps[(n / BASTION_HORDE.mvpEvery - 1) % BASTION_HORDE.mvps.length]) mvpsEmOrdem = false;
  }
  if (h.tier === 'lenda') {
    nLenda++;
    if (h.boss !== BASTION_HORDE.legends[(nLenda - 1) % BASTION_HORDE.legends.length]) lendasEmOrdem = false;
  }
}
check('ciclos em ordem até a noite 500 (50 minis, 45 MVPs e 5 lendas: a noite 100 de cada dez vira lenda)', minisEmOrdem && mvpsEmOrdem && lendasEmOrdem && nMini === 50 && nMvp === 45 && nLenda === 5, `${nMini} minis · ${nMvp} MVPs · ${nLenda} lendas`);
// horde.ts conta os mini-chefes tirando as noites de MVP: isso só fecha se o MVP cair sempre em múltiplo de mini.
check('mvpEvery é múltiplo de miniEvery (a conta de k em horde.ts depende disso)', BASTION_HORDE.mvpEvery % BASTION_HORDE.miniEvery === 0 && BASTION_HORDE.minis.length > 0, `${BASTION_HORDE.mvpEvery} % ${BASTION_HORDE.miniEvery}`);
check('ciclo dos MVPs: 10 Colosso da Clareira, 20 Colosso Solar, 30 Senhor Orc, 40 volta ao primeiro', hordeOf(10).boss === 'boss' && hordeOf(20).boss === 'boss2' && hordeOf(30).boss === 'orcboss' && hordeOf(40).boss === 'boss' && hordeOf(50).boss === 'boss2');
check('noite 100 é de chefe lendário, no lugar do MVP e do mini-chefe', hordeOf(100).tier === 'lenda' && hordeOf(100).boss === 'satanMorroc' && hordeOf(100).title === 'Noite 100 · lenda', hordeOf(100).title);
check('noites 99 e 101 não são lendárias', hordeOf(99).tier !== 'lenda' && hordeOf(101).tier !== 'lenda');
check('noite 200 volta a ser lendária (o ciclo tem um chefe)', hordeOf(200).tier === 'lenda' && hordeOf(200).boss === 'satanMorroc');
check('chefe lendário tem stats na simulação e nome em pt-BR', !!GAME_CONFIG.enemies.satanMorroc && BASTION_HORDE.names.satanMorroc === 'Senhor do Abismo');
check('a cada 100 noites é múltiplo do MVP (lenda substitui MVP sem quebrar o ciclo)', BASTION_HORDE.legendEvery % BASTION_HORDE.mvpEvery === 0);
const vistosAte = (ate: number) => {
  const vistos = new Set<string>();
  for (let n = 1; n <= ate; n++) {
    const h = hordeOf(n);
    for (const m of h.mix) vistos.add(m.kind);
    if (h.boss) vistos.add(h.boss);
  }
  return vistos;
};
const faltamAte30 = INIMIGOS.filter((k) => !vistosAte(30).has(k));
check('até a noite 30 faltam dinoBoss e goblinLeader (entram nas noites 35 e 45)', [...faltamAte30].sort().join() === 'dinoBoss,goblinLeader', faltamAte30.join());
check('até a noite 40 falta só o Líder goblin (noite 45)', INIMIGOS.filter((k) => !vistosAte(40).has(k)).join() === 'goblinLeader');
check('até a noite 45 aparecem os 13 inimigos (a rotação completa dos mini-chefes)', INIMIGOS.every((k) => vistosAte(45).has(k)) && !vistosAte(45).has('trainingDummy'));
const peso = (k: string) => BASTION_HORDE.regular.find((m) => m.kind === k)?.weight ?? 0;
const somaComum = BASTION_HORDE.regular.reduce((soma, m) => soma + m.weight, 0);
check('mistura comum: grunt 40, runner 24, brute 14, raydric 12, necro 10 (soma 100)', somaComum === 100 && peso('grunt') === 40 && peso('runner') === 24 && peso('brute') === 14 && peso('raydric') === 12 && peso('necro') === 10);
check('a mistura comum só tem tipos comuns (nada de chefe)', BASTION_HORDE.regular.every((m) => ['grunt', 'runner', 'brute', 'raydric', 'necro'].includes(m.kind)));
check('toda noite traz 60 comuns', Array.from({ length: 45 }, (_, i) => hordeOf(i + 1)).every((h) => h.count === 60));
check('mini e MVP também usam a mistura comum (o chefe vem por cima)', JSON.stringify(hordeOf(5).mix) === JSON.stringify(BASTION_HORDE.regular) && JSON.stringify(hordeOf(10).mix) === JSON.stringify(BASTION_HORDE.regular));
check('título e detalhe do mini-chefe: "Noite 5 · mini-chefe" e o Elite', hordeOf(5).title === 'Noite 5 · mini-chefe' && hordeOf(5).detail === BASTION_HORDE.names.elite);
check('mini-chefe da noite 15: detalhe "Krexx pequeno"', hordeOf(15).detail === 'Krexx pequeno');
check('MVP da noite 10: "Noite 10 · MVP" e o Colosso da Clareira', hordeOf(10).title === 'Noite 10 · MVP' && hordeOf(10).detail === 'Colosso da Clareira');
check('noite comum: título "Noite 1 · comum" e detalhe com a tropa em pt-BR', hordeOf(1).title === 'Noite 1 · comum' && hordeOf(1).detail === 'Zumbi, Corredor, Pesado, Raydric e Necromante', hordeOf(1).detail);
check('mesma noite, mesma horda (determinismo, sem sorteio)', JSON.stringify(hordeOf(15)) === JSON.stringify(hordeOf(15)) && JSON.stringify(hordeOf(33)) === JSON.stringify(hordeOf(33)));
const copia = hordeOf(1);
copia.mix[0].weight = 999;
check('a horda devolvida é cópia: mexer nela não muda a tabela', peso('grunt') === 40 && hordeOf(1).mix[0].weight === 40);
check('noite inválida (0 ou NaN) cai na noite 1', hordeOf(0).wave === 1 && hordeOf(Number.NaN).wave === 1);

console.log('\n# 14) Recomeçar do zero (a derrota zera a cidade e os heróis; o total de vitórias não zera)');
const semNada = (): NightOutcome => ({ victory: false, coreHp: 0, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } });
const vitoria = (): NightOutcome => ({ victory: true, coreHp: BASTION.coreMaxHp, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } });
const cartasR = emptyCollection();
addCards(cartasR, ['high_orc', 'high_orc', 'requiem']);
equipCard(cartasR, 'warrior', 'high_orc', 1, 3);
const antesCartas = JSON.stringify(cartasR);
const rec = newBastion(7, cartasR, ['warrior', 'archer']);
rec.profile.zeni = 5000;
rec.projects.push('towers');
const paredeR = placeStructure(rec, env(), 'wall', free[0]);
const torreR = placeStructure(rec, env(), 'tower', free[1]);
check('antes da derrota: muralha e torre na cidade, núcleo de pé', paredeR.ok && torreR.ok && rec.structures.length === 2 && rec.coreHp === rec.coreMaxHp);
rec.profile.heroes.warrior.level = 6;
rec.profile.heroes.warrior.points = 4;
for (let i = 1; i <= 3; i++) applyNight(rec, vitoria(), `rec:v${i}`, cartasR);
applyNight(rec, semNada(), 'rec:d', cartasR);
check('derrota: a tentativa acaba, o núcleo cai e o turno para na 3ª vitória', rec.attemptEnded === true && rec.coreHp === 0 && rec.turn === 3 && rec.nights === 3 && rec.records.totalNights === 3);
check('derrota com a mesma chave: não avança o turno nem paga de novo', applyNight(rec, semNada(), 'rec:d', cartasR) === undefined && rec.turn === 3);
check('o núcleo caído não impede recomeçar do zero', rec.coreHp === 0 && startAttempt(rec, cartasR).ok === true);
check('recomeço: tentativa 2, noites zeradas, núcleo cheio, sem construções e de volta ao castelo', rec.attempt === 2 && rec.records.attempts === 2 && rec.nights === 0 && rec.nightsInAttempt === 0 && rec.coreHp === rec.coreMaxHp && rec.structures.length === 0 && rec.projects.join() === 'castle' && rec.attemptEnded === false);
check('recomeço: Zen inicial, heróis no nível 1 sem XP nem pontos, equipamento de origem', rec.profile.zeni === BASTION.startZeni && Object.values(rec.profile.heroes).every((h) => h.level === 1 && h.exp === 0 && h.points === 0) && JSON.stringify(rec.profile.heroes.warrior.equipment) === JSON.stringify(createProfile().heroes.warrior.equipment));
check('recomeço: a coleção compartilhada fica igual e as cartas voltam a valer no guerreiro', JSON.stringify(cartasR) === antesCartas && (rec.profile.heroes.warrior.cards?.length ?? 0) >= 1 && JSON.stringify(rec.profile.heroes.warrior.cards) === JSON.stringify(cardRuntimeFor('warrior', cartasR)));
check('recomeço: party escolhida, semente e turno ficam; a horda volta à noite 1', rec.party.join() === 'warrior,archer' && rec.seed === 7 && rec.turn === 3 && hordeOf(rec.nights + 1).wave === 1);
check('recordes: melhor sequência 3, tentativas 2 e total de vitórias 3 (nada disso zera)', rec.records.bestNights === 3 && rec.records.attempts === 2 && rec.records.totalNights === 3 && rec.version === 1);
check('recomeçar com a tentativa rodando é recusado', errOf(startAttempt(rec, cartasR)) === 'attemptRunning');
applyNight(rec, vitoria(), 'rec2:v1', cartasR);
applyNight(rec, semNada(), 'rec2:d', cartasR);
check('tentativa mais curta não tira a melhor sequência (segue 3); a vitória seguinte avança o turno (4)', rec.records.bestNights === 3 && rec.nights === 1 && rec.turn === 4 && rec.records.totalNights === 4);
const pac14 = newBastion(7, emptyCollection());
const colecao14 = emptyCollection();
let pacotes14 = 0;
for (let i = 1; i <= 60; i++) pacotes14 += applyNight(pac14, vitoria(), `p14:a${i}`, colecao14)?.packs.length ?? 0;
applyNight(pac14, semNada(), 'p14:derrota', colecao14);
check('60 vitórias na tentativa 1: 13 slots e nenhum pacote ainda', bastionCardSlots(pac14) === 13 && pacotes14 === 0, `${bastionCardSlots(pac14)} slots`);
check('recomeçar do zero não derruba os slots (a horda volta à noite 1; o total segue em 60)', startAttempt(pac14, colecao14).ok === true && pac14.nights === 0 && bastionCardSlots(pac14) === 13);
for (let i = 1; i <= 39; i++) pacotes14 += applyNight(pac14, vitoria(), `p14:b${i}`, colecao14)?.packs.length ?? 0;
check('99 vitórias somadas entre as duas tentativas: ainda nenhum pacote', pacotes14 === 0 && pac14.records.totalNights === 99 && pac14.nights === 39);
const cemesima = applyNight(pac14, vitoria(), 'p14:b40', colecao14);
check('a 100ª vitória, já na tentativa 2, entrega um pacote de 5 cartas', cemesima?.packs.length === 1 && cemesima.packs[0].length === 5 && pac14.packsGiven === 1 && totalCartas(colecao14) === 5);
check('com 100 vitórias somadas: 16 slots', bastionCardSlots(pac14) === cardSlots(100) && cardSlots(100) === 16);

console.log(failures ?`\n${failures} checagem(ns) falharam.` : '\nTodas as checagens do Último Bastião passaram.');
if (failures) throw new Error(`bastionCheck: ${failures} falha(s)`);
