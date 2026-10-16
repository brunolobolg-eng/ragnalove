// Determinismo do gerador de sorteios da jornada (loja, presente, refino, reroll, cofre, evento e roleta).
// A mesma sequência de sorteios roda de duas formas: direto, e com save + recarga no meio. As duas
// precisam dar exatamente o mesmo resultado. Também confere: ids de item únicos, save antigo (sem o campo
// `sorteio`) migra e continua, a migração é idempotente e o controle (recarga SEM gravar o gerador) diverge,
// o que prova que o teste pega a regressão. Sem DOM: só lógica do core/run.
import { applyEventEffects, buyItem, makeItem, migrateRun, newRun, refineItem, rerollItem, salvarJornada, shopStock, starterGift, survivalRewards, useMapObject, type RunState } from '../src/core/run/run';
import type { Item } from '../src/core/progression/equipment';

let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
};

const PASSOS = 60;
const SEEDS = [42, 977, 123456];

/** Um passo da sequência: um sorteio de cada tipo (loja, presente, refino, reroll, cofre, evento, roleta). */
function passo(r: RunState, i: number): string[] {
  const out: string[] = [];
  const alvo: Item | undefined = r.profile.inventory[i % Math.max(1, r.profile.inventory.length)];
  switch (i % 7) {
    case 0: {
      r.shop = undefined; // loja nova: o estoque inteiro é sorteado
      const stock = shopStock(r);
      out.push(`loja ${stock.map((it) => `${it.id}:${it.rarity}`).join(' ')}`);
      const primeiro = stock[0];
      if (primeiro && i % 2 === 0) out.push(`compra ${buyItem(r, primeiro.id)}`);
      break;
    }
    case 1: {
      const gift = starterGift(r);
      r.profile.inventory.push(...gift);
      out.push(`presente ${gift.map((it) => `${it.id}:${it.rarity}`).join(' ')}`);
      break;
    }
    case 2:
      if (alvo) out.push(`refino ${alvo.id} ${refineItem(r, alvo).text} +${alvo.refine ?? 0}`);
      break;
    case 3:
      if (alvo) out.push(`reroll ${alvo.id} ${rerollItem(r, alvo) ?? ''} ${JSON.stringify(alvo.rolls)}`);
      break;
    case 4:
      out.push(`cofre ${useMapObject(r, 'cart', 1000 + i, 'use')}`);
      break;
    case 5:
      out.push(`evento ${applyEventEffects(r, [{ gamble: { chance: 0.5, win: [{ item: 'rare' }], lose: [{ zeni: -10 }], winText: 'ganhou', loseText: 'perdeu' } }]).join(' | ')}`);
      break;
    case 6: {
      const res = survivalRewards(r, 30 + i, 40 + i);
      const prizes = res.rarities.map((ra) => makeItem(r, ra, undefined, r.party));
      r.profile.inventory.push(...prizes);
      out.push(`roleta ${res.score} ${prizes.map((it) => `${it.id}:${it.rarity}`).join(' ')}`);
      break;
    }
  }
  out.push(`zeni ${r.profile.zeni}`);
  return out;
}

type Modo = 'gravando' | 'sem-gravar';

/** Roda a sequência. `recargas` = passos em que a run é salva e recarregada antes de sortear. */
function rodar(seed: number, recargas: number[], modo: Modo = 'gravando'): { log: string[]; r: RunState } {
  let r = newRun('warrior', seed);
  r.profile.zeni = 1_000_000_000;
  const log: string[] = [];
  for (let i = 0; i < PASSOS; i++) {
    if (recargas.includes(i)) {
      const texto = modo === 'gravando' ? salvarJornada(r) : JSON.stringify(r);
      r = migrateRun(JSON.parse(texto) as RunState);
    }
    log.push(...passo(r, i));
  }
  return { log, r };
}

const mesmo = (a: { log: string[]; r: RunState }, b: { log: string[]; r: RunState }) =>
  a.log.join('\n') === b.log.join('\n') && JSON.stringify(a.r.profile.inventory) === JSON.stringify(b.r.profile.inventory);

/** Assinatura FNV-1a do log: igual em execuções diferentes (relógio não entra no sorteio). */
function assinatura(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const RECARGAS: number[][] = [[1], [13], [30], [44, 45], [59]];

for (const seed of SEEDS) {
  const base = rodar(seed, []);
  const ids = base.r.profile.inventory.map((it) => it.id);
  check(`seed ${seed}: sequência gera itens`, ids.length >= 20, `${ids.length} itens, assinatura ${assinatura(base.log.join('\n'))}`);
  check(`seed ${seed}: ids de item únicos`, new Set(ids).size === ids.length);
  const prefixo = `it-${seed.toString(36)}-`;
  check(`seed ${seed}: ids no formato it-<seed>-<n>`, ids.every((id) => id.startsWith(prefixo)));

  for (const recargas of RECARGAS) {
    const com = rodar(seed, recargas);
    check(`seed ${seed}: recarga em ${recargas.join(',')} continua igual`, mesmo(base, com));
    const unicos = new Set(com.r.profile.inventory.map((it) => it.id)).size === com.r.profile.inventory.length;
    check(`seed ${seed}: recarga em ${recargas.join(',')} mantém ids únicos`, unicos);
  }

  const controle = rodar(seed, [30], 'sem-gravar');
  check(`seed ${seed}: controle (recarga sem gravar o gerador) diverge`, !mesmo(base, controle));
}

// ---------- Save antigo: sem o campo `sorteio`, com itens de id já existente ----------
{
  const seed = SEEDS[0];
  const r = newRun('warrior', seed);
  r.profile.zeni = 1_000_000_000;
  for (let i = 0; i < 30; i++) passo(r, i);
  // um item com o id do formato antigo (it-<ts>-<rand>), como os saves de versões anteriores
  r.profile.inventory.push({ ...r.profile.inventory[0], id: 'it-mvafvqpo-964477283' });
  const antigo = JSON.parse(JSON.stringify(r)) as RunState;
  check('save antigo não tem o campo sorteio', antigo.sorteio === undefined);

  const m1 = migrateRun(antigo);
  check('migração cria o campo sorteio', m1.sorteio !== undefined && Number.isFinite(m1.sorteio.rng) && Number.isFinite(m1.sorteio.itens));
  const texto1 = JSON.stringify(m1);
  const m2 = migrateRun(JSON.parse(texto1) as RunState);
  check('migração é idempotente', JSON.stringify(m2) === texto1);

  const novo = makeItem(m1, 'rare');
  check('item novo depois da migração não repete id existente', !m1.profile.inventory.some((it) => it.id === novo.id), novo.id);
  m1.profile.inventory.push(novo);
  const ids = m1.profile.inventory.map((it) => it.id);
  check('ids continuam únicos depois da migração', new Set(ids).size === ids.length);

  const salvo = JSON.parse(salvarJornada(m1)) as RunState;
  check('save depois da migração grava o gerador', salvo.sorteio !== undefined && salvo.sorteio.itens >= m1.sorteio!.itens);
}

// ---------- Corrompido: sorteio inválido é refeito a partir da seed, sem repetir ids ----------
{
  const r = newRun('warrior', SEEDS[1]);
  r.profile.zeni = 1_000_000_000;
  for (let i = 0; i < 10; i++) passo(r, i);
  const corrompido = JSON.parse(salvarJornada(r)) as RunState;
  corrompido.sorteio = { rng: Number.NaN, itens: 0 };
  const m = migrateRun(corrompido);
  const ids = m.profile.inventory.map((it) => it.id);
  const novo = makeItem(m, 'common');
  check('sorteio corrompido: a migração refaz o campo', Number.isFinite(m.sorteio!.rng));
  check('sorteio corrompido: id novo não repete nenhum existente', !ids.includes(novo.id), novo.id);
}

if (failures) {
  console.error(`determinismCheck: ${failures} FALHA(S)`);
  throw new Error('determinismCheck falhou');
}
console.log('determinismCheck: tudo certo');
