// @ts-nocheck - script Node (usa fs, path e url; o typecheck do jogo não tem os tipos de Node), rodado com tsx
/**
 * Saves da jornada (regra 4 do CLAUDE.md, "save é sagrado").
 * 1) Saves reais de versões antigas (tests/saves/, gerados pelo código de cada versão) abrem e migram para a atual.
 * 2) Uma recarga do jogo continua a sequência de sorteios: não repete e não pula. Um controle com recarga que
 *    reinicia a seed tem que dar diferente, para provar que o teste enxerga o erro.
 * 3) Entradas que o jogo não entende (versão nova, ilegível, sem perfil, jornada encerrada) não são migradas à força.
 * 4) Migrar duas vezes não muda o save.
 *
 * Uso: npm run saves:check
 */
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { acrescentarCopia, lerJornada } from '../src/core/run/carregamento';
import { makeItem, maiorContadorVisivel, sorteioInicial, sorteioValido, VERSAO_JORNADA } from '../src/core/run/run';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PASTA = join(RAIZ, 'tests', 'saves');
const RARIDADES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
let falhas = 0;

function ok(condicao, texto) {
  if (!condicao) falhas++;
  console.log(`${condicao ? 'ok  ' : 'FALHA'} ${texto}`);
}

/** Sorteios com recarga entre cada um: salva, relê e sorteia de novo. `reinicia` simula o bug (recarga que volta à seed). */
function sequenciaComRecarga(raw, n, reinicia = false) {
  const saida = [];
  const ids = new Set();
  let atual = lerJornada(raw).run;
  for (let i = 0; i < n; i++) {
    const item = makeItem(atual, RARIDADES[i % RARIDADES.length]);
    ids.add(item.id);
    saida.push(JSON.stringify(item));
    const salvo = JSON.stringify(atual);
    atual = lerJornada(salvo).run;
    if (reinicia) atual.sorteio = sorteioInicial(atual.seed);
  }
  return { saida, idsUnicos: ids.size === n };
}

/** Os mesmos sorteios sem nenhuma recarga. */
function sequenciaContinua(raw, n) {
  const atual = lerJornada(raw).run;
  const saida = [];
  for (let i = 0; i < n; i++) saida.push(JSON.stringify(makeItem(atual, RARIDADES[i % RARIDADES.length])));
  return saida;
}

// ---------- 1) Fixtures: saves reais de versões antigas ----------
const esperadas = ['jornada_v1_867ac0d.json', 'jornada_v1_f3b5bd9.json', 'jornada_v2.json'];
const presentes = readdirSync(PASTA);
ok(esperadas.every((n) => presentes.includes(n)), `fixtures presentes em tests/saves/ (${esperadas.join(', ')})`);

for (const nome of ['jornada_v1_867ac0d.json', 'jornada_v1_f3b5bd9.json']) {
  const raw = readFileSync(join(PASTA, nome), 'utf8');
  const dados = JSON.parse(raw);
  ok(dados.version === 1 && !('sorteio' in dados), `${nome}: save real da versão 1, sem o campo sorteio`);
  const L = lerJornada(raw);
  ok(L.tipo === 'migrada' && L.deVersao === 1, `${nome}: abre e migra (tipo ${L.tipo})`);
  if (!('run' in L)) continue;
  const r = L.run;
  ok(r.version === VERSAO_JORNADA && r.seed === dados.seed, `${nome}: vira a versão ${VERSAO_JORNADA} e mantém a seed`);
  ok(r.sorteio.estado === sorteioInicial(r.seed).estado, `${nome}: sequência de sorteios começa da seed, como a versão anterior fazia`);
  ok(r.sorteio.itens === maiorContadorVisivel(r), `${nome}: contador de ids começa no maior id visível (não reemite id já usado)`);
  ok(r.profile.inventory.length === dados.profile.inventory.length, `${nome}: inventário preservado (${r.profile.inventory.length} itens)`);
  const usados = new Set([...r.profile.inventory, ...(r.shop ?? [])].map((it) => it.id));
  const novo = makeItem(r, 'rare');
  ok(!usados.has(novo.id), `${nome}: item novo não reaproveita id de item já na run (${novo.id})`);
  ok(JSON.stringify(lerJornada(JSON.stringify(r)).run) === JSON.stringify(r), `${nome}: migrar de novo não muda o save`);
}

{
  const raw = readFileSync(join(PASTA, 'jornada_v2.json'), 'utf8');
  const L = lerJornada(raw);
  ok(L.tipo === 'ok' && L.deVersao === VERSAO_JORNADA, `jornada_v2.json: abre sem migrar (tipo ${L.tipo})`);
}

// ---------- 2) Recarga continua a sequência ----------
const N = 8;
for (const nome of ['jornada_v1_867ac0d.json', 'jornada_v1_f3b5bd9.json', 'jornada_v2.json']) {
  const raw = readFileSync(join(PASTA, nome), 'utf8');
  const continua = sequenciaContinua(raw, N);
  const { saida, idsUnicos } = sequenciaComRecarga(raw, N);
  const igual = JSON.stringify(saida) === JSON.stringify(continua);
  ok(igual, `${nome}: ${N} sorteios com recarga antes de cada um = sem recarga (não repete nem pula)`);
  ok(idsUnicos, `${nome}: ids de item únicos com recarga`);
  ok(new Set(saida).size === N, `${nome}: nenhum sorteio repetido com recarga`);
}
{
  const raw = readFileSync(join(PASTA, 'jornada_v2.json'), 'utf8');
  const continua = sequenciaContinua(raw, N);
  const { saida } = sequenciaComRecarga(raw, N, true);
  ok(JSON.stringify(saida) !== JSON.stringify(continua), 'controle: recarga que reinicia a seed é pega (o teste enxerga o bug)');
}

// ---------- 3) O que o jogo não entende não é migrado à força ----------
const v2 = JSON.parse(readFileSync(join(PASTA, 'jornada_v2.json'), 'utf8'));
const casos = [
  ['sem save', null, 'nova'],
  ['texto vazio', '', 'corrompida'],
  ['JSON cortado', '{"version":2,', 'corrompida'],
  ['null', 'null', 'corrompida'],
  ['lista', '[]', 'corrompida'],
  ['texto simples', '"texto"', 'corrompida'],
  ['sem versão', JSON.stringify({ profile: v2.profile }), 'corrompida'],
  ['versão não numérica', JSON.stringify({ ...v2, version: '2' }), 'corrompida'],
  ['sem perfil de herói', JSON.stringify({ ...v2, profile: {} }), 'corrompida'],
  ['versão nova (3)', JSON.stringify({ ...v2, version: 3 }), 'versao_futura'],
  ['jornada encerrada', JSON.stringify({ ...v2, ended: 'defeat' }), 'encerrada'],
];
for (const [nome, raw, esperado] of casos) {
  const L = lerJornada(raw);
  ok(L.tipo === esperado && !('run' in L && L.tipo === 'versao_futura'), `${nome}: tipo "${L.tipo}"${L.tipo === esperado ? '' : `, esperado "${esperado}"`}`);
}
{
  const L = lerJornada(JSON.stringify({ ...v2, version: 3 }));
  ok(L.tipo === 'versao_futura' && L.versao === 3 && !('run' in L), 'versão nova: não devolve jornada nenhuma (nada é migrado nem gravado por cima)');
}
{
  const L = lerJornada(JSON.stringify({ ...v2, sorteio: { estado: 'x', itens: 2 } }));
  ok(L.tipo === 'ok' && sorteioValido(L.run.sorteio) !== undefined, 'sorteio inválido no save: abre e volta ao sorteio inicial da seed');
}
// ---------- 4) Cópias das jornadas não entendidas: a lista só cresce ----------
{
  const v3 = JSON.stringify({ ...v2, version: 3 });
  const primeira = JSON.parse(acrescentarCopia(null, v3, 'versao_futura', '2026-10-16T00:00:00Z'));
  ok(primeira.length === 1 && primeira[0].conteudo === v3, 'cópia: primeira jornada não entendida entra na lista');
  const outra = '{"version":2,"ruim":';
  const segunda = JSON.parse(acrescentarCopia(JSON.stringify(primeira), outra, 'corrompida', '2026-10-16T01:00:00Z'));
  ok(segunda.length === 2 && segunda[0].conteudo === v3 && segunda[1].conteudo === outra, 'cópia: a segunda não apaga a primeira');
  const repetida = JSON.parse(acrescentarCopia(JSON.stringify(segunda), v3, 'versao_futura', '2026-10-16T02:00:00Z'));
  ok(repetida.length === 2, 'cópia: a mesma jornada não entra duas vezes');
  const ilegivel = JSON.parse(acrescentarCopia('lista quebrada {', outra, 'corrompida', '2026-10-16T03:00:00Z'));
  ok(ilegivel.length === 2 && ilegivel[0].conteudo === 'lista quebrada {', 'cópia: lista ilegível vira a primeira entrada, sem perder o texto');
}

ok(sorteioValido({ estado: NaN, itens: 0 }) === undefined, 'sorteioValido recusa estado NaN');
ok(sorteioValido({ estado: 1, itens: -1 }) === undefined, 'sorteioValido recusa contador negativo');
ok(sorteioValido({ estado: 1, itens: 1.5 }) === undefined, 'sorteioValido recusa contador fracionado');
ok(sorteioValido({ estado: 1, itens: 2 ** 53 }) === undefined, 'sorteioValido recusa contador acima de 2^53 (trava o sorteio)');
ok(sorteioValido({ estado: 1, itens: 1_000_000_001 }) === undefined, 'sorteioValido recusa contador acima do limite de 1e9');

// ---------- 5) Migração endurecida: contador de ids, campos inválidos e loja malformada ----------
{
  const raw = readFileSync(join(PASTA, 'jornada_v1_f3b5bd9.json'), 'utf8');
  const r = lerJornada(raw).run;
  const maior = maiorContadorVisivel(r);
  ok(r.sorteio.itens === maior && maior > 0, `v1: contador de ids começa no maior id visível (${maior})`);
  // um item emitido e vendido não pode voltar: remove o de maior id da run e sorteia de novo
  const numero = (it) => parseInt(it.id.slice(3), 36);
  const maiorId = Math.max(...[...r.profile.inventory, ...(r.shop ?? [])].map(numero));
  r.profile.inventory = r.profile.inventory.filter((it) => numero(it) !== maiorId);
  r.shop = (r.shop ?? []).filter((it) => numero(it) !== maiorId);
  const novo = makeItem(r, 'rare');
  ok(numero(novo) > maiorId, `v1: item novo não reusa id emitido e vendido (${novo.id} depois de it-${maiorId.toString(36)})`);
}
{
  const L = lerJornada(JSON.stringify({ ...v2, sorteio: { estado: v2.sorteio.estado, itens: 2 ** 53 } }));
  ok(L.run.sorteio.itens <= 1_000_000_000 && Number.isSafeInteger(L.run.sorteio.itens), 'contador enorme no save: volta a um valor seguro');
  const a = makeItem(L.run, 'rare');
  const b = makeItem(L.run, 'rare');
  ok(a.id !== b.id, 'contador enorme no save: os sorteios seguem sem travar e com ids diferentes');
}
{
  const L = lerJornada(JSON.stringify({ ...v2, sorteio: { estado: v2.sorteio.estado, itens: -1 } }));
  ok(L.run.sorteio.estado === v2.sorteio.estado, 'campo inválido (itens) não joga fora um estado válido: a sequência continua');
}
{
  const L = lerJornada(JSON.stringify({ ...v2, sorteio: { estado: 'x', itens: 2 } }));
  ok(L.run.sorteio.estado === sorteioInicial(v2.seed).estado && L.run.sorteio.itens === 2, 'estado inválido: volta ao estado da seed e mantém o contador válido');
}
{
  const L1 = lerJornada(JSON.stringify({ ...v2, shop: {} }));
  ok(L1.tipo === 'ok' && L1.run.shop === undefined, 'loja malformada ({}): sai do save, a cidade regenera a loja');
  ok(typeof makeItem(L1.run, 'rare').id === 'string', 'loja malformada: os sorteios continuam funcionando');
  const L2 = lerJornada(JSON.stringify({ ...v2, shop: [null] }));
  ok(L2.run.shop === undefined, 'loja com item nulo: sai do save');
}

if (falhas) {
  console.log(`\nsaves: ${falhas} falha(s)`);
  process.exitCode = 1;
} else {
  console.log('\nsaves: tudo certo');
}
