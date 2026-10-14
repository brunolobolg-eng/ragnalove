// @ts-nocheck - script Node (lê arquivos com fs; o typecheck do jogo não tem os tipos de Node), rodado com tsx
/**
 * Guarda de regressão do cenário da campanha. Rode: npm run cenario:check
 *
 * Conta as primitivas sólidas do three.js (caixa, cilindro, esfera, cone, poliedro...) nos arquivos de cenário
 * da campanha e falha se alguma voltar. Essas são as peças de cor lisa que o dono não quer no mapa.
 * Fora da contagem: planos e círculos (chão, água, decalques, brilhos, bandeiras de textura), peças GLB do dono
 * (public/models/props) e as peças naturais com textura do dono (naturKit.ts, que não é um arquivo desta lista).
 * ActDressing.ts fica de fora: é do agente dos acampamentos dos monstros.
 *
 * A LINHA_DE_BASE lista o que ainda falta trocar por arte do dono. Ela só pode cair: cada peça trocada
 * abaixa o número; qualquer primitiva a mais que a base falha o check.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'src/render/scenery');

/** Arquivos de cenário da campanha (ActDressing.ts fica de fora de propósito). */
const ARQUIVOS = [
  'BiomeScenery.ts',
  'BridgeScenery.ts',
  'CityGate.ts',
  'Emperium.ts',
  'fortress.ts',
  'muralhaGlb.ts',
  'props.ts',
  'Scenery.ts',
  'PaintedScenery.ts',
  'desertGround.ts',
  'forestGround.ts',
  'iceGround.ts',
  'lavaGround.ts',
  'groundLayers.ts',
  'sceneryTextures.ts',
  'bridgeTextures.ts',
  'biomeKits.ts',
];

/** Geometria sólida de primitiva do three.js: a que vira "peça de cor lisa" no cenário. */
const PRIMITIVA = /new\s+THREE\.(Box|Cylinder|Sphere|Cone|Dodecahedron|Icosahedron|Octahedron|Tetrahedron|Torus|TorusKnot|Tube|Extrude|Lathe|Capsule)Geometry\b/;

/**
 * Pendências conhecidas (primitivas que ainda existem). Quando uma peça for trocada por arte do dono,
 * diminua o número aqui; quando o arquivo ficar limpo, tire a entrada.
 */
const LINHA_DE_BASE: Record<string, number> = {
  // Tema 'town' (Scenery.ts): nenhuma fase da campanha usa; pendente.
  'Scenery.ts': 19,
};

let falhas = 0;
const linhasComPrimitiva: string[] = [];
for (const nome of ARQUIVOS) {
  const linhas = readFileSync(join(PASTA, nome), 'utf8').split('\n');
  let n = 0;
  linhas.forEach((linha, i) => {
    // comentários não contam: só o código que cria a geometria
    const codigo = linha.replace(/\/\/.*$/, '');
    if (PRIMITIVA.test(codigo)) {
      n++;
      linhasComPrimitiva.push(`${nome}:${i + 1}: ${linha.trim()}`);
    }
  });
  const base = LINHA_DE_BASE[nome] ?? 0;
  const ok = n <= base;
  if (!ok) falhas++;
  const nota = n < base ? ` (a linha de base pode cair para ${n})` : '';
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}: ${n} primitiva(s) sólida(s), base ${base}${nota}`);
}

if (falhas) {
  console.log('\nPrimitivas encontradas (cenário da campanha deve usar arte do dono):');
  for (const l of linhasComPrimitiva) console.log(`  ${l}`);
  console.log(`\n${falhas} arquivo(s) com primitiva acima da linha de base.`);
  throw new Error(`cenarioCheck: ${falhas} arquivo(s) com primitiva acima da linha de base`);
}
console.log('\nCenário da campanha: nenhuma primitiva nova além da linha de base.');
