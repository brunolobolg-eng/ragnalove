/**
 * Checagem headless do caminho da horda com as estruturas da cidade (Bastião). Rode: npm run bastion:path
 * 1) Linha com brecha: a horda passa pela brecha e nenhuma estrutura perde vida.
 * 2) Caminhos todos fechados: a horda ataca a muralha, a vida cai e ela quebra.
 * 3) Bolsão fechado: o monstro preso dentro ataca a parede.
 * 4) Sem estrutura de pé: o mesmo resultado de antes (campanha intacta).
 * 5) Determinismo: a mesma montagem duas vezes dá o mesmo resultado.
 * 6) Alvo sem caminho aberto: monstro travado num herói murado (anel e corredor) anda ou quebra a parede.
 * 7) Portão oeste fechado ou estreito: a horda anda pelo caminho aberto mais curto (sem deriva presa na parede).
 * 8) Custo: tempo por tick com e sem estruturas (só informa a razão).
 */
import { DEFAULT_SETUP, GAME_CONFIG, applyZone, type PartySetup } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { Simulation, type Fortification } from '../src/core/sim/Simulation';
import type { Unit } from '../src/core/sim/types';
import type { Board } from '../src/core/grid/Board';
import { FlowField, canStep, stepCost } from '../src/core/grid/pathfinding';
import { DIRS8, type Vec2 } from '../src/core/grid/types';

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

console.log('\n# 6) Alvo sem caminho aberto (regressão)');
/** Herói que não sai do lugar, dentro de um anel de muralhas da cidade (os monstros têm vida de sobra, então ele só serve de alvo). */
const ENCLOSED: PartySetup = { members: [{ archetype: 'warrior', x: 22, y: 12 }], barriers: [] };
/** Quantos bonecos são criados e removidos antes do monstro: deslocam o id dele, e a checagem de foco (a cada 5 ticks, pelo id) cai no tick em que ele age. */
const BURN_IDS = 3;

/** Anel de 8 muralhas em volta de (cx, cy); ids a partir de `from`. */
function ringAround(cx: number, cy: number, from: number): Fortification[] {
  const out: Fortification[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ id: from + out.length, kind: 'wall', x: cx + dx, y: cy + dy, hp: WALL_HP, maxHp: WALL_HP });
  return out;
}

interface Chase {
  /** Primeiro tick em que cada monstro anda ou bate numa estrutura (-1 = nunca). */
  firstMove: number[];
  steps: number[];
  wallHits: number[];
  /** Vezes em que um monstro travou o herói como foco. */
  focusTakes: number;
  /** Assinatura determinística (posições e vidas, tick a tick). */
  sig: number;
}

/** Monstros de vida alta parados fora do herói murado: cada um anda, quebra ou trava o herói por até `ticks`. */
function chase(enemies: { x: number; y: number }[], fort: Fortification[], ticks: number): Chase {
  const sim = new Simulation(ENCLOSED, undefined, {}, { fortifications: fort });
  sim.start();
  const hero = [...sim.units.values()].find((u) => u.team === 'party');
  if (!hero) throw new Error('herói da checagem não foi criado');
  for (let k = 0; k < BURN_IDS; k++) {
    const dummy = sim.spawnEnemyAt('grunt', enemies[0].x, enemies[0].y, 1e6);
    if (dummy) sim.debugRemove(dummy.id);
  }
  const mons = enemies.map((e) => sim.spawnEnemyAt('grunt', e.x, e.y, 1e6)).filter((u): u is Unit => !!u);
  const at = new Map(mons.map((m, i) => [m.id, i]));
  const firstMove = mons.map(() => -1);
  const steps = mons.map(() => 0);
  const wallHits = mons.map(() => 0);
  let focusTakes = 0;
  let sig = 2166136261;
  const mix = (h: number, n: number) => Math.imul(h ^ (n | 0), 16777619) >>> 0;
  for (let i = 0; i < ticks && sim.phase === 'running' && mons.some((m) => m.alive); i++) {
    for (const e of sim.step()) {
      if (e.type === 'aggro' && e.targetId === hero.id && at.has(e.unitId)) focusTakes++;
      if (e.type !== 'move' && !(e.type === 'melee' && e.targetId < 0)) continue;
      const k = at.get(e.unitId);
      if (k === undefined) continue;
      if (firstMove[k] < 0) firstMove[k] = sim.tick;
      if (e.type === 'move') steps[k]++;
      else wallHits[k]++;
    }
    for (const u of sim.units.values()) if (u.alive && u.team === 'enemy') sig = mix(mix(mix(mix(sig, u.id), u.x), u.y), u.hp);
  }
  return { firstMove, steps, wallHits, focusTakes, sig };
}

// Anel: monstro de fora a 2 tiles do herói (dentro do alcance de foco do monstro comum, 3 tiles)
const ringRun = () => chase([{ x: 24, y: 12 }], ringAround(22, 12, 60), 3000);
const RING = ringRun();
check('anel: o monstro anda ou quebra a muralha em até 600 ticks', RING.firstMove[0] > 0 && RING.firstMove[0] <= 600, RING.firstMove[0] > 0 ? `primeiro passo/golpe no tick ${RING.firstMove[0]}` : 'parado 3000 ticks: sem passo e sem golpe');
check('anel: o herói sem caminho aberto não é retomado como foco', RING.focusTakes === 0, `${RING.focusTakes} retomadas`);
// Corredor: 4 tiles entre muralhas, fechado no fim; três monstros em fila, o da frente já travado no herói
const corridorWalls: Fortification[] = [24, 25, 26, 27].flatMap((x, i) => [
  { id: 80 + i, kind: 'wall' as const, x, y: 11, hp: WALL_HP, maxHp: WALL_HP },
  { id: 84 + i, kind: 'wall' as const, x, y: 13, hp: WALL_HP, maxHp: WALL_HP },
]);
corridorWalls.push({ id: 88, kind: 'wall', x: 28, y: 12, hp: WALL_HP, maxHp: WALL_HP });
const CORR = chase([{ x: 24, y: 12 }, { x: 25, y: 12 }, { x: 26, y: 12 }], [...ringAround(22, 12, 70), ...corridorWalls], 3000);
check('corredor fechado: cada monstro da fila anda ou quebra a parede em até 600 ticks', CORR.firstMove.every((t) => t > 0 && t <= 600), `primeiro passo/golpe nos ticks ${CORR.firstMove.join(', ')}`);
const RING2 = ringRun();
check('anel: duas execuções idênticas', RING2.sig === RING.sig && RING2.focusTakes === RING.focusTakes && RING2.steps[0] === RING.steps[0], `t1 ${RING.steps[0]} passos · t2 ${RING2.steps[0]} passos`);

console.log('\n# 7) Portão oeste do castelo: a volta é o caminho aberto (regressão)');
// Último Bastião: o portão oeste são os tiles (22, 25..27) e o portal oeste fica em (5, 26). Herói longe da rota.
const KEEP = ZONES.bastionKeep;
const KEEP_PORTAL: Vec2 = { x: 5, y: 26 };
const KEEP_ALONE: PartySetup = { members: [{ archetype: 'warrior', x: 44, y: 11 }], barriers: [] };
const WEST_2: Vec2[] = [{ x: 23, y: 25 }, { x: 23, y: 27 }];
const WEST_3: Vec2[] = [{ x: 23, y: 25 }, { x: 23, y: 26 }, { x: 23, y: 27 }];

/** Entrada da cidade por onde o monstro entrou: O, L (portões laterais), N ou S. */
function openingOf(p: Vec2): string {
  if (p.x === 22 && p.y >= 25 && p.y <= 27) return 'O';
  if (p.x === 37 && p.y >= 25 && p.y <= 27) return 'L';
  if (p.y === 18 && p.x >= 29 && p.x <= 31) return 'N';
  if (p.y === 34 && p.x >= 29 && p.x <= 31) return 'S';
  return '';
}

/** Menor número de passos (8 direções, regra de canto) de um tile até um tile da cidade, pelos tiles abertos. */
function minSteps(board: Board, from: Vec2): number {
  const goal = new Set(board.cityTiles().map((g) => g.y * board.width + g.x));
  const dist = new Map<number, number>([[from.y * board.width + from.x, 0]]);
  const q: Vec2[] = [from];
  for (let h = 0; h < q.length; h++) {
    const p = q[h];
    const dp = dist.get(p.y * board.width + p.x)!;
    if (goal.has(p.y * board.width + p.x)) return dp;
    for (const d of DIRS8) {
      if (!canStep(board, p, d)) continue;
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!dist.has(n.y * board.width + n.x)) {
        dist.set(n.y * board.width + n.x, dp + 1);
        q.push(n);
      }
    }
  }
  return Infinity;
}

interface Walk {
  arrived: boolean;
  opening: string;
  /** Custo andado / custo do caminho aberto mais curto (mesmo custo do campo de fluxo). */
  ratio: number;
  /** Passos andados menos o mínimo de passos pelos tiles abertos. */
  extraSteps: number;
  /** Maior espera parado com um passo livre que desce o campo. */
  idleRun: number;
  /** Maior sequência de passos que não aproximam o monstro do Emperium (volta junto ao castelo). */
  lateralRun: number;
}

/** Oito monstros nascem no portal oeste (sem onda natural) e andam até a cidade com as muralhas dadas. */
function walkWest(walls: Vec2[]): Walk[] {
  applyZone(KEEP, { count: 1 });
  const fort: Fortification[] = walls.map((t, i) => ({ id: 700 + i, kind: 'wall', x: t.x, y: t.y, hp: WALL_HP, maxHp: WALL_HP }));
  const sim = new Simulation(KEEP_ALONE, 9001, {}, { fortifications: fort });
  sim.start();
  sim.step();
  // a onda natural solta no primeiro tick (count 1): tira esse monstro, fica só a turma de teste
  for (const u of [...sim.units.values()]) if (u.team === 'enemy') sim.debugRemove(u.id);
  const board = sim.board;
  const goals = board.cityTiles();
  const field = new FlowField(board);
  field.compute(goals, GAME_CONFIG.pathing);
  const tiles: Vec2[] = [];
  for (let r = 0; r <= 2 && tiles.length < 8; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = KEEP_PORTAL.x + dx, y = KEEP_PORTAL.y + dy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || tiles.length >= 8) continue;
        if (board.isWalkable(x, y) && !board.isCity(x, y) && !sim.unitAt(x, y)) tiles.push({ x, y });
      }
  const mine = tiles.map((t) => sim.spawnEnemyAt('grunt', t.x, t.y, 1e6)).filter((u): u is Unit => !!u);
  const dist = (a: Vec2, b: Vec2) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const toGoal = (p: Vec2) => Math.min(...goals.map((g) => dist(p, g)));
  interface Acc { last: Vec2; path: Vec2[]; cost: number; moves: number; lateralRun: number; maxLateral: number; idleRun: number; maxIdle: number; done: boolean; arrived: boolean }
  const acc = new Map<number, Acc>(mine.map((u) => [u.id, { last: { x: u.x, y: u.y }, path: [{ x: u.x, y: u.y }], cost: 0, moves: 0, lateralRun: 0, maxLateral: 0, idleRun: 0, maxIdle: 0, done: false, arrived: false }]));
  const addStep = (a: Acc, to: Vec2) => {
    a.cost += stepCost(board, to, { x: Math.sign(to.x - a.last.x), y: Math.sign(to.y - a.last.y) }, GAME_CONFIG.pathing);
    a.moves++;
    if (toGoal(to) >= toGoal(a.last)) {
      a.lateralRun++;
      a.maxLateral = Math.max(a.maxLateral, a.lateralRun);
    } else a.lateralRun = 0;
    a.idleRun = 0;
    a.last = to;
    a.path.push(to);
  };
  const freeDown = (u: Unit) => {
    const here = field.at(u.x, u.y);
    return DIRS8.some((d) => {
      const nx = u.x + d.x, ny = u.y + d.y;
      return board.isWalkable(nx, ny) && canStep(board, u, d) && !sim.unitAt(nx, ny) && field.at(nx, ny) < here;
    });
  };
  for (let i = 0; i < 900 && sim.phase === 'running' && [...acc.values()].some((a) => !a.done); i++) {
    const attacked = new Set<number>();
    for (const e of sim.step()) if (e.type === 'melee' && e.unitId !== undefined) attacked.add(e.unitId);
    for (const u of mine) {
      const a = acc.get(u.id)!;
      if (a.done) continue;
      if (!u.alive) {
        // entrou na cidade: o último passo (no portão) também conta
        if (u.x !== a.last.x || u.y !== a.last.y) addStep(a, { x: u.x, y: u.y });
        a.done = true;
        a.arrived = board.isCity(u.x, u.y);
        continue;
      }
      if (u.x !== a.last.x || u.y !== a.last.y) {
        addStep(a, { x: u.x, y: u.y });
        continue;
      }
      if (u.nextActTick <= sim.tick && !attacked.has(u.id) && freeDown(u)) {
        a.idleRun++;
        a.maxIdle = Math.max(a.maxIdle, a.idleRun);
      } else a.idleRun = 0;
    }
  }
  return mine.map((u) => {
    const a = acc.get(u.id)!;
    const start = a.path[0];
    const opening = a.path.map(openingOf).find((o) => o) ?? '';
    return { arrived: a.arrived, opening, ratio: a.cost / field.at(start.x, start.y), extraSteps: a.moves - minSteps(board, start), idleRun: a.maxIdle, lateralRun: a.maxLateral };
  });
}

/** Custo do caminho aberto do portal oeste com essas muralhas (campo de fluxo do próprio tabuleiro). */
function openCostWith(walls: Vec2[]): number {
  applyZone(KEEP, { count: 1 });
  const fort: Fortification[] = walls.map((t, i) => ({ id: 800 + i, kind: 'wall', x: t.x, y: t.y, hp: WALL_HP, maxHp: WALL_HP }));
  const sim = new Simulation(KEEP_ALONE, 9001, {}, { fortifications: fort });
  const field = new FlowField(sim.board);
  field.compute(sim.board.cityTiles(), GAME_CONFIG.pathing);
  return field.at(KEEP_PORTAL.x, KEEP_PORTAL.y);
}

applyZone(KEEP, { count: 1 });
const keepBase = new Simulation(KEEP_ALONE, 9001, {}, {});
// tiles livres ao lado do portão oeste (x 21 a 24, y 22 a 30): onde o jogador pode pôr muralha
const nearWest: Vec2[] = [];
for (let x = 21; x <= 24; x++) for (let y = 22; y <= 30; y++) if (keepBase.board.isWalkable(x, y) && !keepBase.board.isCity(x, y)) nearWest.push({ x, y });
const cost0 = openCostWith([]);
let worstPair = 0;
let pairs = 0;
for (let i = 0; i < nearWest.length; i++)
  for (let j = i + 1; j < nearWest.length; j++) {
    worstPair = Math.max(worstPair, openCostWith([nearWest[i], nearWest[j]]) - cost0);
    pairs++;
  }
const closedDetour = openCostWith(WEST_3) - cost0;

const W2 = walkWest(WEST_2);
const W3 = walkWest(WEST_3);
check('2 blocos no portão oeste: os 8 monstros entram pelo portão oeste', W2.length === 8 && W2.every((w) => w.arrived && w.opening === 'O'), `${W2.filter((w) => w.arrived && w.opening === 'O').length} de ${W2.length} pelo O`);
check('2 blocos: nenhum par de muralhas ao lado do portão desvia o caminho em mais de 4 de custo', worstPair <= 4, `${pairs} pares · maior desvio +${worstPair}`);
check('2 blocos: ninguém dá a volta junto ao castelo (sequência lateral até 2)', W2.every((w) => w.lateralRun <= 2), `maior sequência ${Math.max(...W2.map((w) => w.lateralRun))}`);
check('2 blocos: custo andado no máximo 25% acima do caminho aberto mais curto', W2.every((w) => w.arrived && w.ratio <= 1.25), `maior razão ${Math.max(...W2.map((w) => w.ratio)).toFixed(2)}`);
check('3 blocos fecham o portão oeste: o desvio existe (a volta pela lateral, não uma quebra)', closedDetour >= 100, `+${closedDetour} de custo`);
check('3 blocos: os 8 monstros chegam pelo norte ou pelo sul', W3.length === 8 && W3.every((w) => w.arrived && (w.opening === 'N' || w.opening === 'S')), `${W3.filter((w) => w.arrived).length} chegaram · entradas ${[...new Set(W3.map((w) => w.opening))].join('/')}`);
check('3 blocos: a volta é o caminho aberto mais curto (custo até 10% acima, passos até +2)', W3.every((w) => w.arrived && w.ratio <= 1.1 && w.extraSteps <= 2), `razão ${Math.max(...W3.map((w) => w.ratio)).toFixed(2)} · passos a mais ${Math.max(...W3.map((w) => w.extraSteps))}`);
check('3 blocos: ninguém para com passo livre descendo o campo (espera até 2 ticks)', W3.every((w) => w.idleRun <= 2), `maior espera ${Math.max(...W3.map((w) => w.idleRun))} ticks`);
applyZone(ZONES.bridge);

console.log('\n# 8) Custo (informativo)');
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
