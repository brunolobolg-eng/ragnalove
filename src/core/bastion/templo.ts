import { BASTION } from '../../config/bastion';
import { HERO_ORDER } from '../../config/heroes';
import type { HeroKind } from '../progression/skills';
import type { BastionState, Structure } from './bastion';
import type { BuildError } from './rules';

/**
 * Templo do Último Bastião: a construção que libera heróis. A cidade sacrifica almas e Zen (custo em
 * BASTION.temploHerois). Liberado fica liberado: a derrota não tira (ver BastionState.heroesLiberados).
 * Exige um templo de pé na cidade. Regras puras: a UI mostra o custo e chama liberarHeroi.
 */

export interface CustoHeroi {
  souls: number;
  zeni: number;
}

/** Custo de liberar o herói no templo. undefined = sem custo cadastrado (herói inicial ou inexistente). */
export function custoDoHeroi(kind: HeroKind): CustoHeroi | undefined {
  return BASTION.temploHerois[kind];
}

/** Templo de pé na cidade (qualquer templo com vida acima de zero). */
export function temploDePe(b: BastionState): Structure | undefined {
  return b.structures.find((s) => s.kind === 'temple' && s.hp > 0);
}

export type LiberarResult = { ok: true; souls: number; zeni: number } | { ok: false; error: BuildError };

/**
 * Por que o herói não pode ser liberado agora (undefined = pode). Única fonte da regra: a tela mostra e
 * liberarHeroi recusa com o mesmo motivo.
 */
export function motivoLiberar(b: BastionState, kind: HeroKind): BuildError | undefined {
  if (!HERO_ORDER.includes(kind)) return 'unknownHero';
  if (b.heroesLiberados.includes(kind)) return 'heroOwned';
  const custo = custoDoHeroi(kind);
  if (!custo) return 'unknownHero';
  if (!temploDePe(b)) return 'noTemple';
  if (b.profile.souls < custo.souls) return 'souls';
  if (b.profile.zeni < custo.zeni) return 'zeni';
  return undefined;
}

/**
 * Libera um herói sacrificando almas e Zen. Valida tudo antes de descontar (motivoLiberar). Não gasta nada
 * quando recusa.
 */
export function liberarHeroi(b: BastionState, kind: HeroKind): LiberarResult {
  const err = motivoLiberar(b, kind);
  if (err) return { ok: false, error: err };
  const custo = custoDoHeroi(kind)!;
  b.profile.souls -= custo.souls;
  b.profile.zeni -= custo.zeni;
  b.heroesLiberados.push(kind);
  return { ok: true, souls: custo.souls, zeni: custo.zeni };
}
