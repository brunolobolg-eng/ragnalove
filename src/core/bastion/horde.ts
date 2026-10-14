import { BASTION_HORDE } from '../../config/bastion';
import type { WaveMix } from '../../config/zones';

/**
 * Horda de cada noite do Último Bastião (pura: a mesma noite sempre traz a mesma horda; sem Math.random).
 * Noite n = ondas vencidas + 1 (a que vem). A cada `mvpEvery` noites vem um MVP; a cada `miniEvery` (exceto
 * as de MVP), um mini-chefe; as demais são comuns. O chefe entra pelo mecanismo de chefe da onda (`boss`),
 * depois da tropa comum. Os números e a ordem dos ciclos estão em config/bastion.ts (BASTION_HORDE).
 */

export type HordeTier = 'comum' | 'mini' | 'mvp' | 'lenda';

export interface HordeWave {
  /** Número da noite (começa em 1). */
  wave: number;
  tier: HordeTier;
  /** Tropa comum da noite. */
  count: number;
  /** Mistura da tropa comum (a mesma em toda noite). */
  mix: WaveMix[];
  /** Mini-chefe ou MVP da noite. Ausente nas noites comuns. */
  boss?: string;
  /** Título para a tela, ex.: "Noite 5 · mini-chefe". */
  title: string;
  /** Quem chega: o nome do chefe, ou a lista da tropa comum (ex.: "Zumbi, Corredor, Pesado, Raydric e Necromante"). */
  detail: string;
}

/** Junta nomes em pt-BR: "A, B e C". */
function listaPt(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Horda da noite `wave` (número da noite, a partir de 1). Valor inválido cai na noite 1. */
export function hordeOf(wave: number): HordeWave {
  const n = Number.isFinite(wave) && wave >= 1 ? Math.floor(wave) : 1;
  const { count, regular, miniEvery, mvpEvery, legendEvery, legends, minis, mvps, names } = BASTION_HORDE;
  const mix = regular.map((m) => ({ ...m }));
  const nomeDe = (kind: string) => names[kind] ?? kind;

  if (n % legendEvery === 0) {
    // Chefe lendário: a noite inteira é dele (no lugar do MVP e do mini-chefe).
    const boss = legends[(n / legendEvery - 1) % legends.length];
    return { wave: n, tier: 'lenda', count, mix, boss, title: `Noite ${n} · lenda`, detail: nomeDe(boss) };
  }
  if (n % mvpEvery === 0) {
    const boss = mvps[(n / mvpEvery - 1) % mvps.length];
    return { wave: n, tier: 'mvp', count, mix, boss, title: `Noite ${n} · MVP`, detail: nomeDe(boss) };
  }
  if (n % miniEvery === 0) {
    // k = quantas noites de mini-chefe existem até esta, contando esta. As noites de MVP também são múltiplas
    // de miniEvery, por isso saem da conta: k = n / miniEvery − n / mvpEvery (arredondados para baixo).
    // Vale só com mvpEvery múltiplo de miniEvery (checado em scripts/bastionCheck.ts).
    const k = Math.floor(n / miniEvery) - Math.floor(n / mvpEvery);
    const boss = minis[(k - 1) % minis.length];
    return { wave: n, tier: 'mini', count, mix, boss, title: `Noite ${n} · mini-chefe`, detail: nomeDe(boss) };
  }
  return { wave: n, tier: 'comum', count, mix, title: `Noite ${n} · comum`, detail: listaPt(mix.map((m) => nomeDe(m.kind))) };
}
