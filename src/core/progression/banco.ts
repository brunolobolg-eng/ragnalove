import { ARVORE_BANCO } from '../../config/arvoreGlobal';

/**
 * Banco de Zen (fica no save de meta): o crédito extra que paga a Árvore Global. Vem de uma parte do Zen ganho
 * numa jornada da campanha e de cada bloco completo de noites do Último Bastião. Não tira Zen de nenhuma carteira.
 *
 * Regras puras (sem DOM, sem disco, sem sorteio). Quem grava é main.ts e bastionSession.ts, sempre com UMA escrita
 * do meta por operação: saldo e chave de crédito vão juntos, então um crédito nunca é pago duas vezes, mesmo que o
 * app caia entre as escritas (a chave já está gravada e o crédito não se repete).
 */

/** Saldo do banco e as chaves dos créditos já pagos (idempotência). */
export interface BancoZen {
  saldo: number;
  creditos: string[];
}

export type DesfechoCampanha = 'vitoria' | 'derrota' | 'abandono';

export function bancoVazio(): BancoZen {
  return { saldo: 0, creditos: [] };
}

/** Banco vindo do save (ausente, corrompido ou editado à mão): saldo inteiro não negativo e chaves sem repetição. */
export function normalizarBanco(raw: unknown): BancoZen {
  if (!raw || typeof raw !== 'object') return bancoVazio();
  const r = raw as { saldo?: unknown; creditos?: unknown };
  const saldo = typeof r.saldo === 'number' && Number.isFinite(r.saldo) && r.saldo >= 0 ? Math.floor(r.saldo) : 0;
  const creditos = Array.isArray(r.creditos) ? [...new Set(r.creditos.filter((c): c is string => typeof c === 'string'))] : [];
  return { saldo, creditos };
}

/** Crédito da jornada da campanha: a parte do Zen ganho na jornada que depende do desfecho (para baixo). */
export function creditoCampanha(zenGanho: number, desfecho: DesfechoCampanha): number {
  const z = Math.max(0, Math.floor(Number.isFinite(zenGanho) ? zenGanho : 0));
  return Math.floor(z * ARVORE_BANCO.campanha[desfecho]);
}

/** Crédito de um bloco completo do Bastião: a parte do Zen ganho no bloco (para baixo). */
export function creditoBastiao(zenDoBloco: number): number {
  return Math.floor(Math.max(0, Number.isFinite(zenDoBloco) ? zenDoBloco : 0) * ARVORE_BANCO.bastiao.pct);
}

/** Chave da jornada da campanha: a semente da jornada é única por jornada (uma jornada termina uma vez). */
export const chaveJornada = (seed: number): string => `jornada:${seed >>> 0}`;

/** Chave de um bloco do Bastião: a tentativa entra na chave porque as noites recomeçam em cada tentativa. */
export const chaveBloco = (seed: number, tentativa: number, bloco: number): string => `bastiao:${seed >>> 0}:${tentativa}:${bloco}`;

/**
 * Aplica um crédito ao banco. Idempotente: uma chave já paga não paga de novo (devolve false). Valor zero não
 * grava chave (nada a lembrar). Muda o banco que recebeu.
 */
export function creditarBanco(b: BancoZen, chave: string, valor: number): boolean {
  if (valor <= 0 || b.creditos.includes(chave)) return false;
  b.saldo += valor;
  b.creditos.push(chave);
  return true;
}

/** Lê o meta (texto do save). Texto ausente ou ilegível vira objeto vazio para leitura; a escrita não sobrescreve nada. */
function lerMeta(texto: string | null): Record<string, unknown> | undefined {
  try {
    const m = JSON.parse(texto ?? '{}') as unknown;
    return m && typeof m === 'object' ? (m as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Banco guardado no meta (ausente = banco vazio: save antigo, sem nenhum crédito ainda). */
export function bancoDoMeta(texto: string | null): BancoZen {
  return normalizarBanco(lerMeta(texto)?.banco);
}

/**
 * Texto novo do meta com o crédito aplicado, numa escrita só (saldo e chave juntos). Devolve undefined quando nada
 * muda (chave já paga, valor zero) ou quando o meta não pode ser lido (nunca sobrescreve um meta ilegível).
 */
export function metaComCredito(texto: string | null, chave: string, valor: number): string | undefined {
  const m = lerMeta(texto);
  if (!m) return undefined;
  const b = normalizarBanco(m.banco);
  if (!creditarBanco(b, chave, valor)) return undefined;
  m.banco = b;
  return JSON.stringify(m);
}
