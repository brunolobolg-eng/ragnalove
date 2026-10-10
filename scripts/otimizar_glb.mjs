// Otimiza um GLB de personagem/monstro para o jogo (regra: GLB novo passa por esta checagem/otimização).
// 1) 4 ossos por vértice: junta JOINTS/WEIGHTS_0–2, guarda os 4 pesos maiores e renormaliza (sem isso a pele
//    encolhe nas juntas quando o osso se mexe, e a animação perde fluidez);
// 2) animação embutida sai (o moveset vem dos clipes do jogo, como no cultista);
// 3) malha simplificada (mantém ossos, UVs e silhueta);
// 4) textura em WebP de até 1024 px (regra de personagens do projeto);
// 5) limpeza (deduplicação e remoção de itens sem uso).
// Uso: node otimizar_glb.mjs <entrada.glb> <saída.glb> <razão 0..1> <erro>
// Dependências (NÃO estão no package.json do jogo): instale numa pasta à parte e rode o script de lá:
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
// Exemplo que gerou a bruxinha (63 MB → 2,4 MB, 39 mil triângulos): razão 0.08, erro 0.02.
import { Accessor, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst, ratioArg, errorArg] = process.argv.slice(2);
const ratio = Number(ratioArg ?? 0.1);
const error = Number(errorArg ?? 0.01);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const NORM_DIV = { 5121: 255, 5123: 65535 };
const ARRAY_OF = { 5121: Uint8Array, 5123: Uint16Array, 5126: Float32Array };

const report = async (label, doc) => {
  const root = doc.getRoot();
  let verts = 0;
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION');
    verts += pos ? pos.getCount() : 0;
    tris += p.getIndices() ? p.getIndices().getCount() / 3 : pos.getCount() / 3;
  }
  const tex = [];
  for (const t of root.listTextures()) {
    const meta = await sharp(Buffer.from(t.getImage())).metadata();
    tex.push(`${meta.width}x${meta.height} ${meta.format} ${(t.getImage().byteLength / 1024).toFixed(0)} KB`);
  }
  const influences = root.listMeshes().some((m) => m.listPrimitives().some((p) => p.getAttribute('JOINTS_1'))) ? 'mais de 4 (ainda)' : '4 ou menos';
  console.log(`[${label}] vértices ${verts}, triângulos ${Math.round(tris)}, animações ${root.listAnimations().length}, texturas: ${tex.join(' | ') || '-'}, influências: ${influences}`);
};

// mantém só os 4 pesos maiores de cada vértice (entre os conjuntos 0, 1 e 2) e renormaliza para somar 1
function keepFourInfluences(prim) {
  const jAttr = prim.getAttribute('JOINTS_0');
  const wAttr = prim.getAttribute('WEIGHTS_0');
  if (!jAttr || !wAttr) return 0;
  const sets = [];
  for (let k = 0; k < 3; k++) {
    const j = prim.getAttribute(`JOINTS_${k}`);
    const w = prim.getAttribute(`WEIGHTS_${k}`);
    if (j && w) sets.push({ j: j.getArray(), w: w.getArray(), div: w.getNormalized() ? NORM_DIV[w.getComponentType()] ?? 1 : 1 });
  }
  const n = jAttr.getCount();
  // o tipo numérico do arquivo é mantido (o gltf-transform grava o tipo do próprio array)
  const jCtor = ARRAY_OF[jAttr.getComponentType()] ?? Uint16Array;
  const wCtor = ARRAY_OF[wAttr.getComponentType()] ?? Float32Array;
  const wDiv = wAttr.getNormalized() ? NORM_DIV[wAttr.getComponentType()] ?? 1 : 1;
  const J = new jCtor(n * 4);
  const W = new wCtor(n * 4);
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const cand = [];
    for (const s of sets) for (let c = 0; c < 4; c++) {
      const wt = s.w[i * 4 + c] / s.div;
      if (wt > 0) cand.push([s.j[i * 4 + c], wt]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    if (cand.length > 4) dropped += cand.slice(4).reduce((acc, e) => acc + e[1], 0);
    const top = cand.slice(0, 4);
    const sum = top.reduce((acc, e) => acc + e[1], 0);
    if (!top.length) { W[i * 4] = wDiv; continue; }
    // pesos inteiros normalizados (ex.: u16/255) são gravados como inteiros
    top.forEach((e, c) => { J[i * 4 + c] = e[0]; W[i * 4 + c] = wDiv > 1 ? Math.round((e[1] / sum) * wDiv) : e[1] / sum; });
  }
  jAttr.setArray(J);
  wAttr.setArray(W);
  for (const semantic of ['JOINTS_1', 'JOINTS_2', 'WEIGHTS_1', 'WEIGHTS_2']) prim.setAttribute(semantic, null);
  return dropped / Math.max(1, n);
}

const doc = await io.read(src);
await report('entrada', doc);

// 1) influências: 4 por vértice, renormalizadas
let lost = 0;
let count = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  lost += keepFourInfluences(prim);
  count++;
}
console.log(`influências: peso médio descartado ${(count ? (lost / count) * 100 : 0).toFixed(2)}% por primitiva (renormalizado)`);
// 2) animação embutida fora
for (const anim of doc.getRoot().listAnimations()) anim.dispose();
// 3) malha simplificada
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error }));
// (os pés em y = 0 saem do bind 'ibm' no carregador; os nós do arquivo não são mexidos)
// 4) textura 1024 px em WebP
await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 90 }));
// 5) limpeza
await doc.transform(dedup(), prune());

await report('saída', doc);
await io.write(dst, doc);
console.log('gravado:', dst);
