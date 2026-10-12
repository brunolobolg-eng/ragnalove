/**
 * Créditos finais (só ao vencer a luta final). Conteúdo é dado: troque os nomes aqui.
 * As fotos da jornada vêm do próprio jogo (render/Screenshot.ts e save/CreditShots.ts).
 */
export const CREDITS_CONFIG = {
  /** Uma foto por vitória de fase. Teto de segurança para não crescer sem limite. */
  maxShots: 20,
  /** Largura da foto guardada, em pixels (a altura segue a proporção da tela). */
  shotWidth: 640,
  /** Qualidade do JPEG guardado (0 a 1). */
  shotQuality: 0.82,
  /** Tempo de cada foto no slideshow e duração da rolagem dos créditos, em ms. */
  slideMs: 3200,
  rollMs: 38000,
};

export interface CreditsSection {
  titulo: string;
  nomes: string[];
}

export const CREDITS_TEAM: CreditsSection[] = [
  { titulo: 'Criação e direção', nomes: ['NOME AQUI'] },
  { titulo: 'Programação', nomes: ['NOME AQUI'] },
  { titulo: 'Arte e personagens', nomes: ['NOME AQUI'] },
  { titulo: 'Música e som', nomes: ['NOME AQUI'] },
  { titulo: 'Agradecimentos especiais', nomes: ['A quem jogou e acreditou em Aurenthal'] },
];
