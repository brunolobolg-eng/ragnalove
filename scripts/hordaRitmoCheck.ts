/**
 * Checagem do ritmo das noites de horda (campanha). Uso: npm run horda:check
 *  (a) toda zona termina (sem trava), mesmo com a montagem padrão;
 *  (b) uma noite vencida nasce o orçamento inteiro (criaturas = count, mais o chefe quando há);
 *  (c) portal extra só abre quando o orçamento chega à sua fração `ativaEm`, em ordem, e só nasce criatura nos
 *      portais abertos;
 *  (d) a noite acaba no tick em que a última criatura morre (nem antes, nem depois);
 *  (e) duas execuções iguais dão exatamente o mesmo resultado;
 *  (f) a duração média de cada noite de horda da campanha fica a ±tolerância do alvo do seu ato, e nenhuma perde.
 * A campanha é percorrida como o main.ts faz (battleFor → applyZone → formacaoPadraoDaNoite → Simulation com o
 * loadout do perfil). A party típica de cada ato é a de scripts/runCheck.ts (mesmos níveis, atributos, habilidades
 * e arma). Escolha de nó: horda, depois elite, depois chefe; cidade e evento não têm batalha.
 */
import '../src/config/gameConfig'; // primeiro: quebra o ciclo zones <-> gameConfig
import { applyZone, GAME_CONFIG } from '../src/config/gameConfig';
import { ALVO_DE_NOITE, ZONES, type ZoneDef } from '../src/config/zones';
import { ACTS } from '../src/config/world';
import { battleFor, newRun, type RunState } from '../src/core/run/run';
import { formacaoPadraoDaNoite } from '../src/core/run/formacao';
import { Simulation, type HeroLoadout } from '../src/core/sim/Simulation';
import { createProfile, heroLockedKeys, heroStats, vocationOf, type Profile } from '../src/core/progression/profile';
import { weaponPower } from '../src/core/progression/equipment';
import { masteryDoHeroi } from '../src/core/progression/arvore';
import type { HeroKind, SkillId } from '../src/core/progression/skills';

const LIMITE = 40000;
const SEMENTES = 5;
const TOL = ALVO_DE_NOITE.tolerancia;

let falhas = 0;
const check = (label: string, cond: boolean, extra = '') => {
  if (cond) console.log(`ok   ${label}${extra ? ` · ${extra}` : ''}`);
  else {
    falhas++;
    console.log(`FALHA ${label}${extra ? ` · ${extra}` : ''}`);
  }
};

// ---------- party típica (mesmos números de scripts/runCheck.ts) ----------
type Build = { level: number; attrs: Partial<Record<HeroKind, Record<string, number>>>; skills: Partial<Record<HeroKind, Partial<Record<SkillId, number>>>> };
const BUILDS: Build[] = [
  { level: 5, attrs: { warrior: { str: 6, vit: 6 }, mage: { int: 9, dex: 3 } }, skills: { warrior: { bash: 2, cleave: 3 }, mage: { frostBolt: 2, fireBarrier: 3 } } },
  { level: 10, attrs: { warrior: { str: 10, vit: 10, dex: 4 }, mage: { int: 16, dex: 6, vit: 3 } }, skills: { warrior: { bash: 4, cleave: 3, ironSkin: 3, taunt: 1, battleBreath: 1, shatter: 1 }, mage: { frostBolt: 4, fireBarrier: 3, frostNova: 2, meditation: 2, doubleBarrier: 1 } } },
  {
    level: 16,
    attrs: { warrior: { str: 18, vit: 14, dex: 10 }, mage: { int: 24, dex: 10, vit: 8 }, archer: { dex: 22, luk: 8, vit: 8 } },
    skills: {
      warrior: { bash: 5, cleave: 4, ironSkin: 4, taunt: 3, battleBreath: 3, shatter: 3, shockwave: 2 },
      mage: { frostBolt: 5, fireBarrier: 4, frostNova: 3, meditation: 3, doubleBarrier: 3, thunderstorm: 1 },
      archer: { preciseShot: 5, arrowRain: 4, eagleEye: 3, piercing: 2, volley: 2 },
    },
  },
];
const PARTY_POR_ATO: HeroKind[][] = [['warrior'], ['warrior', 'mage'], ['warrior', 'mage', 'archer']];
const RARIDADE_POR_ATO = ['common', 'uncommon', 'rare'] as const;

function perfilDoAto(ato: number, party: HeroKind[]): Profile {
  const b = BUILDS[Math.min(ato, 2)];
  const p = createProfile();
  const rar = RARIDADE_POR_ATO[Math.min(ato, 2)];
  for (const k of party) {
    const h = p.heroes[k];
    h.level = b.level;
    for (const [at, v] of Object.entries(b.attrs[k] ?? {})) (h.attrs as unknown as Record<string, number>)[at] += v;
    Object.assign(h.skills, b.skills[k] ?? {});
    Object.assign(h.equipment.weapon!, { rarity: rar }, weaponPower(rar, h.equipment.weapon!.kind!));
  }
  return p;
}

function loadoutDo(p: Profile): Record<string, HeroLoadout> {
  const out: Record<string, HeroLoadout> = {};
  for (const k of Object.keys(p.heroes) as HeroKind[]) {
    const h = p.heroes[k];
    out[k] = { stats: heroStats(p, k), level: h.level, exp: h.exp, locked: heroLockedKeys(p, k), cards: h.cards ?? [], visual: vocationOf(k, h)?.modelo, vocation: vocationOf(k, h)?.id, mastery: masteryDoHeroi(p, k)?.regra };
  }
  return out;
}

// ---------- uma noite ----------
type Abertura = { index: number; tick: number; progressoAntes: number };
type Nascimento = { tick: number; index: number; progressoAntes: number; boss: boolean };
type Noite = {
  zona: string;
  tipo: string;
  ato: number;
  orcamento: number;
  ticks: number;
  vitoria: boolean;
  chefe: boolean;
  nascidas: number;
  aberturas: Abertura[];
  nascimentos: Nascimento[];
  ultimaMorte: number;
  vivosNoFim: number;
  assinatura: number;
};

/** FNV-1a sobre a sequência de eventos: duas execuções iguais têm a mesma assinatura. */
function fnv(h: number, texto: string): number {
  let x = h;
  for (let i = 0; i < texto.length; i++) x = Math.imul(x ^ texto.charCodeAt(i), 16777619) >>> 0;
  return x;
}

function jogaNoite(zone: ZoneDef, wave: Parameters<typeof applyZone>[1], party: HeroKind[], p: Profile, ato: number, tipo: string): Noite {
  applyZone(zone, { ...wave, auraChance: 0 });
  const count = GAME_CONFIG.wave.count as number;
  const setup = formacaoPadraoDaNoite(zone, party);
  setup.members = setup.members.filter((m) => party.includes(m.archetype as HeroKind));
  const sim = new Simulation(setup, undefined, loadoutDo(p), { cityHp: GAME_CONFIG.cityDefense.maxHp, cityMaxHp: GAME_CONFIG.cityDefense.maxHp, usedObjects: [] });
  sim.start();
  const aberturas: Abertura[] = [];
  const nascimentos: Nascimento[] = [];
  const inimigos = new Set<number>();
  let ultimaMorte = -1;
  let assinatura = 2166136261;
  while (sim.phase === 'running' && sim.tick < LIMITE) {
    const antes = sim.spawned / count;
    for (const e of sim.step()) {
      assinatura = fnv(assinatura, `${sim.tick}:${e.type}:${'unitId' in e ? e.unitId : ''};`);
      if (e.type === 'portal') aberturas.push({ index: e.index, tick: sim.tick, progressoAntes: antes });
      if (e.type === 'spawn') {
        inimigos.add(e.unitId);
        const u = sim.units.get(e.unitId);
        nascimentos.push({ tick: sim.tick, index: u?.spawnIndex ?? -1, progressoAntes: antes, boss: GAME_CONFIG.wave.boss !== undefined && u?.kind === GAME_CONFIG.wave.boss });
      }
      if (e.type === 'death' && inimigos.has(e.unitId)) ultimaMorte = sim.tick;
    }
  }
  const vivosNoFim = [...sim.units.values()].filter((u) => u.team === 'enemy' && u.alive).length;
  const chefe = GAME_CONFIG.wave.boss !== undefined;
  return {
    zona: zone.id,
    tipo,
    ato,
    orcamento: count,
    ticks: sim.tick,
    vitoria: sim.phase === 'victory',
    chefe,
    nascidas: nascimentos.filter((n) => !n.boss).length,
    aberturas,
    nascimentos,
    ultimaMorte,
    vivosNoFim,
    assinatura,
  };
}

// ---------- campanha típica ----------
const escolherTipo = (opts: string[]): 'horde' | 'elite' | 'boss' | undefined =>
  opts.includes('horde') ? 'horde' : opts.includes('elite') ? 'elite' : opts.includes('boss') ? 'boss' : undefined;

function campanha(seed: number): Noite[] {
  const run: RunState = newRun('warrior', seed);
  const out: Noite[] = [];
  for (let a = 0; a < ACTS.length; a++) {
    const party = PARTY_POR_ATO[Math.min(a, 2)];
    run.act = a;
    run.party = [...party];
    run.profile = perfilDoAto(a, party);
    ACTS[a].nodes.forEach((node, ni) => {
      run.node = ni;
      const tipo = escolherTipo(node.options);
      if (!tipo) return;
      const { zone, wave } = battleFor(run, tipo);
      out.push(jogaNoite(ZONES[zone.id], wave, party, run.profile, a + 1, tipo));
    });
  }
  return out;
}

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// ---------- (a) toda zona termina, com a montagem padrão ----------
for (const id of Object.keys(ZONES)) {
  if (id === 'town' || id === 'bastionKeep') continue;
  const z = ZONES[id];
  const n = jogaNoite(z, { count: z.wave.count, seed: z.wave.seed }, ['warrior', 'mage'], createProfile(), 1, 'horde');
  check(`(a) zona ${id} termina`, n.ticks < LIMITE && n.vivosNoFim >= 0, `${n.vitoria ? 'vitória' : 'derrota'} em ${n.ticks} ticks`);
}

// ---------- campanha típica: 5 sementes ----------
const t0 = Date.now();
const noites: Noite[] = [];
for (let k = 0; k < SEMENTES; k++) noites.push(...campanha(1000 + k * 7919));
console.log(`(campanha típica: ${SEMENTES} sementes × ${noites.length / SEMENTES} noites, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// ---------- (b), (c), (d) em cada noite ----------
let orcOk = 0;
let portalOk = 0;
let portalIgnorar = 0;
let fimOk = 0;
let termina = 0;
for (const n of noites) {
  if (n.ticks < LIMITE) termina++;
  // (b) noite vencida: nasceu o orçamento inteiro (e o chefe, quando a zona tem)
  if (n.vitoria) {
    const chefeOk = !n.chefe || n.nascimentos.some((x) => x.boss);
    if (n.nascidas === n.orcamento && chefeOk) orcOk++;
  }
  // (c) portal extra: abre no 1º tick em que o orçamento atinge `ativaEm`, em ordem; criatura só em portal aberto
  const ativ = GAME_CONFIG.wave.spawnPoints.map((p) => p.ativaEm);
  const abriuEm = new Map<number, number>();
  let ordemOk = true;
  let ultimoIdx = -1;
  for (const a of n.aberturas) {
    const thr = ativ[a.index] ?? 0;
    const certo = a.progressoAntes >= thr && a.progressoAntes - 1 / n.orcamento < thr + 1e-9;
    if (!certo) ordemOk = false;
    if (a.index <= ultimoIdx) ordemOk = false;
    ultimoIdx = a.index;
    abriuEm.set(a.index, a.tick);
  }
  const extrasAbertos = ativ.filter((v) => v !== undefined && v > 0).length;
  if (n.aberturas.length !== extrasAbertos && n.vitoria) ordemOk = false;
  const porPortalOk = n.nascimentos.every((x) => {
    const ab = ativ[x.index];
    if (ab === undefined || ab <= 0) return true;
    const t = abriuEm.get(x.index);
    return t !== undefined && t <= x.tick;
  });
  if (!n.vitoria) portalIgnorar++;
  if (ordemOk && porPortalOk) portalOk++;
  // (d) vitória no tick em que a última criatura morre (ninguém vivo, orçamento e chefe já nasceram)
  if (n.vitoria && n.ultimaMorte === n.ticks && n.vivosNoFim === 0) fimOk++;
}
check('(b) toda noite vencida nasce o orçamento inteiro (e o chefe, quando há)', orcOk === noites.filter((n) => n.vitoria).length, `${orcOk}/${noites.filter((n) => n.vitoria).length} noites`);
check('(c) portal extra abre só depois de ativaEm, em ordem, e só nasce criatura nele', portalOk === noites.length, `${portalOk}/${noites.length} noites`);
check('(d) a noite acaba no tick em que a última criatura morre', fimOk === noites.filter((n) => n.vitoria).length, `${fimOk}/${noites.filter((n) => n.vitoria).length} vitórias`);
check('(a) as noites da campanha terminam (sem trava)', termina === noites.length, `${termina}/${noites.length}`);

// ---------- (e) determinismo ----------
for (const zid of ['bridge', 'rustGorge']) {
  const z = ZONES[zid];
  const w = { count: z.wave.count, seed: z.wave.seed };
  const a = jogaNoite(z, w, ['warrior', 'mage', 'archer'], createProfile(), 3, 'horde');
  const b = jogaNoite(z, w, ['warrior', 'mage', 'archer'], createProfile(), 3, 'horde');
  check(`(e) ${zid}: duas execuções iguais dão o mesmo resultado`, a.assinatura === b.assinatura && a.ticks === b.ticks && a.nascidas === b.nascidas, `assinatura ${a.assinatura}`);
}

// ---------- (f) duração por ato dentro da faixa-alvo ----------
const porZona = new Map<string, Noite[]>();
for (const n of noites) porZona.set(`${n.ato}|${n.zona}`, [...(porZona.get(`${n.ato}|${n.zona}`) ?? []), n]);
console.log('(f) duração média por noite (alvo do ato ±' + Math.round(TOL * 100) + '%):');
for (const [chave, ns] of porZona) {
  const [ato, zid] = chave.split('|');
  const alvo = ALVO_DE_NOITE.duracaoPorAto[Number(ato) - 1];
  const tipo = ns[0].tipo;
  const m = media(ns.map((n) => n.ticks));
  const desvio = (m - alvo) / alvo;
  const todasVitorias = ns.every((n) => n.vitoria);
  check(`(f) ato ${ato} · ${zid} (${tipo}) ${Math.round(m)} ticks`, Math.abs(desvio) <= TOL && todasVitorias, `alvo ${alvo} · ${desvio >= 0 ? '+' : ''}${(desvio * 100).toFixed(1)}% · ${ns.filter((n) => n.vitoria).length}/${ns.length} vitórias · mín ${Math.min(...ns.map((n) => n.ticks))} máx ${Math.max(...ns.map((n) => n.ticks))}`);
}

console.log(falhas ? `\n${falhas} FALHA(S) no ritmo das noites.` : '\nRitmo das noites dentro do esperado.');
if (falhas) throw new Error(`${falhas} FALHA(S) no ritmo das noites`);
