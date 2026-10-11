// Checagem do sistema de cartas: catálogo (dados válidos), pacote, fusão, slots, equipar, regras por
// vocação e tier, save/migração, revelação, e o motor de regras dentro da batalha (gatilhos e determinismo).
import {
  CARD_ART_WINDOW,
  CARD_BY_ID,
  CARD_CATALOG,
  MINIBOSSES,
  MVPS,
  NORMALS,
  TIER_POWER,
  addCards,
  applyCardLoadout,
  cardRuntimeFor,
  cardSlots,
  describeCardRule,
  describeVocation,
  emptyCollection,
  equipCard,
  freeCopies,
  fuseBulk,
  fuseTriple,
  migrateCollection,
  revealOrder,
  rollPack,
  unequipCard,
  validarCatalogo,
  type CardRuntime,
} from '../src/core/progression/cards';
import { createProfile, heroStats } from '../src/core/progression/profile';
import { Simulation } from '../src/core/sim/Simulation';
import type { SimEvent } from '../src/core/sim/types';
import { ZONES } from '../src/config/zones';

type CardProcEvent = Extract<SimEvent, { type: 'cardProc' }>;

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// ---------- catálogo: dados válidos ----------
{
  const erros = validarCatalogo();
  check('catálogo válido (regras, tiers, vocações, limites e referência RO)', erros.length === 0, erros.slice(0, 3).join(' | '));
  check('112 cartas no catálogo', CARD_CATALOG.length === 112, `${CARD_CATALOG.length}`);
  check('112 artes distintas', new Set(CARD_CATALOG.map((c) => c.art)).size === 112);
  check(`raridades: ${NORMALS.length}N/${MINIBOSSES.length}MB/${MVPS.length}MVP`, NORMALS.length === 92 && MINIBOSSES.length === 11 && MVPS.length === 9);
  const textos = CARD_CATALOG.every((d) => describeCardRule(d, d.base).length > 12 && describeVocation(d).startsWith('Bônus de '));
  check('todo efeito tem texto em pt-BR', textos);
}

// ---------- pacote: 3N + 2× (90/5/5) ----------
{
  let seed = 123456789;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const N = 20000;
  let mb = 0;
  let mvp = 0;
  let ok = true;
  for (let i = 0; i < N; i++) {
    const pack = rollPack(rand);
    if (pack.length !== 5) ok = false;
    for (let s = 0; s < 3; s++) if (CARD_BY_ID[pack[s]].rarity !== 'normal') ok = false;
    for (let s = 3; s < 5; s++) {
      const r = CARD_BY_ID[pack[s]].rarity;
      if (r === 'miniboss') mb++;
      else if (r === 'mvp') mvp++;
      else if (r !== 'normal') ok = false;
    }
  }
  const rolls = N * 2;
  check('pacote sempre 3N + 2 sorteios', ok);
  check('taxa Mini-Boss ~5%', Math.abs(mb / rolls - 0.05) < 0.01, `${((mb / rolls) * 100).toFixed(2)}%`);
  check('taxa MVP ~5%', Math.abs(mvp / rolls - 0.05) < 0.01, `${((mvp / rolls) * 100).toFixed(2)}%`);
}

// ---------- slots: curva ----------
{
  // curva vigente (CARD_SLOT_WINS): o n-ésimo slot pede o valor n da lista de vitórias
  const cases: [number, number][] = [[0, 0], [1, 1], [2, 2], [9, 6], [13, 7], [18, 8], [31, 10], [50, 12], [381, 30], [999, 30]];
  check('curva de slots (CARD_SLOT_WINS)', cases.every(([w, s]) => cardSlots(w) === s), cases.map(([w]) => `${w}→${cardSlots(w)}`).join(' '));
}

// ---------- fusão ----------
{
  const c = emptyCollection();
  c.owned.poring = 3;
  const r = fuseTriple(c, 'poring', () => 0.99999);
  check('3 iguais → 1 Normal diferente', !!r.made && r.made !== 'poring' && CARD_BY_ID[r.made!].rarity === 'normal' && (c.owned.poring ?? 0) === 0, r.made);
  check('sem 3 cópias falha', !!fuseTriple(c, 'poring').err);
  check('Mini-Boss não funde 3×', !!fuseTriple({ owned: { orc_hero: 3 }, equipped: {} }, 'orc_hero').err);
  const c2 = emptyCollection();
  for (const n of NORMALS.slice(0, 10)) c2.owned[n.id] = 1;
  const b = fuseBulk(c2, () => 0);
  check('10 Normais → 1 Mini-Boss', !!b.made && CARD_BY_ID[b.made!].rarity === 'miniboss', b.made);
  check('bulk com exatamente 10 consome os 10', NORMALS.slice(0, 10).every((n) => (c2.owned[n.id] ?? 0) === 0));
  const c2b = emptyCollection();
  for (const n of NORMALS.slice(0, 11)) c2b.owned[n.id] = 1;
  c2b.owned.poring = 2;
  fuseBulk(c2b, () => 0);
  const rest = NORMALS.reduce((s, n) => s + (c2b.owned[n.id] ?? 0), 0);
  check('bulk preserva excedente primeiro', rest === 3 && (c2b.owned.poring ?? 0) === 1, `restam ${rest}`);
  const c3 = emptyCollection();
  for (const n of NORMALS.slice(0, 4)) c3.owned[n.id] = 2;
  check('bulk sem 10 falha', !!fuseBulk(c3).err);
}

// ---------- equipar e regras por vocação ----------
{
  const c = emptyCollection();
  addCards(c, ['poring', 'poring', 'hydra', 'baphomet']);
  check('equipar além das cópias falha', equipCard(c, 'warrior', 'poring', 30) === undefined && equipCard(c, 'mage', 'poring', 30) === undefined && equipCard(c, 'archer', 'poring', 30) !== undefined);
  check('slot cheio falha', equipCard(c, 'warrior', 'hydra', 1) !== undefined);
  unequipCard(c, 'warrior', 0);
  check('desequipar libera', equipCard(c, 'warrior', 'hydra', 30) === undefined);
  check('cópias livres descontam equipadas', freeCopies(c, 'poring') === 1 && freeCopies(c, 'hydra') === 0);

  // uma carta com vocação em outra classe: o herói que não é dessa classe recebe só o efeito base
  const outra = CARD_CATALOG.find((d) => d.vocation.hero !== 'warrior')!;
  const col = { owned: { [outra.id]: 1 }, equipped: { warrior: [outra.id] } };
  const regrasGuerreiro = cardRuntimeFor('warrior', col);
  check('classe sem vocação recebe só o efeito base', regrasGuerreiro.length === 1 && regrasGuerreiro[0].key.endsWith('b'), `${regrasGuerreiro.length} regra(s)`);
  const regrasDona = cardRuntimeFor(outra.vocation.hero, { owned: { [outra.id]: 1 }, equipped: { [outra.vocation.hero]: [outra.id] } });
  check('classe da vocação recebe base + bônus', regrasDona.length === 2 && regrasDona.some((r) => r.key.endsWith('v')), `${regrasDona.length} regra(s)`);
  // tier: os números sobem com o tier (MVP = tier 6, o mais forte)
  const mvp = MVPS[0];
  const base = cardRuntimeFor(mvp.vocation.hero, { owned: { [mvp.id]: 1 }, equipped: { [mvp.vocation.hero]: [mvp.id] } }).find((r) => r.key.endsWith('b')) as CardRuntime;
  const f = TIER_POWER[mvp.tier];
  const original = mvp.base.effect as unknown as Record<string, number>;
  const escalado = base.effect as unknown as Record<string, number>;
  const campo = ['pct', 'amp'].find((k) => typeof original[k] === 'number');
  check('tier escala a força do efeito (MVP = ×2)', !campo || Math.abs(escalado[campo] - original[campo] * f) < 1e-9, `${campo ?? '-'} ${original[campo ?? '']} → ${escalado[campo ?? '']}`);
  check('tiers crescem com a raridade', TIER_POWER[1] < TIER_POWER[3] && TIER_POWER[3] < TIER_POWER[6]);
}

// ---------- save compatível e revelação ----------
{
  const p = createProfile();
  const col = emptyCollection();
  addCards(col, ['poring', 'poring', 'poring']);
  col.equipped.warrior = ['poring', 'poring', 'poring'];
  applyCardLoadout(p, col);
  check('cartas viram regras no herói (save: profile.heroes[k].cards)', (p.heroes.warrior.cards?.length ?? 0) >= 3);
  check('cartas não mudam mais o HP (efeito é regra de batalha)', heroStats(p, 'warrior').maxHp === heroStats(createProfile(), 'warrior').maxHp);
  const migrated = migrateCollection(undefined);
  check('save antigo sem coleção migra vazio', Object.keys(migrated.owned).length === 0);
  const migrated2 = migrateCollection({ owned: { poring: 2 }, equipped: { mage: ['poring'] } });
  check('coleção existente preservada', migrated2.owned.poring === 2 && migrated2.equipped.mage?.[0] === 'poring');
  const pack = ['baphomet', 'poring', 'orc_hero', 'wolf', 'garm'];
  const ordem = revealOrder(pack);
  const ranks = ordem.map((id) => ({ normal: 0, miniboss: 1, mvp: 2 })[CARD_BY_ID[id].rarity]);
  check('revelação: raridade sobe (Normal → Mini-Boss → MVP)', ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), `ordem ${ordem.join(',')}`);
  check('revelação: não perde nem inventa carta', ordem.length === pack.length && pack.every((id) => ordem.includes(id)));
  const { x, y, w, h } = CARD_ART_WINDOW;
  check('recorte da arte dentro da imagem', x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1 && w > 0 && h > 0, JSON.stringify(CARD_ART_WINDOW));
}

// ---------- motor de regras dentro da batalha ----------
{
  const regra = (name: string, trigger: CardRuntime['trigger'], effect: CardRuntime['effect'], extra: Partial<CardRuntime> = {}): CardRuntime => ({
    key: `teste:${name}`,
    card: 'TESTE',
    name,
    trigger,
    chance: 1,
    icd: 0,
    effect,
    ...extra,
  });
  const regras: CardRuntime[] = [
    regra('Escudo Inicial', 'start', { kind: 'shield', pct: 0.1, sec: 5 }),
    regra('Pulso Vital', 'tick', { kind: 'bless', amp: 0.05, sec: 1 }, { every: 1 }),
    regra('Golpe Duplo', 'hit', { kind: 'burst', pct: 0.5 }, { icd: 0.5 }),
    regra('Colheita', 'kill', { kind: 'soul', amount: 2 }),
  ];
  const cards = { warrior: regras };
  const correr = (): { log: string; cardEvents: number; startShield: number; burstDamage: number; souls: number; tickFires: number } => {
    const lo = { warrior: { stats: heroStats(createProfile(), 'warrior'), level: 1, exp: 0, cards: cards.warrior } };
    const sim = new Simulation(ZONES.crookedWood.defaultSetup, 7, lo, {});
    sim.cheats.invincible = true;
    sim.start();
    const inicio = sim.flushEvents();
    const guerreiro = [...sim.units.values()].find((u) => u.team === 'party' && u.kind === 'warrior');
    const startShield = guerreiro?.shield ?? 0;
    const todos = [...inicio];
    for (let i = 0; i < 600; i++) todos.push(...sim.step());
    const cardEvents = todos.filter((e): e is CardProcEvent => e.type === 'cardProc');
    const burstDamage = todos.filter((e) => e.type === 'damage' && e.source === 'card').length;
    const tickFires = cardEvents.filter((e) => e.name === 'Pulso Vital').length;
    return {
      log: JSON.stringify(todos.map((e) => e.type + (e as { unitId?: number }).unitId)),
      cardEvents: cardEvents.length,
      startShield,
      burstDamage,
      souls: guerreiro?.souls ?? 0,
      tickFires,
    };
  };
  const a = correr();
  const b = correr();
  check('regra "início" dá escudo no começo da batalha', a.startShield > 0, `escudo ${a.startShield.toFixed(1)}`);
  check('regra "a cada 1 s" dispara ~60 vezes em 600 ticks', Math.abs(a.tickFires - 60) <= 2, `${a.tickFires} disparos`);
  check('regra "ao acertar" causa golpe extra (dano de carta)', a.burstDamage > 0, `${a.burstDamage} golpes extras`);
  check('regra "ao abater" dá almas', a.souls > 0, `${a.souls} almas`);
  check('mesma semente = mesma batalha (determinismo com cartas)', a.log === b.log && a.cardEvents === b.cardEvents);
  // sem regras, nada dispara
  const semRegras = new Simulation(ZONES.crookedWood.defaultSetup, 7, {}, {});
  semRegras.cheats.invincible = true;
  semRegras.start();
  let disparos = 0;
  for (let i = 0; i < 300; i++) disparos += semRegras.step().filter((e) => e.type === 'cardProc').length;
  check('sem cartas, nenhum disparo', disparos === 0);
}

if (failures) {
  console.error(`cardCheck: ${failures} FALHA(S)`);
  throw new Error('cardCheck falhou');
}
console.log('cardCheck: tudo certo');
