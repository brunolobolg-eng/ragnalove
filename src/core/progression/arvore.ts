import {
  ARVORE_CAPS_COMBATE,
  ARVORE_CAP_ATRIBUTO,
  ARVORE_CONFIG,
  ARVORE_ECONOMIA,
  BONUS_LABEL,
  CATEGORIAS,
  CATEGORIA_IDS,
  CONEXOES,
  ECO_KEYS,
  custoDoNo,
  FAMILIAS,
  MASTERIES,
  MASTERY_BY_ID,
  NOS,
  NO_BY_ID,
  PASSIVA_KEYS,
  REGIOES,
  type BonusKey,
  type EcoKey,
  type MasteryDef,
  type MasteryId,
  type NoDef,
  type PassivaKey,
} from '../../config/arvoreGlobal';
import { isHeroKind } from '../../config/heroes';
import { ATTR_KEYS, type Attrs } from './attributes';
import type { VocationPassiveBonus } from '../../config/vocationSkills';
import type { HeroKind } from './skills';

/**
 * Árvore global de progressão: regras puras (sem DOM, sem Three.js, sem sorteio).
 *
 * - Pontos de árvore vêm do progresso que já existe: `pontosPorNivel` por nível de cada personagem.
 * - `comprados`: nós abertos. Um nó só abre se estiver ligado a um nó aberto (a raiz é sempre aberta).
 * - Bônus de nó são calculados na hora a partir de `comprados`: nada de efeito guardado, nada residual.
 * - Economia (EXP, Zen, descontos...): somada entre os nós abertos e limitada pelo teto de cada bônus.
 *   Só valem os bônus com `ligado: true` na config; os outros ficam em 0 até o gancho existir.
 * - Combate: passivas e atributos são somados e limitados pelos caps de ARVORE_CAPS_COMBATE / ARVORE_CAP_ATRIBUTO.
 * - Mastery: guardada por id -> personagem. Só vale com o ponto aberto, personagem elegível e nível mínimo.
 *
 * Toda mudança é atômica: se a checagem falha, nada muda e a mensagem (pt-BR) volta.
 * A pré-visualização (previsao*) não muda nada.
 */

/** Estado da árvore dentro do Profile (um por jornada, e um no Bastião). */
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

/** Economia somada entre os nós abertos (só bônus ligados; os demais ficam em 0). */
export type Economia = Record<EcoKey, number>;

export const BLOQUEIO_COMBATE = 'A árvore só pode ser mexida fora da luta.';

export function arvoreVazia(): ArvoreState {
  return { comprados: [], masteries: {}, reorganizacoes: 0 };
}

/**
 * Árvore que vale para o save de meta: a já guardada no meta; se não há (save antigo), adota a da jornada
 * antiga (migração: nada se perde); senão, árvore vazia. Pode rodar mais de uma vez (idempotente).
 */
export function arvoreDoMeta(meta: { arvore?: unknown }, legados: unknown[] = []): ArvoreState {
  if (meta.arvore !== undefined && meta.arvore !== null) return normalizarArvore(meta.arvore);
  for (const l of legados) if (l !== undefined && l !== null) return normalizarArvore(l);
  return arvoreVazia();
}

/** Liga a árvore do meta ao perfil em uso (mesma referência: o que muda na tela aparece no meta ao gravar). */
export function anexarArvore(perfil: { arvore?: ArvoreState }, arvore: ArvoreState): void {
  perfil.arvore = arvore;
}

/** Cópia do save sem a árvore: a árvore mora no meta, então o save da jornada e do Bastião não a guarda. */
export function semArvoreNoSave<T extends { profile?: { arvore?: unknown } }>(save: T): T {
  if (!save.profile || save.profile.arvore === undefined) return save;
  const profile: { arvore?: unknown } = { ...save.profile };
  delete profile.arvore;
  return { ...save, profile } as T;
}

/**
 * Conserta a árvore que veio do save (antigo, vazio ou editado à mão). Não perde nada válido:
 * id desconhecido e raiz saem; nó repetido conta uma vez; nó só fica se está ligado à raiz por nós que
 * também ficaram; Mastery só fica com o nó aberto, herói elegível e dentro do limite por herói.
 * Pode rodar mais de uma vez (idempotente).
 */
export function normalizarArvore(raw: unknown): ArvoreState {
  if (!raw || typeof raw !== 'object') return arvoreVazia();
  const r = raw as { comprados?: unknown; masteries?: unknown; reorganizacoes?: unknown };
  const pendentes: string[] = [];
  if (Array.isArray(r.comprados)) {
    for (const id of r.comprados) {
      if (typeof id !== 'string' || pendentes.includes(id)) continue;
      const no = NO_BY_ID[id];
      if (!no || no.tipo === 'raiz') continue;
      pendentes.push(id);
    }
  }
  const abertos = new Set<string>([RAIZ_ID]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const id of pendentes) {
      if (abertos.has(id) || !vizinhos(id).some((v) => abertos.has(v))) continue;
      abertos.add(id);
      mudou = true;
    }
  }
  const st: ArvoreState = {
    comprados: pendentes.filter((id) => abertos.has(id)),
    masteries: {},
    reorganizacoes: typeof r.reorganizacoes === 'number' && Number.isInteger(r.reorganizacoes) && r.reorganizacoes >= 0 ? r.reorganizacoes : 0,
  };
  if (r.masteries && typeof r.masteries === 'object') {
    const guardadas = r.masteries as Record<string, unknown>;
    for (const id of Object.keys(guardadas).sort()) {
      const m = MASTERY_BY_ID[id];
      const k = guardadas[id];
      if (!m || typeof k !== 'string' || !isHeroKind(k)) continue;
      if (!m.elegiveis.includes(k) || !possui(st, m.noRequerido)) continue;
      if (masteriesDoHeroi(st, k).length >= ARVORE_CONFIG.maxMasteriesPorHeroi) continue;
      st.masteries[m.id] = k;
    }
  }
  return st;
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

/** Nós abertos (raiz incluída). */
export function nosAbertos(h: ArvoreHost): Set<string> {
  const st = estado(h);
  return new Set([RAIZ_ID, ...st.comprados]);
}

/** Estado de um nó para a tela: aberto, disponível para comprar, falta ponto ou bloqueado (sem ligação). */
export type EstadoNo = 'aberto' | 'disponivel' | 'sem-pontos' | 'bloqueado';

export function estadoNo(h: ArvoreHost, id: string): EstadoNo {
  const no = NO_BY_ID[id];
  if (!no) return 'bloqueado';
  if (possui(estado(h), id)) return 'aberto';
  if (!alcancavel(h, id)) return 'bloqueado';
  return pontosDisponiveis(h) >= custoDoNo(no) ? 'disponivel' : 'sem-pontos';
}

// ---------------- pontos ----------------

/** Total de pontos que o progresso já deu (soma de níveis de todos os personagens). */
export function pontosTotais(h: ArvoreHost): number {
  let niveis = 0;
  for (const hp of Object.values(h.heroes)) niveis += Math.max(0, (hp.level ?? 1) - 1);
  return niveis * ARVORE_CONFIG.pontosPorNivel;
}

/** Pontos gastos nos nós abertos. */
export function pontosGastos(h: ArvoreHost): number {
  const st = estado(h);
  return [...new Set(st.comprados)].reduce((s, id) => s + (NO_BY_ID[id] ? custoDoNo(NO_BY_ID[id]) : 0), 0);
}

/** Pontos livres agora (nunca negativo). */
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
  const falta = custoDoNo(no) - pontosDisponiveis(h);
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

/** Mastery com o nó que a desbloqueia aberto? */
export function masteryDesbloqueada(h: ArvoreHost, masteryId: MasteryId): boolean {
  const m = MASTERY_BY_ID[masteryId];
  return !!m && possui(estado(h), m.noRequerido);
}

/** Masteries que estão com o personagem. */
function masteriesDoHeroi(st: ArvoreState, k: HeroKind): MasteryId[] {
  return (Object.keys(st.masteries) as MasteryId[]).filter((id) => st.masteries[id] === k).sort();
}

/** Custo de atribuir (ou trocar) uma Mastery. Preço fixo em Zen. */
export function custoAtribuir(): number {
  return ARVORE_CONFIG.atribuirZen;
}

/** Motivo para não atribuir a Mastery a esse personagem agora (ausente = pode). */
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

/** Tira a Mastery do personagem (de graça: ela volta à guarda). */
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
 * Mastery que vale para o personagem AGORA: está com ele, o nó que a desbloqueia está aberto, ele é elegível e
 * tem o nível. Qualquer falta vira "sem efeito" (nada residual).
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

/** Fecha todos os nós e devolve as Masteries à guarda. Cobra Zen e sobe o custo da próxima vez. */
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

/** Bônus de combate que os nós abertos dão a um personagem (já limitados pelos caps). */
export interface BonusArvore {
  attrs: Partial<Attrs>;
  passiva: Partial<VocationPassiveBonus>;
}

const ECO_SET = new Set<string>(ECO_KEYS);
const PASSIVA_SET = new Set<string>(PASSIVA_KEYS);
const isEco = (k: string): k is EcoKey => ECO_SET.has(k);
const isPassiva = (k: string): k is PassivaKey => PASSIVA_SET.has(k);

/** Soma o bônus de combate dos nós abertos compatíveis com o personagem, respeitando os caps. */
export function bonusDoHeroi(h: ArvoreHost, k: HeroKind): BonusArvore {
  const attrs: Partial<Record<keyof Attrs, number>> = {};
  const passiva: Partial<Record<PassivaKey, number>> = {};
  const st = estado(h);
  for (const id of new Set(st.comprados)) {
    const no = NO_BY_ID[id];
    if (!no || no.tipo === 'raiz' || !compativel(no, k)) continue;
    for (const [key, valor] of Object.entries(no.bonus) as [BonusKey, number][]) {
      if (isEco(key)) continue;
      if ((ATTR_KEYS as string[]).includes(key)) {
        const a = key as keyof Attrs;
        attrs[a] = (attrs[a] ?? 0) + valor;
      } else if (isPassiva(key)) passiva[key] = (passiva[key] ?? 0) + valor;
    }
  }
  for (const a of Object.keys(attrs) as (keyof Attrs)[]) attrs[a] = Math.min(ARVORE_CAP_ATRIBUTO, attrs[a]!);
  for (const p of Object.keys(passiva) as PassivaKey[]) passiva[p] = Math.min(ARVORE_CAPS_COMBATE[p], passiva[p]!);
  return { attrs, passiva: passiva as Partial<VocationPassiveBonus> };
}

/**
 * Economia dos nós abertos: soma por bônus e limita pelo teto. Bônus sem gancho (`ligado: false`) ficam em 0.
 * É daqui que EXP, Zen, descontos, recrutas, pontos de habilidade e os bônus do Bastião leem.
 */
export function economiaDoPerfil(h: ArvoreHost): Economia {
  const out = Object.fromEntries(ECO_KEYS.map((k) => [k, 0])) as Economia;
  const st = estado(h);
  for (const id of new Set(st.comprados)) {
    const no = NO_BY_ID[id];
    if (!no) continue;
    for (const [key, valor] of Object.entries(no.bonus) as [BonusKey, number][]) if (isEco(key)) out[key] += valor;
  }
  for (const k of ECO_KEYS) {
    const cfg = ARVORE_ECONOMIA[k];
    out[k] = cfg.ligado ? Math.min(cfg.teto, out[k]) : 0;
  }
  return out;
}

const PERC = (v: number) => `${String(Math.round(v * 1000) / 10).replace('.', ',')}%`;
/** Bônus que reduzem custo (sinal de menos no texto). */
const NEGATIVO = new Set<BonusKey>(['descontoCidade', 'reparoCidade', 'custoConstrucao', 'reparoBastiao']);
const ATRIBUTO_KEYS = new Set<string>(['str', 'int', 'vit', 'dex', 'luk']);

/** Texto (pt-BR) de um bônus, para o painel de detalhes e a ficha. */
export function textoBonus(b: Partial<Record<BonusKey, number>>): string[] {
  return (Object.keys(b) as BonusKey[])
    .filter((k) => (b[k] ?? 0) !== 0)
    .map((k) => {
      const v = b[k] ?? 0;
      const L = BONUS_LABEL[k];
      if (ATRIBUTO_KEYS.has(k)) return `+${v} de ${L.nome}`;
      if (L.formato === 'pontos') return `${v > 0 ? '+' : ''}${v} ${L.nome}`;
      const sinal = NEGATIVO.has(k) ? '−' : k === 'reduce' ? '−' : '+';
      const comDe = L.nome.startsWith('de ') ? L.nome : `de ${L.nome}`;
      return `${sinal}${PERC(v)} ${comDe}`;
    });
}

// ---------------- validação do desenho ----------------

/** Confere o desenho (dados). Lista vazia = válido. Usado pela checagem e pela tela de desenvolvimento. */
export function validarArvore(): string[] {
  const erros: string[] = [];
  const ids = new Set<string>();
  for (const n of NOS) {
    if (ids.has(n.id)) erros.push(`id repetido: ${n.id}`);
    ids.add(n.id);
    if (!REGIOES[n.regiao]) erros.push(`${n.id}: região desconhecida (${n.regiao})`);
    if (!CATEGORIAS[n.categoria]) erros.push(`${n.id}: categoria desconhecida (${n.categoria})`);
    if (!Number.isInteger(n.custo) || n.custo < 0) erros.push(`${n.id}: custo inválido (${n.custo})`);
    if (n.tipo === 'raiz' && n.custo !== 0) erros.push(`${n.id}: a raiz não tem custo`);
    if (n.tipo === 'mastery' && !n.mastery) erros.push(`${n.id}: ponto de Mastery sem Mastery`);
    if (n.tipo !== 'mastery' && n.mastery) erros.push(`${n.id}: só ponto de Mastery desbloqueia Mastery`);
    if (n.para !== 'todos' && (!Array.isArray(n.para) || n.para.length === 0 || n.para.some((k) => !isHeroKind(k)))) erros.push(`${n.id}: compatibilidade inválida`);
    for (const [k, v] of Object.entries(n.bonus) as [BonusKey, number][]) {
      if (!(k in BONUS_LABEL)) erros.push(`${n.id}: bônus desconhecido (${k})`);
      else if (isEco(k)) {
        if (v > ARVORE_ECONOMIA[k].teto) erros.push(`${n.id}: ${k} (${v}) passa do teto (${ARVORE_ECONOMIA[k].teto})`);
      } else if (isPassiva(k)) {
        if (v > ARVORE_CAPS_COMBATE[k]) erros.push(`${n.id}: ${k} (${v}) passa do cap de combate (${ARVORE_CAPS_COMBATE[k]})`);
      } else if (v > ARVORE_CAP_ATRIBUTO) erros.push(`${n.id}: ${k} (${v}) passa do cap de atributo (${ARVORE_CAP_ATRIBUTO})`);
    }
  }
  for (const c of CATEGORIA_IDS) if (!NOS.some((n) => n.categoria === c)) erros.push(`categoria sem nó: ${c}`);
  const raizes = NOS.filter((n) => n.tipo === 'raiz');
  if (raizes.length !== 1) erros.push('a árvore precisa de exatamente um nó raiz');
  if (NOS.length < ARVORE_CONFIG.minNos) erros.push(`a árvore tem ${NOS.length} nós (mínimo ${ARVORE_CONFIG.minNos})`);
  // conexões: sem repetição, sem ponta inexistente, sem laço
  const vistos = new Set<string>();
  for (const [a, b] of CONEXOES) {
    if (!ids.has(a) || !ids.has(b)) erros.push(`conexão ${a}–${b} aponta para nó inexistente`);
    if (a === b) erros.push(`conexão de um nó com ele mesmo: ${a}`);
    const chave = [a, b].sort().join('|');
    if (vistos.has(chave)) erros.push(`conexão repetida: ${a}–${b}`);
    vistos.add(chave);
  }
  // sem nó órfão: todo nó precisa ser alcançável a partir da raiz
  if (raizes.length === 1) {
    const seen = new Set<string>([RAIZ_ID]);
    const fila = [RAIZ_ID];
    while (fila.length) {
      const atual = fila.shift()!;
      for (const v of vizinhos(atual)) if (!seen.has(v)) { seen.add(v); fila.push(v); }
    }
    for (const n of NOS) if (!seen.has(n.id)) erros.push(`sem caminho até a raiz (órfão): ${n.id}`);
  }
  // Masteries: cada uma com ponto próprio, família conhecida e pelo menos um personagem elegível
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
    const ok = (cond: boolean, what: string) => { if (!cond) erros.push(`${m.id}: ${what} fora da faixa`); };
    switch (r.tipo) {
      case 'escudoReativo': ok(frac(r.limiar) && frac(r.pct) && r.sec > 0, 'escudo'); break;
      case 'execucao': ok(frac(r.limiar) && r.bonus > 0, 'execução'); break;
      case 'empurrao': ok(frac(r.chance) && r.passos >= 1, 'empurrão'); break;
      case 'bonusContraPesado': ok(frac(r.pct), 'bônus contra pesados'); break;
      case 'estilhaco': ok(frac(r.chance) && frac(r.pct), 'estilhaço'); break;
      case 'golpeCiclico': ok(Number.isInteger(r.a) && r.a >= 2 && frac(r.pct), 'golpe cíclico'); break;
      case 'marca': ok(frac(r.chance) && frac(r.amp) && r.sec > 0, 'marca'); break;
      case 'frio': ok(frac(r.chance) && r.sec > 0, 'frio'); break;
      case 'lentidao': ok(frac(r.chance) && r.mult > 1 && r.sec > 0, 'lentidão'); break;
      case 'atordoar': ok(frac(r.chance) && r.sec > 0, 'atordoar'); break;
      case 'curaReativa': ok(frac(r.limiar) && frac(r.pct), 'cura'); break;
      case 'espinhos': ok(frac(r.pct), 'espinhos'); break;
      case 'recuoSofrido': ok(frac(r.chance) && r.passos >= 1, 'recuo'); break;
      case 'avancoAbate': ok(r.passos >= 1, 'avanço'); break;
      case 'recuoAbate': ok(r.passos >= 1, 'recuo ao abate'); break;
      case 'bencaoEquipe': ok(frac(r.amp) && r.sec > 0, 'bênção'); break;
      case 'escudoAliado': ok(frac(r.pct) && r.sec > 0, 'escudo aliado'); break;
      case 'curaColetiva': ok(frac(r.pct), 'cura coletiva'); break;
      default: erros.push(`${m.id}: tipo de regra desconhecido`);
    }
  }
  for (const f of FAMILIAS) {
    const n = MASTERIES.filter((m) => m.familia === f.id).length;
    if (n < 3 || n > 4) erros.push(`família ${f.id} tem ${n} Masteries (esperado 3 a 4)`);
  }
  for (const n of NOS) if (n.tipo === 'mastery' && !MASTERIES.some((m) => m.id === n.mastery)) erros.push(`${n.id}: Mastery inexistente (${n.mastery})`);
  return erros;
}
