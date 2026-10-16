/**
 * Checagem única do projeto: roda o build e todas as checagens, e mostra um resumo.
 *
 *   npm run check                  build + todas as checagens
 *   npm run check:rapido           só as checagens (pula o build)
 *   npm run check -- --so=<nome>   só uma etapa (ex.: --so=sim:check, --so=build)
 *
 * Descoberta: todo script do package.json cujo nome contém "check", mais "bastion:path".
 * Scripts que existem mas não entram no comando ficam em FORA_DO_COMANDO, com o motivo,
 * e aparecem no fim da saída. Este arquivo não grava nada; o build grava dist/, como sempre.
 */
/// <reference types="node" />
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPO_LIMITE_MS = 900_000; // 900 s por etapa
const LINHAS_DE_FALHA = 30; // quantas linhas finais da saída mostrar para cada falha

/** Scripts que existem no package.json, mas ficam fora do comando. */
const FORA_DO_COMANDO: Record<string, string> = {
  'ui:fora-da-tela':
    'precisa de servidor de dev aberto (npx vite --port 5561) e de Chromium/Playwright; roda à parte (ver o cabeçalho de scripts/telasForaDaTela.mjs)',
};

interface Pacote {
  scripts?: Record<string, string>;
}

const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as Pacote;
const scripts: Record<string, string> = pacote.scripts ?? {};

/** Checagem = nome com "check" ou "bastion:path". Exclui os atalhos que chamam este arquivo. */
function ehChecagem(nome: string): boolean {
  if (scripts[nome].includes('checkAll')) return false;
  return nome.includes('check') || nome === 'bastion:path';
}

const checagens = Object.keys(scripts).filter(ehChecagem).sort();
const etapasPossiveis = scripts.build ? ['build', ...checagens] : checagens;

interface Resultado {
  nome: string;
  ok: boolean;
  tempoS: number;
  codigo: string;
  ultimaLinha: string;
  linhas: string[];
}

const CORES_ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function rodar(nome: string): Resultado {
  const inicio = Date.now();
  const r = spawnSync(`npm run ${nome} 2>&1`, {
    cwd: RAIZ,
    shell: true,
    encoding: 'utf8',
    timeout: TEMPO_LIMITE_MS,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const tempoS = (Date.now() - inicio) / 1000;
  const linhas = (r.stdout || '')
    .replace(CORES_ANSI, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  const estourou = !!r.error && (r.error as { code?: string }).code === 'ETIMEDOUT';
  const codigo = estourou ? 'tempo' : r.status !== null ? String(r.status) : (r.signal ?? 'erro');
  const ok = r.status === 0 && !r.error;
  return {
    nome,
    ok,
    tempoS,
    codigo,
    ultimaLinha: linhas[linhas.length - 1] ?? '(sem saída)',
    linhas,
  };
}

function main(): number {
  const args = process.argv.slice(2);
  const rapido = args.includes('--rapido');
  const soArg = args.find((a) => a.startsWith('--so='));
  const so = soArg === undefined ? undefined : soArg.slice('--so='.length);
  const desconhecidos = args.filter((a) => a !== '--rapido' && !a.startsWith('--so='));

  if (desconhecidos.length > 0) {
    console.error(`Opção desconhecida: ${desconhecidos.join(' ')}`);
    console.error('Opções: --rapido (pula o build), --so=<nome> (roda só uma etapa)');
    return 1;
  }
  if (so !== undefined && !etapasPossiveis.includes(so)) {
    console.error(`Etapa "${so}" não existe. Etapas: ${etapasPossiveis.join(', ')}`);
    return 1;
  }

  const etapas = so !== undefined ? [so] : rapido ? checagens : etapasPossiveis;

  console.log(`Checagens do Vanguarda: ${etapas.length} etapa(s)`);
  const resultados: Resultado[] = [];
  for (const nome of etapas) {
    console.log(`rodando ${nome}...`);
    resultados.push(rodar(nome));
  }

  const nomeW = Math.max(5, ...resultados.map((r) => r.nome.length));
  const codW = Math.max(6, ...resultados.map((r) => r.codigo.length));
  console.log('');
  console.log(
    `${'Etapa'.padEnd(nomeW)}  ${'Estado'.padEnd(6)}  ${'Tempo'.padStart(9)}  ${'Código'.padEnd(codW)}  Última linha`,
  );
  for (const r of resultados) {
    console.log(
      `${r.nome.padEnd(nomeW)}  ${(r.ok ? 'ok' : 'FALHA').padEnd(6)}  ${(r.tempoS.toFixed(1) + ' s').padStart(9)}  ${r.codigo.padEnd(codW)}  ${r.ultimaLinha}`,
    );
  }

  const falhas = resultados.filter((r) => !r.ok);
  for (const r of falhas) {
    console.log(`\n--- saída de ${r.nome} (últimas ${LINHAS_DE_FALHA} linhas) ---`);
    for (const l of r.linhas.slice(-LINHAS_DE_FALHA)) console.log(l);
  }

  const foraPresentes = Object.keys(FORA_DO_COMANDO).filter((n) => n in scripts);
  if (foraPresentes.length > 0) {
    console.log('\nFora do comando (existem no package.json e não rodam aqui):');
    for (const n of foraPresentes) console.log(`  ${n}: ${FORA_DO_COMANDO[n]}`);
  }

  console.log(`\n${resultados.length - falhas.length} ok, ${falhas.length} falhas`);
  return falhas.length > 0 ? 1 : 0;
}

process.exitCode = main();
