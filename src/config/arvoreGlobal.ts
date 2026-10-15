import type { AttrKey } from '../core/progression/attributes';
import type { HeroKind } from '../core/progression/skills';

/**
 * ÁRVORE GLOBAL DE PROGRESSÃO (protótipo). Uma árvore só para todos os heróis e para o Bastião.
 * 111 nós em seis categorias (progressão geral, campanha, bastião, combate, masteries e ligação).
 * Cada Mastery tática vai para UM personagem e fica com ele, mesmo fora da party.
 *
 * Dados aqui; regras em core/progression/arvore.ts; efeitos de Mastery em core/sim/masteryRules.ts;
 * tela em ui/ArvoreGlobal.ts. Ids em camelCase (vão para o save: não renomear depois de publicado).
 *
 * Todo bônus de economia tem valor AQUI e um teto (ARVORE_ECONOMIA.teto): a soma dos nós nunca passa do teto.
 * Bônus de combate usam só os atributos e as passivas que o jogo já tem (ARVORE_CAPS_COMBATE).
 */

/** Custo de abrir um nó, em Zen do banco, por tipo de nó. Ponto único de decisão: custoDoNo lê daqui. */
export const CUSTO_ZEN_POR_TIPO: Record<NoTipo, number> = { raiz: 0, comum: 100, notavel: 250, caminho: 100, mastery: 150 };

/** Pontos da árvore: só o que não é Zen (a moeda da árvore é o Zen do banco, no meta). */
export const ARVORE_CONFIG = {
  /** Atribuir ou trocar uma Mastery de personagem (preço fixo, em Zen do banco). */
  atribuirZen: 60,
  /** Reorganizar a árvore inteira (Zen do banco): base × (1 + reorganizações anteriores). */
  reorganizarZen: 80,
  /** Quantas Masteries um mesmo personagem pode carregar. */
  maxMasteriesPorHeroi: 1,
  /** Quantidade mínima de nós da árvore (pedido do dono: pelo menos 100). */
  minNos: 100,
};

/**
 * Banco de Zen (no meta): crédito EXTRA, que não tira Zen da jornada nem da carteira do Bastião. Paga a árvore.
 * Campanha: % do Zen ganho na jornada, pelo desfecho (vitória, derrota ou abandono).
 * Bastião: % do Zen ganho em cada bloco COMPLETO de `noitesPorBloco` noites numa tentativa (derrota no meio não paga).
 */
export const ARVORE_BANCO = {
  campanha: { vitoria: 0.5, derrota: 0.25, abandono: 0 },
  bastiao: { noitesPorBloco: 20, pct: 0.3 },
};

// ---------------- categorias (filtro da tela) ----------------

export type Categoria = 'progressao' | 'campanha' | 'bastiao' | 'combate' | 'masteries' | 'ligacao';
export const CATEGORIAS: Record<Categoria, { nome: string; descricao: string }> = {
  progressao: { nome: 'Progressão geral', descricao: 'EXP, Zen por tipo de nó, pontos de habilidade, recrutas e descontos. Valem para todos.' },
  campanha: { nome: 'Campanha', descricao: 'Eventos, reparo e preço da cidade, e recursos dos nós do mapa.' },
  bastiao: { nome: 'Bastião', descricao: 'Construção, reparo, muralha e Zen por noite.' },
  combate: { nome: 'Combate geral', descricao: 'Vida, dano, velocidade de ataque, crítico, esquiva e atributos.' },
  masteries: { nome: 'Masteries táticas', descricao: 'Pontos que desbloqueiam as Masteries (uma por personagem).' },
  ligacao: { nome: 'Notáveis e caminhos', descricao: 'Notáveis e caminhos alternativos que ligam as regiões.' },
};
export const CATEGORIA_IDS = Object.keys(CATEGORIAS) as Categoria[];

// ---------------- bônus ----------------

/** Atributos do jogo (somam como o equipamento). */
export type AtributoKey = AttrKey;
/** Passivas derivadas (somam como as da vocação; crítico e dano crítico são separados). */
export type PassivaKey = 'hp' | 'dmg' | 'block' | 'dodge' | 'crit' | 'critDano' | 'haste' | 'reduce';
/** Bônus de economia: lidos por core/progression/arvore.ts (economiaDoPerfil) e aplicados onde cada um está ligado. */
export type EcoKey =
  | 'expCombate' | 'almasCombate' | 'zeniHorda' | 'zeniElite' | 'zeniChefe' | 'zeniSobrevivencia' | 'zeniEvento' | 'zeniCidade'
  | 'pontosHabilidade' | 'recrutas' | 'descontoCidade' | 'reparoCidade' | 'recompensaCidade' | 'sorteLoja' | 'eventoEscolha'
  | 'custoConstrucao' | 'reparoBastiao' | 'muralhaVida' | 'portaoVida' | 'zenNoite' | 'blocosConstrucao' | 'limitePecas';
export type BonusKey = AtributoKey | PassivaKey | EcoKey;
export type Bonus = Partial<Record<BonusKey, number>>;

export const ECO_KEYS = [
  'expCombate', 'almasCombate', 'zeniHorda', 'zeniElite', 'zeniChefe', 'zeniSobrevivencia', 'zeniEvento', 'zeniCidade',
  'pontosHabilidade', 'recrutas', 'descontoCidade', 'reparoCidade', 'recompensaCidade', 'sorteLoja', 'eventoEscolha',
  'custoConstrucao', 'reparoBastiao', 'muralhaVida', 'portaoVida', 'zenNoite', 'blocosConstrucao', 'limitePecas',
] as const satisfies readonly EcoKey[];
export const PASSIVA_KEYS = ['hp', 'dmg', 'block', 'dodge', 'crit', 'critDano', 'haste', 'reduce'] as const satisfies readonly PassivaKey[];

/**
 * Economia: cada bônus tem teto (a soma dos nós nunca passa dele). `ligado: false` = o valor já é lido
 * pela árvore, mas o jogo ainda não tem o gancho (motivo em `motivo`). Não entra em nenhuma regra até ligar.
 * `unidade`: 'percent' (fração, 0,05 = 5%) ou 'pontos' (inteiro somado).
 */
export const ARVORE_ECONOMIA: Record<EcoKey, { nome: string; unidade: 'percent' | 'pontos'; teto: number; ligado: boolean; motivo?: string }> = {
  expCombate: { nome: 'EXP em combate', unidade: 'percent', teto: 0.3, ligado: true },
  almasCombate: { nome: 'almas em combate', unidade: 'percent', teto: 0.25, ligado: true },
  zeniHorda: { nome: 'Zen das hordas', unidade: 'percent', teto: 0.25, ligado: true },
  zeniElite: { nome: 'Zen dos elites', unidade: 'percent', teto: 0.25, ligado: true },
  zeniChefe: { nome: 'Zen dos chefes', unidade: 'percent', teto: 0.25, ligado: true },
  zeniSobrevivencia: { nome: 'Zen da sobrevivência', unidade: 'percent', teto: 0.25, ligado: true },
  zeniEvento: { nome: 'Zen dos eventos', unidade: 'percent', teto: 0.2, ligado: true },
  zeniCidade: { nome: 'Zen da cidade', unidade: 'percent', teto: 0.2, ligado: false, motivo: 'a cidade não paga Zen hoje; falta definir a fonte' },
  pontosHabilidade: { nome: 'pontos de habilidade por nível', unidade: 'pontos', teto: 1, ligado: true },
  recrutas: { nome: 'níveis extras ao recrutar', unidade: 'pontos', teto: 3, ligado: true },
  descontoCidade: { nome: 'desconto nas cidades', unidade: 'percent', teto: 0.2, ligado: true },
  reparoCidade: { nome: 'desconto no reparo da muralha', unidade: 'percent', teto: 0.25, ligado: true },
  recompensaCidade: { nome: 'recompensa da cidade', unidade: 'percent', teto: 0.2, ligado: false, motivo: 'os serviços da cidade não têm recompensa variável para aumentar' },
  sorteLoja: { nome: 'itens extras na loja', unidade: 'pontos', teto: 2, ligado: true },
  eventoEscolha: { nome: 'escolhas extras em eventos', unidade: 'pontos', teto: 2, ligado: false, motivo: 'cada evento tem opções fixas (world.ts); falta um modelo de escolha extra' },
  custoConstrucao: { nome: 'desconto na construção do bastião', unidade: 'percent', teto: 0.25, ligado: true },
  reparoBastiao: { nome: 'desconto no reparo do bastião', unidade: 'percent', teto: 0.3, ligado: true },
  muralhaVida: { nome: 'vida da muralha', unidade: 'percent', teto: 0.3, ligado: true },
  portaoVida: { nome: 'vida do portão', unidade: 'percent', teto: 0.3, ligado: false, motivo: 'o portão ainda não existe como estrutura do Bastião' },
  zenNoite: { nome: 'Zen por noite vencida', unidade: 'pontos', teto: 20, ligado: true },
  blocosConstrucao: { nome: 'blocos de construção', unidade: 'pontos', teto: 3, ligado: false, motivo: 'o Bastião tem só muralha e torre; blocos novos são conteúdo a desenhar' },
  limitePecas: { nome: 'peças por tipo', unidade: 'pontos', teto: 4, ligado: false, motivo: 'o Bastião ainda não tem limite de peças para aumentar' },
};

/** Tetos dos bônus de combate (somados por herói; passam pelo teto antes de ir ao cálculo de status). */
export const ARVORE_CAPS_COMBATE: Record<PassivaKey, number> = {
  hp: 0.3, dmg: 0.3, haste: 0.3, crit: 0.25, critDano: 0.5, dodge: 0.15, block: 0.15, reduce: 0.2,
};
/** Teto de cada atributo somado pelos nós (pontos acima da base). */
export const ARVORE_CAP_ATRIBUTO = 6;

export type NoTipo = 'raiz' | 'comum' | 'notavel' | 'caminho' | 'mastery';
export const TIPO_NO_LABEL: Record<NoTipo, string> = {
  raiz: 'Núcleo',
  comum: 'Comum',
  notavel: 'Notável',
  caminho: 'Caminho alternativo',
  mastery: 'Ponto de Mastery',
};

/** Quem recebe o bônus de um nó: todos os heróis ou uma lista. */
export type Compat = 'todos' | HeroKind[];

export interface NoDef {
  id: string;
  nome: string;
  tipo: NoTipo;
  categoria: Categoria;
  regiao: string;
  /** Posição na rede (unidades de grade; a tela escala por ARVORE_VISUAL.espaco). */
  x: number;
  y: number;
  descricao: string;
  bonus: Bonus;
  para: Compat;
  /** Só nós `mastery`: a Mastery que este ponto desbloqueia. */
  mastery?: MasteryId;
}

export interface RegiaoDef {
  id: string;
  nome: string;
  descricao: string;
  cor: string;
}

export const REGIOES: Record<string, RegiaoDef> = {
  nucleo: { id: 'nucleo', nome: 'Coração de Aurenthal', descricao: 'Onde toda linha de progressão começa.', cor: '#d9b45a' },
  muralha: { id: 'muralha', nome: 'Muralha Férrea', descricao: 'Vida, bloqueio e quem segura a linha.', cor: '#8fa3b8' },
  chamas: { id: 'chamas', nome: 'Campos Ígneos', descricao: 'Inteligência e dano das magias.', cor: '#d9774a' },
  ermos: { id: 'ermos', nome: 'Ermos da Flecha', descricao: 'Destreza, precisão e controle do campo.', cor: '#7fb88a' },
  sombra: { id: 'sombra', nome: 'Véu Sombrio', descricao: 'Sorte, crítico, esquiva e execução.', cor: '#9a7ad9' },
  cidades: { id: 'cidades', nome: 'Estradas e Cidades', descricao: 'Comércio, eventos, reparo e recursos do mapa.', cor: '#e0b070' },
  bastiao: { id: 'bastiao', nome: 'Fortaleza do Bastião', descricao: 'Construção, muralha e noites de defesa.', cor: '#b8a58a' },
  fronteira: { id: 'fronteira', nome: 'Fronteira das Regiões', descricao: 'Notáveis e caminhos que ligam as escolas e as categorias.', cor: '#6aa8ff' },
};

export const REGIAO_IDS = Object.keys(REGIOES);

/** Visual da rede (a tela lê; nada disto muda regra). */
export const ARVORE_VISUAL = {
  /** Unidades de viewBox por unidade de grade. */
  espaco: 92,
};

// ---------------- Masteries táticas ----------------

export type FamiliaId = 'destruicao' | 'controle' | 'protecao' | 'execucao' | 'mobilidade' | 'sinergia';
export const FAMILIAS: { id: FamiliaId; nome: string }[] = [
  { id: 'destruicao', nome: 'Destruição e ruptura' },
  { id: 'controle', nome: 'Controle de terreno' },
  { id: 'protecao', nome: 'Proteção e contenção' },
  { id: 'execucao', nome: 'Execução e vulnerabilidade' },
  { id: 'mobilidade', nome: 'Mobilidade e reposicionamento' },
  { id: 'sinergia', nome: 'Sinergia de equipe' },
];

export type MasteryId =
  | 'barreiraDeContencao' | 'golpeDeMisericordia' | 'pressaoTatica'
  | 'golpeRompedor' | 'estilhaco' | 'golpeCiclico'
  | 'marcaMortal' | 'frioCortante'
  | 'lentidaoGolpe' | 'atordoamento'
  | 'curaEmergencia' | 'espinhos'
  | 'recuoTatico' | 'avancoAbate' | 'recuoAbate'
  | 'bencaoEquipe' | 'escudoAliado' | 'curaColetiva';

/**
 * Regra de combate de uma Mastery (dados). A simulação interpreta em core/sim/masteryRules.ts.
 * Valores em fração (0,3 = 30%) e segundos (convertidos em ticks pelo motor).
 */
export type MasteryRegra =
  | { tipo: 'escudoReativo'; limiar: number; pct: number; sec: number }
  | { tipo: 'execucao'; limiar: number; bonus: number }
  | { tipo: 'empurrao'; chance: number; passos: number }
  | { tipo: 'bonusContraPesado'; pct: number }
  | { tipo: 'estilhaco'; chance: number; pct: number }
  | { tipo: 'golpeCiclico'; a: number; pct: number }
  | { tipo: 'marca'; chance: number; amp: number; sec: number }
  | { tipo: 'frio'; chance: number; sec: number }
  | { tipo: 'lentidao'; chance: number; mult: number; sec: number }
  | { tipo: 'atordoar'; chance: number; sec: number }
  | { tipo: 'curaReativa'; limiar: number; pct: number }
  | { tipo: 'espinhos'; pct: number }
  | { tipo: 'recuoSofrido'; chance: number; passos: number }
  | { tipo: 'avancoAbate'; passos: number }
  | { tipo: 'recuoAbate'; passos: number }
  | { tipo: 'bencaoEquipe'; amp: number; sec: number }
  | { tipo: 'escudoAliado'; pct: number; sec: number }
  | { tipo: 'curaColetiva'; pct: number };

/** Inimigos pesados (para a Mastery de dano contra pesados): comuns pesados, elites e todos os chefes. */
export const INIMIGOS_PESADOS: string[] = ['brute', 'raydric', 'elite', 'detarderus', 'dinoBoss', 'goblinWarlord', 'goblinLeader', 'boss', 'boss2', 'orcboss', 'satanMorroc'];

export interface MasteryDef {
  id: MasteryId;
  familia: FamiliaId;
  nome: string;
  identidade: string;
  efeito: string;
  noRequerido: string;
  nivelMin: number;
  elegiveis: HeroKind[];
  regra: MasteryRegra;
}

const MELEE: HeroKind[] = ['warrior', 'assassin'];
const RANGED: HeroKind[] = ['archer', 'mage', 'sorcerer', 'warlock'];

export const MASTERIES: MasteryDef[] = [
  // ---- Proteção e contenção ----
  { id: 'barreiraDeContencao', familia: 'protecao', nome: 'Barreira de Contenção', identidade: 'Quem segura a linha não cai de primeira.', efeito: 'Na primeira vez que a vida cai abaixo de 30% numa batalha, ganha um escudo de 20% da vida máxima por 4 segundos.', noRequerido: 'pontoBarreira', nivelMin: 3, elegiveis: ['warrior', 'warlock'], regra: { tipo: 'escudoReativo', limiar: 0.3, pct: 0.2, sec: 4 } },
  { id: 'curaEmergencia', familia: 'protecao', nome: 'Cura de Emergência', identidade: 'Uma última chance de voltar do limite.', efeito: 'Na primeira vez que a vida cai abaixo de 25% numa batalha, recupera 30% da vida máxima.', noRequerido: 'pt_curaEmergencia', nivelMin: 3, elegiveis: ['mage', 'sorcerer', 'warlock'], regra: { tipo: 'curaReativa', limiar: 0.25, pct: 0.3 } },
  { id: 'espinhos', familia: 'protecao', nome: 'Espinhos', identidade: 'Quem bate no herói se machuca também.', efeito: 'Devolve 15% do dano recebido por golpes diretos a quem bateu (não vale para dano contínuo).', noRequerido: 'pt_espinhos', nivelMin: 2, elegiveis: MELEE, regra: { tipo: 'espinhos', pct: 0.15 } },
  // ---- Execução e vulnerabilidade ----
  { id: 'golpeDeMisericordia', familia: 'execucao', nome: 'Golpe de Misericórdia', identidade: 'Feridos não têm para onde fugir.', efeito: 'Os golpes causam 35% a mais de dano em inimigos com até 30% da vida.', noRequerido: 'pontoMisericordia', nivelMin: 3, elegiveis: ['archer', 'assassin'], regra: { tipo: 'execucao', limiar: 0.3, bonus: 0.35 } },
  { id: 'marcaMortal', familia: 'execucao', nome: 'Marca Mortal', identidade: 'O alvo marcado sente cada golpe a mais.', efeito: 'Cada golpe tem 30% de chance de marcar o inimigo por 3 segundos: ele recebe 25% a mais de dano.', noRequerido: 'pt_marcaMortal', nivelMin: 3, elegiveis: ['archer', 'sorcerer', 'warlock'], regra: { tipo: 'marca', chance: 0.3, amp: 0.25, sec: 3 } },
  { id: 'frioCortante', familia: 'execucao', nome: 'Frio Cortante', identidade: 'Gelo que deixa a carne mais fraca.', efeito: 'Cada golpe tem 30% de chance de congelar o inimigo por 3 segundos: ele recebe mais dano de todas as fontes.', noRequerido: 'pt_frioCortante', nivelMin: 3, elegiveis: ['mage', 'sorcerer'], regra: { tipo: 'frio', chance: 0.3, sec: 3 } },
  // ---- Controle de terreno ----
  { id: 'pressaoTatica', familia: 'controle', nome: 'Pressão Tática', identidade: 'Cada golpe corpo a corpo abre espaço na linha.', efeito: 'Golpes corpo a corpo têm 25% de chance de empurrar o inimigo uma casa para trás.', noRequerido: 'pontoPressao', nivelMin: 2, elegiveis: ['warrior', 'assassin'], regra: { tipo: 'empurrao', chance: 0.25, passos: 1 } },
  { id: 'lentidaoGolpe', familia: 'controle', nome: 'Lentidão de Golpe', identidade: 'O inimigo atingido perde o passo.', efeito: 'Golpes têm 30% de chance de deixar o inimigo lento por 2 segundos: ele anda até duas vezes mais devagar.', noRequerido: 'pt_lentidaoGolpe', nivelMin: 2, elegiveis: ['warrior', 'mage', 'sorcerer'], regra: { tipo: 'lentidao', chance: 0.3, mult: 2, sec: 2 } },
  { id: 'atordoamento', familia: 'controle', nome: 'Atordoamento', identidade: 'Um golpe bem dado tira o inimigo do ar.', efeito: 'Golpes corpo a corpo têm 20% de chance de atordoar o inimigo por 1 segundo (ele para de agir).', noRequerido: 'pt_atordoamento', nivelMin: 4, elegiveis: ['warrior', 'assassin'], regra: { tipo: 'atordoar', chance: 0.2, sec: 1 } },
  // ---- Destruição e ruptura ----
  { id: 'golpeRompedor', familia: 'destruicao', nome: 'Golpe Rompedor', identidade: 'Contra o que é grande, cada golpe pesa mais.', efeito: 'Causa 35% a mais de dano em inimigos pesados (brutamontes, elites e chefes).', noRequerido: 'pt_golpeRompedor', nivelMin: 3, elegiveis: MELEE, regra: { tipo: 'bonusContraPesado', pct: 0.35 } },
  { id: 'estilhaco', familia: 'destruicao', nome: 'Estilhaço', identidade: 'O golpe racha o chão e pega quem está perto.', efeito: 'Cada golpe corpo a corpo tem 50% de chance de causar 30% do dano aos inimigos vizinhos do alvo.', noRequerido: 'pt_estilhaco', nivelMin: 3, elegiveis: MELEE, regra: { tipo: 'estilhaco', chance: 0.5, pct: 0.3 } },
  { id: 'golpeCiclico', familia: 'destruicao', nome: 'Golpe Cíclico', identidade: 'A cada quatro golpes, o quarto vem com força total.', efeito: 'A cada quarto golpe corpo a corpo, o dano sobe 80%.', noRequerido: 'pt_golpeCiclico', nivelMin: 4, elegiveis: MELEE, regra: { tipo: 'golpeCiclico', a: 4, pct: 0.8 } },
  // ---- Mobilidade e reposicionamento ----
  { id: 'recuoTatico', familia: 'mobilidade', nome: 'Recuo Tático', identidade: 'Apanhar também é uma forma de sair do lugar.', efeito: 'Quando um inimigo corpo a corpo acerta o herói, há 30% de chance de ele recuar uma casa.', noRequerido: 'pt_recuoTatico', nivelMin: 2, elegiveis: MELEE, regra: { tipo: 'recuoSofrido', chance: 0.3, passos: 1 } },
  { id: 'avancoAbate', familia: 'mobilidade', nome: 'Avanço ao Abate', identidade: 'Depois de uma vitória, o herói parte para o próximo.', efeito: 'Ao abater um inimigo, o herói avança até duas casas em direção ao inimigo mais próximo.', noRequerido: 'pt_avancoAbate', nivelMin: 3, elegiveis: MELEE, regra: { tipo: 'avancoAbate', passos: 2 } },
  { id: 'recuoAbate', familia: 'mobilidade', nome: 'Recuo ao Abate', identidade: 'Quem atira recua antes que alguém chegue.', efeito: 'Ao abater um inimigo, o herói recua uma casa para longe dele.', noRequerido: 'pt_recuoAbate', nivelMin: 2, elegiveis: RANGED, regra: { tipo: 'recuoAbate', passos: 1 } },
  // ---- Sinergia de equipe ----
  { id: 'bencaoEquipe', familia: 'sinergia', nome: 'Bênção da Equipe', identidade: 'Cada abate abençoa a party inteira.', efeito: 'Ao abater um inimigo, toda a party causa 10% a mais de dano por 4 segundos.', noRequerido: 'pt_bencaoEquipe', nivelMin: 4, elegiveis: RANGED, regra: { tipo: 'bencaoEquipe', amp: 0.1, sec: 4 } },
  { id: 'escudoAliado', familia: 'sinergia', nome: 'Escudo Aliado', identidade: 'O herói protege o aliado mais ferido.', efeito: 'Ao abater um inimigo, o aliado com menos vida ganha um escudo de 15% da vida máxima por 4 segundos.', noRequerido: 'pt_escudoAliado', nivelMin: 3, elegiveis: ['mage', 'sorcerer'], regra: { tipo: 'escudoAliado', pct: 0.15, sec: 4 } },
  { id: 'curaColetiva', familia: 'sinergia', nome: 'Cura Coletiva', identidade: 'A vitória cura quem ficou de pé.', efeito: 'Ao abater um inimigo, toda a party viva recupera 5% da vida máxima.', noRequerido: 'pt_curaColetiva', nivelMin: 4, elegiveis: ['mage', 'sorcerer', 'warlock'], regra: { tipo: 'curaColetiva', pct: 0.05 } },
];

// ---------------- nós ----------------

/** Ponto de partida da árvore (única raiz). */
const RAIZ: NoDef = { id: 'nucleo', nome: 'Núcleo de Aurenthal', tipo: 'raiz', categoria: 'progressao', regiao: 'nucleo', x: 0, y: 0, descricao: 'Ponto de partida. Todos os caminhos saem daqui.', bonus: {}, para: 'todos' };

/** Nós desenhados à mão (região central): mantêm os ids de saves do protótipo anterior. */
const EXPLICITOS: NoDef[] = [
  { id: 'vigorDoReino', nome: 'Vigor do Reino', tipo: 'comum', categoria: 'combate', regiao: 'muralha', x: -1, y: -1, descricao: '+1 de Vitalidade para todos.', bonus: { vit: 1 }, para: 'todos' },
  { id: 'escudoAntigo', nome: 'Escudo Antigo', tipo: 'comum', categoria: 'combate', regiao: 'muralha', x: -2, y: -2, descricao: '+2% de chance de bloqueio para o Guerreiro.', bonus: { block: 0.02 }, para: ['warrior'] },
  { id: 'pontoBarreira', nome: 'Ponto de Barreira', tipo: 'mastery', categoria: 'masteries', regiao: 'muralha', x: -3, y: -2, descricao: 'Desbloqueia a Mastery Barreira de Contenção.', bonus: {}, para: 'todos', mastery: 'barreiraDeContencao' },
  { id: 'muralhaViva', nome: 'Muralha Viva', tipo: 'notavel', categoria: 'combate', regiao: 'muralha', x: -3, y: -1, descricao: '+2 de Vitalidade e +6% de vida máxima para Guerreiro e Bruxa.', bonus: { vit: 2, hp: 0.06 }, para: ['warrior', 'warlock'] },
  { id: 'caminhoDaMuralha', nome: 'Caminho da Muralha', tipo: 'caminho', categoria: 'ligacao', regiao: 'muralha', x: -2, y: -1, descricao: '−2% de dano recebido. Liga o Vigor ao notável Muralha Viva por outra rota.', bonus: { reduce: 0.02 }, para: 'todos' },
  { id: 'chamaAntiga', nome: 'Chama Antiga', tipo: 'comum', categoria: 'combate', regiao: 'chamas', x: 1, y: -1, descricao: '+1 de Inteligência para Mago, Feiticeira e Bruxa.', bonus: { int: 1 }, para: ['mage', 'sorcerer', 'warlock'] },
  { id: 'fogoInterior', nome: 'Fogo Interior', tipo: 'comum', categoria: 'combate', regiao: 'chamas', x: 2, y: -2, descricao: '+3% de dano causado para magos.', bonus: { dmg: 0.03 }, para: ['mage', 'sorcerer', 'warlock'] },
  { id: 'brasaEterna', nome: 'Brasa Eterna', tipo: 'notavel', categoria: 'combate', regiao: 'chamas', x: 3, y: -2, descricao: '+2 de Inteligência e +6% de dano para Feiticeira e Bruxa.', bonus: { int: 2, dmg: 0.06 }, para: ['sorcerer', 'warlock'] },
  { id: 'caminhoDaBrasa', nome: 'Caminho da Brasa', tipo: 'caminho', categoria: 'ligacao', regiao: 'chamas', x: 2, y: -1, descricao: '+2% de Skill Haste para magos. Liga a Chama Antiga à Brasa Eterna por outra rota.', bonus: { haste: 0.02 }, para: ['mage', 'sorcerer', 'warlock'] },
  { id: 'passoDoVento', nome: 'Passo do Vento', tipo: 'comum', categoria: 'combate', regiao: 'ermos', x: 1, y: 1, descricao: '+1 de Destreza para Arqueira e Assassino.', bonus: { dex: 1 }, para: ['archer', 'assassin'] },
  { id: 'pontoMisericordia', nome: 'Ponto de Misericórdia', tipo: 'mastery', categoria: 'masteries', regiao: 'ermos', x: 2, y: 1, descricao: 'Desbloqueia a Mastery Golpe de Misericórdia.', bonus: {}, para: 'todos', mastery: 'golpeDeMisericordia' },
  { id: 'flechaFirme', nome: 'Flecha Firme', tipo: 'comum', categoria: 'combate', regiao: 'ermos', x: 2, y: 2, descricao: '+3% de dano causado para a Arqueira.', bonus: { dmg: 0.03 }, para: ['archer'] },
  { id: 'olhoDeFalcao', nome: 'Olho de Falcão', tipo: 'notavel', categoria: 'combate', regiao: 'ermos', x: 3, y: 2, descricao: '+2 de Destreza e +3% de crítico para Arqueira e Assassino.', bonus: { dex: 2, crit: 0.03 }, para: ['archer', 'assassin'] },
  { id: 'caminhoDoArco', nome: 'Caminho do Arco', tipo: 'caminho', categoria: 'ligacao', regiao: 'ermos', x: 2, y: 0, descricao: '+1 de Sorte para Arqueira e Assassino. Liga o Passo do Vento ao Olho de Falcão por outra rota.', bonus: { luk: 1 }, para: ['archer', 'assassin'] },
  { id: 'sortePeregrina', nome: 'Sorte Peregrina', tipo: 'comum', categoria: 'combate', regiao: 'sombra', x: -1, y: 1, descricao: '+1 de Sorte para todos.', bonus: { luk: 1 }, para: 'todos' },
  { id: 'pontoPressao', nome: 'Ponto de Pressão', tipo: 'mastery', categoria: 'masteries', regiao: 'sombra', x: -2, y: 1, descricao: 'Desbloqueia a Mastery Pressão Tática.', bonus: {}, para: 'todos', mastery: 'pressaoTatica' },
  { id: 'golpeFurtivo', nome: 'Golpe Furtivo', tipo: 'comum', categoria: 'combate', regiao: 'sombra', x: -2, y: 2, descricao: '+2% de crítico para Assassino, Arqueira e Bruxa.', bonus: { crit: 0.02 }, para: ['assassin', 'archer', 'warlock'] },
  { id: 'sombraProfunda', nome: 'Sombra Profunda', tipo: 'notavel', categoria: 'combate', regiao: 'sombra', x: -3, y: 2, descricao: '+2 de Sorte e +3% de esquiva para Assassino e Bruxa.', bonus: { luk: 2, dodge: 0.03 }, para: ['assassin', 'warlock'] },
];

/** Nós gerados (a tabela abaixo). `c` categoria; `t` tipo (padrão: comum; `notavel`, `caminho` ou `mastery` quando marcado); `b` bônus; `m` Mastery; `l` ligação entre dois nós. O custo em Zen vem do tipo (CUSTO_ZEN_POR_TIPO). */
interface Entrada {
  id: string;
  n: string;
  c: Categoria;
  r: string;
  d: string;
  b: Bonus;
  t?: NoTipo;
  p?: Compat;
  m?: MasteryId;
  l?: [string, string];
}

const E = (e: Entrada): Entrada => e;

const GERADOS: Entrada[] = [
  // ---- Progressão geral (20) ----
  E({ id: 'estudoDeCampo', n: 'Estudo de Campo', c: 'progressao', r: 'nucleo', d: '+3% de EXP em combate.', b: { expCombate: 0.03 } }),
  E({ id: 'aprendizadoRapido', n: 'Aprendizado Rápido', c: 'progressao', r: 'nucleo', d: '+3% de EXP em combate.', b: { expCombate: 0.03 } }),
  E({ id: 'mestreDaEstrada', n: 'Mestre da Estrada', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+5% de EXP em combate.', b: { expCombate: 0.05 } }),
  E({ id: 'hordaLucrativa', n: 'Horda Lucrativa', c: 'progressao', r: 'nucleo', d: '+4% de Zen nas hordas.', b: { zeniHorda: 0.04 } }),
  E({ id: 'cacadorDeElites', n: 'Caçador de Elites', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+5% de Zen nos elites.', b: { zeniElite: 0.05 } }),
  E({ id: 'cacadorDeChefes', n: 'Caçador de Chefes', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+5% de Zen nos chefes.', b: { zeniChefe: 0.05 } }),
  E({ id: 'sobrevivente', n: 'Sobrevivente', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+5% de Zen na sobrevivência.', b: { zeniSobrevivencia: 0.05 } }),
  E({ id: 'bolsaCheia', n: 'Bolsa Cheia', c: 'progressao', r: 'nucleo', d: '+3% de Zen nas hordas.', b: { zeniHorda: 0.03 } }),
  E({ id: 'olhoDeMercador', n: 'Olho de Mercador', c: 'progressao', r: 'cidades', d: '−3% nos preços das cidades.', b: { descontoCidade: 0.03 } }),
  E({ id: 'barganha', n: 'Barganha', c: 'progressao', r: 'cidades', d: '−3% nos preços das cidades.', b: { descontoCidade: 0.03 } }),
  E({ id: 'negociadorVeterano', n: 'Negociador Veterano', c: 'progressao', r: 'cidades', t: 'notavel', d: '−4% nos preços das cidades.', b: { descontoCidade: 0.04 } }),
  E({ id: 'treinoAcelerado', n: 'Treino Acelerado', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+1 ponto de habilidade a cada nível (uma vez só).', b: { pontosHabilidade: 1 } }),
  E({ id: 'recrutaPromissor', n: 'Recruta Promissor', c: 'progressao', r: 'nucleo', t: 'notavel', d: 'Heróis recrutados entram com +1 nível.', b: { recrutas: 1 } }),
  E({ id: 'recrutamentoDeElite', n: 'Recrutamento de Elite', c: 'progressao', r: 'nucleo', t: 'notavel', d: 'Heróis recrutados entram com +1 nível.', b: { recrutas: 1 } }),
  E({ id: 'veteranoDeGuerra', n: 'Veterano de Guerra', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+4% de EXP em combate.', b: { expCombate: 0.04 } }),
  E({ id: 'caravana', n: 'Caravana', c: 'progressao', r: 'cidades', t: 'notavel', d: '+4% de Zen nas hordas.', b: { zeniHorda: 0.04 } }),
  E({ id: 'famaLocal', n: 'Fama Local', c: 'progressao', r: 'cidades', t: 'notavel', d: '+4% de Zen nos chefes.', b: { zeniChefe: 0.04 } }),
  E({ id: 'escutaAtenta', n: 'Escuta Atenta', c: 'progressao', r: 'nucleo', d: '+2% de EXP em combate.', b: { expCombate: 0.02 } }),
  E({ id: 'comercioJusto', n: 'Comércio Justo', c: 'progressao', r: 'cidades', d: '−2% nos preços das cidades.', b: { descontoCidade: 0.02 } }),
  E({ id: 'almaAntiga', n: 'Alma Antiga', c: 'progressao', r: 'nucleo', t: 'notavel', d: '+4% de almas em combate.', b: { almasCombate: 0.04 } }),
  // ---- Campanha (16) ----
  E({ id: 'veioDePrata', n: 'Veio de Prata', c: 'campanha', r: 'cidades', t: 'notavel', d: '+4% de almas em combate: um veio de prata nas estradas.', b: { almasCombate: 0.04 } }),
  E({ id: 'pergaminhoDeRota', n: 'Pergaminho de Rota', c: 'campanha', r: 'cidades', t: 'notavel', d: '+5% de Zen dos eventos: mapas de rota apontam os melhores pousos.', b: { zeniEvento: 0.05 } }),
  E({ id: 'reparoAgil', n: 'Reparo Ágil', c: 'campanha', r: 'cidades', d: '−5% no reparo da muralha.', b: { reparoCidade: 0.05 } }),
  E({ id: 'maosHabeis', n: 'Mãos Hábeis', c: 'campanha', r: 'cidades', t: 'notavel', d: '−5% no reparo da muralha.', b: { reparoCidade: 0.05 } }),
  E({ id: 'engenheiroDaMuralha', n: 'Engenheiro da Muralha', c: 'campanha', r: 'cidades', t: 'notavel', d: '−5% no reparo da muralha.', b: { reparoCidade: 0.05 } }),
  E({ id: 'maosDePedreiro', n: 'Mãos de Pedreiro', c: 'campanha', r: 'cidades', t: 'notavel', d: '−5% no reparo da muralha.', b: { reparoCidade: 0.05 } }),
  E({ id: 'fogueiraAmiga', n: 'Fogueira Amiga', c: 'campanha', r: 'cidades', t: 'notavel', d: '+4% de Zen na sobrevivência: a vila acolhe quem sobrevive.', b: { zeniSobrevivencia: 0.04 } }),
  E({ id: 'vitrineCheia', n: 'Vitrine Cheia', c: 'campanha', r: 'cidades', t: 'notavel', d: '+1 item na loja.', b: { sorteLoja: 1 } }),
  E({ id: 'mercadorViajante', n: 'Mercador Viajante', c: 'campanha', r: 'cidades', t: 'notavel', d: '+1 item na loja.', b: { sorteLoja: 1 } }),
  E({ id: 'feiraDeVila', n: 'Feira de Vila', c: 'campanha', r: 'cidades', t: 'notavel', d: '−4% nos preços das cidades.', b: { descontoCidade: 0.04 } }),
  E({ id: 'estradaSegura', n: 'Estrada Segura', c: 'campanha', r: 'cidades', t: 'notavel', d: '+5% de Zen dos eventos.', b: { zeniEvento: 0.05 } }),
  E({ id: 'sorteDeEvento', n: 'Sorte de Evento', c: 'campanha', r: 'cidades', t: 'notavel', d: '+5% de Zen dos eventos.', b: { zeniEvento: 0.05 } }),
  E({ id: 'noDeMinerio', n: 'Nó de Minério', c: 'campanha', r: 'cidades', d: '+3% de almas em combate: recurso do mapa.', b: { almasCombate: 0.03 } }),
  E({ id: 'noDeOracao', n: 'Nó de Oração', c: 'campanha', r: 'cidades', d: '+3% de almas em combate: recurso do mapa.', b: { almasCombate: 0.03 } }),
  E({ id: 'atalhoDeTropas', n: 'Atalho de Tropas', c: 'campanha', r: 'cidades', d: '+4% de Zen na sobrevivência.', b: { zeniSobrevivencia: 0.04 } }),
  E({ id: 'pocoDoViajante', n: 'Poço do Viajante', c: 'campanha', r: 'cidades', t: 'notavel', d: '+3% de almas em combate: água fresca para quem segue viagem.', b: { almasCombate: 0.03 } }),
  // ---- Bastião (16) ----
  E({ id: 'pedreiroDeOficio', n: 'Pedreiro de Ofício', c: 'bastiao', r: 'bastiao', d: '−4% no custo de construção.', b: { custoConstrucao: 0.04 } }),
  E({ id: 'canteiroDeObras', n: 'Canteiro de Obras', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−4% no custo de construção.', b: { custoConstrucao: 0.04 } }),
  E({ id: 'arquitetoDeMuralhas', n: 'Arquiteto de Muralhas', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−4% no custo de construção.', b: { custoConstrucao: 0.04 } }),
  E({ id: 'reparoDeCampo', n: 'Reparo de Campo', c: 'bastiao', r: 'bastiao', d: '−5% no reparo do bastião.', b: { reparoBastiao: 0.05 } }),
  E({ id: 'oficinaDeReparos', n: 'Oficina de Reparos', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−5% no reparo do bastião.', b: { reparoBastiao: 0.05 } }),
  E({ id: 'argamassaForte', n: 'Argamassa Forte', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+6% de vida da muralha.', b: { muralhaVida: 0.06 } }),
  E({ id: 'pedraMaciça', n: 'Pedra Maciça', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+6% de vida da muralha.', b: { muralhaVida: 0.06 } }),
  E({ id: 'alicerceProfundo', n: 'Alicerce Profundo', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+5% de vida da muralha.', b: { muralhaVida: 0.05 } }),
  E({ id: 'vigasDeCarvalho', n: 'Vigas de Carvalho', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−5% no reparo do bastião.', b: { reparoBastiao: 0.05 } }),
  E({ id: 'correnteDeFerro', n: 'Corrente de Ferro', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+5% de vida da muralha.', b: { muralhaVida: 0.05 } }),
  E({ id: 'soldoDaNoite', n: 'Soldo da Noite', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+5 de Zen por noite vencida.', b: { zenNoite: 5 } }),
  E({ id: 'vigiaNoturna', n: 'Vigia Noturna', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+5 de Zen por noite vencida.', b: { zenNoite: 5 } }),
  E({ id: 'rondaDaMadrugada', n: 'Ronda da Madrugada', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '+5 de Zen por noite vencida.', b: { zenNoite: 5 } }),
  E({ id: 'mestreDeObras', n: 'Mestre de Obras', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−5% no custo de construção.', b: { custoConstrucao: 0.05 } }),
  E({ id: 'pedreiraProxima', n: 'Pedreira Próxima', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−5% no reparo do bastião.', b: { reparoBastiao: 0.05 } }),
  E({ id: 'carpinteiroVeterano', n: 'Carpinteiro Veterano', c: 'bastiao', r: 'bastiao', t: 'notavel', d: '−4% no custo de construção.', b: { custoConstrucao: 0.04 } }),
  // ---- Combate geral (13) ----
  E({ id: 'vigorAntigo', n: 'Vigor Antigo', c: 'combate', r: 'muralha', d: '+1 de Vitalidade para todos.', b: { vit: 1 } }),
  E({ id: 'bracoFirme', n: 'Braço Firme', c: 'combate', r: 'muralha', d: '+1 de Força para Guerreiro e Assassino.', b: { str: 1 }, p: ['warrior', 'assassin'] }),
  E({ id: 'menteClara', n: 'Mente Clara', c: 'combate', r: 'chamas', d: '+1 de Inteligência para Mago, Feiticeira e Bruxa.', b: { int: 1 }, p: ['mage', 'sorcerer', 'warlock'] }),
  E({ id: 'pesLeves', n: 'Pés Leves', c: 'combate', r: 'ermos', d: '+1 de Destreza para Arqueira e Assassino.', b: { dex: 1 }, p: ['archer', 'assassin'] }),
  E({ id: 'sorteDoViajante', n: 'Sorte do Viajante', c: 'combate', r: 'sombra', d: '+1 de Sorte para todos.', b: { luk: 1 } }),
  E({ id: 'couroCurtido', n: 'Couro Curtido', c: 'combate', r: 'muralha', t: 'notavel', d: '+4% de vida máxima para todos.', b: { hp: 0.04 } }),
  E({ id: 'golpeCerteiro', n: 'Golpe Certeiro', c: 'combate', r: 'chamas', t: 'notavel', d: '+3% de dano para todos.', b: { dmg: 0.03 } }),
  E({ id: 'ritmoDeBatalha', n: 'Ritmo de Batalha', c: 'combate', r: 'ermos', t: 'notavel', d: '+2% de Skill Haste (velocidade de ataque) para todos.', b: { haste: 0.02 } }),
  E({ id: 'laminaPrecisa', n: 'Lâmina Precisa', c: 'combate', r: 'sombra', t: 'notavel', d: '+8% de dano crítico para todos (separado da chance).', b: { critDano: 0.08 } }),
  E({ id: 'olharAtento', n: 'Olhar Atento', c: 'combate', r: 'sombra', d: '+2% de chance de crítico para todos.', b: { crit: 0.02 } }),
  E({ id: 'esquivaVeloz', n: 'Esquiva Veloz', c: 'combate', r: 'sombra', t: 'notavel', d: '+2% de chance de esquiva para todos.', b: { dodge: 0.02 } }),
  E({ id: 'escudoFirme', n: 'Escudo Firme', c: 'combate', r: 'muralha', t: 'notavel', d: '+2% de bloqueio para o Guerreiro.', b: { block: 0.02 }, p: ['warrior'] }),
  E({ id: 'peleDura', n: 'Pele Dura', c: 'combate', r: 'muralha', t: 'notavel', d: '−2% de dano recebido para todos.', b: { reduce: 0.02 } }),
  // ---- Masteries: pontos de desbloqueio (15) ----
  E({ id: 'pt_golpeRompedor', n: 'Ponto de Rompedor', c: 'masteries', r: 'chamas', d: 'Desbloqueia a Mastery Golpe Rompedor.', b: {}, t: 'mastery', m: 'golpeRompedor' }),
  E({ id: 'pt_estilhaco', n: 'Ponto de Estilhaço', c: 'masteries', r: 'chamas', d: 'Desbloqueia a Mastery Estilhaço.', b: {}, t: 'mastery', m: 'estilhaco' }),
  E({ id: 'pt_golpeCiclico', n: 'Ponto Cíclico', c: 'masteries', r: 'chamas', d: 'Desbloqueia a Mastery Golpe Cíclico.', b: {}, t: 'mastery', m: 'golpeCiclico' }),
  E({ id: 'pt_marcaMortal', n: 'Ponto de Marca', c: 'masteries', r: 'sombra', d: 'Desbloqueia a Mastery Marca Mortal.', b: {}, t: 'mastery', m: 'marcaMortal' }),
  E({ id: 'pt_frioCortante', n: 'Ponto de Gelo', c: 'masteries', r: 'sombra', d: 'Desbloqueia a Mastery Frio Cortante.', b: {}, t: 'mastery', m: 'frioCortante' }),
  E({ id: 'pt_lentidaoGolpe', n: 'Ponto de Lentidão', c: 'masteries', r: 'ermos', d: 'Desbloqueia a Mastery Lentidão de Golpe.', b: {}, t: 'mastery', m: 'lentidaoGolpe' }),
  E({ id: 'pt_atordoamento', n: 'Ponto de Atordoar', c: 'masteries', r: 'ermos', d: 'Desbloqueia a Mastery Atordoamento.', b: {}, t: 'mastery', m: 'atordoamento' }),
  E({ id: 'pt_curaEmergencia', n: 'Ponto de Cura', c: 'masteries', r: 'muralha', d: 'Desbloqueia a Mastery Cura de Emergência.', b: {}, t: 'mastery', m: 'curaEmergencia' }),
  E({ id: 'pt_espinhos', n: 'Ponto de Espinho', c: 'masteries', r: 'muralha', d: 'Desbloqueia a Mastery Espinhos.', b: {}, t: 'mastery', m: 'espinhos' }),
  E({ id: 'pt_recuoTatico', n: 'Ponto de Recuo', c: 'masteries', r: 'cidades', d: 'Desbloqueia a Mastery Recuo Tático.', b: {}, t: 'mastery', m: 'recuoTatico' }),
  E({ id: 'pt_avancoAbate', n: 'Ponto de Avanço', c: 'masteries', r: 'cidades', d: 'Desbloqueia a Mastery Avanço ao Abate.', b: {}, t: 'mastery', m: 'avancoAbate' }),
  E({ id: 'pt_recuoAbate', n: 'Ponto de Afastar', c: 'masteries', r: 'cidades', d: 'Desbloqueia a Mastery Recuo ao Abate.', b: {}, t: 'mastery', m: 'recuoAbate' }),
  E({ id: 'pt_bencaoEquipe', n: 'Ponto de Bênção', c: 'masteries', r: 'nucleo', d: 'Desbloqueia a Mastery Bênção da Equipe.', b: {}, t: 'mastery', m: 'bencaoEquipe' }),
  E({ id: 'pt_escudoAliado', n: 'Ponto de Escudo', c: 'masteries', r: 'nucleo', d: 'Desbloqueia a Mastery Escudo Aliado.', b: {}, t: 'mastery', m: 'escudoAliado' }),
  E({ id: 'pt_curaColetiva', n: 'Ponto de Cura Coletiva', c: 'masteries', r: 'nucleo', d: 'Desbloqueia a Mastery Cura Coletiva.', b: {}, t: 'mastery', m: 'curaColetiva' }),
  // ---- Notáveis e caminhos alternativos (12) ----
  E({ id: 'caminhoDoMercador', n: 'Caminho do Mercador', c: 'ligacao', r: 'fronteira', d: 'Liga o Olho de Mercador ao Reparo Ágil da cidade.', b: {}, t: 'caminho', l: ['olhoDeMercador', 'reparoAgil'] }),
  E({ id: 'caminhoDaEstrada', n: 'Caminho da Estrada', c: 'ligacao', r: 'fronteira', d: 'Liga o Estudo de Campo ao Vigor Antigo.', b: {}, t: 'caminho', l: ['estudoDeCampo', 'vigorAntigo'] }),
  E({ id: 'caminhoDaOficina', n: 'Caminho da Oficina', c: 'ligacao', r: 'fronteira', d: 'Liga o Reparo de Campo do Bastião às Mãos Hábeis da cidade.', b: {}, t: 'caminho', l: ['reparoDeCampo', 'maosHabeis'] }),
  E({ id: 'caminhoDoAlicerce', n: 'Caminho do Alicerce', c: 'ligacao', r: 'fronteira', d: 'Liga o Couro Curtido à Argamassa Forte.', b: {}, t: 'caminho', l: ['couroCurtido', 'argamassaForte'] }),
  E({ id: 'caminhoDaMente', n: 'Caminho da Mente', c: 'ligacao', r: 'fronteira', d: 'Liga o Treino Acelerado à Mente Clara.', b: {}, t: 'caminho', l: ['treinoAcelerado', 'menteClara'] }),
  E({ id: 'caminhoDoGolpe', n: 'Caminho do Golpe', c: 'ligacao', r: 'fronteira', d: 'Liga o Ponto de Rompedor ao Golpe Certeiro.', b: {}, t: 'caminho', l: ['pt_golpeRompedor', 'golpeCerteiro'] }),
  E({ id: 'caminhoDoOuro', n: 'Caminho do Ouro', c: 'ligacao', r: 'fronteira', d: 'Liga a Vitrine Cheia à Alma Antiga.', b: {}, t: 'caminho', l: ['vitrineCheia', 'almaAntiga'] }),
  E({ id: 'caminhoDaVila', n: 'Caminho da Vila', c: 'ligacao', r: 'fronteira', d: 'Liga a Feira de Vila à Horda Lucrativa.', b: {}, t: 'caminho', l: ['feiraDeVila', 'hordaLucrativa'] }),
  E({ id: 'caminhoDoSangue', n: 'Caminho do Sangue', c: 'ligacao', r: 'fronteira', d: 'Liga o Olhar Atento ao Ponto de Marca.', b: {}, t: 'caminho', l: ['olharAtento', 'pt_marcaMortal'] }),
  E({ id: 'caminhoDaNoite', n: 'Caminho da Noite', c: 'ligacao', r: 'fronteira', d: 'Liga o Soldo da Noite ao Sobrevivente.', b: {}, t: 'caminho', l: ['soldoDaNoite', 'sobrevivente'] }),
  E({ id: 'caminhoDoEscudo', n: 'Caminho do Escudo', c: 'ligacao', r: 'fronteira', d: 'Liga o Ponto de Escudo ao Recrutas Promissor.', b: {}, t: 'caminho', l: ['pt_escudoAliado', 'recrutaPromissor'] }),
  E({ id: 'caminhoDaEstrela', n: 'Caminho da Estrela', c: 'ligacao', r: 'fronteira', d: 'Liga o Ponto de Bênção ao Recrutamento de Elite.', b: {}, t: 'caminho', l: ['pt_bencaoEquipe', 'recrutamentoDeElite'] }),
];

const CONEXOES_BASE: [string, string][] = [
  ['nucleo', 'vigorDoReino'], ['nucleo', 'chamaAntiga'], ['nucleo', 'passoDoVento'], ['nucleo', 'sortePeregrina'],
  ['vigorDoReino', 'escudoAntigo'], ['escudoAntigo', 'pontoBarreira'], ['pontoBarreira', 'muralhaViva'],
  ['vigorDoReino', 'caminhoDaMuralha'], ['caminhoDaMuralha', 'muralhaViva'],
  ['chamaAntiga', 'fogoInterior'], ['fogoInterior', 'brasaEterna'], ['chamaAntiga', 'caminhoDaBrasa'], ['caminhoDaBrasa', 'brasaEterna'],
  ['passoDoVento', 'pontoMisericordia'], ['pontoMisericordia', 'flechaFirme'], ['flechaFirme', 'olhoDeFalcao'],
  ['passoDoVento', 'caminhoDoArco'], ['caminhoDoArco', 'olhoDeFalcao'],
  ['sortePeregrina', 'pontoPressao'], ['pontoPressao', 'golpeFurtivo'], ['golpeFurtivo', 'sombraProfunda'], ['pontoPressao', 'sombraProfunda'],
];

/** Setor (graus, tela: 0 = direita, −90 = cima) de cada categoria. Os nós gerados ficam em anéis de 5 por setor. */
const SETOR: Record<Categoria, number> = { progressao: -90, campanha: -30, bastiao: 30, combate: 90, masteries: 150, ligacao: 210 };
const POR_ANEL = 5;

const contagem: Partial<Record<Categoria, number>> = {};
const GERADOS_NOS: NoDef[] = GERADOS.map((e) => {
  const k = contagem[e.c] ?? 0;
  contagem[e.c] = k + 1;
  const anel = Math.floor(k / POR_ANEL);
  const j = k % POR_ANEL;
  const rad = ((SETOR[e.c] + (j - 2) * 15) * Math.PI) / 180;
  const raio = 5 + anel * 1.5;
  const tipo: NoTipo = e.t ?? 'comum';
  return {
    id: e.id,
    nome: e.n,
    tipo,
    categoria: e.c,
    regiao: e.r,
    x: Math.round(raio * Math.cos(rad) * 1000) / 1000,
    y: Math.round(raio * Math.sin(rad) * 1000) / 1000,
    descricao: e.d,
    bonus: e.b,
    para: e.p ?? 'todos',
    mastery: e.m,
  };
});

/** Todos os nós: raiz, desenhados à mão e gerados. */
export const NOS: NoDef[] = [RAIZ, ...EXPLICITOS, ...GERADOS_NOS];

/** Conexões: as da região central, as ligações de cada nó gerado e as de anel (cada anel encadeado ao anterior). */
function montarConexoes(): [string, string][] {
  const out: [string, string][] = [...CONEXOES_BASE];
  const explicitos = [RAIZ, ...EXPLICITOS];
  const dist = (a: NoDef, b: NoDef) => Math.hypot(a.x - b.x, a.y - b.y);
  // por categoria, na ordem de geração: anel encadeado (vizinho no mesmo anel e o de cima) e entrada na região central
  for (const cat of CATEGORIA_IDS) {
    const lista = GERADOS_NOS.filter((n) => n.categoria === cat);
    lista.forEach((n, k) => {
      if (k % POR_ANEL < POR_ANEL - 1 && k + 1 < lista.length) out.push([n.id, lista[k + 1].id]);
      if (k + POR_ANEL < lista.length) out.push([n.id, lista[k + POR_ANEL].id]);
    });
    const entrada = lista[2] ?? lista[0];
    if (entrada) {
      const perto = explicitos.reduce((a, b) => (dist(entrada, b) < dist(entrada, a) ? b : a));
      out.push([perto.id, entrada.id]);
    }
  }
  for (const e of GERADOS) if (e.l) out.push([e.l[0], e.id], [e.id, e.l[1]]);
  // sem pares repetidos (a ordem não importa)
  const vistos = new Set<string>();
  return out.filter(([a, b]) => {
    const chave = [a, b].sort().join('|');
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** Pares de nós ligados (sem direção). */
export const CONEXOES: [string, string][] = montarConexoes();

/** Todas as Masteries referenciadas pelos nós de Mastery (ponto -> Mastery). */
export const NO_BY_ID: Record<string, NoDef> = Object.fromEntries(NOS.map((n) => [n.id, n]));
export const MASTERY_BY_ID: Record<string, MasteryDef> = Object.fromEntries(MASTERIES.map((m) => [m.id, m]));

/** Rótulos dos bônus (pt-BR). Pontos inteiros ou percentual. */
export const BONUS_LABEL: Record<BonusKey, { nome: string; formato: 'pontos' | 'percentual' }> = {
  str: { nome: 'Força', formato: 'pontos' },
  int: { nome: 'Inteligência', formato: 'pontos' },
  vit: { nome: 'Vitalidade', formato: 'pontos' },
  dex: { nome: 'Destreza', formato: 'pontos' },
  luk: { nome: 'Sorte', formato: 'pontos' },
  hp: { nome: 'vida máxima', formato: 'percentual' },
  dmg: { nome: 'dano causado', formato: 'percentual' },
  block: { nome: 'chance de bloqueio', formato: 'percentual' },
  dodge: { nome: 'chance de esquiva', formato: 'percentual' },
  crit: { nome: 'chance de crítico', formato: 'percentual' },
  critDano: { nome: 'dano crítico', formato: 'percentual' },
  haste: { nome: 'velocidade de ataque (Skill Haste)', formato: 'percentual' },
  reduce: { nome: 'dano recebido', formato: 'percentual' },
  expCombate: { nome: 'de EXP em combate', formato: 'percentual' },
  almasCombate: { nome: 'de almas em combate', formato: 'percentual' },
  zeniHorda: { nome: 'de Zen nas hordas', formato: 'percentual' },
  zeniElite: { nome: 'de Zen nos elites', formato: 'percentual' },
  zeniChefe: { nome: 'de Zen nos chefes', formato: 'percentual' },
  zeniSobrevivencia: { nome: 'de Zen na sobrevivência', formato: 'percentual' },
  zeniEvento: { nome: 'de Zen nos eventos', formato: 'percentual' },
  zeniCidade: { nome: 'de Zen da cidade', formato: 'percentual' },
  pontosHabilidade: { nome: 'ponto(s) de habilidade por nível', formato: 'pontos' },
  recrutas: { nome: 'nível(is) extra(s) ao recrutar', formato: 'pontos' },
  descontoCidade: { nome: 'de desconto nas cidades', formato: 'percentual' },
  reparoCidade: { nome: 'de desconto no reparo da muralha', formato: 'percentual' },
  recompensaCidade: { nome: 'de recompensa da cidade', formato: 'percentual' },
  sorteLoja: { nome: 'item(ns) extra(s) na loja', formato: 'pontos' },
  eventoEscolha: { nome: 'escolha(s) extra(s) em eventos', formato: 'pontos' },
  custoConstrucao: { nome: 'de desconto na construção', formato: 'percentual' },
  reparoBastiao: { nome: 'de desconto no reparo do bastião', formato: 'percentual' },
  muralhaVida: { nome: 'de vida da muralha', formato: 'percentual' },
  portaoVida: { nome: 'de vida do portão', formato: 'percentual' },
  zenNoite: { nome: 'de Zen por noite vencida', formato: 'pontos' },
  blocosConstrucao: { nome: 'bloco(s) de construção', formato: 'pontos' },
  limitePecas: { nome: 'peça(s) por tipo', formato: 'pontos' },
};

/** CUSTO EM ZEN DE ABRIR UM NÓ (do banco). Lê a tabela CUSTO_ZEN_POR_TIPO: é o único lugar que decide o preço. */
export function custoDoNo(no: Pick<NoDef, 'tipo'>): number {
  return CUSTO_ZEN_POR_TIPO[no.tipo];
}

/** Para a tela: quantos nós há em cada categoria. */
export function nosPorCategoria(): Record<Categoria, number> {
  const out = Object.fromEntries(CATEGORIA_IDS.map((c) => [c, 0])) as Record<Categoria, number>;
  for (const n of NOS) out[n.categoria]++;
  return out;
}

/** Ids das regiões que existem (validação e filtro). */
export const REGIAO_LISTA = REGIAO_IDS;

export type { AttrKey };
