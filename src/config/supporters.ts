/**
 * Apoiadores do jogo (Ranking Donate). Mostra só NOME + CATEGORIA — nunca o valor,
 * comprovante ou histórico. O valor em reais só existe do lado do desenvolvedor, na hora
 * de classificar (ver `tierFor`), e não entra no build.
 * Ainda não há integração de pagamento: a lista é preenchida à mão a cada versão.
 */
export type SupporterTier = 'plebe' | 'trabalhador' | 'altoEscalao' | 'herdeiro';

export const DONATION_TIERS: { id: SupporterTier; label: string; min: number; max?: number; color: string }[] = [
  { id: 'plebe', label: 'Plebe', min: 1, max: 10, color: '#a7b0c2' },
  { id: 'trabalhador', label: 'Trabalhador Honesto', min: 11, max: 100, color: '#62c27a' },
  { id: 'altoEscalao', label: 'Alto Escalão', min: 101, max: 500, color: '#5b9bff' },
  { id: 'herdeiro', label: 'Herdeiro', min: 501, color: '#f2c14e' },
];

/** Categoria de um valor em reais (uso do desenvolvedor ao montar a lista). */
export function tierFor(reais: number): SupporterTier | undefined {
  const v = Math.floor(reais);
  return DONATION_TIERS.slice().reverse().find((t) => v >= t.min)?.id;
}

/** Lista pública: só nome e categoria. */
export const SUPPORTERS: { name: string; tier: SupporterTier }[] = [];
