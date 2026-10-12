// Checagem do sistema de cartas (dados, posse, fusão, equipar, pacote, escala e save).
// O motor de regras dentro da batalha (gatilhos, modDano, respingo) fica em scripts/cardRuleCheck.ts.
import { GAME_CONFIG } from '../src/config/gameConfig';
import {
  BONUS_FONTES,
  BONUS_TARGETS,
  CARD_BY_ID,
  CARD_CATALOG,
  CARD_ID_ALIAS,
  CARD_MAX_LEVEL,
  FUSION_COST,
  LEVEL_SCALE,
  LEVEL_SUFFIX,
  addCards,
  applyCardLoadout,
  cardLevelLabel,
  cardRuntimeFor,
  cardSlots,
  cardSlotsPool,
  copiesAt,
  describeBonus,
  describeUnlock,
  emptyCollection,
  equipCard,
  freeCopiesAt,
  fuseCard,
  migrateCollection,
  rollPack,
  unequipCard,
  validarCatalogo,
  type CardCollection,
  type CardEffect,
  type CardRuntime,
} from '../src/core/progression/cards';
import { createProfile } from '../src/core/progression/profile';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const mesmoConjunto = (a: string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Coleção com uma cópia da carta no nível e equipada no guerreiro nesse nível. */
function equipada(id: string, level: number): CardCollection {
  const c = emptyCollection();
  const arr = [0, 0, 0, 0, 0];
  arr[level - 1] = 1;
  c.owned[id] = arr;
  c.equipped.warrior = [{ id, level }];
  return c;
}

const KINDS = ['shield', 'heal', 'bless', 'fury', 'cooldown', 'slow', 'curse', 'freeze', 'reflect', 'burst', 'poison', 'soul', 'stat', 'modDano', 'respingo'];
const CATEGORIAS = ['ofensiva', 'defensiva', 'sustentacao', 'utilidade', 'mobilidade'];

// ---------- catálogo ----------
{
  const erros = validarCatalogo();
  check('catálogo válido (regras, limites em todos os níveis, categorias, grupos e fontes)', erros.length === 0, erros.slice(0, 3).join(' | '));
  check('102 cartas no catálogo', CARD_CATALOG.length === 102, `${CARD_CATALOG.length}`);
  const ids = CARD_CATALOG.map((c) => c.id);
  check('ids únicos', new Set(ids).size === ids.length);
  check('artes únicas (uma por carta)', new Set(CARD_CATALOG.map((c) => c.art)).size === 102);
  check('nomes únicos (uma carta por nome)', new Set(CARD_CATALOG.map((c) => c.name)).size === 102);
  check('ids de versões antigas não estão no catálogo', Object.keys(CARD_ID_ALIAS).every((id) => !CARD_BY_ID[id]));
  check('cada alias aponta para uma carta que existe', Object.values(CARD_ID_ALIAS).every((id) => !!CARD_BY_ID[id]));
  check('categorias válidas', CARD_CATALOG.every((c) => CATEGORIAS.includes(c.category)));
  const usados = new Map<string, number>();
  for (const d of CARD_CATALOG) for (const r of [d.bonus.rule, d.unlock.rule]) usados.set(r.effect.kind, (usados.get(r.effect.kind) ?? 0) + 1);
  check('todo efeito é um tipo conhecido', [...usados.keys()].every((k) => KINDS.includes(k)), [...usados.entries()].map(([k, n]) => `${k} ${n}`).join(', '));
  check('todo bônus e desbloqueio tem texto em pt-BR', CARD_CATALOG.every((d) => describeBonus(d, 1).length > 10 && describeUnlock(d).length > 10));
  check('grupo chefe = GAME_CONFIG.bossKinds', mesmoConjunto(BONUS_TARGETS.chefe.kinds, GAME_CONFIG.bossKinds));
  check('todo tipo dos grupos existe em GAME_CONFIG.enemies', Object.values(BONUS_TARGETS).every((g) => g.kinds.every((k) => k in GAME_CONFIG.enemies)));
  check('fontes de dano com nomes', Object.values(BONUS_FONTES).every((f) => f.sources.length > 0));
}

// ---------- níveis e fusão ----------
{
  check('custos de fusão: 5 → nível 2, depois 2, 2, 2', FUSION_COST[1] === 5 && FUSION_COST[2] === 2 && FUSION_COST[3] === 2 && FUSION_COST[4] === 2);
  check('nível máximo é 5', CARD_MAX_LEVEL === 5 && LEVEL_SCALE.length === 5 && LEVEL_SUFFIX.length === 5);
  check('escala padrão 1, 1,25, 1,5, 1,75, 2', LEVEL_SCALE.every((v, i) => close(v, [1, 1.25, 1.5, 1.75, 2][i])));

  const c = emptyCollection();
  c.owned.poring = [5, 0, 0, 0, 0];
  const r = fuseCard(c, 'poring', 1);
  check('5 cópias de nível 1 viram 1 de nível 2', r.ok && r.level === 2 && copiesAt(c, 'poring', 1) === 0 && copiesAt(c, 'poring', 2) === 1);

  const quatro = emptyCollection();
  quatro.owned.poring = [4, 0, 0, 0, 0];
  check('4 cópias de nível 1 não fundem', !fuseCard(quatro, 'poring', 1).ok && copiesAt(quatro, 'poring', 1) === 4);

  for (const nivel of [2, 3, 4]) {
    const arr = [0, 0, 0, 0, 0];
    arr[nivel - 1] = 2;
    const cc = emptyCollection();
    cc.owned.poring = arr;
    const ok = fuseCard(cc, 'poring', nivel);
    const meia = emptyCollection();
    meia.owned.poring = arr.map((n, i) => (i === nivel - 1 ? 1 : n));
    check(`nível ${nivel}: 2 cópias fundem em 1 de nível ${nivel + 1}; 1 não basta`, ok.ok && ok.level === nivel + 1 && copiesAt(cc, 'poring', nivel + 1) === 1 && !fuseCard(meia, 'poring', nivel).ok);
  }

  const max = emptyCollection();
  max.owned.poring = [0, 0, 0, 0, 3];
  check('nível 5 não funde', !fuseCard(max, 'poring', 5).ok && copiesAt(max, 'poring', 5) === 3);
  check('nível inválido não funde (0 e 1,5)', !fuseCard(max, 'poring', 0).ok && !fuseCard(max, 'poring', 1.5).ok);

  const equip = emptyCollection();
  equip.owned.poring = [5, 0, 0, 0, 0];
  equipCard(equip, 'warrior', 'poring', 1, 3);
  check('cópia equipada não conta como livre (5 possuídas, 4 livres)', freeCopiesAt(equip, 'poring', 1) === 4);
  const sobra = emptyCollection();
  sobra.owned.poring = [5, 0, 0, 0, 0];
  equipCard(sobra, 'warrior', 'poring', 1, 3);
  check('com 1 equipada, 5 possuídas não fundem (só 4 livres)', !fuseCard(sobra, 'poring', 1).ok && copiesAt(sobra, 'poring', 1) === 5);
  const outroNivel = emptyCollection();
  outroNivel.owned.poring = [5, 1, 0, 0, 0];
  equipCard(outroNivel, 'warrior', 'poring', 2, 3);
  check('carta equipada no nível 2 não reduz as livres do nível 1', freeCopiesAt(outroNivel, 'poring', 1) === 5 && fuseCard(outroNivel, 'poring', 1).ok);
}

// ---------- equipar ----------
{
  const c = emptyCollection();
  c.owned.hydra = [1, 0, 0, 0, 0];
  check('equipar nível sem cópia livre falha', equipCard(c, 'warrior', 'hydra', 2, 3) !== undefined);
  check('equipar nível com cópia livre passa', equipCard(c, 'warrior', 'hydra', 1, 3) === undefined);
  check('segunda cópia no mesmo nível recusada (só havia 1)', equipCard(c, 'mage', 'hydra', 1, 3) !== undefined);
  check('nível 0 e nível 6 recusados', equipCard(c, 'mage', 'hydra', 0, 3) !== undefined && equipCard(c, 'mage', 'hydra', 6, 3) !== undefined);

  const c2 = emptyCollection();
  c2.owned.poring = [2, 0, 0, 0, 0];
  check('equipa a 1ª cópia', equipCard(c2, 'warrior', 'poring', 1, 2) === undefined);
  check('slot cheio recusa mesmo com cópia livre', equipCard(c2, 'warrior', 'poring', 1, 1) === 'Sem slots livres.');
  check('segunda cópia com slot e posse livres passa', equipCard(c2, 'warrior', 'poring', 1, 3) === undefined && freeCopiesAt(c2, 'poring', 1) === 0);
  unequipCard(c2, 'warrior', 0);
  check('desequipar devolve a cópia', freeCopiesAt(c2, 'poring', 1) === 1 && (c2.equipped.warrior?.length ?? 0) === 1);
}

// ---------- save antigo e lixo ----------
{
  const antigo = { owned: { poring: 3, hydra: 1, angeling_2: 2, carta_que_nao_existe: 4 }, equipped: { warrior: ['poring', 'poring', 'hydra'], mage: ['angeling_2'] } };
  const m = migrateCollection(antigo);
  check('owned numérico vira cópias no nível 1 ([n,0,0,0,0])', m.owned.poring?.join() === '3,0,0,0,0');
  check('id da 2ª arte (angeling_2) vira a carta base', m.owned.angeling?.join() === '2,0,0,0,0' && !m.owned.angeling_2);
  check('id desconhecido é descartado', !('carta_que_nao_existe' in m.owned));
  check('equipadas em texto viram {id, nível 1}', JSON.stringify(m.equipped.warrior) === JSON.stringify([{ id: 'poring', level: 1 }, { id: 'poring', level: 1 }, { id: 'hydra', level: 1 }]));
  check('equipada com id antigo vira a carta base', m.equipped.mage?.[0]?.id === 'angeling' && m.equipped.mage?.[0]?.level === 1);
  const excesso = migrateCollection({ owned: { poring: 1 }, equipped: { warrior: ['poring', 'poring'] } });
  check('equipada além da posse é descartada', excesso.equipped.warrior?.length === 1);
  const novo = migrateCollection({ owned: { poring: [1, 2, 0, 0, 0] }, equipped: { mage: [{ id: 'poring', level: 2 }] } });
  check('formato novo (cópias por nível) é preservado', novo.owned.poring?.join() === '1,2,0,0,0' && novo.equipped.mage?.[0]?.level === 2);
  check('migração é idempotente', JSON.stringify(migrateCollection(m)) === JSON.stringify(m));

  const lixo: unknown[] = [null, undefined, 42, 'x', [], { owned: 'x', equipped: 5 }, { owned: { poring: 'abc' }, equipped: { nobody: ['poring'] } }, { owned: { poring: -3 }, equipped: { warrior: [{ id: 99, level: 'x' }, null, 7] } }];
  let semErro = true;
  for (const x of lixo) {
    try {
      const r = migrateCollection(x);
      if (!r || typeof r.owned !== 'object' || typeof r.equipped !== 'object') semErro = false;
    } catch {
      semErro = false;
    }
  }
  check('lixo na entrada não lança erro e devolve coleção válida', semErro);
}

// ---------- pacote ----------
{
  const gerador = (semente: number) => {
    let s = semente;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };
  const pacote = rollPack(gerador(123456789));
  check('pacote tem 5 cartas do catálogo', pacote.length === 5 && pacote.every((id) => !!CARD_BY_ID[id]), pacote.join(' '));
  check('mesma semente, mesmo pacote', JSON.stringify(rollPack(gerador(7))) === JSON.stringify(rollPack(gerador(7))));
  const vistos = new Map<string, number>();
  const rand = gerador(99);
  for (let i = 0; i < 20000; i++) for (const id of rollPack(rand)) vistos.set(id, (vistos.get(id) ?? 0) + 1);
  const cont = [...vistos.values()];
  check('todas as 102 cartas saem no sorteio', vistos.size === 102, `${vistos.size}`);
  check('sorteio uniforme (cada carta perto de 980 em 100 mil)', Math.min(...cont) > 700 && Math.max(...cont) < 1300, `min ${Math.min(...cont)} · máx ${Math.max(...cont)}`);
  check('rand = 0,99999… não passa do fim do catálogo', rollPack(() => 0.9999999999).every((id) => !!CARD_BY_ID[id]));
}

// ---------- escala e desbloqueio ----------
{
  const bonusNos = (id: string, level: number): CardRuntime[] => cardRuntimeFor('warrior', equipada(id, level));
  const efeitoB = (id: string, level: number): CardEffect => bonusNos(id, level)[0].effect;

  const goblin = [0.2, 0.25, 0.3, 0.35, 0.4];
  check('bônus escala 1, 1,25, 1,5, 1,75, 2 (goblin: +20% a +40%)', goblin.every((v, i) => {
    const e = efeitoB('goblin', i + 1) as { valor: number };
    return close(e.valor, v);
  }));
  const alice = [-0.4, -0.44, -0.48, -0.52, -0.56];
  check('ALICE usa a escala própria (1 a 1,4) e o resto não escala', alice.every((v, i) => {
    const e = efeitoB('alice', i + 1) as { valor: number; resto?: number };
    return close(e.valor, v) && e.resto === 0.4;
  }));
  check('cura do Osíris escala 0,20 → 0,40', [0.2, 0.25, 0.3, 0.35, 0.4].every((v, i) => close((efeitoB('osiris', i + 1) as { pct: number }).pct, v)));
  const forca = [2, 3, 3, 4, 4];
  check('pontos de atributo arredondam (Força +2 → 2, 3, 3, 4, 4)', forca.every((v, i) => (efeitoB('bongun', i + 1) as { value: number }).value === v));
  check('nível 4 não libera o desbloqueio', bonusNos('osiris', 4).length === 1);
  const nivel5 = bonusNos('osiris', 5);
  check('nível 5 libera o desbloqueio (2 regras, a última é o desbloqueio)', nivel5.length === 2 && nivel5[1].key.endsWith('u'));
  check('desbloqueio do Osíris sem escala (escudo 6%)', close((nivel5[1].effect as { pct: number }).pct, 0.06));
  const dois = emptyCollection();
  addCards(dois, ['poring', 'poring']);
  equipCard(dois, 'warrior', 'poring', 1, 3);
  equipCard(dois, 'warrior', 'poring', 1, 3);
  const chaves = cardRuntimeFor('warrior', dois).map((x) => x.key);
  check('duas cópias iguais têm chaves de recarga diferentes', new Set(chaves).size === chaves.length && chaves.length === 2);
  check('CardRuntime leva gatilho, chance e recarga da regra', (() => {
    const rt = cardRuntimeFor('warrior', equipada('garm', 1))[0];
    return rt.trigger === 'hurt' && close(rt.chance, 0.12) && rt.icd === 3;
  })());
  check('rótulo de nível: Fabre, Fabre+, Fabre++++', ['Fabre', 'Fabre+', 'Fabre++', 'Fabre+++', 'Fabre++++'].every((t, i) => cardLevelLabel(CARD_BY_ID.fabre, i + 1) === t));
  check('rótulo de nome composto', cardLevelLabel(CARD_BY_ID.peco_peco_egg, 2) === 'Peco Peco Egg+');
}

// ---------- perfil ----------
{
  const p = createProfile();
  const col = emptyCollection();
  addCards(col, ['poring']);
  equipCard(col, 'warrior', 'poring', 1, 3);
  applyCardLoadout(p, col);
  check('perfil recebe as regras da build do guerreiro', (p.heroes.warrior.cards as CardRuntime[] | undefined)?.length === 1);
  check('heróis sem carta ficam com lista vazia', (p.heroes.mage.cards as CardRuntime[] | undefined)?.length === 0);
}

// ---------- slots ----------
{
  const casos: [number, number][] = [[0, 0], [1, 1], [2, 2], [9, 6], [13, 7], [18, 8], [31, 10], [50, 12], [381, 30], [999, 30]];
  check('curva de slots (CARD_SLOT_WINS)', casos.every(([w, s]) => cardSlots(w) === s), casos.map(([w]) => `${w}→${cardSlots(w)}`).join(' '));
  check('campanha e Bastião somam, teto 30', cardSlotsPool(9, 9) === 12 && cardSlotsPool(999, 999) === 30);
}

console.log(failures ? `\ncardCheck: ${failures} falha(s).` : '\ncardCheck: tudo certo.');
if (failures) throw new Error(`cardCheck: ${failures} falha(s)`);
