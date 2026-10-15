import { ARVORE_CONFIG, BONUS_LABEL, CONEXOES, FAMILIAS, MASTERIES, MASTERY_BY_ID, NOS, NO_BY_ID, REGIOES, type BonusKey, type MasteryDef, type MasteryId, type NoDef } from '../../config/arvoreGlobal';
import { isHeroKind } from '../../config/heroes';
import { ATTR_KEYS, type Attrs } from './attributes';
import type { VocationPassiveBonus } from '../../config/vocationSkills';
import type { HeroKind } from './skills';

/**
 * Árvore global de progressão: regras puras (sem DOM, sem Three.js, sem sorteio).
 *
 * Modelo:
 * - Um só pool de pontos de árvore, derivado do progresso que já existe: `pontosPorNivel` por nível que cada
 *   herói alcança. Não há moeda nova nem estado de pontos guardado (reorganizar devolve tudo sozinho).
 * - `comprados`: nós abertos. Um nó só abre se estiver ligado a um nó já aberto (a raiz é sempre aberta).
 * - Bônus de nó: calculado na hora a partir de `comprados` (nada de efeito guardado = nada residual).
 * - Mastery: guardada por id -> herói. Um herói carrega no máximo `maxMasteriesPorHeroi`. Ela só vale se o
 *   nó que a desbloqueia continua aberto, o herói é elegível e tem o nível mínimo (senão não tem efeito).
 *
 * Toda mudança é atômica: se a checagem falha, nada muda e a mensagem (pt-BR) volta. A pré-visualização
 * (`previsao*`) não muda nada: serve para mostrar o custo antes de confirmar.
 */

/** Estado da árvore dentro do Profile (um por jornada). */
export interface ArvoreState {
  /** Nós abertos (ids). A raiz não entra aqui: é sempre aberta. */
  comprados: string[];
  /** Mastery -> personagem que a usa. Ausente = guardada. */
  masteries: Partial<Record<MasteryId, HeroKind>>;
  /** Quantas vezes a árvore foi reorganizada (o custo sobe a cada uma). */
  reorganizacoes: number;
}

/** O que as regras leem do Profile (estrutural: evita dependência circular com profile.ts). */
export interface ArvoreHost {
  zeni: number;
  heroes: Record<string, { level: number }>;
  arvore?: ArvoreState;
}

/** Contexto da ação: em luta nada da árvore muda. */
export interface ContextoArvore {
  emCombate?: boolean;
}

export const BLOQUEIO_COMBATE = 'A árvore só pode ser mexida fora da luta.';

export function arvoreVazia(): ArvoreState {
  return { comprados: [], masteries: {}, reorganizacoes: 0 };
}

/** Só leitura: sem árvore guardada, vale a árvore vazia (saves antigos). */
function estado(h: ArvoreHost): ArvoreState {
  return h.arvore ?? arvoreVazia();
}

/** Na escrita cria a árvore se faltar. */
function estadoParaEscrever(h: ArvoreHost): ArvoreState {
  h.arvore ??= arvoreVazia();
  return h.arvore;
}

// ---------------- grafo ----------------

const ADJ: Record<string, string[]> = {};
for (const [a, b] of CONEXOES) {
  (ADJ[a] ??= []).push(b);
  (ADJ[b] ??= []).push(a);
}

/** Id do nó raiz (o núcleo). */
export const RAIZ_ID: string = NOS.find((n) => n.tipo === 'raiz')?.id ?? 'nucleo';

/** Nós ligados diretamente a `id`. */
export function vizinhos(id: string): string[] {
  return ADJ[id] ?? [];
}

/** Nó aberto? A raiz sempre está. */
function possui(st: ArvoreState, id: string): boolean {
  return NO_BY_ID[id]?.tipo === 'raiz' || st.comprados.includes(id);
}

/** Pode abrir agora? Ligado a algum nó já aberto. */
export function alcancavel(h: ArvoreHost, id: string): boolean {
  const st = estado(h);
  return vizinhos(id).some((v) => possui(st, v));
}

/** Nós abertos (raiz incluída), para a tela. */
export function nosAbertos(h: ArvoreHost): Set<string> {
  const st = estado(h);
  return new Set([RAIZ_ID, ...st.comprados]);
}

// ---------------- pontos ----------------

/** Total de pontos que a conta já ganhou com o progresso (soma de níveis de todos os heróis). */
export function pontosTotais(h: ArvoreHost): number {
  let niveis = 0;
  for (const hp of Object.values(h.heroes)) niveis += Math.max(0, (hp.level ?? 1) - 1);
  return niveis * ARVORE_CONFIG.pontosPorNivel;
}

/** Pontos gastos nos nós abertos. */
export function pontosGastos(h: ArvoreHost): number {
  const st = estado(h);
  return [...new Set(st.comprados)].reduce((s, id) => s + (NO_BY_ID[id]?.custo ?? 0), 0);
}

/** Pontos livres agora (nunca mostra negativo: um save com níveis reduzidos só deixa de comprar). */
export function pontosDisponiveis(h: ArvoreHost): number {
  return Math.max(0, pontosTotais(h) - pontosGastos(h));
}

// ---------------- nós ----------------

const compativel = (no: NoDef, k: HeroKind): boolean => no.para === 'todos' || no.para.includes(k);

/** Motivo para não abrir o nó agora (ausente = pode). */
export function motivoComprarNo(h: ArvoreHost, id: string, ctx: ContextoArvore = {}): string | undefined {
  const no = NO_BY_ID[id];
  if (!no) return 'Nó desconhecido.';
  if (ctx.emCombate) return BLOQUEIO_COMBATE;
  const st = estado(h);
  if (possui(st, id)) return 'Este nó já está aberto.';
  if (!alcancavel(h, id)) return 'Abra primeiro um nó ligado a este.';
  const falta = no.custo - pontosDisponiveis(h);
  if (falta > 0) return `Faltam ${falta} ponto(s) de árvore.`;
  return undefined;
}

/** Abre um nó (gasta pontos de árvore). Devolve o erro em texto, ou undefined se deu certo. */
export function comprarNo(h: ArvoreHost, id: string, ctx: ContextoArvore = {}): string | undefined {
  const erro = motivoComprarNo(h, id, ctx);
  if (erro) return erro;
  const st = estadoParaEscrever(h);
  st.comprados = [...st.comprados, id];
  return undefined;
}

// ---------------- masteries ----------------

/** Mastery com o nó que a desbloqueia aberto (e portanto disponível para atribuir)? */
export function masteryDesbloqueada(h: ArvoreHost, masteryId: MasteryId): boolean {
  const m = MASTERY_BY_ID[masteryId];
  return !!m && possui(estado(h), m.noRequerido);
}

/** Quantas Masteries o herói carrega agora. */
function masteriesDoHeroi(st: ArvoreState, k: HeroKind): MasteryId[] {
  return (Object.keys(st.masteries) as MasteryId[]).filter((id) => st.masteries[id] === k).sort();
}

/** Custo de atribuir (ou trocar) uma Mastery. Preço fixo em Zen. */
export function custoAtribuir(): number {
  return ARVORE_CONFIG.atribuirZen;
}

/** Motivo para não atribuir a Mastery a esse herói agora (ausente = pode). */
export function motivoAtribuir(h: ArvoreHost, masteryId: MasteryId, k: HeroKind, ctx: ContextoArvore = {}): string | undefined {
  if (ctx.emCombate) return BLOQUEIO_COMBATE;
  const m = MASTERY_BY_ID[masteryId];
  if (!m) return 'Mastery desconhecida.';
  if (!isHeroKind(k) || !h.heroes[k]) return 'Herói desconhecido.';
  if (!masteryDesbloqueada(h, masteryId)) return 'Abra primeiro o ponto de Mastery dela na árvore.';
  if (!m.elegiveis.includes(k)) return 'Esta Mastery não serve a este personagem.';
  const nivel = h.heroes[k].level ?? 1;
  if (nivel < m.nivelMin) return `Chega ao nível ${m.nivelMin} para receber esta Mastery.`;
  const st = estado(h);
  if (st.masteries[masteryId] === k) return 'Esta Mastery já está com este personagem.';
  if (masteriesDoHeroi(st, k).length >= ARVORE_CONFIG.maxMasteriesPorHeroi) return 'Este personagem já carrega outra Mastery.';
  const custo = custoAtribuir();
  if (h.zeni < custo) return `Zen insuficiente: custa ${custo} Zen.`;
  return undefined;
}

/** Pré-visualização: custo e motivo (se houver), sem mexer em nada. */
export function previsaoAtribuir(h: ArvoreHost, masteryId: MasteryId, k: HeroKind, ctx: ContextoArvore = {}): { custo: number; erro?: string } {
  return { custo: custoAtribuir(), erro: motivoAtribuir(h, masteryId, k, ctx) };
}

/** Atribui a Mastery a um personagem (cobra Zen; trocar de personagem cobra de novo). */
export function atribuirMastery(h: ArvoreHost, masteryId: MasteryId, k: HeroKind, ctx: ContextoArvore = {}): string | undefined {
  const erro = motivoAtribuir(h, masteryId, k, ctx);
  if (erro) return erro;
  h.zeni -= custoAtribuir();
  const st = estadoParaEscrever(h);
  st.masteries = { ...st.masteries, [masteryId]: k };
  return undefined;
}

/** Tira a Mastery do personagem (de graça: ela volta a ficar guardada). */
export function removerMastery(h: ArvoreHost, masteryId: MasteryId, ctx: ContextoArvore = {}): string | undefined {
  if (ctx.emCombate) return BLOQUEIO_COMBATE;
  const st = estado(h);
  if (!st.masteries[masteryId]) return 'Esta Mastery já está guardada.';
  const resto: Partial<Record<MasteryId, HeroKind>> = { ...st.masteries };
  delete resto[masteryId];
  estadoParaEscrever(h).masteries = resto;
  return undefined;
}

/**
 * Mastery que vale para o herói AGORA: está com ele, o nó que a desbloqueia está aberto, ele é elegível e
 * tem o nível. Qualquer falta vira "sem efeito" (nada residual). Não depende de a herói estar na party.
 */
export function masteryDoHeroi(h: ArvoreHost, k: HeroKind): MasteryDef | undefined {
  const st = estado(h);
  for (const id of masteriesDoHeroi(st, k)) {
    const m = MASTERY_BY_ID[id];
    if (!m || !possui(st, m.noRequerido) || !m.elegiveis.includes(k)) continue;
    if ((h.heroes[k]?.level ?? 1) < m.nivelMin) continue;
    return m;
  }
  return undefined;
}

// ---------------- reorganizar ----------------

/** Custo de reorganizar a árvore inteira (sobe a cada uso). */
export function custoReorganizar(h: ArvoreHost): number {
  return ARVORE_CONFIG.reorganizarZen * (1 + estado(h).reorganizacoes);
}

/** Motivo para não reorganizar agora (ausente = pode). */
export function motivoReorganizar(h: ArvoreHost, ctx: ContextoArvore = {}): string | undefined {
  if (ctx.emCombate) return BLOQUEIO_COMBATE;
  const st = estado(h);
  if (st.comprados.length === 0 && Object.keys(st.masteries).length === 0) return 'Não há nada aberto para reorganizar.';
  const custo = custoReorganizar(h);
  if (h.zeni < custo) return `Zen insuficiente: a reorganização custa ${custo} Zen.`;
  return undefined;
}

/** Pré-visualização da reorganização (custo e motivo), sem mexer em nada. */
export function previsaoReorganizar(h: ArvoreHost, ctx: ContextoArvore = {}): { custo: number; erro?: string } {
  return { custo: custoReorganizar(h), erro: motivoReorganizar(h, ctx) };
}

/** Fecha todos os nós e devolve as Masteries para a guarda. Cobra Zen e sobe o custo da próxima vez. */
export function reorganizarArvore(h: ArvoreHost, ctx: ContextoArvore = {}): string | undefined {
  const erro = motivoReorganizar(h, ctx);
  if (erro) return erro;
  h.zeni -= custoReorganizar(h);
  const st = estadoParaEscrever(h);
  st.comprados = [];
  st.masteries = {};
  st.reorganizacoes += 1;
  return undefined;
}

// ---------------- efeitos agregados ----------------

/** Bônus que os nós abertos dão a um herói: atributos (somam como o equipamento) e passivas derivadas. */
export interface BonusArvore {
  attrs: Partial<Attrs>;
  passiva: Partial<VocationPassiveBonus>;
}

/** Soma o bônus de todos os nós abertos compatíveis com o herói. Cada nó entra uma vez (conjunto). */
export function bonusDoHeroi(h: ArvoreHost, k: HeroKind): BonusArvore {
  const out: BonusArvore = { attrs: {}, passiva: {} };
  const st = estado(h);
  for (const id of new Set(st.comprados)) {
    const no = NO_BY_ID[id];
    if (!no || no.tipo === 'raiz' || !compativel(no, k)) continue;
    for (const [key, valor] of Object.entries(no.bonus) as [BonusKey, number][]) {
      if ((ATTR_KEYS as string[]).includes(key)) {
        const a = key as keyof Attrs;
        out.attrs[a] = (out.attrs[a] ?? 0) + valor;
      } else {
        const p = key as keyof VocationPassiveBonus;
        out.passiva[p] = (out.passiva[p] ?? 0) + valor;
      }
    }
  }
  return out;
}

const PERC = (v: number) => `${String(Math.round(v * 1000) / 10).replace('.', ',')}%`;

/** Textos (pt-BR) de um bônus, para o painel de detalhes e a ficha. Redução de dano sai com sinal de menos. */
export function textoBonus(b: Partial<Record<BonusKey, number>>): string[] {
  return (Object.keys(b) as BonusKey[])
    .filter((k) => (b[k] ?? 0) !== 0)
    .map((k) => {
      const v = b[k] ?? 0;
      const L = BONUS_LABEL[k];
      if (L.formato === 'pontos') return `${v > 0 ? '+' : ''}${v} de ${L.nome}`;
      return k === 'reduce' ? `−${PERC(v)} de ${L.nome}` : `+${PERC(v)} de ${L.nome}`;
    });
}

// ---------------- validação do desenho ----------------

/** Confere o desenho (dados) da árvore. Lista vazia = válido. Usado pela checagem e pelo teste. */
export function validarArvore(): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const n of NOS) {
    if (ids.has(n.id)) erros.push(`id repetido: ${n.id}`);
    ids.add(n.id);
    if (!REGIOES[n.regiao]) erros.push(`${n.id}: região desconhecida (${n.regiao})`);
    if (!Number.isInteger(n.custo) || n.custo < 0) erros.push(`${n.id}: custo inválido (${n.custo})`);
    if (n.tipo === 'raiz' && n.custo !== 0) erros.push(`${n.id}: a raiz não tem custo`);
    if (n.tipo === 'mastery' && !n.mastery) erros.push(`${n.id}: ponto de Mastery sem Mastery`);
    if (n.tipo !== 'mastery' && n.mastery) erros.push(`${n.id}: só ponto de Mastery desbloqueia Mastery`);
    for (const k of Object.keys(n.bonus)) if (!(k in BONUS_LABEL)) erros.push(`${n.id}: bônus desconhecido (${k})`);
    if (n.para !== 'todos' && (!Array.isArray(n.para) || n.para.length === 0 || n.para.some((k) => !isHeroKind(k)))) erros.push(`${n.id}: compatibilidade inválida`);
  }
  const raizes = NOS.filter((n) => n.tipo === 'raiz');
  if (raizes.length !== 1) erros.push('a árvore precisa de exatamente um nó raiz');
  const vistos = new Set<string>();
  for (const [a, b] of CONEXOES) {
    if (!ids.has(a) || !ids.has(b)) erros.push(`conexão ${a}–${b} aponta para nó inexistente`);
    if (a === b) erros.push(`conexão de um nó com ele mesmo: ${a}`);
    const chave = [a, b].sort().join('|');
    if (vistos.has(chave)) erros.push(`conexão repetida: ${a}–${b}`);
    vistos.add(chave);
  }
  // todo nó precisa ser alcançável a partir da raiz (senão nunca abre)
  if (raizes.length === 1) {
    const seen = new Set<string>([RAIZ_ID]);
    const fila = [RAIZ_ID];
    while (fila.length) {
      const atual = fila.shift()!;
      for (const v of vizinhos(atual)) if (!seen.has(v)) { seen.add(v); fila.push(v); }
    }
    for (const n of NOS) if (!seen.has(n.id)) erros.push(`sem caminho até a raiz: ${n.id}`);
  }
  const familias = new Set(FAMILIAS.map((f) => f.id));
  const masteryIds = new Set<string>();
  for (const m of MASTERIES) {
    if (masteryIds.has(m.id)) erros.push(`Mastery repetida: ${m.id}`);
    masteryIds.add(m.id);
    const no = NO_BY_ID[m.noRequerido];
    if (!no || no.tipo !== 'mastery' || no.mastery !== m.id) erros.push(`${m.id}: nó requerido inválido (${m.noRequerido})`);
    if (!familias.has(m.familia)) erros.push(`${m.id}: família desconhecida (${m.familia})`);
    if (m.elegiveis.length === 0 || m.elegiveis.some((k) => !isHeroKind(k))) erros.push(`${m.id}: elegíveis inválidos`);
    if (!Number.isInteger(m.nivelMin) || m.nivelMin < 1) erros.push(`${m.id}: nível mínimo inválido`);
    const r = m.regra;
    const frac = (v: number) => v > 0 && v <= 1;
    if (r.tipo === 'escudoReativo' && !(frac(r.limiar) && frac(r.pct) && r.sec > 0)) erros.push(`${m.id}: regra de escudo fora da faixa`);
    if (r.tipo === 'execucao' && !(frac(r.limiar) && r.bonus > 0)) erros.push(`${m.id}: regra de execução fora da faixa`);
    if (r.tipo === 'empurrao' && !(frac(r.chance) && r.passos >= 1)) erros.push(`${m.id}: regra de empurrão fora da faixa`);
  }
  for (const f of FAMILIAS) if (f.mastery && !MASTERY_BY_ID[f.mastery]) erros.push(`família ${f.id} aponta para Mastery inexistente`);
  for (const n of NOS) if (n.tipo === 'mastery' && !MASTERIES.some((m) => m.id === n.mastery)) erros.push(`${n.id}: Mastery inexistente (${n.mastery})`);
  return erros;
}
