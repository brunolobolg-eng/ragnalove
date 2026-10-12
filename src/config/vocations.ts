import type { HeroKind } from '../core/progression/skills';
import type { AttrKey } from '../core/progression/attributes';

/**
 * Vocações: evoluções das classes. Cada classe tem duas vagas. Ao chegar ao nível
 * `VOCATIONS_CONFIG.level`, o herói escolhe UMA delas, e a escolha vale até o fim da jornada
 * (derrota total começa do zero, como o resto do herói). Vaga `null` = ainda sem desenho:
 * aparece como "Em breve" na ficha e não pode ser escolhida.
 */
export interface VocationDef {
  /** Id estável (vai para o save): não renomear depois de publicado. */
  id: string;
  nome: string;
  /** Uma ou duas frases para a ficha. */
  descricao: string;
  /** Bônus fixo de atributos, somado aos pontos e ao equipamento. */
  bonus: Partial<Record<AttrKey, number>>;
  /** Modelo 3D (chave em `HERO_MODELS`). Ausente = usa o modelo da classe base. */
  modelo?: string;
}

export const VOCATIONS_CONFIG = {
  /** Nível em que o herói escolhe a vocação (uma vez por jornada). */
  level: 10,
};

/** Duas vagas por classe, na ordem em que aparecem na ficha. */
export const VOCATIONS: Record<HeroKind, [VocationDef | null, VocationDef | null]> = {
  warrior: [
    {
      id: 'barbarian',
      nome: 'Bárbaro',
      descricao: 'Evolução do Guerreiro que troca a disciplina do escudo pela fúria: mais força e mais vida para segurar a linha de frente.',
      bonus: { str: 3, vit: 2 },
    },
    null,
  ],
  mage: [null, null],
  archer: [null, null],
  sorcerer: [null, null],
  warlock: [null, null],
  assassin: [null, null],
};
