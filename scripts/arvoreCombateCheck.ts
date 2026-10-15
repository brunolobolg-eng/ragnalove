/**
 * Checagem headless dos efeitos de combate das Masteries táticas. Rode: npm run arvore:combate:check
 * (a) Golpe de Misericórdia: +35% de dano contra inimigo com até 30% da vida; acima do limiar, dano igual ao de antes.
 * (b) Barreira de Contenção: na primeira queda abaixo de 30%, ganha escudo de 20% da vida máxima; vale uma vez por batalha.
 * (c) Pressão Tática: golpe corpo a corpo empurra o inimigo uma casa (~25%); flecha não empurra; sem Mastery, nunca empurra.
 * (d) Determinismo: mesma semente, mesmo resultado; sem Mastery, a simulação é a de antes.
 * (e) Ponta a ponta: Mastery atribuída no perfil chega à simulação pela regra do perfil.
 */
import { DEFAULT_SETUP, type PartySetup } from '../src/config/gameConfig';
import { DIRS8, chebyshev } from '../src/core/grid/types';
import { Simulation, type HeroLoadout } from '../src/core/sim/Simulation';
import type { Unit } from '../src/core/sim/types';
import type { MasteryId, MasteryRegra } from '../src/config/arvoreGlobal';
import { atribuirMastery, comprarNo, masteryDoHeroi } from '../src/core/progression/arvore';
import { MASTERIES } from '../src/config/arvoreGlobal';
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
  pobre.zeni = 250; // só o necessário para abrir os dois nós (100 + 150): sobra zero para a Mastery
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

// ---------------- (h) cada Mastery tem efeito verificável (18 no total) ----------------
/** Casas que valem para um inimigo ou herói (andável e sem unidade). */
const livre = (sim: Simulation, x: number, y: number) => sim.board.isWalkable(x, y) && !sim.unitAt(x, y);
function vizinhoLivre(sim: Simulation, x: number, y: number): { x: number; y: number } | undefined {
  for (const d of DIRS8) if (livre(sim, x + d.x, y + d.y)) return { x: x + d.x, y: y + d.y };
  return undefined;
}
/** Vizinho do herói com a casa "atrás" (do outro lado) livre: o recuo pode acontecer. */
function vizinhoComAtras(sim: Simulation, hx: number, hy: number): { x: number; y: number } | undefined {
  for (const d of DIRS8) {
    const v = { x: hx + d.x, y: hy + d.y };
    if (!livre(sim, v.x, v.y)) continue;
    if (livre(sim, hx - d.x, hy - d.y)) return v;
  }
  return undefined;
}
function casaADistancia(sim: Simulation, x: number, y: number, dist: number): { x: number; y: number } | undefined {
  for (let dx = -dist; dx <= dist; dx++) for (let dy = -dist; dy <= dist; dy++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== dist) continue;
    if (livre(sim, x + dx, y + dy)) return { x: x + dx, y: y + dy };
  }
  return undefined;
}
function inimigoEm(sim: Simulation, kind: string, at: { x: number; y: number }, hp = 100): Unit {
  const e = sim.spawnEnemyAt(kind, at.x, at.y, hp);
  if (!e) throw new Error('arvoreCombateCheck: casa ocupada para o inimigo de teste');
  return e;
}
/** Golpe direto do herói; devolve os valores de dano que saíram no evento. */
function golpe(sim: Simulation, alvo: Unit, amount: number, source: 'melee' | 'arrow' | 'bolt' | 'burn', heroiId?: number): number[] {
  sim.flushEvents();
  sim.damage(alvo, amount, source, heroiId, false);
  return sim.flushEvents().filter((e) => e.type === 'damage').map((e) => (e as { amount: number }).amount);
}
const coberto: string[] = [];
const cobre = (id: MasteryId) => coberto.push(id);
const T = 10; // ticks por segundo (igual ao jogo)

// Bônus contra pesados (Golpe Rompedor): brutamonte leva +35%, comum não
{
  cobre('golpeRompedor');
  const { sim, heroi } = mundo('warrior', { tipo: 'bonusContraPesado', pct: 0.35 });
  const b = inimigoEm(sim, 'brute', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  const g = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  check('Golpe Rompedor: pesado leva +35% de dano', perto(golpe(sim, b, 10, 'melee', heroi.id)[0], 13.5), `${golpe(sim, b, 10, 'melee', heroi.id)[0]}`);
  check('Golpe Rompedor: comum não recebe o bônus', perto(golpe(sim, g, 10, 'melee', heroi.id)[0], 10));
}
// Estilhaço (chance 1 para o teste): o vizinho do alvo leva 30% do golpe
{
  cobre('estilhaco');
  const { sim, heroi } = mundo('warrior', { tipo: 'estilhaco', chance: 1, pct: 0.3 });
  const a = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 100);
  const casa = vizinhoLivre(sim, a.x, a.y)!;
  const b = inimigoEm(sim, 'grunt', casa, 100);
  golpe(sim, a, 10, 'melee', heroi.id);
  check('Estilhaço: vizinho do alvo leva 30% do golpe', perto(b.hp, 97), `vida ${b.hp}`);
}
// Golpe Cíclico: o quarto golpe corpo a corpo vem com +80%
{
  cobre('golpeCiclico');
  const { sim, heroi } = mundo('warrior', { tipo: 'golpeCiclico', a: 4, pct: 0.8 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  const saidas = [1, 2, 3, 4].map(() => golpe(sim, e, 10, 'melee', heroi.id)[0]);
  check('Golpe Cíclico: a cada quatro golpes o quarto sobe 80%', saidas.map((v) => Math.round(v)).join(',') === '10,10,10,18', saidas.join(','));
}
// Marca Mortal (chance 1): marca o alvo com +25% de dano recebido
{
  cobre('marcaMortal');
  const { sim, heroi } = mundo('archer', { tipo: 'marca', chance: 1, amp: 0.25, sec: 3 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  golpe(sim, e, 10, 'arrow', heroi.id);
  check('Marca Mortal: alvo marcado por 3 segundos com +25%', (e.markedUntil ?? 0) > sim.tick && perto(e.markAmp ?? 0, 0.25) && (e.markedUntil ?? 0) - sim.tick >= 3 * T - 1);
}
// Frio Cortante (chance 1): congela o alvo (dano recebido sobe)
{
  cobre('frioCortante');
  const { sim, heroi } = mundo('mage', { tipo: 'frio', chance: 1, sec: 3 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  golpe(sim, e, 10, 'bolt', heroi.id);
  check('Frio Cortante: alvo gelado por 3 segundos', (e.chilledUntil ?? 0) > sim.tick && (e.chilledUntil ?? 0) - sim.tick >= 3 * T - 1);
}
// Lentidão de Golpe (chance 1): o alvo anda 2x mais devagar
{
  cobre('lentidaoGolpe');
  const { sim, heroi } = mundo('warrior', { tipo: 'lentidao', chance: 1, mult: 2, sec: 2 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  golpe(sim, e, 10, 'melee', heroi.id);
  check('Lentidão de Golpe: alvo lento (2x) por 2 segundos', perto(e.slowMult ?? 0, 2) && (e.slowUntil ?? 0) > sim.tick);
}
// Atordoamento (chance 1): o alvo perde 1 segundo de ação
{
  cobre('atordoamento');
  const { sim, heroi } = mundo('warrior', { tipo: 'atordoar', chance: 1, sec: 1 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1000);
  const antes = e.nextActTick;
  golpe(sim, e, 10, 'melee', heroi.id);
  check('Atordoamento: alvo perde 1 segundo de ação', e.nextActTick >= antes + T, `antes ${antes}, depois ${e.nextActTick}`);
}
// Cura de Emergência: uma vez por batalha, abaixo de 25% recupera 30%
{
  cobre('curaEmergencia');
  const { sim, heroi } = mundo('mage', { tipo: 'curaReativa', limiar: 0.25, pct: 0.3 });
  heroi.hp = heroi.maxHp;
  golpe(sim, heroi, heroi.maxHp * 0.8, 'burn');
  const depois1 = heroi.hp;
  check('Cura de Emergência: abaixo de 25% volta para cerca de 50%', Math.abs(depois1 - heroi.maxHp * 0.5) <= 2, `vida ${depois1.toFixed(1)} de ${heroi.maxHp}`);
  golpe(sim, heroi, heroi.maxHp * 0.3, 'burn');
  check('Cura de Emergência: vale uma vez (segunda queda não cura)', heroi.hp < depois1);
}
// Espinhos: o dano direto que o herói recebe volta ao atacante
{
  cobre('espinhos');
  const { sim, heroi } = mundo('warrior', { tipo: 'espinhos', pct: 0.15 });
  const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 100);
  check('Espinhos: reflexo ativo na batalha inteira', perto(heroi.reflectPct ?? 0, 0.15) && (heroi.reflectUntil ?? 0) > sim.tick);
  golpe(sim, heroi, 10, 'melee', e.id);
  check('Espinhos: 15% do golpe volta ao atacante', perto(e.hp, 98.5), `vida ${e.hp}`);
}
// Recuo Tático (chance 1): quem bate no herói o faz recuar uma casa
{
  cobre('recuoTatico');
  const { sim, heroi } = mundo('warrior', { tipo: 'recuoSofrido', chance: 1, passos: 1 });
  const casa = vizinhoComAtras(sim, heroi.x, heroi.y);
  if (!casa) throw new Error('arvoreCombateCheck: sem casa de recuo para o teste');
  const e = inimigoEm(sim, 'grunt', casa, 100);
  const antes = chebyshev(heroi, e);
  golpe(sim, heroi, 10, 'melee', e.id);
  check('Recuo Tático: herói recua uma casa após golpe corpo a corpo', chebyshev(heroi, e) > antes, `distância ${antes} -> ${chebyshev(heroi, e)}`);
}
// Avanço ao Abate: depois de abater, o herói avança em direção ao inimigo mais próximo
{
  cobre('avancoAbate');
  const { sim, heroi } = mundo('warrior', { tipo: 'avancoAbate', passos: 2 });
  const vitima = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1);
  const longe = inimigoEm(sim, 'grunt', casaADistancia(sim, heroi.x, heroi.y, 5)!, 100);
  const antes = chebyshev(heroi, longe);
  golpe(sim, vitima, 10, 'melee', heroi.id);
  check('Avanço ao Abate: herói avança para o próximo inimigo', chebyshev(heroi, longe) < antes, `distância ${antes} -> ${chebyshev(heroi, longe)}`);
}
// Recuo ao Abate: depois de abater, o herói se afasta da vítima
{
  cobre('recuoAbate');
  const { sim, heroi } = mundo('archer', { tipo: 'recuoAbate', passos: 1 });
  const casa = vizinhoComAtras(sim, heroi.x, heroi.y);
  if (!casa) throw new Error('arvoreCombateCheck: sem casa de recuo para o teste');
  const vitima = inimigoEm(sim, 'grunt', casa, 1);
  const antes = chebyshev(heroi, vitima);
  golpe(sim, vitima, 10, 'arrow', heroi.id);
  check('Recuo ao Abate: herói se afasta da vítima', chebyshev(heroi, vitima) > antes, `distância ${antes} -> ${chebyshev(heroi, vitima)}`);
}
// Bênção da Equipe: abater abençoa a party (dano +10%)
{
  cobre('bencaoEquipe');
  const { sim, heroi } = mundo('mage', { tipo: 'bencaoEquipe', amp: 0.1, sec: 4 });
  const vitima = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1);
  golpe(sim, vitima, 10, 'bolt', heroi.id);
  check('Bênção da Equipe: abater dá +10% de dano à party por 4 segundos', perto(heroi.blessAmp ?? 0, 0.1) && (heroi.blessUntil ?? 0) - sim.tick >= 4 * T - 1);
}
// Escudo Aliado: abater dá escudo de 15% da vida máxima ao aliado mais ferido
{
  cobre('escudoAliado');
  const { sim, heroi } = mundo('mage', { tipo: 'escudoAliado', pct: 0.15, sec: 4 });
  const vitima = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1);
  golpe(sim, vitima, 10, 'bolt', heroi.id);
  check('Escudo Aliado: aliado mais ferido ganha escudo de 15%', Math.round(heroi.shield ?? 0) === Math.round(0.15 * heroi.maxHp), `escudo ${heroi.shield}`);
}
// Cura Coletiva: abater cura a party (5% da vida máxima)
{
  cobre('curaColetiva');
  const { sim, heroi } = mundo('mage', { tipo: 'curaColetiva', pct: 0.05 });
  heroi.hp = heroi.maxHp * 0.5;
  const vitima = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1);
  golpe(sim, vitima, 10, 'bolt', heroi.id);
  check('Cura Coletiva: abater cura 5% da vida máxima de quem está na party', Math.abs(heroi.hp - heroi.maxHp * 0.55) <= 1.5, `vida ${heroi.hp.toFixed(1)}`);
}
// Execução (Golpe de Misericórdia) e Pressão Tática têm testes acima; aqui confirma-se a cobertura total
{
  cobre('golpeDeMisericordia');
  cobre('pressaoTatica');
  cobre('barreiraDeContencao');
  const faltam = MASTERIES.map((m) => m.id).filter((id) => !coberto.includes(id));
  check('toda Mastery tem um teste de efeito de combate', faltam.length === 0, faltam.join(', ') || `${coberto.length} de ${MASTERIES.length}`);
}

// Recompensa de batalha da Árvore (EXP e almas por abate): o bônus entra no abate, sem bônus fica o de antes
{
  const base = (bonus: number) => {
    const loadout: Record<string, HeroLoadout> = {};
    loadout.warrior = { stats: heroStats(createProfile(), 'warrior'), level: 1, exp: 0 };
    const setup: PartySetup = { ...DEFAULT_SETUP, members: [{ archetype: 'warrior', x: DEFAULT_SETUP.members[0].x, y: DEFAULT_SETUP.members[0].y }] };
    const sim = new Simulation(setup, 77, loadout, { recompensas: { exp: bonus, almas: 0, zeni: 0 } });
    const heroi = [...sim.units.values()].find((u) => u.team === 'party')!;
    const e = inimigoEm(sim, 'grunt', vizinhoLivre(sim, heroi.x, heroi.y)!, 1);
    sim.flushEvents();
    sim.damage(e, 10, 'melee', heroi.id, false);
    const exp = sim.flushEvents().find((ev) => ev.type === 'exp');
    return exp && 'amount' in exp ? (exp as { amount: number }).amount : -1;
  };
  const semBonus = base(0);
  const comBonus = base(0.5);
  check('abate sem bônus da Árvore dá a EXP de antes (grunt: 2)', semBonus === 2, `${semBonus}`);
  check('abate com +50% de EXP da Árvore dá 3 (2 × 1,5)', comBonus === 3, `${comBonus}`);
}

console.log(`\n${total - falhas}/${total} ok${falhas ? ` · ${falhas} FALHA(S)` : ''}`);
if (falhas) throw new Error(`arvoreCombateCheck: ${falhas} falha(s)`);
