/**
 * Checagem headless das 6 magias novas da Bruxa: Cárcere Etéreo, Eco da Alma, Névoa Gélida,
 * Geada Negra, Lodaçal Abissal e Ápice Sombrio (+ Maldição, recargas, determinismo e "sem as novas").
 * Uma linha por item: ok ou FALHA (com o motivo observado). Sai com código 1 se algo falhar.
 *
 * Como roda: igual ao runicCheck: perfil -> heroStats -> Simulation, arena TEST_ZONE, Bruxa no centro.
 * Nos cenários de número exato: movimento de combate desligado, crítico zerado, recarga × 1, e
 * Dreno de Vida / Maldição com recarga infinita (para o ataque básico não sujar o cenário), salvo
 * quando o item pede. Os inimigos são bonecos (parados, não atacam), salvo nos cenários de batalha.
 * Sem tempo de conjuração: cada magia sai na hora; só a recarga limita.
 */
import { GAME_CONFIG, applyZone } from '../src/config/gameConfig';
import { TEST_ZONE } from '../src/dev/DevLab/skillArenaZone';
import { Simulation } from '../src/core/sim/Simulation';
import type { SimEvent, Unit } from '../src/core/sim/types';
import { createProfile, heroStats } from '../src/core/progression/profile';
import { SKILL_NUM, SKILLS, lvOf, type SkillId } from '../src/core/progression/skills';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
const of = <T extends SimEvent['type']>(es: SimEvent[], t: T): Ev<T>[] => es.filter((e): e is Ev<T> => e.type === t);
const dmg = (es: SimEvent[], id: number, src?: string) => of(es, 'damage').filter((e) => e.unitId === id && (src === undefined || e.source === src));
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
/** Hash FNV-1a de 32 bits, só para mostrar a assinatura da batalha (a comparação é texto a texto). */
const fnv = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};
const CFG = GAME_CONFIG.archetypes.warlock;
const NEW_IDS: SkillId[] = ['etherealCage', 'soulEcho', 'frostMist', 'blackFrost', 'abyssMarsh', 'darkApex'];
const NEW_EVENTS = ['etherealCage', 'soulEcho', 'frostMist', 'chill', 'blackFrost', 'abyssMarsh', 'darkApex'];
const NEW_SOURCES = ['frost'];

/** Posição da Bruxa na arena (interior aberto). */
const WX = 19;
const WY = 14;

interface Arena {
  sim: Simulation;
  w: Unit;
  /** Poder de classe da Bruxa (multiplica o dano base de todas as magias). */
  pw: number;
}

/** Arena com uma Bruxa montada pelo mesmo caminho do jogo (perfil -> heroStats). */
function arena(levels: Partial<Record<SkillId, number>>, opt: { keepBasics?: boolean; seed?: number; crit?: number } = {}): Arena {
  applyZone(TEST_ZONE);
  const p = createProfile();
  Object.assign(p.heroes.warlock.skills, levels);
  const stats = heroStats(p, 'warlock');
  // locked: [] = sem limite de slots de Mana (isola a magia testada)
  const sim = new Simulation({ members: [{ archetype: 'warlock', x: WX, y: WY }], barriers: [] }, opt.seed ?? 4242, {
    warlock: { stats, level: 1, exp: 0, locked: [] },
  });
  sim.mods = { ...sim.mods, combatMovement: false };
  sim.start();
  const w = sim.sortedUnits('party')[0];
  w.stats!.crit = opt.crit ?? 0; // número exato (ou crítico 100% quando o teste pede)
  w.stats!.cooldownMult = 1; // recarga exata
  // Dreno de Vida e Maldição (ataques básicos da Bruxa) ficam de fora, salvo quando o item os usa
  if (!opt.keepBasics) {
    w.cooldowns.lifeDrain = Number.POSITIVE_INFINITY;
    w.cooldowns.curse = Number.POSITIVE_INFINITY;
  }
  return { sim, w, pw: w.stats!.classPower };
}

/** Boneco de treino (parado, não ataca) a `dx` casas da Bruxa, na mesma linha ou com `dy`. */
const dummy = (sim: Simulation, dx: number, dy = 0, hp = 1e6): Unit => sim.spawnEnemyAt('trainingDummy', WX + dx, WY + dy, hp)!;

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

// ---------- 1) Cárcere Etéreo ----------
item(1, 'Cárcere Etéreo', (r) => {
  const L = 3;
  const n = SKILL_NUM.etherealCage(L);
  {
    // lança com a chance forçada: prende e atordoa
    const { sim } = arena({ etherealCage: L });
    sim.chance = () => true;
    const d = dummy(sim, 3);
    const es = sim.step();
    const c = of(es, 'etherealCage')[0];
    r.check(!!c && c.ok && c.targetId === d.id && c.ticks === n.ticks, `lança e prende ${n.ticks} ticks`, `evento ${JSON.stringify(c ?? null)}`);
    r.check((d.cagedUntil ?? 0) === sim.tick + n.ticks, 'cagedUntil = tick + duração', `cagedUntil ${d.cagedUntil} (esperado ${sim.tick + n.ticks})`);
    r.check(d.nextActTick >= sim.tick + n.ticks, 'atordoado (nextActTick empurrado pela duração)', `nextActTick ${d.nextActTick} < ${sim.tick + n.ticks}`);
  }
  {
    // dano que não é de sombra é descartado (vida igual) e sai 'avoid' how 'cage'; sombra passa
    const { sim, w } = arena({ etherealCage: L });
    sim.chance = () => true;
    const d = dummy(sim, 3);
    sim.step();
    const fontes = ['bash', 'arrow', 'bolt', 'frost', 'curse', 'burn', 'melee', 'spell', 'wind'] as const;
    const vazou: string[] = [];
    const semAviso: string[] = [];
    for (const src of fontes) {
      sim.flushEvents();
      const h0 = d.hp;
      sim.damage(d, 50, src, w.id);
      const es = sim.flushEvents();
      if (d.hp !== h0) vazou.push(src);
      if (!es.some((e) => e.type === 'avoid' && e.how === 'cage')) semAviso.push(src);
    }
    r.check(vazou.length === 0 && semAviso.length === 0, `${fontes.length} fontes que não são sombra: vida igual e 'avoid' cage`, `vazou: [${vazou}]; sem avoid cage: [${semAviso}]`);
    sim.flushEvents();
    const h1 = d.hp;
    sim.damage(d, 50, 'shadow', w.id);
    r.check(near(h1 - d.hp, 50), 'dano de sombra passa (50)', `sombra: perdeu ${(h1 - d.hp).toFixed(2)} (esperado 50)`);
  }
  {
    // chefe nunca é preso, mesmo com mais vida que o comum
    const presos: string[] = [];
    let comunsPresos = 0;
    for (const kind of GAME_CONFIG.bossKinds) {
      const { sim } = arena({ etherealCage: L });
      sim.chance = () => true;
      const b = sim.spawnEnemyAt(kind, WX + 2, WY, 5e6);
      const comum = dummy(sim, 4);
      sim.step();
      if (b && (b.cagedUntil ?? 0) > sim.tick) presos.push(kind);
      if ((comum.cagedUntil ?? 0) > sim.tick) comunsPresos++;
    }
    r.check(
      presos.length === 0 && comunsPresos === GAME_CONFIG.bossKinds.length,
      `nenhum dos ${GAME_CONFIG.bossKinds.length} tipos de chefe é preso; o comum ao lado é que vai`,
      `chefes presos: [${presos}]; comuns presos: ${comunsPresos}/${GAME_CONFIG.bossKinds.length}`,
    );
  }
  {
    // alvo de maior vida; empate: menor id
    const { sim } = arena({ etherealCage: L });
    sim.chance = () => true;
    const fraco = sim.spawnEnemyAt('trainingDummy', WX + 2, WY, 1e5)!;
    const forte = sim.spawnEnemyAt('trainingDummy', WX + 5, WY, 5e5)!;
    sim.step();
    r.check((forte.cagedUntil ?? 0) > sim.tick && (fraco.cagedUntil ?? 0) <= sim.tick, 'prende o de maior vida (500 mil > 100 mil), mesmo mais longe', `forte preso=${(forte.cagedUntil ?? 0) > sim.tick}, fraco preso=${(fraco.cagedUntil ?? 0) > sim.tick}`);
  }
  {
    const { sim } = arena({ etherealCage: L });
    sim.chance = () => true;
    const a = dummy(sim, 2);
    const b = dummy(sim, 4);
    sim.step();
    r.check((a.cagedUntil ?? 0) > sim.tick && (b.cagedUntil ?? 0) <= sim.tick, 'empate de vida: prende o de menor id', `preso a=${(a.cagedUntil ?? 0) > sim.tick}, b=${(b.cagedUntil ?? 0) > sim.tick}`);
  }
  {
    // sem alvo ao alcance (7 casas > 6): não lança e não gasta recarga
    const { sim, w } = arena({ etherealCage: L });
    sim.chance = () => true;
    dummy(sim, 7);
    const es = sim.step();
    r.check(of(es, 'etherealCage').length === 0 && w.cooldowns.etherealCage === undefined, 'inimigo a 7 casas: não lança e a recarga fica livre', `lançou=${of(es, 'etherealCage').length}, recarga=${w.cooldowns.etherealCage}`);
  }
  {
    // falha pela chance: evento ok=false, sem prisão, recarga normal
    const { sim, w } = arena({ etherealCage: L });
    sim.chance = () => false;
    const d = dummy(sim, 3);
    const es = sim.step();
    const c = of(es, 'etherealCage')[0];
    r.check(!!c && c.ok === false && (d.cagedUntil ?? 0) <= sim.tick && w.cooldowns.etherealCage === sim.tick + n.cooldown, `falha: ok=false, sem prisão, recarga ${n.cooldown} ticks`, `evento=${JSON.stringify(c ?? null)}, cagedUntil=${d.cagedUntil}, recarga=${w.cooldowns.etherealCage}`);
  }
  {
    // taxa real de sucesso (chance rolada pelo RNG de combate), lv1 = 50%
    let ok = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const { sim } = arena({ etherealCage: 1 }, { seed: 1000 + i });
      dummy(sim, 3);
      if (of(sim.step(), 'etherealCage')[0]?.ok) ok++;
    }
    const taxa = ok / N;
    r.check(taxa > 0.4 && taxa < 0.6, `chance real lv1: ${(taxa * 100).toFixed(0)}% em ${N} tentativas (esperado 50%)`, `chance real lv1: ${(taxa * 100).toFixed(0)}% (esperado 50%)`);
  }
});

// ---------- 2) Eco da Alma ----------
item(2, 'Eco da Alma', (r) => {
  const sumir = (es: SimEvent[], id: number) => dmg(es, id, 'shadow');
  {
    // lv3: alvo mais próximo; área raio 1; 2 golpes em cada um
    const { sim, pw } = arena({ soulEcho: 3 });
    const T = dummy(sim, 3);
    const N = dummy(sim, 3, 1);
    const F = dummy(sim, 6, 6);
    const es = sim.step();
    const ev = of(es, 'soulEcho')[0];
    const base = SKILL_NUM.soulEcho(3).damage * pw;
    r.check(!!ev && ev.targetId === T.id && ev.radius === 1 && ev.doubled === false, 'lv3: alvo = mais próximo; evento com raio 1', `evento=${JSON.stringify(ev ?? null)}`);
    r.check(!!ev && JSON.stringify(ev.targetIds) === JSON.stringify([T.id, N.id]), 'atinge o alvo e o vizinho da área (sem o distante)', `targetIds=${JSON.stringify(ev?.targetIds)}`);
    const doisGolpes = [T, N].every((d) => sumir(es, d.id).length === 2 && sumir(es, d.id).every((e) => near(e.amount, base)));
    r.check(doisGolpes && sumir(es, F.id).length === 0, `exatamente 2 golpes shadow de ${base.toFixed(2)} em cada um da área`, `golpes: T=${sumir(es, T.id).length} N=${sumir(es, N.id).length} F=${sumir(es, F.id).length}; valores=[${sumir(es, T.id).map((e) => e.amount.toFixed(2))}]`);
  }
  {
    // lv4: raio 2 (5×5)
    const { sim, pw } = arena({ soulEcho: 4 });
    const T = dummy(sim, 3);
    const N = dummy(sim, 3, 1);
    const F = dummy(sim, 5);
    const es = sim.step();
    const ev = of(es, 'soulEcho')[0];
    const base = SKILL_NUM.soulEcho(4).damage * pw;
    r.check(!!ev && ev.radius === 2 && sumir(es, F.id).length === 2 && [T, N, F].every((d) => sumir(es, d.id).length === 2), 'lv4: raio 2 pega o de 2 casas do alvo, 2 golpes cada', `radius=${ev?.radius}, golpes F=${sumir(es, F.id).length}`);
    r.check(sumir(es, T.id).every((e) => near(e.amount, base)), `lv4: dano por golpe ${base.toFixed(2)}`, `dano lv4 observado ${sumir(es, T.id).map((e) => e.amount.toFixed(2))}`);
  }
  {
    // alvo preso: dobra; o vizinho não preso sai normal
    const { sim, pw } = arena({ soulEcho: 3 });
    const T = dummy(sim, 3);
    const N = dummy(sim, 3, 1);
    sim.cage(T, 100);
    const es = sim.step();
    const ev = of(es, 'soulEcho')[0];
    const base = SKILL_NUM.soulEcho(3).damage * pw;
    const aT = sumir(es, T.id).map((e) => e.amount);
    const aN = sumir(es, N.id).map((e) => e.amount);
    r.check(!!ev && ev.doubled === true && aT.length === 2 && aT.every((a) => near(a, 2 * base)), `alvo preso: cada golpe ${(2 * base).toFixed(2)} (2× o normal ${base.toFixed(2)})`, `preso: golpes=${aT.map((a) => a.toFixed(2))}, doubled=${ev?.doubled}`);
    r.check(aN.length === 2 && aN.every((a) => near(a, base)), 'vizinho não preso: golpes normais', `vizinho: ${aN.map((a) => a.toFixed(2))}`);
  }
  {
    const { sim } = arena({ soulEcho: 3 });
    dummy(sim, 7);
    const es = sim.step();
    r.check(of(es, 'soulEcho').length === 0, 'inimigo a 7 casas: não lança', 'lançou fora do alcance');
  }
  {
    const req = SKILLS.find((s) => s.id === 'soulEcho')?.requires ?? [];
    r.check(req.length === 1 && req[0].id === 'etherealCage' && req[0].level === 2, 'pré-requisito na árvore: Cárcere Etéreo nível 2', `requires=${JSON.stringify(req)}`);
  }
});

// ---------- 3) Névoa Gélida ----------
item(3, 'Névoa Gélida', (r) => {
  const RAIO: Record<number, number> = { 1: 3, 2: 3, 3: 4, 4: 4, 5: 5 };
  {
    const errados: string[] = [];
    for (const lv of [1, 2, 3, 4, 5]) {
      const { sim } = arena({ frostMist: lv });
      dummy(sim, 3);
      sim.step();
      const m = sim.frostMists[0];
      if (!m || m.radius !== RAIO[lv] || m.untilTick - m.startTick !== 100 + 75 * (lv - 1)) errados.push(`lv${lv}: raio ${m?.radius}, duração ${m ? m.untilTick - m.startTick : '-'}`);
    }
    r.check(errados.length === 0, 'raio 3/3/4/4/5 e duração 100+75×(lv−1) ticks (lv 1 a 5)', `errados: ${errados.join('; ')}`);
  }
  // lv2: E dentro (no centro), F fora (4 casas do centro, fora da área de raio 3)
  const { sim, w, pw } = arena({ frostMist: 2 });
  const E = dummy(sim, 3);
  const F = dummy(sim, 7);
  const effectsAntes = sim.effects.size;
  const todos: SimEvent[] = [];
  const es0 = sim.step();
  todos.push(...es0);
  w.cooldowns.frostMist = Number.POSITIVE_INFINITY; // uma névoa só: sem recast durante a medição
  const cast = of(es0, 'frostMist')[0];
  r.check(!!cast && cast.radius === 3 && cast.ticks === 175, 'evento frostMist com raio 3 e 175 ticks (lv2)', `evento=${JSON.stringify(cast ?? null)}`);
  r.check(sim.effects.size === effectsAntes, 'não cria hazard/efeito de terreno (a horda segue o mesmo campo de fluxo)', `effects ${effectsAntes} -> ${sim.effects.size}`);
  for (let i = 0; i < 200; i++) todos.push(...sim.step());
  const pulsos = dmg(todos, E.id, 'frost');
  r.check(pulsos.length === 17, '17 pulsos em 175 ticks (a cada 10 ticks, sem o do instante zero)', `pulsos=${pulsos.length} (esperado 17)`);
  r.check(dmg(todos, F.id).length === 0, 'inimigo fora da área não leva pulso', `fora da área levou ${dmg(todos, F.id).length} golpe(s)`);
  const primeiro = pulsos[0]?.amount ?? NaN;
  r.check(near(primeiro, 4 * pw), `1º pulso = 2+lv = 4 × poder (${(4 * pw).toFixed(2)})`, `1º pulso ${primeiro}`);
  const resto = pulsos.slice(1).map((e) => e.amount);
  r.check(
    resto.length > 0 && resto.every((a) => near(a, 4 * pw)),
    'pulsos seguintes = 2+lv (sem amplificação)',
    `pulsos seguintes = ${(resto[0] ?? NaN).toFixed(3)} (= ${((resto[0] ?? NaN) / (4 * pw)).toFixed(2)}× o esperado; o Frio +10% amplifica o próprio pulso de gelo)`,
  );
  const frio = of(todos, 'chill').filter((e) => e.unitId === E.id);
  r.check(frio.length === 1 && frio[0].ticks === 20, 'evento chill uma vez (na transição), 20 ticks', `chill do inimigo: ${frio.length} evento(s) ${JSON.stringify(frio[0] ?? null)}`);
  r.check((F.chilledUntil ?? 0) <= sim.tick, 'quem está fora não fica gelado', `F.chilledUntil=${F.chilledUntil}`);
  r.check(sim.frostMists.length === 0, 'a névoa some ao fim da duração', `névoas ativas: ${sim.frostMists.length}`);
  void w;

  // saída da névoa: a névoa se afasta do E; E segue gelado 20 ticks depois do último pulso e para
  {
    const a = arena({ frostMist: 2 });
    const Ea = dummy(a.sim, 3);
    a.sim.step();
    a.w.cooldowns.frostMist = Number.POSITIVE_INFINITY;
    let ultimoPulso = -1;
    for (let i = 0; i < 30; i++) {
      const es = a.sim.step();
      if (dmg(es, Ea.id, 'frost').length) ultimoPulso = a.sim.tick;
    }
    a.sim.frostMists[0].x = WX + 13; // a névoa passa a ficar longe do E
    let golpesDepois = 0;
    let frioDepois = 0;
    for (let i = 0; i < 40; i++) {
      const es = a.sim.step();
      golpesDepois += dmg(es, Ea.id, 'frost').length;
      frioDepois += of(es, 'chill').filter((e) => e.unitId === Ea.id).length;
    }
    r.check(
      Ea.chilledUntil === ultimoPulso + 20 && golpesDepois === 0 && frioDepois === 0 && !((Ea.chilledUntil ?? 0) > a.sim.tick),
      `fora da névoa: gelado até o último pulso + 20 ticks (${ultimoPulso + 20}) e depois para`,
      `chilledUntil=${Ea.chilledUntil} (esperado ${ultimoPulso + 20}), golpes depois=${golpesDepois}, chill depois=${frioDepois}, ainda gelado=${(Ea.chilledUntil ?? 0) > a.sim.tick}`,
    );
  }
  {
    // limite de névoas por Bruxa (regra da implementação, não está no spec): observado
    // 3 lançamentos seguidos (recarga zerada a cada um): o cap da implementação deixa só 2 vivas
    const b = arena({ frostMist: 5 });
    dummy(b.sim, 3);
    for (let k = 0; k < 3; k++) {
      b.sim.step();
      b.w.cooldowns.frostMist = 0;
    }
    r.check(b.sim.frostMists.length <= 2, `névoas simultâneas por Bruxa: ${b.sim.frostMists.length} (cap da implementação MIST_MAX_PER_OWNER=2; o spec não fala nisso)`, `névoas simultâneas: ${b.sim.frostMists.length}`);
  }
});

// ---------- 4) Geada Negra ----------
item(4, 'Geada Negra', (r) => {
  const L = 1;
  const n = SKILL_NUM.blackFrost(L);
  {
    // sem gelo: dano base, área com vários
    const { sim, pw } = arena({ blackFrost: L });
    const A = dummy(sim, 3);
    const B = dummy(sim, 3, 1);
    const C = dummy(sim, 5, -1);
    const D = dummy(sim, 9);
    const es = sim.step();
    const ev = of(es, 'blackFrost')[0];
    const base = n.damage * pw;
    r.check(!!ev && ev.chilled === 0 && JSON.stringify(ev.targetIds) === JSON.stringify([A.id, B.id, C.id]), 'área pega A, B e C (D fora); nenhum estava gelado', `evento=${JSON.stringify(ev ?? null)}`);
    const dA = dmg(es, A.id, 'frost');
    r.check(dA.length === 1 && near(dA[0].amount, base) && dmg(es, C.id, 'frost').every((e) => near(e.amount, base)), `dano frost ${n.damage} × poder = ${base.toFixed(2)} (sem gelo)`, `A=${dA.map((e) => e.amount)}; D atingido=${dmg(es, D.id).length}`);
  }
  {
    // com gelo: a razão observada entre o alvo gelado e o normal
    const { sim, pw } = arena({ blackFrost: L });
    const A = dummy(sim, 3);
    const B = dummy(sim, 3, 1);
    sim.chill(B, 20);
    const es = sim.step();
    const ev = of(es, 'blackFrost')[0];
    const base = n.damage * pw;
    const aA = dmg(es, A.id, 'frost')[0]?.amount ?? NaN;
    const aB = dmg(es, B.id, 'frost')[0]?.amount ?? NaN;
    r.check(!!ev && ev.chilled === 1, 'evento blackFrost conta 1 alvo gelado', `chilled=${ev?.chilled}`);
    const razao = aB / aA;
    r.check(near(razao, n.chillMult, 1e-3), `razão gelado/normal = ${n.chillMult.toFixed(2)} (lv1)`, `razão gelado/normal = ${razao.toFixed(3)} (${aB.toFixed(2)} / ${aA.toFixed(2)}); esperado ${n.chillMult.toFixed(2)}. Causa: damage() aplica o +10% do Frio (dmgTakenAmp) por cima do ×${n.chillMult.toFixed(2)} da Geada, multiplicando (1,4 × 1,1 = 1,54)`);
    r.check(near(aA, base), 'alvo não gelado: dano normal', `A=${aA}`);
  }
  {
    // controle de crítico: sombra critica (100%), gelo nunca critica
    const { sim, w } = arena({ blackFrost: L }, { crit: 1 });
    w.stats!.critDamage = 2;
    const A = dummy(sim, 3);
    const es = sim.step();
    const frio = dmg(es, A.id, 'frost');
    sim.flushEvents();
    sim.damage(A, 10, 'shadow', w.id);
    const sombraEv = sim.flushEvents().filter((e) => e.type === 'damage' && e.source === 'shadow')[0];
    r.check(frio.length > 0 && frio.every((e) => !e.crit), 'nenhum golpe frost critica (com chance 100%)', `frost críticos: ${frio.filter((e) => e.crit).length}`);
    r.check(!!sombraEv && sombraEv.type === 'damage' && !!sombraEv.crit, 'controle: sombra critica com chance 100% (o sorteio funciona)', `sombra crit=${sombraEv && sombraEv.type === 'damage' ? sombraEv.crit : 'sem evento'}`);
  }
  {
    const { sim } = arena({ blackFrost: L });
    dummy(sim, 7);
    const es = sim.step();
    r.check(of(es, 'blackFrost').length === 0, 'inimigo a 7 casas: não lança', 'lançou fora do alcance');
  }
});

// ---------- 5) Lodaçal Abissal ----------
item(5, 'Lodaçal Abissal', (r) => {
  const L = 3;
  {
    const { sim, w } = arena({ abyssMarsh: L });
    const INT = w.stats!.attrs.int;
    const T = dummy(sim, 3);
    const F = dummy(sim, 5);
    const es = sim.step();
    const ev = of(es, 'abyssMarsh')[0];
    const expSlow = Math.min(3.5, 2.0 + 0.25 * (L - 1) + 0.01 * INT);
    const expCurse = Math.min(0.3, 0.15 + 0.03 * (L - 1) + 0.002 * INT);
    r.check(!!ev && ev.targetId === T.id && ev.ticks === 300, 'lança no mais próximo, 300 ticks (30 s)', `evento=${JSON.stringify(ev ?? null)}`);
    r.check(T.slowUntil === sim.tick + 300 && near(T.slowMult ?? 0, expSlow, 1e-9), `lentidão ×${expSlow.toFixed(4)} (INT ${INT.toFixed(1)}) por 300 ticks`, `slowMult=${T.slowMult} (esperado ${expSlow}), slowUntil=${T.slowUntil}`);
    r.check(T.cursedUntil === sim.tick + 300 && near(T.curseAmp ?? 0, expCurse, 1e-9), `vulnerabilidade +${expCurse.toFixed(4)} por 300 ticks`, `curseAmp=${T.curseAmp} (esperado ${expCurse}), cursedUntil=${T.cursedUntil}`);
    r.check((F.slowUntil ?? 0) <= sim.tick && (F.cursedUntil ?? 0) <= sim.tick, 'o de 5 casas não é tocado', 'o segundo inimigo também foi afetado');
    r.check(near(ev?.slowMult ?? NaN, expSlow, 1e-9) && near(ev?.curseAmp ?? NaN, expCurse, 1e-9), 'valores do evento batem com os do alvo', `evento slowMult=${ev?.slowMult}, curseAmp=${ev?.curseAmp}`);
  }
  {
    // teto: INT alto satura em 3,5 e 0,30
    const { sim, w } = arena({ abyssMarsh: 5 });
    w.stats!.attrs.int = 200; // INT alto de propósito (teste de teto)
    const T = dummy(sim, 3);
    sim.step();
    r.check(near(T.slowMult ?? 0, 3.5) && near(T.curseAmp ?? 0, 0.3), 'teto: lentidão 3,5 e vulnerabilidade 0,30 com INT alto', `slowMult=${T.slowMult}, curseAmp=${T.curseAmp}`);
  }
  {
    // lentidão mais forte não é sobrescrita por uma mais fraca
    const { sim } = arena({ abyssMarsh: 1 });
    const T = dummy(sim, 3);
    sim.applySlow(T, 3.0, 300);
    const fimAntes = T.slowUntil;
    sim.step();
    r.check(T.slowMult === 3.0 && T.slowUntil === fimAntes, 'forte (×3,0) antes: a fraca do Lodaçal (lv1) não sobrescreve', `slowMult=${T.slowMult}, slowUntil=${T.slowUntil} (antes ${fimAntes})`);
  }
  {
    // lentidão mais fraca dá lugar à mais forte
    const { sim } = arena({ abyssMarsh: L });
    const T = dummy(sim, 3);
    sim.applySlow(T, 1.2, 300);
    sim.step();
    const INT = sim.sortedUnits('party')[0].stats!.attrs.int;
    r.check(near(T.slowMult ?? 0, Math.min(3.5, 2.5 + 0.01 * INT)), 'fraca (×1,2) antes: a do Lodaçal (lv3) substitui', `slowMult=${T.slowMult}`);
  }
  {
    // vulnerabilidade: vale o maior amp (maldição antes, mais forte)
    const { sim } = arena({ abyssMarsh: 1 });
    const T = dummy(sim, 3);
    sim.curse(T, 0.25, 300);
    sim.step();
    r.check(near(T.curseAmp ?? 0, 0.25), 'maldição forte (0,25) antes: o Lodaçal (lv1) não reduz', `curseAmp=${T.curseAmp}`);
  }
  {
    const { sim } = arena({ abyssMarsh: L });
    dummy(sim, 7);
    const es = sim.step();
    r.check(of(es, 'abyssMarsh').length === 0, 'inimigo a 7 casas: não lança', 'lançou fora do alcance');
  }
});

// ---------- 6) Ápice Sombrio ----------
item(6, 'Ápice Sombrio', (r) => {
  const L = 2;
  const n = SKILL_NUM.darkApex(L);
  {
    // lança e NÃO consome a ação: o Dreno de Vida sai no mesmo tick, já ampliado
    const { sim, w, pw } = arena({ darkApex: L }, { keepBasics: true });
    const d = dummy(sim, 3);
    const es = sim.step();
    const ap = of(es, 'darkApex')[0];
    const ldEv = of(es, 'shadowBolt').find((e) => e.unitId === w.id);
    r.check(!!ap && ap.ticks === n.ticks && near(ap.amp, n.amp), `buff: ${n.ticks} ticks, +${(n.amp * 100).toFixed(0)}%`, `evento=${JSON.stringify(ap ?? null)}`);
    r.check(w.apexUntil === sim.tick + n.ticks && near(w.apexAmp ?? 0, n.amp), 'apexUntil = tick + duração; apexAmp = amp', `apexUntil=${w.apexUntil}, apexAmp=${w.apexAmp}`);
    r.check(!!ldEv && dmg(es, d.id, 'shadow').length > 0, 'não consome a ação: o Dreno de Vida sai no mesmo tick', `shadowBolt no tick=${!!ldEv}`);
    const ldDano = dmg(es, d.id, 'shadow')[0]?.amount ?? NaN;
    // Dreno de Vida (lv1 da Bruxa padrão) = dano base × poder de classe; com Ápice sai × (1+amp)
    const ldBase = CFG.drain.damage * SKILL_NUM.lifeDrain(1).dmgMult * pw;
    r.check(near(ldDano, ldBase * (1 + n.amp), 1e-6), `Dreno de Vida ampliado: ${ldDano.toFixed(3)} = base × ${(1 + n.amp).toFixed(2)}`, `Dreno: ${ldDano.toFixed(3)} (esperado ${(ldBase * (1 + n.amp)).toFixed(3)})`);
  }
  {
    // sombra, maldição e gelo saem ×(1+amp); fonte normal não
    const { sim, w } = arena({ darkApex: L });
    const d = dummy(sim, 3);
    sim.step();
    sim.flushEvents();
    const amp = (src: string) => {
      sim.flushEvents();
      const h0 = d.hp;
      sim.damage(d, 10, src as Parameters<Simulation['damage']>[2], w.id);
      const e = sim.flushEvents().find((x) => x.type === 'damage');
      void h0;
      return e && e.type === 'damage' ? e.amount : NaN;
    };
    const amplificados = (['shadow', 'curse', 'frost'] as const).map((s) => [s, amp(s)] as const);
    const normais = (['bash', 'bolt', 'melee', 'spell', 'arrow', 'wind'] as const).map((s) => [s, amp(s)] as const);
    const okAmp = amplificados.every(([, a]) => near(a, 10 * (1 + n.amp)));
    const okNorm = normais.every(([, a]) => near(a, 10));
    r.check(okAmp, `sombra/maldição/gelo: 10 → ${(10 * (1 + n.amp)).toFixed(2)}`, `ampliados: ${amplificados.map(([s, a]) => `${s}=${a}`).join(' ')}`);
    r.check(okNorm, 'fonte normal (bash, bolt, melee, spell, arrow, wind): 10, sem ampliar', `normais: ${normais.map(([s, a]) => `${s}=${a}`).join(' ')}`);
  }
  {
    // acaba depois da duração
    const { sim, w } = arena({ darkApex: L });
    dummy(sim, 3);
    sim.step();
    const fim = w.apexUntil ?? 0;
    while (sim.tick <= fim) sim.step();
    const d = sim.enemies()[0];
    sim.flushEvents();
    sim.damage(d, 10, 'shadow', w.id);
    const e = sim.flushEvents().find((x) => x.type === 'damage');
    r.check(e?.type === 'damage' && near(e.amount, 10), 'depois de 330 ticks: sombra volta a 10 (sem amp)', `depois do fim: ${e && e.type === 'damage' ? e.amount : 'sem dano'}`);
    r.check(w.cooldowns.darkApex === w.apexUntil! - n.ticks + n.cooldown, `recarga ${n.cooldown} ticks (lv2)`, `recarga=${w.cooldowns.darkApex}`);
  }
  {
    // valores por nível (duração, amp, recarga)
    const erros: string[] = [];
    for (let lv = 1; lv <= 5; lv++) {
      const { sim, w } = arena({ darkApex: lv });
      dummy(sim, 3);
      const ap = of(sim.step(), 'darkApex')[0];
      const eAmp = 0.15 + 0.02 * (lv - 1);
      const eTicks = 300 + 30 * (lv - 1);
      const eCd = 600 - 40 * (lv - 1);
      if (!ap || !near(ap.amp, eAmp) || ap.ticks !== eTicks || w.cooldowns.darkApex !== 1 + eCd) erros.push(`lv${lv}: amp ${ap?.amp}, ticks ${ap?.ticks}, recarga ${w.cooldowns.darkApex}`);
    }
    r.check(erros.length === 0, 'lv1..5: amp 15%→23%, duração 300→420 ticks, recarga 600→440 ticks', erros.join('; '));
  }
  {
    const { sim } = arena({ darkApex: L });
    dummy(sim, 7);
    const es = sim.step();
    r.check(of(es, 'darkApex').length === 0, 'sem inimigo ao alcance (7 casas): não ativa', 'ativou sem inimigo ao alcance');
  }
  {
    const req = (SKILLS.find((s) => s.id === 'darkApex')?.requires ?? []).map((x) => `${x.id}${x.level}`).sort().join(',');
    r.check(req === 'blackFrost2,soulEcho2', 'pré-requisitos na árvore: Geada Negra 2 e Eco da Alma 2', `requires=${req}`);
  }
});

// ---------- 7) Maldição (correção do amplificador) ----------
item(7, 'Maldição: amp vencido não sobrevive', (r) => {
  {
    const { sim, w } = arena({});
    const d = dummy(sim, 3);
    sim.curse(d, 0.3, 60);
    for (let i = 0; i < 61; i++) sim.step();
    r.check((d.cursedUntil ?? 0) <= sim.tick, 'maldição de amp 0,30 expirou', `cursedUntil=${d.cursedUntil}, tick=${sim.tick}`);
    sim.curse(d, 0.1, 60);
    r.check(near(d.curseAmp ?? 0, 0.1), 'nova maldição de amp 0,10 vale só 0,10 (não o 0,30 antigo)', `curseAmp=${d.curseAmp}`);
    sim.flushEvents();
    sim.damage(d, 10, 'bash', w.id);
    const e = sim.flushEvents().find((x) => x.type === 'damage');
    r.check(e?.type === 'damage' && near(e.amount, 11), 'dano confirma: 10 → 11 (×1,10)', `dano=${e && e.type === 'damage' ? e.amount : 'sem dano'}`);
  }
  {
    // enquanto a maldição vale, uma mais fraca não reduz a mais forte
    const { sim } = arena({});
    const d = dummy(sim, 3);
    sim.curse(d, 0.3, 60);
    sim.curse(d, 0.1, 60);
    r.check(near(d.curseAmp ?? 0, 0.3), 'maldição ativa: a mais fraca não reduz (vale o maior: 0,30)', `curseAmp=${d.curseAmp}`);
  }
});

// ---------- 8) Recargas: bate com a fórmula e com o intervalo real entre lançamentos ----------
item(8, 'Recargas', (r) => {
  // fórmulas do spec (lv1 e lv5), conferidas contra SKILL_NUM
  const formula: Array<[SkillId, (lv: number) => number, (lv: number) => number]> = [
    ['frostMist', (lv) => 90 - 5 * (lv - 1), (lv) => SKILL_NUM.frostMist(lv).cooldown],
    ['etherealCage', (lv) => 150 - 10 * (lv - 1), (lv) => SKILL_NUM.etherealCage(lv).cooldown],
    ['soulEcho', (lv) => 70 - 4 * (lv - 1), (lv) => SKILL_NUM.soulEcho(lv).cooldown],
    ['blackFrost', (lv) => 70 - 4 * (lv - 1), (lv) => SKILL_NUM.blackFrost(lv).cooldown],
    ['abyssMarsh', (lv) => 70 - 4 * (lv - 1), (lv) => SKILL_NUM.abyssMarsh(lv).cooldown],
    ['darkApex', (lv) => 600 - 40 * (lv - 1), (lv) => SKILL_NUM.darkApex(lv).cooldown],
  ];
  const evType: Record<string, SimEvent['type']> = { frostMist: 'frostMist', etherealCage: 'etherealCage', soulEcho: 'soulEcho', blackFrost: 'blackFrost', abyssMarsh: 'abyssMarsh', darkApex: 'darkApex' };
  const ruins: string[] = [];
  for (const [id, esperado, real] of formula) {
    for (const lv of [1, 5]) {
      if (real(lv) !== esperado(lv)) ruins.push(`${id} lv${lv}: SKILL_NUM ${real(lv)} ≠ spec ${esperado(lv)}`);
    }
  }
  r.check(ruins.length === 0, 'recargas de SKILL_NUM batem com as fórmulas (6 magias, lv1 e lv5)', ruins.join('; '));

  const gaps: string[] = [];
  const pequenas: string[] = [];
  for (const [id, esperado] of formula) {
    for (const lv of [1, 5]) {
      const { sim } = arena({ [id]: lv } as Partial<Record<SkillId, number>>);
      sim.chance = () => true;
      dummy(sim, 3);
      dummy(sim, 4);
      const ticks: number[] = [];
      for (let i = 0; i < 1400; i++) {
        const es = sim.step();
        if (of(es, evType[id] as 'frostMist').length) ticks.push(sim.tick);
      }
      const diffs = ticks.slice(1).map((t, i) => t - ticks[i]);
      const cd = esperado(lv);
      if (ticks.length < 2) pequenas.push(`${id} lv${lv}: ${ticks.length} lançamento(s)`);
      else if (diffs.some((d) => d !== cd)) gaps.push(`${id} lv${lv}: intervalos ${diffs.slice(0, 4).join('/')} (esperado ${cd})`);
    }
  }
  r.check(gaps.length === 0 && pequenas.length === 0, 'intervalo real entre lançamentos = recarga, em todas (lv1 e lv5)', `${gaps.join('; ')} ${pequenas.join('; ')}`);
});

// ---------- 9) Determinismo ----------
type Batalha = { text: string; n: number; tick: number; phase: string; types: Set<string>; srcs: Set<string>; hash: string };
function batalha(levels: Partial<Record<SkillId, number>>, seed: number, ticks = 3000): Batalha {
  const { sim } = arena(levels, { seed, keepBasics: true });
  // onda mais densa (grunhos em grade a 4–10 casas): luta longa o bastante para o determinismo pesar
  for (let dx = 4; dx <= 10; dx += 2) for (let dy = -6; dy <= 6; dy += 2) sim.spawnEnemyAt('grunt', WX + dx, WY + dy);
  sim.spawnEnemyAt('brute', WX + 5, WY - 1);
  sim.spawnEnemyAt('boss', WX + 8, WY + 4);
  const log: string[] = [];
  const types = new Set<string>();
  const srcs = new Set<string>();
  while (sim.phase === 'running' && sim.tick < ticks) {
    for (const e of sim.step()) {
      types.add(e.type);
      if (e.type === 'damage') srcs.add(e.source);
      log.push(JSON.stringify(e));
    }
  }
  const text = log.join('\n');
  return { text, n: log.length, tick: sim.tick, phase: sim.phase, types, srcs, hash: fnv(text) };
}
item(9, 'Determinismo', (r) => {
  const todas: Partial<Record<SkillId, number>> = { etherealCage: 3, soulEcho: 3, frostMist: 3, blackFrost: 3, abyssMarsh: 3, darkApex: 3 };
  const a = batalha(todas, 4242);
  const b = batalha(todas, 4242);
  const c = batalha(todas, 4243);
  r.check(a.text === b.text, `duas execuções iguais (${a.n} eventos, t=${a.tick}, ${a.phase}, assinatura ${a.hash})`, `execuções diferentes: ${a.n} x ${b.n} eventos, ${a.hash} x ${b.hash}`);
  r.check(!a.text.includes('NaN') && !a.text.includes('Infinity'), 'nenhum NaN/Infinity nos eventos', 'NaN ou Infinity apareceu nos eventos');
  const novos = NEW_EVENTS.filter((t) => a.types.has(t));
  r.check(novos.length >= 4, `magias novas aparecem na batalha: ${novos.join(', ')}`, `pouco uso: ${novos.join(', ') || 'nenhum'}`);
  r.check(c.hash !== a.hash, `seed diferente gera outra batalha (${c.hash}), então o teste é sensível`, 'seed diferente deu a mesma batalha');
});

// ---------- 10) Sem as magias novas: combate sem evento novo ----------
item(10, 'Sem as magias novas: nada de novo', (r) => {
  const semNovas: Partial<Record<SkillId, number>> = {};
  const a = batalha(semNovas, 4242);
  const b = batalha(semNovas, 4242);
  const apareceram = [...NEW_EVENTS.filter((t) => a.types.has(t)), ...NEW_SOURCES.filter((s) => a.srcs.has(s))];
  r.check(apareceram.length === 0, `nenhum evento nem fonte nova (${a.n} eventos, t=${a.tick})`, `apareceram: ${apareceram.join(', ')}`);
  r.check(a.text === b.text, `combate sem as novas é determinístico (assinatura ${a.hash})`, 'duas execuções diferentes');
  const lvs = NEW_IDS.map((id) => lvOf(arena({}).w.stats?.skills, id));
  r.check(lvs.every((v) => v === 0), 'níveis das 6 magias novas = 0 na Bruxa padrão', `níveis: ${lvs.join(',')}`);
  r.check(a.types.has('damage') && a.srcs.has('shadow'), 'a Bruxa básica continua atacando (dano shadow do Dreno)', `tipos: ${[...a.types].join(',')}`);
});

const falhas = reports.filter((x) => x.failed).length;
console.log(falhas ? `warlockCheck: ${falhas} FALHA(S) de ${reports.length} itens` : `warlockCheck: tudo certo (${reports.length} itens)`);
// lançar erro = código de saída 1 (mesmo padrão do runicCheck)
if (falhas) throw new Error('warlockCheck falhou');
