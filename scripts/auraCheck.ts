/**
 * Checagem headless das auras de monstro (Bastião e campanha). Rode: npm run aura:check
 * (a) Chance 0: sem portadores e a mesma sequência de eventos (hash) de sem o campo.
 * (b) Chance 1: monstros nascem portadores e as cinco auras aparecem.
 * (c) Chefes e elites nunca são portadores, mesmo com eles no sorteio.
 * (d) Velocidade: aliado em alcance anda em menos ticks; fora do alcance e o próprio portador, não.
 * (e) Regeneração: aliado em alcance recupera vida com o tempo; fora do alcance e o portador, não.
 * (f) Mitigação: 25% a menos do dano da party; dano sem autor da party não; não acumula; o portador não.
 * (g) Queimação: herói em alcance leva um pulso por segundo; fora do alcance, não.
 * (h) Crítico: aliado em alcance crita com chance extra e 1,5x; o portador e os de fora, não.
 * (i) Gate da campanha: só com os três heróis que se liberam jogando.
 * (j) Determinismo: mesma semente, mesmos portadores; semente diferente, sorteio diferente.
 * (k) Portador morto perde a aura; a sobrevivência não sorteia auras.
 */
import { DEFAULT_SETUP, GAME_CONFIG, applyZone, type MemberSetup, type PartySetup } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { AURA, AURA_KINDS, AURA_HEROES_CAMPANHA, auraCampanhaLiberada, type AuraKind } from '../src/config/auras';
import { HERO_UNLOCKS, emptyMeta, type MetaStats } from '../src/config/heroes';
import { Simulation, enemyStats } from '../src/core/sim/Simulation';
import type { SimEvent, Unit } from '../src/core/sim/types';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

const ZONA = ZONES.bridge;
/** Vida alta: o monstro de teste não morre no meio da checagem. */
const VIDA = 1e6;
/** Monstro congelado (não anda nem ataca): só a aura e o teste mexem nele. */
const parado = (u: Unit): Unit => {
  u.nextActTick = 1e9;
  return u;
};

interface Cena {
  sim: Simulation;
  /** Canto esquerdo da faixa de 12 × 2 tiles livres onde os monstros de teste ficam. */
  x0: number;
  y: number;
}

/**
 * Cena limpa: sem ondas (count 0), `auraChance` dada e a party em posição sob medida.
 * `longe`: um guerreiro bem longe da faixa. `perto`: guerreiro a 2 tiles e mago a 8 (teste da queimação).
 */
function cena(seed: number, party: 'longe' | 'perto', auraChance = 0): Cena {
  applyZone(ZONA, { count: 0, boss: null, seed, auraChance });
  const sonda = new Simulation(DEFAULT_SETUP, seed);
  const { board } = sonda;
  const livre = (x: number, y: number) => board.isWalkable(x, y) && board.slowAt(x, y) === 1 && !board.isCity(x, y);
  const faixaLivre = (x0: number, y0: number) => {
    for (let dx = 0; dx < 12; dx++) for (let dy = 0; dy < 2; dy++) if (!livre(x0 + dx, y0 + dy)) return false;
    return true;
  };
  let x0 = -1;
  let y0 = -1;
  search: for (let y = 1; y < board.height - 2; y++) for (let x = 1; x < board.width - 13; x++) {
    if (faixaLivre(x, y)) {
      x0 = x;
      y0 = y;
      break search;
    }
  }
  if (x0 < 0) throw new Error('auraCheck: sem faixa livre de 12 × 2 tiles na zona de teste');
  const members: MemberSetup[] = [];
  if (party === 'longe') {
    let far: { x: number; y: number } | undefined;
    for (let y = 1; y < board.height - 1 && !far; y++) for (let x = 1; x < board.width - 1 && !far; x++) {
      const perto = x > x0 - 10 && x < x0 + 22 && y > y0 - 10 && y < y0 + 12;
      if (livre(x, y) && !perto) far = { x, y };
    }
    if (!far) throw new Error('auraCheck: sem tile livre longe da faixa');
    members.push({ archetype: 'warrior', x: far.x, y: far.y });
  } else {
    members.push({ archetype: 'warrior', x: x0 + 2, y: y0 }, { archetype: 'mage', x: x0 + 8, y: y0 });
  }
  const setup: PartySetup = { members, barriers: [] };
  const sim = new Simulation(setup, seed);
  sim.start(); // fase de combate: step() só avança em 'running'
  return { sim, x0, y: y0 };
}

/** Monstro comum de teste (grunt) num tile; `aura` torna-o portador. */
const monstro = (sim: Simulation, x: number, y: number, aura?: AuraKind, hp = VIDA): Unit => {
  const u = sim.spawnEnemyAt('grunt', x, y, hp, aura);
  if (!u) throw new Error(`auraCheck: tile ${x},${y} ocupado`);
  return u;
};

/** Avança `n` ticks e devolve os eventos. */
function passos(sim: Simulation, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n && sim.phase === 'running'; i++) out.push(...sim.step());
  return out;
}

/** Roda uma onda até o fim (ou `teto` ticks) e anota cada monstro que nasceu com a aura dele. */
function onda(opts: { auraChance?: number; count?: number; boss?: string | null; mix?: { kind: string; weight: number }[]; endless?: boolean }, seed: number, teto = 6000) {
  applyZone(ZONA, { seed, ...opts });
  const sim = new Simulation(DEFAULT_SETUP, seed);
  sim.start();
  const nasceu = new Map<number, { kind: string; aura?: AuraKind }>();
  for (let t = 0; t < teto && sim.phase === 'running'; t++) {
    for (const e of sim.step()) {
      if (e.type !== 'spawn') continue;
      const u = sim.units.get(e.unitId);
      if (u) nasceu.set(u.id, { kind: u.kind, aura: u.aura });
    }
  }
  return { sim, nasceu };
}

/** Hash FNV-1a dos eventos de uma batalha inteira (mesmo jogo = mesmo hash). */
function hashBatalha(opts: { auraChance?: number }, seed: number, teto: number): { hash: number; portadores: number } {
  applyZone(ZONA, { seed, ...opts });
  const sim = new Simulation(DEFAULT_SETUP, seed);
  sim.start();
  let h = 2166136261;
  let portadores = 0;
  for (let t = 0; t < teto && sim.phase === 'running'; t++) {
    for (const e of sim.step()) {
      const s = JSON.stringify(e);
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    }
    portadores = Math.max(portadores, sim.auraCarriers().length);
  }
  return { hash: h >>> 0, portadores };
}

// ---------- (a) chance 0 ----------
{
  const semCampo = hashBatalha({}, 4242, 3000);
  const comZero = hashBatalha({ auraChance: 0 }, 4242, 3000);
  check('(a) chance 0: nenhum portador', semCampo.portadores === 0 && comZero.portadores === 0);
  check('(a) chance 0: mesma sequência de eventos de sem o campo', semCampo.hash === comZero.hash, `hash ${semCampo.hash.toString(16)}`);
}

// ---------- (b) chance 1: as cinco auras aparecem ----------
{
  const { nasceu } = onda({ auraChance: 1, count: 150, boss: null }, 777);
  const porAura: Record<string, number> = {};
  for (const v of nasceu.values()) if (v.aura) porAura[v.aura] = (porAura[v.aura] ?? 0) + 1;
  const total = Object.values(porAura).reduce((a, b) => a + b, 0);
  check('(b) chance 1: monstros nascem portadores', total > 50, `${total} portadores de ${nasceu.size} monstros`);
  check('(b) as cinco auras aparecem (sorteio uniforme)', AURA_KINDS.every((k) => (porAura[k] ?? 0) >= 10), AURA_KINDS.map((k) => `${k} ${porAura[k] ?? 0}`).join(' · '));
}

// ---------- (c) chefes e elites nunca são portadores ----------
{
  // elites no sorteio (sem chefe): nenhum vira portador; os comuns do mesmo sorteio viram
  const { nasceu } = onda({ auraChance: 1, count: 60, boss: null, mix: [{ kind: 'elite', weight: 1 }, { kind: 'grunt', weight: 1 }] }, 778);
  const chefes = [...nasceu.values()].filter((v) => GAME_CONFIG.bossKinds.includes(v.kind));
  const chefesComAura = chefes.filter((v) => v.aura).length;
  const comunsComAura = [...nasceu.values()].filter((v) => !GAME_CONFIG.bossKinds.includes(v.kind) && v.aura).length;
  check('(c) elites nascem sem aura, mesmo no sorteio da horda', chefes.length > 0 && chefesComAura === 0, `${chefes.length} elites vistos, ${chefesComAura} com aura`);
  check('(c) comuns seguem sendo portadores no mesmo sorteio', comunsComAura > 0, `${comunsComAura} comuns com aura`);
}
{
  // chefe da onda: poucos grunts e o chefe no fim; ele precisa aparecer para a checagem valer
  const { sim, nasceu } = onda({ auraChance: 1, count: 6, boss: 'dinoBoss', mix: [{ kind: 'grunt', weight: 1 }] }, 779);
  const chefes = [...nasceu.values()].filter((v) => v.kind === 'dinoBoss');
  check('(c) o chefe da onda entrou no campo', sim.bossSpawned && chefes.length === 1, `${chefes.length} chefe(s) visto(s)`);
  check('(c) o chefe nasce sem aura', chefes.length === 1 && !chefes[0].aura, `aura: ${chefes[0]?.aura ?? 'nenhuma'}`);
}

// ---------- (d) velocidade ----------
{
  const c = cena(31, 'longe');
  const g = enemyStats('grunt');
  const C = monstro(c.sim, c.x0, c.y, 'velocidade');
  const V = monstro(c.sim, c.x0 + 1, c.y);
  const W = monstro(c.sim, c.x0 + 4, c.y);
  // movimentos diretos da simulação (mesmo caminho do jogo), todos para o tile de baixo (plano e livre)
  const mover = (u: Unit) => c.sim['moveEnemy'](u, { x: 0, y: 1 }, g);
  mover(V);
  mover(W);
  mover(C);
  const esperadoV = Math.round(g.moveTicks * AURA.velocidade.passo);
  check('(d) velocidade: aliado em alcance anda no passo × 0,75', V.moveTicks === esperadoV, `${V.moveTicks} ticks (base ${g.moveTicks})`);
  check('(d) fora do alcance e o próprio portador andam no tempo normal', W.moveTicks === g.moveTicks && C.moveTicks === g.moveTicks, `fora ${W.moveTicks} · portador ${C.moveTicks}`);
}

// ---------- (e) regeneração ----------
{
  const c = cena(32, 'longe');
  const R = parado(monstro(c.sim, c.x0, c.y, 'regeneracao'));
  R.hp = 500000;
  const A = parado(monstro(c.sim, c.x0 + 2, c.y, undefined, 100));
  A.hp = 50;
  const O = parado(monstro(c.sim, c.x0 + 3, c.y, undefined, 100));
  O.hp = 50;
  const evs = passos(c.sim, 20); // 2 segundos = 2 pulsos
  const danosAliados = evs.filter((e) => e.type === 'damage' && [A.id, O.id, R.id].includes(e.unitId)).length;
  check('(e) regeneração: aliado em alcance recupera 2% da vida máxima por segundo', near(A.hp, 54, 0.01), `vida ${A.hp.toFixed(2)} (era 50, máx 100)`);
  check('(e) fora do alcance não recupera vida', O.hp === 50, `vida ${O.hp}`);
  check('(e) o portador não se cura pela própria aura', R.hp === 500000, `vida ${R.hp}`);
  check('(e) nenhum dano nos monstros de teste (a cena segue limpa)', danosAliados === 0, `${danosAliados} golpes`);
}

// ---------- (f) mitigação ----------
{
  const c = cena(33, 'longe');
  const heroi = c.sim.sortedUnits('party')[0];
  const C = monstro(c.sim, c.x0, c.y, 'mitigacao');
  const M = monstro(c.sim, c.x0 + 1, c.y);
  const N = monstro(c.sim, c.x0 + 4, c.y);
  /** Quanto o alvo perde com `f`. */
  const perda = (u: Unit, f: () => void) => {
    const antes = u.hp;
    f();
    return antes - u.hp;
  };
  const pM = perda(M, () => c.sim.damage(M, 100, 'bolt', heroi.id, false));
  const pN = perda(N, () => c.sim.damage(N, 100, 'bolt', heroi.id, false));
  const pC = perda(C, () => c.sim.damage(C, 100, 'bolt', heroi.id, false));
  check('(f) mitigação: aliado em alcance leva 25% a menos da party', near(pM, 100 * (1 - AURA.mitigacao.reducao)), `${pM} de 100`);
  check('(f) fora do alcance e o próprio portador levam o dano cheio', near(pN, 100) && near(pC, 100), `fora ${pN} · portador ${pC}`);
  const pTorre = perda(M, () => c.sim.damage(M, 100, 'tower'));
  check('(f) dano sem autor da party (torre) não é mitigado', near(pTorre, 100), `${pTorre} de 100`);
  monstro(c.sim, c.x0 + 1, c.y + 1, 'mitigacao');
  const pDois = perda(M, () => c.sim.damage(M, 100, 'bolt', heroi.id, false));
  check('(f) dois portadores da mesma aura não acumulam', near(pDois, 75), `${pDois} de 100`);
}

// ---------- (g) queimação ----------
{
  const c = cena(34, 'perto', 0);
  const [guerreiro, mago] = ['warrior', 'mage'].map((k) => c.sim.sortedUnits('party').find((u) => u.kind === k)!);
  parado(monstro(c.sim, c.x0, c.y, 'queimacao'));
  const evs = passos(c.sim, 30); // 3 segundos
  const pulsos = (u: Unit) => evs.filter((e): e is Extract<SimEvent, { type: 'damage' }> => e.type === 'damage' && e.unitId === u.id && e.source === 'burn');
  const pertoN = pulsos(guerreiro).length;
  check('(g) herói em alcance leva um pulso por segundo', pertoN === 3, `${pertoN} pulsos em 3 s`);
  check('(g) herói fora do alcance não queima', pulsos(mago).length === 0, `${pulsos(mago).length} pulsos`);
  const base = AURA.queimacao.fracaoDoDano * enemyStats('grunt').damage * GAME_CONFIG.wave.dmgMult;
  const tm = guerreiro.stats?.damageTakenMult ?? 1;
  const esperado = Math.max(1, Math.round(base * tm * 10) / 10);
  check('(g) cada pulso é metade do dano do portador', pulsos(guerreiro).every((e) => near(e.amount, esperado)), `esperado ${esperado} por pulso`);
}

// ---------- (h) crítico ----------
{
  const c = cena(35, 'longe');
  const heroi = c.sim.sortedUnits('party')[0];
  heroi.hp = 1e12;
  const g = enemyStats('grunt');
  const C = monstro(c.sim, c.x0, c.y, 'critico');
  const M = monstro(c.sim, c.x0 + 1, c.y);
  const N = monstro(c.sim, c.x0 + 4, c.y);
  const tm = heroi.stats?.damageTakenMult ?? 1;
  const normal = Math.max(1, Math.round(g.damage * GAME_CONFIG.wave.dmgMult * tm * 10) / 10);
  const critico = Math.max(1, Math.round(g.damage * AURA.critico.dano * GAME_CONFIG.wave.dmgMult * tm * 10) / 10);
  /** Golpes de `u` no herói (400 seguidos), só os que acertaram. */
  const golpes = (u: Unit) => {
    const evs: Extract<SimEvent, { type: 'damage' }>[] = [];
    const sair = c.sim.onEvent((e) => {
      if (e.type === 'damage' && e.sourceId === u.id) evs.push(e);
    });
    for (let i = 0; i < 400; i++) c.sim['enemyAttack'](u, heroi, g);
    sair();
    return evs;
  };
  const gM = golpes(M);
  const gN = golpes(N);
  const gC = golpes(C);
  const criticos = (evs: { crit?: boolean }[]) => evs.filter((e) => e.crit).length;
  const fracao = gM.length ? criticos(gM) / gM.length : 0;
  check('(h) crítico: aliado em alcance crita com chance extra (≈20%)', Math.abs(fracao - AURA.critico.chanceExtra) < 0.07, `${(fracao * 100).toFixed(1)}% de ${gM.length} golpes`);
  check('(h) crítico causa 1,5x; golpe normal segue igual', gM.every((e) => (e.crit ? near(e.amount, critico) : near(e.amount, normal))), `normal ${normal} · crítico ${critico}`);
  check('(h) fora do alcance e o próprio portador não criticam', criticos(gN) === 0 && criticos(gC) === 0, `fora ${criticos(gN)} · portador ${criticos(gC)}`);
}

// ---------- (i) gate da campanha ----------
{
  const sem = emptyMeta();
  const dois: MetaStats = { ...emptyMeta(), kills: HERO_UNLOCKS.sorcererKills, bossesKilled: { [HERO_UNLOCKS.warlockBoss]: 1 } };
  const tres: MetaStats = { ...dois, perfectNights: HERO_UNLOCKS.assassinPerfectNights };
  check('(i) campanha sem heróis liberados: sem auras', !auraCampanhaLiberada(sem));
  check('(i) só dois dos três heróis: sem auras', !auraCampanhaLiberada(dois));
  check('(i) quase lá (999 monstros): sem auras', !auraCampanhaLiberada({ ...tres, kills: HERO_UNLOCKS.sorcererKills - 1 }));
  check('(i) os três heróis que se liberam jogando: com auras', auraCampanhaLiberada(tres) && AURA_HEROES_CAMPANHA.length === 3);
}

// ---------- (j) determinismo ----------
{
  const assinatura = (seed: number) => {
    const { nasceu } = onda({ auraChance: 1, count: 80, boss: null }, seed, 1500);
    return [...nasceu.entries()].map(([id, v]) => `${id}:${v.kind}:${v.aura ?? '-'}`).join('|');
  };
  const a1 = assinatura(901);
  const a2 = assinatura(901);
  const a3 = assinatura(902);
  check('(j) mesma semente: mesmos portadores e auras', a1 === a2 && a1.length > 0, `${a1.split('|').length} monstros`);
  check('(j) semente diferente: sorteio diferente', a1 !== a3);
}

// ---------- (k) portador morto e sobrevivência ----------
{
  const c = cena(41, 'longe');
  const heroi = c.sim.sortedUnits('party')[0];
  const C = monstro(c.sim, c.x0, c.y, 'mitigacao');
  const M = monstro(c.sim, c.x0 + 1, c.y);
  check('(k) antes de morrer, o portador conta na lista', c.sim.auraCarriers().length === 1);
  c.sim.damage(C, 2 * VIDA, 'debug');
  passos(c.sim, 1);
  check('(k) portador morto sai da lista de auras', c.sim.auraCarriers().length === 0);
  const antes = M.hp;
  c.sim.damage(M, 100, 'bolt', heroi.id, false);
  check('(k) sem o portador, o monstro leva o dano cheio', near(antes - M.hp, 100), `${antes - M.hp} de 100`);
  applyZone(ZONA, { endless: true, boss: null, count: 99999, seed: 5, auraChance: 1 });
  const cerco = new Simulation(DEFAULT_SETUP, 5);
  cerco.start();
  let comAura = 0;
  for (let t = 0; t < 400 && cerco.phase === 'running'; t++) {
    for (const e of cerco.step()) {
      if (e.type !== 'spawn') continue;
      if (cerco.units.get(e.unitId)?.aura) comAura++;
    }
  }
  check('(k) sobrevivência: nenhum monstro nasce portador, mesmo com chance', comAura === 0 && cerco.spawned > 0, `${cerco.spawned} monstros, ${comAura} com aura`);
}

console.log(failures ? `\n${failures} checagem(ns) falharam.` : '\nTodas as checagens das auras passaram.');
if (failures) throw new Error(`auraCheck: ${failures} falha(s)`);
