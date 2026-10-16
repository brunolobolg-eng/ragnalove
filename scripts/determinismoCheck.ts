// @ts-nocheck - script Node (usa fs, path, crypto e url; o typecheck do jogo não tem os tipos de Node), rodado com tsx
/**
 * Determinismo do núcleo (regra 3 do CLAUDE.md): dentro de src/core só há sorteio com semente.
 * 1) Varredura estática (AST) de src/core: relógio, acaso, globais do host e imports de módulos do sistema.
 *    Comentários e textos não contam. Só vê o que está escrito no arquivo.
 * 2) Guarda em tempo de execução: durante a jornada e a batalha de teste, Math.random, Date.now, performance.now,
 *    new Date() sem argumento e crypto lançam erro. Os módulos do núcleo são importados depois de instalar a guarda,
 *    então um alias (const r = Math.random) também cai nela. Cobre só o que essas execuções percorrem.
 * 3) Reprodutibilidade: para 3 sementes, a jornada e a batalha rodam 3 vezes no mesmo processo e dão o mesmo
 *    resultado (pega estado de módulo que vaza entre execuções). Sementes diferentes dão resultados diferentes.
 *
 * O que NÃO é provado: caminhos que a jornada e a batalha não percorrem (cartas de combate, Arena, Bastião, sobrevivência
 * fora do teste). Para eles vale só a varredura estática.
 * Recarga de save: a jornada faz ida e volta em JSON. A checagem prova que a repetição é determinística, mas NÃO
 * prova que a sequência de sorteios continua de onde parou (decisão em aberto, ver LOG_SESSOES.md).
 *
 * Uso: npm run determinismo:check
 *      (opcional: `tsx scripts/determinismoCheck.ts <pasta>` varre outra pasta na parte estática)
 */
import ts from 'typescript';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PASTA_CORE = process.argv[2] ? resolve(process.argv[2]) : join(RAIZ, 'src', 'core');

/** Membros proibidos no núcleo: relógio e acaso fora da semente. */
const MEMBROS_PROIBIDOS = new Set(['Math.random', 'Date.now', 'performance.now', 'crypto.randomUUID', 'crypto.getRandomValues', 'process.hrtime', 'Temporal.Now']);
/** Funções globais proibidas quando chamadas direto. `Date()` sem `new` devolve a data atual. */
const CHAMADAS_PROIBIDAS = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame', 'Date']);
/** O núcleo não deve tocar no ambiente do host por nome global. */
const GLOBAIS_PROIBIDAS = new Set(['globalThis', 'window']);
/** Módulos do sistema que o núcleo não pode importar (acesso a relógio, acaso, arquivos ou processo). */
const MODULOS_PROIBIDOS = new Set(['crypto', 'node:crypto', 'fs', 'node:fs', 'perf_hooks', 'node:perf_hooks', 'timers', 'node:timers', 'process', 'node:process']);
const EXTENSOES = ['.ts', '.tsx', '.js', '.mjs', '.cjs'];

const SEMENTES = [7, 4242, 90210];
const REPETICOES = 3;

interface Achado {
  arquivo: string;
  linha: number;
  trecho: string;
}

function arquivosDoNucleo(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDoNucleo(caminho);
    return EXTENSOES.some((ext) => nome.endsWith(ext)) ? [caminho] : [];
  });
}

/** Procura usos proibidos pela AST (então comentários, strings e nomes de método não contam). */
function varrer(pasta) {
  const achados: Achado[] = [];
  const arquivos = arquivosDoNucleo(pasta);
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
      } else if ((ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) && no.moduleSpecifier && MODULOS_PROIBIDOS.has(no.moduleSpecifier.text)) {
        registra(no, 'import de módulo do sistema');
      } else if (ts.isCallExpression(no) && no.expression.kind === ts.SyntaxKind.ImportKeyword && no.arguments.length && ts.isStringLiteral(no.arguments[0]) && MODULOS_PROIBIDOS.has(no.arguments[0].text)) {
        registra(no, 'import dinâmico de módulo do sistema');
      } else if (ts.isIdentifier(no) && GLOBAIS_PROIBIDAS.has(no.text) && !(no.parent && ts.isPropertyAccessExpression(no.parent) && no.parent.name === no)) {
        registra(no, 'acesso a global do host');
      }
      ts.forEachChild(no, visita);
    };
    visita(fonte);
  }
  return { arquivos: arquivos.length, achados };
}

const hashDe = (texto) => createHash('sha256').update(texto).digest('hex').slice(0, 12);

/** Guarda: qualquer uso de relógio ou acaso lança erro. Devolve a função que restaura tudo. */
function instalarGuarda() {
  const originais = {
    random: Math.random,
    now: Date.now,
    perfNow: performance.now,
    Data: Date,
    getRandomValues: crypto.getRandomValues,
    randomUUID: crypto.randomUUID,
  };
  const proibido = (nome) => () => {
    throw new Error(`o núcleo usou ${nome} (relógio ou acaso fora da semente)`);
  };
  class DataGuarda extends originais.Data {
    constructor(...args) {
      if (args.length === 0) proibido('new Date()')();
      super(...args);
    }
    static now() {
      return proibido('Date.now()')();
    }
  }
  Math.random = proibido('Math.random()');
  performance.now = proibido('performance.now()');
  Date.now = proibido('Date.now()');
  globalThis.Date = DataGuarda;
  crypto.getRandomValues = proibido('crypto.getRandomValues()');
  crypto.randomUUID = proibido('crypto.randomUUID()');
  return () => {
    Math.random = originais.random;
    performance.now = originais.perfNow;
    Date.now = originais.now;
    globalThis.Date = originais.Data;
    crypto.getRandomValues = originais.getRandomValues;
    crypto.randomUUID = originais.randomUUID;
  };
}

async function main() {
  let falhas = 0;

  const estatica = varrer(PASTA_CORE);
  console.log(`varredura estática de ${relative(RAIZ, PASTA_CORE)}: ${estatica.arquivos} arquivos, ${estatica.achados.length} uso(s) proibido(s)`);
  for (const a of estatica.achados) console.log(`  FALHA ${a.arquivo}:${a.linha} → ${a.trecho}`);
  if (estatica.achados.length) falhas++;

  const restaurar = instalarGuarda();
  try {
    // Importa o núcleo só depois da guarda: aliases criados ao carregar o módulo também caem nela.
    const run = await import('../src/core/run/run');
    const { Simulation } = await import('../src/core/sim/Simulation');
    const { DEFAULT_SETUP } = await import('../src/config/gameConfig');
    const { applyEventEffects, bossMythicReward, buyItem, makeItem, newRun, refineItem, rerollItem, shopStock, starterGift, survivalRewards, useMapObject } = run;

    /** Uma parte da jornada, do começo a um save recarregado. Devolve o que sai dela e se os ids são únicos. */
    const jornada = (seed) => {
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
      const dados = { ganhos, mitico, loja, comprado, evento, cofre, sobrevivencia, refino, rolagem, extra, depois, zeni: salva.profile.zeni, inventario: salva.profile.inventory, lojaDepois: salva.shop };
      return { json: JSON.stringify(dados), idsUnicos: new Set(ids).size === ids.length };
    };

    /** Uma batalha inteira com a configuração padrão, com a semente dada. Devolve o desfecho e o hash dos eventos. */
    const batalha = (seed) => {
      const sim = new Simulation(DEFAULT_SETUP, seed);
      const eventos = [];
      sim.start();
      while (sim.phase === 'running' && sim.tick < 30000) for (const e of sim.step()) eventos.push(JSON.stringify(e));
      return { json: JSON.stringify({ fim: sim.phase, ticks: sim.tick, abates: sim.killed, eventos: hashDe(eventos.join('\n')), total: eventos.length }) };
    };

    console.log('guarda ativa: relógio e acaso lançam erro durante a jornada e a batalha');
    const assinaturas = [];
    for (const seed of SEMENTES) {
      let erro = null;
      const jornadas = [];
      const batalhas = [];
      let idsUnicos = true;
      try {
        for (let i = 0; i < REPETICOES; i++) {
          const j = jornada(seed);
          jornadas.push(j.json);
          idsUnicos = idsUnicos && j.idsUnicos;
          batalhas.push(batalha(seed).json);
        }
      } catch (e) {
        erro = e.message;
      }
      if (erro) {
        falhas++;
        console.log(`FALHA semente ${seed}: ${erro}`);
        continue;
      }
      const iguais = jornadas.every((j) => j === jornadas[0]) && batalhas.every((b) => b === batalhas[0]);
      const ok = iguais && idsUnicos;
      if (!ok) falhas++;
      const assinatura = hashDe(jornadas[0] + batalhas[0]);
      assinaturas.push(assinatura);
      console.log(`${ok ? 'ok  ' : 'FALHA'} semente ${seed}: jornada e batalha ${iguais ? 'iguais' : 'DIFERENTES'} em ${REPETICOES} execuções no mesmo processo · ids ${idsUnicos ? 'únicos' : 'REPETIDOS'} · hash ${assinatura}`);
    }
    const distintas = new Set(assinaturas).size === SEMENTES.length;
    if (!distintas) falhas++;
    console.log(`${distintas ? 'ok  ' : 'FALHA'} sementes diferentes dão resultados diferentes`);
  } catch (e) {
    falhas++;
    console.log(`FALHA ao carregar o núcleo com a guarda: ${e.message}`);
  } finally {
    restaurar();
  }

  if (falhas) {
    console.log(`\ndeterminismo: ${falhas} falha(s)`);
    process.exitCode = 1;
  } else {
    console.log('\ndeterminismo: tudo certo');
  }
}

main();
