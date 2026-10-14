// @ts-nocheck - lê arquivos do projeto com módulos do Node (mesmo padrão de gateFunnel.ts e testCultistRig.ts)
/**
 * Checagem do cenário dos acampamentos dos monstros (sem renderização). Rode: npm run cenario:check
 * 1) Nenhuma peça primitiva colorida no ActDressing.ts (sem colored(...), sem geometria de três.js, sem canvas)
 * 2) Cada peça do kit é um GLB do dono que existe em public/models/props
 * 3) Os três atos têm kit (baixas e altas) e só usam peças cadastradas
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ACT_DRESSING, type ActPeca } from '../src/config/visualConfig';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHOU'} ${label}${extra ? ` · ${extra}` : ''}`);
  if (!cond) failures++;
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
for (const [nome, re] of proibidos) check(`ActDressing.ts sem ${nome}`, !re.test(codigo));
check('ActDressing.ts usa as peças GLB do dono (instanceProps)', /\binstanceProps\s*\(/.test(codigo));

// 2) cada peça é um GLB existente, com escala positiva
for (const [id, peca] of Object.entries(ACT_DRESSING.pecas)) {
  const arquivo = join(root, 'public/models/props', `${peca.path}.glb`);
  check(`peça ${id} → ${peca.path}.glb existe`, existsSync(arquivo));
  check(`peça ${id} tem escala positiva`, peca.escala > 0, String(peca.escala));
}

// 3) kit dos três atos: peças cadastradas e kit completo
for (const ato of [0, 1, 2]) {
  const kit = ACT_DRESSING.atos[ato];
  check(`ato ${ato + 1} tem kit de peças baixas e altas`, !!kit && kit.baixas.length > 0 && kit.altas.length > 0);
  if (!kit) continue;
  const usadas: ActPeca[] = [...kit.baixas, ...kit.altas];
  const desconhecidas = usadas.filter((p) => !(p in ACT_DRESSING.pecas));
  check(`ato ${ato + 1} só usa peças cadastradas`, desconhecidas.length === 0, desconhecidas.join(', ') || `${usadas.length} peças`);
}

console.log(failures ? `\n${failures} checagem(ns) falharam.` : '\nTodas as checagens do cenário dos acampamentos passaram.');
if (failures) throw new Error(`cenarioCheck: ${failures} falha(s)`);
