/**
 * Leitura do save da jornada. Pura: não grava nem apaga nada. Quem decide o que fazer com o arquivo é a interface,
 * que nunca sobrescreve um save que não entendeu (versão nova ou ilegível): guarda uma cópia antes.
 */
import { migrateRun, VERSAO_JORNADA, type RunState } from './run';

export type LeituraJornada =
  | { tipo: 'nova' }
  | { tipo: 'ok' | 'migrada'; run: RunState; deVersao: number }
  | { tipo: 'versao_futura'; versao: number }
  | { tipo: 'corrompida'; motivo: string }
  | { tipo: 'encerrada' };

/** Lê o texto do save (ou null, se não há save). Versão mais nova que a atual não é migrada nem entendida. */
export function lerJornada(raw: string | null): LeituraJornada {
  if (raw === null) return { tipo: 'nova' };
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(raw);
  } catch {
    return { tipo: 'corrompida', motivo: 'JSON inválido' };
  }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return { tipo: 'corrompida', motivo: 'não é um objeto' };
  const versao = dados.version;
  if (typeof versao !== 'number' || !Number.isInteger(versao) || versao < 1) return { tipo: 'corrompida', motivo: 'sem versão válida' };
  if (versao > VERSAO_JORNADA) return { tipo: 'versao_futura', versao };
  const heroes = (dados.profile as { heroes?: Record<string, unknown> } | undefined)?.heroes;
  if (!heroes?.warrior) return { tipo: 'corrompida', motivo: 'sem perfil de herói' };
  if (dados.ended) return { tipo: 'encerrada' };
  let run: RunState;
  try {
    run = migrateRun(dados as unknown as RunState);
  } catch (e) {
    return { tipo: 'corrompida', motivo: `migração falhou: ${(e as Error).message}` };
  }
  return { tipo: versao === VERSAO_JORNADA ? 'ok' : 'migrada', run, deVersao: versao };
}

/** Uma jornada que o jogo não entendeu, guardada em 'runBackup'. */
export interface CopiaJornada {
  guardadoEm: string;
  motivo: string;
  conteudo: string;
}

/**
 * Acrescenta uma jornada não entendida à lista de cópias (texto de 'runBackup'). Pura e só acrescenta: uma cópia
 * já guardada não some (nem é duplicada), e uma lista ilegível vira a primeira entrada, sem perder o texto.
 */
export function acrescentarCopia(listaAtual: string | null, raw: string, motivo: string, guardadoEm: string): string {
  let copias: CopiaJornada[] = [];
  if (listaAtual !== null) {
    try {
      const lista = JSON.parse(listaAtual);
      copias = Array.isArray(lista) ? lista : [{ guardadoEm: 'antes', motivo: 'cópia anterior', conteudo: listaAtual }];
    } catch {
      copias = [{ guardadoEm: 'antes', motivo: 'cópia anterior ilegível', conteudo: listaAtual }];
    }
  }
  if (!copias.some((c) => c?.conteudo === raw)) copias.push({ guardadoEm, motivo, conteudo: raw });
  return JSON.stringify(copias);
}
