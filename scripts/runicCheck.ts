/**
 * Checagem headless das 5 habilidades do Cavaleiro Rúnico (Guerreiro): Lâmina Encantada,
 * Onda Sônica, Limite da Morte (marca + devolução), Cem Lanças e Cortador de Vento.
 * Uma linha por item: ok ou FALHA (com o motivo observado). Sai com código 1 se algo falhar.
 *
 * Como roda: perfil -> heroStats -> Simulation, igual ao jogo; arena 40×30 de teste (TEST_ZONE).
 * Nos cenários de número exato o movimento de combate fica desligado (sim.mods.combatMovement = false),
 * para o herói não andar antes de agir e mudar as distâncias. Os inimigos são bonecos (trainingDummy:
 * parados, não atacam, vida alta), salvo quando o item pede outro tipo. Crítico zerado nesses cenários.
 */
import { GAME_CONFIG, applyZone } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { TEST_ZONE } from '../src/dev/DevLab/skillArenaZone';
import { Simulation } from '../src/core/sim/Simulation';
import type { SimEvent } from '../src/core/sim/types';
import { createProfile, heroStats } from '../src/core/progression/profile';
import { SKILL_NUM, lvOf, type SkillId } from '../src/core/progression/skills';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
const of = <T extends SimEvent['type']>(es: SimEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t);
const hitsOn = (es: SimEvent[], id: number, src?: string) => of(es, 'damage').filter((e) => e.unitId === id && (src === undefined || e.source === src));
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
/** Hash FNV-1a de 32 bits, só para mostrar a assinatura da batalha (a comparação é texto a texto). */
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Posição do Guerreiro na arena (interior aberto, sem pilar). */
const WX = 19;
const WY = 14;

/** Arena de teste com um Guerreiro montado pelo mesmo caminho do jogo (perfil -> heroStats). */
function arena(levels: Partial<Record<SkillId, number>>, weapon?: string) {
  applyZone(TEST_ZONE);
  const p = createProfile();
  const h = p.heroes.warrior;
  Object.assign(h.skills, levels);
  if (weapon) h.equipment.weapon = { ...h.equipment.weapon!, kind: weapon };
  const stats = heroStats(p, 'warrior');
  // locked: [] = sem limite de slots de Mana (isola a habilidade testada)
  const sim = new Simulation({ members: [{ archetype: 'warrior', x: WX, y: WY }], barriers: [] }, 4242, {
    warrior: { stats, level: 1, exp: 0, locked: [] },
  });
  sim.mods = { ...sim.mods, combatMovement: false };
  sim.start();
  const w = sim.sortedUnits('party')[0];
  w.stats!.crit = 0; // número exato: sem sorteio de crítico
  return { sim, w };
}

class Report {
  private readonly ok: string[] = [];
  private readonly bad: string[] = [];
  constructor(
    private readonly n: number,
    private readonly title: string,
  ) {}
  /** Registra uma checagem: `ok` se passou, `fail` (motivo) se não passou. */
  check(cond: boolean, ok: string, fail: string = ok): void {
    (cond ? this.ok : this.bad).push(cond ? ok : fail);
  }
  get failed(): boolean {
    return this.bad.length > 0;
  }
  line(): string {
    const head = this.failed ? 'FALHA' : 'ok   ';
    const tail = this.failed ? ` · motivo: ${this.bad.join('; ')}` : '';
    return `${head} ${this.n}. ${this.title} — ${this.ok.join('; ')}${tail}`;
  }
}

const reports: Report[] = [];
function item(n: number, title: string, body: (r: Report) => void): void {
  const r = new Report(n, title);
  try {
    body(r);
  } catch (err) {
    r.check(false, '', `exceção: ${(err as Error).message}`);
  }
  reports.push(r);
  console.log(r.line());
}

// ---------- 1) Lâmina Encantada ----------
item(1, 'Lâmina Encantada', (r) => {
  const n = SKILL_NUM.enchantBlade(3);
  {
    const { sim, w } = arena({ enchantBlade: 3 });
    const d = sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6)!;
    const t1 = sim.step();
    const cast = of(t1, 'enchantBlade')[0];
    r.check(!!cast && cast.unitId === w.id && cast.ticks === n.ticks, `emite enchantBlade com inimigo colado (${n.ticks} ticks)`, `enchantBlade ausente ou errado (${cast ? JSON.stringify(cast) : 'nenhum'})`);
    const first = hitsOn(t1, d.id, 'enchant');
    r.check(
      first.length === 1 && near(first[0].amount, n.bonus * w.stats!.skillDamageMult) && first[0].sourceId === w.id,
      'o golpe do mesmo tick sai com dano enchant',
      `golpe do mesmo tick sem enchant (${first.length} eventos)`,
    );
    r.check(w.enchantUntil === sim.tick + n.ticks, 'enchantUntil = tick + duração', `enchantUntil ${w.enchantUntil} (esperado ${sim.tick + n.ticks})`);

    // bloqueia nova conjuração para ver o fim da janela (senão a recarga renova a magia)
    w.cooldowns.enchantBlade = Number.POSITIVE_INFINITY;
    const end = w.enchantUntil!;
    let hitsIn = 0;
    let magicIn = 0;
    let hitsAfter = 0;
    let magicAfter = 0;
    while (sim.tick < end + 30) {
      const es = sim.step();
      const melee = hitsOn(es, d.id, 'bash').length + hitsOn(es, d.id, 'cleave').length;
      const magic = hitsOn(es, d.id, 'enchant').length;
      if (sim.tick < end) {
        hitsIn += melee;
        magicIn += magic;
      } else {
        hitsAfter += melee;
        magicAfter += magic;
      }
    }
    r.check(hitsIn > 10 && magicIn === hitsIn, `${magicIn}/${hitsIn} golpes na janela com dano mágico`, `janela: ${magicIn} de ${hitsIn} golpes com dano mágico`);
    r.check(hitsAfter > 0 && magicAfter === 0, 'após enchantUntil os golpes voltam ao normal', `após enchantUntil: ${magicAfter} dano(s) mágico(s) em ${hitsAfter} golpes`);
  }
  // alcance da conjuração: 2 casas dispara, 3 não
  for (const [dist, want] of [[2, true], [3, false]] as const) {
    const { sim } = arena({ enchantBlade: 3 });
    sim.spawnEnemyAt('trainingDummy', WX + dist, WY, 1e6);
    const cast = of(sim.step(), 'enchantBlade').length > 0;
    r.check(cast === want, `alcance: ${want ? 'conjura' : 'não conjura'} a ${dist} casas`, `alcance errado a ${dist} casas (conjurou=${cast})`);
  }
});

// ---------- 2) Onda Sônica ----------
item(2, 'Onda Sônica', (r) => {
  const n = SKILL_NUM.sonicWave(3);
  const shot = (dist: number) => {
    const { sim, w } = arena({ sonicWave: 3 });
    const t = sim.spawnEnemyAt('trainingDummy', WX + dist, WY, 1e6)!;
    const es = sim.step();
    return { w, t, waves: of(es, 'sonicWave'), wave: hitsOn(es, t.id, 'wave'), melee: hitsOn(es, t.id, 'bash').length + hitsOn(es, t.id, 'cleave').length };
  };
  for (const dist of [3, 4, 5]) {
    const x = shot(dist);
    const hit = x.wave[0];
    const ok = x.waves.length === 1 && x.waves[0].targetId === x.t.id && !!hit && near(hit.amount, n.damage * x.w.stats!.skillDamageMult);
    r.check(ok, `a ${dist} casas: onda com dano wave ${hit?.amount.toFixed(1)}`, `a ${dist} casas: sem onda correta (${x.waves.length} sonicWave, ${x.wave.length} dano wave)`);
  }
  {
    // a 2 casas o cone do Golpe em Área (alcance 2) pega o alvo antes: a onda só vale a partir de 3 (warrior.ts)
    const x = shot(2);
    r.check(x.waves.length === 0 && x.melee > 0, 'a 2 casas: sem onda (o Golpe em Área pega antes)', `a 2 casas: onda=${x.waves.length}, golpes=${x.melee}`);
  }
  {
    const x = shot(1);
    r.check(x.waves.length === 0 && x.melee > 0, 'colado: sem onda no mesmo tick; o golpe corpo a corpo resolve', `colado: onda=${x.waves.length}, golpes=${x.melee}`);
  }
  {
    const x = shot(6);
    r.check(x.waves.length === 0, 'a 6 casas não dispara (alcance 5)', `a 6 casas dispara (${x.waves.length})`);
  }
});

// ---------- 3) Limite da Morte: marca ----------
item(3, 'Limite da Morte: marca', (r) => {
  const n = SKILL_NUM.deathBound(3);
  {
    const { sim } = arena({ deathBound: 3 });
    const brute = sim.spawnEnemyAt('brute', WX + 2, WY)!; // 85 de vida
    const grunt = sim.spawnEnemyAt('grunt', WX, WY - 3)!; // 30 de vida
    const b = of(sim.step(), 'deathBound')[0];
    r.check(!!b && b.targetId === brute.id && b.ticks === n.ticks, 'marca o mais forte (85 > 30) e emite deathBound', `marcou ${b?.targetId ?? 'ninguém'} (esperado ${brute.id})`);
    r.check((brute.markedUntil ?? 0) > sim.tick && (grunt.markedUntil ?? 0) <= sim.tick, 'só o alvo recebe markedUntil', 'markedUntil em unidade errada');
  }
  {
    const { sim } = arena({ deathBound: 3 });
    const boss = sim.spawnEnemyAt('boss', WX + 2, WY)!; // chefe com 220 de vida
    const grunt = sim.spawnEnemyAt('grunt', WX, WY - 3)!;
    const b = of(sim.step(), 'deathBound')[0];
    r.check(!!b && b.targetId === grunt.id && (boss.markedUntil ?? 0) <= sim.tick, 'chefe (220 de vida) ignorado; marca o comum (30)', `marcou ${b?.targetId ?? 'ninguém'}; chefe marcado=${(boss.markedUntil ?? 0) > sim.tick}`);
  }
  {
    const marcados: string[] = [];
    for (const kind of GAME_CONFIG.bossKinds) {
      const { sim } = arena({ deathBound: 3 });
      const u = sim.spawnEnemyAt(kind, WX + 3, WY)!;
      const es = sim.step();
      if ((u.markedUntil ?? 0) > sim.tick || of(es, 'deathBound').length > 0) marcados.push(kind);
    }
    r.check(marcados.length === 0, `nenhum dos ${GAME_CONFIG.bossKinds.length} tipos de chefe é marcado`, `chefes marcados: ${marcados.join(', ')}`);
  }
});

// ---------- 4) Limite da Morte: devolução ----------
item(4, 'Limite da Morte: devolução', (r) => {
  const n = SKILL_NUM.deathBound(3);
  const a = arena({ deathBound: 3 });
  const d = a.sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6)!;
  const ea = a.sim.step();
  const marked = hitsOn(ea, d.id, 'bash')[0];
  const back = of(ea, 'damage').find((e) => e.source === 'reflect');

  // controle: mesmo golpe sem marca
  const c = arena({});
  const d2 = c.sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6)!;
  const plain = hitsOn(c.sim.step(), d2.id, 'bash')[0];

  const ratio = marked && plain ? marked.amount / plain.amount : NaN;
  r.check(near(ratio, 1 + n.amp), `golpe marcado ${marked?.amount.toFixed(2)} = normal ${plain?.amount.toFixed(2)} × ${(1 + n.amp).toFixed(2)}`, `golpe marcado ${marked?.amount} vs normal ${plain?.amount} (razão ${ratio.toFixed(3)}, esperado ${(1 + n.amp).toFixed(2)})`);

  const expectBack = marked ? Math.max(1, marked.amount * n.reflect * a.w.stats!.damageTakenMult) : NaN;
  r.check(
    !!back && back.unitId === a.w.id && Math.abs(back.amount - expectBack) <= 0.05 + 1e-9,
    `devolve ${back?.amount.toFixed(1)} ao Guerreiro (source reflect)`,
    `devolução: ${back ? `${back.amount} no alvo ${back.unitId}` : 'nenhum evento reflect'} (esperado ~${expectBack.toFixed(2)} no Guerreiro)`,
  );

  // dano contínuo não devolve; golpe direto devolve
  const b = arena({ deathBound: 3 });
  const dd = b.sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6)!;
  b.sim.step();
  const comReflexo: string[] = [];
  let amplificado = false;
  for (const src of ['burn', 'poison', 'curse', 'combust', 'oil', 'ruin'] as const) {
    b.sim.flushEvents();
    const h0 = dd.hp;
    b.sim.damage(dd, 10, src, b.w.id);
    if (src === 'burn') amplificado = near(h0 - dd.hp, 10 * (1 + n.amp));
    if (b.sim.flushEvents().some((e) => e.type === 'damage' && e.source === 'reflect')) comReflexo.push(src);
  }
  r.check(comReflexo.length === 0 && amplificado, 'contínuo (queimadura, veneno, maldição...) não devolve, mas ainda sofre a marca', `contínuo: devolveu=[${comReflexo.join(', ')}], marca aplicada=${amplificado}`);
  b.sim.flushEvents();
  b.sim.damage(dd, 10, 'wave', b.w.id);
  const direto = b.sim.flushEvents().some((e) => e.type === 'damage' && e.source === 'reflect');
  r.check(direto, 'golpe direto (onda) devolve', 'golpe direto (onda) NÃO devolve');
});

// ---------- 5) Cem Lanças ----------
item(5, 'Cem Lanças', (r) => {
  const cluster = (sim: ReturnType<typeof arena>['sim'], dx: number) => [
    sim.spawnEnemyAt('trainingDummy', WX + dx, WY, 1e6)!,
    sim.spawnEnemyAt('trainingDummy', WX + dx + 1, WY, 1e6)!,
    sim.spawnEnemyAt('trainingDummy', WX + dx, WY + 1, 1e6)!,
  ];
  {
    const { sim, w } = arena({ hundredSpear: 3 }, 'sword');
    cluster(sim, 4);
    let casts = 0;
    let spear = 0;
    for (let i = 0; i < 30; i++) {
      const es = sim.step();
      casts += of(es, 'hundredSpear').length;
      spear += of(es, 'damage').filter((e) => e.source === 'spear').length;
    }
    r.check(casts === 0 && spear === 0, `sem lança (arma: ${w.stats!.weapon}): 0 Cem Lanças em 30 ticks`, `sem lança disparou: ${casts} Cem Lanças, ${spear} golpes spear`);
  }
  for (const [lv, hits] of [[3, 5], [6, 7]] as const) {
    const { sim, w } = arena({ hundredSpear: lv }, 'spear');
    const ds = cluster(sim, 4);
    const es = sim.step();
    const cast = of(es, 'hundredSpear')[0];
    const n = SKILL_NUM.hundredSpear(lv);
    const perEnemy = ds.map((d) => hitsOn(es, d.id, 'spear').length);
    const dmgOk = of(es, 'damage').filter((e) => e.source === 'spear').every((e) => near(e.amount, n.damage * w.stats!.skillDamageMult));
    r.check(
      !!cast && cast.hits === hits && cast.tiles.length === 3 && perEnemy.every((k) => k === hits) && dmgOk,
      `lança, nível ${lv}: ${hits} golpes em cada um dos 3 do raio`,
      `lança, nível ${lv}: hits=${cast?.hits} (esperado ${hits}), casas=${cast?.tiles.length}, golpes por inimigo=[${perEnemy}], dano ok=${dmgOk}`,
    );
  }
  {
    const { sim } = arena({ hundredSpear: 3 }, 'spear');
    cluster(sim, 8);
    const casts = of(sim.step(), 'hundredSpear').length;
    r.check(casts === 0, 'alvos a 8 casas (fora do alcance 7): não usa', `alvo fora do alcance usou Cem Lanças (${casts})`);
  }
});

// ---------- 6) Cortador de Vento ----------
item(6, 'Cortador de Vento', (r) => {
  const n = SKILL_NUM.windCutter(3);
  {
    const { sim, w } = arena({ windCutter: 3 }, 'sword');
    sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6);
    sim.spawnEnemyAt('trainingDummy', WX - 1, WY, 1e6);
    const es = sim.step();
    const wc = of(es, 'windCutter')[0];
    const winds = of(es, 'damage').filter((e) => e.source === 'wind');
    r.check(
      !!wc && wc.hits === 2 && wc.radius === 1 && winds.length === 2 && winds.every((e) => near(e.amount, n.damage * w.stats!.skillDamageMult)),
      `2 inimigos em volta: giro com dano wind ${winds[0]?.amount.toFixed(1)} em cada`,
      `2 inimigos em volta: windCutter=${JSON.stringify(wc ?? null)}, golpes wind=${winds.length}`,
    );
  }
  {
    const { sim } = arena({ windCutter: 3 }, 'sword');
    sim.spawnEnemyAt('trainingDummy', WX + 1, WY, 1e6);
    const casts = of(sim.step(), 'windCutter').length;
    r.check(casts === 0, 'um inimigo só: não gira', `um inimigo só girou (${casts})`);
  }
  {
    const { sim } = arena({ windCutter: 3 }, 'spear');
    sim.spawnEnemyAt('trainingDummy', WX + 2, WY, 1e6);
    sim.spawnEnemyAt('trainingDummy', WX - 2, WY, 1e6);
    const es = sim.step();
    const wc = of(es, 'windCutter')[0];
    const winds = of(es, 'damage').filter((e) => e.source === 'wind');
    r.check(
      !!wc && wc.radius === 2 && wc.hits === 2 && winds.length === 2,
      'com lança, o raio vai a 2 casas e pega os 2 inimigos',
      `com lança: windCutter=${wc ? `raio ${wc.radius}, ${wc.hits} alvos` : 'ausente'}, golpes wind=${winds.length}`,
    );
  }
  {
    const { sim } = arena({ windCutter: 3 }, 'sword');
    sim.spawnEnemyAt('trainingDummy', WX + 2, WY, 1e6);
    sim.spawnEnemyAt('trainingDummy', WX - 2, WY, 1e6);
    const casts = of(sim.step(), 'windCutter').length;
    r.check(casts === 0, 'sem lança, a 2 casas não alcança (raio 1)', `sem lança alcançou a 2 casas (${casts})`);
  }
});

// ---------- 7) Sem as habilidades novas: combate igual e determinístico ----------
item(7, 'Sem habilidades novas: mesmo combate', (r) => {
  const NEW_IDS: SkillId[] = ['enchantBlade', 'sonicWave', 'deathBound', 'hundredSpear', 'windCutter'];
  const NEW_SRC = ['enchant', 'wave', 'spear', 'wind', 'reflect'];
  const battle = () => {
    applyZone(ZONES.bridge);
    const sim = new Simulation(structuredClone(ZONES.bridge.defaultSetup), ZONES.bridge.wave.seed);
    sim.start();
    const types = new Set<string>();
    const srcs = new Set<string>();
    const log: string[] = [];
    while (sim.phase === 'running' && sim.tick < 8000) {
      for (const e of sim.step()) {
        types.add(e.type);
        if (e.type === 'damage') srcs.add(e.source);
        log.push(JSON.stringify(e));
      }
    }
    const w = sim.sortedUnits('party', true).find((u) => u.kind === 'warrior');
    const lvs = NEW_IDS.map((id) => lvOf(w?.stats?.skills, id));
    const text = log.join('\n');
    return { text, hash: fnv(text), n: log.length, tick: sim.tick, phase: sim.phase, types, srcs, lvs };
  };
  const a = battle();
  const b = battle();
  r.check(a.text === b.text, `duas execuções idênticas (${a.n} eventos, t=${a.tick}, ${a.phase}, assinatura ${a.hash})`, `execuções diferentes: ${a.n} x ${b.n} eventos, assinaturas ${a.hash} x ${b.hash}`);
  const novosEv = NEW_IDS.filter((id) => a.types.has(id));
  const novosSrc = NEW_SRC.filter((s) => a.srcs.has(s));
  r.check(novosEv.length === 0 && novosSrc.length === 0, 'nenhum evento nem fonte de dano nova', `apareceram: ${[...novosEv, ...novosSrc].join(', ')}`);
  r.check(a.lvs.every((v) => v === 0), 'níveis das 5 habilidades novas = 0 no Guerreiro', `níveis: ${a.lvs.join(',')}`);
});

const falhas = reports.filter((x) => x.failed).length;
console.log(falhas ? `runicCheck: ${falhas} FALHA(S) de ${reports.length} itens` : `runicCheck: tudo certo (${reports.length} itens)`);
// lançar erro = código de saída 1 (mesmo padrão do skillArenaCheck)
if (falhas) throw new Error('runicCheck falhou');
