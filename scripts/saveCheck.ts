// @ts-nocheck - script Node (usa fs, path e url; o typecheck do jogo não tem os tipos de Node), rodado com tsx
/**
 * Saves da jornada (regra 4 do CLAUDE.md, "save é sagrado"), fluxos de sorteio e versões descontinuadas.
 * 1) Saves reais (tests/saves/, gerados pelo código de cada versão): v1 e v2 são descontinuadas (o texto vai para
 *    a cópia de segurança e a jornada não continua); a v3 abre direto.
 * 2) Uma recarga do jogo continua a sequência de cada fluxo: não repete e não pula. Um controle com recarga que
 *    reinicia os fluxos tem que dar diferente, para provar que o teste enxerga o erro.
 * 3) Loja e cofre têm fluxos próprios: abrir o cofre não muda o estoque da loja, e a ordem não muda a recompensa.
 *    Os sorteios da jornada (loot) também não mudam com loja e cofre (ids à parte).
 * 4) Entradas que o jogo não entende não são continuadas à força. Ler de novo não muda o save.
 * 5) Cópias (runBackup), limites do sorteio e campos ausentes (helper migrateRun, só para o save atual).
 * 6) Regressões da revisão: sobreposição entre fluxos, loja que não é lista, estado fora de 32 bits.
 *
 * Uso: npm run saves:check
 */
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { acrescentarCopia, lerJornada } from '../src/core/run/carregamento';
import { makeItem, maiorContadorVisivel, migrateRun, newRun, shopStock, sorteioInicial, sorteioValido, useMapObject, VERSAO_JORNADA } from '../src/core/run/run';
import { Rng } from '../src/core/sim/rng';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PASTA = join(RAIZ, 'tests', 'saves');
const RARIDADES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const SEED = 4242;
let falhas = 0;

function ok(condicao, texto) {
  if (!condicao) falhas++;
  console.log(`${condicao ? 'ok  ' : 'FALHA'} ${texto}`);
}

const lerSave = (nome) => readFileSync(join(PASTA, nome), 'utf8');
const iniciais = (seed) => sorteioInicial(seed).estados;

/** Sorteios da jornada com recarga entre cada um: salva, relê e sorteia de novo. `reinicia` simula o bug. */
function sequenciaComRecarga(raw, n, reinicia = false) {
  const saida = [];
  const ids = new Set();
  let atual = lerJornada(raw).run;
  for (let i = 0; i < n; i++) {
    const item = makeItem(atual, RARIDADES[i % RARIDADES.length]);
    ids.add(item.id);
    saida.push(JSON.stringify(item));
    atual = lerJornada(JSON.stringify(atual)).run;
    if (reinicia) atual.sorteio = sorteioInicial(atual.seed);
  }
  return { saida, idsUnicos: ids.size === n };
}

/** Os mesmos sorteios da jornada, sem nenhuma recarga. */
function sequenciaContinua(raw, n) {
  const atual = lerJornada(raw).run;
  const saida = [];
  for (let i = 0; i < n; i++) saida.push(JSON.stringify(makeItem(atual, RARIDADES[i % RARIDADES.length])));
  return saida;
}

/** Um cofre (objeto 'cart', "Vasculhar a carga"): devolve quanto de almas e Zen ganhou. */
function cofre(r, id) {
  const p = r.profile;
  const antes = [p.souls, p.zeni];
  useMapObject(r, 'cart', id, 'use');
  return [p.souls - antes[0], p.zeni - antes[1]];
}

/** Loja e cofre alternados. Com `recarga`, o save é relido antes de cada ação; com `reinicia`, a recarga volta à seed. */
function lojaECofre(r0, n, recarga, reinicia = false) {
  const saida = [];
  let atual = r0;
  for (let i = 0; i < n; i++) {
    if (recarga) {
      atual = lerJornada(JSON.stringify(atual)).run;
      if (reinicia) atual.sorteio = sorteioInicial(atual.seed);
    }
    if (i % 2 === 0) {
      atual.shop = undefined;
      saida.push(JSON.stringify(['loja', shopStock(atual), atual.sorteio.estados]));
    } else {
      saida.push(JSON.stringify(['cofre', cofre(atual, i + 1), atual.sorteio.estados]));
    }
  }
  return saida;
}

// ---------- 1) Saves reais: versões antigas são descontinuadas; a atual abre direto ----------
const presentes = readdirSync(PASTA);
const esperadas = ['jornada_v1_867ac0d.json', 'jornada_v1_f3b5bd9.json', 'jornada_v2.json', 'jornada_v3.json'];
ok(esperadas.every((n) => presentes.includes(n)), `fixtures presentes em tests/saves/ (${esperadas.join(', ')})`);

for (const nome of ['jornada_v1_867ac0d.json', 'jornada_v1_f3b5bd9.json', 'jornada_v2.json']) {
  const raw = lerSave(nome);
  const versao = JSON.parse(raw).version;
  const L = lerJornada(raw);
  ok(L.tipo === 'descontinuada' && L.versao === versao, `${nome}: versão ${versao} é descontinuada (tipo ${L.tipo})`);
  ok(!('run' in L), `${nome}: a jornada não é continuada (nenhuma run é devolvida)`);
  const copia = JSON.parse(acrescentarCopia(null, raw, `descontinuada: versão ${versao}`, '2026-10-16T00:00:00Z'));
  ok(copia.length === 1 && copia[0].conteudo === raw, `${nome}: o texto inteiro vai para a cópia de segurança`);
}
{
  const raw = lerSave('jornada_v3.json');
  const L = lerJornada(raw);
  ok(L.tipo === 'ok' && L.run.version === VERSAO_JORNADA, `jornada_v3.json: abre direto na versão ${VERSAO_JORNADA} (tipo ${L.tipo})`);
  ok(JSON.stringify(lerJornada(JSON.stringify(L.run)).run) === JSON.stringify(L.run), 'jornada_v3.json: ler de novo não muda o save');
}

// ---------- 2) Recarga continua a sequência de cada fluxo (save atual) ----------
const N = 8;
{
  const raw = lerSave('jornada_v3.json');
  const continua = sequenciaContinua(raw, N);
  const { saida, idsUnicos } = sequenciaComRecarga(raw, N);
  ok(JSON.stringify(saida) === JSON.stringify(continua), `jornada_v3.json: ${N} sorteios da jornada com recarga antes de cada um = sem recarga (não repete nem pula)`);
  ok(idsUnicos && new Set(saida).size === N, 'jornada_v3.json: ids e sorteios da jornada sem repetição com recarga');
  const semRecarga = lojaECofre(lerJornada(raw).run, 6, false);
  const comRecarga = lojaECofre(lerJornada(raw).run, 6, true);
  ok(JSON.stringify(semRecarga) === JSON.stringify(comRecarga), 'jornada_v3.json: loja e cofre com recarga antes de cada ação = sem recarga');
}
{
  const raw = lerSave('jornada_v3.json');
  const continua = sequenciaContinua(raw, N);
  const { saida } = sequenciaComRecarga(raw, N, true);
  ok(JSON.stringify(saida) !== JSON.stringify(continua), 'controle: recarga que reinicia a seed da jornada é pega (o teste enxerga o bug)');
  const sem = lojaECofre(newRun('warrior', SEED), 6, false);
  const reinicia = lojaECofre(newRun('warrior', SEED), 6, true, true);
  ok(JSON.stringify(reinicia) !== JSON.stringify(sem), 'controle: recarga que reinicia loja e cofre é pega');
}

// ---------- 3) Loja e cofre: fluxos separados ----------
{
  const estadosIniciais = iniciais(SEED);
  ok(new Set(Object.values(estadosIniciais)).size === 3, 'os três fluxos (jornada, loja e cofre) começam em estados diferentes');

  const r = newRun('warrior', SEED);
  const antes = { ...iniciais(SEED) };
  shopStock(r);
  ok(r.sorteio.estados.loja !== antes.loja, 'loja: avança o próprio fluxo');
  ok(r.sorteio.estados.cofre === antes.cofre && r.sorteio.estados.jornada === antes.jornada, 'loja: não mexe no fluxo do cofre nem no da jornada');

  const c = newRun('warrior', SEED);
  const antesC = { ...iniciais(SEED) };
  cofre(c, 1);
  ok(c.sorteio.estados.cofre !== antesC.cofre, 'cofre: avança o próprio fluxo');
  ok(c.sorteio.estados.loja === antesC.loja && c.sorteio.estados.jornada === antesC.jornada, 'cofre: não mexe no fluxo da loja nem no da jornada');

  const estoqueA = JSON.stringify(shopStock(newRun('warrior', SEED)));
  const B = newRun('warrior', SEED);
  cofre(B, 1);
  ok(estoqueA === JSON.stringify(shopStock(B)), 'loja: abrir o cofre antes não muda o estoque da loja');

  const ganhoSemLoja = cofre(newRun('warrior', SEED), 1);
  const E = newRun('warrior', SEED);
  shopStock(E);
  const ganhoComLoja = cofre(E, 1);
  ok(ganhoSemLoja.some((x) => x > 0), `cofre: a recompensa de teste não é zero (${ganhoSemLoja.join(' de almas, ')} de Zen)`);
  ok(JSON.stringify(ganhoSemLoja) === JSON.stringify(ganhoComLoja), 'cofre: gerar a loja antes não muda a recompensa do cofre');

  const semId = (it) => JSON.stringify({ ...it, id: undefined });
  const F = newRun('warrior', SEED);
  const lootSo = [makeItem(F, 'rare'), makeItem(F, 'epic'), makeItem(F, 'common')].map(semId);
  const G = newRun('warrior', SEED);
  shopStock(G);
  cofre(G, 1);
  cofre(G, 2);
  const lootMisto = [makeItem(G, 'rare'), makeItem(G, 'epic'), makeItem(G, 'common')].map(semId);
  ok(JSON.stringify(lootSo) === JSON.stringify(lootMisto), 'loot da jornada: loja e cofre não mudam o conteúdo dos sorteios da jornada (ids à parte)');
}

// ---------- 4) Cópias das jornadas não continuadas: a lista só cresce ----------
const v3 = JSON.parse(lerSave('jornada_v3.json'));
const v3Futura = JSON.stringify({ ...v3, version: 4 });
{
  const primeira = JSON.parse(acrescentarCopia(null, v3Futura, 'versao_futura', '2026-10-16T00:00:00Z'));
  ok(primeira.length === 1 && primeira[0].conteudo === v3Futura, 'cópia: primeira jornada não entendida entra na lista');
  const outra = '{"version":3,"ruim":';
  const segunda = JSON.parse(acrescentarCopia(JSON.stringify(primeira), outra, 'corrompida', '2026-10-16T01:00:00Z'));
  ok(segunda.length === 2 && segunda[0].conteudo === v3Futura && segunda[1].conteudo === outra, 'cópia: a segunda não apaga a primeira');
  const repetida = JSON.parse(acrescentarCopia(JSON.stringify(segunda), v3Futura, 'versao_futura', '2026-10-16T02:00:00Z'));
  ok(repetida.length === 2, 'cópia: a mesma jornada não entra duas vezes');
  const ilegivel = JSON.parse(acrescentarCopia('lista quebrada {', outra, 'corrompida', '2026-10-16T03:00:00Z'));
  ok(ilegivel.length === 2 && ilegivel[0].conteudo === 'lista quebrada {', 'cópia: lista ilegível vira a primeira entrada, sem perder o texto');
}

// ---------- 5) O que o jogo não entende não é continuado à força ----------
const casos = [
  ['sem save', null, 'nova'],
  ['texto vazio', '', 'corrompida'],
  ['JSON cortado', '{"version":3,', 'corrompida'],
  ['null', 'null', 'corrompida'],
  ['lista', '[]', 'corrompida'],
  ['texto simples', '"texto"', 'corrompida'],
  ['sem versão', JSON.stringify({ profile: v3.profile }), 'corrompida'],
  ['versão não numérica', JSON.stringify({ ...v3, version: '3' }), 'corrompida'],
  ['sem perfil de herói', JSON.stringify({ ...v3, profile: {} }), 'corrompida'],
  ['versão nova (4)', v3Futura, 'versao_futura'],
  ['jornada encerrada', JSON.stringify({ ...v3, ended: 'defeat' }), 'encerrada'],
  ['versão 2 (descontinuada)', lerSave('jornada_v2.json'), 'descontinuada'],
  ['versão 1 (descontinuada)', lerSave('jornada_v1_f3b5bd9.json'), 'descontinuada'],
];
for (const [nome, raw, esperado] of casos) {
  const L = lerJornada(raw);
  ok(L.tipo === esperado, `${nome}: tipo "${L.tipo}"${L.tipo === esperado ? '' : `, esperado "${esperado}"`}`);
}
{
  const L = lerJornada(v3Futura);
  ok(L.tipo === 'versao_futura' && L.versao === 4 && !('run' in L), 'versão nova: não devolve jornada nenhuma (nada é continuado nem gravado por cima)');
}

// ---------- 6) Limites do sorteio e campos ausentes ----------
const comSorteio = (sorteio) => JSON.stringify({ ...v3, sorteio });
ok(sorteioValido({ estados: { jornada: NaN, loja: 1, cofre: 2 }, itens: 0 }) === undefined, 'sorteioValido recusa estado NaN');
ok(sorteioValido({ estados: { jornada: 1, loja: 2, cofre: 3 }, itens: -1 }) === undefined, 'sorteioValido recusa contador negativo');
ok(sorteioValido({ estados: { jornada: 1, loja: 2, cofre: 3 }, itens: 1.5 }) === undefined, 'sorteioValido recusa contador fracionado');
ok(sorteioValido({ estados: { jornada: 1, loja: 2, cofre: 3 }, itens: 2 ** 53 }) === undefined, 'sorteioValido recusa contador acima de 2^53 (trava o sorteio)');
ok(sorteioValido({ estados: { jornada: 1, loja: 2, cofre: 3 }, itens: 1_000_000_001 }) === undefined, 'sorteioValido recusa contador acima do limite de 1e9');
ok(sorteioValido({ estados: { jornada: 1, cofre: 3 }, itens: 0 }) === undefined, 'sorteioValido recusa fluxo ausente (loja)');
ok(sorteioValido({ estado: 1, itens: 0 }) === undefined, 'sorteioValido recusa o formato antigo (um estado só)');
{
  // migrateRun só é chamado no save atual; aqui é testado direto, com campos ausentes (o save da v1 antiga não é mais continuado)
  const dados = JSON.parse(lerSave('jornada_v1_f3b5bd9.json'));
  const r = migrateRun(dados);
  const maior = maiorContadorVisivel(r);
  ok(r.sorteio.itens === maior && maior > 0, `campos ausentes: contador de ids começa no maior id visível (${maior})`);
  ok(r.sorteio.estados.jornada === iniciais(r.seed).jornada && r.sorteio.estados.loja === iniciais(r.seed).loja, 'campos ausentes: os três fluxos começam da seed');
  const numero = (it) => parseInt(it.id.slice(3), 36);
  const maiorId = Math.max(...[...r.profile.inventory, ...(r.shop ?? [])].map(numero));
  r.profile.inventory = r.profile.inventory.filter((it) => numero(it) !== maiorId);
  r.shop = (r.shop ?? []).filter((it) => numero(it) !== maiorId);
  const novo = makeItem(r, 'rare');
  ok(numero(novo) > maiorId, `campos ausentes: item novo não reusa id emitido e vendido (${novo.id} depois de it-${maiorId.toString(36)})`);
}
{
  const L = lerJornada(comSorteio({ estados: v3.sorteio.estados, itens: 2 ** 53 }));
  ok(L.run.sorteio.itens <= 1_000_000_000 && Number.isSafeInteger(L.run.sorteio.itens), 'contador enorme no save: volta a um valor seguro');
  const a = makeItem(L.run, 'rare');
  const b = makeItem(L.run, 'rare');
  ok(a.id !== b.id, 'contador enorme no save: os sorteios seguem sem travar e com ids diferentes');
}
{
  const L = lerJornada(comSorteio({ estados: v3.sorteio.estados, itens: -1 }));
  ok(JSON.stringify(L.run.sorteio.estados) === JSON.stringify(v3.sorteio.estados), 'campo inválido (itens) não joga fora os estados: as três sequências continuam');
}
{
  const L = lerJornada(comSorteio({ estados: { ...v3.sorteio.estados, jornada: 'x' }, itens: 2 }));
  const i = iniciais(v3.seed);
  ok(L.run.sorteio.estados.jornada === i.jornada && L.run.sorteio.estados.loja === v3.sorteio.estados.loja && L.run.sorteio.estados.cofre === v3.sorteio.estados.cofre && L.run.sorteio.itens === 2, 'estado da jornada inválido: só ele volta à seed; loja e cofre mantêm o seu');
}
{
  const L = lerJornada(comSorteio({ estados: { ...v3.sorteio.estados, loja: null }, itens: 2 }));
  ok(L.run.sorteio.estados.loja === iniciais(v3.seed).loja && L.run.sorteio.estados.jornada === v3.sorteio.estados.jornada, 'estado da loja inválido: volta à seed e a jornada não muda');
}
{
  const L = lerJornada(comSorteio({ estado: 'x', itens: 2 }));
  const i = iniciais(v3.seed);
  ok(L.run.sorteio.estados.jornada === i.jornada && L.run.sorteio.estados.loja === i.loja && L.run.sorteio.estados.cofre === i.cofre, 'formato sem estados: os três começam da seed, e o contador válido é mantido');
}
{
  const L1 = lerJornada(JSON.stringify({ ...v3, shop: {} }));
  ok(L1.tipo === 'ok' && L1.run.shop === undefined, 'loja malformada ({}): sai do save, a cidade regenera a loja');
  ok(typeof makeItem(L1.run, 'rare').id === 'string', 'loja malformada: os sorteios continuam funcionando');
  const L2 = lerJornada(JSON.stringify({ ...v3, shop: [null] }));
  ok(L2.run.shop === undefined, 'loja com item nulo: sai do save');
}

// ---------- 7) Regressões da revisão: sobreposição entre fluxos, loja que não é lista, estado fora de 32 bits ----------
{
  // seeds em que o cofre (ou a loja) caía no meio da sequência da jornada, deslocado de 1515 sorteios
  const da = (estado) => {
    const g = new Rng(estado);
    const v = [];
    for (let i = 0; i < 3000; i++) v.push(g.next());
    return v;
  };
  for (const seed of [296209, 275859982]) {
    const e = iniciais(seed);
    const jornada = new Set(da(e.jornada));
    const repetidos = da(e.cofre).filter((x) => jornada.has(x)).length + da(e.loja).filter((x) => jornada.has(x)).length;
    ok(repetidos === 0, `sementes ${seed}: os fluxos não repetem valores uns dos outros nos primeiros 3000 sorteios (${repetidos} repetidos)`);
  }
}
{
  const L = lerJornada(JSON.stringify({ ...v3, shop: 5, sorteio: { estados: v3.sorteio.estados } }));
  ok(L.tipo === 'ok' && L.run.shop === undefined, 'loja que não é lista e contador ausente: o save abre (não vira "corrompida") e a loja é regenerada');
}
for (const [nome, valor] of [['1e308', 1e308], ['2^32', 4294967296], ['1.5', 1.5], ['-1', -1]]) {
  const L = lerJornada(comSorteio({ estados: { ...v3.sorteio.estados, jornada: valor }, itens: 2 }));
  ok(L.run.sorteio.estados.jornada === iniciais(v3.seed).jornada, `estado da jornada ${nome} fora de 32 bits: volta à seed (não vira 0 em silêncio)`);
}
{
  // distância no ciclo do gerador: k tal que b = a + k*GAMMA (mod 2^32). Dois fluxos só se encontram se |k| for pequeno.
  const GAMMA = 0x6d2b79f5;
  const inverso = (a) => {
    let x = a;
    for (let i = 0; i < 5; i++) x = Math.imul(x, (2 - Math.imul(a, x)) | 0);
    return x >>> 0;
  };
  const INV = inverso(GAMMA);
  const distancia = (a, b) => Math.abs(Math.imul((b - a) >>> 0, INV) | 0);
  for (const seed of [7, 4242, 90210, 296209, 275859982]) {
    const e = iniciais(seed);
    const menor = Math.min(distancia(e.jornada, e.loja), distancia(e.jornada, e.cofre), distancia(e.loja, e.cofre));
    ok(menor >= 2 ** 29, `sementes ${seed}: os três fluxos ficam a pelo menos 2^29 sorteios uns dos outros (menor distância ${menor})`);
  }
}

if (falhas) {
  console.log(`\nsaves: ${falhas} falha(s)`);
  process.exitCode = 1;
} else {
  console.log('\nsaves: tudo certo');
}
