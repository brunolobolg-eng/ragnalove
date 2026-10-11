/**
 * Checagem headless do Último Bastião (sem renderização). Rode: npm run bastion:check
 * 1) Dados · 2) Estado e migração · 3) Colocação · 4) Custos, reparo e reembolso · 5) Projetos ·
 * 6) Ondas (idempotência, derrota e socorro) · 7) Simulação (muralhas quebráveis, torres, destruídas) ·
 * 8) Cartas compartilhadas · 9) Preço, teto, classes, pacotes e slots · 10) Mapa do Último Bastião (bastionKeep).
 */
import { BASTION, BASTION_ZONE_ID, PROJECTS, PROJECT_IDS, STRUCTURES } from '../src/config/bastion';
import { CARD_SLOT_WINS, addCards, cardBonusFor, cardSlots, cardSlotsPool, emptyCollection, equipCard, type CardCollection } from '../src/core/progression/cards';
import { heroStats } from '../src/core/progression/profile';
import { DEFAULT_SETUP, GAME_CONFIG, applyZone } from '../src/config/gameConfig';
import { ZONES, parseZone } from '../src/config/zones';
import type { WaveResult } from '../src/core/progression/profile';
import { findStructure, migrateBastion, newBastion, structureMaxHp, structureStatus, type BastionState, type Structure } from '../src/core/bastion/bastion';
import {
  BUILD_MSG,
  applyNight,
  bastionCardSlots,
  buildCostOf,
  setParty,
  fortificationsOf,
  placeStructure,
  refundOf,
  removeStructure,
  repairCore,
  repairCostOf,
  repairStructure,
  rescueIfStuck,
  startAttempt,
  unlockProject,
  upgradeStructure,
  waveSeed,
  type BuildEnv,
  type NightOutcome,
  type Result,
} from '../src/core/bastion/rules';
import { bastionBuildEnv, routeOpen, staticBoard } from '../src/core/bastion/route';
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

console.log('\n# 3) Colocação');
const bp = newBastion(7, emptyCollection());
bp.profile.zeni = 1000;
const r1 = placeStructure(bp, env(), 'wall', free[0]);
check('muralha no tile livre: cobra 5 Zen e nasce com vida cheia', r1.ok && bp.profile.zeni === 995 && findStructure(bp, r1.ok ? r1.id : -1)?.hp === 120, r1.ok ? '' : BUILD_MSG[r1.error]);
check('mesmo tile de novo: recusado (ocupado)', errOf(placeStructure(bp, env(), 'wall', free[0])) === 'occupied');
check('torre sem o projeto: recusada (bloqueada)', errOf(placeStructure(bp, env(), 'tower', free[1])) === 'locked');
check('fora da área liberada: recusada', errOf(placeStructure(bp, env(() => false), 'wall', free[1])) === 'outside');
let wallTile: Vec2 | undefined;
for (let y = 0; y < board.height && !wallTile; y++)
  for (let x = 0; x < board.width && !wallTile; x++) if (!board.isWalkable(x, y) && !board.isCity(x, y)) wallTile = { x, y };
check('parede do mapa: recusada (terreno)', !!wallTile && errOf(placeStructure(bp, env(() => true), 'wall', wallTile)) === 'terrain');
const gate = board.cityTiles()[0];
check('portão da cidade: recusado', errOf(placeStructure(bp, env(() => true), 'wall', gate)) === 'city');
check('portal da horda: recusado (raio de segurança)', errOf(placeStructure(bp, env(() => true), 'wall', spawns[0])) === 'spawn');
check('tile com herói: recusado', errOf(placeStructure(bp, env(() => true), 'wall', heroes[0])) === 'hero');
const bz = newBastion(7, emptyCollection());
bz.profile.zeni = 4;
check('sem Zen para a muralha: recusada e nada é gasto', errOf(placeStructure(bz, env(), 'wall', free[0])) === 'zeni' && bz.profile.zeni === 4 && bz.structures.length === 0);
const sealed = new Board(7, 5);
for (let x = 0; x < 7; x++) sealed.setWall(x, 2);
sealed.setCity(3, 4);
const sealedEnv: BuildEnv = { board: sealed, buildable: () => true, spawns: [{ x: 3, y: 0 }], spawnSafeRadius: 0, heroes: [] };
const bs = newBastion(7, emptyCollection());
bs.profile.zeni = 500;
check('rota cortada pelo próprio mapa: recusada', errOf(placeStructure(bs, sealedEnv, 'wall', { x: 1, y: 1 })) === 'route');
const open = new Board(7, 5);
open.setCity(3, 4);
check('rota aberta: a mesma colocação passa', placeStructure(bs, { ...sealedEnv, board: open }, 'wall', { x: 1, y: 1 }).ok === true);
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

console.log('\n# 6) Ondas, derrota e socorro');
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
check('núcleo caído: não começa outra tentativa', errOf(startAttempt(bw, emptyCollection())) === 'coreDown');
bw.profile.zeni = 0;
check('socorro: sem Zen nem para o reparo mínimo, a cidade ganha Zen', rescueIfStuck(bw) === BASTION.rescue.zeni && bw.profile.zeni === BASTION.rescue.zeni);
check('socorro: não repete na mesma tentativa', rescueIfStuck(bw) === 0);
const rcore = repairCore(bw, 100);
check('núcleo: repara 100 de vida por 110 Zen', rcore.ok && rcore.cost === 110 && bw.coreHp === 100);
check('derrota severa: a tentativa 2 começa com a cidade como estava', startAttempt(bw, emptyCollection()).ok === true && bw.attempt === 2 && bw.nightsInAttempt === 0);
check('muralha destruída segue destruída na tentativa 2', structureStatus(bw, wall) === 'destroyed' && fortificationsOf(bw)[0].hp === 0);
check('reconstruir a muralha custa 4 (investido 5 × 0,8)', repairCostOf(bw, wall) === 4);
bw.coreHp = 0;
bw.attemptEnded = true;
bw.profile.zeni = 0;
check('socorro: ainda no intervalo de 2 tentativas', rescueIfStuck(bw) === 0);
bw.attempt = 3;
check('socorro: volta a valer na tentativa 3', rescueIfStuck(bw) === BASTION.rescue.zeni);
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
const equipou = equipCard(cartas, 'warrior', 'high_orc', 3);
check('carta equipada no guerreiro (+3 de Força, afinidade cheia)', equipou === undefined && cardBonusFor('warrior', cartas).str === 3);
const comCartas = newBastion(7, cartas);
const semCartas = newBastion(7, emptyCollection());
check('Bastião: o guerreiro começa com o bônus da carta', comCartas.profile.heroes.warrior.cardAttrs?.str === 3);
check('sem cartas na coleção, o bônus é zero', semCartas.profile.heroes.warrior.cardAttrs?.str === 0);
check('o status do guerreiro sobe 3 de Força com a carta', heroStats(comCartas.profile, 'warrior').attrs.str === heroStats(semCartas.profile, 'warrior').attrs.str + 3);
check('o save do Bastião guarda só o bônus, não a coleção', !JSON.stringify(comCartas).includes('"owned"') && !JSON.stringify(comCartas).includes('high_orc'));
const antesDaDerrota = JSON.stringify(cartas);
const derrota: NightOutcome = { victory: false, coreHp: 900, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } };
applyNight(comCartas, derrota, 'night:1:1', cartas);
check('a derrota no Bastião não mexe na coleção compartilhada', JSON.stringify(cartas) === antesDaDerrota);
equipCard(cartas, 'mage', 'high_orc', 3);
check('equipar no meio da tentativa não muda o Bastião (vale na próxima)', comCartas.profile.heroes.mage.cardAttrs?.str === 0);
const nova = startAttempt(comCartas, cartas);
check('a próxima tentativa copia a coleção nova: o mago leva metade (+1 de Força, sem afinidade)', nova.ok && comCartas.profile.heroes.mage.cardAttrs?.str === 1 && comCartas.attempt === 2);
check('o guerreiro mantém o bônus cheio (+3 de Força)', comCartas.profile.heroes.warrior.cardAttrs?.str === 3);
check('a cópia do Bastião bate com o cálculo da campanha', JSON.stringify(comCartas.profile.heroes.mage.cardAttrs) === JSON.stringify(cardBonusFor('mage', cartas)));

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
const totalCartas = (c: CardCollection) => Object.values(c.owned).reduce((soma, n) => soma + n, 0);
const bpk = newBastion(7, emptyCollection());
bpk.nights = 98;
const colecaoPacote = emptyCollection();
const q1 = applyNight(bpk, ondaVencida(), 'night:1:1', colecaoPacote);
check('99 ondas vencidas ainda não dão pacote', q1 !== undefined && q1.packs.length === 0 && bpk.nights === 99);
const q2 = applyNight(bpk, ondaVencida(), 'night:1:2', colecaoPacote);
check('a 100ª onda vencida dá um pacote de 5 cartas na coleção compartilhada', q2 !== undefined && q2.packs.length === 1 && q2.packs[0].length === 5 && totalCartas(colecaoPacote) === 5 && bpk.packsGiven === 1);
const q3 = applyNight(bpk, ondaVencida(), 'night:1:2', colecaoPacote);
check('a mesma onda não entrega o pacote de novo', q3 === undefined && totalCartas(colecaoPacote) === 5);
const bderrota = newBastion(7, emptyCollection());
bderrota.nights = 99;
const q4 = applyNight(bderrota, { victory: false, coreHp: 1000, structures: [], wave: { souls: 0, zeni: 0, heroes: {}, drops: [] } }, 'night:1:3', emptyCollection());
check('derrota não conta para o pacote (continua em 99)', q4 !== undefined && q4.packs.length === 0 && bderrota.nights === 99);
const pacoteDaSemente = (): string => {
  const x = newBastion(99, emptyCollection());
  x.nights = 99;
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
check('5 ondas vencidas soltam 4 slots', bastionCardSlots(bh) === 4);
check('campanha com 3 vitórias e Bastião com 5 ondas: 3 + 4 = 7 slots (soma)', cardSlotsPool(3, 5) === 7);
check('sem Bastião, o total é o da campanha (3 vitórias = 3 slots)', cardSlotsPool(3) === cardSlots(3) && cardSlots(3) === 3);
check('o total para em 30 slots', cardSlotsPool(400, 400) === 30);

console.log('\n# 10) Mapa do Último Bastião (zona bastionKeep)');
const zonaB = ZONES[BASTION_ZONE_ID];
check('a zona do Bastião existe e tem a camada de construção', zonaB !== undefined && zonaB.lots !== undefined);
const pB = parseZone(zonaB);
check('o mapa tem 45×39 e a camada de construção tem o mesmo tamanho', pB.width === 45 && pB.height === 39 && zonaB.lots!.length === 39 && zonaB.lots!.every((r) => r.length === 45));
const boardB = staticBoard(zonaB);
const partyB: Vec2[] = zonaB.defaultSetup.members.map((m) => ({ x: m.x, y: m.y }));
const envB = bastionBuildEnv(zonaB, partyB, GAME_CONFIG.wave.spawnSafeRadius);
check('todo portal alcança o portão sozinho', zonaB.spawnPoints.every((s) => routeOpen(boardB, [s])));
const tatica = pB.lots.filter((l) => l.lot === 'b').length;
check(`área tática para construir: ${tatica} tiles (mínimo 400)`, tatica >= 400);
check('todo tile de construção é andável (sem parede, água nem portão)', pB.lots.every((l) => boardB.isWalkable(l.x, l.y)));
check('quatro lotes especiais (1 a 4) de 9 tiles cada', ['1', '2', '3', '4'].every((d) => pB.lots.filter((l) => l.lot === d).length === 9));
check('a party começa em chão construível', partyB.every((p) => envB.buildable(p.x, p.y) && boardB.isWalkable(p.x, p.y)));
check('estrada e fosso ficam fora da área de construção', !envB.buildable(22, 8) && !envB.buildable(14, 14));
check('zonas da campanha não têm camada de construção', parseZone(ZONES.bridge).lots.length === 0);
let erroTamanho = false;
try { parseZone({ ...zonaB, lots: zonaB.lots!.slice(1) }); } catch { erroTamanho = true; }
check('camada com tamanho errado é recusada', erroTamanho);
let erroLetra = false;
try { parseZone({ ...zonaB, lots: zonaB.lots!.map((r, i) => (i === 5 ? `x${r.slice(1)}` : r)) }); } catch { erroLetra = true; }
check('caractere desconhecido na camada é recusado', erroLetra);

const bm = newBastion(11, emptyCollection());
bm.profile.zeni = 500;
check('muralha no lote tático do castelo: aceita', placeStructure(bm, envB, 'wall', { x: 21, y: 17 }).ok === true);
check('muralha no lote especial 1: aceita', placeStructure(bm, envB, 'wall', { x: 18, y: 15 }).ok === true);
check('muralha na estrada: recusada (fora da área)', errOf(placeStructure(bm, envB, 'wall', { x: 22, y: 8 })) === 'outside');
check('muralha no fosso: recusada (fora da área)', errOf(placeStructure(bm, envB, 'wall', { x: 14, y: 14 })) === 'outside');

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

console.log(failures ? `\n${failures} checagem(ns) falharam.` : '\nTodas as checagens do Último Bastião passaram.');
if (failures) throw new Error(`bastionCheck: ${failures} falha(s)`);
