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

/** Resultado de tentar creditar no meta: creditado (com o texto novo), já pago, sem valor ou meta ilegível. */
export type ResultadoCredito = { status: 'creditado'; texto: string } | { status: 'ja-pago' | 'sem-valor' | 'ilegivel' };

/**
 * Texto novo do meta com o crédito aplicado (uma escrita só: saldo e chave juntos). Nunca sobrescreve um meta ilegível.
 */
export function creditoNoMeta(texto: string | null, chave: string, valor: number): ResultadoCredito {
  const m = lerMeta(texto);
  if (!m) return { status: 'ilegivel' };
  if (valor <= 0) return { status: 'sem-valor' };
  const b = normalizarBanco(m.banco);
  if (!creditarBanco(b, chave, valor)) return { status: 'ja-pago' };
  m.banco = b;
  return { status: 'creditado', texto: JSON.stringify(m) };
}

/** Chaves do disco de save (o SaveStore no jogo; um disco de faz de conta nos testes). */
export type ChaveDisco = 'meta' | 'run' | 'bastion';
export interface DiscoSave {
  get(chave: ChaveDisco): string | null;
  set(chave: ChaveDisco, texto: string): boolean;
}
/** ok: principal gravado (com ou sem crédito novo). sem-banco: meta ilegível, crédito não entrou, progresso gravado. falhou: o disco recusou. */
export type ResultadoGravacao = 'ok' | 'sem-banco' | 'falhou';

/**
 * Grava o save principal (a jornada que acabou, ou a noite do Bastião) junto com um crédito no banco, na ORDEM SEGURA:
 *  1) o crédito vai para o meta numa escrita só (saldo e chave juntos);
 *  2) só depois o save principal, que marca a jornada como encerrada ou a noite como aplicada.
 * Queda entre (1) e (2): o principal volta como antes e a chave já paga impede pagar de novo na repetição.
 * Queda antes de (1): nada mudou e o crédito entra na repetição. Nunca se perde o crédito de um fim gravado.
 */
export function gravarComCredito(disco: DiscoSave, chave: string, valor: number, principal: { chave: 'run' | 'bastion'; texto: string }): ResultadoGravacao {
  const r = creditoNoMeta(disco.get('meta'), chave, valor);
  if (r.status === 'creditado' && !disco.set('meta', r.texto)) return 'falhou';
  if (!disco.set(principal.chave, principal.texto)) return 'falhou';
  return r.status === 'ilegivel' ? 'sem-banco' : 'ok';
}
