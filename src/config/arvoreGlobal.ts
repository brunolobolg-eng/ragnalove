import type { AttrKey } from '../core/progression/attributes';
import type { HeroKind } from '../core/progression/skills';

/**
 * ÁRVORE GLOBAL DE PROGRESSÃO (protótipo). Uma árvore só para todos os heróis, com nós comuns
 * (passivas para os personagens compatíveis), notáveis, caminhos alternativos e pontos de Mastery.
 * Cada Mastery tática vai para UM personagem e fica com ele, mesmo fora da party.
 *
 * Dados aqui; regras em core/progression/arvore.ts; tela em ui/ArvoreGlobal.ts.
 * Ids em camelCase (vão para o save: não renomear depois de publicado).
 */

/** Números da árvore. Custos de Zen seguem a economia existente (atributos 40+, reorganizar de atributos 80). */
export const ARVORE_CONFIG = {
  /** Pontos de árvore ganhos por nível alcançado (somando todos os heróis). Mesmo ritmo dos pontos de habilidade. */
  pontosPorNivel: 1,
  /** Atribuir ou trocar uma Mastery de personagem (preço fixo, em Zen). */
  atribuirZen: 60,
  /** Reorganizar a árvore inteira: base × (1 + reorganizações anteriores), como o respec de atributos. */
  reorganizarZen: 80,
  /** Quantas Masteries um mesmo personagem pode carregar. */
  maxMasteriesPorHeroi: 1,
};

/** Nível do personagem é o requisito de cada Mastery (campo `nivelMin`). */

export type NoTipo = 'raiz' | 'comum' | 'notavel' | 'caminho' | 'mastery';

/** Chaves de bônus de nó: atributos (somam como o equipamento) e passivas derivadas (como as vocações). */
export type PassivaKey = 'hp' | 'dmg' | 'block' | 'dodge' | 'crit' | 'haste' | 'reduce';
export type BonusKey = AttrKey | PassivaKey;
export type Bonus = Partial<Record<BonusKey, number>>;

/** Quem recebe o bônus de um nó comum/notável/caminho: todos os heróis ou uma lista. */
export type Compat = 'todos' | HeroKind[];

export interface NoDef {
  id: string;
  nome: string;
  tipo: NoTipo;
  regiao: string;
  /** Posição na rede (unidades de grade; a tela escala). */
  x: number;
  y: number;
  /** Pontos de árvore para abrir o nó (a raiz é de graça). */
  custo: number;
  /** Texto curto (pt-BR) para o painel de detalhes. */
  descricao: string;
  /** Bônus passivo (vazio para pontos de Mastery). */
  bonus: Bonus;
  para: Compat;
  /** Só nós `mastery`: a Mastery que este ponto desbloqueia. */
  mastery?: MasteryId;
}

export interface RegiaoDef {
  id: string;
  nome: string;
  descricao: string;
  /** Cor de destaque da região (tema de cada ramo). */
  cor: string;
}

export const REGIOES: Record<string, RegiaoDef> = {
  nucleo: { id: 'nucleo', nome: 'Coração de Aurenthal', descricao: 'Onde toda linha de progressão começa.', cor: '#d9b45a' },
  muralha: { id: 'muralha', nome: 'Muralha Férrea', descricao: 'Vida, bloqueio e quem segura a linha.', cor: '#8fa3b8' },
  chamas: { id: 'chamas', nome: 'Campos Ígneos', descricao: 'Inteligência e dano das magias.', cor: '#d9774a' },
  ermos: { id: 'ermos', nome: 'Ermos da Flecha', descricao: 'Destreza, precisão e golpes de finalização.', cor: '#7fb88a' },
  sombra: { id: 'sombra', nome: 'Véu Sombrio', descricao: 'Sorte, crítico e esquiva.', cor: '#9a7ad9' },
};

export const TIPO_NO_LABEL: Record<NoTipo, string> = {
  raiz: 'Núcleo',
  comum: 'Comum',
  notavel: 'Notável',
  caminho: 'Caminho alternativo',
  mastery: 'Ponto de Mastery',
};

/** Rótulos dos bônus (pt-BR). Formato: pontos inteiros ou percentual. */
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
  haste: { nome: 'Skill Haste', formato: 'percentual' },
  reduce: { nome: 'dano recebido', formato: 'percentual' },
};

/** Os 19 nós da árvore. Ordem: núcleo, muralha, chamas, ermos, sombra. */
export const NOS: NoDef[] = [
  { id: 'nucleo', nome: 'Núcleo de Aurenthal', tipo: 'raiz', regiao: 'nucleo', x: 0, y: 0, custo: 0, descricao: 'Ponto de partida. Todos os caminhos saem daqui.', bonus: {}, para: 'todos' },

  // ---- Muralha Férrea (linha de frente) ----
  { id: 'vigorDoReino', nome: 'Vigor do Reino', tipo: 'comum', regiao: 'muralha', x: -1, y: -1, custo: 1, descricao: '+1 de Vitalidade para todos.', bonus: { vit: 1 }, para: 'todos' },
  { id: 'escudoAntigo', nome: 'Escudo Antigo', tipo: 'comum', regiao: 'muralha', x: -2, y: -2, custo: 1, descricao: '+2% de chance de bloqueio para o Guerreiro.', bonus: { block: 0.02 }, para: ['warrior'] },
  { id: 'pontoBarreira', nome: 'Ponto de Barreira', tipo: 'mastery', regiao: 'muralha', x: -3, y: -2, custo: 2, descricao: 'Desbloqueia a Mastery Barreira de Contenção.', bonus: {}, para: 'todos', mastery: 'barreiraDeContencao' },
  { id: 'muralhaViva', nome: 'Muralha Viva', tipo: 'notavel', regiao: 'muralha', x: -3, y: -1, custo: 2, descricao: '+2 de Vitalidade e +6% de vida máxima para Guerreiro e Bruxa.', bonus: { vit: 2, hp: 0.06 }, para: ['warrior', 'warlock'] },
  { id: 'caminhoDaMuralha', nome: 'Caminho da Muralha', tipo: 'caminho', regiao: 'muralha', x: -2, y: -1, custo: 1, descricao: '−2% de dano recebido. Liga o Vigor ao notável Muralha Viva por outra rota.', bonus: { reduce: 0.02 }, para: 'todos' },

  // ---- Campos Ígneos (magia) ----
  { id: 'chamaAntiga', nome: 'Chama Antiga', tipo: 'comum', regiao: 'chamas', x: 1, y: -1, custo: 1, descricao: '+1 de Inteligência para Mago, Feiticeira e Bruxa.', bonus: { int: 1 }, para: ['mage', 'sorcerer', 'warlock'] },
  { id: 'fogoInterior', nome: 'Fogo Interior', tipo: 'comum', regiao: 'chamas', x: 2, y: -2, custo: 1, descricao: '+3% de dano causado para magos.', bonus: { dmg: 0.03 }, para: ['mage', 'sorcerer', 'warlock'] },
  { id: 'brasaEterna', nome: 'Brasa Eterna', tipo: 'notavel', regiao: 'chamas', x: 3, y: -2, custo: 2, descricao: '+2 de Inteligência e +6% de dano para Feiticeira e Bruxa.', bonus: { int: 2, dmg: 0.06 }, para: ['sorcerer', 'warlock'] },
  { id: 'caminhoDaBrasa', nome: 'Caminho da Brasa', tipo: 'caminho', regiao: 'chamas', x: 2, y: -1, custo: 1, descricao: '+2% de Skill Haste para magos. Liga a Chama Antiga à Brasa Eterna por outra rota.', bonus: { haste: 0.02 }, para: ['mage', 'sorcerer', 'warlock'] },

  // ---- Ermos da Flecha (distância e precisão) ----
  { id: 'passoDoVento', nome: 'Passo do Vento', tipo: 'comum', regiao: 'ermos', x: 1, y: 1, custo: 1, descricao: '+1 de Destreza para Arqueira e Assassino.', bonus: { dex: 1 }, para: ['archer', 'assassin'] },
  { id: 'pontoMisericordia', nome: 'Ponto de Misericórdia', tipo: 'mastery', regiao: 'ermos', x: 2, y: 1, custo: 2, descricao: 'Desbloqueia a Mastery Golpe de Misericórdia.', bonus: {}, para: 'todos', mastery: 'golpeDeMisericordia' },
  { id: 'flechaFirme', nome: 'Flecha Firme', tipo: 'comum', regiao: 'ermos', x: 2, y: 2, custo: 1, descricao: '+3% de dano causado para a Arqueira.', bonus: { dmg: 0.03 }, para: ['archer'] },
  { id: 'olhoDeFalcao', nome: 'Olho de Falcão', tipo: 'notavel', regiao: 'ermos', x: 3, y: 2, custo: 2, descricao: '+2 de Destreza e +3% de crítico para Arqueira e Assassino.', bonus: { dex: 2, crit: 0.03 }, para: ['archer', 'assassin'] },
  { id: 'caminhoDoArco', nome: 'Caminho do Arco', tipo: 'caminho', regiao: 'ermos', x: 2, y: 0, custo: 1, descricao: '+1 de Sorte para Arqueira e Assassino. Liga o Passo do Vento ao Olho de Falcão por outra rota.', bonus: { luk: 1 }, para: ['archer', 'assassin'] },

  // ---- Véu Sombrio (crítico e esquiva) ----
  { id: 'sortePeregrina', nome: 'Sorte Peregrina', tipo: 'comum', regiao: 'sombra', x: -1, y: 1, custo: 1, descricao: '+1 de Sorte para todos.', bonus: { luk: 1 }, para: 'todos' },
  { id: 'pontoPressao', nome: 'Ponto de Pressão', tipo: 'mastery', regiao: 'sombra', x: -2, y: 1, custo: 2, descricao: 'Desbloqueia a Mastery Pressão Tática.', bonus: {}, para: 'todos', mastery: 'pressaoTatica' },
  { id: 'golpeFurtivo', nome: 'Golpe Furtivo', tipo: 'comum', regiao: 'sombra', x: -2, y: 2, custo: 1, descricao: '+2% de crítico para Assassino, Arqueira e Bruxa.', bonus: { crit: 0.02 }, para: ['assassin', 'archer', 'warlock'] },
  { id: 'sombraProfunda', nome: 'Sombra Profunda', tipo: 'notavel', regiao: 'sombra', x: -3, y: 2, custo: 2, descricao: '+2 de Sorte e +3% de esquiva para Assassino e Bruxa.', bonus: { luk: 2, dodge: 0.03 }, para: ['assassin', 'warlock'] },
];

/**
 * Conexões da rede (pares de ids, sem direção). Os caminhos alternativos criam ciclos: o notável
 * fica ligado ao resto por duas rotas, e comprar qualquer uma delas basta.
 */
export const CONEXOES: [string, string][] = [
  ['nucleo', 'vigorDoReino'],
  ['nucleo', 'chamaAntiga'],
  ['nucleo', 'passoDoVento'],
  ['nucleo', 'sortePeregrina'],
  ['vigorDoReino', 'escudoAntigo'],
  ['escudoAntigo', 'pontoBarreira'],
  ['pontoBarreira', 'muralhaViva'],
  ['vigorDoReino', 'caminhoDaMuralha'],
  ['caminhoDaMuralha', 'muralhaViva'],
  ['chamaAntiga', 'fogoInterior'],
  ['fogoInterior', 'brasaEterna'],
  ['chamaAntiga', 'caminhoDaBrasa'],
  ['caminhoDaBrasa', 'brasaEterna'],
  ['passoDoVento', 'pontoMisericordia'],
  ['pontoMisericordia', 'flechaFirme'],
  ['flechaFirme', 'olhoDeFalcao'],
  ['passoDoVento', 'caminhoDoArco'],
  ['caminhoDoArco', 'olhoDeFalcao'],
  ['sortePeregrina', 'pontoPressao'],
  ['pontoPressao', 'golpeFurtivo'],
  ['golpeFurtivo', 'sombraProfunda'],
  ['pontoPressao', 'sombraProfunda'],
];

// ---------------- Masteries táticas ----------------

/** As seis famílias de Mastery do pedido. `mastery` = a que foi desenhada neste protótipo (ou nenhuma). */
export type FamiliaId = 'destruicao' | 'controle' | 'protecao' | 'execucao' | 'mobilidade' | 'sinergia';
export const FAMILIAS: { id: FamiliaId; nome: string; mastery?: MasteryId; motivo: string }[] = [
  { id: 'destruicao', nome: 'Destruição e ruptura', motivo: 'Fora deste protótipo: exige quebrar estruturas e mexer na regra de dano por alvo.' },
  { id: 'controle', nome: 'Controle de terreno', mastery: 'pressaoTatica', motivo: 'Usa o empurrão que o combate já tem (knockback).' },
  { id: 'protecao', nome: 'Proteção e contenção', mastery: 'barreiraDeContencao', motivo: 'Usa o escudo e o gatilho de vida baixa que as cartas já usam.' },
  { id: 'execucao', nome: 'Execução e vulnerabilidade', mastery: 'golpeDeMisericordia', motivo: 'Multiplicador de dano por vida restante, no mesmo ponto do dano que a Maldição usa.' },
  { id: 'mobilidade', nome: 'Mobilidade e reposicionamento', motivo: 'Fora deste protótipo: se sobrepõe ao empurrão e ao recuo que a IA já faz.' },
  { id: 'sinergia', nome: 'Sinergia de equipe', motivo: 'Fora deste protótipo: exige efeito que muda outros heróis (bênção e aura já existem; fica para a próxima rodada).' },
];

export type MasteryId = 'barreiraDeContencao' | 'golpeDeMisericordia' | 'pressaoTatica';

/**
 * Regra de combate de uma Mastery (dados). A simulação interpreta `tipo`:
 * - `escudoReativo`: 1 vez por batalha, quando a vida do herói cai até `limiar` (fração), ganha escudo de `pct` da vida máxima por `sec` segundos.
 * - `execucao`: os golpes do herói contra inimigo com vida até `limiar` (fração) causam `bonus` a mais de dano.
 * - `empurrao`: cada golpe corpo a corpo tem `chance` de empurrar o alvo `passos` casas para trás.
 */
export type MasteryRegra =
  | { tipo: 'escudoReativo'; limiar: number; pct: number; sec: number }
  | { tipo: 'execucao'; limiar: number; bonus: number }
  | { tipo: 'empurrao'; chance: number; passos: number };

export interface MasteryDef {
  id: MasteryId;
  familia: FamiliaId;
  nome: string;
  /** Uma frase: a identidade da Mastery. */
  identidade: string;
  /** Texto do efeito (pt-BR), conferível com a regra ao lado. */
  efeito: string;
  /** Nó `mastery` que precisa estar aberto para ela aparecer e poder ser atribuída. */
  noRequerido: string;
  /** Nível mínimo do personagem que a recebe. */
  nivelMin: number;
  elegiveis: HeroKind[];
  regra: MasteryRegra;
}

export const MASTERIES: MasteryDef[] = [
  {
    id: 'barreiraDeContencao',
    familia: 'protecao',
    nome: 'Barreira de Contenção',
    identidade: 'Quem segura a linha não cai de primeira.',
    efeito: 'Na primeira vez que a vida cai abaixo de 30% numa batalha, ganha um escudo de 20% da vida máxima por 4 segundos.',
    noRequerido: 'pontoBarreira',
    nivelMin: 3,
    elegiveis: ['warrior', 'warlock'],
    regra: { tipo: 'escudoReativo', limiar: 0.3, pct: 0.2, sec: 4 },
  },
  {
    id: 'golpeDeMisericordia',
    familia: 'execucao',
    nome: 'Golpe de Misericórdia',
    identidade: 'Feridos não têm para onde fugir.',
    efeito: 'Os golpes causam 35% a mais de dano em inimigos com até 30% da vida.',
    noRequerido: 'pontoMisericordia',
    nivelMin: 3,
    elegiveis: ['archer', 'assassin'],
    regra: { tipo: 'execucao', limiar: 0.3, bonus: 0.35 },
  },
  {
    id: 'pressaoTatica',
    familia: 'controle',
    nome: 'Pressão Tática',
    identidade: 'Cada golpe corpo a corpo abre espaço na linha.',
    efeito: 'Golpes corpo a corpo têm 25% de chance de empurrar o inimigo uma casa para trás.',
    noRequerido: 'pontoPressao',
    nivelMin: 2,
    elegiveis: ['warrior', 'assassin'],
    regra: { tipo: 'empurrao', chance: 0.25, passos: 1 },
  },
];

export const NO_BY_ID: Record<string, NoDef> = Object.fromEntries(NOS.map((n) => [n.id, n]));
export const MASTERY_BY_ID: Record<string, MasteryDef> = Object.fromEntries(MASTERIES.map((m) => [m.id, m]));
export const REGIAO_IDS = Object.keys(REGIOES);
