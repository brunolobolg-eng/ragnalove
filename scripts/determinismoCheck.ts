// @ts-nocheck - script Node (usa fs, path, crypto e process; o typecheck do jogo não tem os tipos de Node), rodado com tsx
/**
 * Determinismo do núcleo (regra 3 do CLAUDE.md): dentro de src/core só há sorteio com semente.
 * 1) Varredura estática da AST de src/core: relógio e acaso fora da semente. Comentários e textos não contam.
 * 2) Reprodutibilidade: para 3 sementes, a jornada (presente, mítico, loja, compra, evento com aposta, cofre,
 *    sobrevivência, refino, reroll e uma recarga de save) sai igual em 3 execuções. Duas delas trocam
 *    Date.now e Math.random por outras fontes; a terceira usa as reais. Qualquer relógio ou acaso escondido
 *    no núcleo muda o resultado e a checagem falha.
 *
 * Uso: npm run determinismo:check
 *      (opcional: `tsx scripts/determinismoCheck.ts <pasta>` varre outra pasta; serve para testar a própria varredura)
 */
import ts from 'typescript';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { applyEventEffects, bossMythicReward, buyItem, makeItem, newRun, refineItem, rerollItem, shopStock, starterGift, survivalRewards, useMapObject } from '../src/core/run/run';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PASTA_CORE = process.argv[2] ? resolve(process.argv[2]) : join(RAIZ, 'src', 'core');

/** Membros proibidos no núcleo: relógio e acaso fora da semente. */
const MEMBROS_PROIBIDOS = new Set(['Math.random', 'Date.now', 'performance.now', 'crypto.randomUUID', 'crypto.getRandomValues', 'process.hrtime', 'Temporal.Now']);
/** Funções globais proibidas quando chamadas direto. `Date()` sem `new` devolve a data atual. */
const CHAMADAS_PROIBIDAS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'Date']);

interface Achado {
  arquivo: string;
  linha: number;
  trecho: string;
}

function arquivosTs(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

/** Procura chamadas proibidas pela AST (então comentários, strings e nomes de método não contam). */
function varrer(pasta) {
  const achados = [];
  const arquivos = arquivosTs(pasta);
  for (const caminho of arquivos) {
    const fonte = ts.createSourceFile(caminho, readFileSync(caminho, 'utf8'), ts.ScriptTarget.ES2020, true);
    const registra = (no, motivo) => {
      const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
      const trecho = no.getText(fonte).replace(/\s+/g, ' ').slice(0, 80);
      achados.push({ arquivo: relative(RAIZ, caminho), linha: line + 1, trecho: `${motivo}: ${trecho}` });
    };
    const visita = (no) => {
      if (ts.isPropertyAccessExpression(no)) {
        const membro = `${no.expression.getText(fonte)}.${no.name.getText(fonte)}`;
        if (MEMBROS_PROIBIDOS.has(membro)) registra(no, 'proibido');
      } else if (ts.isElementAccessExpression(no) && ts.isStringLiteral(no.argumentExpression)) {
        const membro = `${no.expression.getText(fonte)}.${no.argumentExpression.text}`;
        if (MEMBROS_PROIBIDOS.has(membro)) registra(no, 'proibido');
      } else if (ts.isCallExpression(no) && ts.isIdentifier(no.expression) && CHAMADAS_PROIBIDAS.has(no.expression.text)) {
        registra(no, 'chamada proibida');
      } else if (ts.isNewExpression(no) && ts.isIdentifier(no.expression) && no.expression.text === 'Date' && (!no.arguments || no.arguments.length === 0)) {
        registra(no, 'new Date() sem argumento');
      }
      ts.forEachChild(no, visita);
    };
    visita(fonte);
  }
  return { arquivos: arquivos.length, achados };
}

// ---------------- 2) Reprodutibilidade ----------------
const SEMENTES = [7, 4242, 90210];

/** Roda `fn` com Date.now e Math.random trocados por outras fontes (e restaura no fim). */
function comRelogioEAcaso(relogio, acaso, fn) {
  const dateNow = Date.now;
  const random = Math.random;
  let tempo = relogio;
  let estado = acaso;
  Date.now = () => (tempo += 17); // muda a cada chamada: se o núcleo lê o relógio, o resultado muda
  Math.random = () => (estado = (estado * 16807) % 2147483647) / 2147483647; // gerador diferente do Rng do jogo
  try {
    return fn();
  } finally {
    Date.now = dateNow;
    Math.random = random;
  }
}

/** Uma parte da jornada, do começo a um save recarregado. Devolve o que sai dela e se os ids são únicos. */
function jornada(seed) {
  const r = newRun('warrior', seed);
  r.profile.zeni = 100000;
  const ganhos = starterGift(r);
  const mitico = bossMythicReward(r, 'boss', []);
  for (const it of [...ganhos, ...(mitico ? [mitico] : [])]) r.profile.inventory.push(it);
  const loja = shopStock(r).slice();
  const comprado = buyItem(r, loja[0].id);
  const evento = applyEventEffects(r, [
    { item: 'rare' },
    { gamble: { chance: 0.5, win: [{ item: 'epic' }], lose: [{ item: 'uncommon' }], winText: 'ganhou', loseText: 'perdeu' } },
  ]);
  const cofre = useMapObject(r, 'cart', 1, 'use');
  const sobrevivencia = survivalRewards(r, 40, 300);
  const extra = makeItem(r, 'legendary');
  r.profile.inventory.push(extra);
  const refino = refineItem(r, extra);
  const rolagem = rerollItem(r, extra);
  // recarga de save: ida e volta em JSON (como o save) e mais sorteios depois dela
  const salva = JSON.parse(JSON.stringify(r));
  const depois = [makeItem(salva, 'rare'), makeItem(salva, 'epic')];
  salva.profile.inventory.push(...depois);
  const ids = [...salva.profile.inventory, ...(salva.shop ?? [])].map((it) => it.id);
  return {
    dados: { ganhos, mitico, loja, comprado, evento, cofre, sobrevivencia, refino, rolagem, extra, depois, zeni: salva.profile.zeni, inventario: salva.profile.inventory, lojaDepois: salva.shop },
    idsUnicos: new Set(ids).size === ids.length,
  };
}

// ---------------- Execução ----------------
let falhas = 0;

const estatica = varrer(PASTA_CORE);
console.log(`varredura estática de ${relative(RAIZ, PASTA_CORE)}: ${estatica.arquivos} arquivos, ${estatica.achados.length} chamada(s) proibida(s)`);
for (const a of estatica.achados) console.log(`  FALHA ${a.arquivo}:${a.linha} → ${a.trecho}`);
if (estatica.achados.length) falhas++;

const assinaturas = [];
for (const seed of SEMENTES) {
  const execucoes = [
    comRelogioEAcaso(1_000_000_000_000, 111, () => jornada(seed)),
    comRelogioEAcaso(1_700_000_000_000, 98_765, () => jornada(seed)),
    jornada(seed), // relógio e acaso reais
  ];
  const json = execucoes.map((e) => JSON.stringify(e.dados));
  const iguais = json.every((j) => j === json[0]);
  const idsUnicos = execucoes.every((e) => e.idsUnicos);
  const hash = createHash('sha256').update(json[0]).digest('hex').slice(0, 12);
  assinaturas.push(hash);
  const ok = iguais && idsUnicos;
  if (!ok) falhas++;
  console.log(`${ok ? 'ok  ' : 'FALHA'} semente ${seed}: 3 execuções ${iguais ? 'iguais' : 'DIFERENTES'} (relógio/acaso trocados e reais) · ids ${idsUnicos ? 'únicos' : 'REPETIDOS'} · hash ${hash}`);
}
const distintas = new Set(assinaturas).size === SEMENTES.length;
if (!distintas) falhas++;
console.log(`${distintas ? 'ok  ' : 'FALHA'} sementes diferentes dão jornadas diferentes`);

if (falhas) {
  console.log(`\ndeterminismo: ${falhas} falha(s)`);
  process.exitCode = 1;
} else {
  console.log('\ndeterminismo: tudo certo');
}
