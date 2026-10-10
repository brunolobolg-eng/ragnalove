// Checagem do sistema de cartas: catálogo, pacote, fusão, slots, afinidade,
// equipamento, coleção/save e bônus no heroStats. Sem DOM, sem run, sem save.
import {
  CARD_ART_WINDOW,
  CARD_BY_ID,
  CARD_CATALOG,
  MINIBOSSES,
  MVPS,
  NORMALS,
  addCards,
  applyCardLoadout,
  cardBonusFor,
  cardSlots,
  emptyCollection,
  equipCard,
  freeCopies,
  fuseBulk,
  fuseTriple,
  migrateCollection,
  revealOrder,
  rollPack,
  unequipCard,
} from '../src/core/progression/cards';
import { createProfile, heroStats } from '../src/core/progression/profile';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

// ---------- catálogo ----------
check('112 cartas no catálogo', CARD_CATALOG.length === 112, `${CARD_CATALOG.length}`);
{
  const ids = new Set(CARD_CATALOG.map((c) => c.id));
  check('ids únicos', ids.size === CARD_CATALOG.length);
  const badRef = CARD_CATALOG.filter((c) => !c.affinity.length || !(c.value > 0) || !CARD_BY_ID[c.id]);
  check('toda carta tem afinidade, valor e índice', badRef.length === 0);
  const arts = new Set(CARD_CATALOG.map((c) => c.art));
  check('112 artes distintas', arts.size === 112, `${arts.size}`);
}
check(`raridades: ${NORMALS.length}N/${MINIBOSSES.length}MB/${MVPS.length}MVP`, NORMALS.length === 92 && MINIBOSSES.length === 11 && MVPS.length === 9);

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

// ---------- slots: 0,2,4..20,+1..30 ----------
{
  const cases: [number, number][] = [[0, 0], [1, 2], [2, 4], [9, 18], [10, 20], [11, 21], [15, 25], [19, 29], [20, 30], [50, 30]];
  check('curva de slots', cases.every(([w, s]) => cardSlots(w) === s), cases.map(([w]) => `${w}→${cardSlots(w)}`).join(' '));
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

// ---------- equipar + afinidade ----------
{
  const c = emptyCollection();
  addCards(c, ['poring', 'poring', 'hydra', 'baphomet']);
  check('equipar além das cópias falha', equipCard(c, 'warrior', 'poring', 30) === undefined && equipCard(c, 'mage', 'poring', 30) === undefined && equipCard(c, 'archer', 'poring', 30) !== undefined);
  check('slot cheio falha', equipCard(c, 'warrior', 'hydra', 1) !== undefined);
  unequipCard(c, 'warrior', 0);
  check('desequipar libera', equipCard(c, 'warrior', 'hydra', 30) === undefined);
  // poring = VIT +3 (afinidade universal); hydra = INT +3 (mago tem, guerreiro não)
  const wVit = cardBonusFor('warrior', { owned: {}, equipped: { warrior: ['poring'] } });
  const mInt = cardBonusFor('mage', { owned: {}, equipped: { mage: ['hydra'] } });
  const wInt = cardBonusFor('warrior', { owned: {}, equipped: { warrior: ['hydra'] } });
  check('afinidade cheia', wVit.vit === 3 && mInt.int === 3, `vit=${wVit.vit} int=${mInt.int}`);
  check('sem afinidade = metade', wInt.int === 1, `int=${wInt.int}`);
  const mvp = cardBonusFor('warrior', { owned: {}, equipped: { warrior: ['baphomet'] } });
  check('MVP soma primário + secundário', mvp.str === 12 && mvp.vit === 6, `str=${mvp.str} vit=${mvp.vit}`);
  check('cópias livres descontam equipadas', freeCopies(c, 'poring') === 1 && freeCopies(c, 'hydra') === 0);
}

// ---------- bônus chega ao heroStats + save compatível ----------
{
  const p = createProfile();
  const col = emptyCollection();
  addCards(col, ['poring', 'poring', 'poring']);
  col.equipped.warrior = ['poring', 'poring', 'poring'];
  applyCardLoadout(p, col);
  const st = heroStats(p, 'warrior');
  check('cartas viram HP no combate', st.maxHp === 180 + 9 * 12, `HP ${st.maxHp}`);
  const migrated = migrateCollection(undefined);
  check('save antigo sem coleção migra vazio', Object.keys(migrated.owned).length === 0);
  const migrated2 = migrateCollection({ owned: { poring: 2 }, equipped: { mage: ['poring'] } });
  check('coleção existente preservada', migrated2.owned.poring === 2 && migrated2.equipped.mage?.[0] === 'poring');

  // revelação: Normais primeiro, MVP por último; a ordem dentro da mesma raridade é a que saiu
  const pack = ['baphomet', 'poring', 'orc_hero', 'wolf', 'garm'];
  const ordem = revealOrder(pack);
  const ranks = ordem.map((id) => ({ normal: 0, miniboss: 1, mvp: 2 })[CARD_BY_ID[id].rarity]);
  check('revelação: raridade sobe (Normal → Mini-Boss → MVP)', ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), `ordem ${ordem.join(',')}`);
  check('revelação: MVP por último', ordem[ordem.length - 1] === 'baphomet', `último ${ordem[ordem.length - 1]}`);
  check('revelação: mesma raridade mantém a ordem', ordem.indexOf('poring') < ordem.indexOf('wolf'), `ordem ${ordem.join(',')}`);
  check('revelação: não perde nem inventa carta', ordem.length === pack.length && pack.every((id) => ordem.includes(id)));
  // recorte da arte: a janela fica dentro da imagem (moldura e faixa do nome ficam de fora)
  const { x, y, w, h } = CARD_ART_WINDOW;
  check('recorte da arte dentro da imagem', x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1 && w > 0 && h > 0, JSON.stringify(CARD_ART_WINDOW));
  check('recorte tira a faixa do nome (fundo da janela acima de 0,8 da altura)', y + h <= 0.8, `fundo ${(y + h).toFixed(2)}`);
}

if (failures) {
  console.error(`cardCheck: ${failures} FALHA(S)`);
  throw new Error('cardCheck falhou');
}
console.log('cardCheck: tudo certo');
