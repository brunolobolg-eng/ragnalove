/**
 * Checagem headless dos efeitos de combate das Masteries táticas. Rode: npm run arvore:combate:check
 * (a) Golpe de Misericórdia: +35% de dano contra inimigo com até 30% da vida; acima do limiar, dano igual ao de antes.
 * (b) Barreira de Contenção: na primeira queda abaixo de 30%, ganha escudo de 20% da vida máxima; vale uma vez por batalha.
 * (c) Pressão Tática: golpe corpo a corpo empurra o inimigo uma casa (~25%); flecha não empurra; sem Mastery, nunca empurra.
 * (d) Determinismo: mesma semente, mesmo resultado; sem Mastery, a simulação é a de antes.
 * (e) Ponta a ponta: Mastery atribuída no perfil chega à simulação pela regra do perfil.
 */
import { DEFAULT_SETUP, type PartySetup } from '../src/config/gameConfig';
import { DIRS8 } from '../src/core/grid/types';
import { Simulation, type HeroLoadout } from '../src/core/sim/Simulation';
import type { Unit } from '../src/core/sim/types';
import type { MasteryRegra } from '../src/config/arvoreGlobal';
import { atribuirMastery, comprarNo, masteryDoHeroi } from '../src/core/progression/arvore';
import { createProfile, heroStats } from '../src/core/progression/profile';
import type { HeroKind } from '../src/core/progression/skills';

let falhas = 0;
let total = 0;
const check = (label: string, cond: boolean, extra = '') => {
  total++;
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhas++;
};
const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const EXECUCAO: MasteryRegra = { tipo: 'execucao', limiar: 0.3, bonus: 0.35 };
const ESCUDO: MasteryRegra = { tipo: 'escudoReativo', limiar: 0.3, pct: 0.2, sec: 4 };
const EMPURRAO: MasteryRegra = { tipo: 'empurrao', chance: 0.25, passos: 1 };

/** Uma party com um herói (com a Mastery dada) e nada mais. */
function mundo(kind: HeroKind, regra?: MasteryRegra, seed = 777) {
  const base = DEFAULT_SETUP.members[0];
  const setup: PartySetup = { ...DEFAULT_SETUP, members: [{ archetype: kind, x: base.x, y: base.y }] };
  const loadout: Record<string, HeroLoadout> = {};
  loadout[kind] = { stats: heroStats(createProfile(), kind), level: 1, exp: 0, mastery: regra };
  const sim = new Simulation(setup, seed, loadout);
  const heroi = [...sim.units.values()].find((u) => u.team === 'party')!;
  return { sim, heroi };
}

/** Coloca um inimigo ortogonal ao herói, com a casa do outro lado livre (para o empurrão poder acontecer). */
function inimigoAoLado(sim: Simulation, heroi: Unit, hp = 100): Unit {
  for (const d of DIRS8) {
    if (d.x !== 0 && d.y !== 0) continue;
    const x = heroi.x + d.x;
    const y = heroi.y + d.y;
    const atras = { x: heroi.x + 2 * d.x, y: heroi.y + 2 * d.y };
    if (!sim.board.isWalkable(atras.x, atras.y) || sim.unitAt(atras.x, atras.y)) continue;
    const e = sim.spawnEnemyAt('grunt', x, y, hp);
    if (e) return e;
  }
  throw new Error('arvoreCombateCheck: sem casa livre ao lado do herói');
}

const danos = (sim: Simulation) => sim.flushEvents().filter((e) => e.type === 'damage') as { amount: number }[];

// ---------------- (a) Golpe de Misericórdia ----------------
/** Dano de um tiro de flecha (sem sorteio de crítico) contra um inimigo com a vida dada, na fração de vida. */
function danoTiro(regra: MasteryRegra | undefined, vidaEmPontos: number): number {
  const { sim, heroi } = mundo('archer', regra);
  const e = inimigoAoLado(sim, heroi, 100);
  e.hp = vidaEmPontos;
  sim.flushEvents();
  sim.damage(e, 10, 'arrow', heroi.id, false);
  return danos(sim)[0].amount;
}
check('sem Mastery: tiro em inimigo ferido causa o dano normal', perto(danoTiro(undefined, 20), 10));
check('Golpe de Misericórdia: inimigo com 20% da vida leva +35%', perto(danoTiro(EXECUCAO, 20), 13.5), `dano ${danoTiro(EXECUCAO, 20).toFixed(2)}`);
check('Golpe de Misericórdia: limiar incluso (exatamente 30%)', perto(danoTiro(EXECUCAO, 30), 13.5));
check('Golpe de Misericórdia: acima do limiar (31%) não age', perto(danoTiro(EXECUCAO, 31), 10));
check('Golpe de Misericórdia: inimigo com vida cheia não age', perto(danoTiro(EXECUCAO, 100), 10));

// ---------------- (b) Barreira de Contenção ----------------
{
  const { sim, heroi } = mundo('warrior', ESCUDO);
  heroi.hp = heroi.maxHp;
  sim.damage(heroi, heroi.maxHp * 0.1, 'burn');
  check('acima de 30% não ganha escudo', (heroi.shield ?? 0) === 0 && heroi.masteryUsed !== true, `vida ${heroi.hp}`);
  sim.damage(heroi, heroi.maxHp * 0.7, 'burn');
  const esperado = 0.2 * heroi.maxHp;
  check('queda abaixo de 30% dá escudo de 20% da vida máxima', heroi.hp <= heroi.maxHp * 0.3 && perto(heroi.shield ?? 0, esperado, 0.5), `escudo ${(heroi.shield ?? 0).toFixed(1)} de ${esperado.toFixed(1)}`);
  check('o escudo dura 4 segundos (40 ticks)', heroi.shieldUntil === sim.tick + 40, `até ${heroi.shieldUntil}, agora ${sim.tick}`);
  check('marca a Mastery como usada na batalha', heroi.masteryUsed === true);
}
{
  // vale uma vez: mesmo caindo de novo abaixo do limiar, não ganha outro escudo
  const { sim, heroi } = mundo('warrior', ESCUDO);
  heroi.hp = heroi.maxHp;
  sim.damage(heroi, heroi.maxHp * 0.8, 'burn');
  heroi.shield = 0; // o escudo já foi consumido
  heroi.hp = heroi.maxHp;
  sim.damage(heroi, heroi.maxHp * 0.8, 'burn');
  check('vale uma vez por batalha: cair de novo não dá outro escudo', (heroi.shield ?? 0) === 0);
}
{
  const { sim, heroi } = mundo('warrior', undefined);
  heroi.hp = heroi.maxHp;
  sim.damage(heroi, heroi.maxHp * 0.8, 'burn');
  check('sem Mastery: queda abaixo de 30% não cria escudo', (heroi.shield ?? 0) === 0 && heroi.masteryUsed !== true);
}

// ---------------- (c) Pressão Tática ----------------
/** Quantos golpes (de 200) empurraram o inimigo, com a fonte de dano dada. */
function empurroes(regra: MasteryRegra | undefined, fonte: 'melee' | 'arrow', n = 200, seed = 777): number {
  const { sim, heroi } = mundo('warrior', regra, seed);
  const e = inimigoAoLado(sim, heroi, 100000);
  const x0 = e.x;
  const y0 = e.y;
  let vezes = 0;
  for (let i = 0; i < n; i++) {
    sim.relocate(e, x0, y0); // volta ao lugar de partida (a casa de trás continua livre)
    e.hp = e.maxHp = 100000;
    sim.damage(e, 1, fonte, heroi.id, false);
    if (e.x !== x0 || e.y !== y0) vezes++;
  }
  return vezes;
}
const semEmpurrao = empurroes(undefined, 'melee');
check('sem Mastery: nenhum golpe empurra', semEmpurrao === 0, `${semEmpurrao} empurrões`);
const comEmpurrao = empurroes(EMPURRAO, 'melee');
check('Pressão Tática: golpe corpo a corpo empurra cerca de 1 em 4', comEmpurrao >= 30 && comEmpurrao <= 70, `${comEmpurrao} de 200 (~25%)`);
const flecha = empurroes(EMPURRAO, 'arrow');
check('Pressão Tática: flecha não empurra (só golpe corpo a corpo)', flecha === 0, `${flecha} empurrões`);
check('Pressão Tática: a mesma semente dá o mesmo resultado', empurroes(EMPURRAO, 'melee') === comEmpurrao);

// ---------------- (d) determinismo e neutralidade ----------------
{
  const a = mundo('warrior', EMPURRAO, 4242);
  const b = mundo('warrior', EMPURRAO, 4242);
  const ea = inimigoAoLado(a.sim, a.heroi, 100000);
  const eb = inimigoAoLado(b.sim, b.heroi, 100000);
  for (let i = 0; i < 60; i++) {
    a.sim.damage(ea, 1, 'melee', a.heroi.id, false);
    b.sim.damage(eb, 1, 'melee', b.heroi.id, false);
  }
  const sig = (u: Unit) => `${u.x},${u.y},${u.hp}`;
  check('duas simulações iguais com Mastery dão o mesmo estado', sig(ea) === sig(eb));
}
{
  // a Mastery não gasta sorteio de quem não a tem: o crítico dos outros segue igual
  const a = mundo('warrior', undefined, 99);
  const b = mundo('warrior', undefined, 99);
  const ea = inimigoAoLado(a.sim, a.heroi, 100000);
  const eb = inimigoAoLado(b.sim, b.heroi, 100000);
  for (let i = 0; i < 40; i++) {
    a.sim.damage(ea, 1, 'melee', a.heroi.id);
    b.sim.damage(eb, 1, 'melee', b.heroi.id);
  }
  check('sem Mastery, dois mundos iguais seguem iguais (crítico incluso)', ea.hp === eb.hp);
}

// ---------------- (e) ponta a ponta: perfil -> loadout -> simulação ----------------
{
  const p = createProfile();
  p.zeni = 500;
  p.heroes.warrior.level = 5;
  comprarNo(p, 'sortePeregrina');
  comprarNo(p, 'pontoPressao');
  const erro = atribuirMastery(p, 'pressaoTatica', 'warrior');
  const regra = masteryDoHeroi(p, 'warrior')?.regra;
  check('Mastery atribuída vira regra de combate do perfil', erro === undefined && regra?.tipo === 'empurrao', `${erro ?? 'ok'}`);
  if (regra) {
    const vezes = empurroes(regra, 'melee');
    check('a regra do perfil empurra na simulação', vezes > 0, `${vezes} empurrões`);
  }
  // sem Zen para a atribuição, o efeito não chega à luta
  const pobre = createProfile();
  pobre.heroes.warrior.level = 5;
  comprarNo(pobre, 'sortePeregrina');
  comprarNo(pobre, 'pontoPressao');
  const sem = atribuirMastery(pobre, 'pressaoTatica', 'warrior');
  check('sem Zen a atribuição é recusada e não há efeito', (sem ?? '').includes('Zen insuficiente') && masteryDoHeroi(pobre, 'warrior') === undefined);
}

// ---------------- (f) uma onda inteira com as três regras ativas ----------------
/** Roda a onda padrão com as Masteries dadas (guerreiro e mago). Devolve assinatura do fim e o tick em que acabou. */
function ondaCompleta(regras: Record<string, MasteryRegra>, seed = GAME_SEED): { sig: string; tick: number; fase: string } {
  const loadout: Record<string, HeroLoadout> = {};
  for (const k of ['warrior', 'mage'] as HeroKind[]) loadout[k] = { stats: heroStats(createProfile(), k), level: 1, exp: 0, mastery: regras[k] };
  const sim = new Simulation(DEFAULT_SETUP, seed, loadout);
  sim.start();
  while (sim.phase === 'running' && sim.tick < 8000) sim.step();
  const sig = [...sim.units.values()].map((u) => `${u.id}:${u.x},${u.y},${u.hp}`).join('|') + `#${sim.cityHp}`;
  return { sig, tick: sim.tick, fase: sim.phase };
}
const GAME_SEED = 4242;
{
  const a = ondaCompleta({ warrior: EMPURRAO, mage: EXECUCAO });
  const b = ondaCompleta({ warrior: EMPURRAO, mage: EXECUCAO });
  check('onda inteira com Mastery termina (sem trava)', a.fase !== 'running', `${a.fase} em ${a.tick} ticks`);
  check('onda inteira com Mastery é determinística', a.sig === b.sig && a.tick === b.tick);
  const c = ondaCompleta({ warrior: ESCUDO, mage: EXECUCAO });
  check('onda com escudo e execução também termina', c.fase !== 'running', `${c.fase} em ${c.tick} ticks`);
  const semNada = ondaCompleta({});
  const semNada2 = ondaCompleta({});
  check('onda sem Mastery é determinística (base intacta)', semNada.sig === semNada2.sig);
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`arvoreCombateCheck: ${falhas} falha(s)`);
