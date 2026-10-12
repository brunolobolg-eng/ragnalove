// Otimiza um GLB de personagem/monstro para o jogo (regra: GLB novo passa por esta checagem/otimização).
// 1) 4 ossos por vértice: junta JOINTS/WEIGHTS_0–2, guarda os 4 pesos maiores e renormaliza (sem isso a pele
//    encolhe nas juntas quando o osso se mexe, e a animação perde fluidez);
// 2) animação embutida sai (o moveset vem dos clipes do jogo, como no cultista);
// 3) malha simplificada (mantém ossos, UVs e silhueta);
// 4) textura em WebP de até 1024 px (regra de personagens do projeto);
// 5) limpeza (deduplicação e remoção de itens sem uso).
// 0) lê GLB comprimido (meshopt), põe posições e normais em float32 e, se pedido, gira em Y para a frente ir a +Z.
// Uso: node otimizar_glb.mjs <entrada.glb> <saída.glb> <razão 0..1> <erro> [giro Y em graus]
//   giro: o auto-rig e o jogo assumem o personagem olhando para +Z (esquerda em +X). Modelo que olha para +X: -90.
// Dependências (NÃO estão no package.json do jogo): instale numa pasta à parte e rode o script de lá:
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer sharp
// Exemplo que gerou a bruxinha (63 MB → 2,4 MB, 39 mil triângulos): razão 0.08, erro 0.02.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplify, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst, ratioArg, errorArg, giroArg] = process.argv.slice(2);
const ratio = Number(ratioArg ?? 0.1);
const error = Number(errorArg ?? 0.01);
const giro = Number(giroArg ?? 0);
// lê também GLB com compressão meshopt (EXT_meshopt_compression, saída do gltfpack, ex.: o original do Bárbaro);
// sem o decodificador a leitura falha com "Please install extension dependency, meshopt.decoder"
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
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
  // caixa da malha (X, Y, Z): confere o tamanho e a orientação (frente em +Z)
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const a = p.getAttribute('POSITION')?.getArray();
    if (!a) continue;
    for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], a[i + k]);
      max[k] = Math.max(max[k], a[i + k]);
    }
  }
  console.log(`[${label}] caixa X ${min[0].toFixed(3)}..${max[0].toFixed(3)}, Y ${min[1].toFixed(3)}..${max[1].toFixed(3)}, Z ${min[2].toFixed(3)}..${max[2].toFixed(3)}`);
};

// atributo quantizado (byte/int16 normalizado) → float32; já float não muda
const DIVISOR = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
function paraFloat(acc) {
  if (acc.getComponentType() === 5126) return;
  const div = acc.getNormalized() ? DIVISOR[acc.getComponentType()] ?? 1 : 1;
  const src = acc.getArray();
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] / div;
  acc.setArray(out);
  acc.setNormalized(false);
}

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
// a entrada decodificada não deve ser recomprimida: a saída é GLB sem meshopt (o carregador do jogo não tem o decodificador)
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
await report('entrada', doc);
// 0) atributos quantizados viram float32 (o auto-rig recalcula normais e lê posições como números)
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  for (const semantic of ['POSITION', 'NORMAL', 'TEXCOORD_0']) {
    const acc = prim.getAttribute(semantic);
    if (acc) paraFloat(acc);
  }
}
// giro em Y (graus): cada acessor é girado uma única vez, mesmo se for compartilhado
if (giro) {
  const t = (giro * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const girados = new Set();
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) for (const semantic of ['POSITION', 'NORMAL']) {
    const acc = prim.getAttribute(semantic);
    if (!acc || girados.has(acc)) continue;
    girados.add(acc);
    const a = acc.getArray();
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i];
      const z = a[i + 2];
      a[i] = x * c + z * s;
      a[i + 2] = -x * s + z * c;
    }
    if (semantic === 'NORMAL') {
      for (let i = 0; i < a.length; i += 3) {
        const l = Math.hypot(a[i], a[i + 1], a[i + 2]) || 1;
        a[i] /= l;
        a[i + 1] /= l;
        a[i + 2] /= l;
      }
    }
  }
  console.log(`giro em Y: ${giro}°`);
}

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
