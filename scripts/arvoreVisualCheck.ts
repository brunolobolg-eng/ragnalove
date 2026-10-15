/**
 * Checagem visual da roda da Árvore de Aurenthal (geometria e caminho aceso). Rode: npm run arvore:visual:check
 * (a) Roda: todos os nós têm posição; nenhum nó cobre outro nó nem um medalhão; cada nó cabe dentro do aro.
 * (b) Setores: cada família fica na sua cunha (cor e ângulo da 15.webp); nós sem setor são o núcleo e as ligações.
 * (c) Rótulos: nomes que aparecem sem o cursor não cobrem nó nem medalhão nem outro nome; a contagem no zoom padrão é impressa.
 * (d) Caminho aceso: o caminho até um nó fechado é ligado, sem nó aberto no meio, e o custo é a soma dos nós.
 * (e) Tamanhos e limiares de zoom do desenho (34, 44, 46, 30 e 64 px; nomes a partir de 0,75 e 1,2).
 */
import { CONEXOES, FAMILIAS, MASTERY_BY_ID, NOS, NO_BY_ID, type FamiliaId } from '../src/config/arvoreGlobal';
import { ARVORE_VISUAL, FAMILIA_VISUAL, TAMANHO_NO } from '../src/config/arvoreVisual';
import { caminhoAte, geometriaDaRoda, montarArvoreVM, type ArvoreVM } from '../src/ui/arvoreVM';

let falhas = 0;
const ok = (cond: boolean, texto: string) => {
  if (cond) console.log(`  ok: ${texto}`);
  else {
    falhas++;
    console.log(`  FALHOU: ${texto}`);
  }
};
const sobrepoe = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Distância de um ponto a uma caixa (0 se o ponto está dentro). */
const distCaixa = (px: number, py: number, b: { x0: number; y0: number; x1: number; y1: number }) => {
  const nx = Math.max(b.x0, Math.min(px, b.x1));
  const ny = Math.max(b.y0, Math.min(py, b.y1));
  return Math.hypot(px - nx, py - ny);
};

// ---------------- (e) tamanhos e limiares: vêm do desenho pedido ----------------
console.log('(e) tamanhos e zoom');
ok(TAMANHO_NO.comum === 34 && TAMANHO_NO.notavel === 44 && TAMANHO_NO.mastery === 46 && TAMANHO_NO.caminho === 30 && TAMANHO_NO.raiz === 64, 'tamanhos no zoom 1: comum 34, notável 44, Mastery 46, caminho 30, núcleo 64 px');
ok(ARVORE_VISUAL.zoom.rotulosDestaque === 0.75 && ARVORE_VISUAL.zoom.rotulosTodos === 1.2, 'nomes: notáveis e Masteries a partir de 0,75; todos a partir de 1,2');
ok(ARVORE_VISUAL.rotulo.fonte >= 13, 'fonte dos nomes com pelo menos 13 px');

// ---------------- (a) roda: nós, medalhões e aro ----------------
console.log('(a) roda');
const g = geometriaDaRoda();
ok(g.nos.length === NOS.length, `todos os ${NOS.length} nós têm posição na roda`);
let nosSobrepostos = 0;
for (let i = 0; i < g.nos.length; i++) {
  for (let j = i + 1; j < g.nos.length; j++) {
    const a = g.nos[i], b = g.nos[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) nosSobrepostos++;
  }
}
ok(nosSobrepostos === 0, `nenhum nó cobre outro nó (${nosSobrepostos} pares)`);
let noNoMedalhao = 0;
for (const n of g.nos) for (const e of g.emblemas) if (Math.hypot(n.x - e.x, n.y - e.y) < n.r + e.r) noNoMedalhao++;
ok(noNoMedalhao === 0, 'nenhum nó cobre um medalhão de setor');
const foraDoAro = g.nos.filter((n) => Math.hypot(n.x, n.y) + n.r > g.aroRaio).length;
ok(foraDoAro === 0, `todos os nós cabem dentro do aro (raio ${g.aroRaio} px)`);

// ---------------- (b) setores: família na sua cunha ----------------
console.log('(b) setores');
const vm: ArvoreVM = montarArvoreVM({ zeni: 0, heroes: {}, arvore: undefined } as never, {}, {});
const porId = new Map(vm.nos.map((n) => [n.id, n]));
let foraDaCunha = 0;
let semSetor: string[] = [];
for (const n of vm.nos) {
  if (n.raiz) continue;
  if (!n.familia) {
    semSetor.push(n.id);
    continue;
  }
  const ang = (Math.atan2(n.y, n.x) * 180) / Math.PI;
  let rel = ang - FAMILIA_VISUAL[n.familia].grau;
  while (rel > 180) rel -= 360;
  while (rel < -180) rel += 360;
  if (Math.abs(rel) > 46.5) foraDaCunha++;
}
ok(foraDaCunha === 0, `cada nó de família fica na sua cunha (±46°): ${foraDaCunha} fora`);
const naoSoltos = semSetor.filter((id) => NO_BY_ID[id].tipo !== 'raiz' && NO_BY_ID[id].regiao !== 'nucleo' && NO_BY_ID[id].regiao !== 'fronteira');
ok(naoSoltos.length === 0, `sem setor só o núcleo e as regiões centrais/ligações (${semSetor.length} nós soltos)`);
for (const f of FAMILIAS) {
  const n = vm.familias.find((x) => x.id === f.id)?.total ?? 0;
  console.log(`    ${f.id}: ${n} nós (cor ${FAMILIA_VISUAL[f.id as FamiliaId].cor}, ${FAMILIA_VISUAL[f.id as FamiliaId].grau}°)`);
}
ok(FAMILIAS.every((f) => MASTERY_BY_ID && Object.values(MASTERY_BY_ID).some((m) => m.familia === f.id)), 'cada família tem Masteries (sua cor e seu setor)');

// ---------------- (c) rótulos ----------------
console.log('(c) rótulos');
const rotulosLivres = g.rotulos.filter((r) => vm.nos.find((n) => n.id === r.id)?.rotulo?.livre);
let livreSobreNo = 0;
for (const r of rotulosLivres) {
  const id = r.id;
  for (const n of g.nos) {
    if (n.id === id) continue;
    if (distCaixa(n.x, n.y, r) < n.r) livreSobreNo++;
  }
  for (const e of g.emblemas) if (distCaixa(e.x, e.y, r) < e.r) livreSobreNo++;
}
ok(livreSobreNo === 0, `nomes que aparecem sem o cursor não cobrem nó nem medalhão (${livreSobreNo} choques)`);
let livreSobreLivre = 0;
for (let i = 0; i < rotulosLivres.length; i++) for (let j = i + 1; j < rotulosLivres.length; j++) if (sobrepoe(rotulosLivres[i], rotulosLivres[j])) livreSobreLivre++;
ok(livreSobreLivre === 0, `nomes que aparecem sem o cursor não se cobrem (${livreSobreLivre} pares)`);
const contaTipo = (t: string) => vm.nos.filter((n) => n.tipo === t);
const livresNoPadrao = (t: string) => contaTipo(t).filter((n) => n.rotulo?.livre).length;
console.log(`    nomes no zoom padrão: notáveis ${livresNoPadrao('notavel')} de ${contaTipo('notavel').length}, Masteries ${livresNoPadrao('mastery')} de ${contaTipo('mastery').length} (os demais aparecem com o cursor)`);
ok(livresNoPadrao('notavel') + livresNoPadrao('mastery') >= 45, 'pelo menos 45 nomes de notáveis e Masteries aparecem no zoom padrão');
ok(vm.roda.raioMax <= ARVORE_VISUAL.aroRaio, `a roda não passa do aro (raio máximo ${vm.roda.raioMax.toFixed(0)} px)`);

// ---------------- (d) caminho aceso ----------------
console.log('(d) caminho aceso');
const fechados = vm.nos.filter((n) => n.estado !== 'aberto');
let verificados = 0;
let caminhoOk = true;
for (const n of fechados.slice(0, 40)) {
  const c = caminhoAte(vm, n.id);
  if (c.ids.length === 0) continue;
  verificados++;
  // o primeiro nó do caminho liga a um nó aberto; cada nó seguinte liga ao anterior; nenhum deles está aberto
  const primeiro = c.ids[0];
  const abreAntes = (vm.adjacencia[primeiro] ?? []).some((v) => porId.get(v)?.estado === 'aberto');
  if (!abreAntes) caminhoOk = false;
  for (let i = 1; i < c.ids.length; i++) if (!(vm.adjacencia[c.ids[i - 1]] ?? []).includes(c.ids[i])) caminhoOk = false;
  if (c.ids.some((id) => porId.get(id)?.estado === 'aberto')) caminhoOk = false;
  if (c.ids[c.ids.length - 1] !== n.id) caminhoOk = false;
  const zen = c.ids.reduce((s, id) => s + (porId.get(id)?.custo ?? 0), 0);
  if (zen !== c.zen || c.nos !== c.ids.length) caminhoOk = false;
}
ok(verificados > 0 && caminhoOk, `caminhos até nós fechados estão ligados, sem nó aberto no meio e com o custo somado (${verificados} verificados)`);
const abertoSel = vm.nos.find((n) => n.estado === 'aberto' && !n.raiz);
if (abertoSel) ok(caminhoAte(vm, abertoSel.id).aberto === true, 'nó já aberto não tem caminho a acender');
const umPasso = fechados.find((n) => (vm.adjacencia[n.id] ?? []).some((v) => porId.get(v)?.estado === 'aberto'));
if (umPasso) ok(caminhoAte(vm, umPasso.id).umPasso === true, 'nó a um passo da rede aberta acende só ele');
ok(NOS.length > 0 && CONEXOES.length > 0, 'grafo carregado');

console.log(`\n${falhas === 0 ? 'visual: ok' : `visual: ${falhas} falha(s)`}`);
if (falhas) throw new Error(`arvoreVisualCheck: ${falhas} falha(s)`);
