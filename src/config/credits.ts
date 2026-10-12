/**
 * Créditos finais (só ao vencer a luta final). Conteúdo é dado: troque os textos aqui.
 * Primeiro passam as fotos da jornada (render/Screenshot.ts e save/CreditShots.ts); depois o roteiro abaixo,
 * uma cena por vez, com o tempo de cada uma, para a piada cair no momento certo.
 */
export const CREDITS_CONFIG = {
  /** Uma foto por vitória de fase. Teto de segurança para não crescer sem limite. */
  maxShots: 20,
  /** Largura da foto guardada, em pixels (a altura segue a proporção da tela). */
  shotWidth: 640,
  /** Qualidade do JPEG guardado (0 a 1). */
  shotQuality: 0.82,
  /** Tempo de cada foto no slideshow, em ms. */
  slideMs: 3200,
  /** Transição (fade) entre as cenas, em ms. */
  fadeMs: 600,
  /** Tempo que a última cena fica sozinha antes do botão "Continuar" aparecer, em ms. */
  endDelayMs: 2500,
};

export type EstiloLinha = 'marca' | 'titulo' | 'cargo' | 'nome' | 'nota' | 'aviso';

export interface LinhaCredito {
  texto: string;
  estilo: EstiloLinha;
}

export interface CenaCredito {
  /** Linhas exibidas juntas. Lista vazia = pausa. */
  linhas: LinhaCredito[];
  /** Tempo na tela, em ms. A última cena do roteiro fica até o jogador continuar. */
  ms: number;
  /** Tela preta, para o apagão do roteiro. */
  apagao?: boolean;
}

/** O nome que aparece em todos os cargos. */
const AUTOR = 'Bruno Lobo';

/** Cena de um cargo: o cargo, o nome e, se houver, a observação engraçada. */
function cargo(titulo: string, nota?: string, ms = 2400): CenaCredito {
  const linhas: LinhaCredito[] = [
    { texto: titulo, estilo: 'cargo' },
    { texto: AUTOR, estilo: 'nome' },
  ];
  if (nota) linhas.push({ texto: nota, estilo: 'nota' });
  return { linhas, ms };
}

export const CREDITS_SCRIPT: CenaCredito[] = [
  // ATO I — o estúdio parece profissional
  { linhas: [{ texto: 'AURENTHAL STUDIOS', estilo: 'marca' }, { texto: 'apresenta', estilo: 'nota' }], ms: 3000 },
  { linhas: [{ texto: 'ROguard', estilo: 'titulo' }, { texto: 'Crônicas das Almas Roubadas', estilo: 'nota' }], ms: 2800 },
  {
    linhas: [
      { texto: 'Uma produção de proporções absurdas.', estilo: 'nota' },
      { texto: 'Desenvolvido por uma equipe de profissionais altamente qualificados.', estilo: 'nota' },
    ],
    ms: 4000,
  },
  cargo('Direção Executiva'),
  cargo('Direção Criativa'),
  cargo('Programação'),
  cargo('Arte, Animação, Áudio e Game Design', 'Você já sabe.', 2800),

  // ATO II — algo está errado
  cargo('Programação de Gameplay, IA e Engine', 'pesquisando no Google por que tudo parou de funcionar.'),
  cargo('Direção de Arte', 'depois de trocar a paleta de cores pela décima sétima vez.'),
  cargo('Composição Musical e Design de Áudio', 'usando uma trilha temporária que ficou definitiva.'),
  cargo('Balanceamento de Combate', 'enfraquecendo o chefe que ele mesmo não conseguiu derrotar.'),
  cargo('Diretor de QA e Testes', 'reportando um bug para si mesmo e adiando a correção.'),
  cargo('Gerente de Projetos', 'atrasado para uma reunião da qual era a única participante.'),
  cargo('Diretor de Recursos Humanos', 'aprovou as próprias férias e as cancelou por falta de pessoal.'),
  cargo('Controle de Qualidade', 'novamente.'),

  // ATO III — o colapso corporativo
  cargo('Departamento de Controle de Danos', 'responsável pelos problemas causados pelo Departamento de Solução de Problemas.', 2200),
  cargo('Especialista em Decisões que Serão Revertidas Amanhã', 'responsável por todas as grandes ideias.', 2200),
  cargo('Gerente de Controle de Escopo', 'autorizou 47 novas funcionalidades fora do escopo.', 2200),
  cargo('Supervisor de Arquivos chamados "final_final_agora_vai"', 'guardião da versão definitiva, que não era definitiva.', 2200),
  cargo('Especialista em Procurar Bugs que Acabou de Criar', 'eficiência de 100% na geração de problemas.', 2200),
  cargo('Departamento de Otimização de FPS', 'removeu três árvores e declarou vitória.', 2200),
  cargo('Diretor de Inteligência Artificial', 'pediu ajuda à própria inteligência artificial.', 2200),
  cargo('Especialista em Animações Realistas', 'o personagem ainda desliza pelo chão.', 2200),
  cargo('Responsável pela Documentação', 'a documentação está desatualizada desde o primeiro dia.', 2200),
  cargo('Diretor de Segurança', 'a senha do servidor está num post-it colado no monitor.', 2200),
  cargo('Consultor Financeiro', 'orçamento: um sonho e dois cafés.', 2200),
  cargo('Departamento Jurídico', 'confirmou que ninguém será processado por chamar o arquivo de "novo_sistema_definitivo_3".', 2200),
  cargo('Diretor de Crises', 'responsável por todas as crises anteriores.', 2200),
  { linhas: [{ texto: 'Departamento de Contratação', estilo: 'cargo' }, { texto: 'não foi possível localizar candidatos disponíveis.', estilo: 'nota' }], ms: 3000 },
  { linhas: [{ texto: 'Equipe completa:', estilo: 'nota' }, { texto: '1 pessoa.', estilo: 'nome' }], ms: 2600 },
  { linhas: [{ texto: 'Departamento de Recursos Humanos', estilo: 'cargo' }, { texto: 'estamos investigando.', estilo: 'nota' }], ms: 2800 },

  // Piadas interativas: o roteiro "quebra" de propósito
  { linhas: [{ texto: 'Aviso corporativo', estilo: 'cargo' }, { texto: 'Qualquer semelhança entre os funcionários deste estúdio é mera necessidade orçamentária.', estilo: 'nota' }], ms: 3600 },
  { linhas: [{ texto: 'Agradecimentos especiais', estilo: 'cargo' }, { texto: 'Aos três cafés que tornaram este projeto possível. Dois não sobreviveram.', estilo: 'nota' }], ms: 3600 },
  {
    apagao: true,
    linhas: [
      { texto: 'A música parou.', estilo: 'aviso' },
      { texto: `O responsável pelo áudio (${AUTOR}) foi chamado para resolver um problema de programação.`, estilo: 'aviso' },
    ],
    ms: 3800,
  },
  { linhas: [{ texto: 'Equipe de 200 profissionais', estilo: 'nota' }], ms: 1800 },
  { linhas: [{ texto: 'Pequena correção nos créditos', estilo: 'aviso' }, { texto: 'Equipe de 1 profissional', estilo: 'nota' }], ms: 2600 },
  { linhas: [], ms: 1800 },
  { linhas: [{ texto: 'Estagiário', estilo: 'cargo' }, { texto: AUTOR, estilo: 'nome' }], ms: 3000 },
  { linhas: [{ texto: 'Conquista desbloqueada:', estilo: 'aviso' }, { texto: 'fez o trabalho de um estúdio inteiro.', estilo: 'nota' }], ms: 3000 },
  cargo('Responsável por terminar os créditos', undefined, 2800),

  // Agradecimentos: a parte sincera (a maior parte do roteiro é de humor)
  {
    linhas: [
      { texto: 'Agradecimentos', estilo: 'titulo' },
      { texto: 'A todos que tornaram este sonho possível.', estilo: 'nota' },
      { texto: 'À família, aos amigos, aos jogadores e a todos que acreditaram no projeto.', estilo: 'nota' },
    ],
    ms: 4800,
  },
  { linhas: [{ texto: 'À equipe de desenvolvimento:', estilo: 'cargo' }, { texto: 'Você.', estilo: 'nome' }, { texto: 'Obrigado por não desistir.', estilo: 'nota' }], ms: 3800 },

  // Último cartão: tela preta, fica até o jogador continuar
  {
    apagao: true,
    linhas: [
      { texto: 'AURENTHAL 2 — EM DESENVOLVIMENTO.', estilo: 'titulo' },
      { texto: 'Desenvolvedor adicional: ainda não encontrado.', estilo: 'nota' },
    ],
    ms: 0,
  },
];
