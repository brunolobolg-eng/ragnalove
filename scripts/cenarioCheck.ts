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
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ACT_DRESSING, type ActPeca } from '../src/config/visualConfig';

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

// ---------- Texturas do cenário sem canvas: a imagem vem de public/textures/cenario (scripts/gerarTexturasCenario.py) ----------
// Todo arquivo da pasta de cenário (menos ActDressing.ts, que é de outro agente) e o BoardView.ts não podem criar
// textura em canvas nem desenhar em canvas: canvas feito na hora fica borrado de perto.
const CANVAS_PROIBIDO: [string, RegExp][] = [
  ['new THREE.CanvasTexture', /new\s+THREE\.CanvasTexture\b/],
  ["createElement('canvas')", /createElement\(\s*['"]canvas['"]\s*\)/],
  ["getContext('2d')", /getContext\(\s*['"]2d['"]\s*\)/],
];
const ARQUIVOS_SEM_CANVAS = [
  ...readdirSync(PASTA).filter((f) => f.endsWith('.ts') && f !== 'ActDressing.ts').map((f) => join(PASTA, f)),
  join(RAIZ, 'src/render/BoardView.ts'),
];
let falhasCanvas = 0;
for (const arquivo of ARQUIVOS_SEM_CANVAS) {
  const codigo = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const [nome, re] of CANVAS_PROIBIDO) {
    if (re.test(codigo)) {
      falhasCanvas++;
      console.log(`FALHOU ${arquivo.replace(RAIZ + '/', '')}: ${nome} (textura do cenário deve ser imagem gerada)`);
    }
  }
}
console.log(falhasCanvas ? `\n${falhasCanvas} uso(s) de canvas no cenário.` : `\nCenário sem canvas: ${ARQUIVOS_SEM_CANVAS.length} arquivo(s) conferidos.`);
if (falhasCanvas) throw new Error(`cenarioCheck: ${falhasCanvas} uso(s) de canvas no cenário`);

// ---------- Acampamentos dos monstros (ActDressing.ts): sem primitiva, peças do dono existentes ----------
const root = RAIZ;
let falhasAcampamentos = 0;
const checkAcampamentos = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) falhasAcampamentos++;
};

// 1) código do cenário: nada de geometria primitiva, cor por vértice ou canvas
const src = readFileSync(join(root, 'src/render/scenery/ActDressing.ts'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // ignora comentários
const proibidos: [string, RegExp][] = [
  ['colored(...)', /\bcolored\s*\(/],
  ['geometria primitiva do three.js', /\b(Box|Cylinder|Cone|Sphere|Circle|Torus|Dodecahedron|Plane|Icosahedron|Octahedron|Tetrahedron|Ring|Lathe|Extrude|Tube|Polyhedron|Shape)Geometry\b/],
  ['merge de geometrias próprias', /\bmergeGeometries\b/],
  ['cor por vértice', /\bvertexColors\b/],
  ['textura pintada por código', /\bCanvasTexture\b|createElement\(\s*['"]canvas['"]\s*\)/],
];
for (const [nome, re] of proibidos) checkAcampamentos(`ActDressing.ts sem ${nome}`, !re.test(codigo));
checkAcampamentos('ActDressing.ts usa as peças GLB do dono (instanceProps)', /\binstanceProps\s*\(/.test(codigo));

// 2) cada peça é um GLB existente, com escala positiva
for (const [id, peca] of Object.entries(ACT_DRESSING.pecas)) {
  const arquivo = join(root, 'public/models/props', `${peca.path}.glb`);
  checkAcampamentos(`peça ${id} → ${peca.path}.glb existe`, existsSync(arquivo));
  checkAcampamentos(`peça ${id} tem escala positiva`, peca.escala > 0, String(peca.escala));
}

// 3) kit dos três atos: peças cadastradas e kit completo
for (const ato of [0, 1, 2]) {
  const kit = ACT_DRESSING.atos[ato];
  checkAcampamentos(`ato ${ato + 1} tem kit de peças baixas e altas`, !!kit && kit.baixas.length > 0 && kit.altas.length > 0);
  if (!kit) continue;
  const usadas: ActPeca[] = [...kit.baixas, ...kit.altas];
  const desconhecidas = usadas.filter((p) => !(p in ACT_DRESSING.pecas));
  checkAcampamentos(`ato ${ato + 1} só usa peças cadastradas`, desconhecidas.length === 0, desconhecidas.join(', ') || `${usadas.length} peças`);
}

console.log(falhasAcampamentos ? `\n${falhasAcampamentos} checagem(ns) dos acampamentos falharam.` : '\nTodas as checagens dos acampamentos dos monstros passaram.');
if (falhasAcampamentos) throw new Error(`cenarioCheck: ${falhasAcampamentos} falha(s) nos acampamentos`);
