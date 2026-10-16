/**
 * Validação headless das regras de carta na batalha (motor): modDano (causa e recebe), respingo e stat.
 * 1) modDano 'causa' no chefe: o herói causa mais dano ao chefe do que ao comum (e o resto vale no comum).
 * 2) respingo: o golpe respinga no inimigo perto do alvo, sem cadeia (não atinge o 3º inimigo).
 * 3) stat: a carta soma no atributo no começo da batalha; herói sem carta fica igual.
 * 4) modDano 'recebe': o herói sofre menos dano de um grupo de inimigos.
 * 5) Determinismo com cartas ligadas e com a campanha sem carta (hash dos eventos igual ao do motor antes das cartas).
 * Rodar: npx tsx scripts/cardRuleCheck.ts (termina com erro se algum FAIL).
 */
import { DEFAULT_SETUP, GAME_CONFIG, applyZone } from '../src/config/gameConfig';
import { ZONES } from '../src/config/zones';
import { Simulation } from '../src/core/sim/Simulation';
import { ATTRIBUTES_CONFIG, computeStats } from '../src/core/progression/attributes';
import { gearBonus } from '../src/core/progression/equipment';
import { starterWeapon } from '../src/core/progression/profile';
import { startingSkills } from '../src/core/progression/skills';
import { lockedSkillKeys } from '../src/core/progression/skillSlots';
import type { CardRuntime } from '../src/core/progression/cards';
import type { SimEvent, Unit } from '../src/core/sim/types';

/**
 * Hash (FNV, ver Hash) dos eventos da campanha sem cartas. Re-ancorado em d2146067: nesse commit o palhaço
 * entrou na mistura dos Campos Cinzentos (mudança de conteúdo de propósito), e isso muda os eventos da campanha.
 * Antes: 00fdbdc44cff71e4, medido no motor antes das regras de carta (HEAD b47efdc). Bisect confirmou o commit.
 */
const HASH_SEM_CARTAS = '82f09eb9acc64759';

/** Hash FNV-1a de 64 bits (dois de 32) sobre o texto dos eventos. Sem módulos do Node (o tsconfig não os tem). */
class Hash {
  private a = 0x811c9dc5;
  private b = 0x84222325;
  update(texto: string): void {
    for (let i = 0; i < texto.length; i++) {
      const c = texto.charCodeAt(i);
      this.a = Math.imul(this.a ^ c, 0x01000193) >>> 0;
      this.b = Math.imul(this.b ^ c, 0x01000193) >>> 0;
    }
  }
  hex(): string {
    return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0');
  }
}

let falhas = 0;
function check(nome: string, ok: boolean, detalhe = ''): void {
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}

/** Regra pronta para a simulação (chance 1, sem recarga: o teste dispara direto). */
function regra(key: string, effect: CardRuntime['effect'], trigger: CardRuntime['trigger']): CardRuntime {
  return { key, card: 'teste', name: 'Teste', trigger, chance: 1, icd: 0, effect };
}

/** Primeiros 5 tiles livres em linha reta (x..x+4, y), para posicionar os bonecos com folga. */
function faixaLivre(sim: Simulation): { x: number; y: number } {
  const occ = new Set([...sim.units.values()].map((u) => `${u.x},${u.y}`));
  const bc = GAME_CONFIG.board;
  for (let y = 0; y < bc.height; y++) {
    for (let x = 0; x + 5 < bc.width; x++) {
      let ok = true;
      for (let k = 0; k < 5 && ok; k++) ok = sim.board.isWalkable(x + k, y) && !occ.has(`${x + k},${y}`);
      if (ok) return { x, y };
    }
  }
  throw new Error('sem faixa livre no mapa');
}

const heroi = (sim: Simulation, kind: string): Unit => {
  const u = sim.sortedUnits('party').find((p) => p.kind === kind);
  if (!u) throw new Error(`herói ${kind} ausente`);
  return u;
};

/** Dano de um golpe do herói no alvo (sem crítico: o teste fixa crit=false). */
function golpe(sim: Simulation, herói: Unit, alvo: Unit, valor: number): number {
  const antes = alvo.hp;
  sim.damage(alvo, valor, 'melee', herói.id, false);
  return antes - alvo.hp;
}

// ---------- 1) modDano causa (chefe) ----------
applyZone(ZONES.bridge);
const boss = GAME_CONFIG.bossKinds[0];
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'warrior');
  const f = faixaLivre(sim);
  const chefe = sim.spawnEnemyAt(boss, f.x, f.y, 1000)!;
  const comum = sim.spawnEnemyAt('grunt', f.x + 2, f.y, 1000)!;
  const semCarta = { chefe: golpe(sim, h, chefe, 100), comum: golpe(sim, h, comum, 100) };
  check('sem carta: o golpe tira o mesmo do chefe e do comum', semCarta.chefe === semCarta.comum && semCarta.chefe === 100, `chefe −${semCarta.chefe}, comum −${semCarta.comum}`);

  const sim2 = new Simulation(DEFAULT_SETUP);
  const h2 = heroi(sim2, 'warrior');
  h2.cardRules = [regra('mod', { kind: 'modDano', sentido: 'causa', alvo: 'chefe', valor: 0.5, resto: 0.2 }, 'start')];
  const f2 = faixaLivre(sim2);
  const chefe2 = sim2.spawnEnemyAt(boss, f2.x, f2.y, 1000)!;
  const comum2 = sim2.spawnEnemyAt('grunt', f2.x + 2, f2.y, 1000)!;
  const dChefe = golpe(sim2, h2, chefe2, 100);
  const dComum = golpe(sim2, h2, comum2, 100);
  check('modDano chefe: mais dano no chefe que no comum', dChefe > dComum, `chefe −${dChefe}, comum −${dComum}`);
  check('modDano chefe: +50% no chefe e +20% (resto) no comum', dChefe === 150 && dComum === 120, `esperado −150 e −120`);
}

// ---------- 2) respingo ----------
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'warrior');
  h.cardRules = [regra('resp', { kind: 'respingo', pct: 0.5, raio: 1 }, 'hit')];
  const f = faixaLivre(sim);
  const a = sim.spawnEnemyAt('grunt', f.x, f.y, 1000)!;
  const b = sim.spawnEnemyAt('grunt', f.x + 1, f.y, 1000)!; // vizinho do alvo (raio 1)
  const c = sim.spawnEnemyAt('grunt', f.x + 2, f.y, 1000)!; // a 2 do alvo, a 1 de b: só atinge se houver cadeia
  const d = sim.spawnEnemyAt('grunt', f.x + 4, f.y, 1000)!; // longe
  sim.damage(a, 100, 'melee', h.id, false);
  check('respingo: o alvo leva o golpe inteiro', a.hp === 900, `alvo ${a.hp}`);
  check('respingo: o vizinho (raio 1) leva 50%', b.hp === 950, `vizinho ${b.hp}`);
  check('respingo: sem cadeia (o 3º inimigo, a 1 do vizinho, não é atingido)', c.hp === 1000, `terceiro ${c.hp}`);
  check('respingo: o inimigo fora do raio fica intacto', d.hp === 1000, `longe ${d.hp}`);
  const procs = sim.flushEvents().filter((e: SimEvent) => e.type === 'cardProc').length;
  check('respingo: dispara uma vez (um evento de carta)', procs === 1, `cardProc=${procs}`);

  const sim2 = new Simulation(DEFAULT_SETUP);
  const h2 = heroi(sim2, 'warrior');
  h2.cardRules = [regra('resp', { kind: 'respingo', pct: 0.5, raio: 1 }, 'crit')];
  const f2 = faixaLivre(sim2);
  const a2 = sim2.spawnEnemyAt('grunt', f2.x, f2.y, 1000)!;
  const b2 = sim2.spawnEnemyAt('grunt', f2.x + 1, f2.y, 1000)!;
  sim2.damage(a2, 100, 'melee', h2.id, false);
  check('respingo no crítico: golpe sem crítico não respinga', b2.hp === 1000, `vizinho ${b2.hp}`);
}

// ---------- 3) stat no começo da batalha ----------
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'warrior');
  const mago = heroi(sim, 'mage');
  const magoAntes = JSON.stringify(mago.stats);
  const str0 = h.stats!.attrs.str;
  const crit0 = h.stats!.crit;
  const luk0 = h.stats!.luck;
  h.cardRules = [regra('st', { kind: 'stat', stat: 'forca', value: 5 }, 'start'), regra('st2', { kind: 'stat', stat: 'sorte', value: 5 }, 'start')];
  sim.start();
  check('stat: a Força sobe +5 no começo da batalha', h.stats!.attrs.str === str0 + 5, `Força ${str0} → ${h.stats!.attrs.str}`);
  check('stat: a Sorte sobe +5 (chance de crítico e Sorte acompanham)', h.stats!.attrs.luk > 0 && h.stats!.crit > crit0 && h.stats!.luck === luk0 + 5, `crítico ${(crit0 * 100).toFixed(1)}% → ${(h.stats!.crit * 100).toFixed(1)}%`);
  check('stat: herói sem carta fica igual', JSON.stringify(mago.stats) === magoAntes);

  const sim2 = new Simulation(DEFAULT_SETUP);
  const h2 = heroi(sim2, 'warrior');
  const vida0 = h2.maxHp;
  h2.cardRules = [regra('vit', { kind: 'stat', stat: 'vitalidade', value: 5 }, 'start')];
  sim2.start();
  check('stat vitalidade: a vida máxima sobe e a vida atual acompanha', h2.maxHp > vida0 && h2.hp === h2.maxHp, `vida ${vida0} → ${h2.maxHp}`);
}

// ---------- 3b) a carta soma como um item com o mesmo bônus (mesmo caminho de computeStats) ----------
{
  const base = ATTRIBUTES_CONFIG.base.warrior;
  const equip = gearBonus([starterWeapon('warrior')]);
  const casos: { nome: string; carta: Parameters<typeof regra>[1]; item: () => ReturnType<typeof computeStats> }[] = [
    { nome: 'forca', carta: { kind: 'stat', stat: 'forca', value: 5 }, item: () => computeStats('warrior', base, { ...equip, attrs: { ...equip.attrs, str: equip.attrs.str + 5 } }) },
    { nome: 'vitalidade', carta: { kind: 'stat', stat: 'vitalidade', value: 5 }, item: () => computeStats('warrior', base, { ...equip, attrs: { ...equip.attrs, vit: equip.attrs.vit + 5 } }) },
    { nome: 'sorte', carta: { kind: 'stat', stat: 'sorte', value: 5 }, item: () => computeStats('warrior', base, { ...equip, attrs: { ...equip.attrs, luk: equip.attrs.luk + 5 } }) },
    { nome: 'haste', carta: { kind: 'stat', stat: 'haste', value: 0.05 }, item: () => computeStats('warrior', base, { ...equip, skillHaste: equip.skillHaste + 0.05 }) },
    { nome: 'esquiva', carta: { kind: 'stat', stat: 'esquiva', value: 0.05 }, item: () => computeStats('warrior', base, { ...equip, dodge: equip.dodge + 0.05 }) },
    { nome: 'critico', carta: { kind: 'stat', stat: 'critico', value: 0.05 }, item: () => computeStats('warrior', base, { ...equip, crit: equip.crit + 0.05 }) },
    { nome: 'danoCritico', carta: { kind: 'stat', stat: 'danoCritico', value: 0.2 }, item: () => computeStats('warrior', base, { ...equip, critDamage: equip.critDamage + 0.2 }) },
    { nome: 'vidaMax', carta: { kind: 'stat', stat: 'vidaMax', value: 0.1 }, item: () => computeStats('warrior', base, { ...equip, hpMult: equip.hpMult + 0.1 }) },
    { nome: 'mana', carta: { kind: 'stat', stat: 'mana', value: 5 }, item: () => computeStats('warrior', base, { ...equip, mana: equip.mana + 5 }) },
  ];
  for (const c of casos) {
    const sim = new Simulation(DEFAULT_SETUP);
    const h = heroi(sim, 'warrior');
    h.cardRules = [regra(c.nome, c.carta, 'start')];
    sim.start();
    const esperado = c.item() as unknown as Record<string, number>;
    const real = h.stats as unknown as Record<string, number>;
    const difere = Object.keys(esperado).filter((k) => typeof esperado[k] === 'number' && Math.abs(esperado[k] - real[k]) > 1e-9);
    check(`stat ${c.nome}: os status batem com um item de mesmo bônus`, difere.length === 0 && h.maxHp === esperado.maxHp, difere.length ? `diferem: ${difere.join(', ')}` : 'iguais');
  }
}

// ---------- 3c) carta de Mana abre slot de habilidade na batalha ----------
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'warrior');
  const habilidades = { ...startingSkills('warrior'), ...h.stats!.skills };
  const trancadasAntes = lockedSkillKeys('warrior', habilidades, h.stats!.mana).length;
  h.cardRules = [regra('mana', { kind: 'stat', stat: 'mana', value: 20 }, 'start')];
  sim.start();
  const esperadas = lockedSkillKeys('warrior', habilidades, h.stats!.mana);
  const mesmo = [...(h.locked ?? [])].sort().join(',') === [...esperadas].sort().join(',');
  check('stat mana: +20 de Mana abre um slot na batalha (trava igual à do perfil com a Mana nova)', mesmo && esperadas.length < trancadasAntes, `travadas ${trancadasAntes} → ${esperadas.length}`);
}

// ---------- 3d) modDano com fonte: só o dano mágico é reforçado ----------
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'mage');
  h.cardRules = [regra('fonte', { kind: 'modDano', sentido: 'causa', alvo: 'comum', fonte: 'magico', valor: 0.5, resto: 0 }, 'start')];
  const f = faixaLivre(sim);
  const soldado = sim.spawnEnemyAt('grunt', f.x, f.y, 1000)!;
  const soldado2 = sim.spawnEnemyAt('grunt', f.x + 2, f.y, 1000)!;
  const fisico = golpe(sim, h, soldado, 100);
  const magico = (() => { const antes = soldado2.hp; sim.damage(soldado2, 100, 'spell', h.id, false); return antes - soldado2.hp; })();
  check('modDano com fonte: o golpe físico não é reforçado e o mágico é (+50%)', fisico === 100 && magico === 150, `físico −${fisico}, mágico −${magico}`);
}

// ---------- 4) modDano recebe ----------
{
  const sim = new Simulation(DEFAULT_SETUP);
  const h = heroi(sim, 'warrior');
  const f = faixaLivre(sim);
  const chefe = sim.spawnEnemyAt(boss, f.x, f.y, 1000)!;
  const vida0 = h.hp;
  sim.damage(h, 20, 'spell', chefe.id);
  const semCarta = vida0 - h.hp;
  h.hp = h.maxHp;
  h.cardRules = [regra('rec', { kind: 'modDano', sentido: 'recebe', alvo: 'chefe', valor: -0.5, resto: 0 }, 'start')];
  sim.damage(h, 20, 'spell', chefe.id);
  const comCarta = h.maxHp - h.hp;
  check('modDano recebe: o herói sofre −50% do chefe', semCarta === 20 && comCarta === 10, `sem carta −${semCarta}, com carta −${comCarta}`);

  // Três cópias de −40% contra chefe somam −120%: o piso (CARD_MOD_DANO_MIN) impede dano zero ou invertido.
  h.hp = h.maxHp;
  h.cardRules = [0, 1, 2].map((i) => regra(`rec${i}`, { kind: 'modDano', sentido: 'recebe', alvo: 'chefe', valor: -0.4, resto: 0 }, 'start'));
  sim.damage(h, 20, 'spell', chefe.id);
  const piso = h.maxHp - h.hp;
  check('modDano recebe: três cópias de −40% não zeram o dano (piso de 25%)', piso === 5, `com três cópias, −${piso} de 20`);
}

// ---------- 5) determinismo com cartas e campanha sem cartas ----------
function rodar(comCartas: boolean): { hash: string; cardProcs: number; fase: string } {
  applyZone(ZONES.bridge);
  const sim = new Simulation(DEFAULT_SETUP);
  if (comCartas) {
    for (const u of sim.sortedUnits('party')) {
      u.cardRules =
        u.kind === 'warrior'
          ? [regra('a', { kind: 'modDano', sentido: 'causa', alvo: 'chefe', valor: 0.3, resto: 0 }, 'start'), regra('b', { kind: 'respingo', pct: 0.4, raio: 1 }, 'hit'), regra('c', { kind: 'stat', stat: 'forca', value: 3 }, 'start')]
          : [];
    }
  }
  const h = new Hash();
  let cardProcs = 0;
  sim.start();
  while (sim.phase === 'running' && sim.tick < 30000) {
    for (const e of sim.step()) {
      h.update(JSON.stringify(e));
      if (e.type === 'cardProc') cardProcs++;
    }
  }
  h.update(`|${sim.phase}:${sim.tick}:${sim.killed}:${sim.souls}:${sim.zeni}|`);
  return { hash: h.hex(), cardProcs, fase: sim.phase };
}
{
  const a = rodar(true);
  const b = rodar(true);
  check('determinismo com cartas ligadas: duas execuções batem', a.hash === b.hash, `disparos de carta ${a.cardProcs}, fim ${a.fase}`);
  check('cartas ligadas disparam na batalha', a.cardProcs > 0);
}

// Campanha sem cartas: os mesmos eventos de antes das regras de carta (mesma ordem de zonas do hash de referência).
{
  const h = new Hash();
  applyZone(ZONES.bridge);
  const correr = (sim: Simulation): void => {
    sim.start();
    while (sim.phase === 'running' && sim.tick < 30000) for (const e of sim.step()) h.update(JSON.stringify(e));
    h.update(`|${sim.phase}:${sim.tick}:${sim.killed}:${sim.souls}:${sim.zeni}|`);
  };
  correr(new Simulation(DEFAULT_SETUP));
  for (const id of Object.keys(ZONES)) {
    if (id === 'town') continue;
    const z = ZONES[id];
    applyZone(z);
    correr(new Simulation(z.defaultSetup, z.wave.seed));
  }
  const hash = h.hex();
  check('sem cartas: eventos da campanha iguais aos do motor antes das cartas', hash === HASH_SEM_CARTAS, hash.slice(0, 16));
}

console.log(falhas === 0 ? 'cardRuleCheck: tudo ok' : `cardRuleCheck: ${falhas} falha(s)`);
if (falhas > 0) throw new Error(`cardRuleCheck: ${falhas} falha(s)`);
